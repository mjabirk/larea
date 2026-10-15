import uuid
import datetime
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request, Depends, Query, Header
from pydantic import BaseModel
from backend.core.database import get_db_pool
from backend.core.dependencies import (
    get_current_user_session,
    get_client_ip,
    check_permission,
    require_permission,
)
from backend.core.chat_engine import handle_employee_department_sync

logger = logging.getLogger("enterprise.employees")

def mask_employee_salary(emp: Dict[str, Any], session: Dict[str, Any]) -> Dict[str, Any]:
    if not check_permission(session, "hr.salary_read"):
        emp["base_salary"] = None
    return emp

router = APIRouter(prefix="/api/v1/employees", tags=["Employees"])


class EmployeePayload(BaseModel):
    employee_number: Optional[str] = None
    first_name: str
    last_name: str
    full_name: Optional[str] = None
    display_name_local: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    marital_status: Optional[str] = None
    nationality: Optional[str] = None

    job_title: Optional[str] = None
    department_id: Optional[str] = "Operations"
    branch_id: Optional[str] = None
    manager_id: Optional[str] = None
    employment_type: Optional[str] = "Full-Time"
    hire_date: Optional[str] = None
    probation_end_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    status: Optional[str] = "Active"

    national_id_number: Optional[str] = None
    national_id_expiry: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    visa_number: Optional[str] = None
    visa_expiry: Optional[str] = None
    work_permit_status: Optional[str] = "Valid"

    work_email: Optional[str] = None
    personal_email: Optional[str] = None
    phone_country_code: Optional[str] = "+974"
    phone_number: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None

    base_salary: Optional[float] = 0.0
    currency: Optional[str] = "QAR"
    payment_method: Optional[str] = "Bank Transfer / WPS"
    bank_name: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_swift: Optional[str] = None
    organization_id: Optional[str] = None
    grade_id: Optional[str] = None


def parse_date(d_str: Optional[str]) -> Optional[datetime.date]:
    if not d_str:
        return None
    try:
        clean = str(d_str).split("T")[0].strip()
        return datetime.date.fromisoformat(clean)
    except Exception:
        return None


def serialize_employee(r: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to convert date objects to ISO strings."""
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


@router.get("")
async def list_employees(
    q: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Retrieve employee records with SQL-level filtering, tenant isolation, and salary masking."""
    require_permission(session, "employees.read")
    org_id = session.get("organization_id")

    pool = get_db_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT e.*, g.name as grade_name, g.code as grade_code
            FROM employees e
            LEFT JOIN employee_grades g ON e.grade_id = g.id
            WHERE 1=1
        """
        params: List[Any] = []
        idx = 1

        if not session.get("is_superadmin") and org_id:
            query += f" AND e.organization_id = ${idx}::uuid"
            params.append(org_id)
            idx += 1

        if isinstance(q, str) and q.strip():
            query += f""" AND (
                e.full_name ILIKE ${idx}
                OR e.employee_number ILIKE ${idx}
                OR e.job_title ILIKE ${idx}
                OR COALESCE(e.national_id_number, '') ILIKE ${idx}
            )"""
            params.append(f"%{q.strip()}%")
            idx += 1

        if isinstance(department, str) and department.upper() != "ALL":
            query += f" AND e.department_id = ${idx}"
            params.append(department)
            idx += 1

        limit_val = limit if isinstance(limit, int) else 200
        offset_val = offset if isinstance(offset, int) else 0
        query += f" ORDER BY e.employee_number ASC LIMIT ${idx} OFFSET ${idx + 1};"
        params.extend([limit_val, offset_val])

        rows = await conn.fetch(query, *params)
        employees = [mask_employee_salary(serialize_employee(dict(r)), session) for r in rows]
        return {"employees": employees, "total": len(employees)}

@router.get("/{employee_id}")
async def get_employee(
    employee_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Retrieve detailed employee record by UUID with salary masking."""
    require_permission(session, "employees.read")
    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT e.*, g.name as grade_name, g.code as grade_code
            FROM employees e
            LEFT JOIN employee_grades g ON e.grade_id = g.id
            WHERE e.id = $1;
        """, emp_uuid)
        if not row:
            raise HTTPException(status_code=404, detail="Employee not found.")
        return mask_employee_salary(serialize_employee(dict(row)), session)


@router.post("")
async def create_employee(
    payload: EmployeePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Create new employee record and log CREATE in audit trail."""
    require_permission(session, "employees.create")
    pool = get_db_pool()
    new_id = uuid.uuid4()

    # Generate employee number if missing
    async with pool.acquire() as conn:
        if not payload.employee_number:
            max_num = await conn.fetchval("""
                SELECT MAX(CAST(SUBSTRING(employee_number FROM 5) AS INT))
                FROM employees
                WHERE employee_number ~ '^EMP-[0-9]+$';
            """) or 1000
            emp_number = f"EMP-{max_num + 1}"
        else:
            emp_number = payload.employee_number.strip().upper()

        full_name = payload.full_name or f"{payload.first_name.strip()} {payload.last_name.strip()}"

        client_ip = get_client_ip(request) if request else "127.0.0.1"
        branch_uuid = uuid.UUID(payload.branch_id) if payload.branch_id else await conn.fetchval("SELECT id FROM branches LIMIT 1;")
        org_uuid = uuid.UUID(payload.organization_id) if payload.organization_id else await conn.fetchval("SELECT id FROM organizations LIMIT 1;")

        await conn.execute("""
            INSERT INTO employees (
                id, employee_number, first_name, last_name, full_name, display_name_local,
                gender, date_of_birth, marital_status, nationality, job_title, department_id,
                branch_id, employment_type, hire_date, probation_end_date, contract_end_date, status,
                national_id_number, national_id_expiry, passport_number, passport_expiry,
                visa_number, visa_expiry, work_permit_status, work_email, personal_email,
                phone_country_code, phone_number, emergency_contact_name, emergency_contact_phone,
                emergency_contact_relation, base_salary, currency, payment_method, bank_name,
                bank_iban, bank_swift, organization_id, grade_id
            ) VALUES (
                $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                $13::uuid, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
                $32, $33, $34, $35, $36, $37, $38, $39::uuid, $40
            );
        """,
            new_id, emp_number, payload.first_name.strip(), payload.last_name.strip(), full_name,
            payload.display_name_local, payload.gender, parse_date(payload.date_of_birth), payload.marital_status,
            payload.nationality, payload.job_title, payload.department_id, branch_uuid,
            payload.employment_type, parse_date(payload.hire_date), parse_date(payload.probation_end_date),
            parse_date(payload.contract_end_date), payload.status, payload.national_id_number,
            parse_date(payload.national_id_expiry), payload.passport_number, parse_date(payload.passport_expiry),
            payload.visa_number, parse_date(payload.visa_expiry), payload.work_permit_status,
            payload.work_email, payload.personal_email, payload.phone_country_code,
            payload.phone_number, payload.emergency_contact_name, payload.emergency_contact_phone,
            payload.emergency_contact_relation, payload.base_salary, payload.currency,
            payload.payment_method, payload.bank_name, payload.bank_iban, payload.bank_swift, org_uuid,
            payload.grade_id.strip() if payload.grade_id and payload.grade_id.strip() else None
        )

        user_id, author_name = await resolve_audit_author(conn, session)

        # Log creation in audit_logs
        await conn.execute("""
            INSERT INTO audit_logs (
                id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, note, ip_address
            ) VALUES (
                $1::uuid, 'employees', $2, 'CREATE', $3, $4,
                $5, $6
            );
        """, str(uuid.uuid4()), str(new_id), user_id, author_name, f"Created employee profile for {full_name} ({emp_number}).", client_ip)

        created_row = await conn.fetchrow("""
            SELECT e.*, g.name as grade_name, g.code as grade_code
            FROM employees e
            LEFT JOIN employee_grades g ON e.grade_id = g.id
            WHERE e.id = $1;
        """, new_id)

        # Trigger Automatic Department Sync Hook
        try:
            await handle_employee_department_sync(
                employee_id=new_id,
                new_dept_name=payload.department_id,
                old_dept_name=None,
                is_terminated=(str(payload.status or "").lower() == "terminated"),
                emp_name=full_name
            )
        except Exception as e:
            logger.warning(f"Department chat sync error during employee creation: {e}")

        return mask_employee_salary(serialize_employee(dict(created_row)), session)


@router.put("/{employee_id}")
async def update_employee(
    employee_id: str,
    payload: EmployeePayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Update employee record with Backend Change-Tracking Interceptor.
    Calculates field-level diffs and stores in audit_logs.
    """
    require_permission(session, "employees.update")
    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM employees WHERE id = $1;", emp_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="Employee not found.")

        old_dict = serialize_employee(dict(existing))
        full_name = payload.full_name or f"{payload.first_name.strip()} {payload.last_name.strip()}"
        client_ip = get_client_ip(request) if request else "127.0.0.1"

        # Compare incoming fields against old fields for field-level diff
        diff_keys = [
            ("job_title", payload.job_title),
            ("base_salary", payload.base_salary),
            ("department_id", payload.department_id),
            ("grade_id", payload.grade_id),
            ("status", payload.status),
            ("employment_type", payload.employment_type),
            ("national_id_number", payload.national_id_number),
            ("national_id_expiry", payload.national_id_expiry),
            ("visa_number", payload.visa_number),
            ("visa_expiry", payload.visa_expiry),
            ("passport_number", payload.passport_number),
            ("work_permit_status", payload.work_permit_status),
            ("work_email", payload.work_email),
            ("bank_name", payload.bank_name),
            ("bank_iban", payload.bank_iban),
            ("currency", payload.currency),
            ("payment_method", payload.payment_method),
        ]

        changes_diff = {}
        for key, new_val in diff_keys:
            old_val = old_dict.get(key)
            # Normalize for comparison
            if str(old_val or "") != str(new_val or ""):
                changes_diff[key] = {
                    "old": old_val,
                    "new": new_val
                }

        old_grade_id = existing["grade_id"]
        new_grade_id = payload.grade_id.strip() if payload.grade_id and payload.grade_id.strip() else None

        # Perform database update
        await conn.execute("""
            UPDATE employees SET
                first_name = $2,
                last_name = $3,
                full_name = $4,
                display_name_local = $5,
                gender = $6,
                date_of_birth = $7,
                marital_status = $8,
                nationality = $9,
                job_title = $10,
                department_id = $11,
                employment_type = $12,
                hire_date = $13,
                probation_end_date = $14,
                contract_end_date = $15,
                status = $16,
                national_id_number = $17,
                national_id_expiry = $18,
                passport_number = $19,
                passport_expiry = $20,
                visa_number = $21,
                visa_expiry = $22,
                work_permit_status = $23,
                work_email = $24,
                personal_email = $25,
                phone_country_code = $26,
                phone_number = $27,
                emergency_contact_name = $28,
                emergency_contact_phone = $29,
                emergency_contact_relation = $30,
                base_salary = $31,
                currency = $32,
                payment_method = $33,
                bank_name = $34,
                bank_iban = $35,
                bank_swift = $36,
                grade_id = $37,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        """,
            emp_uuid, payload.first_name.strip(), payload.last_name.strip(), full_name,
            payload.display_name_local, payload.gender, parse_date(payload.date_of_birth), payload.marital_status,
            payload.nationality, payload.job_title, payload.department_id,
            payload.employment_type, parse_date(payload.hire_date), parse_date(payload.probation_end_date),
            parse_date(payload.contract_end_date), payload.status, payload.national_id_number,
            parse_date(payload.national_id_expiry), payload.passport_number, parse_date(payload.passport_expiry),
            payload.visa_number, parse_date(payload.visa_expiry), payload.work_permit_status,
            payload.work_email, payload.personal_email, payload.phone_country_code,
            payload.phone_number, payload.emergency_contact_name, payload.emergency_contact_phone,
            payload.emergency_contact_relation, payload.base_salary, payload.currency,
            payload.payment_method, payload.bank_name, payload.bank_iban, payload.bank_swift,
            new_grade_id
        )

        # If grade_id changed, automatically update active contract benefit lines configured with grade_based
        if new_grade_id and old_grade_id != new_grade_id:
            active_contract = await conn.fetchrow("""
                SELECT id FROM employee_contracts
                WHERE employee_id = $1 AND status = 'active'
                ORDER BY created_at DESC LIMIT 1;
            """, emp_uuid)
            if active_contract:
                gb_lines = await conn.fetch("""
                    SELECT cbl.id, cbl.rule_id
                    FROM contract_benefit_lines cbl
                    JOIN salary_rules sr ON cbl.rule_id = sr.id
                    WHERE cbl.contract_id = $1 AND (cbl.calculation_type = 'grade_based' OR sr.calculation_type = 'grade_based');
                """, active_contract["id"])
                for gbl in gb_lines:
                    rate = await conn.fetchval("""
                        SELECT amount FROM salary_rule_grade_rates
                        WHERE rule_id = $1 AND grade_id = $2;
                    """, gbl["rule_id"], new_grade_id)
                    if rate is not None:
                        new_amt = float(rate)
                        await conn.execute("""
                            UPDATE contract_benefit_lines
                            SET amount_value = $1, computed_monthly_total = $1
                            WHERE id = $2;
                        """, new_amt, gbl["id"])

        user_id, author_name = await resolve_audit_author(conn, session)

        # Log changes in audit_logs if diff exists
        if changes_diff:
            import json
            await conn.execute("""
                INSERT INTO audit_logs (
                    id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, changes, note, ip_address
                ) VALUES (
                    $1::uuid, 'employees', $2, 'UPDATE', $3, $4,
                    $5::jsonb, $6, $7
                );
            """, str(uuid.uuid4()), str(emp_uuid), user_id, author_name, json.dumps(changes_diff),
                f"Updated {len(changes_diff)} fields on employee profile.", client_ip)

        updated_row = await conn.fetchrow("""
            SELECT e.*, g.name as grade_name, g.code as grade_code
            FROM employees e
            LEFT JOIN employee_grades g ON e.grade_id = g.id
            WHERE e.id = $1;
        """, emp_uuid)

        # Trigger Automatic Department Sync Hook (Department transfer or termination)
        old_dept = existing["department_id"]
        new_dept = payload.department_id
        is_term = (str(payload.status or "").lower() == "terminated")
        dept_changed = (str(old_dept or "").strip() != str(new_dept or "").strip())
        if is_term or dept_changed:
            try:
                await handle_employee_department_sync(
                    employee_id=emp_uuid,
                    new_dept_name=new_dept if not is_term else None,
                    old_dept_name=old_dept,
                    is_terminated=is_term,
                    emp_name=full_name
                )
            except Exception as e:
                logger.warning(f"Department chat sync error during employee update: {e}")

        return mask_employee_salary(serialize_employee(dict(updated_row)), session)


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """Delete employee and log DELETE in audit trail."""
    require_permission(session, "employees.delete")
    pool = get_db_pool()
    try:
        emp_uuid = uuid.UUID(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee UUID.")

    async with pool.acquire() as conn:
        emp = await conn.fetchrow("SELECT full_name, employee_number FROM employees WHERE id = $1;", emp_uuid)
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")

        client_ip = get_client_ip(request) if request else "127.0.0.1"
        user_id, author_name = await resolve_audit_author(conn, session)

        await conn.execute("DELETE FROM employees WHERE id = $1;", emp_uuid)

        await conn.execute("""
            INSERT INTO audit_logs (
                id, entity_type, entity_id, action, changed_by_user_id, changed_by_name, note, ip_address
            ) VALUES (
                $1::uuid, 'employees', $2, 'DELETE', $3, $4, $5, $6
            );
        """, str(uuid.uuid4()), str(emp_uuid), user_id, author_name, f"Deleted employee record: {emp['full_name']} ({emp['employee_number']}).", client_ip)

    return {"status": "success", "message": "Employee deleted."}
