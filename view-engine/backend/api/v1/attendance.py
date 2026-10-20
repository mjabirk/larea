import uuid
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query, BackgroundTasks
from pydantic import BaseModel
from backend.core.database import get_db_pool
from backend.core.dependencies import (
    get_current_user_session,
    get_client_ip,
    require_permission,
    check_permission,
    verify_record_tenant,
)
from backend.core.audit import record_audit_log
from backend.core.sequences import uuid7, get_next_attendance_code

router = APIRouter(prefix="/api/v1/attendance", tags=["Attendance Logs"])

def parse_iso(dt_str: Optional[str]) -> Optional[datetime.datetime]:
    if not dt_str:
        return None
    try:
        clean = str(dt_str).replace("Z", "+00:00")
        return datetime.datetime.fromisoformat(clean)
    except Exception:
        return None

def serialize_row(r: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(r)
    for k, v in d.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            d[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif hasattr(v, "__float__"):
            d[k] = float(v)
    return d

class AttendancePayload(BaseModel):
    employee_id: str
    employee_name: Optional[str] = None
    department: Optional[str] = None
    terminal_id: Optional[str] = "Terminal #01 (Main Lobby Gate)"
    check_in: str
    check_out: Optional[str] = None
    duration_hours: Optional[float] = 0.0
    status: Optional[str] = "draft"
    notes: Optional[str] = None

class AttendanceUpdatePayload(BaseModel):
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    department: Optional[str] = None
    terminal_id: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    duration_hours: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class BulkAttendanceItem(BaseModel):
    employee_id: Optional[str] = None
    employee_number: Optional[str] = None
    employee_name: Optional[str] = None
    department: Optional[str] = None
    terminal_id: Optional[str] = "Bulk Sync Terminal"
    check_in: str
    check_out: Optional[str] = None
    duration_hours: Optional[float] = 0.0
    status: Optional[str] = "present"
    notes: Optional[str] = None

class BulkAttendanceSyncPayload(BaseModel):
    items: List[BulkAttendanceItem]

class BulkStatusPayload(BaseModel):
    log_ids: List[str]
    status: Optional[str] = None
    approval_status: Optional[str] = None
    notes: Optional[str] = None

@router.get("")
async def list_attendance_logs(
    q: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """List all attendance logs with relational employee details and PostgreSQL WHERE filtering."""
    require_permission(session, "attendance.read")
    pool = get_db_pool()
    org_id = session.get("organization_id")

    query = """
        SELECT count(*) OVER() as full_count,
               a.id, a.code, a.employee_id, a.employee_name, a.department,
               a.terminal_id, a.check_in, a.check_out, a.duration_hours,
               a.status, a.approval_status, a.created_by, a.submitted_by,
               a.approved_by, a.approved_at, a.notes, a.machine_ip, a.ingestion_source,
               a.ingestion_time, a.last_modified_by, a.organization_id,
               a.created_at, a.updated_at,
               e.employee_number, e.job_title
        FROM attendance_logs a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE 1=1
    """
    params: List[Any] = []
    idx = 1

    if not session.get("is_superadmin") and org_id:
        query += f" AND a.organization_id = ${idx}::uuid"
        params.append(org_id)
        idx += 1

    if q and q.strip():
        query += f""" AND (
            a.employee_name ILIKE ${idx}
            OR a.code ILIKE ${idx}
            OR COALESCE(a.department, '') ILIKE ${idx}
            OR COALESCE(a.terminal_id, '') ILIKE ${idx}
        )"""
        params.append(f"%{q.strip()}%")
        idx += 1

    if department and department.upper() != "ALL":
        query += f" AND a.department = ${idx}"
        params.append(department)
        idx += 1

    if status_filter and status_filter.upper() != "ALL":
        query += f" AND LOWER(COALESCE(a.status, '')) = LOWER(${idx})"
        params.append(status_filter)
        idx += 1

    query += f" ORDER BY a.check_in DESC LIMIT ${idx} OFFSET ${idx + 1};"
    params.extend([limit, offset])

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        total_count = int(rows[0]["full_count"]) if rows else 0
        records = []
        for r in rows:
            d = dict(r)
            d.pop("full_count", None)
            records.append(serialize_row(d))
        return {"records": records, "total": total_count, "limit": limit, "offset": offset}

@router.post("")
async def create_attendance_log(
    payload: AttendancePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Create an attendance log linked to a strict employee foreign key."""
    require_permission(session, "attendance.write")
    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(payload.employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    creator_uid = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            creator_uid = uuid.UUID(str(uid_str))
        except Exception:
            pass

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("""
            SELECT id, full_name, department_id, employee_number, organization_id
            FROM employees WHERE id = $1;
        """, emp_uuid)
        if not emp:
            raise HTTPException(status_code=400, detail="Referenced employee does not exist.")

        # Inherit department from employee profile if not provided
        inherited_dept = payload.department or emp["department_id"] or "Operations"
        emp_name = payload.employee_name or emp["full_name"]

        # Generate lock-free atomic attendance code & UUIDv7
        code = await get_next_attendance_code(conn)
        new_id = uuid7()

        t_in = parse_iso(payload.check_in)
        if not t_in:
            t_in = datetime.datetime.now(datetime.timezone.utc)
        t_out = parse_iso(payload.check_out)

        # Compute duration_hours
        hours = payload.duration_hours or 0.0
        if t_in and t_out and t_out > t_in:
            diff_sec = (t_out - t_in).total_seconds()
            hours = round(diff_sec / 3600.0, 1)

        client_ip = get_client_ip(request) if request else "127.0.0.1"
        author_name = session.get("full_name") or session.get("username") or "Authorized User"

        await conn.execute("""
            INSERT INTO attendance_logs (
                id, code, employee_id, employee_name, department, terminal_id,
                check_in, check_out, duration_hours, status, notes, machine_ip,
                ingestion_source, last_modified_by, organization_id,
                created_by, approval_status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
            );
        """,
            new_id, code, emp_uuid, emp_name, inherited_dept,
            payload.terminal_id or "Terminal #01 (Main Lobby Gate)",
            t_in, t_out, hours, payload.status or "draft", payload.notes,
            client_ip, "Manual HR Entry", author_name, emp["organization_id"],
            creator_uid, "draft"
        )

        row = await conn.fetchrow("""
            SELECT a.*, e.employee_number, e.job_title
            FROM attendance_logs a
            LEFT JOIN employees e ON a.employee_id = e.id
            WHERE a.id = $1;
        """, new_id)
        return serialize_row(dict(row))


async def _background_bulk_attendance_audit(
    log_ids: List[str],
    tenant_id: str,
    user_id: Optional[uuid.UUID],
    user_name: str,
    client_ip: str,
    action: str,
    note: str,
    changes: Dict[str, Any]
):
    """Background task to record audit logs without holding client HTTP response or DB transaction."""
    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            for lid in log_ids:
                await record_audit_log(
                    conn=conn,
                    tenant_id=tenant_id,
                    entity_type="attendance_logs",
                    entity_id=lid,
                    action=action,
                    changed_by_user_id=user_id,
                    changed_by_name=user_name,
                    note=note,
                    ip_address=client_ip,
                    changes=changes
                )
    except Exception:
        pass


@router.post("/bulk-sync")
async def bulk_sync_attendance(
    payload: BulkAttendanceSyncPayload,
    request: Request,
    background_tasks: BackgroundTasks,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Bulk high-concurrency ingestion of attendance logs.
    Performs batched employee resolution and executes a single bulk SQL insert via executemany.
    Generates collision-free atomic sequences and RFC 9562 UUIDv7 IDs.
    """
    require_permission(session, "attendance.write")
    if not payload.items:
        return {"inserted": 0, "records": []}

    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"
    author_name = session.get("full_name") or session.get("username") or "Authorized User"
    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    # Extract distinct employee IDs and employee numbers
    emp_uuids = []
    emp_numbers = []
    for it in payload.items:
        if it.employee_id:
            try:
                emp_uuids.append(uuid.UUID(it.employee_id))
            except Exception:
                pass
        if it.employee_number:
            emp_numbers.append(it.employee_number.strip())

    async with pool.acquire() as conn:
        if user_id:
            user_exists = await conn.fetchval("SELECT 1 FROM users WHERE id = $1;", user_id)
            if not user_exists:
                user_id = None

        # Single batched employee lookup query
        employees = await conn.fetch("""
            SELECT id, employee_number, full_name, department_id, organization_id
            FROM employees
            WHERE id = ANY($1::uuid[]) OR employee_number = ANY($2::text[]);
        """, emp_uuids, emp_numbers)

        emp_map_by_id = {str(e["id"]): e for e in employees}
        emp_map_by_num = {e["employee_number"]: e for e in employees if e["employee_number"]}

        now = datetime.datetime.now(datetime.timezone.utc)
        insert_rows = []
        created_records = []
        unmatched_count = 0

        for it in payload.items:
            emp = None
            if it.employee_id and str(it.employee_id) in emp_map_by_id:
                emp = emp_map_by_id[str(it.employee_id)]
            elif it.employee_number and it.employee_number in emp_map_by_num:
                emp = emp_map_by_num[it.employee_number]

            if not emp:
                unmatched_count += 1
                continue

            t_in = parse_iso(it.check_in) or now
            t_out = parse_iso(it.check_out)
            hours = it.duration_hours or 0.0
            if t_in and t_out and t_out > t_in:
                hours = round((t_out - t_in).total_seconds() / 3600.0, 1)

            code = await get_next_attendance_code(conn)
            new_id = uuid7()
            dept = it.department or emp["department_id"] or "Operations"
            name = it.employee_name or emp["full_name"]

            insert_rows.append((
                new_id, code, emp["id"], name, dept,
                it.terminal_id or "Bulk Sync Terminal",
                t_in, t_out, hours, it.status or "present", it.notes,
                client_ip, "Bulk Sync API", author_name, emp["organization_id"],
                user_id, "draft", now, now
            ))

            created_records.append({
                "id": str(new_id),
                "code": code,
                "employee_id": str(emp["id"]),
                "employee_name": name,
                "check_in": t_in.isoformat(),
                "check_out": t_out.isoformat() if t_out else None,
                "duration_hours": hours,
                "status": it.status or "present"
            })

        if insert_rows:
            await conn.executemany("""
                INSERT INTO attendance_logs (
                    id, code, employee_id, employee_name, department, terminal_id,
                    check_in, check_out, duration_hours, status, notes, machine_ip,
                    ingestion_source, last_modified_by, organization_id,
                    created_by, approval_status, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
                );
            """, insert_rows)

        # Offload background audit recording
        org_id = str(employees[0]["organization_id"]) if employees else "default_tenant"
        if created_records:
            background_tasks.add_task(
                _background_bulk_attendance_audit,
                log_ids=[r["id"] for r in created_records],
                tenant_id=org_id,
                user_id=user_id,
                user_name=author_name,
                client_ip=client_ip,
                action="BULK_SYNC",
                note=f"Bulk imported {len(created_records)} attendance logs.",
                changes={"count": len(created_records)}
            )

        return {
            "success": True,
            "inserted": len(created_records),
            "unmatched": unmatched_count,
            "records": created_records
        }


@router.post("/bulk-status")
async def bulk_update_attendance_status(
    payload: BulkStatusPayload,
    request: Request,
    background_tasks: BackgroundTasks,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Bulk updates status or approval_status for multiple attendance records in a single query.
    Offloads non-critical audit log writes to background tasks.
    """
    require_permission(session, "attendance.write")
    if not payload.log_ids:
        return {"updated": 0, "records": []}

    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"
    author_name = session.get("full_name") or session.get("username") or "Authorized User"
    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    valid_uuids = []
    for lid in payload.log_ids:
        try:
            valid_uuids.append(uuid.UUID(lid))
        except Exception:
            pass

    if not valid_uuids:
        raise HTTPException(status_code=400, detail="No valid log UUIDs provided.")

    async with pool.acquire() as conn:
        updated_rows = await conn.fetch("""
            UPDATE attendance_logs
            SET status = COALESCE($1, status),
                approval_status = COALESCE($2, approval_status),
                notes = COALESCE($3, notes),
                last_modified_by = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ANY($5::uuid[])
            RETURNING id, code, organization_id, status, approval_status;
        """, payload.status, payload.approval_status, payload.notes, author_name, valid_uuids)

        if updated_rows:
            org_id = str(updated_rows[0]["organization_id"]) if updated_rows[0]["organization_id"] else "default_tenant"
            background_tasks.add_task(
                _background_bulk_attendance_audit,
                log_ids=[str(r["id"]) for r in updated_rows],
                tenant_id=org_id,
                user_id=user_id,
                user_name=author_name,
                client_ip=client_ip,
                action="BULK_STATUS_UPDATE",
                note=f"Bulk updated {len(updated_rows)} logs to status='{payload.status}', approval_status='{payload.approval_status}'.",
                changes={"status": payload.status, "approval_status": payload.approval_status}
            )

        return {
            "success": True,
            "updated": len(updated_rows),
            "records": [{"id": str(r["id"]), "code": r["code"], "status": r["status"], "approval_status": r["approval_status"]} for r in updated_rows]
        }


@router.put("/{log_id}")
async def update_attendance_log(
    log_id: str,
    payload: AttendanceUpdatePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Update attendance log attributes or check-out time."""
    require_permission(session, "attendance.write")
    pool = get_db_pool()
    try:
        l_uuid = uuid.UUID(log_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid log UUID.")

    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM attendance_logs WHERE id = $1;", l_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="Attendance log not found.")
        verify_record_tenant(existing["organization_id"], session)

        emp_uuid = uuid.UUID(payload.employee_id) if payload.employee_id else existing["employee_id"]
        emp_name = payload.employee_name or existing["employee_name"]
        dept = payload.department or existing["department"]
        terminal = payload.terminal_id or existing["terminal_id"]
        t_in = parse_iso(payload.check_in) if payload.check_in is not None else existing["check_in"]
        t_out = parse_iso(payload.check_out) if payload.check_out is not None else existing["check_out"]
        stat = payload.status or existing["status"]
        notes = payload.notes if payload.notes is not None else existing["notes"]

        # SOX 404 Maker-Checker Guard: If caller attempts to set status directly to 'verified'
        approver_id = existing["approved_by"]
        approver_at = existing["approved_at"]
        appr_status = existing["approval_status"]

        if stat == "verified" and existing["status"] != "verified":
            if existing["created_by"] and user_id and str(user_id) == str(existing["created_by"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="SOX 404 Maker-Checker Violation: You cannot self-verify/approve an attendance log that you created."
                )
            if existing["submitted_by"] and user_id and str(user_id) == str(existing["submitted_by"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="SOX 404 Maker-Checker Violation: You cannot self-verify/approve an attendance log that you submitted."
                )
            approver_id = user_id
            approver_at = datetime.datetime.now(datetime.timezone.utc)
            appr_status = "approved"

        hours = payload.duration_hours
        if hours is None:
            if t_in and t_out and t_out > t_in:
                diff_sec = (t_out - t_in).total_seconds()
                hours = round(diff_sec / 3600.0, 1)
            else:
                hours = float(existing["duration_hours"] or 0)

        author_name = session.get("full_name") or session.get("username") or "Authorized User"

        await conn.execute("""
            UPDATE attendance_logs
            SET employee_id = $1, employee_name = $2, department = $3,
                terminal_id = $4, check_in = $5, check_out = $6,
                duration_hours = $7, status = $8, notes = $9,
                last_modified_by = $10,
                approved_by = $11, approved_at = $12, approval_status = $13,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $14;
        """, emp_uuid, emp_name, dept, terminal, t_in, t_out, hours, stat, notes, author_name,
           approver_id, approver_at, appr_status, l_uuid)

        updated = await conn.fetchrow("""
            SELECT a.*, e.employee_number, e.job_title
            FROM attendance_logs a
            LEFT JOIN employees e ON a.employee_id = e.id
            WHERE a.id = $1;
        """, l_uuid)
        return serialize_row(dict(updated))


@router.post("/{log_id}/submit")
async def submit_attendance_log(
    log_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Submits an attendance adjustment for independent checker verification/approval.
    Sets approval_status to 'pending_approval'.
    """
    require_permission(session, "attendance.write")
    pool = get_db_pool()
    try:
        l_uuid = uuid.UUID(log_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid log UUID.")

    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM attendance_logs WHERE id = $1;", l_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="Attendance log not found.")

        if existing["approval_status"] == "approved" or existing["status"] == "verified":
            raise HTTPException(status_code=400, detail="Attendance log is already verified and approved.")

        await conn.execute("""
            UPDATE attendance_logs
            SET approval_status = 'pending_approval',
                submitted_by = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """, l_uuid, user_id)

        client_ip = get_client_ip(request) if request else "127.0.0.1"
        t_id = str(existing["organization_id"]) if existing["organization_id"] else "default_tenant"
        await record_audit_log(
            conn=conn,
            tenant_id=t_id,
            entity_type="attendance_logs",
            entity_id=str(l_uuid),
            action="SUBMIT_FOR_APPROVAL",
            changed_by_user_id=user_id,
            changed_by_name=session.get("full_name") or session.get("username") or "Authorized User",
            note=f"Submitted attendance log {existing['code']} for dual-control approval.",
            ip_address=client_ip,
            changes={"approval_status": "pending_approval", "submitted_by": str(user_id) if user_id else None}
        )

        updated = await conn.fetchrow("SELECT * FROM attendance_logs WHERE id = $1;", l_uuid)
        return serialize_row(dict(updated))


@router.post("/{log_id}/approve")
async def approve_attendance_log(
    log_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Checker Dual-Control Approval:
    Verifies approved_by != created_by and approved_by != submitted_by.
    Sets status to 'verified' and approval_status to 'approved'.
    """
    if not (check_permission(session, "attendance.approve") or check_permission(session, "attendance.write") or check_permission(session, "attendance_logs.update") or session.get("is_superadmin")):
        raise HTTPException(status_code=403, detail="Access denied: Missing attendance verification permission.")
    pool = get_db_pool()
    try:
        l_uuid = uuid.UUID(log_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid log UUID.")

    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM attendance_logs WHERE id = $1;", l_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="Attendance log not found.")
        verify_record_tenant(existing["organization_id"], session)

        # Hard Maker-Checker Rule
        if existing["created_by"] and user_id and str(user_id) == str(existing["created_by"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SOX 404 Maker-Checker Violation: You cannot approve an attendance log that you created. Dual control requires an independent checker."
            )
        if existing["submitted_by"] and user_id and str(user_id) == str(existing["submitted_by"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SOX 404 Maker-Checker Violation: You cannot approve an attendance log that you submitted for approval. Dual control requires an independent checker."
            )

        await conn.execute("""
            UPDATE attendance_logs
            SET status = 'verified',
                approval_status = 'approved',
                approved_by = $2,
                approved_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """, l_uuid, user_id)

        client_ip = get_client_ip(request) if request else "127.0.0.1"
        t_id = str(existing["organization_id"]) if existing["organization_id"] else "default_tenant"
        await record_audit_log(
            conn=conn,
            tenant_id=t_id,
            entity_type="attendance_logs",
            entity_id=str(l_uuid),
            action="APPROVE",
            changed_by_user_id=user_id,
            changed_by_name=session.get("full_name") or session.get("username") or "Authorized User",
            note=f"Approved attendance adjustment {existing['code']} under SOX 404 Dual Control.",
            ip_address=client_ip,
            changes={"status": "verified", "approval_status": "approved", "approved_by": str(user_id) if user_id else None}
        )

        updated = await conn.fetchrow("SELECT * FROM attendance_logs WHERE id = $1;", l_uuid)
        return serialize_row(dict(updated))


@router.post("/{log_id}/reject")
async def reject_attendance_log(
    log_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Rejects an attendance adjustment under dual-control review.
    Sets approval_status to 'rejected'.
    """
    require_permission(session, "attendance.approve")
    pool = get_db_pool()
    try:
        l_uuid = uuid.UUID(log_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid log UUID.")

    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM attendance_logs WHERE id = $1;", l_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="Attendance log not found.")
        verify_record_tenant(existing["organization_id"], session)

        if existing["approval_status"] == "approved":
            raise HTTPException(status_code=400, detail="Cannot reject an approved attendance log.")

        await conn.execute("""
            UPDATE attendance_logs
            SET approval_status = 'rejected',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """, l_uuid)

        client_ip = get_client_ip(request) if request else "127.0.0.1"
        t_id = str(existing["organization_id"]) if existing["organization_id"] else "default_tenant"
        await record_audit_log(
            conn=conn,
            tenant_id=t_id,
            entity_type="attendance_logs",
            entity_id=str(l_uuid),
            action="REJECT",
            changed_by_user_id=user_id,
            changed_by_name=session.get("full_name") or session.get("username") or "Authorized User",
            note=f"Rejected attendance log {existing['code']} under SOX 404 Dual Control review.",
            ip_address=client_ip,
            changes={"approval_status": "rejected"}
        )

        updated = await conn.fetchrow("SELECT * FROM attendance_logs WHERE id = $1;", l_uuid)
        return serialize_row(dict(updated))

@router.delete("/{log_id}")
async def delete_attendance_log(
    log_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Delete an attendance log."""
    require_permission(session, "attendance.delete")
    pool = get_db_pool()
    try:
        l_uuid = uuid.UUID(log_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid log UUID.")

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT organization_id FROM attendance_logs WHERE id = $1;", l_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="Attendance log not found.")
        verify_record_tenant(existing["organization_id"], session)

        await conn.execute("DELETE FROM attendance_logs WHERE id = $1;", l_uuid)
        return {"success": True, "deleted_id": str(l_uuid)}
