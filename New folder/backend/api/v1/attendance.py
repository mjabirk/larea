import uuid
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query
from pydantic import BaseModel
from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session, get_client_ip, require_permission

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
               a.status, a.notes, a.machine_ip, a.ingestion_source,
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

        # Generate collision-safe attendance code
        max_seq = await conn.fetchval("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 'ATT-[0-9]{4}-([0-9]+)') AS INT)), 1000)
            FROM attendance_logs
            WHERE code ~ '^ATT-[0-9]{4}-[0-9]+$';
        """) or 1000
        code = f"ATT-2026-{max_seq + 1}"

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
        new_id = uuid.uuid4()

        await conn.execute("""
            INSERT INTO attendance_logs (
                id, code, employee_id, employee_name, department, terminal_id,
                check_in, check_out, duration_hours, status, notes, machine_ip,
                ingestion_source, last_modified_by, organization_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            );
        """,
            new_id, code, emp_uuid, emp_name, inherited_dept,
            payload.terminal_id or "Terminal #01 (Main Lobby Gate)",
            t_in, t_out, hours, payload.status or "draft", payload.notes,
            client_ip, "Manual HR Entry", author_name, emp["organization_id"]
        )

        row = await conn.fetchrow("""
            SELECT a.*, e.employee_number, e.job_title
            FROM attendance_logs a
            LEFT JOIN employees e ON a.employee_id = e.id
            WHERE a.id = $1;
        """, new_id)
        return serialize_row(dict(row))

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

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM attendance_logs WHERE id = $1;", l_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="Attendance log not found.")

        emp_uuid = uuid.UUID(payload.employee_id) if payload.employee_id else existing["employee_id"]
        emp_name = payload.employee_name or existing["employee_name"]
        dept = payload.department or existing["department"]
        terminal = payload.terminal_id or existing["terminal_id"]
        t_in = parse_iso(payload.check_in) if payload.check_in is not None else existing["check_in"]
        t_out = parse_iso(payload.check_out) if payload.check_out is not None else existing["check_out"]
        stat = payload.status or existing["status"]
        notes = payload.notes if payload.notes is not None else existing["notes"]

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
                last_modified_by = $10, updated_at = CURRENT_TIMESTAMP
            WHERE id = $11;
        """, emp_uuid, emp_name, dept, terminal, t_in, t_out, hours, stat, notes, author_name, l_uuid)

        updated = await conn.fetchrow("""
            SELECT a.*, e.employee_number, e.job_title
            FROM attendance_logs a
            LEFT JOIN employees e ON a.employee_id = e.id
            WHERE a.id = $1;
        """, l_uuid)
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
        res = await conn.execute("DELETE FROM attendance_logs WHERE id = $1;", l_uuid)
        if res == "DELETE 0":
            raise HTTPException(status_code=404, detail="Attendance log not found.")
        return {"success": True, "deleted_id": str(l_uuid)}
