import uuid
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query
from pydantic import BaseModel, Field

from backend.core.database import get_db_pool
from backend.core.dependencies import (
    get_current_user_session,
    get_client_ip,
    require_permission,
    verify_record_tenant,
)
from backend.core.audit import record_audit_log
from backend.core.sequences import uuid7, get_next_roster_code, get_next_roster_id

router = APIRouter(prefix="/api/v1/rosters", tags=["Shift Rosters"])


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


class RosterCreatePayload(BaseModel):
    employee_id: str
    employee_name: Optional[str] = None
    department: Optional[str] = None
    shift_name: Optional[str] = "Morning Shift (08:00 - 16:00)"
    start_time: str
    end_time: str
    duration_hours: Optional[float] = None
    location: Optional[str] = "Doha Head Office"
    status: Optional[str] = "scheduled"
    notes: Optional[str] = None


class RosterUpdatePayload(BaseModel):
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    department: Optional[str] = None
    shift_name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_hours: Optional[float] = None
    location: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_shift_rosters(
    request: Request,
    q: Optional[str] = Query(None, description="Search term for employee name, code, shift name, or department"),
    department: Optional[str] = Query(None, description="Filter by department name"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by shift status"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    List shift rosters with search, department filtering, status filtering, and pagination.
    Protected by RBAC 'attendance.read' permission.
    """
    require_permission(session, "attendance.read")

    pool = get_db_pool()
    if not pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection pool unavailable.",
        )

    conditions = ["1=1"]
    params = []
    idx = 1

    # Tenant isolation
    is_superadmin = session.get("is_superadmin", False)
    tenant_org_id = session.get("organization_id")
    if not is_superadmin and tenant_org_id:
        try:
            org_uuid = uuid.UUID(str(tenant_org_id))
            conditions.append(f"(r.organization_id IS NULL OR r.organization_id = ${idx})")
            params.append(org_uuid)
            idx += 1
        except Exception:
            pass

    # Search filter
    if q and q.strip():
        search_pattern = f"%{q.strip()}%"
        conditions.append(
            f"(r.code ILIKE ${idx} OR r.employee_name ILIKE ${idx} OR r.department ILIKE ${idx} "
            f"OR r.shift_name ILIKE ${idx} OR r.location ILIKE ${idx})"
        )
        params.append(search_pattern)
        idx += 1

    # Department filter
    if department and department.strip() and department.strip().lower() != "all":
        conditions.append(f"r.department = ${idx}")
        params.append(department.strip())
        idx += 1

    # Status filter
    if status_filter and status_filter.strip() and status_filter.strip().lower() != "all":
        conditions.append(f"r.status = ${idx}")
        params.append(status_filter.strip().lower())
        idx += 1

    where_clause = " AND ".join(conditions)

    query = f"""
        SELECT 
            r.id,
            r.code,
            r.employee_id,
            r.employee_name,
            r.department,
            r.shift_name,
            r.start_time,
            r.end_time,
            r.duration_hours,
            r.location,
            r.status,
            r.notes,
            r.organization_id,
            r.created_at,
            r.updated_at,
            COUNT(*) OVER() AS full_count
        FROM shift_rosters r
        WHERE {where_clause}
        ORDER BY r.start_time DESC, r.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1};
    """
    params.extend([limit, offset])

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    total = int(rows[0]["full_count"]) if rows else 0
    serialized = [serialize_row(r) for r in rows]

    return {
        "rosters": serialized,
        "records": serialized,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_shift_roster(
    payload: RosterCreatePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Create a new shift roster entry.
    Auto-computes duration_hours from end_time - start_time and generates collision-safe ROS-YYYY-XXXX code.
    Protected by RBAC 'attendance.write' permission.
    """
    require_permission(session, "attendance.write")

    pool = get_db_pool()
    if not pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection pool unavailable.",
        )

    # Validate employee ID
    try:
        emp_uuid = uuid.UUID(str(payload.employee_id))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid employee_id format: '{payload.employee_id}'. Must be a valid UUID.",
        )

    # Parse and validate datetimes
    start_dt = parse_iso(payload.start_time)
    end_dt = parse_iso(payload.end_time)
    if not start_dt or not end_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid start_time or end_time format (ISO-8601 required).",
        )
    if end_dt <= start_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shift end_time must be chronologically after start_time.",
        )

    # Auto-compute duration in hours
    duration_hours = round((end_dt - start_dt).total_seconds() / 3600.0, 2)

    async with pool.acquire() as conn:
        # Verify employee exists and resolve name/dept/org
        emp_row = await conn.fetchrow(
            "SELECT id, full_name, department_id, organization_id FROM employees WHERE id = $1;",
            emp_uuid,
        )
        if not emp_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with ID '{payload.employee_id}' not found.",
            )

        employee_name = payload.employee_name or emp_row["full_name"]
        department = payload.department or emp_row["department_id"] or "Operations"

        # Resolve organization_id and enforce tenant isolation
        org_id = emp_row["organization_id"]
        if not org_id and session.get("organization_id"):
            try:
                org_id = uuid.UUID(str(session["organization_id"]))
            except Exception:
                org_id = None

        if org_id:
            verify_record_tenant(session, org_id)

        # Generate lock-free collision-safe ROS-YYYY-XXXX code
        tenant_str = str(org_id) if org_id else "default_tenant"
        code = await get_next_roster_code(year=start_dt.year, tenant_id=tenant_str)
        roster_id = await get_next_roster_id()

        shift_name = payload.shift_name or "Morning Shift (08:00 - 16:00)"
        status_val = (payload.status or "scheduled").lower()
        location_val = payload.location or "Doha Head Office"

        insert_sql = """
            INSERT INTO shift_rosters (
                id,
                code,
                employee_id,
                employee_name,
                department,
                shift_name,
                start_time,
                end_time,
                duration_hours,
                location,
                status,
                notes,
                organization_id,
                created_at,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING *;
        """

        created_row = await conn.fetchrow(
            insert_sql,
            roster_id,
            code,
            emp_uuid,
            employee_name,
            department,
            shift_name,
            start_dt,
            end_dt,
            duration_hours,
            location_val,
            status_val,
            payload.notes,
            org_id,
        )

        client_ip = get_client_ip(request)
        user_id = None
        if session.get("id"):
            try:
                user_id = uuid.UUID(str(session["id"]))
            except Exception:
                pass
        user_name = session.get("full_name") or session.get("username") or "System User"
        tenant_str = str(org_id or session.get("organization_id") or "default_tenant")

        await record_audit_log(
            conn=conn,
            tenant_id=tenant_str,
            entity_type="shift_rosters",
            entity_id=str(roster_id),
            action="CREATE",
            changed_by_user_id=user_id,
            changed_by_name=user_name,
            ip_address=client_ip,
            note=f"Created shift roster {code} for {employee_name} ({shift_name})",
            changes={
                "code": code,
                "employee_name": employee_name,
                "shift_name": shift_name,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "duration_hours": duration_hours,
                "status": status_val,
            },
        )

    return serialize_row(created_row)


@router.put("/{roster_id}")
async def update_shift_roster(
    roster_id: str,
    payload: RosterUpdatePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Update an existing shift roster.
    Recalculates duration_hours if start_time or end_time changes.
    Protected by RBAC 'attendance.write' permission.
    """
    require_permission(session, "attendance.write")

    try:
        r_uuid = uuid.UUID(str(roster_id))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid roster_id: '{roster_id}'. Must be a valid UUID.",
        )

    pool = get_db_pool()
    if not pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection pool unavailable.",
        )

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM shift_rosters WHERE id = $1;", r_uuid)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shift roster '{roster_id}' not found.",
            )

        if existing["organization_id"]:
            verify_record_tenant(session, existing["organization_id"])

        # Determine employee updates
        emp_id = existing["employee_id"]
        emp_name = existing["employee_name"]
        dept = existing["department"]

        if payload.employee_id:
            try:
                new_emp_uuid = uuid.UUID(str(payload.employee_id))
                emp_row = await conn.fetchrow(
                    "SELECT id, full_name, department_id FROM employees WHERE id = $1;", new_emp_uuid
                )
                if not emp_row:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Employee '{payload.employee_id}' not found.",
                    )
                emp_id = new_emp_uuid
                emp_name = payload.employee_name or emp_row["full_name"]
                dept = payload.department or emp_row["department_id"] or dept
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid employee_id format: '{payload.employee_id}'.",
                )
        else:
            if payload.employee_name is not None:
                emp_name = payload.employee_name
            if payload.department is not None:
                dept = payload.department

        # Determine start and end times
        start_dt = parse_iso(payload.start_time) if payload.start_time else existing["start_time"]
        end_dt = parse_iso(payload.end_time) if payload.end_time else existing["end_time"]

        if not start_dt or not end_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Valid start_time and end_time are required.",
            )
        if end_dt <= start_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Shift end_time must be chronologically after start_time.",
            )

        duration_hours = round((end_dt - start_dt).total_seconds() / 3600.0, 2)

        shift_name = payload.shift_name if payload.shift_name is not None else existing["shift_name"]
        location = payload.location if payload.location is not None else existing["location"]
        status_val = payload.status.lower() if payload.status is not None else existing["status"]
        notes = payload.notes if payload.notes is not None else existing["notes"]

        update_sql = """
            UPDATE shift_rosters
            SET 
                employee_id = $1,
                employee_name = $2,
                department = $3,
                shift_name = $4,
                start_time = $5,
                end_time = $6,
                duration_hours = $7,
                location = $8,
                status = $9,
                notes = $10,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
            RETURNING *;
        """

        updated_row = await conn.fetchrow(
            update_sql,
            emp_id,
            emp_name,
            dept,
            shift_name,
            start_dt,
            end_dt,
            duration_hours,
            location,
            status_val,
            notes,
            r_uuid,
        )

        client_ip = get_client_ip(request)
        user_id = None
        if session.get("id"):
            try:
                user_id = uuid.UUID(str(session["id"]))
            except Exception:
                pass
        user_name = session.get("full_name") or session.get("username") or "System User"
        tenant_str = str(existing["organization_id"] or session.get("organization_id") or "default_tenant")

        await record_audit_log(
            conn=conn,
            tenant_id=tenant_str,
            entity_type="shift_rosters",
            entity_id=str(r_uuid),
            action="UPDATE",
            changed_by_user_id=user_id,
            changed_by_name=user_name,
            ip_address=client_ip,
            note=f"Updated shift roster {existing['code']} for {emp_name}",
            changes={
                "code": existing["code"],
                "shift_name": shift_name,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "duration_hours": duration_hours,
                "status": status_val,
            },
        )

    return serialize_row(updated_row)


@router.delete("/{roster_id}")
async def delete_shift_roster(
    roster_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Delete a shift roster entry.
    Protected by RBAC 'attendance.write' permission.
    """
    require_permission(session, "attendance.write")

    try:
        r_uuid = uuid.UUID(str(roster_id))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid roster_id: '{roster_id}'. Must be a valid UUID.",
        )

    pool = get_db_pool()
    if not pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection pool unavailable.",
        )

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM shift_rosters WHERE id = $1;", r_uuid)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shift roster '{roster_id}' not found.",
            )

        if existing["organization_id"]:
            verify_record_tenant(session, existing["organization_id"])

        await conn.execute("DELETE FROM shift_rosters WHERE id = $1;", r_uuid)

        client_ip = get_client_ip(request)
        user_id = None
        if session.get("id"):
            try:
                user_id = uuid.UUID(str(session["id"]))
            except Exception:
                pass
        user_name = session.get("full_name") or session.get("username") or "System User"
        tenant_str = str(existing["organization_id"] or session.get("organization_id") or "default_tenant")

        await record_audit_log(
            conn=conn,
            tenant_id=tenant_str,
            entity_type="shift_rosters",
            entity_id=str(r_uuid),
            action="DELETE",
            changed_by_user_id=user_id,
            changed_by_name=user_name,
            ip_address=client_ip,
            note=f"Deleted shift roster {existing['code']} for {existing['employee_name']}",
            changes={"deleted_record": serialize_row(existing)},
        )

    return {
        "status": "success",
        "message": f"Shift roster {existing['code']} deleted successfully.",
        "id": str(r_uuid),
    }
