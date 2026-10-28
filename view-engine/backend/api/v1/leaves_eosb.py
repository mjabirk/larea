import uuid
import json
import datetime
import math
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query
from pydantic import BaseModel
from backend.core.database import get_db_pool, log_audit_event
from backend.core.dependencies import get_current_user_session, get_client_ip, require_permission, check_permission
from backend.api.v1.payroll import (
    can_read_salary,
    get_employee_salary_basis,
    compute_custom_basis,
    resolve_audit_author,
    serialize_row,
    sync_employee_adjustments_to_payslips,
)

router = APIRouter(prefix="/api/v1/hr", tags=["Leave Management & End of Service"])


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================
class LeaveTypePayload(BaseModel):
    id: str
    name: str
    max_days_per_year: Optional[int] = 21
    pay_percentage: Optional[float] = 100.0
    deduction_basis_rules: Optional[List[str]] = []
    requires_attachment: Optional[bool] = False
    is_active: Optional[bool] = True


class CreateLeaveRequestPayload(BaseModel):
    employee_id: str
    leave_type_id: str
    start_date: str  # Format: YYYY-MM-DD
    end_date: str  # Format: YYYY-MM-DD
    reason: Optional[str] = None


class ApproveLeavePayload(BaseModel):
    fast_track: Optional[bool] = False


class RejectLeavePayload(BaseModel):
    rejection_reason: str


# ==============================================================================
# 1. LEAVE TYPES CONFIGURATION (CRUD)
# ==============================================================================
@router.get("/leave-types")
async def list_leave_types(
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Lists all configured Qatar statutory and company leave types."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM leave_types ORDER BY is_active DESC, name ASC;")
        types = [serialize_row(dict(r)) for r in rows]
        return {"status": "success", "leave_types": types}


@router.post("/leave-types")
async def upsert_leave_type(
    payload: LeaveTypePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Creates or updates a leave policy type. Requires hr.salary_manage."""
    require_permission(session, "hr.salary_manage")
    clean_id = payload.id.strip().upper()
    if not clean_id or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Leave type ID and Name are required.")

    pool = get_db_pool()
    async with pool.acquire() as conn:
        ded_json = json.dumps(payload.deduction_basis_rules or [])
        await conn.execute("""
            INSERT INTO leave_types (
                id, name, max_days_per_year, pay_percentage,
                deduction_basis_rules, requires_attachment, is_active
            ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                max_days_per_year = EXCLUDED.max_days_per_year,
                pay_percentage = EXCLUDED.pay_percentage,
                deduction_basis_rules = EXCLUDED.deduction_basis_rules,
                requires_attachment = EXCLUDED.requires_attachment,
                is_active = EXCLUDED.is_active;
        """,
            clean_id, payload.name.strip(), int(payload.max_days_per_year or 21),
            float(payload.pay_percentage if payload.pay_percentage is not None else 100.0),
            ded_json, bool(payload.requires_attachment), bool(payload.is_active if payload.is_active is not None else True)
        )

        row = await conn.fetchrow("SELECT * FROM leave_types WHERE id = $1;", clean_id)
        return {
            "status": "success",
            "message": f"Leave type policy '{clean_id}' saved successfully.",
            "leave_type": serialize_row(dict(row)),
        }


@router.delete("/leave-types/{type_id}")
async def delete_leave_type(
    type_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Deletes an unused leave policy type. Requires hr.salary_manage."""
    require_permission(session, "hr.salary_manage")
    clean_id = type_id.strip().upper()
    pool = get_db_pool()
    async with pool.acquire() as conn:
        used_count = await conn.fetchval("SELECT COUNT(*) FROM leave_requests WHERE leave_type_id = $1;", clean_id)
        if used_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete leave type '{clean_id}' because it has {used_count} associated leave requests. Deactivate it instead."
            )

        deleted = await conn.execute("DELETE FROM leave_types WHERE id = $1;", clean_id)
        if deleted == "DELETE 0":
            raise HTTPException(status_code=404, detail="Leave type not found.")

        return {"status": "success", "message": f"Leave type '{clean_id}' removed."}


# ==============================================================================
# 2. LEAVE REQUESTS & 2-LEVEL WORKFLOW
# ==============================================================================
@router.get("/leaves")
async def list_leave_requests(
    employee_id: Optional[str] = Query(None),
    approval_status: Optional[str] = Query(None),
    leave_type_id: Optional[str] = Query(None),
    month: Optional[str] = Query(None),  # YYYY-MM
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Lists leave requests with multi-factor filtering and summary metrics.
    Strictly masks daily_deduction_rate and computed_deduction_qar if not can_read_salary.
    """
    pool = get_db_pool()
    can_read = can_read_salary(session)

    query = "SELECT * FROM leave_requests WHERE 1=1"
    params: List[Any] = []
    idx = 1

    if isinstance(employee_id, str) and employee_id.strip():
        try:
            e_uuid = uuid.UUID(employee_id.strip())
            query += f" AND employee_id = ${idx}::uuid"
            params.append(e_uuid)
            idx += 1
        except Exception:
            pass

    if isinstance(approval_status, str) and approval_status.strip() and approval_status.upper() != "ALL":
        query += f" AND approval_status = ${idx}"
        params.append(approval_status.strip().lower())
        idx += 1

    if isinstance(leave_type_id, str) and leave_type_id.strip() and leave_type_id.upper() != "ALL":
        query += f" AND leave_type_id = ${idx}"
        params.append(leave_type_id.strip().upper())
        idx += 1

    if isinstance(month, str) and month.strip():
        # Filter where start_date starts with YYYY-MM
        query += f" AND TO_CHAR(start_date, 'YYYY-MM') = ${idx}"
        params.append(month.strip())
        idx += 1

    if session.get("organization_id"):
        try:
            org_uuid = uuid.UUID(str(session.get("organization_id")).strip())
            query += f" AND (organization_id = ${idx}::uuid OR organization_id IS NULL)"
            params.append(org_uuid)
            idx += 1
        except Exception:
            pass

    if session.get("branch_id"):
        try:
            br_uuid = uuid.UUID(str(session.get("branch_id")).strip())
            query += f" AND (branch_id = ${idx}::uuid OR branch_id IS NULL)"
            params.append(br_uuid)
            idx += 1
        except Exception:
            pass

    query += " ORDER BY created_at DESC;"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        leaves = [serialize_row(dict(r)) for r in rows]

        pending_supervisor_count = sum(1 for l in leaves if l.get("approval_status") == "pending_supervisor")
        pending_hr_count = sum(1 for l in leaves if l.get("approval_status") == "pending_hr")
        approved_days_total = sum(int(l.get("total_days") or 0) for l in leaves if l.get("approval_status") == "approved")

        if can_read:
            approved_deduction_qar = round(
                sum(float(l.get("computed_deduction_qar") or 0.0) for l in leaves if l.get("approval_status") == "approved"),
                2
            )
        else:
            approved_deduction_qar = None

        # Mask individual row figures if unauthorized
        for l in leaves:
            if not can_read:
                l["daily_deduction_rate"] = None
                l["computed_deduction_qar"] = None

        return {
            "status": "success",
            "leaves": leaves,
            "summary": {
                "pending_supervisor_count": pending_supervisor_count,
                "pending_hr_count": pending_hr_count,
                "approved_days_total": approved_days_total,
                "approved_deduction_qar": approved_deduction_qar,
            }
        }


@router.post("/leaves")
async def create_leave_request(
    payload: CreateLeaveRequestPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Submits a new employee leave request. Automatically calculates total calendar days
    and server-side daily deduction rates if the selected policy is unpaid or half-pay.
    """
    pool = get_db_pool()
    can_read = can_read_salary(session)

    try:
        e_uuid = uuid.UUID(payload.employee_id.strip())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    try:
        start_dt = datetime.date.fromisoformat(payload.start_date.strip())
        end_dt = datetime.date.fromisoformat(payload.end_date.strip())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")

    if end_dt < start_dt:
        raise HTTPException(status_code=400, detail="End date must be on or after start date.")

    total_days = (end_dt - start_dt).days + 1
    clean_type_id = payload.leave_type_id.strip().upper()

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("SELECT * FROM employees WHERE id = $1;", e_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        ltype = await conn.fetchrow("SELECT * FROM leave_types WHERE id = $1 AND is_active = true;", clean_type_id)
        if not ltype:
            raise HTTPException(status_code=400, detail=f"Invalid or inactive leave policy '{clean_type_id}'.")

        user_id, author_name = await resolve_audit_author(conn, session)
        pay_pct = float(ltype["pay_percentage"] if ltype["pay_percentage"] is not None else 100.0)

        # Calculate salary deduction for unpaid or partially paid leave
        if pay_pct < 100.0:
            basis = await get_employee_salary_basis(conn, e_uuid)
            basis_val = compute_custom_basis(basis, ltype["deduction_basis_rules"])
            unpaid_ratio = (100.0 - pay_pct) / 100.0
            daily_deduction_rate = round((basis_val / 30.0) * unpaid_ratio, 2)
            computed_deduction_qar = round(daily_deduction_rate * total_days, 2)
        else:
            daily_deduction_rate = 0.0
            computed_deduction_qar = 0.0

        new_id = uuid.uuid4()
        now = datetime.datetime.now(datetime.timezone.utc)
        ym_code = now.strftime("%Y%m")
        code = f"LVE-{ym_code}-{new_id.hex[:6].upper()}"

        await conn.execute("""
            INSERT INTO leave_requests (
                id, code, employee_id, employee_number, employee_name, department,
                leave_type_id, leave_type_name, start_date, end_date, total_days,
                pay_percentage, daily_deduction_rate, computed_deduction_qar,
                approval_status, reason, submitted_by_name, organization_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14,
                'pending_supervisor', $15, $16, $17
            );
        """,
            new_id, code, e_uuid, emp["employee_number"], emp["full_name"], emp["department_id"],
            clean_type_id, ltype["name"], start_dt, end_dt, total_days,
            pay_pct, daily_deduction_rate, computed_deduction_qar,
            payload.reason, author_name, emp.get("organization_id")
        )

        client_ip = get_client_ip(request) if request else "127.0.0.1"
        await log_audit_event(
            conn=conn,
            entity_type="leave_requests",
            entity_id=new_id,
            action="CREATE",
            session=session,
            client_ip=client_ip,
            note=f"Submitted leave request {code} for {emp['full_name']} ({clean_type_id}, {total_days} days).",
            changes={
                "code": code,
                "leave_type_id": clean_type_id,
                "start_date": str(start_dt),
                "end_date": str(end_dt),
                "total_days": total_days,
                "computed_deduction_qar": computed_deduction_qar
            }
        )

        row = await conn.fetchrow("SELECT * FROM leave_requests WHERE id = $1;", new_id)
        resp_data = serialize_row(dict(row))
        if not can_read:
            resp_data["daily_deduction_rate"] = None
            resp_data["computed_deduction_qar"] = None

        return {
            "status": "success",
            "message": f"Leave request {code} submitted successfully and queued for Shift Supervisor review.",
            "leave": resp_data,
        }


@router.post("/leaves/{leave_id}/approve")
async def approve_leave_request(
    leave_id: str,
    payload: ApproveLeavePayload,
    request: Request = None,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    2-Level approval for leave requests.
    When approved and computed_deduction_qar > 0, automatically creates/syncs
    a deduction into payroll_adjustments and updates any draft monthly payslip.
    """
    try:
        l_uuid = uuid.UUID(leave_id.strip())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid leave request UUID.")

    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        async with conn.transaction():
            leave = await conn.fetchrow("SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE;", l_uuid)
            if not leave:
                raise HTTPException(status_code=404, detail="Leave request not found.")

            current_status = leave["approval_status"]
            if current_status == "approved":
                raise HTTPException(status_code=400, detail="Leave request is already fully approved.")
            if current_status == "rejected":
                raise HTTPException(status_code=400, detail="Cannot approve a rejected leave request.")

            user_id, author_name = await resolve_audit_author(conn, session)
            is_super = session.get("is_superadmin")
            has_manage = check_permission(session, "payroll.manage") or check_permission(session, "hr.salary_manage")
            can_approve_l1 = is_super or has_manage or check_permission(session, "employees.update") or check_permission(session, "attendances.approve")

            if not can_approve_l1:
                raise HTTPException(status_code=403, detail="Access denied: Supervisor or HR privileges required to approve leave requests.")

            # Fast-track check
            if payload.fast_track:
                if not is_super and not has_manage:
                    raise HTTPException(status_code=403, detail="Fast-track approval requires HR Director or Superadmin privileges.")
                new_status = "approved"
                l1_by = leave["level1_approved_by"] or author_name
                l2_by = author_name
            else:
                if current_status == "pending_supervisor":
                    new_status = "pending_hr"
                    l1_by = author_name
                    l2_by = leave["level2_approved_by"]
                elif current_status == "pending_hr":
                    if not is_super and not has_manage:
                        raise HTTPException(status_code=403, detail="Level-2 final approval requires HR Director or Payroll Manager privileges.")
                    new_status = "approved"
                    l1_by = leave["level1_approved_by"]
                    l2_by = author_name
                else:
                    new_status = "approved"
                    l1_by = leave["level1_approved_by"]
                    l2_by = author_name

            now = datetime.datetime.now(datetime.timezone.utc)
            await conn.execute("""
                UPDATE leave_requests SET
                    approval_status = $2::varchar,
                    level1_approved_by = $3,
                    level1_approved_at = CASE WHEN $2::varchar IN ('pending_hr', 'approved') AND level1_approved_at IS NULL THEN CURRENT_TIMESTAMP ELSE level1_approved_at END,
                    level2_approved_by = $4,
                    level2_approved_at = CASE WHEN $2::varchar = 'approved' THEN CURRENT_TIMESTAMP ELSE level2_approved_at END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1;
            """, l_uuid, new_status, l1_by, l2_by)

            # Automatic Payroll Deduction Sync on final approval
            if new_status == "approved" and float(leave["computed_deduction_qar"] or 0.0) > 0:
                start_date: datetime.date = leave["start_date"]
                salary_ym = start_date.strftime("%Y-%m")
                adj_code = f"ADJ-LVE-{leave['code']}"

                existing_adj = await conn.fetchrow("SELECT id FROM payroll_adjustments WHERE code = $1;", adj_code)
                if not existing_adj:
                    new_adj_id = uuid.uuid4()
                    await conn.execute("""
                        INSERT INTO payroll_adjustments (
                            id, code, employee_id, employee_number, employee_name, department,
                            salary_year_month, rule_id, adjustment_type, category_subtype, title,
                            calculation_basis, multiplier_pct, quantity, unit_label, unit_rate,
                            computed_amount, approval_status, submitted_by_name, level1_approved_by,
                            level1_approved_at, level2_approved_by, level2_approved_at, notes, organization_id
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6,
                            $7, $8, 'deduction', 'unpaid_leave', $9,
                            'daily_rate', 100.0, $10, 'Days', $11,
                            $12, 'approved', $13, $14,
                            CURRENT_TIMESTAMP, $15, CURRENT_TIMESTAMP, $16, $17
                        );
                    """,
                        new_adj_id, adj_code, leave["employee_id"], leave["employee_number"], leave["employee_name"],
                        leave["department"], salary_ym, leave["leave_type_id"],
                        f"Unpaid Leave Deduction ({leave['leave_type_name']})",
                        float(leave["total_days"]), float(leave["daily_deduction_rate"] or 0.0),
                        float(leave["computed_deduction_qar"] or 0.0),
                        author_name, l1_by or author_name, l2_by or author_name,
                        f"Leave deduction from Leave Request {leave['code']} ({leave['start_date']} to {leave['end_date']})",
                        leave.get("organization_id")
                    )
                else:
                    await conn.execute("""
                        UPDATE payroll_adjustments SET
                            quantity = $2,
                            unit_rate = $3,
                            computed_amount = $4,
                            approval_status = 'approved',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1;
                    """, existing_adj["id"], float(leave["total_days"]), float(leave["daily_deduction_rate"] or 0.0), float(leave["computed_deduction_qar"] or 0.0))

                # Synchronize to any existing draft payslip
                await sync_employee_adjustments_to_payslips(conn, leave["employee_id"], salary_ym)

            await log_audit_event(
                conn=conn,
                entity_type="leave_requests",
                entity_id=l_uuid,
                action="APPROVE",
                session=session,
                client_ip=client_ip,
                note=f"Leave request {leave['code']} updated to '{new_status}' by {author_name}.",
                changes={
                    "code": leave["code"],
                    "previous_status": current_status,
                    "new_status": new_status,
                    "leave_type": leave["leave_type_name"],
                    "total_days": float(leave["total_days"]),
                    "computed_deduction_qar": float(leave["computed_deduction_qar"] or 0.0)
                }
            )

            updated = await conn.fetchrow("SELECT * FROM leave_requests WHERE id = $1;", l_uuid)

    # Fire automated trigger if leave reached final 'approved' status (outside DB transaction)
    if new_status == "approved":
        try:
            from backend.core.communication_engine import execute_automation_trigger
            await execute_automation_trigger(
                event_type="leave_approved",
                record_model="hr.leave",
                record_id=str(l_uuid),
                record_data={
                    "employee_id": str(leave["employee_id"]),
                    "employee_name": leave["employee_name"],
                    "employee_number": leave["employee_number"],
                    "leave_type": leave["leave_type_name"],
                    "total_days": str(leave["total_days"]),
                    "start_date": str(leave["start_date"]),
                    "end_date": str(leave["end_date"]),
                    "approval_status": "APPROVED",
                    "remarks": leave.get("reason") or "Approved"
                },
                author_name=author_name
            )
        except Exception:
            pass

    resp_data = serialize_row(dict(updated))
    if not can_read_salary(session):
        resp_data["daily_deduction_rate"] = None
        resp_data["computed_deduction_qar"] = None

    return {
        "status": "success",
        "message": f"Leave request {leave['code']} updated to '{new_status}'.",
        "leave": resp_data,
    }


@router.post("/leaves/{leave_id}/reject")
async def reject_leave_request(
    leave_id: str,
    payload: RejectLeavePayload,
    request: Request = None,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Rejects a leave request and records rejection audit notes."""
    try:
        l_uuid = uuid.UUID(leave_id.strip())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid leave request UUID.")

    if not payload.rejection_reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required to reject a leave request.")

    client_ip = get_client_ip(request) if request else "127.0.0.1"
    pool = get_db_pool()
    async with pool.acquire() as conn:
        leave = await conn.fetchrow("SELECT * FROM leave_requests WHERE id = $1;", l_uuid)
        if not leave:
            raise HTTPException(status_code=404, detail="Leave request not found.")

        if leave["approval_status"] == "approved":
            raise HTTPException(status_code=400, detail="Cannot reject a previously approved leave request.")

        user_id, author_name = await resolve_audit_author(conn, session)

        await conn.execute("""
            UPDATE leave_requests SET
                approval_status = 'rejected',
                rejection_reason = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """, l_uuid, payload.rejection_reason.strip())

        await log_audit_event(
            conn=conn,
            entity_type="leave_requests",
            entity_id=l_uuid,
            action="REJECT",
            session=session,
            client_ip=client_ip,
            note=f"Leave request {leave['code']} rejected by {author_name}. Reason: {payload.rejection_reason.strip()}",
            changes={
                "code": leave["code"],
                "previous_status": leave["approval_status"],
                "new_status": "rejected",
                "rejection_reason": payload.rejection_reason.strip()
            }
        )

        # Fire automated trigger for leave_rejected
        try:
            from backend.core.communication_engine import execute_automation_trigger
            await execute_automation_trigger(
                event_type="leave_rejected",
                record_model="hr.leave",
                record_id=str(l_uuid),
                record_data={
                    "employee_id": str(leave["employee_id"]),
                    "employee_name": leave["employee_name"],
                    "employee_number": leave["employee_number"],
                    "leave_type": leave["leave_type_name"],
                    "total_days": str(leave["total_days"]),
                    "start_date": str(leave["start_date"]),
                    "end_date": str(leave["end_date"]),
                    "approval_status": "REJECTED",
                    "rejection_reason": payload.rejection_reason.strip()
                },
                author_name=author_name
            )
        except Exception as e:
            pass

        return {"status": "success", "message": f"Leave request {leave['code']} has been rejected."}


@router.delete("/leaves/{leave_id}")
async def delete_leave_request(
    leave_id: str,
    request: Request = None,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Deletes an unapproved or rejected leave request."""
    try:
        l_uuid = uuid.UUID(leave_id.strip())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid leave request UUID.")

    client_ip = get_client_ip(request) if request else "127.0.0.1"
    pool = get_db_pool()
    async with pool.acquire() as conn:
        leave = await conn.fetchrow("SELECT * FROM leave_requests WHERE id = $1;", l_uuid)
        if not leave:
            raise HTTPException(status_code=404, detail="Leave request not found.")

        if leave["approval_status"] == "approved":
            raise HTTPException(status_code=400, detail="Cannot delete an approved leave request. Contact HR to reverse.")

        await conn.execute("DELETE FROM leave_requests WHERE id = $1;", l_uuid)

        await log_audit_event(
            conn=conn,
            entity_type="leave_requests",
            entity_id=l_uuid,
            action="DELETE",
            session=session,
            client_ip=client_ip,
            note=f"Deleted leave request {leave['code']}.",
            changes={"deleted_leave_id": str(l_uuid), "code": leave["code"]}
        )

        return {"status": "success", "message": f"Leave request {leave['code']} deleted."}


# ==============================================================================
# 3. END-OF-SERVICE GRATUITY (EOSB) & FINAL SETTLEMENT CALCULATOR
# ==============================================================================
@router.get("/eosb/summary")
async def get_eosb_summary(
    as_of_date: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Computes company-wide or department End-of-Service Gratuity (EOSB) liability
    and leave encashment balances in full compliance with Qatar Labour Law Art. 54 & Art. 79.
    Masks all QAR monetary values if not can_read_salary.
    """
    pool = get_db_pool()
    can_read = can_read_salary(session)

    if isinstance(as_of_date, str) and as_of_date.strip():
        try:
            target_date = datetime.date.fromisoformat(as_of_date.strip())
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid as_of_date. Format must be YYYY-MM-DD.")
    else:
        target_date = datetime.date.today()

    async with pool.acquire() as conn:
        # Check if custom EOSB config exists in system_metadata
        meta_row = await conn.fetchrow("SELECT value FROM system_metadata WHERE key = 'cfg:qatar_hr_config';")
        hr_cfg = {}
        if meta_row and meta_row["value"]:
            try:
                hr_cfg = json.loads(meta_row["value"])
            except Exception:
                pass
        eosb_tier1_days = float(hr_cfg.get("eosb_days_per_year", 21.0))
        eosb_tier2_days = float(hr_cfg.get("eosb_tier2_days_per_year", 28.0))

        # Build employee query
        query = "SELECT id, employee_number, full_name, department_id, hire_date, base_salary, status FROM employees WHERE 1=1"
        params: List[Any] = []
        idx = 1

        if isinstance(employee_id, str) and employee_id.strip():
            try:
                e_uuid = uuid.UUID(employee_id.strip())
                query += f" AND id = ${idx}::uuid"
                params.append(e_uuid)
                idx += 1
            except Exception:
                pass

        if isinstance(department, str) and department.strip() and department.upper() != "ALL":
            query += f" AND department_id = ${idx}"
            params.append(department.strip())
            idx += 1

        if session.get("organization_id"):
            try:
                org_uuid = uuid.UUID(str(session.get("organization_id")).strip())
                query += f" AND (organization_id = ${idx}::uuid OR organization_id IS NULL)"
                params.append(org_uuid)
                idx += 1
            except Exception:
                pass

        if session.get("branch_id"):
            try:
                br_uuid = uuid.UUID(str(session.get("branch_id")).strip())
                query += f" AND (branch_id = ${idx}::uuid OR branch_id IS NULL)"
                params.append(br_uuid)
                idx += 1
            except Exception:
                pass

        query += " ORDER BY department_id ASC, employee_number ASC;"
        emp_rows = await conn.fetch(query, *params)

        # Approved annual leave taken by each employee
        leave_taken_rows = await conn.fetch("""
            SELECT employee_id, COALESCE(SUM(total_days), 0) as total_annual_taken
            FROM leave_requests
            WHERE leave_type_id = 'LEAVE_ANNUAL' AND approval_status = 'approved'
            GROUP BY employee_id;
        """)
        leave_taken_map = {str(r["employee_id"]): int(r["total_annual_taken"]) for r in leave_taken_rows}

        records = []
        total_eosb_liability = 0.0
        total_leave_encashment_liability = 0.0
        eligible_count = 0

        for emp in emp_rows:
            emp_id_str = str(emp["id"])
            hire_dt: Optional[datetime.date] = emp["hire_date"]
            if not hire_dt:
                hire_dt = datetime.date(2023, 1, 1)

            service_days = max(0, (target_date - hire_dt).days)
            service_years = round(service_days / 365.25, 2)

            # Tenure breakdown: Years, Months, Days
            t_years = int(service_days // 365.25)
            rem_days = service_days - int(t_years * 365.25)
            t_months = int(rem_days // 30.4375)
            t_days = int(rem_days - int(t_months * 30.4375))
            tenure_formatted = f"{t_years}y {t_months}m {t_days}d"

            # Eligibility: 1 continuous year per Qatar Labour Law Art. 54
            is_eligible = service_days >= 365
            if is_eligible:
                eligible_count += 1

            # Gratuity days calculation
            if is_eligible:
                if service_years < 5.0:
                    accrued_gratuity_days = round((service_days / 365.25) * eosb_tier1_days, 2)
                else:
                    # Qatar Art. 54 base: 21 days for first 5 yrs + 28 days for tenure beyond 5 yrs (or flat 21 if tier2 not set)
                    base_5 = 5.0 * eosb_tier1_days
                    beyond_5 = (service_years - 5.0) * eosb_tier2_days
                    accrued_gratuity_days = round(base_5 + beyond_5, 2)
            else:
                accrued_gratuity_days = 0.0

            sal_basis = await get_employee_salary_basis(conn, emp["id"])
            base_sal = float(sal_basis.get("base_salary") or emp["base_salary"] or 0.0)
            daily_wage = round(base_sal / 30.0, 2)
            eosb_amount = round(daily_wage * accrued_gratuity_days, 2)

            # Annual leave entitlement per Art. 79 (21 days for < 5 yrs; 28 days for >= 5 yrs)
            annual_rate = 28 if service_years >= 5.0 else 21
            accrued_annual_leave = round((service_days / 365.25) * annual_rate, 1)
            taken_annual_leave = leave_taken_map.get(emp_id_str, 0)
            unused_leave_days = max(0.0, round(accrued_annual_leave - taken_annual_leave, 1))
            leave_encashment_amount = round(daily_wage * unused_leave_days, 2)

            net_settlement = round(eosb_amount + leave_encashment_amount, 2)

            if is_eligible:
                total_eosb_liability += eosb_amount
                total_leave_encashment_liability += leave_encashment_amount

            records.append({
                "employee_id": emp_id_str,
                "employee_number": emp["employee_number"],
                "employee_name": emp["full_name"],
                "department": emp["department_id"] or "General",
                "status": emp["status"],
                "hire_date": hire_dt.isoformat(),
                "as_of_date": target_date.isoformat(),
                "service_days": service_days,
                "service_years": service_years,
                "tenure_formatted": tenure_formatted,
                "is_eligible": is_eligible,
                "accrued_gratuity_days": accrued_gratuity_days,
                "accrued_annual_leave_days": accrued_annual_leave,
                "taken_annual_leave_days": taken_annual_leave,
                "unused_leave_days": unused_leave_days,
                "base_salary": base_sal if can_read else None,
                "daily_wage": daily_wage if can_read else None,
                "eosb_amount_qar": eosb_amount if can_read else None,
                "leave_encashment_qar": leave_encashment_amount if can_read else None,
                "net_settlement_qar": net_settlement if can_read else None,
            })

        total_settlement = round(total_eosb_liability + total_leave_encashment_liability, 2)

        return {
            "status": "success",
            "as_of_date": target_date.isoformat(),
            "records": records,
            "summary": {
                "total_active_employees": len(emp_rows),
                "eligible_employees_count": eligible_count,
                "total_eosb_liability_qar": round(total_eosb_liability, 2) if can_read else None,
                "total_leave_encashment_qar": round(total_leave_encashment_liability, 2) if can_read else None,
                "total_settlement_liability_qar": total_settlement if can_read else None,
            }
        }


@router.get("/eosb/employees/{employee_id}/settlement")
async def get_employee_settlement_statement(
    employee_id: str,
    termination_date: Optional[str] = Query(None),
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Generates an official Qatar Labour Law End-of-Service Final Settlement & Clearance Statement.
    Masks salary and monetary disbursement fields if not can_read_salary.
    """
    try:
        e_uuid = uuid.UUID(employee_id.strip())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    pool = get_db_pool()
    can_read = can_read_salary(session)

    if isinstance(termination_date, str) and termination_date.strip():
        try:
            term_date = datetime.date.fromisoformat(termination_date.strip())
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid termination_date format (YYYY-MM-DD).")
    else:
        term_date = datetime.date.today()

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("""
            SELECT e.*, o.legal_name as org_name, o.tax_id as org_cr
            FROM employees e
            LEFT JOIN organizations o ON e.organization_id = o.id
            WHERE e.id = $1;
        """, e_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        hire_dt: Optional[datetime.date] = emp["hire_date"] or datetime.date(2023, 1, 1)
        service_days = max(0, (term_date - hire_dt).days)
        service_years = round(service_days / 365.25, 2)

        t_years = int(service_days // 365.25)
        rem_days = service_days - int(t_years * 365.25)
        t_months = int(rem_days // 30.4375)
        t_days = int(rem_days - int(t_months * 30.4375))

        is_eligible = service_days >= 365

        # Check if custom EOSB config exists in system_metadata
        meta_row = await conn.fetchrow("SELECT value FROM system_metadata WHERE key = 'cfg:qatar_hr_config';")
        hr_cfg = {}
        if meta_row and meta_row["value"]:
            try:
                hr_cfg = json.loads(meta_row["value"])
            except Exception:
                pass
        eosb_tier1_days = float(hr_cfg.get("eosb_days_per_year", 21.0))
        eosb_tier2_days = float(hr_cfg.get("eosb_tier2_days_per_year", 28.0))

        # Qatar Art. 54 calculation
        if is_eligible:
            if service_years < 5.0:
                accrued_gratuity_days = round((service_days / 365.25) * eosb_tier1_days, 2)
            else:
                base_5 = 5.0 * eosb_tier1_days
                beyond_5 = (service_years - 5.0) * eosb_tier2_days
                accrued_gratuity_days = round(base_5 + beyond_5, 2)
        else:
            accrued_gratuity_days = 0.0

        sal_basis = await get_employee_salary_basis(conn, emp["id"])
        base_sal = float(sal_basis.get("base_salary") or emp["base_salary"] or 0.0)
        daily_wage = round(base_sal / 30.0, 2)
        eosb_amount = round(daily_wage * accrued_gratuity_days, 2)

        # Annual leave taken
        leave_taken = await conn.fetchval("""
            SELECT COALESCE(SUM(total_days), 0)
            FROM leave_requests
            WHERE employee_id = $1 AND leave_type_id = 'LEAVE_ANNUAL' AND approval_status = 'approved';
        """, e_uuid) or 0

        annual_rate = 28 if service_years >= 5.0 else 21
        accrued_annual_leave = round((service_days / 365.25) * annual_rate, 1)
        unused_leave_days = max(0.0, round(accrued_annual_leave - leave_taken, 1))
        leave_encashment_amount = round(daily_wage * unused_leave_days, 2)

        # Pending deductions or loans
        pending_loans = await conn.fetchval("""
            SELECT COALESCE(SUM(computed_amount), 0)
            FROM payroll_adjustments
            WHERE employee_id = $1 AND adjustment_type = 'deduction' AND category_subtype = 'loan_installment' AND approval_status = 'approved';
        """, e_uuid) or 0.0
        outstanding_loan_deduction = float(pending_loans)

        net_settlement = round(eosb_amount + leave_encashment_amount - outstanding_loan_deduction, 2)
        if net_settlement < 0:
            net_settlement = 0.0

        return {
            "status": "success",
            "statement": {
                "statement_number": f"EOSB-{term_date.strftime('%Y%m')}-{emp['employee_number']}",
                "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "employer_name": emp["org_name"] or "International Corporate Group",
                "cr_number": emp["org_cr"] or "CR-984210-QA",
                "employee": {
                    "id": str(emp["id"]),
                    "employee_number": emp["employee_number"],
                    "full_name": emp["full_name"],
                    "national_id_number": emp["national_id_number"],
                    "nationality": emp["nationality"],
                    "job_title": emp["job_title"],
                    "department": emp["department_id"],
                    "bank_name": emp["bank_name"],
                    "bank_iban": emp["bank_iban"],
                },
                "service_tenure": {
                    "hire_date": hire_dt.isoformat(),
                    "termination_date": term_date.isoformat(),
                    "total_service_days": service_days,
                    "service_years": service_years,
                    "tenure_formatted": f"{t_years} Years, {t_months} Months, {t_days} Days",
                    "is_statutorily_eligible": is_eligible,
                    "policy_basis": "Company End-of-Service & Leave Policy",
                },
                "calculation_breakdown": {
                    "basic_monthly_salary": base_sal if can_read else None,
                    "daily_wage_basis": daily_wage if can_read else None,
                    "accrued_gratuity_days": accrued_gratuity_days,
                    "eosb_gratuity_amount": eosb_amount if can_read else None,
                    "accrued_annual_leave_days": accrued_annual_leave,
                    "annual_leave_taken_days": leave_taken,
                    "unused_leave_days": unused_leave_days,
                    "leave_encashment_amount": leave_encashment_amount if can_read else None,
                    "outstanding_deductions_amount": outstanding_loan_deduction if can_read else None,
                    "net_settlement_payable": net_settlement if can_read else None,
                }
            }
        }
