"""
ZKTeco ADMS Biometric Hardware Engine & Smart Attendance Pairing Engine.
Compliant with Qatar Labour Law (Law No. 14 of 2004) and ZKTeco Push Protocol v2.4/v3.0.

Provides:
1. Native ZKTeco Device Endpoints (/iclock/cdata, /iclock/registry, /iclock/getrequest, /iclock/devicecmd)
2. Palm Shift Algorithm Fix for firmware compatibility
3. Smart Attendance Pairing Engine with 120s double-punch suppression and >16h stale shift auto-close
4. Authenticated Hardware Management REST API (/api/v1/zkteco/*)
"""

import datetime
import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from backend.core.dependencies import get_current_user_session, require_permission, check_permission, get_client_ip
from backend.core.database import get_db_pool, log_audit_event

logger = logging.getLogger("zkteco_adms")
router = APIRouter()

try:
    from zoneinfo import ZoneInfo
    QATAR_TZ = ZoneInfo("Asia/Qatar")
except Exception:
    QATAR_TZ = datetime.timezone(datetime.timedelta(hours=3), name="Asia/Qatar")

VERIFY_METHODS = {
    "0": "Password",
    "1": "Fingerprint",
    "2": "Fingerprint",
    "10": "Fingerprint",
    "3": "Card",
    "4": "Card",
    "5": "Face",
    "11": "Face",
    "15": "Face",
    "200": "Face",
    "6": "Palm",
    "12": "Palm",
    "20": "Palm",
    "25": "Palm",
    "201": "Palm",
}

OPLOG_TYPES = {
    "1": "Power On",
    "2": "Power Off",
    "3": "Alarm Tamper / Door Force / Duress",
    "4": "Menu Settings / Parameter Change",
    "5": "Enroll User",
    "6": "Enroll Fingerprint",
    "7": "Enroll Password",
    "8": "Enroll Card",
    "9": "Delete User",
    "10": "Delete Fingerprint",
    "11": "Delete Password",
    "12": "Delete Card",
    "13": "Clear Admin Privilege",
    "14": "Unlock Door",
    "15": "Alarm Cancel",
    "16": "Modify User Info",
}

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

def parse_zk_datetime(dt_str: str, time_offset_hours: float = 0.0) -> datetime.datetime:
    """
    Parses a raw device timestamp string (e.g. '2026-10-14 08:30:00'),
    applies the terminal offset, localizes in Qatar time, and returns a UTC datetime.
    """
    clean_str = dt_str.strip().replace("T", " ")
    try:
        naive_dt = datetime.datetime.strptime(clean_str[:19], "%Y-%m-%d %H:%M:%S")
    except Exception:
        naive_dt = datetime.datetime.now()

    if time_offset_hours:
        naive_dt += datetime.timedelta(hours=time_offset_hours)

    localized = naive_dt.replace(tzinfo=QATAR_TZ)
    return localized.astimezone(datetime.timezone.utc)


# ==============================================================================
# 1. NATIVE ZKTECO ADMS DEVICE PROTOCOL ENDPOINTS
# ==============================================================================

@router.get("/iclock/cdata", response_class=PlainTextResponse)
async def iclock_cdata_get(request: Request):
    """
    Device handshake and configuration option retrieval.
    Physical clock calls this when connecting to get sync intervals and stamp state.
    """
    sn = request.query_params.get("SN") or request.query_params.get("sn")
    if not sn:
        return PlainTextResponse("ERROR: Missing SN\n", status_code=400)

    sn = sn.strip()
    client_ip = get_client_ip(request)
    pool = get_db_pool()

    async with pool.acquire() as conn:
        terminal = await conn.fetchrow("SELECT * FROM zkteco_terminals WHERE sn = $1;", sn)
        if not terminal:
            # Auto-register device as active
            t_id = uuid.uuid4()
            await conn.execute("""
                INSERT INTO zkteco_terminals (
                    id, sn, alias, ip_address, state, last_activity, group_id
                ) VALUES (
                    $1, $2, $3, $4, 'active', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001'::uuid
                ) ON CONFLICT (sn) DO UPDATE SET
                    last_activity = CURRENT_TIMESTAMP,
                    ip_address = EXCLUDED.ip_address,
                    state = 'active';
            """, t_id, sn, f"Auto-Registered Terminal ({sn})", client_ip)
            terminal = await conn.fetchrow("SELECT * FROM zkteco_terminals WHERE sn = $1;", sn)
        else:
            prev_state = terminal["state"]
            await conn.execute("""
                UPDATE zkteco_terminals
                SET last_activity = CURRENT_TIMESTAMP, ip_address = $1, state = 'active'
                WHERE sn = $2;
            """, client_ip, sn)

            # If device transitioned from idle to active, queue user sync
            if prev_state == "idle":
                await conn.execute("""
                    INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
                    VALUES ($1, 'CHECK', 'pending');
                """, sn)

        att_stamp = terminal["attlog_stamp"] if terminal and terminal["attlog_stamp"] else "0"
        op_stamp = terminal["operlog_stamp"] if terminal and terminal["operlog_stamp"] else "0"

    response_text = (
        f"GET OPTION FROM: {sn}\n"
        f"Stamp={att_stamp}\n"
        f"OpStamp={op_stamp}\n"
        f"ErrorDelay=60\n"
        f"Delay=30\n"
        f"TransInterval=1\n"
        f"TransFlag=1111111111\n"
        f"Realtime=1\n"
        f"Encrypt=0\n"
    )
    return PlainTextResponse(response_text)


@router.post("/iclock/registry", response_class=PlainTextResponse)
async def iclock_registry(request: Request):
    """
    Firmware registry handshake for capability negotiation (e.g. face algorithm version).
    """
    sn = request.query_params.get("SN") or request.query_params.get("sn")
    face_version = request.query_params.get("ZKFaceVersion")

    if not sn:
        try:
            body = (await request.body()).decode("utf-8", errors="ignore")
            m_sn = re.search(r"SN=([^\s&]+)", body)
            if m_sn:
                sn = m_sn.group(1)
            m_face = re.search(r"ZKFaceVersion=([^\s&]+)", body)
            if m_face:
                face_version = m_face.group(1)
        except Exception:
            pass

    if sn:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            if face_version:
                await conn.execute("""
                    UPDATE zkteco_terminals
                    SET face_algo = $1, last_activity = CURRENT_TIMESTAMP
                    WHERE sn = $2;
                """, face_version.strip(), sn.strip())
            else:
                await conn.execute("""
                    UPDATE zkteco_terminals
                    SET last_activity = CURRENT_TIMESTAMP
                    WHERE sn = $1;
                """, sn.strip())

    return PlainTextResponse("Registry=OK\n")


@router.get("/iclock/getrequest", response_class=PlainTextResponse)
async def iclock_getrequest(request: Request):
    """
    Device command poll endpoint with Palm Shift Fix.
    Physical terminal periodically requests commands queued for execution.
    """
    sn = request.query_params.get("SN") or request.query_params.get("sn")
    if not sn:
        return PlainTextResponse("OK\n")

    sn = sn.strip()
    client_ip = get_client_ip(request)
    info_str = request.query_params.get("INFO")
    pool = get_db_pool()

    async with pool.acquire() as conn:
        terminal = await conn.fetchrow("SELECT * FROM zkteco_terminals WHERE sn = $1;", sn)
        if not terminal:
            await conn.execute("""
                INSERT INTO zkteco_terminals (
                    id, sn, alias, ip_address, state, last_activity, group_id
                ) VALUES (
                    $1, $2, $3, $4, 'active', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001'::uuid
                ) ON CONFLICT (sn) DO NOTHING;
            """, uuid.uuid4(), sn, f"Terminal {sn}", client_ip)
            terminal = await conn.fetchrow("SELECT * FROM zkteco_terminals WHERE sn = $1;", sn)

        # ----------------------------------------------------------------------
        # ZKTECO PALM SHIFT ALGORITHM FIX
        # ----------------------------------------------------------------------
        if info_str and terminal:
            parts = [p.strip() for p in info_str.split(",")]
            try:
                user_cnt = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else terminal["user_count"]
                finger_cnt = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else terminal["finger_count"]
                lan_ip = parts[4] if len(parts) > 4 and parts[4] else terminal["lan_ip_address"]
                fp_algo = parts[5] if len(parts) > 5 and parts[5] else terminal["fp_algo"]
                face_algo = parts[6] if len(parts) > 6 and parts[6] else terminal["face_algo"]

                palm_algo = terminal["palm_algo"] or "unknown"
                face_cnt = terminal["face_count"] or 0
                palm_cnt = terminal["palm_count"] or 0

                # Check if parts[7] is Palm algorithm version (12 or 12.0)
                if len(parts) > 7 and parts[7] in ("12", "12.0"):
                    palm_algo = parts[7]
                    face_cnt = int(parts[8]) if len(parts) > 8 and parts[8].isdigit() else face_cnt
                    palm_cnt = int(parts[10]) if len(parts) > 10 and parts[10].isdigit() else palm_cnt
                elif len(parts) > 7 and parts[7].isdigit():
                    face_cnt = int(parts[7])

                await conn.execute("""
                    UPDATE zkteco_terminals
                    SET user_count = $1, finger_count = $2, lan_ip_address = $3,
                        fp_algo = $4, face_algo = $5, palm_algo = $6,
                        face_count = $7, palm_count = $8,
                        last_activity = CURRENT_TIMESTAMP, ip_address = $9, state = 'active'
                    WHERE sn = $10;
                """, user_cnt, finger_cnt, lan_ip, fp_algo, face_algo, palm_algo, face_cnt, palm_cnt, client_ip, sn)
            except Exception as e:
                logger.warning(f"Error parsing INFO string from {sn}: {e}")

        # Fetch pending commands from queue
        pending_cmds = await conn.fetch("""
            SELECT id, command_text
            FROM zkteco_command_queue
            WHERE terminal_sn = $1 AND status = 'pending'
            ORDER BY id ASC LIMIT 10;
        """, sn)

        if pending_cmds:
            cmd_ids = [c["id"] for c in pending_cmds]
            await conn.execute("""
                UPDATE zkteco_command_queue
                SET status = 'sent', updated_at = CURRENT_TIMESTAMP
                WHERE id = ANY($1::int[]);
            """, cmd_ids)

            lines = [f"C:{c['id']}:{c['command_text']}" for c in pending_cmds]
            return PlainTextResponse("\n".join(lines) + "\n")

    return PlainTextResponse("OK\n")


@router.post("/iclock/cdata", response_class=PlainTextResponse)
async def iclock_cdata_post(request: Request):
    """
    Primary data push receiver for ZKTeco terminals (ATTLOG, OPERLOG, USER, BIODATA).
    Executes the Smart Attendance Pairing Engine for real-time punch pairing.
    """
    sn = request.query_params.get("SN") or request.query_params.get("sn")
    table = request.query_params.get("table") or request.query_params.get("Table") or "ATTLOG"
    stamp = request.query_params.get("Stamp")

    if not sn:
        return PlainTextResponse("ERROR: Missing SN\n", status_code=400)

    sn = sn.strip()
    table = table.strip().upper()
    body_bytes = await request.body()
    body_text = body_bytes.decode("utf-8", errors="ignore")
    lines = [line.strip() for line in body_text.splitlines() if line.strip()]

    pool = get_db_pool()
    client_ip = get_client_ip(request)

    async with pool.acquire() as conn:
        terminal = await conn.fetchrow("SELECT * FROM zkteco_terminals WHERE sn = $1;", sn)
        time_offset = float(terminal["time_offset_hours"] or 0.0) if terminal else 0.0

        # Update terminal activity
        await conn.execute("""
            UPDATE zkteco_terminals
            SET last_activity = CURRENT_TIMESTAMP, ip_address = $1, state = 'active'
            WHERE sn = $2;
        """, client_ip, sn)

        # ======================================================================
        # ======================================================================
        # CASE A: ATTLOG (High-Throughput Batched Attendance Ingestion & Smart Pairing)
        # ======================================================================
        if table == "ATTLOG":
            from backend.core.sequences import uuid7, get_next_attendance_code

            parsed_punches = []
            emp_codes_set = set()

            for line in lines:
                parts = re.split(r"[\t\s]+", line.strip())
                if len(parts) < 2:
                    continue

                emp_code = parts[0].strip()
                raw_time = f"{parts[1]} {parts[2]}" if len(parts) > 2 and ":" in parts[2] else parts[1]
                verify_idx = 3 if len(parts) > 2 and ":" in parts[2] else 2
                verify_code = parts[verify_idx].strip() if len(parts) > verify_idx else "1"

                try:
                    punch_time_utc = parse_zk_datetime(raw_time, time_offset)
                except Exception:
                    punch_time_utc = datetime.datetime.now(datetime.timezone.utc)

                verify_method = VERIFY_METHODS.get(verify_code, f"Biometric ({verify_code})")
                parsed_punches.append({
                    "emp_code": emp_code,
                    "punch_time_utc": punch_time_utc,
                    "verify_method": verify_method,
                })
                emp_codes_set.add(emp_code)

            if not parsed_punches:
                return PlainTextResponse("OK: 0\n")

            # 1. Single Batched Query for All Employees in Batch
            emp_map = {}
            if emp_codes_set:
                emp_list = list(emp_codes_set)
                clean_short = [c.replace("EMP-", "") for c in emp_list]
                all_codes = list(set(emp_list + clean_short))
                emp_rows = await conn.fetch("""
                    SELECT id, employee_number, full_name, department_id, organization_id, branch_id, zk_emp_code
                    FROM employees
                    WHERE zk_emp_code = ANY($1::text[])
                       OR employee_number = ANY($1::text[])
                       OR REPLACE(employee_number, 'EMP-', '') = ANY($1::text[]);
                """, all_codes)
                for r in emp_rows:
                    if r["zk_emp_code"]:
                        emp_map[str(r["zk_emp_code"]).strip()] = r
                    if r["employee_number"]:
                        emp_map[str(r["employee_number"]).strip()] = r
                        emp_map[str(r["employee_number"]).replace("EMP-", "").strip()] = r

            # 2. Single Batched Query for Open Attendance Shifts
            matched_emp_ids = list(set(e["id"] for e in emp_map.values()))
            open_logs_map = {}
            if matched_emp_ids:
                open_logs = await conn.fetch("""
                    SELECT id, employee_id, check_in
                    FROM attendance_logs
                    WHERE employee_id = ANY($1::uuid[]) AND check_out IS NULL
                    ORDER BY check_in DESC;
                """, matched_emp_ids)
                for ol in open_logs:
                    eid = ol["employee_id"]
                    if eid not in open_logs_map:
                        open_logs_map[eid] = ol

            # 3. In-Memory Smart Pairing & Bulk Operations Preparation
            updates_shift_checkout = []
            updates_stale_close = []
            inserts_attendance = []
            inserts_transactions = []

            for punch in parsed_punches:
                emp_code = punch["emp_code"]
                punch_time_utc = punch["punch_time_utc"]
                verify_method = punch["verify_method"]
                emp = emp_map.get(emp_code)

                emp_id = emp["id"] if emp else None
                emp_name = emp["full_name"] if emp else f"Badge #{emp_code}"
                dept_name = emp["department_id"] if emp and emp["department_id"] else "Operations"
                org_id = emp["organization_id"] if emp else (terminal["organization_id"] if terminal else None)

                punch_state = "Employee Check-In"
                linked_att_id = None

                if emp_id:
                    open_log = open_logs_map.get(emp_id)
                    if open_log:
                        diff_sec = (punch_time_utc - open_log["check_in"]).total_seconds()
                        if diff_sec <= 120:
                            # DOUBLE PUNCH SUPPRESSION (<= 2 minutes)
                            punch_state = "Ignored (Double Punch)"
                            linked_att_id = open_log["id"]
                        elif diff_sec <= 16 * 3600:
                            # VALID SHIFT PAIRING (<= 16 hours)
                            dur_hours = round(diff_sec / 3600.0, 2)
                            status_val = "half_day" if dur_hours < 8.0 else "present"
                            updates_shift_checkout.append((punch_time_utc, dur_hours, status_val, open_log["id"]))
                            punch_state = "Employee Check-Out"
                            linked_att_id = open_log["id"]
                            del open_logs_map[emp_id]
                        else:
                            # STALE SHIFT AUTO-CLOSE (> 16 hours)
                            updates_stale_close.append((open_log["id"],))
                            new_att_id = uuid7()
                            att_code = await get_next_attendance_code(2026, tenant_id=str(org_id or "default_tenant"))
                            inserts_attendance.append((
                                new_att_id, att_code, emp_id, emp_name, dept_name, sn,
                                punch_time_utc, "present", org_id,
                                "Created via ZKTeco ADMS terminal (Prior Auto-Closed)", "ZKTeco ADMS Ingestion"
                            ))
                            punch_state = "Employee Check-In (Prior Auto-Closed)"
                            linked_att_id = new_att_id
                            open_logs_map[emp_id] = {"id": new_att_id, "employee_id": emp_id, "check_in": punch_time_utc}
                    else:
                        # NEW CHECK-IN (UUIDv7 + lock-free sequence)
                        new_att_id = uuid7()
                        att_code = await get_next_attendance_code(2026, tenant_id=str(org_id or "default_tenant"))
                        inserts_attendance.append((
                            new_att_id, att_code, emp_id, emp_name, dept_name, sn,
                            punch_time_utc, "present", org_id,
                            "Created via ZKTeco ADMS terminal check-in", "ZKTeco ADMS Ingestion"
                        ))
                        punch_state = "Employee Check-In"
                        linked_att_id = new_att_id
                        open_logs_map[emp_id] = {"id": new_att_id, "employee_id": emp_id, "check_in": punch_time_utc}

                # Raw transaction (UUIDv7)
                trans_id = uuid7()
                inserts_transactions.append((
                    trans_id, emp_code, emp_id, emp_name, punch_time_utc,
                    punch_state, sn, verify_method, linked_att_id
                ))

            # 4. High-Performance Bulk Writes via executemany
            if updates_shift_checkout:
                await conn.executemany("""
                    UPDATE attendance_logs
                    SET check_out = $1, duration_hours = $2, status = $3, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $4;
                """, updates_shift_checkout)

            if updates_stale_close:
                await conn.executemany("""
                    UPDATE attendance_logs
                    SET check_out = check_in, duration_hours = 0.0,
                        notes = 'Auto-closed by ZKTeco sync: Employee missed checkout on previous shift',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1;
                """, updates_stale_close)

            if inserts_attendance:
                await conn.executemany("""
                    INSERT INTO attendance_logs (
                        id, code, employee_id, employee_name, department, terminal_id,
                        check_in, status, organization_id, notes, ingestion_source, created_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP
                    );
                """, inserts_attendance)

            if inserts_transactions:
                await conn.executemany("""
                    INSERT INTO zkteco_transactions (
                        id, emp_code, employee_id, employee_name, punch_time,
                        punch_state, terminal_sn, verify_method, processed, attendance_log_id, created_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, true, $9, CURRENT_TIMESTAMP
                    );
                """, inserts_transactions)

            if stamp:
                await conn.execute("UPDATE zkteco_terminals SET attlog_stamp = $1 WHERE sn = $2;", stamp.strip(), sn)

            return PlainTextResponse(f"OK: {len(parsed_punches)}\n")

        # ======================================================================
        # CASE B: OPERLOG (Device Operation Logs & Alarm Audit Alerts)
        # ======================================================================
        elif table == "OPERLOG":
            op_entries = []
            for line in lines:
                parts = re.split(r"[\t\s]+", line)
                if not parts:
                    continue
                if parts[0].upper() == "OPLOG" and len(parts) > 1:
                    op_type = parts[1].strip()
                    timestamp_str = " ".join(parts[2:4]) if len(parts) > 3 else (parts[2] if len(parts) > 2 else "")
                else:
                    op_type = parts[0].strip()
                    timestamp_str = parts[1] if len(parts) > 1 else ""
                desc = OPLOG_TYPES.get(op_type, f"OpCode {op_type}")
                entry_str = f"[{timestamp_str}] {desc} ({line})"
                op_entries.append(entry_str)

                # Tamper / Duress Alarm -> Log high-priority security audit alert
                if op_type == "3":
                    await conn.execute("""
                        INSERT INTO audit_logs (
                            id, entity_type, entity_id, action, changed_by_name, note, ip_address
                        ) VALUES (
                            $1, 'security_alert', $2, 'HARDWARE_ALARM', 'ZKTeco Hardware Sentinel',
                            $3, $4
                        );
                    """, uuid.uuid4(), sn, f"TAMPER/DOOR ALARM triggered on ZKTeco Terminal {sn} ({line})", client_ip)

            # Store recent operlog lines (up to 25)
            if op_entries and terminal:
                cur_operlog = terminal["operlog"] or ""
                combined = (cur_operlog + "\n" + "\n".join(op_entries)).strip()
                trimmed = "\n".join(combined.splitlines()[-25:])
                await conn.execute("UPDATE zkteco_terminals SET operlog = $1 WHERE sn = $2;", trimmed, sn)

            if stamp:
                await conn.execute("UPDATE zkteco_terminals SET operlog_stamp = $1 WHERE sn = $2;", stamp.strip(), sn)

            return PlainTextResponse("OK\n")

        # ======================================================================
        # CASE C: USER / BIODATA (Badge Cards & Biometric Template Push)
        # ======================================================================
        elif table in ("USER", "USERDATA"):
            for line in lines:
                m_pin = re.search(r"PIN=([^\s\t]+)", line)
                m_card = re.search(r"Card=([^\s\t]+)", line)
                if m_pin and m_card:
                    pin = m_pin.group(1).strip()
                    card = m_card.group(1).strip()
                    if card and card != "0":
                        await conn.execute("""
                            UPDATE employees
                            SET zk_card_no = $1
                            WHERE zk_emp_code = $2 OR employee_number = $2;
                        """, card, pin)

            return PlainTextResponse("OK\n")

        elif table in ("TMP", "BIODATA", "FINGERTMP"):
            for line in lines:
                m_pin = re.search(r"PIN=([^\s\t]+)", line)
                m_fid = re.search(r"FID=([^\s\t]+)", line)
                m_type = re.search(r"TYPE=([^\s\t]+)", line)
                m_tmp = re.search(r"TMP=([^\s\t]+)", line)

                if m_pin and m_tmp:
                    pin = m_pin.group(1).strip()
                    fid = m_fid.group(1).strip() if m_fid else "0"
                    t_type = m_type.group(1).strip() if m_type else "1"
                    data = m_tmp.group(1).strip()

                    await conn.execute("""
                        INSERT INTO zkteco_biometric_templates (
                            id, emp_code, fid, template_type, major_ver, template_data, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, '10', $5, CURRENT_TIMESTAMP
                        ) ON CONFLICT (emp_code, fid, template_type, major_ver) DO UPDATE SET
                            template_data = EXCLUDED.template_data,
                            updated_at = CURRENT_TIMESTAMP;
                    """, uuid.uuid4(), pin, fid, t_type, data)

                    if t_type == "9":
                        await conn.execute("UPDATE employees SET zk_has_face = true WHERE zk_emp_code = $1;", pin)
                    elif t_type == "1":
                        await conn.execute("""
                            UPDATE employees
                            SET zk_finger_count = (SELECT COUNT(*) FROM zkteco_biometric_templates WHERE emp_code = $1 AND template_type = '1')
                            WHERE zk_emp_code = $1;
                        """, pin)
                    elif t_type == "8":
                        await conn.execute("""
                            UPDATE employees
                            SET zk_palm_count = (SELECT COUNT(*) FROM zkteco_biometric_templates WHERE emp_code = $1 AND template_type = '8')
                            WHERE zk_emp_code = $1;
                        """, pin)

            if stamp:
                await conn.execute("UPDATE zkteco_terminals SET biotemplate_stamp = $1 WHERE sn = $2;", stamp.strip(), sn)

            return PlainTextResponse("OK\n")

    return PlainTextResponse("OK\n")


@router.post("/iclock/devicecmd", response_class=PlainTextResponse)
async def iclock_devicecmd(request: Request):
    """
    Device command completion callback.
    Clock reports status of executed commands: 'ID={id}&Return={0=success, <0=fail}'.
    """
    body_bytes = await request.body()
    body_text = body_bytes.decode("utf-8", errors="ignore")
    lines = [l.strip() for l in body_text.splitlines() if l.strip()]

    pool = get_db_pool()
    async with pool.acquire() as conn:
        for line in lines:
            m_id = re.search(r"ID=(\d+)", line)
            m_ret = re.search(r"Return=(-?\d+)", line)
            if m_id and m_ret:
                cmd_id = int(m_id.group(1))
                ret_val = m_ret.group(1)
                new_status = "success" if ret_val == "0" else "failed"
                await conn.execute("""
                    UPDATE zkteco_command_queue
                    SET status = $1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2;
                """, new_status, cmd_id)

    return PlainTextResponse("OK\n")


# ==============================================================================
# 2. AUTHENTICATED MANAGEMENT REST API (/api/v1/zkteco/*)
# ==============================================================================

class TerminalCreatePayload(BaseModel):
    sn: str
    alias: str
    group_id: Optional[str] = None
    branch_id: Optional[str] = None
    state: Optional[str] = "active"
    is_enrollment_terminal: Optional[bool] = False
    time_offset_hours: Optional[float] = 0.0
    lan_ip_address: Optional[str] = None
    fp_algo: Optional[str] = "10"
    face_algo: Optional[str] = "39"
    palm_algo: Optional[str] = "unknown"

class CommandDispatchPayload(BaseModel):
    action: str  # "sync_users", "fix_time_qatar", "clear_admin", "reboot", "clear_queue", "custom"
    custom_cmd: Optional[str] = None

class RemoteEnrollPayload(BaseModel):
    employee_id: str
    enroll_type: str = "finger"  # "finger" or "face"
    finger_index: Optional[int] = 0

class SimulatePunchPayload(BaseModel):
    employee_id: str
    terminal_sn: Optional[str] = "ZK-QAT-HQ01"
    verify_method: Optional[str] = "15"  # Face
    punch_time: Optional[str] = None

class EmployeeBiometricsUpdatePayload(BaseModel):
    zk_emp_code: Optional[str] = None
    zk_card_no: Optional[str] = None
    zk_pin: Optional[str] = None
    zk_is_admin: Optional[bool] = None
    zk_access_enabled: Optional[bool] = None


@router.get("/api/v1/zkteco/terminals")
async def list_terminals(session: Dict[str, Any] = Depends(get_current_user_session)):
    """List all registered ZKTeco ADMS terminals with command queue metrics and access group info."""
    require_permission(session, "attendance.read")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT t.*,
                   g.name as group_name,
                   b.name as branch_name,
                   COALESCE((SELECT COUNT(*) FROM zkteco_command_queue q WHERE q.terminal_sn = t.sn AND q.status = 'pending'), 0) as pending_commands,
                   COALESCE((SELECT COUNT(*) FROM zkteco_command_queue q WHERE q.terminal_sn = t.sn AND q.status = 'sent'), 0) as sent_commands,
                   COALESCE((SELECT COUNT(*) FROM zkteco_command_queue q WHERE q.terminal_sn = t.sn AND q.status = 'success'), 0) as success_commands,
                   COALESCE((SELECT COUNT(*) FROM zkteco_command_queue q WHERE q.terminal_sn = t.sn AND q.status = 'failed'), 0) as failed_commands,
                   COALESCE((SELECT COUNT(*) FROM zkteco_transactions x WHERE x.terminal_sn = t.sn), 0) as total_transactions
            FROM zkteco_terminals t
            LEFT JOIN zkteco_access_groups g ON t.group_id = g.id
            LEFT JOIN branches b ON t.branch_id = b.id
            ORDER BY t.alias ASC;
        """)

        # Serialize rows
        results = []
        for r in rows:
            d = dict(r)
            d["id"] = str(d["id"])
            if d.get("group_id"):
                d["group_id"] = str(d["group_id"])
            if d.get("branch_id"):
                d["branch_id"] = str(d["branch_id"])
            if d.get("organization_id"):
                d["organization_id"] = str(d["organization_id"])
            if d.get("last_activity"):
                d["last_activity"] = d["last_activity"].isoformat()
            if d.get("created_at"):
                d["created_at"] = d["created_at"].isoformat()
            d["time_offset_hours"] = float(d["time_offset_hours"] or 0.0)
            results.append(d)

        return {"terminals": results, "total": len(results)}


@router.post("/api/v1/zkteco/terminals")
async def create_terminal(
    payload: TerminalCreatePayload,
    request: Request = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Register a new ZKTeco hardware terminal."""
    require_permission(session, "attendance.manage")
    clean_sn = payload.sn.strip().upper()
    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT id FROM zkteco_terminals WHERE sn = $1;", clean_sn)
        if existing:
            raise HTTPException(status_code=400, detail=f"Terminal SN {clean_sn} already exists.")

        # If designated as enrollment terminal, demote other enrollment terminals
        if payload.is_enrollment_terminal:
            await conn.execute("UPDATE zkteco_terminals SET is_enrollment_terminal = false;")

        g_uuid = uuid.UUID(payload.group_id) if payload.group_id else None
        b_uuid = uuid.UUID(payload.branch_id) if payload.branch_id else None
        t_id = uuid.uuid4()

        await conn.execute("""
            INSERT INTO zkteco_terminals (
                id, sn, alias, group_id, branch_id, state, is_enrollment_terminal,
                time_offset_hours, lan_ip_address, fp_algo, face_algo, palm_algo
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            );
        """, t_id, clean_sn, payload.alias.strip(), g_uuid, b_uuid, payload.state or "active",
           bool(payload.is_enrollment_terminal), float(payload.time_offset_hours or 0.0),
           payload.lan_ip_address, payload.fp_algo or "10", payload.face_algo or "39", payload.palm_algo or "unknown")

        await log_audit_event(
            conn=conn,
            entity_type="zkteco_terminals",
            entity_id=t_id,
            action="CREATE",
            session=session,
            client_ip=client_ip,
            note=f"Registered biometric hardware terminal {clean_sn} ({payload.alias.strip()}).",
            changes={"sn": clean_sn, "alias": payload.alias.strip(), "lan_ip_address": payload.lan_ip_address}
        )

        return {"status": "success", "id": str(t_id), "sn": clean_sn}


@router.put("/api/v1/zkteco/terminals/{terminal_id}")
async def update_terminal(
    terminal_id: str,
    payload: TerminalCreatePayload,
    request: Request = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Update hardware terminal parameters."""
    require_permission(session, "attendance.manage")
    pool = get_db_pool()
    t_uuid = uuid.UUID(terminal_id)
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        terminal = await conn.fetchrow("SELECT * FROM zkteco_terminals WHERE id = $1;", t_uuid)
        if not terminal:
            raise HTTPException(status_code=404, detail="Terminal not found.")

        if payload.is_enrollment_terminal:
            await conn.execute("UPDATE zkteco_terminals SET is_enrollment_terminal = false WHERE id != $1;", t_uuid)

        g_uuid = uuid.UUID(payload.group_id) if payload.group_id else terminal["group_id"]
        b_uuid = uuid.UUID(payload.branch_id) if payload.branch_id else terminal["branch_id"]

        await conn.execute("""
            UPDATE zkteco_terminals
            SET alias = $1, group_id = $2, branch_id = $3, state = $4,
                is_enrollment_terminal = $5, time_offset_hours = $6,
                lan_ip_address = $7, fp_algo = $8, face_algo = $9, palm_algo = $10
            WHERE id = $11;
        """, payload.alias.strip(), g_uuid, b_uuid, payload.state or "active",
           bool(payload.is_enrollment_terminal), float(payload.time_offset_hours or 0.0),
           payload.lan_ip_address, payload.fp_algo or "10", payload.face_algo or "39",
           payload.palm_algo or "unknown", t_uuid)

        await log_audit_event(
            conn=conn,
            entity_type="zkteco_terminals",
            entity_id=t_uuid,
            action="UPDATE",
            session=session,
            client_ip=client_ip,
            note=f"Updated terminal {terminal['sn']} ({payload.alias.strip()}).",
            changes={"alias": payload.alias.strip(), "state": payload.state or "active", "lan_ip_address": payload.lan_ip_address}
        )

        return {"status": "success", "id": str(t_uuid)}


@router.delete("/api/v1/zkteco/terminals/{terminal_id}")
async def delete_terminal(
    terminal_id: str,
    request: Request = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Delete a terminal registration."""
    require_permission(session, "attendance.manage")
    pool = get_db_pool()
    t_uuid = uuid.UUID(terminal_id)
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        sn = await conn.fetchval("SELECT sn FROM zkteco_terminals WHERE id = $1;", t_uuid)
        if not sn:
            raise HTTPException(status_code=404, detail="Terminal not found.")
        await conn.execute("DELETE FROM zkteco_command_queue WHERE terminal_sn = $1;", sn)
        await conn.execute("DELETE FROM zkteco_terminals WHERE id = $1;", t_uuid)

        await log_audit_event(
            conn=conn,
            entity_type="zkteco_terminals",
            entity_id=t_uuid,
            action="DELETE",
            session=session,
            client_ip=client_ip,
            note=f"Deleted terminal registration {sn} ({t_uuid}).",
            changes={"deleted_terminal_id": str(t_uuid), "sn": sn}
        )

        return {"status": "deleted", "sn": sn}


@router.post("/api/v1/zkteco/terminals/{terminal_id}/command")
async def dispatch_terminal_command(
    terminal_id: str,
    payload: CommandDispatchPayload,
    request: Request = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Queue hardware command actions (sync_users, fix_time_qatar, clear_admin, reboot, clear_queue)."""
    require_permission(session, "attendance.manage")
    pool = get_db_pool()
    t_uuid = uuid.UUID(terminal_id)
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        terminal = await conn.fetchrow("SELECT sn FROM zkteco_terminals WHERE id = $1;", t_uuid)
        if not terminal:
            raise HTTPException(status_code=404, detail="Terminal not found.")
        sn = terminal["sn"]

        resp = None
        if payload.action == "sync_users":
            # Queue commands to push all active workforce members to device
            employees = await conn.fetch("""
                SELECT zk_emp_code, employee_number, full_name, zk_card_no, zk_is_admin, zk_pin
                FROM employees
                WHERE status = 'Active' AND zk_access_enabled = true;
            """)
            count = 0
            for emp in employees:
                code = emp["zk_emp_code"] or emp["employee_number"].replace("EMP-", "")
                name = emp["full_name"][:24].replace(":", "_").replace("\t", " ")
                pri = 14 if emp["zk_is_admin"] else 0
                card = emp["zk_card_no"] or "0"
                pin_pwd = emp["zk_pin"] or ""
                pwd_part = f"\tPasswd={pin_pwd}" if pin_pwd else ""
                cmd_text = f"DATA UPDATE USER PIN={code}\tName={name}\tPri={pri}\tCard={card}\tGrp=1\tTZ=1\tVerify=0\tViceCard=0{pwd_part}"
                await conn.execute("""
                    INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
                    VALUES ($1, $2, 'pending');
                """, sn, cmd_text)
                count += 1
            resp = {"status": "queued", "action": "sync_users", "queued_commands": count}

        elif payload.action == "fix_time_qatar":
            qatar_now = datetime.datetime.now(QATAR_TZ).strftime("%Y-%m-%d %H:%M:%S")
            cmd_text = f"SET OPTION DateTime={qatar_now}"
            cmd_id = await conn.fetchval("""
                INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
                VALUES ($1, $2, 'pending') RETURNING id;
            """, sn, cmd_text)
            resp = {"status": "queued", "command_id": cmd_id, "command_text": cmd_text}

        elif payload.action == "clear_admin":
            cmd_id = await conn.fetchval("""
                INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
                VALUES ($1, 'CLEAR ADMIN', 'pending') RETURNING id;
            """, sn)
            resp = {"status": "queued", "command_id": cmd_id, "action": "clear_admin"}

        elif payload.action == "reboot":
            cmd_id = await conn.fetchval("""
                INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
                VALUES ($1, 'REBOOT', 'pending') RETURNING id;
            """, sn)
            resp = {"status": "queued", "command_id": cmd_id, "action": "reboot"}

        elif payload.action == "clear_queue":
            await conn.execute("""
                DELETE FROM zkteco_command_queue WHERE terminal_sn = $1 AND status IN ('pending', 'sent');
            """, sn)
            resp = {"status": "success", "message": f"Queue cleared for {sn}"}

        elif payload.action == "custom" and payload.custom_cmd:
            cmd_id = await conn.fetchval("""
                INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
                VALUES ($1, $2, 'pending') RETURNING id;
            """, sn, payload.custom_cmd.strip())
            resp = {"status": "queued", "command_id": cmd_id, "command_text": payload.custom_cmd.strip()}

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported command action '{payload.action}'")

        await log_audit_event(
            conn=conn,
            entity_type="zkteco_terminals",
            entity_id=t_uuid,
            action="DISPATCH_COMMAND",
            session=session,
            client_ip=client_ip,
            note=f"Dispatched command action '{payload.action}' to terminal {sn}.",
            changes={"sn": sn, "action": payload.action, "result": resp}
        )

        return resp


@router.post("/api/v1/zkteco/enroll")
async def remote_enroll_employee(
    payload: RemoteEnrollPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Trigger remote biometric capture on the designated enrollment terminal."""
    require_permission(session, "attendance.manage")
    pool = get_db_pool()
    e_uuid = uuid.UUID(payload.employee_id)

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("SELECT zk_emp_code, employee_number, full_name FROM employees WHERE id = $1;", e_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        # Find designated enrollment terminal or fallback to any active terminal
        enrollment_term = await conn.fetchrow("""
            SELECT sn, alias FROM zkteco_terminals
            WHERE is_enrollment_terminal = true
            LIMIT 1;
        """)
        if not enrollment_term:
            enrollment_term = await conn.fetchrow("""
                SELECT sn, alias FROM zkteco_terminals
                WHERE state = 'active'
                ORDER BY last_activity DESC NULLS LAST LIMIT 1;
            """)

        if not enrollment_term:
            raise HTTPException(status_code=400, detail="No active ZKTeco terminals available for enrollment.")

        sn = enrollment_term["sn"]
        emp_code = emp["zk_emp_code"] or emp["employee_number"].replace("EMP-", "")

        if payload.enroll_type == "finger":
            fid = payload.finger_index or 0
            cmd_text = f"ENROLL_FP PIN={emp_code}\tFID={fid}"
        elif payload.enroll_type == "face":
            cmd_text = f"ENROLL_BIO PIN={emp_code}\tTYPE=9"
        else:
            raise HTTPException(status_code=400, detail="enroll_type must be 'finger' or 'face'")

        cmd_id = await conn.fetchval("""
            INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
            VALUES ($1, $2, 'pending') RETURNING id;
        """, sn, cmd_text)

        return {
            "status": "queued",
            "command_id": cmd_id,
            "command_text": cmd_text,
            "terminal_sn": sn,
            "terminal_alias": enrollment_term["alias"],
            "employee_name": emp["full_name"],
            "emp_code": emp_code
        }


@router.put("/api/v1/zkteco/employees/{employee_id}/biometrics")
async def update_employee_biometrics(
    employee_id: str,
    payload: EmployeeBiometricsUpdatePayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Update employee hardware credentials (PIN, Badge ID, RFID Card, Admin, Access Enabled)."""
    require_permission(session, "attendance.manage")
    pool = get_db_pool()
    e_uuid = uuid.UUID(employee_id)

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("""
            SELECT id, full_name, employee_number, zk_emp_code, zk_pin, zk_card_no, zk_is_admin, zk_access_enabled
            FROM employees WHERE id = $1;
        """, e_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        new_code = payload.zk_emp_code.strip() if payload.zk_emp_code is not None else emp["zk_emp_code"]
        new_card = payload.zk_card_no.strip() if payload.zk_card_no is not None else emp["zk_card_no"]
        new_pin = payload.zk_pin.strip() if payload.zk_pin is not None else emp["zk_pin"]
        new_admin = payload.zk_is_admin if payload.zk_is_admin is not None else emp["zk_is_admin"]
        new_access = payload.zk_access_enabled if payload.zk_access_enabled is not None else emp["zk_access_enabled"]

        await conn.execute("""
            UPDATE employees
            SET zk_emp_code = $1, zk_card_no = $2, zk_pin = $3, zk_is_admin = $4, zk_access_enabled = $5
            WHERE id = $6;
        """, new_code, new_card, new_pin, new_admin, new_access, e_uuid)

        # Broadcast update or delete to all active terminals
        active_terms = await conn.fetch("SELECT sn FROM zkteco_terminals WHERE state = 'active';")
        eff_code = new_code or emp["employee_number"].replace("EMP-", "")
        for t in active_terms:
            t_sn = t["sn"]
            if not new_access:
                await conn.execute("""
                    INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
                    VALUES ($1, $2, 'pending');
                """, t_sn, f"DATA DELETE USER PIN={eff_code}")
            else:
                pri = 14 if new_admin else 0
                card_val = new_card or "0"
                pwd_part = f"\tPasswd={new_pin}" if new_pin else ""
                name_val = emp["full_name"][:24].replace(":", "_").replace("\t", " ")
                cmd = f"DATA UPDATE USER PIN={eff_code}\tName={name_val}\tPri={pri}\tCard={card_val}\tGrp=1\tTZ=1\tVerify=0\tViceCard=0{pwd_part}"
                await conn.execute("""
                    INSERT INTO zkteco_command_queue (terminal_sn, command_text, status)
                    VALUES ($1, $2, 'pending');
                """, t_sn, cmd)

        return {
            "status": "success",
            "employee_id": str(e_uuid),
            "zk_emp_code": new_code,
            "zk_card_no": new_card,
            "zk_pin": new_pin,
            "zk_is_admin": new_admin,
            "zk_access_enabled": new_access
        }


@router.post("/api/v1/zkteco/simulate-punch")
async def simulate_biometric_punch(
    payload: SimulatePunchPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Simulates a live biometric punch from a ZKTeco terminal to test the Smart Attendance Pairing Engine.
    Executes check-in, double-punch ignore, check-out, and shift duration calculation.
    """
    require_permission(session, "attendance.manage")
    pool = get_db_pool()
    e_uuid = uuid.UUID(payload.employee_id)
    punch_utc = parse_zk_datetime(payload.punch_time) if payload.punch_time else datetime.datetime.now(datetime.timezone.utc)
    terminal_sn = payload.terminal_sn or "ZK-QAT-HQ01"
    verify_method = VERIFY_METHODS.get(payload.verify_method, payload.verify_method or "Face")

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("""
            SELECT id, employee_number, full_name, department_id, zk_emp_code, organization_id, branch_id
            FROM employees WHERE id = $1;
        """, e_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        emp_code = emp["zk_emp_code"] or emp["employee_number"].replace("EMP-", "")
        emp_id = emp["id"]
        emp_name = emp["full_name"]
        dept_name = emp["department_id"] or "Operations"
        org_id = emp["organization_id"]

        punch_state = "Employee Check-In"
        linked_att_id = None
        duration_hrs = None

        # Check for open log
        open_log = await conn.fetchrow("""
            SELECT id, check_in
            FROM attendance_logs
            WHERE employee_id = $1 AND check_out IS NULL
            ORDER BY check_in DESC LIMIT 1;
        """, emp_id)

        if open_log:
            diff_sec = (punch_utc - open_log["check_in"]).total_seconds()
            if diff_sec <= 120:
                punch_state = "Ignored (Double Punch)"
                linked_att_id = open_log["id"]
            elif diff_sec <= 16 * 3600:
                duration_hrs = round(diff_sec / 3600.0, 2)
                await conn.execute("""
                    UPDATE attendance_logs
                    SET check_out = $1,
                        duration_hours = $2,
                        status = CASE WHEN $2 < 8.0 THEN 'half_day' ELSE 'present' END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3;
                """, punch_utc, duration_hrs, open_log["id"])
                punch_state = "Employee Check-Out"
                linked_att_id = open_log["id"]
            else:
                await conn.execute("""
                    UPDATE attendance_logs
                    SET check_out = check_in,
                        duration_hours = 0.0,
                        notes = 'Auto-closed by ZKTeco sync: Employee missed checkout on previous shift',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1;
                """, open_log["id"])

                new_att_id = uuid.uuid4()
                await conn.execute("""
                    INSERT INTO attendance_logs (
                        id, employee_id, employee_name, department, terminal_id, check_in, status, organization_id, notes, ingestion_source, created_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, 'present', $7, 'Created via ZKTeco ADMS terminal (Prior Auto-Closed)', 'ZKTeco ADMS Simulation', CURRENT_TIMESTAMP
                    );
                """, new_att_id, emp_id, emp_name, dept_name, terminal_sn, punch_utc, org_id)
                punch_state = "Employee Check-In (Prior Auto-Closed)"
                linked_att_id = new_att_id
        else:
            new_att_id = uuid.uuid4()
            await conn.execute("""
                INSERT INTO attendance_logs (
                    id, employee_id, employee_name, department, terminal_id, check_in, status, organization_id, notes, ingestion_source, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, 'present', $7, 'Created via ZKTeco ADMS terminal check-in', 'ZKTeco ADMS Simulation', CURRENT_TIMESTAMP
                );
            """, new_att_id, emp_id, emp_name, dept_name, terminal_sn, punch_utc, org_id)
            punch_state = "Employee Check-In"
            linked_att_id = new_att_id

        # Insert transaction
        trans_id = uuid.uuid4()
        await conn.execute("""
            INSERT INTO zkteco_transactions (
                id, emp_code, employee_id, employee_name, punch_time,
                punch_state, terminal_sn, verify_method, processed, attendance_log_id, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, true, $9, CURRENT_TIMESTAMP
            );
        """, trans_id, emp_code, emp_id, emp_name, punch_utc, punch_state, terminal_sn, verify_method, linked_att_id)

        return {
            "status": "success",
            "transaction_id": str(trans_id),
            "punch_state": punch_state,
            "punch_time": punch_utc.isoformat(),
            "employee_name": emp_name,
            "emp_code": emp_code,
            "attendance_log_id": str(linked_att_id) if linked_att_id else None,
            "duration_hours": duration_hrs,
            "terminal_sn": terminal_sn,
            "verify_method": verify_method
        }


@router.get("/api/v1/zkteco/transactions")
async def list_zk_transactions(
    terminal_sn: Optional[str] = None,
    emp_code: Optional[str] = None,
    punch_state: Optional[str] = None,
    limit: int = 100,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """List recent raw biometric transactions captured from hardware devices."""
    require_permission(session, "attendance.read")
    pool = get_db_pool()

    query = """
        SELECT x.*, e.employee_number, e.department_id, e.job_title
        FROM zkteco_transactions x
        LEFT JOIN employees e ON x.employee_id = e.id
        WHERE 1=1
    """
    params: List[Any] = []
    idx = 1

    if terminal_sn:
        query += f" AND x.terminal_sn = ${idx}"
        params.append(terminal_sn.strip())
        idx += 1
    if emp_code:
        query += f" AND x.emp_code = ${idx}"
        params.append(emp_code.strip())
        idx += 1
    if punch_state and punch_state.upper() != "ALL":
        query += f" AND x.punch_state = ${idx}"
        params.append(punch_state.strip())
        idx += 1

    query += f" ORDER BY x.punch_time DESC LIMIT ${idx};"
    params.append(limit)

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        results = []
        for r in rows:
            d = dict(r)
            d["id"] = str(d["id"])
            if d.get("employee_id"):
                d["employee_id"] = str(d["employee_id"])
            if d.get("attendance_log_id"):
                d["attendance_log_id"] = str(d["attendance_log_id"])
            if d.get("punch_time"):
                d["punch_time"] = d["punch_time"].isoformat()
            if d.get("created_at"):
                d["created_at"] = d["created_at"].isoformat()
            results.append(d)

        return {"transactions": results, "total": len(results)}


@router.get("/api/v1/zkteco/commands")
async def list_zk_commands(
    terminal_sn: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Inspect ADMS hardware command dispatch queue."""
    require_permission(session, "attendance.read")
    pool = get_db_pool()

    query = "SELECT * FROM zkteco_command_queue WHERE 1=1"
    params: List[Any] = []
    idx = 1

    if terminal_sn:
        query += f" AND terminal_sn = ${idx}"
        params.append(terminal_sn.strip())
        idx += 1
    if status and status.upper() != "ALL":
        query += f" AND status = ${idx}"
        params.append(status.strip().lower())
        idx += 1

    query += f" ORDER BY id DESC LIMIT ${idx};"
    params.append(limit)

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        results = []
        for r in rows:
            d = dict(r)
            if d.get("created_at"):
                d["created_at"] = d["created_at"].isoformat()
            if d.get("updated_at"):
                d["updated_at"] = d["updated_at"].isoformat()
            results.append(d)

        return {"commands": results, "total": len(results)}


@router.get("/api/v1/zkteco/access-groups")
async def list_access_groups(session: Dict[str, Any] = Depends(get_current_user_session)):
    """List all corporate biometric access groups."""
    require_permission(session, "attendance.read")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM zkteco_access_groups ORDER BY name ASC;")
        results = [{"id": str(r["id"]), "name": r["name"], "description": r["description"]} for r in rows]
        return {"access_groups": results}
