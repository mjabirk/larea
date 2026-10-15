import uuid
import json
import datetime
import re
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query, Response
from pydantic import BaseModel
from backend.core.database import get_db_pool
from backend.core.dependencies import get_current_user_session, get_client_ip, require_permission, check_permission

logger = logging.getLogger("payroll")

router = APIRouter(prefix="/api/v1/payroll", tags=["Qatar Payroll & WPS Engine"])


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


async def resolve_audit_author(conn, session: Dict[str, Any]) -> tuple:
    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            parsed_id = uuid.UUID(str(uid_str))
            exists = await conn.fetchval("SELECT id FROM users WHERE id = $1;", parsed_id)
            if exists:
                user_id = parsed_id
        except Exception:
            pass
    author_name = session.get("full_name") or session.get("username") or "Authorized User"
    return user_id, author_name


def can_read_salary(session: Dict[str, Any]) -> bool:
    """Returns True if the authenticated session holds salary reading permissions or superadmin."""
    if not session:
        return False
    if session.get("is_superadmin"):
        return True
    return bool(check_permission(session, "hr.salary_read") or check_permission(session, "hr.salary_manage"))


async def get_employee_salary_basis(conn, employee_id: uuid.UUID) -> Dict[str, Any]:
    """
    Returns {"base_salary": float, "housing_allowance": float, "allowances_by_rule": Dict[str, float]}
    by checking employee's active contract in employee_contracts + contract_benefit_lines,
    falling back to employees.base_salary and 25% housing if no active contract.
    """
    contract = await conn.fetchrow("""
        SELECT id, wage_base
        FROM employee_contracts
        WHERE employee_id = $1 AND LOWER(status) = 'active'
        ORDER BY created_at DESC LIMIT 1;
    """, employee_id)

    allowances_by_rule: Dict[str, float] = {}
    housing_allowance = 0.0

    if contract:
        base_salary = float(contract["wage_base"] or 0.0)
        benefit_rows = await conn.fetch("""
            SELECT cbl.rule_id, cbl.computed_monthly_total, sr.wps_code
            FROM contract_benefit_lines cbl
            JOIN salary_rules sr ON cbl.rule_id = sr.id
            WHERE cbl.contract_id = $1;
        """, contract["id"])
        for r in benefit_rows:
            amt = float(r["computed_monthly_total"] or 0.0)
            r_id = r["rule_id"]
            allowances_by_rule[r_id] = round(amt, 2)
            if r["wps_code"] == "HOUSING" or "HOUSING" in r_id.upper():
                housing_allowance += amt
    else:
        emp = await conn.fetchrow("SELECT base_salary FROM employees WHERE id = $1;", employee_id)
        base_salary = float(emp["base_salary"] or 0.0) if emp else 0.0
        housing_allowance = round(base_salary * 0.25, 2)
        allowances_by_rule["ALW_HOUSING"] = housing_allowance

    return {
        "base_salary": round(base_salary, 2),
        "housing_allowance": round(housing_allowance, 2),
        "allowances_by_rule": allowances_by_rule,
    }


def compute_custom_basis(basis_data: Dict[str, Any], included_rules: Any) -> float:
    """
    Sums base_salary + sum(allowances_by_rule.get(r_id, 0.0) for r_id in included_rules).
    Falls back to housing_allowance if 'ALW_HOUSING' is included but not in allowances_by_rule.
    """
    base = float(basis_data.get("base_salary") or 0.0)
    alws = basis_data.get("allowances_by_rule") or {}
    total = base

    rule_list = []
    if isinstance(included_rules, list):
        rule_list = included_rules
    elif isinstance(included_rules, str):
        try:
            parsed = json.loads(included_rules)
            if isinstance(parsed, list):
                rule_list = parsed
        except Exception:
            pass

    for r_id in rule_list:
        if r_id in alws:
            total += float(alws[r_id] or 0.0)
        elif (r_id == "ALW_HOUSING" or "HOUSING" in str(r_id).upper()) and "ALW_HOUSING" not in alws:
            total += float(basis_data.get("housing_allowance") or 0.0)

    return round(total, 2)


async def update_batch_totals_from_payslips(conn, batch_id: uuid.UUID):
    """Recalculates payroll_batches summary aggregates from all member payslips."""
    row = await conn.fetchrow("""
        SELECT
            COUNT(*) as total_employees,
            COALESCE(SUM(base_salary), 0) as total_base,
            COALESCE(SUM(housing_allowance + transport_allowance + other_allowances + task_benefit_pay + bonus_pay), 0) as total_allowances,
            COALESCE(SUM(deductions), 0) as total_deductions,
            COALESCE(SUM(overtime_pay), 0) as total_overtime,
            COALESCE(SUM(net_salary), 0) as total_net
        FROM payslips
        WHERE batch_id = $1;
    """, batch_id)

    await conn.execute("""
        UPDATE payroll_batches SET
            total_employees = $2,
            total_base_salary = $3,
            total_allowances = $4,
            total_deductions = $5,
            total_overtime_pay = $6,
            total_net_salary = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
    """,
        batch_id,
        int(row["total_employees"] or 0),
        round(float(row["total_base"] or 0.0), 2),
        round(float(row["total_allowances"] or 0.0), 2),
        round(float(row["total_deductions"] or 0.0), 2),
        round(float(row["total_overtime"] or 0.0), 2),
        round(float(row["total_net"] or 0.0), 2),
    )


async def sync_employee_adjustments_to_payslips(conn, employee_id: uuid.UUID, ym: str):
    """
    Aggregates approved payroll_adjustments for employee_id and ym,
    and updates any draft payslip for that employee in that month.
    """
    payslip = await conn.fetchrow("""
        SELECT p.*, b.status as batch_status
        FROM payslips p
        JOIN payroll_batches b ON p.batch_id = b.id
        WHERE p.employee_id = $1 AND b.salary_year_month = $2 AND b.status = 'draft';
    """, employee_id, ym)

    if not payslip:
        return None

    # Fetch all approved adjustments for this employee and month
    adjs = await conn.fetch("""
        SELECT * FROM payroll_adjustments
        WHERE employee_id = $1 AND salary_year_month = $2 AND approval_status = 'approved'
        ORDER BY created_at ASC;
    """, employee_id, ym)

    ot_hours = 0.0
    ot_pay = 0.0
    task_benefit_pay = 0.0
    bonus_pay = 0.0
    loan_ded = 0.0
    penalty_ded = 0.0
    other_ded = 0.0
    unpaid_days = 0.0
    breakdown = []

    for a in adjs:
        a_type = a["adjustment_type"]
        sub = a["category_subtype"]
        amt = float(a["computed_amount"] or 0.0)
        qty = float(a["quantity"] or 0.0)
        rate = float(a["unit_rate"] or 0.0)

        breakdown.append({
            "id": str(a["id"]),
            "code": a["code"],
            "rule_id": a.get("rule_id"),
            "type": a_type,
            "subtype": sub,
            "title": a["title"],
            "quantity": qty,
            "unit_label": a["unit_label"],
            "unit_rate": rate,
            "amount": amt,
            "notes": a["notes"]
        })

        if a_type == "overtime":
            ot_hours += qty
            ot_pay += amt
        elif a_type == "task_benefit":
            task_benefit_pay += amt
        elif a_type == "bonus":
            bonus_pay += amt
        elif a_type == "deduction":
            if sub == "loan_installment":
                loan_ded += amt
            elif sub == "disciplinary_fine":
                penalty_ded += amt
            elif sub == "unpaid_leave":
                other_ded += amt
                unpaid_days += qty
            else:
                other_ded += amt

    # Baseline contract deductions
    contract_deductions = 0.0
    contract = await conn.fetchrow("""
        SELECT id FROM employee_contracts
        WHERE employee_id = $1 AND LOWER(status) = 'active'
        ORDER BY created_at DESC LIMIT 1;
    """, employee_id)
    if contract:
        cd = await conn.fetchval("""
            SELECT COALESCE(SUM(cbl.computed_monthly_total), 0)
            FROM contract_benefit_lines cbl
            JOIN salary_rules sr ON cbl.rule_id = sr.id
            WHERE cbl.contract_id = $1 AND sr.category = 'deduction';
        """, contract["id"]) or 0.0
        contract_deductions = float(cd)

    total_deductions = round(contract_deductions + loan_ded + penalty_ded + other_ded, 2)
    base_sal = float(payslip["base_salary"] or 0.0)
    housing = float(payslip["housing_allowance"] or 0.0)
    transport = float(payslip["transport_allowance"] or 0.0)
    other_alw = float(payslip["other_allowances"] or 0.0)

    net_sal = round(
        base_sal + housing + transport + other_alw + ot_pay + bonus_pay + task_benefit_pay - total_deductions,
        2
    )
    if net_sal < 0:
        net_sal = 0.0

    working_days = max(0, 30 - int(unpaid_days)) if unpaid_days > 0 else (payslip["working_days"] or 30)

    await conn.execute("""
        UPDATE payslips SET
            working_days = $2,
            overtime_hours = $3,
            overtime_pay = $4,
            task_benefit_pay = $5,
            bonus_pay = $6,
            loan_deduction = $7,
            penalty_deduction = $8,
            other_deductions = $9,
            deductions = $10,
            net_salary = $11,
            adjustments_breakdown = $12::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
    """,
        payslip["id"], working_days, round(ot_hours, 2), round(ot_pay, 2), round(task_benefit_pay, 2),
        round(bonus_pay, 2), round(loan_ded, 2), round(penalty_ded, 2), round(other_ded, 2),
        total_deductions, net_sal, json.dumps(breakdown)
    )

    await update_batch_totals_from_payslips(conn, payslip["batch_id"])
    return payslip["id"]


# ==============================================================================
# REQUEST & RESPONSE MODELS
# ==============================================================================
class CreateBatchPayload(BaseModel):
    salary_year_month: str  # Format: YYYY-MM (e.g. 2026-10)
    title: Optional[str] = None


class UpdatePayslipPayload(BaseModel):
    working_days: Optional[int] = None
    overtime_hours: Optional[float] = None
    overtime_pay: Optional[float] = None
    other_allowances: Optional[float] = None
    deductions: Optional[float] = None
    notes: Optional[str] = None


class TaskRateRulePayload(BaseModel):
    id: str
    name: str
    entry_type: str  # 'overtime', 'task_benefit', 'bonus', 'deduction'
    unit_label: Optional[str] = "Units"
    default_unit_rate: Optional[float] = 0.0
    ot_calculation_basis: Optional[str] = "basic_only"  # 'basic_only', 'basic_plus_housing'
    ot_multiplier_pct: Optional[float] = 125.0
    calculation_mode: Optional[str] = "hourly_multiplier"  # 'hourly_multiplier', 'piece_rate', 'daily_rate', 'percentage_of_basis', 'fixed_amount'
    included_benefit_rules: Optional[List[str]] = []
    subtype: Optional[str] = "general"
    is_active: Optional[bool] = True


class CreateAdjustmentPayload(BaseModel):
    employee_id: str
    salary_year_month: str
    rule_id: str
    quantity: Optional[float] = 1.0
    computed_amount: Optional[float] = 0.0
    notes: Optional[str] = None
    # Optional parameters for backwards compatibility / metadata
    adjustment_type: Optional[str] = None
    category_subtype: Optional[str] = None
    title: Optional[str] = None
    calculation_basis: Optional[str] = None
    multiplier_pct: Optional[float] = None
    unit_label: Optional[str] = None
    unit_rate: Optional[float] = None


class ApproveAdjustmentPayload(BaseModel):
    fast_track: Optional[bool] = False


class RejectAdjustmentPayload(BaseModel):
    rejection_reason: str


# ==============================================================================
# 1. PAYROLL BATCHES CRUD & LOCKING
# ==============================================================================
@router.get("/batches")
async def list_payroll_batches(
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """List all payroll batches ordered by salary year-month descending."""
    require_permission(session, "payroll.read")
    pool = get_db_pool()
    org_id = session.get("organization_id")

    query = """
        SELECT b.*,
               COUNT(p.id) as total_payslips_count,
               COUNT(CASE WHEN p.wps_status = 'ready' THEN 1 END) as wps_ready_count
        FROM payroll_batches b
        LEFT JOIN payslips p ON p.batch_id = b.id
        WHERE 1=1
    """
    params: List[Any] = []
    if not session.get("is_superadmin") and org_id:
        query += " AND b.organization_id = $1::uuid"
        params.append(org_id)

    query += " GROUP BY b.id ORDER BY b.salary_year_month DESC, b.created_at DESC;"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        batches = [serialize_row(dict(r)) for r in rows]
        return {"batches": batches, "total": len(batches)}


@router.post("/batches")
async def create_payroll_batch(
    payload: CreateBatchPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Creates a new payroll batch for the given salary_year_month (e.g. 2026-10)
    and automatically computes payslips for all Active employees using contract benefit lines,
    verified attendance hours, and approved variable payroll adjustments.
    Wrapped in database transaction.
    """
    require_permission(session, "payroll.manage")
    ym = payload.salary_year_month.strip()
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", ym):
        raise HTTPException(
            status_code=400,
            detail="Invalid salary_year_month format. Must be YYYY-MM (e.g. 2026-10).",
        )

    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        async with conn.transaction():
            user_id, author_name = await resolve_audit_author(conn, session)
            org_id = session.get("organization_id")
            org_uuid = None
            if org_id:
                try:
                    org_uuid = uuid.UUID(str(org_id))
                except Exception:
                    pass
            if not org_uuid:
                org_uuid = await conn.fetchval("SELECT id FROM organizations LIMIT 1;")

            # Generate unique batch code
            existing_count = await conn.fetchval(
                "SELECT COUNT(*) FROM payroll_batches WHERE salary_year_month = $1;", ym
            ) or 0
            if existing_count == 0:
                batch_code = f"PAY-{ym}"
            else:
                batch_code = f"PAY-{ym}-{existing_count + 1:02d}"

            title = payload.title.strip() if payload.title and payload.title.strip() else f"Payroll - {ym}"
            batch_id = uuid.uuid4()

            # Insert initial batch row
            await conn.execute("""
                INSERT INTO payroll_batches (
                    id, batch_code, title, salary_year_month, status,
                    currency, organization_id, created_by_name
                ) VALUES (
                    $1, $2, $3, $4, 'draft', 'QAR', $5, $6
                );
            """, batch_id, batch_code, title, ym, org_uuid, author_name)

            # Retrieve all Active employees for this organization
            emp_query = "SELECT * FROM employees WHERE LOWER(status) = 'active'"
            emp_params: List[Any] = []
            if org_uuid and not session.get("is_superadmin"):
                emp_query += " AND organization_id = $1::uuid"
                emp_params.append(org_uuid)
            emp_query += " ORDER BY employee_number ASC;"

            employees = await conn.fetch(emp_query, *emp_params)

            for emp in employees:
                e_id = emp["id"]

                # 1. Check for Active Contract in employee_contracts
                contract = await conn.fetchrow("""
                    SELECT id, wage_base, working_hours_per_week
                    FROM employee_contracts
                    WHERE employee_id = $1 AND LOWER(status) = 'active'
                    ORDER BY created_at DESC LIMIT 1;
                """, e_id)

                housing_allowance = 0.0
                transport_allowance = 0.0
                other_allowances = 0.0
                contract_deductions = 0.0

                if contract:
                    base_salary = float(contract["wage_base"] or 0.0)
                    benefit_lines = await conn.fetch("""
                        SELECT cbl.amount_value, cbl.computed_monthly_total, sr.category, sr.wps_code, sr.id as rule_id
                        FROM contract_benefit_lines cbl
                        JOIN salary_rules sr ON cbl.rule_id = sr.id
                        WHERE cbl.contract_id = $1;
                    """, contract["id"])

                    for bl in benefit_lines:
                        amt = float(bl["computed_monthly_total"] or 0.0)
                        wps_code = str(bl.get("wps_code") or "").upper()
                        rule_id = str(bl.get("rule_id") or "").upper()
                        cat = str(bl.get("category") or "").lower()

                        if wps_code == "HOUSING" or "HOUSING" in rule_id:
                            housing_allowance += amt
                        elif wps_code == "TRANSPORT" or "TRANSPORT" in rule_id:
                            transport_allowance += amt
                        elif cat == "allowance":
                            other_allowances += amt
                        elif cat == "deduction":
                            contract_deductions += amt
                else:
                    base_salary = float(emp["base_salary"] or 0.0)

                # 2. Query verified attendance hours for this employee in this month
                verified_hours_val = await conn.fetchval("""
                    SELECT COALESCE(SUM(duration_hours), 0)
                    FROM attendance_logs
                    WHERE employee_id = $1 AND TO_CHAR(check_in, 'YYYY-MM') = $2;
                """, e_id, ym) or 0.0
                verified_attendance_hours = round(float(verified_hours_val), 2)

                working_days = 30
                overtime_hours = 0.0
                overtime_pay = 0.0

                # 3. Check WPS compliance status
                clean_iban = str(emp["bank_iban"] or "").strip().upper()
                has_valid_iban = clean_iban.startswith("QA") and len(clean_iban) >= 29
                qid = str(emp["national_id_number"] or "").strip()
                visa = str(emp["visa_number"] or "").strip()
                has_valid_id = bool(qid or visa)

                wps_status = "ready" if (has_valid_iban and has_valid_id) else "missing_bank_or_id"

                net_salary = round(
                    base_salary + housing_allowance + transport_allowance + other_allowances - contract_deductions,
                    2
                )
                if net_salary < 0:
                    net_salary = 0.0

                # 4. Insert initial payslip
                payslip_id = uuid.uuid4()
                await conn.execute("""
                    INSERT INTO payslips (
                        id, batch_id, employee_id, employee_number, employee_name, department,
                        job_title, national_id_number, visa_number, bank_name, bank_swift, bank_iban,
                        working_days, verified_attendance_hours, overtime_hours, base_salary,
                        housing_allowance, transport_allowance, other_allowances, overtime_pay,
                        deductions, net_salary, bonus_pay, task_benefit_pay, loan_deduction,
                        penalty_deduction, other_deductions, adjustments_breakdown, wps_status, notes
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10, $11, $12,
                        $13, $14, $15, $16,
                        $17, $18, $19, $20,
                        $21, $22, 0, 0, 0,
                        0, 0, '[]'::jsonb, $23, $24
                    );
                """,
                    payslip_id, batch_id, e_id, emp["employee_number"], emp["full_name"], emp["department_id"],
                    emp["job_title"], qid or None, visa or None, emp["bank_name"], emp["bank_swift"], clean_iban or None,
                    working_days, verified_attendance_hours, overtime_hours, base_salary,
                    housing_allowance, transport_allowance, other_allowances, overtime_pay,
                    contract_deductions, net_salary, wps_status, f"Computed from active contract and {ym} attendance."
                )

                # 5. Synchronize any pre-approved payroll adjustments for this month
                await sync_employee_adjustments_to_payslips(conn, e_id, ym)

            # 6. Recalculate batch totals from member payslips
            await update_batch_totals_from_payslips(conn, batch_id)

            # 7. Audit log creation
            await conn.execute("""
                INSERT INTO audit_logs (
                    id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, note, ip_address
                ) VALUES (
                    $1::uuid, 'payroll_batches', $2, 'CREATE', $3, $4, $5, $6
                );
            """, str(uuid.uuid4()), str(batch_id), user_id, author_name,
                f"Generated payroll batch {batch_code} for {ym} with {len(employees)} payslips.",
                client_ip
            )

            created_batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", batch_id)
            return {
                "status": "success",
                "message": f"Payroll batch {batch_code} created successfully.",
                "batch": serialize_row(dict(created_batch)),
                "payslips_generated": len(employees),
            }


@router.get("/batches/{batch_id}")
async def get_payroll_batch(
    batch_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Retrieve payroll batch metadata and all employee payslips with WPS compliance summary."""
    require_permission(session, "payroll.read")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(batch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid batch UUID.")

    async with pool.acquire() as conn:
        batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", b_uuid)
        if not batch:
            raise HTTPException(status_code=404, detail="Payroll batch not found.")

        rows = await conn.fetch("""
            SELECT * FROM payslips
            WHERE batch_id = $1
            ORDER BY employee_number ASC, employee_name ASC;
        """, b_uuid)

        payslips = [serialize_row(dict(r)) for r in rows]
        wps_ready_count = sum(1 for p in payslips if p.get("wps_status") == "ready")
        wps_missing_count = sum(1 for p in payslips if p.get("wps_status") != "ready")

        return {
            "batch": serialize_row(dict(batch)),
            "payslips": payslips,
            "total_payslips": len(payslips),
            "wps_ready_count": wps_ready_count,
            "wps_missing_count": wps_missing_count,
        }


@router.put("/payslips/{payslip_id}")
async def update_payslip(
    payslip_id: str,
    payload: UpdatePayslipPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Allows updating working_days, overtime_hours, overtime_pay, other_allowances,
    deductions, and notes on a payslip when its parent batch is in draft status.
    Automatically recalculates net_salary and synchronizes parent batch totals inside transaction.
    """
    require_permission(session, "payroll.manage")
    pool = get_db_pool()
    try:
        p_uuid = uuid.UUID(payslip_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payslip UUID.")

    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow("""
                SELECT p.*, b.status as batch_status, b.batch_code
                FROM payslips p
                JOIN payroll_batches b ON p.batch_id = b.id
                WHERE p.id = $1;
            """, p_uuid)
            if not existing:
                raise HTTPException(status_code=404, detail="Payslip record not found.")

            if existing["batch_status"] != "draft":
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot edit payslips in a {existing['batch_status']} payroll batch. Batch must be draft."
                )

            batch_id = existing["batch_id"]

            working_days = payload.working_days if payload.working_days is not None else existing["working_days"]
            overtime_hours = payload.overtime_hours if payload.overtime_hours is not None else float(existing["overtime_hours"] or 0.0)
            overtime_pay = payload.overtime_pay if payload.overtime_pay is not None else float(existing["overtime_pay"] or 0.0)
            other_allowances = payload.other_allowances if payload.other_allowances is not None else float(existing["other_allowances"] or 0.0)
            deductions = payload.deductions if payload.deductions is not None else float(existing["deductions"] or 0.0)
            notes = payload.notes if payload.notes is not None else existing["notes"]

            base_salary = float(existing["base_salary"] or 0.0)
            housing_allowance = float(existing["housing_allowance"] or 0.0)
            transport_allowance = float(existing["transport_allowance"] or 0.0)
            bonus_pay = float(existing.get("bonus_pay") or 0.0)
            task_benefit_pay = float(existing.get("task_benefit_pay") or 0.0)

            net_salary = round(
                base_salary + housing_allowance + transport_allowance + other_allowances + overtime_pay + bonus_pay + task_benefit_pay - deductions,
                2
            )
            if net_salary < 0:
                net_salary = 0.0

            await conn.execute("""
                UPDATE payslips SET
                    working_days = $2,
                    overtime_hours = $3,
                    overtime_pay = $4,
                    other_allowances = $5,
                    deductions = $6,
                    net_salary = $7,
                    notes = $8,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1;
            """,
                p_uuid, working_days, round(overtime_hours, 2), round(overtime_pay, 2),
                round(other_allowances, 2), round(deductions, 2), round(net_salary, 2), notes
            )

            # Recalculate parent batch totals
            await update_batch_totals_from_payslips(conn, batch_id)

            updated_p = await conn.fetchrow("SELECT * FROM payslips WHERE id = $1;", p_uuid)
            updated_b = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", batch_id)

            return {
                "status": "success",
                "payslip": serialize_row(dict(updated_p)),
                "batch": serialize_row(dict(updated_b)),
            }


@router.post("/batches/{batch_id}/lock")
async def lock_payroll_batch(
    batch_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Marks the payroll batch as 'locked', sets locked_at = CURRENT_TIMESTAMP,
    syncs verified attendance records to 'synced', and logs in audit trail.
    """
    require_permission(session, "payroll.manage")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(batch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid batch UUID.")

    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", b_uuid)
        if not batch:
            raise HTTPException(status_code=404, detail="Payroll batch not found.")

        if batch["status"] != "draft":
            raise HTTPException(
                status_code=400,
                detail=f"Payroll batch {batch['batch_code']} is already {batch['status']}.",
            )

        ym = batch["salary_year_month"]
        user_id, author_name = await resolve_audit_author(conn, session)

        await conn.execute("""
            UPDATE payroll_batches SET
                status = 'locked',
                locked_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """, b_uuid)

        synced_count = await conn.execute("""
            UPDATE attendance_logs SET
                status = 'synced',
                updated_at = CURRENT_TIMESTAMP
            WHERE TO_CHAR(check_in, 'YYYY-MM') = $1
              AND LOWER(status) = 'verified';
        """, ym)

        await conn.execute("""
            INSERT INTO audit_logs (
                id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, note, ip_address
            ) VALUES (
                $1::uuid, 'payroll_batches', $2, 'LOCK', $3, $4, $5, $6
            );
        """, str(uuid.uuid4()), str(b_uuid), user_id, author_name,
            f"Locked and sealed payroll batch {batch['batch_code']} ({ym}) with {batch['total_employees']} payslips.",
            client_ip
        )

        # Automated communication trigger execution
        try:
            from backend.core.communication_engine import execute_automation_trigger
            # 1. Trigger for payroll_batch_locked
            await execute_automation_trigger(
                event_type="payroll_batch_locked",
                record_model="payroll.batch",
                record_id=str(b_uuid),
                record_data={
                    "batch_code": batch["batch_code"],
                    "month": ym,
                    "total_employees": batch["total_employees"],
                    "total_net_salary": f"{float(batch['total_net_salary'] or 0):,.2f}"
                },
                author_name=author_name
            )

            # 2. Trigger for payslip_confirmed for each employee
            p_rows = await conn.fetch("""
                SELECT p.*, e.phone_number, e.work_email, e.full_name as emp_name
                FROM payslips p
                LEFT JOIN employees e ON p.employee_id = e.id
                WHERE p.batch_id = $1::uuid;
            """, b_uuid)

            for p in p_rows:
                await execute_automation_trigger(
                    event_type="payslip_confirmed",
                    record_model="payroll.payslip",
                    record_id=str(p["id"]),
                    record_data={
                        "employee_id": str(p["employee_id"]),
                        "employee_name": p["employee_name"] or p["emp_name"],
                        "employee_number": p["employee_number"],
                        "phone_number": p["phone_number"],
                        "month": ym,
                        "base_salary": float(p['base_salary'] or 0),
                        "net_salary": float(p['net_salary'] or 0),
                        "deductions": float(p['deductions'] or 0),
                        "department": p["department"] or "Operations"
                    },
                    author_name=author_name
                )
        except Exception as e:
            logger.exception("Error executing automated triggers on payroll batch lock: %s", e)

        updated_batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", b_uuid)
        return {
            "status": "success",
            "message": f"Payroll batch {batch['batch_code']} locked and sealed successfully.",
            "batch": serialize_row(dict(updated_batch)),
            "attendance_sync_info": synced_count,
            "synced_attendance_records": synced_count,
        }


@router.delete("/batches/{batch_id}")
async def delete_payroll_batch(
    batch_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Deletes a payroll batch and all associated payslips if in 'draft' status."""
    require_permission(session, "payroll.manage")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(batch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid batch UUID.")

    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", b_uuid)
        if not batch:
            raise HTTPException(status_code=404, detail="Payroll batch not found.")

        if batch["status"] != "draft":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete a {batch['status']} payroll batch. Only 'draft' batches can be deleted."
            )

        user_id, author_name = await resolve_audit_author(conn, session)

        await conn.execute("DELETE FROM payroll_batches WHERE id = $1;", b_uuid)

        await conn.execute("""
            INSERT INTO audit_logs (
                id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, note, ip_address
            ) VALUES (
                $1::uuid, 'payroll_batches', $2, 'DELETE', $3, $4, $5, $6
            );
        """, str(uuid.uuid4()), str(b_uuid), user_id, author_name,
            f"Deleted draft payroll batch {batch['batch_code']} ({batch['salary_year_month']}).",
            client_ip
        )

        return {
            "status": "success",
            "message": f"Payroll batch {batch['batch_code']} deleted successfully.",
            "deleted_id": str(b_uuid),
        }


@router.post("/batches/{batch_id}/sync-adjustments")
async def sync_batch_adjustments(
    batch_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Recalculates all payslips in a draft batch by aggregating all approved payroll_adjustments
    for the batch's salary_year_month.
    """
    require_permission(session, "payroll.manage")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(batch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid batch UUID.")

    async with pool.acquire() as conn:
        async with conn.transaction():
            batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", b_uuid)
            if not batch:
                raise HTTPException(status_code=404, detail="Payroll batch not found.")
            if batch["status"] != "draft":
                raise HTTPException(status_code=400, detail="Only draft payroll batches can be synced.")

            ym = batch["salary_year_month"]
            payslips = await conn.fetch("SELECT id, employee_id FROM payslips WHERE batch_id = $1;", b_uuid)

            synced_count = 0
            for p in payslips:
                await sync_employee_adjustments_to_payslips(conn, p["employee_id"], ym)
                synced_count += 1

            await update_batch_totals_from_payslips(conn, b_uuid)
            updated_batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", b_uuid)

            return {
                "status": "success",
                "message": f"Synchronized approved variable adjustments across {synced_count} payslips.",
                "batch": serialize_row(dict(updated_batch)),
                "synced_payslips": synced_count,
            }


@router.get("/batches/{batch_id}/export-sif")
async def export_qatar_wps_sif(
    batch_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Generates and returns an official Qatar Wage Protection System (WPS) .SIF CSV file.
    Follows Qatar Central Bank & Ministry of Labour specifications.
    """
    require_permission(session, "payroll.manage")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(batch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid batch UUID.")

    async with pool.acquire() as conn:
        batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1;", b_uuid)
        if not batch:
            raise HTTPException(status_code=404, detail="Payroll batch not found.")

        # Read Qatar WPS Bank Configuration from system_metadata
        wps_raw = await conn.fetchval("SELECT value FROM system_metadata WHERE key = 'cfg:qatar_wps_config';")
        wps_cfg = {}
        if wps_raw:
            try:
                wps_cfg = json.loads(wps_raw) if isinstance(wps_raw, str) else dict(wps_raw)
            except Exception:
                pass

        employer_eid = str(wps_cfg.get("employer_eid") or "12345678").strip()
        payer_bank_short_code = str(wps_cfg.get("payer_bank_short_code") or "QNBA").strip().upper()
        payer_iban = str(wps_cfg.get("payer_iban") or "QA55QNBA000000001122334455667").strip().upper()

        payslips = await conn.fetch("""
            SELECT * FROM payslips
            WHERE batch_id = $1
            ORDER BY employee_number ASC, employee_name ASC;
        """, b_uuid)

        now = datetime.datetime.now(datetime.timezone.utc)
        file_date = now.strftime("%Y%m%d")
        file_time = now.strftime("%H%M")
        salary_ym = batch["salary_year_month"].replace("-", "").strip()

        total_net = float(batch["total_net_salary"] or 0.0)
        total_records = len(payslips)

        # Build SIF File Rows per Qatar WPS Banking Specification
        # Row 1 (Header schema)
        row1 = "Employer EID,File Creation Date,File Creation Time,Payer EID,Payer QID,Payer Bank Short Name,Payer IBAN,Salary Year and Month,Total Salaries,Total Records,SIF Version"
        # Row 2 (Header values)
        row2 = f"{employer_eid},{file_date},{file_time},{employer_eid},,{payer_bank_short_code},{payer_iban},{salary_ym},{total_net:.2f},{total_records},01"
        # Row 3 (EDR Column headers)
        row3 = "Record Sequence,Employee QID,Employee Visa ID,Employee Name,Employee Bank Short Name,Employee Account,Salary Frequency,Number of Working Days,Net Salary,Basic Salary,Extra Hours,Extra Income,Deductions,Payment Type,Notes/Comments"

        edr_rows = []
        for idx, p in enumerate(payslips, start=1):
            qid = str(p["national_id_number"] or "").strip()
            visa = str(p["visa_number"] or "").strip()
            emp_name = str(p["employee_name"] or "").replace(",", " ").strip()
            iban = str(p["bank_iban"] or "").strip().upper()

            # Extract 4-letter Qatar Bank Code from SWIFT or IBAN
            bank_short = "QNBA"
            swift = str(p["bank_swift"] or "").strip().upper()
            if len(swift) >= 4:
                bank_short = swift[:4]
            elif len(iban) >= 8 and iban.startswith("QA"):
                bank_short = iban[4:8]

            working_days = p["working_days"] or 30
            net_sal = float(p["net_salary"] or 0.0)
            base_sal = float(p["base_salary"] or 0.0)
            ot_hours = float(p["overtime_hours"] or 0.0)
            extra_income = (
                float(p["housing_allowance"] or 0.0)
                + float(p["transport_allowance"] or 0.0)
                + float(p["other_allowances"] or 0.0)
                + float(p["overtime_pay"] or 0.0)
                + float(p.get("bonus_pay") or 0.0)
                + float(p.get("task_benefit_pay") or 0.0)
            )
            ded = float(p["deductions"] or 0.0)
            notes = str(p["notes"] or "").replace(",", " ").replace("\n", " ").strip()

            edr_line = (
                f"{idx},{qid},{visa},{emp_name},{bank_short},{iban},M,{working_days},"
                f"{net_sal:.2f},{base_sal:.2f},{ot_hours:.1f},{extra_income:.2f},{ded:.2f},Normal,{notes}"
            )
            edr_rows.append(edr_line)

        sif_content = "\r\n".join([row1, row2, row3] + edr_rows) + "\r\n"
        filename = f"SIF_{employer_eid}_{payer_bank_short_code}_{file_date}_{file_time}.sif"

        if batch["status"] == "locked":
            await conn.execute("UPDATE payroll_batches SET status = 'exported', updated_at = CURRENT_TIMESTAMP WHERE id = $1;", b_uuid)

        return Response(
            content=sif_content.encode("utf-8"),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
                "X-WPS-Total-Records": str(total_records),
                "X-WPS-Total-Salaries": f"{total_net:.2f}",
            },
        )


# ==============================================================================
# 2. TASK RATE RULES & EMPLOYEE SALARY BASIS
# ==============================================================================
@router.get("/task-rules")
async def list_task_rate_rules(
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Lists all active piece-rate and overtime task rate rules, masking rates if not authorized."""
    require_permission(session, "payroll.read")
    pool = get_db_pool()
    can_read = can_read_salary(session)

    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM task_rate_rules WHERE is_active = true ORDER BY entry_type, name ASC;")
        rules = []
        for r in rows:
            d = serialize_row(dict(r))
            if not can_read:
                d["default_unit_rate"] = None
            rules.append(d)
        return {"rules": rules, "total": len(rules)}


@router.post("/task-rules")
async def create_or_update_task_rate_rule(
    payload: TaskRateRulePayload,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Creates or updates a piece-rate task, overtime, bonus, or deduction rate preset."""
    require_permission(session, "hr.salary_manage")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        inc_json = json.dumps(payload.included_benefit_rules or [])
        await conn.execute("""
            INSERT INTO task_rate_rules (
                id, name, entry_type, unit_label, default_unit_rate,
                ot_calculation_basis, ot_multiplier_pct, calculation_mode,
                included_benefit_rules, subtype, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                entry_type = EXCLUDED.entry_type,
                unit_label = EXCLUDED.unit_label,
                default_unit_rate = EXCLUDED.default_unit_rate,
                ot_calculation_basis = EXCLUDED.ot_calculation_basis,
                ot_multiplier_pct = EXCLUDED.ot_multiplier_pct,
                calculation_mode = EXCLUDED.calculation_mode,
                included_benefit_rules = EXCLUDED.included_benefit_rules,
                subtype = EXCLUDED.subtype,
                is_active = EXCLUDED.is_active;
        """,
            payload.id.strip().upper(), payload.name.strip(), payload.entry_type.strip().lower(),
            payload.unit_label or "Units", round(float(payload.default_unit_rate or 0.0), 2),
            payload.ot_calculation_basis or "basic_only", round(float(payload.ot_multiplier_pct or 100.0), 2),
            payload.calculation_mode or "hourly_multiplier", inc_json,
            payload.subtype or "general", payload.is_active
        )
        row = await conn.fetchrow("SELECT * FROM task_rate_rules WHERE id = $1;", payload.id.strip().upper())
        return {"status": "success", "rule": serialize_row(dict(row))}


@router.delete("/task-rules/{rule_id}")
async def delete_task_rate_rule(
    rule_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Deletes or inactivates a task rate preset."""
    require_permission(session, "hr.salary_manage")
    pool = get_db_pool()
    clean_id = rule_id.strip().upper()
    async with pool.acquire() as conn:
        exists = await conn.fetchrow("SELECT id FROM task_rate_rules WHERE id = $1;", clean_id)
        if not exists:
            raise HTTPException(status_code=404, detail="Task rate rule not found.")
        await conn.execute("DELETE FROM task_rate_rules WHERE id = $1;", clean_id)
        return {"status": "success", "message": f"Task rate rule '{clean_id}' deleted successfully."}


@router.get("/employees/{employee_id}/basis")
async def get_employee_basis(
    employee_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Returns employee's salary basis and hourly rates.
    If session lacks salary permissions, returns restricted masked payload.
    """
    require_permission(session, "payroll.read")
    pool = get_db_pool()
    try:
        e_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("SELECT id, full_name, employee_number, department_id FROM employees WHERE id = $1;", e_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        if not can_read_salary(session):
            return {
                "employee_id": str(e_uuid),
                "employee_name": emp["full_name"],
                "employee_number": emp["employee_number"],
                "restricted": True,
                "base_salary": None,
                "housing_allowance": None,
                "allowances_by_rule": {},
                "hourly_basic_rate": None,
                "hourly_basic_plus_housing_rate": None,
            }

        basis = await get_employee_salary_basis(conn, e_uuid)
        base = basis["base_salary"]
        housing = basis["housing_allowance"]
        hourly_basic = round(base / 240.0, 2)
        hourly_basic_housing = round((base + housing) / 240.0, 2)

        return {
            "employee_id": str(e_uuid),
            "employee_name": emp["full_name"],
            "employee_number": emp["employee_number"],
            "restricted": False,
            "base_salary": base,
            "housing_allowance": housing,
            "allowances_by_rule": basis.get("allowances_by_rule", {}),
            "hourly_basic_rate": hourly_basic,
            "hourly_basic_plus_housing_rate": hourly_basic_housing,
        }


# ==============================================================================
# 3. VARIABLE ADJUSTMENTS & 2-LEVEL APPROVAL WORKFLOW
# ==============================================================================
@router.get("/adjustments")
async def list_payroll_adjustments(
    salary_year_month: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    adjustment_type: Optional[str] = Query(None),
    approval_status: Optional[str] = Query(None),
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Lists variable payroll adjustments with multi-factor filtering and KPI summary metrics.
    Masks unit rates, computed amounts, and QAR summary metrics if session lacks salary read permissions.
    """
    require_permission(session, "payroll.read")
    can_read = can_read_salary(session)
    pool = get_db_pool()

    query = "SELECT * FROM payroll_adjustments WHERE 1=1"
    params: List[Any] = []
    idx = 1

    if salary_year_month and salary_year_month.strip():
        query += f" AND salary_year_month = ${idx}"
        params.append(salary_year_month.strip())
        idx += 1

    if employee_id and employee_id.strip():
        try:
            e_uuid = uuid.UUID(employee_id.strip())
            query += f" AND employee_id = ${idx}::uuid"
            params.append(e_uuid)
            idx += 1
        except Exception:
            pass

    if adjustment_type and adjustment_type.strip() and adjustment_type.upper() != "ALL":
        query += f" AND adjustment_type = ${idx}"
        params.append(adjustment_type.strip().lower())
        idx += 1

    if approval_status and approval_status.strip() and approval_status.upper() != "ALL":
        query += f" AND approval_status = ${idx}"
        params.append(approval_status.strip().lower())
        idx += 1

    query += " ORDER BY created_at DESC;"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        adjustments = [serialize_row(dict(r)) for r in rows]

        pending_supervisor_count = sum(1 for a in adjustments if a.get("approval_status") == "pending_supervisor")
        pending_hr_count = sum(1 for a in adjustments if a.get("approval_status") == "pending_hr")

        if can_read:
            approved_additions_qar = sum(
                float(a.get("computed_amount") or 0.0)
                for a in adjustments
                if a.get("approval_status") == "approved" and a.get("adjustment_type") in ("overtime", "task_benefit", "bonus")
            )
            approved_deductions_qar = sum(
                float(a.get("computed_amount") or 0.0)
                for a in adjustments
                if a.get("approval_status") == "approved" and a.get("adjustment_type") == "deduction"
            )
        else:
            approved_additions_qar = None
            approved_deductions_qar = None
            for a in adjustments:
                a["unit_rate"] = None
                a["computed_amount"] = None

        return {
            "adjustments": adjustments,
            "total": len(adjustments),
            "summary": {
                "pending_supervisor_count": pending_supervisor_count,
                "pending_hr_count": pending_hr_count,
                "approved_additions_qar": round(approved_additions_qar, 2) if approved_additions_qar is not None else None,
                "approved_deductions_qar": round(approved_deductions_qar, 2) if approved_deductions_qar is not None else None,
            }
        }


@router.post("/adjustments")
async def create_payroll_adjustment(
    payload: CreateAdjustmentPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Creates a new variable adjustment (Overtime, Task/Trip Piece-Rate, Bonus, or Deduction).
    Unit rates and amounts are locked to and calculated strictly by the selected task rate preset.
    """
    require_permission(session, "payroll.read")
    can_read = can_read_salary(session)
    pool = get_db_pool()

    try:
        e_uuid = uuid.UUID(payload.employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    ym = payload.salary_year_month.strip()
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", ym):
        raise HTTPException(status_code=400, detail="Invalid salary_year_month format (YYYY-MM).")

    if not payload.rule_id or not payload.rule_id.strip():
        raise HTTPException(status_code=400, detail="rule_id is required.")

    clean_rule_id = payload.rule_id.strip().upper()

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("SELECT * FROM employees WHERE id = $1;", e_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        rule = await conn.fetchrow("SELECT * FROM task_rate_rules WHERE id = $1 AND is_active = true;", clean_rule_id)
        if not rule:
            raise HTTPException(status_code=400, detail=f"Invalid or inactive task rate rule '{clean_rule_id}'.")

        user_id, author_name = await resolve_audit_author(conn, session)
        org_id = emp.get("organization_id")

        adj_type = rule["entry_type"]
        category_subtype = rule["subtype"] or payload.category_subtype or "general"
        title = payload.title.strip() if payload.title and payload.title.strip() else rule["name"]
        unit_label = rule["unit_label"] or "Units"
        calc_mode = rule["calculation_mode"] or "hourly_multiplier"
        mult_pct = float(rule["ot_multiplier_pct"] or 100.0)
        quantity = float(payload.quantity if payload.quantity is not None else 1.0)

        # Rate and amount computation strictly server-side
        if calc_mode == "hourly_multiplier":
            basis = await get_employee_salary_basis(conn, e_uuid)
            basis_val = compute_custom_basis(basis, rule["included_benefit_rules"])
            unit_rate = round((basis_val / 240.0) * (mult_pct / 100.0), 2)
            computed_amount = round(unit_rate * quantity, 2)
            calc_basis = "basic_plus_allowances" if rule["included_benefit_rules"] and len(rule["included_benefit_rules"]) > 0 else "basic_only"

        elif calc_mode == "piece_rate":
            unit_rate = float(rule["default_unit_rate"] or 0.0)
            computed_amount = round(quantity * unit_rate, 2)
            calc_basis = "piece_rate"

        elif calc_mode == "daily_rate":
            basis = await get_employee_salary_basis(conn, e_uuid)
            basis_val = compute_custom_basis(basis, rule["included_benefit_rules"])
            unit_rate = round((basis_val / 30.0) * (mult_pct / 100.0), 2)
            computed_amount = round(unit_rate * quantity, 2)
            calc_basis = "daily_rate"

        elif calc_mode == "percentage_of_basis":
            basis = await get_employee_salary_basis(conn, e_uuid)
            basis_val = compute_custom_basis(basis, rule["included_benefit_rules"])
            unit_rate = round(basis_val * (mult_pct / 100.0), 2)
            computed_amount = round(unit_rate * quantity, 2)
            calc_basis = "percentage_of_basis"

        elif calc_mode == "fixed_amount":
            def_rate = float(rule["default_unit_rate"] or 0.0)
            if def_rate > 0:
                if can_read and payload.computed_amount and float(payload.computed_amount) > 0:
                    computed_amount = round(float(payload.computed_amount), 2)
                else:
                    computed_amount = def_rate
            else:
                if can_read:
                    computed_amount = round(float(payload.computed_amount or 0.0), 2)
                else:
                    computed_amount = 0.0
            unit_rate = computed_amount
            quantity = 1.0
            calc_basis = "fixed_amount"
        else:
            unit_rate = float(rule["default_unit_rate"] or 0.0)
            computed_amount = round(unit_rate * quantity, 2)
            calc_basis = "quantity_x_rate"

        new_id = uuid.uuid4()
        clean_ym = ym.replace("-", "")
        code = f"ADJ-{clean_ym}-{new_id.hex[:6].upper()}"

        await conn.execute("""
            INSERT INTO payroll_adjustments (
                id, code, employee_id, employee_number, employee_name, department,
                salary_year_month, rule_id, adjustment_type, category_subtype, title,
                calculation_basis, multiplier_pct, quantity, unit_label, unit_rate,
                computed_amount, approval_status, submitted_by_name, notes, organization_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16,
                $17, 'pending_supervisor', $18, $19, $20
            );
        """,
            new_id, code, e_uuid, emp["employee_number"], emp["full_name"], emp["department_id"],
            ym, clean_rule_id, adj_type, category_subtype, title,
            calc_basis, mult_pct, quantity, unit_label, unit_rate,
            computed_amount, author_name, payload.notes, org_id
        )

        row = await conn.fetchrow("SELECT * FROM payroll_adjustments WHERE id = $1;", new_id)
        resp_data = serialize_row(dict(row))
        if not can_read:
            resp_data["unit_rate"] = None
            resp_data["computed_amount"] = None

        return {
            "status": "success",
            "message": f"Adjustment {code} created and submitted for supervisor approval.",
            "adjustment": resp_data,
        }


@router.post("/adjustments/{adj_id}/approve")
async def approve_payroll_adjustment(
    adj_id: str,
    payload: Optional[ApproveAdjustmentPayload] = None,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    2-Level Approval Workflow:
    - Level 1 ('pending_supervisor' -> 'pending_hr')
    - Level 2 ('pending_hr' -> 'approved'): automatically syncs into draft payslip!
    - Superadmins or users with 'payroll.manage' can fast-track directly to 'approved'.
    """
    pool = get_db_pool()
    try:
        a_uuid = uuid.UUID(adj_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid adjustment UUID.")

    fast_track = payload.fast_track if payload else False
    is_super = session.get("is_superadmin") or "*" in session.get("security_groups", [])
    has_payroll_manage = check_permission(session, "payroll.manage") or is_super

    async with pool.acquire() as conn:
        async with conn.transaction():
            adj = await conn.fetchrow("SELECT * FROM payroll_adjustments WHERE id = $1;", a_uuid)
            if not adj:
                raise HTTPException(status_code=404, detail="Adjustment record not found.")

            current_status = adj["approval_status"]
            user_id, author_name = await resolve_audit_author(conn, session)

            if current_status == "approved":
                return {"status": "success", "message": "Adjustment is already fully approved.", "adjustment": serialize_row(dict(adj))}

            if current_status == "rejected":
                raise HTTPException(status_code=400, detail="Cannot approve a rejected adjustment. Please re-submit.")

            new_status = current_status
            if current_status == "pending_supervisor":
                if fast_track and has_payroll_manage:
                    new_status = "approved"
                    await conn.execute("""
                        UPDATE payroll_adjustments SET
                            approval_status = 'approved',
                            level1_approved_by = $2,
                            level1_approved_at = CURRENT_TIMESTAMP,
                            level2_approved_by = $2,
                            level2_approved_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1;
                    """, a_uuid, f"{author_name} (Fast-Track)")
                else:
                    new_status = "pending_hr"
                    await conn.execute("""
                        UPDATE payroll_adjustments SET
                            approval_status = 'pending_hr',
                            level1_approved_by = $2,
                            level1_approved_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1;
                    """, a_uuid, author_name)

            elif current_status == "pending_hr":
                if not (has_payroll_manage or check_permission(session, "hr.salary_manage")):
                    raise HTTPException(status_code=403, detail="Level 2 HR approval requires 'payroll.manage' or 'hr.salary_manage' permission.")

                new_status = "approved"
                await conn.execute("""
                    UPDATE payroll_adjustments SET
                        approval_status = 'approved',
                        level2_approved_by = $2,
                        level2_approved_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1;
                """, a_uuid, author_name)

            # If now approved, synchronize directly into any existing draft payslip
            if new_status == "approved":
                await sync_employee_adjustments_to_payslips(conn, adj["employee_id"], adj["salary_year_month"])

            updated_adj = await conn.fetchrow("SELECT * FROM payroll_adjustments WHERE id = $1;", a_uuid)
            return {
                "status": "success",
                "message": f"Adjustment {adj['code']} updated to '{new_status}'.",
                "adjustment": serialize_row(dict(updated_adj)),
            }


@router.post("/adjustments/{adj_id}/reject")
async def reject_payroll_adjustment(
    adj_id: str,
    payload: RejectAdjustmentPayload,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Rejects adjustment and resyncs draft payslip."""
    require_permission(session, "payroll.read")
    pool = get_db_pool()
    try:
        a_uuid = uuid.UUID(adj_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid adjustment UUID.")

    async with pool.acquire() as conn:
        async with conn.transaction():
            adj = await conn.fetchrow("SELECT * FROM payroll_adjustments WHERE id = $1;", a_uuid)
            if not adj:
                raise HTTPException(status_code=404, detail="Adjustment record not found.")

            user_id, author_name = await resolve_audit_author(conn, session)
            reason = payload.rejection_reason.strip() if payload.rejection_reason else "Rejected by reviewer"

            await conn.execute("""
                UPDATE payroll_adjustments SET
                    approval_status = 'rejected',
                    rejection_reason = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1;
            """, a_uuid, f"{author_name}: {reason}")

            # Re-sync any draft payslip in case it was previously approved
            await sync_employee_adjustments_to_payslips(conn, adj["employee_id"], adj["salary_year_month"])

            updated_adj = await conn.fetchrow("SELECT * FROM payroll_adjustments WHERE id = $1;", a_uuid)
            return {
                "status": "success",
                "message": f"Adjustment {adj['code']} rejected.",
                "adjustment": serialize_row(dict(updated_adj)),
            }


@router.delete("/adjustments/{adj_id}")
async def delete_payroll_adjustment(
    adj_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Deletes adjustment if not locked in a sealed batch, and resyncs draft payslip."""
    require_permission(session, "payroll.manage")
    pool = get_db_pool()
    try:
        a_uuid = uuid.UUID(adj_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid adjustment UUID.")

    async with pool.acquire() as conn:
        async with conn.transaction():
            adj = await conn.fetchrow("SELECT * FROM payroll_adjustments WHERE id = $1;", a_uuid)
            if not adj:
                raise HTTPException(status_code=404, detail="Adjustment record not found.")

            # Check if locked batch exists for this month
            locked_batch = await conn.fetchrow("""
                SELECT id, batch_code, status FROM payroll_batches
                WHERE salary_year_month = $1 AND status IN ('locked', 'exported');
            """, adj["salary_year_month"])

            if locked_batch:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot delete adjustment. Payroll batch {locked_batch['batch_code']} is {locked_batch['status']}."
                )

            await conn.execute("DELETE FROM payroll_adjustments WHERE id = $1;", a_uuid)
            await sync_employee_adjustments_to_payslips(conn, adj["employee_id"], adj["salary_year_month"])

            return {"status": "success", "message": f"Adjustment {adj['code']} deleted.", "deleted_id": str(a_uuid)}
