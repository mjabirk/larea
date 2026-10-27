import uuid
import json
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query
from pydantic import BaseModel, Field
from backend.core.database import get_db_pool
from backend.core.dependencies import (
    get_current_user_session,
    get_client_ip,
    require_permission,
    check_permission,
    verify_record_tenant,
)
from backend.core.audit import record_audit_log
from backend.core.sequences import uuid7, get_next_contract_reference

router = APIRouter(tags=["Employee Contracts & Benefits"])

def parse_date(d_str: Optional[str]) -> Optional[datetime.date]:
    if not d_str:
        return None
    try:
        clean = str(d_str).split("T")[0].strip()
        return datetime.date.fromisoformat(clean)
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


def mask_contract_payload(c_dict: Dict[str, Any], session: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enforces field-level masking on compensation data.
    If session lacks 'hr.salary_read':
    - Sets wage_base = None
    - Strips amount_value and computed_monthly_total from all benefit lines
    - Sets allowances_total = None, deductions_total = None, and net_package_total = None
    """
    has_salary_read = check_permission(session, "hr.salary_read")
    if not has_salary_read:
        c_dict["wage_base"] = None
        c_dict["allowances_total"] = None
        c_dict["deductions_total"] = None
        c_dict["net_package_total"] = None
        if "benefit_lines" in c_dict and isinstance(c_dict["benefit_lines"], list):
            for line in c_dict["benefit_lines"]:
                line["amount_value"] = None
                line["computed_monthly_total"] = None
    return c_dict

async def log_contract_audit(
    conn,
    contract_id: str,
    action: str,
    note: str,
    session: Dict[str, Any],
    client_ip: str,
    changes: Optional[Dict[str, Any]] = None,
    tenant_id: Optional[str] = None
):
    """Write an immutable, cryptographically chained entry to audit_logs."""
    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    user_name = session.get("full_name") or session.get("username") or "System User"
    t_id = tenant_id or session.get("organization_id") or "default_tenant"

    return await record_audit_log(
        conn=conn,
        tenant_id=str(t_id),
        entity_type="contracts",
        entity_id=str(contract_id),
        action=action,
        changed_by_user_id=user_id,
        changed_by_name=user_name,
        changes=changes,
        note=note,
        ip_address=client_ip
    )

class EmployeeGradePayload(BaseModel):
    id: Optional[str] = None
    code: str
    name: str
    rank_order: Optional[int] = 1
    description: Optional[str] = None
    is_active: Optional[bool] = True

class BenefitLinePayload(BaseModel):
    rule_id: str
    calculation_type: str = "fixed_amount"  # "fixed_amount", "percentage_of_base", or "grade_based"
    amount_value: float = 0.0

class ContractCreatePayload(BaseModel):
    contract_reference: Optional[str] = None
    title: str = "Standard Employment Agreement"
    start_date: str
    end_date: Optional[str] = None
    wage_base: float
    currency: Optional[str] = "QAR"
    status: Optional[str] = "draft"  # "draft", "active", "expired", "terminated"
    notice_period_days: Optional[int] = 30
    trial_period_days: Optional[int] = 90
    working_hours_per_week: Optional[float] = 40.0
    terms_notes: Optional[str] = None
    benefit_lines: Optional[List[BenefitLinePayload]] = []


class ContractAmendPayload(BaseModel):
    amendment_reason: str = Field(..., description="Legally required justification for contract amendment")
    title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    wage_base: Optional[float] = None
    currency: Optional[str] = None
    notice_period_days: Optional[int] = None
    trial_period_days: Optional[int] = None
    working_hours_per_week: Optional[float] = None
    terms_notes: Optional[str] = None
    benefit_lines: Optional[List[BenefitLinePayload]] = None


class ContractCancelPayload(BaseModel):
    cancellation_reason: str = Field(..., description="Audit justification for contract cancellation/termination")
    notice_period_days: Optional[int] = 30
    trial_period_days: Optional[int] = 90
    working_hours_per_week: Optional[float] = 40.0
    terms_notes: Optional[str] = None
    benefit_lines: Optional[List[BenefitLinePayload]] = []

class ContractUpdatePayload(BaseModel):
    contract_reference: Optional[str] = None
    title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    wage_base: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    notice_period_days: Optional[int] = None
    trial_period_days: Optional[int] = None
    working_hours_per_week: Optional[float] = None
    terms_notes: Optional[str] = None
    benefit_lines: Optional[List[BenefitLinePayload]] = None

# ==============================================================================
# EMPLOYEE GRADES ENDPOINTS
# ==============================================================================
@router.get("/api/v1/employee-grades")
async def list_employee_grades(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Lists all active employee grades ordered by rank_order ASC, code ASC along with count of assigned employees."""
    require_permission(session, "hr.contracts_read")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT g.id, g.code, g.name, g.rank_order, g.description, g.is_active, g.created_at,
                   COUNT(e.id) as assigned_employees_count
            FROM employee_grades g
            LEFT JOIN employees e ON e.grade_id = g.id
            GROUP BY g.id, g.code, g.name, g.rank_order, g.description, g.is_active, g.created_at
            ORDER BY g.rank_order ASC, g.code ASC;
        """)
        return {"grades": [serialize_row(dict(r)) for r in rows]}

@router.post("/api/v1/employee-grades")
async def upsert_employee_grade(
    payload: EmployeeGradePayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Creates or updates an employee grade."""
    if not (check_permission(session, "hr.contracts_manage") or check_permission(session, "hr.salary_manage")):
        raise HTTPException(status_code=403, detail="Permission denied: Requires hr.contracts_manage or hr.salary_manage.")
    
    clean_id = (payload.id or f"GRADE_{payload.code.strip().upper()}").strip().upper().replace(" ", "_")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO employee_grades (id, code, name, rank_order, description, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                code = EXCLUDED.code,
                name = EXCLUDED.name,
                rank_order = EXCLUDED.rank_order,
                description = EXCLUDED.description,
                is_active = EXCLUDED.is_active;
        """, clean_id, payload.code.strip(), payload.name.strip(), payload.rank_order or 1, payload.description, payload.is_active if payload.is_active is not None else True)
        row = await conn.fetchrow("SELECT * FROM employee_grades WHERE id = $1;", clean_id)
        return serialize_row(dict(row))

@router.delete("/api/v1/employee-grades/{grade_id}")
async def delete_employee_grade(
    grade_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Deletes or deactivates an unused grade."""
    if not (check_permission(session, "hr.contracts_manage") or check_permission(session, "hr.salary_manage")):
        raise HTTPException(status_code=403, detail="Permission denied: Requires hr.contracts_manage or hr.salary_manage.")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        cnt = await conn.fetchval("SELECT COUNT(*) FROM employees WHERE grade_id = $1;", grade_id.strip())
        if cnt and cnt > 0:
            await conn.execute("UPDATE employee_grades SET is_active = false WHERE id = $1;", grade_id.strip())
            return {"status": "deactivated", "message": f"Grade is assigned to {cnt} employees; deactivated instead of deleted.", "id": grade_id}
        else:
            await conn.execute("DELETE FROM employee_grades WHERE id = $1;", grade_id.strip())
            return {"status": "deleted", "id": grade_id}

# ==============================================================================
# SALARY RULES ENDPOINTS
# ==============================================================================
@router.get("/api/v1/salary-rules")
async def list_salary_rules(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Retrieve all declarative salary rules configured in system with grade rates."""
    require_permission(session, "hr.contracts_read")
    has_salary_read = check_permission(session, "hr.salary_read")

    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, category, calculation_type, default_amount,
                   percentage_rate, is_taxable, wps_code, is_active
            FROM salary_rules
            WHERE is_active = true
            ORDER BY category ASC, id ASC;
        """)
        
        grade_rate_rows = await conn.fetch("SELECT rule_id, grade_id, amount FROM salary_rule_grade_rates;")
        grade_rates_map: Dict[str, Dict[str, float]] = {}
        for gr in grade_rate_rows:
            rid = gr["rule_id"]
            if rid not in grade_rates_map:
                grade_rates_map[rid] = {}
            grade_rates_map[rid][gr["grade_id"]] = float(gr["amount"])

        rules = []
        for r in rows:
            rule_dict = serialize_row(dict(r))
            if not has_salary_read:
                rule_dict["default_amount"] = None
                rule_dict["percentage_rate"] = None
                rule_dict["grade_rates"] = {}
            else:
                rule_dict["grade_rates"] = grade_rates_map.get(rule_dict["id"], {})
            rules.append(rule_dict)
        return {"rules": rules}

        
class SalaryRulePayload(BaseModel):
    id: str
    name: str
    category: str = "allowance"  # "allowance" or "deduction"
    calculation_type: str = "fixed_amount"  # "fixed_amount", "percentage_of_base", or "grade_based"
    default_amount: float = 0.0
    percentage_rate: float = 0.0
    is_taxable: bool = False
    wps_code: Optional[str] = "HOUSING"
    is_active: bool = True
    grade_rates: Optional[Dict[str, float]] = None

@router.post("/api/v1/salary-rules")
async def upsert_salary_rule(
    payload: SalaryRulePayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Create or update a declarative salary rule for Qatar WPS payroll with per-grade rates."""
    require_permission(session, "hr.salary_manage")
    clean_id = payload.id.strip().upper().replace(" ", "_")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO salary_rules (
                id, name, category, calculation_type, default_amount,
                percentage_rate, is_taxable, wps_code, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                category = EXCLUDED.category,
                calculation_type = EXCLUDED.calculation_type,
                default_amount = EXCLUDED.default_amount,
                percentage_rate = EXCLUDED.percentage_rate,
                is_taxable = EXCLUDED.is_taxable,
                wps_code = EXCLUDED.wps_code,
                is_active = EXCLUDED.is_active;
        """, clean_id, payload.name.strip(), payload.category, payload.calculation_type,
           payload.default_amount, payload.percentage_rate, payload.is_taxable,
           payload.wps_code, payload.is_active)

        if payload.grade_rates is not None:
            for gid, amt in payload.grade_rates.items():
                await conn.execute("""
                    INSERT INTO salary_rule_grade_rates (rule_id, grade_id, amount)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (rule_id, grade_id) DO UPDATE SET amount = EXCLUDED.amount;
                """, clean_id, gid, float(amt or 0.0))

        row = await conn.fetchrow("SELECT * FROM salary_rules WHERE id = $1;", clean_id)
        row_dict = serialize_row(dict(row))
        gr_rows = await conn.fetch("SELECT grade_id, amount FROM salary_rule_grade_rates WHERE rule_id = $1;", clean_id)
        row_dict["grade_rates"] = {r["grade_id"]: float(r["amount"]) for r in gr_rows}
        return row_dict

@router.delete("/api/v1/salary-rules/{rule_id}")
async def deactivate_salary_rule(
    rule_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Soft-deactivate a salary rule so historical contracts remain intact."""
    require_permission(session, "hr.salary_manage")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE salary_rules SET is_active = false WHERE id = $1;", rule_id)
    return {"status": "success", "id": rule_id}

# ==============================================================================
# GLOBAL CONTRACTS ENDPOINT (Decoupled Global Sub-Menu)
# ==============================================================================
@router.get("/api/v1/contracts")
async def list_global_contracts(
    status: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    expiring_days: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: Optional[int] = Query(None),
    offset: Optional[int] = Query(0),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Global list of contracts across all employees (Zero N+1 Query Batching).
    Supports search filtering and server-side limit/offset pagination.
    """
    require_permission(session, "hr.contracts_read")
    org_id = session.get("organization_id")

    pool = get_db_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT c.id, c.employee_id, c.contract_reference, c.title, c.start_date, c.end_date,
                   c.wage_base, c.currency, c.status, c.notice_period_days, c.trial_period_days,
                   c.working_hours_per_week, c.terms_notes, c.organization_id, c.created_at, c.updated_at,
                   c.created_by, c.submitted_by, c.approved_by, c.approved_at, c.approval_status,
                   e.full_name AS employee_name, e.employee_number, e.job_title, e.department_id AS department
            FROM employee_contracts c
            JOIN employees e ON c.employee_id = e.id
            WHERE 1=1
        """
        params = []
        param_idx = 1

        # Enforce Tenant Isolation for non-superadmins
        if not session.get("is_superadmin") and org_id:
            query += f" AND c.organization_id = ${param_idx}::uuid"
            params.append(org_id)
            param_idx += 1

        if status and status.lower() != "all":
            query += f" AND LOWER(c.status) = LOWER(${param_idx})"
            params.append(status)
            param_idx += 1

        if department and department.lower() != "all":
            query += f" AND LOWER(e.department_id) = LOWER(${param_idx})"
            params.append(department)
            param_idx += 1

        if expiring_days is not None:
            query += f" AND c.end_date IS NOT NULL AND c.end_date <= CURRENT_DATE + make_interval(days => ${param_idx}) AND c.end_date >= CURRENT_DATE"
            params.append(expiring_days)
            param_idx += 1

        search_query = (search or q or "").strip()
        if search_query:
            query += f""" AND (
                c.contract_reference ILIKE ${param_idx}
                OR c.title ILIKE ${param_idx}
                OR e.full_name ILIKE ${param_idx}
                OR e.employee_number ILIKE ${param_idx}
                OR e.job_title ILIKE ${param_idx}
            )"""
            params.append(f"%{search_query}%")
            param_idx += 1

        # Count total matching records before applying pagination
        count_query = f"SELECT COUNT(*) FROM ({query}) AS total_cnt;"
        total_count = await conn.fetchval(count_query, *params)

        query += " ORDER BY c.start_date DESC, c.created_at DESC"
        if limit is not None:
            query += f" LIMIT ${param_idx} OFFSET ${param_idx + 1};"
            params.extend([limit, offset or 0])
        else:
            query += ";"

        rows = await conn.fetch(query, *params)
        if not rows:
            return {"contracts": [], "total": total_count or 0, "limit": limit, "offset": offset or 0}

        # Single Batched Query for ALL benefit lines (eliminates N+1 bottleneck)
        contract_ids = [r["id"] for r in rows]
        all_benefits = await conn.fetch("""
            SELECT b.id, b.contract_id, b.rule_id, b.calculation_type, b.amount_value,
                   b.computed_monthly_total, r.category AS rule_category
            FROM contract_benefit_lines b
            JOIN salary_rules r ON b.rule_id = r.id
            WHERE b.contract_id = ANY($1::uuid[]);
        """, contract_ids)

        benefits_by_contract: Dict[uuid.UUID, List[Any]] = {}
        for b in all_benefits:
            benefits_by_contract.setdefault(b["contract_id"], []).append(b)

        contracts = []
        for r in rows:
            c_dict = serialize_row(dict(r))
            benefit_rows = benefits_by_contract.get(r["id"], [])

            base_wage = float(r["wage_base"] or 0)
            allowances = sum(float(b["computed_monthly_total"]) for b in benefit_rows if b["rule_category"] == "allowance")
            deductions = sum(float(b["computed_monthly_total"]) for b in benefit_rows if b["rule_category"] == "deduction")
            c_dict["allowances_total"] = allowances
            c_dict["deductions_total"] = deductions
            c_dict["net_package_total"] = round(base_wage + allowances - deductions, 2)

            c_dict = mask_contract_payload(c_dict, session)
            contracts.append(c_dict)

        return {
            "contracts": contracts,
            "total": total_count if total_count is not None else len(contracts),
            "limit": limit,
            "offset": offset or 0,
        }

# ==============================================================================
# EMPLOYEE-SPECIFIC CONTRACTS LIFECYCLE ENDPOINTS
# ==============================================================================
@router.get("/api/v1/employees/{employee_id}/contracts")
async def get_employee_contracts(
    employee_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    List all successive contracts and dynamic benefit breakdowns for an employee.
    Requires hr.contracts_read. Redacts compensation if lacking hr.salary_read.
    """
    require_permission(session, "hr.contracts_read")

    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("SELECT organization_id FROM employees WHERE id = $1;", emp_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")
        verify_record_tenant(emp["organization_id"], session)

        contracts_rows = await conn.fetch("""
            SELECT id, employee_id, contract_reference, title, start_date, end_date,
                   wage_base, currency, status, notice_period_days, trial_period_days,
                   working_hours_per_week, terms_notes, organization_id, created_at, updated_at,
                   created_by, submitted_by, approved_by, approved_at, approval_status
            FROM employee_contracts
            WHERE employee_id = $1
            ORDER BY start_date DESC, created_at DESC;
        """, emp_uuid)

        contracts = []
        contract_ids = [c["id"] for c in contracts_rows]
        all_benefits = []
        if contract_ids:
            all_benefits = await conn.fetch("""
                SELECT b.id, b.contract_id, b.rule_id, b.calculation_type, b.amount_value,
                       b.computed_monthly_total, b.created_at,
                       r.name AS rule_name, r.category AS rule_category, r.wps_code, r.percentage_rate AS default_rate
                FROM contract_benefit_lines b
                JOIN salary_rules r ON b.rule_id = r.id
                WHERE b.contract_id = ANY($1::uuid[])
                ORDER BY r.category ASC, r.name ASC;
            """, contract_ids)

        benefits_by_contract: Dict[uuid.UUID, List[Any]] = {}
        for b in all_benefits:
            benefits_by_contract.setdefault(b["contract_id"], []).append(b)

        for c in contracts_rows:
            c_dict = serialize_row(dict(c))
            c_id = c["id"]
            benefit_rows = benefits_by_contract.get(c_id, [])

            c_dict["benefit_lines"] = [serialize_row(dict(b)) for b in benefit_rows]

            base_wage = float(c["wage_base"] or 0)
            allowances_total = sum(
                float(b["computed_monthly_total"])
                for b in benefit_rows
                if b["rule_category"] == "allowance"
            )
            deductions_total = sum(
                float(b["computed_monthly_total"])
                for b in benefit_rows
                if b["rule_category"] == "deduction"
            )
            c_dict["allowances_total"] = allowances_total
            c_dict["deductions_total"] = deductions_total
            c_dict["net_package_total"] = round(base_wage + allowances_total - deductions_total, 2)

            # Apply field-level salary masking
            c_dict = mask_contract_payload(c_dict, session)
            contracts.append(c_dict)

        emp_grade = await conn.fetchrow("""
            SELECT e.grade_id, g.name as grade_name, g.code as grade_code
            FROM employees e
            LEFT JOIN employee_grades g ON e.grade_id = g.id
            WHERE e.id = $1;
        """, emp_uuid)

        return {
            "contracts": contracts,
            "total": len(contracts),
            "grade_id": emp_grade["grade_id"] if emp_grade else None,
            "grade_name": emp_grade["grade_name"] if emp_grade else None,
            "grade_code": emp_grade["grade_code"] if emp_grade else None,
        }

@router.post("/api/v1/employees/{employee_id}/contracts")
async def create_employee_contract(
    employee_id: str,
    payload: ContractCreatePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Create a new employee contract and declarative benefit lines.
    Requires hr.contracts_manage to create contract.
    Requires hr.salary_manage to configure base wage and package structure.
    """
    require_permission(session, "hr.contracts_manage")
    if payload.wage_base or (payload.benefit_lines and len(payload.benefit_lines) > 0):
        require_permission(session, "hr.salary_manage")

    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    async with pool.acquire() as conn:
        async with conn.transaction():
            emp = await conn.fetchrow("SELECT id, full_name, employee_number, organization_id FROM employees WHERE id = $1;", emp_uuid)
            if not emp:
                raise HTTPException(status_code=404, detail="Employee not found.")
            verify_record_tenant(emp["organization_id"], session)

            # Generate collision-safe atomic contract reference if missing
            if not payload.contract_reference:
                ref = await get_next_contract_reference(conn, emp_uuid, emp["employee_number"])
            else:
                ref = payload.contract_reference.strip().upper()

            new_contract_id = uuid7()
            start_d = parse_date(payload.start_date)
            end_d = parse_date(payload.end_date)
            wage_base = float(payload.wage_base)
            org_id = emp["organization_id"]

            creator_uid = None
            uid_str = session.get("id") or session.get("user_id")
            if uid_str:
                try:
                    creator_uid = uuid.UUID(str(uid_str))
                except Exception:
                    pass

            initial_status = "draft" if payload.status == "active" else (payload.status or "draft")
            initial_approval = "pending_approval" if payload.status == "active" else "draft"

            await conn.execute("""
                INSERT INTO employee_contracts (
                    id, employee_id, contract_reference, title, start_date, end_date,
                    wage_base, currency, status, notice_period_days, trial_period_days,
                    working_hours_per_week, terms_notes, organization_id,
                    created_by, approval_status
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                );
            """,
                new_contract_id, emp_uuid, ref, payload.title.strip(), start_d, end_d,
                wage_base, payload.currency or "QAR", initial_status,
                payload.notice_period_days or 30, payload.trial_period_days or 90,
                payload.working_hours_per_week or 40.0, payload.terms_notes, org_id,
                creator_uid, initial_approval
            )

            # Look up employee's grade_id
            emp_grade_id = await conn.fetchval("SELECT grade_id FROM employees WHERE id = $1;", emp_uuid)

            # Insert benefit lines if provided
            for line in (payload.benefit_lines or []):
                rule = await conn.fetchrow("SELECT id, name, category, calculation_type, default_amount, percentage_rate FROM salary_rules WHERE id = $1;", line.rule_id)
                if not rule:
                    continue

                calc_type = line.calculation_type or rule["calculation_type"]
                amt_val = float(line.amount_value)

                if calc_type == "grade_based" or rule["calculation_type"] == "grade_based":
                    calc_type = "grade_based"
                    grade_rate = None
                    if emp_grade_id:
                        grade_rate = await conn.fetchval(
                            "SELECT amount FROM salary_rule_grade_rates WHERE rule_id = $1 AND grade_id = $2;",
                            line.rule_id, emp_grade_id
                        )
                    if grade_rate is not None:
                        amt_val = float(grade_rate)
                    elif amt_val <= 0:
                        amt_val = float(rule["default_amount"] or 0.0)
                    computed = round(amt_val, 2)
                elif calc_type == "percentage_of_base":
                    computed = round((wage_base * amt_val) / 100.0, 2)
                else:
                    computed = round(amt_val, 2)

                await conn.execute("""
                    INSERT INTO contract_benefit_lines (
                        id, contract_id, rule_id, calculation_type, amount_value, computed_monthly_total
                    ) VALUES ($1, $2, $3, $4, $5, $6);
                """, uuid.uuid4(), new_contract_id, line.rule_id, calc_type, amt_val, computed)

            # If active, keep employee base salary synchronized
            if payload.status == "active":
                await conn.execute("""
                    UPDATE employees
                    SET base_salary = $1, currency = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3;
                """, wage_base, payload.currency or "QAR", emp_uuid)

            # Audit trail logging
            client_ip = get_client_ip(request)
            await log_contract_audit(
                conn=conn,
                contract_id=str(new_contract_id),
                action="CREATE",
                note=f"Created contract {ref} for {emp['full_name']} (base wage: {wage_base} {payload.currency or 'QAR'}).",
                session=session,
                client_ip=client_ip,
                changes={"wage_base": wage_base, "currency": payload.currency, "status": payload.status}
            )

            created_contract = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", new_contract_id)
            return mask_contract_payload(serialize_row(dict(created_contract)), session)

@router.put("/api/v1/contracts/{contract_id}")
async def update_contract(
    contract_id: str,
    payload: ContractUpdatePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Update contract parameters, duration, wage, or replace benefit lines.
    Requires hr.contracts_manage. Altering wages or package structure requires hr.salary_manage.
    """
    require_permission(session, "hr.contracts_manage")

    wage_or_package_altered = (payload.wage_base is not None) or (payload.benefit_lines is not None)
    if wage_or_package_altered:
        require_permission(session, "hr.salary_manage")

    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract UUID.")

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="Contract not found.")
        verify_record_tenant(existing["organization_id"], session)

        # SOX 404 / ISO 27001 Immutability Guard
        if existing["status"] in ("active", "approved", "posted"):
            raise HTTPException(
                status_code=400,
                detail=f"SOX 404 / ISO 27001 Violation: Contract {existing['contract_reference']} is {existing['status']} and immutable. Direct modification of approved/active terms is prohibited. Use the Contract Amendment workflow (POST /api/v1/contracts/{contract_id}/amend) to create a linked revision."
            )

        emp_uuid = existing["employee_id"]
        ref = payload.contract_reference or existing["contract_reference"]
        title = payload.title or existing["title"]
        start_d = parse_date(payload.start_date) if payload.start_date is not None else existing["start_date"]
        end_d = parse_date(payload.end_date) if payload.end_date is not None else existing["end_date"]
        wage_base = float(payload.wage_base) if payload.wage_base is not None else float(existing["wage_base"])
        currency = payload.currency or existing["currency"]
        status_val = payload.status or existing["status"]
        notice_days = payload.notice_period_days if payload.notice_period_days is not None else existing["notice_period_days"]
        trial_days = payload.trial_period_days if payload.trial_period_days is not None else existing["trial_period_days"]
        hours = payload.working_hours_per_week if payload.working_hours_per_week is not None else float(existing["working_hours_per_week"])
        notes = payload.terms_notes if payload.terms_notes is not None else existing["terms_notes"]

        async with conn.transaction():
            if status_val == "active" and existing["status"] != "active":
                await conn.execute("""
                    UPDATE employee_contracts
                    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
                    WHERE employee_id = $1 AND id != $2 AND status = 'active';
                """, emp_uuid, c_uuid)

            await conn.execute("""
                UPDATE employee_contracts
                SET contract_reference = $1, title = $2, start_date = $3, end_date = $4,
                    wage_base = $5, currency = $6, status = $7, notice_period_days = $8,
                    trial_period_days = $9, working_hours_per_week = $10, terms_notes = $11,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $12;
            """, ref, title, start_d, end_d, wage_base, currency, status_val, notice_days, trial_days, hours, notes, c_uuid)

            # Update benefit lines if payload provided them
            if payload.benefit_lines is not None:
                emp_grade_id = await conn.fetchval("SELECT grade_id FROM employees WHERE id = $1;", emp_uuid)
                await conn.execute("DELETE FROM contract_benefit_lines WHERE contract_id = $1;", c_uuid)
                for line in payload.benefit_lines:
                    rule = await conn.fetchrow("SELECT id, name, category, calculation_type, default_amount, percentage_rate FROM salary_rules WHERE id = $1;", line.rule_id)
                    calc_type = line.calculation_type or (rule["calculation_type"] if rule else "fixed_amount")
                    amt_val = float(line.amount_value)

                    if calc_type == "grade_based" or (rule and rule["calculation_type"] == "grade_based"):
                        calc_type = "grade_based"
                        grade_rate = None
                        if emp_grade_id:
                            grade_rate = await conn.fetchval(
                                "SELECT amount FROM salary_rule_grade_rates WHERE rule_id = $1 AND grade_id = $2;",
                                line.rule_id, emp_grade_id
                            )
                        if grade_rate is not None:
                            amt_val = float(grade_rate)
                        elif amt_val <= 0 and rule:
                            amt_val = float(rule["default_amount"] or 0.0)
                        computed = round(amt_val, 2)
                    elif calc_type == "percentage_of_base":
                        computed = round((wage_base * amt_val) / 100.0, 2)
                    else:
                        computed = round(amt_val, 2)

                    await conn.execute("""
                        INSERT INTO contract_benefit_lines (
                            id, contract_id, rule_id, calculation_type, amount_value, computed_monthly_total
                        ) VALUES ($1, $2, $3, $4, $5, $6);
                    """, uuid.uuid4(), c_uuid, line.rule_id, calc_type, amt_val, computed)

            # Sync employee base salary if active
            if status_val == "active":
                await conn.execute("""
                    UPDATE employees
                    SET base_salary = $1, currency = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3;
                """, wage_base, currency, emp_uuid)

            # Audit trail logging
            client_ip = get_client_ip(request)
            audit_note = f"Updated contract {ref}."
            if wage_or_package_altered:
                audit_note += f" Compensation modified: base={wage_base} {currency}."
            await log_contract_audit(
                conn=conn,
                contract_id=str(c_uuid),
                action="UPDATE",
                note=audit_note,
                session=session,
                client_ip=client_ip,
                changes={"wage_base": wage_base, "status": status_val}
            )

        updated = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        return mask_contract_payload(serialize_row(dict(updated)), session)

@router.post("/api/v1/contracts/{contract_id}/activate")
async def activate_contract(
    contract_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Sets selected contract to active status.
    Requires hr.contracts_manage.
    """
    require_permission(session, "hr.contracts_manage")

    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract UUID.")

    async with pool.acquire() as conn:
        contract = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        if not contract:
            raise HTTPException(status_code=404, detail="Contract not found.")
        verify_record_tenant(contract["organization_id"], session)

        user_id = None
        uid_str = session.get("id") or session.get("user_id")
        if uid_str:
            try:
                user_id = uuid.UUID(str(uid_str))
            except Exception:
                pass

        # SOX 404 Maker-Checker Dual Control Hard Guard
        if contract["created_by"] and user_id and str(user_id) == str(contract["created_by"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SOX 404 Maker-Checker Violation: You cannot activate/approve a contract that you created. Dual control requires an independent checker."
            )
        if contract["submitted_by"] and user_id and str(user_id) == str(contract["submitted_by"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SOX 404 Maker-Checker Violation: You cannot activate/approve a contract that you submitted for approval. Dual control requires an independent checker."
            )

        emp_uuid = contract["employee_id"]

        async with conn.transaction():
            # 1. Demote previous active contracts for this employee
            await conn.execute("""
                UPDATE employee_contracts
                SET status = 'expired', updated_at = CURRENT_TIMESTAMP
                WHERE employee_id = $1 AND id != $2 AND status = 'active';
            """, emp_uuid, c_uuid)

            # 2. Set this contract to active and approved
            await conn.execute("""
                UPDATE employee_contracts
                SET status = 'active',
                    approval_status = 'approved',
                    approved_by = $2,
                    approved_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1;
            """, c_uuid, user_id)

            # 3. Synchronize employee record base salary and currency
            await conn.execute("""
                UPDATE employees
                SET base_salary = $1, currency = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3;
            """, float(contract["wage_base"]), contract["currency"], emp_uuid)

            # Audit trail logging
            client_ip = get_client_ip(request)
            await log_contract_audit(
                conn=conn,
                contract_id=str(c_uuid),
                action="ACTIVATE",
                note=f"Activated and approved contract {contract['contract_reference']} under SOX 404 Dual Control.",
                session=session,
                client_ip=client_ip,
                changes={"status": "active", "approval_status": "approved", "approved_by": str(user_id) if user_id else None}
            )

        activated = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        return mask_contract_payload(serialize_row(dict(activated)), session)


@router.post("/api/v1/contracts/{contract_id}/submit")
async def submit_contract_for_approval(
    contract_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Submits a draft contract for independent checker approval.
    Sets approval_status to 'pending_approval' and records audit log.
    """
    require_permission(session, "hr.contracts_manage")
    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract UUID.")

    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    async with pool.acquire() as conn:
        contract = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        if not contract:
            raise HTTPException(status_code=404, detail="Contract not found.")
        verify_record_tenant(contract["organization_id"], session)

        if contract["status"] == "active" or contract["approval_status"] == "approved":
            raise HTTPException(status_code=400, detail="Contract is already approved and active.")

        await conn.execute("""
            UPDATE employee_contracts
            SET approval_status = 'pending_approval',
                submitted_by = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """, c_uuid, user_id)

        client_ip = get_client_ip(request)
        await log_contract_audit(
            conn=conn,
            contract_id=str(c_uuid),
            action="SUBMIT_FOR_APPROVAL",
            note=f"Submitted contract {contract['contract_reference']} for dual-control approval.",
            session=session,
            client_ip=client_ip,
            changes={"approval_status": "pending_approval", "submitted_by": str(user_id) if user_id else None}
        )

        updated = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        return mask_contract_payload(serialize_row(dict(updated)), session)


@router.post("/api/v1/contracts/{contract_id}/approve")
async def approve_contract(
    contract_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Checker Dual-Control Approval: Activates contract and verifies approved_by != created_by and approved_by != submitted_by.
    """
    return await activate_contract(contract_id, request, session)


@router.post("/api/v1/contracts/{contract_id}/reject")
async def reject_contract(
    contract_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Rejects a submitted contract under dual-control review.
    Sets approval_status to 'rejected'.
    """
    require_permission(session, "hr.contracts_manage")
    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract UUID.")

    user_id = None
    uid_str = session.get("id") or session.get("user_id")
    if uid_str:
        try:
            user_id = uuid.UUID(str(uid_str))
        except Exception:
            pass

    async with pool.acquire() as conn:
        contract = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        if not contract:
            raise HTTPException(status_code=404, detail="Contract not found.")
        verify_record_tenant(contract["organization_id"], session)

        if contract["approval_status"] == "approved":
            raise HTTPException(status_code=400, detail="Cannot reject an approved contract.")

        await conn.execute("""
            UPDATE employee_contracts
            SET approval_status = 'rejected',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """, c_uuid)

        client_ip = get_client_ip(request)
        await log_contract_audit(
            conn=conn,
            contract_id=str(c_uuid),
            action="REJECT",
            note=f"Rejected contract {contract['contract_reference']} under SOX 404 Dual Control review.",
            session=session,
            client_ip=client_ip,
            changes={"approval_status": "rejected"}
        )

        updated = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        return mask_contract_payload(serialize_row(dict(updated)), session)

@router.post("/api/v1/contracts/{contract_id}/benefits")
async def add_contract_benefit(
    contract_id: str,
    line: BenefitLinePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Add a new dynamic benefit or deduction line to a contract.
    Requires hr.salary_manage.
    """
    require_permission(session, "hr.salary_manage")

    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract UUID.")

    async with pool.acquire() as conn:
        contract = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        if not contract:
            raise HTTPException(status_code=404, detail="Contract not found.")
        verify_record_tenant(contract["organization_id"], session)

        # SOX 404 / ISO 27001 Immutability Guard
        if contract["status"] in ("active", "approved", "posted"):
            raise HTTPException(
                status_code=400,
                detail=f"SOX 404 / ISO 27001 Violation: Contract {contract['contract_reference']} is {contract['status']} and immutable. Cannot attach benefit lines directly. Use the Contract Amendment workflow."
            )

        emp_uuid = contract["employee_id"]
        emp_grade_id = await conn.fetchval("SELECT grade_id FROM employees WHERE id = $1;", emp_uuid)
        rule = await conn.fetchrow("SELECT id, name, category, calculation_type, default_amount, percentage_rate FROM salary_rules WHERE id = $1;", line.rule_id)

        wage_base = float(contract["wage_base"] or 0)
        calc_type = line.calculation_type or (rule["calculation_type"] if rule else "fixed_amount")
        amt_val = float(line.amount_value)

        if calc_type == "grade_based" or (rule and rule["calculation_type"] == "grade_based"):
            calc_type = "grade_based"
            grade_rate = None
            if emp_grade_id:
                grade_rate = await conn.fetchval(
                    "SELECT amount FROM salary_rule_grade_rates WHERE rule_id = $1 AND grade_id = $2;",
                    line.rule_id, emp_grade_id
                )
            if grade_rate is not None:
                amt_val = float(grade_rate)
            elif amt_val <= 0 and rule:
                amt_val = float(rule["default_amount"] or 0.0)
            computed = round(amt_val, 2)
        elif calc_type == "percentage_of_base":
            computed = round((wage_base * amt_val) / 100.0, 2)
        else:
            computed = round(amt_val, 2)

        line_id = uuid.uuid4()
        async with conn.transaction():
            await conn.execute("""
                INSERT INTO contract_benefit_lines (
                    id, contract_id, rule_id, calculation_type, amount_value, computed_monthly_total
                ) VALUES ($1, $2, $3, $4, $5, $6);
            """, line_id, c_uuid, line.rule_id, calc_type, amt_val, computed)

            # Audit trail logging
            client_ip = get_client_ip(request)
            await log_contract_audit(
                conn=conn,
                contract_id=str(c_uuid),
                action="BENEFIT_ADD",
                note=f"Attached benefit rule {line.rule_id} ({calc_type}: {amt_val}) to contract {contract['contract_reference']}.",
                session=session,
                client_ip=client_ip,
                changes={"rule_id": line.rule_id, "amount_value": amt_val, "computed_total": computed}
            )

        created = await conn.fetchrow("""
            SELECT b.*, r.name AS rule_name, r.category AS rule_category, r.wps_code
            FROM contract_benefit_lines b
            JOIN salary_rules r ON b.rule_id = r.id
            WHERE b.id = $1;
        """, line_id)
        return serialize_row(dict(created))

@router.delete("/api/v1/contracts/{contract_id}/benefits/{benefit_id}")
async def delete_contract_benefit(
    contract_id: str,
    benefit_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Remove a benefit line from a contract.
    Requires hr.salary_manage.
    """
    require_permission(session, "hr.salary_manage")

    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
        b_uuid = uuid.UUID(benefit_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid UUID.")

    async with pool.acquire() as conn:
        contract = await conn.fetchrow("SELECT status, organization_id FROM employee_contracts WHERE id = $1;", c_uuid)
        if not contract:
            raise HTTPException(status_code=404, detail="Contract not found.")
        verify_record_tenant(contract["organization_id"], session)
        c_status = contract["status"]
        if c_status in ("active", "approved", "posted"):
            raise HTTPException(
                status_code=400,
                detail=f"SOX 404 / ISO 27001 Violation: Contract is {c_status} and immutable. Cannot remove benefit lines directly. Use the Contract Amendment workflow."
            )

        # Check rule details for audit trail
        b_row = await conn.fetchrow("SELECT rule_id, amount_value FROM contract_benefit_lines WHERE id = $1 AND contract_id = $2;", b_uuid, c_uuid)

        async with conn.transaction():
            res = await conn.execute("DELETE FROM contract_benefit_lines WHERE id = $1 AND contract_id = $2;", b_uuid, c_uuid)
            if res == "DELETE 0":
                raise HTTPException(status_code=404, detail="Benefit line not found.")

            # Audit trail logging
            client_ip = get_client_ip(request)
            rule_name = b_row["rule_id"] if b_row else str(b_uuid)
            await log_contract_audit(
                conn=conn,
                contract_id=str(c_uuid),
                action="BENEFIT_REMOVE",
                note=f"Removed benefit rule {rule_name} from contract.",
                session=session,
                client_ip=client_ip
            )

        return {"success": True, "deleted_id": str(b_uuid)}


@router.delete("/api/v1/contracts/{contract_id}")
async def delete_contract(
    contract_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Deletes an unapproved draft contract.
    SOX 404 Guard: Active or approved contracts are legally immutable and cannot be deleted.
    """
    require_permission(session, "hr.contracts_manage")
    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract UUID.")

    async with pool.acquire() as conn:
        contract = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        if not contract:
            raise HTTPException(status_code=404, detail="Contract not found.")
        verify_record_tenant(contract["organization_id"], session)

        if contract["status"] in ("active", "approved", "posted"):
            raise HTTPException(
                status_code=400,
                detail=f"SOX 404 / ISO 27001 Violation: Cannot delete contract {contract['contract_reference']} with status '{contract['status']}'. Approved/active records are immutable. Use the cancellation state transition (POST /api/v1/contracts/{contract_id}/cancel)."
            )

        client_ip = get_client_ip(request)
        await log_contract_audit(
            conn=conn,
            contract_id=str(c_uuid),
            action="DELETE",
            note=f"Deleted draft contract {contract['contract_reference']}.",
            session=session,
            client_ip=client_ip
        )
        await conn.execute("DELETE FROM employee_contracts WHERE id = $1;", c_uuid)
        return {"success": True, "deleted_id": str(c_uuid)}


@router.post("/api/v1/contracts/{contract_id}/amend")
async def amend_contract(
    contract_id: str,
    payload: ContractAmendPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    SOX 404 / ISO 27001 Formal Contract Amendment State Transition.
    Preserves the original approved/active contract intact with status 'amended',
    and generates a linked revision contract referencing the original.
    """
    require_permission(session, "hr.contracts_manage")
    if payload.wage_base is not None or payload.benefit_lines is not None:
        require_permission(session, "hr.salary_manage")

    clean_reason = (payload.amendment_reason or "").strip()
    if not clean_reason:
        raise HTTPException(status_code=400, detail="An auditable amendment_reason is required by SOX 404 compliance.")

    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract UUID.")

    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
            if not existing:
                raise HTTPException(status_code=404, detail="Contract not found.")
            verify_record_tenant(existing["organization_id"], session)

            if existing["status"] not in ("active", "approved"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Only active or approved contracts can be amended. Current status is '{existing['status']}'."
                )

            emp_uuid = existing["employee_id"]
            emp = await conn.fetchrow("SELECT id, full_name, organization_id, grade_id FROM employees WHERE id = $1;", emp_uuid)

            # 1. Compute revision sequence and amendment reference
            current_rev = existing["revision_number"] or 1
            next_rev = current_rev + 1
            base_ref = existing["contract_reference"].split("-AMD")[0]
            new_ref = f"{base_ref}-AMD{next_rev}"

            new_contract_id = uuid7()
            start_d = parse_date(payload.start_date) if payload.start_date is not None else existing["start_date"]
            end_d = parse_date(payload.end_date) if payload.end_date is not None else existing["end_date"]
            wage_base = float(payload.wage_base) if payload.wage_base is not None else float(existing["wage_base"])
            currency = payload.currency or existing["currency"]
            title = payload.title or existing["title"]
            notice_days = payload.notice_period_days if payload.notice_period_days is not None else existing["notice_period_days"]
            trial_days = payload.trial_period_days if payload.trial_period_days is not None else existing["trial_period_days"]
            hours = payload.working_hours_per_week if payload.working_hours_per_week is not None else float(existing["working_hours_per_week"])
            notes = payload.terms_notes if payload.terms_notes is not None else existing["terms_notes"]

            # 2. Transition original contract to 'amended' (core terms preserved)
            upd_res = await conn.execute("""
                UPDATE employee_contracts
                SET status = 'amended', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND status IN ('active', 'approved');
            """, c_uuid)
            if upd_res == "UPDATE 0":
                raise HTTPException(status_code=409, detail="Contract status was concurrently modified.")

            # 3. Insert newly issued revision contract
            await conn.execute("""
                INSERT INTO employee_contracts (
                    id, employee_id, contract_reference, title, start_date, end_date,
                    wage_base, currency, status, notice_period_days, trial_period_days,
                    working_hours_per_week, terms_notes, organization_id,
                    amendment_of_id, amendment_reason, revision_number
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, $12, $13, $14, $15, $16
                );
            """,
                new_contract_id, emp_uuid, new_ref, title, start_d, end_d,
                wage_base, currency, notice_days, trial_days, hours, notes,
                existing["organization_id"], c_uuid, clean_reason, next_rev
            )

            # 4. Attach benefit lines
            emp_grade_id = emp["grade_id"] if emp else None
            if payload.benefit_lines is not None:
                lines_to_add = payload.benefit_lines
            else:
                old_lines = await conn.fetch("SELECT rule_id, calculation_type, amount_value FROM contract_benefit_lines WHERE contract_id = $1;", c_uuid)
                lines_to_add = [BenefitLinePayload(rule_id=ol["rule_id"], calculation_type=ol["calculation_type"], amount_value=float(ol["amount_value"])) for ol in old_lines]

            for line in lines_to_add:
                rule = await conn.fetchrow("SELECT id, name, category, calculation_type, default_amount, percentage_rate FROM salary_rules WHERE id = $1;", line.rule_id)
                calc_type = line.calculation_type or (rule["calculation_type"] if rule else "fixed_amount")
                amt_val = float(line.amount_value)

                if calc_type == "grade_based" or (rule and rule["calculation_type"] == "grade_based"):
                    calc_type = "grade_based"
                    grade_rate = None
                    if emp_grade_id:
                        grade_rate = await conn.fetchval(
                            "SELECT amount FROM salary_rule_grade_rates WHERE rule_id = $1 AND grade_id = $2;",
                            line.rule_id, emp_grade_id
                        )
                    if grade_rate is not None:
                        amt_val = float(grade_rate)
                    elif amt_val <= 0 and rule:
                        amt_val = float(rule["default_amount"] or 0.0)
                    computed = round(amt_val, 2)
                elif calc_type == "percentage_of_base":
                    computed = round((wage_base * amt_val) / 100.0, 2)
                else:
                    computed = round(amt_val, 2)

                await conn.execute("""
                    INSERT INTO contract_benefit_lines (
                        id, contract_id, rule_id, calculation_type, amount_value, computed_monthly_total
                    ) VALUES ($1, $2, $3, $4, $5, $6);
                """, uuid.uuid4(), new_contract_id, line.rule_id, calc_type, amt_val, computed)

            # 5. Synchronize employee record base salary
            await conn.execute("""
                UPDATE employees
                SET base_salary = $1, currency = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3;
            """, wage_base, currency, emp_uuid)

            # 6. Cryptographically chained audit logging
            client_ip = get_client_ip(request)
            await log_contract_audit(
                conn=conn,
                contract_id=str(c_uuid),
                action="AMEND_SUPERSEDED",
                note=f"Contract {existing['contract_reference']} superseded by amendment {new_ref}. Reason: {clean_reason}",
                session=session,
                client_ip=client_ip,
                changes={"amended_by": str(new_contract_id), "status": "amended"}
            )
            await log_contract_audit(
                conn=conn,
                contract_id=str(new_contract_id),
                action="AMEND_CREATED",
                note=f"Issued contract amendment {new_ref} (Revision {next_rev}) for {emp['full_name'] if emp else 'Employee'}. Reason: {clean_reason}",
                session=session,
                client_ip=client_ip,
                changes={"amendment_of": str(c_uuid), "revision_number": next_rev, "wage_base": wage_base, "currency": currency}
            )

            created_row = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", new_contract_id)
            c_dict = serialize_row(dict(created_row))
            benefit_rows = await conn.fetch("""
                SELECT b.*, r.name AS rule_name, r.category AS rule_category, r.wps_code
                FROM contract_benefit_lines b
                JOIN salary_rules r ON b.rule_id = r.id
                WHERE b.contract_id = $1;
            """, new_contract_id)
            c_dict["benefit_lines"] = [serialize_row(dict(b)) for b in benefit_rows]
            return mask_contract_payload(c_dict, session)


@router.post("/api/v1/contracts/{contract_id}/cancel")
async def cancel_contract(
    contract_id: str,
    payload: ContractCancelPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    SOX 404 / ISO 27001 Formal Contract Cancellation / Termination State Transition.
    Transitions contract status to 'cancelled' without mutating prior terms, preserving the historical record.
    """
    require_permission(session, "hr.contracts_manage")
    clean_reason = (payload.cancellation_reason or "").strip()
    if not clean_reason:
        raise HTTPException(status_code=400, detail="An auditable cancellation_reason is required by SOX 404 compliance.")

    pool = get_db_pool()
    try:
        c_uuid = uuid.UUID(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract UUID.")

    async with pool.acquire() as conn:
        contract = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        if not contract:
            raise HTTPException(status_code=404, detail="Contract not found.")
        verify_record_tenant(contract["organization_id"], session)

        if contract["status"] in ("cancelled", "terminated", "expired"):
            raise HTTPException(status_code=400, detail=f"Contract is already {contract['status']}.")

        await conn.execute("""
            UPDATE employee_contracts
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """, c_uuid)

        client_ip = get_client_ip(request)
        await log_contract_audit(
            conn=conn,
            contract_id=str(c_uuid),
            action="CANCEL",
            note=f"Cancelled contract {contract['contract_reference']}. Reason: {clean_reason}",
            session=session,
            client_ip=client_ip,
            changes={"status": "cancelled", "reason": clean_reason}
        )

        updated = await conn.fetchrow("SELECT * FROM employee_contracts WHERE id = $1;", c_uuid)
        return mask_contract_payload(serialize_row(dict(updated)), session)
