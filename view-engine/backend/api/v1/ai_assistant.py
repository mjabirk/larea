"""
Permission-Scoped Enterprise AI Assistant.
Strictly enforces authenticated user RBAC permissions, organization/branch scope boundaries,
and confidential compensation/salary visibility rules.

Compliant with SOX 404, ISO 27001 audit logging, and Row-Level Security (RLS).
"""

import asyncio
import datetime
import json
import logging
import re
import urllib.request
import urllib.error
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from backend.core.config import settings
from backend.core.database import get_db_pool, log_audit_event
from backend.core.dependencies import (
    build_branch_filter,
    can_read_salary,
    check_permission,
    get_client_ip,
    get_current_user_session,
    tenant_db_context,
)

logger = logging.getLogger("enterprise.ai_assistant")

router = APIRouter(prefix="/api/v1/ai", tags=["AI Assistant"])


class AIQueryPayload(BaseModel):
    query: str
    conversation_history: Optional[List[Dict[str, str]]] = None


def calculate_days_remaining(date_val: Any) -> Optional[int]:
    """Calculate days remaining from today until expiry date (negative if already expired)."""
    if not date_val:
        return None
    try:
        if isinstance(date_val, str):
            clean_str = date_val.split("T")[0].strip()
            target = datetime.date.fromisoformat(clean_str)
        elif isinstance(date_val, datetime.datetime):
            target = date_val.date()
        elif isinstance(date_val, datetime.date):
            target = date_val
        else:
            return None
        today = datetime.date.today()
        return (target - today).days
    except Exception:
        return None


def serialize_record(record: Any) -> Dict[str, Any]:
    """Safely convert database row to dictionary with JSON-serializable types."""
    d = dict(record)
    for k, v in d.items():
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, (datetime.date, datetime.datetime)):
            d[k] = v.isoformat()
        elif hasattr(v, "__float__"):
            d[k] = float(v)
    return d


def call_external_llm_sync(
    api_key: str,
    url: str,
    model: str,
    system_prompt: str,
    user_query: str
) -> Optional[str]:
    """Execute non-blocking HTTP POST to external LLM provider using standard library urllib."""
    try:
        req_body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_query}
            ],
            "temperature": 0.2,
            "max_tokens": 1200
        }
        data = json.dumps(req_body).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=9.0) as resp:
            if resp.status == 200:
                res_json = json.loads(resp.read().decode("utf-8"))
                choices = res_json.get("choices", [])
                if choices and len(choices) > 0:
                    return choices[0].get("message", {}).get("content")
        return None
    except Exception as e:
        logger.warning(f"External LLM API call error: {e}")
        return None


def run_deterministic_intent_analyzer(
    query_text: str,
    session: Dict[str, Any],
    employees_data: List[Dict[str, Any]],
    attendance_data: List[Dict[str, Any]],
    leaves_data: List[Dict[str, Any]],
    payroll_data: List[Dict[str, Any]],
    terminals_data: List[Dict[str, Any]],
    permissions: Dict[str, bool]
) -> Dict[str, Any]:
    """
    Built-in deterministic local intent analyzer that synthesizes accurate,
    permission-scoped answers even before an external LLM key is configured.
    """
    q = query_text.strip().lower()

    # 1. DOCUMENT EXPIRY & STATUTORY COMPLIANCE (QID, Visa, Passport)
    if any(k in q for k in ["qid", "visa", "passport", "expir", "compliance", "validity"]):
        if not permissions["employees"]:
            return {
                "answer": "🔒 **Permission Required**: You do not have permission to view employee records or compliance documents (`employees.read`).",
                "suggested_navigation": None
            }

        expiring_qids = []
        expiring_visas = []
        expiring_passports = []

        for emp in employees_data:
            qid_days = calculate_days_remaining(emp.get("national_id_expiry"))
            if qid_days is not None and qid_days <= 30:
                expiring_qids.append({
                    "name": emp.get("full_name") or f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
                    "number": emp.get("employee_number") or "N/A",
                    "doc": emp.get("national_id_number") or "Unknown QID",
                    "expiry": emp.get("national_id_expiry"),
                    "days": qid_days,
                })

            visa_days = calculate_days_remaining(emp.get("visa_expiry"))
            if visa_days is not None and visa_days <= 30:
                expiring_visas.append({
                    "name": emp.get("full_name") or f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
                    "number": emp.get("employee_number") or "N/A",
                    "doc": emp.get("visa_number") or "Unknown Visa",
                    "expiry": emp.get("visa_expiry"),
                    "days": visa_days,
                })

            pass_days = calculate_days_remaining(emp.get("passport_expiry"))
            if pass_days is not None and pass_days <= 30:
                expiring_passports.append({
                    "name": emp.get("full_name") or f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
                    "number": emp.get("employee_number") or "N/A",
                    "doc": emp.get("passport_number") or "Unknown Passport",
                    "expiry": emp.get("passport_expiry"),
                    "days": pass_days,
                })

        lines = [f"### 📋 Document Expiry Overview\n"]
        total_expiring = len(expiring_qids) + len(expiring_visas) + len(expiring_passports)

        if total_expiring == 0:
            lines.append("✅ **All employee identity documents are up to date!** No IDs, Visas, or Passports are expiring within the next 30 days across your branch scope.")
        else:
            if expiring_qids:
                lines.append(f"**Qatar ID (QID) Expiries ({len(expiring_qids)} identified):**")
                for item in sorted(expiring_qids, key=lambda x: x["days"]):
                    status_str = f"⚠️ Expired {abs(item['days'])} days ago" if item['days'] < 0 else f"⏳ Expires in {item['days']} days"
                    lines.append(f"- **{item['name']}** (`{item['number']}`) — QID: `{item['doc']}` | {status_str} ({item['expiry']})")
                lines.append("")

            if expiring_visas:
                lines.append(f"**Visa Expiries ({len(expiring_visas)} identified):**")
                for item in sorted(expiring_visas, key=lambda x: x["days"]):
                    status_str = f"⚠️ Expired {abs(item['days'])} days ago" if item['days'] < 0 else f"⏳ Expires in {item['days']} days"
                    lines.append(f"- **{item['name']}** (`{item['number']}`) — Visa: `{item['doc']}` | {status_str} ({item['expiry']})")
                lines.append("")

            if expiring_passports:
                lines.append(f"**Passport Expiries ({len(expiring_passports)} identified):**")
                for item in sorted(expiring_passports, key=lambda x: x["days"]):
                    status_str = f"⚠️ Expired {abs(item['days'])} days ago" if item['days'] < 0 else f"⏳ Expires in {item['days']} days"
                    lines.append(f"- **{item['name']}** (`{item['number']}`) — Passport: `{item['doc']}` | {status_str} ({item['expiry']})")

        return {
            "answer": "\n".join(lines),
            "suggested_navigation": {"moduleId": "hr", "menuId": "employees"}
        }

    # 2. HEADCOUNT, DEPARTMENTS & EMPLOYEE STATUS
    if any(k in q for k in ["headcount", "how many employee", "total employee", "department", "staff count"]):
        if not permissions["employees"]:
            return {
                "answer": "🔒 **Permission Required**: You do not have permission to view employee directory (`employees.read`).",
                "suggested_navigation": None
            }

        total_emp = len(employees_data)
        dept_counts: Dict[str, int] = {}
        status_counts: Dict[str, int] = {}

        for emp in employees_data:
            dept = emp.get("department_id") or "Unassigned"
            st = emp.get("status") or "Active"
            dept_counts[dept] = dept_counts.get(dept, 0) + 1
            status_counts[st] = status_counts.get(st, 0) + 1

        lines = [
            f"### 👥 Active Organization Workforce Overview",
            f"- **Total Employees in Scope:** **{total_emp}**",
            "",
            "**Status Breakdown:**"
        ]
        for st, count in sorted(status_counts.items(), key=lambda x: -x[1]):
            lines.append(f"- {st}: **{count}**")

        lines.append("\n**Department Distribution:**")
        for dept, count in sorted(dept_counts.items(), key=lambda x: -x[1]):
            pct = round((count / total_emp) * 100, 1) if total_emp > 0 else 0
            lines.append(f"- {dept}: **{count}** ({pct}%)")

        return {
            "answer": "\n".join(lines),
            "suggested_navigation": {"moduleId": "hr", "menuId": "employees"}
        }

    # 3. SPECIFIC EMPLOYEE LOOKUP
    if any(k in q for k in ["find", "who is", "search for", "lookup", "emp-", "details for"]):
        if not permissions["employees"]:
            return {
                "answer": "🔒 **Permission Required**: You do not have permission to view employee records (`employees.read`).",
                "suggested_navigation": None
            }

        # Extract search token
        tokens = [t for t in re.split(r"[\s,\'\"]+", q) if len(t) > 2 and t not in ["find", "who", "search", "for", "the", "details", "employee"]]
        matched = []
        for emp in employees_data:
            full = (emp.get("full_name") or "").lower()
            code = (emp.get("employee_number") or "").lower()
            qid_num = (emp.get("national_id_number") or "").lower()
            email = (emp.get("work_email") or "").lower()
            title = (emp.get("job_title") or "").lower()

            if any(t in full or t in code or t in qid_num or t in email or t in title for t in tokens):
                matched.append(emp)

        if matched:
            lines = [f"### 🔍 Found {len(matched)} Matching Employee Record(s):\n"]
            for emp in matched[:5]:
                name = emp.get("full_name") or f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()
                lines.append(f"#### **{name}** (`{emp.get('employee_number', 'N/A')}`)")
                lines.append(f"- **Designation:** {emp.get('job_title', 'Not specified')}")
                lines.append(f"- **Department:** {emp.get('department_id', 'Operations')}")
                lines.append(f"- **Status:** `{emp.get('status', 'Active')}`")
                lines.append(f"- **Work Email:** {emp.get('work_email') or 'N/A'}")
                lines.append(f"- **QID:** `{emp.get('national_id_number') or 'N/A'}` (Expires: {emp.get('national_id_expiry') or 'N/A'})")

                if permissions["salary"] and emp.get("base_salary") is not None:
                    lines.append(f"- **Compensation:** Base QAR {emp.get('base_salary'):,.2f} | Housing: QAR {emp.get('housing_allowance', 0.0):,.2f}")
                elif not permissions["salary"]:
                    lines.append("- **Compensation:** 🔒 *Redacted (Requires hr.salary_read permission)*")
                lines.append("")

            return {
                "answer": "\n".join(lines),
                "suggested_navigation": {"moduleId": "hr", "menuId": "employees"}
            }

    # 4. ATTENDANCE & PUNCH INQUIRIES
    if any(k in q for k in ["attendance", "punch", "clock", "check-in", "check in", "check-out", "present", "absent", "shift"]):
        if not permissions["attendance"]:
            return {
                "answer": "🔒 **Permission Required**: You do not have permission to view attendance logs (`attendance.read`).",
                "suggested_navigation": None
            }

        total_att = len(attendance_data)
        missing_checkout = [a for a in attendance_data if not a.get("check_out")]
        verified_count = sum(1 for a in attendance_data if str(a.get("status", "")).lower() == "verified")
        draft_count = sum(1 for a in attendance_data if str(a.get("status", "")).lower() == "draft")

        lines = [
            f"### ⏱️ Attendance Logs & Shift Monitoring",
            f"- **Recent Attendance Logs:** **{total_att}** records evaluated in scope",
            f"- **Verified & Synced Logs:** **{verified_count}**",
            f"- **Open / Draft Punches:** **{draft_count}**",
            f"- **Missing Check-Outs:** **{len(missing_checkout)}** employees currently on open shifts",
        ]

        if missing_checkout:
            lines.append("\n**Open Shifts (Missing Check-out):**")
            for item in missing_checkout[:6]:
                lines.append(f"- **{item.get('employee_name', 'Employee')}** (`{item.get('code', 'N/A')}`) — Clocked in at `{item.get('check_in', 'N/A')}` on `{item.get('terminal_id', 'Terminal')}`")

        return {
            "answer": "\n".join(lines),
            "suggested_navigation": {"moduleId": "attendance", "menuId": "attendances"}
        }

    # 5. LEAVE REQUESTS & VACATION BALANCES
    if any(k in q for k in ["leave", "vacation", "sick leave", "annual leave", "time off"]):
        if not permissions["leaves"]:
            return {
                "answer": "🔒 **Permission Required**: You do not have permission to view leave requests (`attendance.read`).",
                "suggested_navigation": None
            }

        total_leaves = len(leaves_data)
        pending_leaves = [l for l in leaves_data if "pending" in str(l.get("approval_status", "")).lower()]
        approved_leaves = [l for l in leaves_data if "approved" in str(l.get("approval_status", "")).lower()]

        lines = [
            f"### 🌴 Leave Management & Absence Tracking",
            f"- **Total Leave Requests in Scope:** **{total_leaves}**",
            f"- **Pending Approval:** **{len(pending_leaves)}**",
            f"- **Approved Leaves:** **{len(approved_leaves)}**",
        ]

        if pending_leaves:
            lines.append("\n**Awaiting Authorization:**")
            for item in pending_leaves[:6]:
                lines.append(
                    f"- **{item.get('employee_name', 'Employee')}** — {item.get('leave_type_name', 'Leave')} "
                    f"({item.get('total_days', 1)} days from `{item.get('start_date', '')}` to `{item.get('end_date', '')}`) "
                    f"| Status: `{item.get('approval_status')}`"
                )

        return {
            "answer": "\n".join(lines),
            "suggested_navigation": {"moduleId": "hr", "menuId": "leaves"}
        }

    # 6. PAYROLL BATCHES & SALARY PROCESSING
    if any(k in q for k in ["payroll", "wps", "sif", "batch", "salary cycle", "payslip"]):
        if not permissions["payroll"]:
            return {
                "answer": "🔒 **Permission Required**: You do not have permission to access Payroll Batches (`payroll.read`).",
                "suggested_navigation": None
            }

        total_batches = len(payroll_data)
        lines = [
            f"### 💵 Qatar WPS Payroll Batches Overview",
            f"- **Total Payroll Batches in Scope:** **{total_batches}**",
            "",
            "**Recent Payroll Runs:**"
        ]

        if not payroll_data:
            lines.append("- *No payroll batches found for current branch scope.*")
        else:
            for b in payroll_data[:5]:
                status_badge = f"`{b.get('status', 'draft')}`"
                amt_str = f"| Net Total: **QAR {float(b.get('total_net_salary', 0.0)):,.2f}**" if permissions["salary"] else ""
                lines.append(
                    f"- **Batch `{b.get('batch_code', 'N/A')}`** ({b.get('salary_year_month', '')}) — "
                    f"Status: {status_badge} | Employees: **{b.get('total_employees', 0)}** {amt_str}"
                )

        return {
            "answer": "\n".join(lines),
            "suggested_navigation": {"moduleId": "payroll", "menuId": "batches"}
        }

    # 7. BIOMETRIC HARDWARE & TERMINALS
    if any(k in q for k in ["terminal", "terminals", "zkteco", "hardware", "device", "biometric", "scanner"]):
        if not permissions["hardware"]:
            return {
                "answer": "🔒 **Permission Required**: You do not have permission to view Hardware Terminals (`hardware.read`).",
                "suggested_navigation": None
            }

        total_t = len(terminals_data)
        active_t = [t for t in terminals_data if str(t.get("state", "")).lower() == "active"]

        lines = [
            f"### 📟 ZKTeco ADMS Biometric Hardware Fleet",
            f"- **Total Terminals:** **{total_t}** ({len(active_t)} active)",
            "",
            "**Registered Biometric Devices:**"
        ]

        if not terminals_data:
            lines.append("- *No biometric terminals registered for this location.*")
        else:
            for t in terminals_data[:6]:
                st_icon = "🟢" if str(t.get("state", "")).lower() == "active" else "⚪"
                enroll_str = " (Enrollment Device)" if t.get("is_enrollment_terminal") else ""
                lines.append(
                    f"- {st_icon} **{t.get('alias', 'Terminal')}** (`{t.get('sn', 'N/A')}`){enroll_str} — "
                    f"IP: `{t.get('ip_address') or 'Auto-DHCP'}` | Last seen: `{t.get('last_activity') or 'Never'}`"
                )

        return {
            "answer": "\n".join(lines),
            "suggested_navigation": {"moduleId": "hardware", "menuId": "terminals"}
        }

    # 8. DEFAULT SYSTEM GREETING & CAPABILITIES
    permitted_list = []
    if permissions["employees"]:
        permitted_list.append("Employee Directory & QID/Visa Expiry Compliance")
    if permissions["attendance"]:
        permitted_list.append("Real-Time Biometric Attendance & Shift Logs")
    if permissions["leaves"]:
        permitted_list.append("Leave Authorization & Absence Balances")
    if permissions["payroll"]:
        permitted_list.append("WPS Payroll Processing & Payslips")
    if permissions["hardware"]:
        permitted_list.append("ZKTeco ADMS Biometric Hardware Fleet")
    if permissions["salary"]:
        permitted_list.append("Confidential Salary & Compensation Rules")

    greeting = (
        f"👋 **Hello, {session.get('full_name') or session.get('username') or 'User'}!**\n\n"
        f"I am your **Enterprise AI Assistant**, operating under strict permission and tenancy boundaries.\n\n"
        f"**Your Active Security Scope:**\n"
        f"- **Role:** `{session.get('role', 'User')}`\n"
        f"- **Organization:** `{session.get('active_organization_id') or session.get('organization_id') or 'Current'}`\n"
        f"- **Branch Filter:** `{session.get('active_branch_ids', ['all'])}`\n"
        f"- **Permitted Capabilities:** {', '.join(permitted_list) if permitted_list else 'None'}\n\n"
        f"**Suggested Questions you can ask:**\n"
        f"- *'Show employees with QID or Visa expiring in 30 days'*\n"
        f"- *'What is our total active headcount by department?'*\n"
        f"- *'Show open attendance records with missing check-outs'*\n"
        f"- *'Are there any pending leave requests waiting for supervisor approval?'*\n"
        f"- *'Status of recent WPS payroll batches'*\n"
    )

    return {
        "answer": greeting,
        "suggested_navigation": {"moduleId": "hr", "menuId": "employees"} if permissions["employees"] else None
    }


@router.post("/query")
async def query_ai_assistant(
    payload: AIQueryPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    Permission-scoped AI query endpoint.
    Strictly verifies model CRUD permissions and branch/tenant isolation before querying any database table.
    Enforces salary masking and SOX 404 audit event logging.
    """
    user_query = payload.query.strip()
    if not user_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query string cannot be empty."
        )

    client_ip = get_client_ip(request)

    # 1. Evaluate Authenticated RBAC Permissions
    can_read_employees = check_permission(session, "employees.read")
    can_read_attendance = check_permission(session, "attendance.read")
    can_read_leaves = check_permission(session, "attendance.read")
    can_read_payroll = check_permission(session, "payroll.read")
    can_read_hardware = check_permission(session, "hardware.read")
    can_view_salary = can_read_salary(session)

    permissions_map = {
        "employees": can_read_employees,
        "attendance": can_read_attendance,
        "leaves": can_read_leaves,
        "payroll": can_read_payroll,
        "hardware": can_read_hardware,
        "salary": can_view_salary,
    }

    allowed_scopes: List[str] = []
    if can_read_employees:
        allowed_scopes.append("employees.read")
    if can_read_attendance:
        allowed_scopes.append("attendance.read")
    if can_read_leaves:
        allowed_scopes.append("leaves.read")
    if can_read_payroll:
        allowed_scopes.append("payroll.read")
    if can_read_hardware:
        allowed_scopes.append("hardware.read")
    if can_view_salary:
        allowed_scopes.append("salary.read")

    # 2. Immediate 403-aware Refusals (Without Querying Tables)
    q_lower = user_query.lower()

    # Check for confidential salary inquiries without salary reading rights
    is_asking_salary = any(
        k in q_lower for k in [
            "salary", "salaries", "wage", "wages", "compensation",
            "base_salary", "housing_allowance", "allowance", "iban", "bank account"
        ]
    )
    if is_asking_salary and not can_view_salary and not any(k in q_lower for k in ["batch", "wps", "leave", "terminal"]):
        refusal_msg = (
            "🔒 **Access Denied (403 Forbidden)**: You do not possess the required permission "
            "(`hr.salary_read` or `hr.salary_manage`) to view employee compensation or salary data. "
            "This query has been logged to the security audit trail."
        )
        pool = get_db_pool()
        async with pool.acquire() as conn:
            await log_audit_event(
                conn=conn,
                entity_type="ai_assistant",
                entity_id=str(session.get("user_id") or "anonymous"),
                action="AI_ASSISTANT_QUERY",
                session=session,
                client_ip=client_ip,
                note="Permission denied for salary inquiry",
                changes={"query": user_query, "blocked_permission": "hr.salary_read"}
            )
        return {
            "answer": refusal_msg,
            "allowed_scopes": allowed_scopes,
            "suggested_navigation": {"moduleId": "hr", "menuId": "employees"} if can_read_employees else None,
            "role": session.get("role") or "User"
        }

    # Check for unauthorized payroll inquiry
    is_asking_payroll = any(k in q_lower for k in ["payroll", "wps", "sif", "payslip", "batches"])
    if is_asking_payroll and not can_read_payroll:
        refusal_msg = (
            "🔒 **Access Denied (403 Forbidden)**: You do not have permission to view Payroll Batches "
            "(`payroll.read`). Please contact your organization administrator if you need access."
        )
        pool = get_db_pool()
        async with pool.acquire() as conn:
            await log_audit_event(
                conn=conn,
                entity_type="ai_assistant",
                entity_id=str(session.get("user_id") or "anonymous"),
                action="AI_ASSISTANT_QUERY",
                session=session,
                client_ip=client_ip,
                note="Permission denied for payroll inquiry",
                changes={"query": user_query, "blocked_permission": "payroll.read"}
            )
        return {
            "answer": refusal_msg,
            "allowed_scopes": allowed_scopes,
            "suggested_navigation": None,
            "role": session.get("role") or "User"
        }

    # Check for unauthorized hardware inquiry
    is_asking_hardware = any(k in q_lower for k in ["terminal", "terminals", "zkteco", "biometric", "hardware"])
    if is_asking_hardware and not can_read_hardware:
        refusal_msg = (
            "🔒 **Access Denied (403 Forbidden)**: You do not have permission to view Hardware Terminals "
            "(`hardware.read`). Please contact your organization administrator if you need access."
        )
        pool = get_db_pool()
        async with pool.acquire() as conn:
            await log_audit_event(
                conn=conn,
                entity_type="ai_assistant",
                entity_id=str(session.get("user_id") or "anonymous"),
                action="AI_ASSISTANT_QUERY",
                session=session,
                client_ip=client_ip,
                note="Permission denied for hardware inquiry",
                changes={"query": user_query, "blocked_permission": "hardware.read"}
            )
        return {
            "answer": refusal_msg,
            "allowed_scopes": allowed_scopes,
            "suggested_navigation": None,
            "role": session.get("role") or "User"
        }

    # 3. Query Scoped Models with Branch & Tenant Filtering
    employees_rows: List[Dict[str, Any]] = []
    attendance_rows: List[Dict[str, Any]] = []
    leaves_rows: List[Dict[str, Any]] = []
    payroll_rows: List[Dict[str, Any]] = []
    terminals_rows: List[Dict[str, Any]] = []

    async with tenant_db_context(session) as conn:
        # A. Employees Query
        if can_read_employees:
            clause, params = build_branch_filter(session, table_alias="e")
            sql = f"""
                SELECT id, employee_number, full_name, first_name, last_name,
                       job_title, department_id, branch_id, status,
                       national_id_number, national_id_expiry,
                       passport_number, passport_expiry,
                       visa_number, visa_expiry, work_email, hire_date,
                       base_salary, housing_allowance, transport_allowance, other_allowances, iban
                FROM employees e
                WHERE 1=1 {clause}
                ORDER BY full_name ASC
                LIMIT 150;
            """
            rows = await conn.fetch(sql, *params)
            for r in rows:
                emp_dict = serialize_record(r)
                # Enforce salary stripping if user lacks salary read rights
                if not can_view_salary:
                    emp_dict.pop("base_salary", None)
                    emp_dict.pop("housing_allowance", None)
                    emp_dict.pop("transport_allowance", None)
                    emp_dict.pop("other_allowances", None)
                    emp_dict.pop("iban", None)
                employees_rows.append(emp_dict)

        # B. Attendance Logs Query
        if can_read_attendance:
            clause, params = build_branch_filter(session, table_alias="a")
            sql = f"""
                SELECT id, code, employee_name, department, terminal_id,
                       check_in, check_out, duration_hours, status, approval_status
                FROM attendance_logs a
                WHERE 1=1 {clause}
                ORDER BY check_in DESC
                LIMIT 50;
            """
            rows = await conn.fetch(sql, *params)
            attendance_rows = [serialize_record(r) for r in rows]

        # C. Leave Requests Query
        if can_read_leaves:
            clause, params = build_branch_filter(session, table_alias="l")
            sql = f"""
                SELECT id, code, employee_name, department, leave_type_name,
                       start_date, end_date, total_days, approval_status, reason
                FROM leave_requests l
                WHERE 1=1 {clause}
                ORDER BY start_date DESC
                LIMIT 50;
            """
            rows = await conn.fetch(sql, *params)
            leaves_rows = [serialize_record(r) for r in rows]

        # D. Payroll Batches Query
        if can_read_payroll:
            clause, params = build_branch_filter(session, table_alias="pb")
            sql = f"""
                SELECT id, batch_code, salary_year_month, status,
                       total_employees, total_net_salary, total_gross_salary, posted_at
                FROM payroll_batches pb
                WHERE 1=1 {clause}
                ORDER BY salary_year_month DESC
                LIMIT 20;
            """
            rows = await conn.fetch(sql, *params)
            payroll_rows = [serialize_record(r) for r in rows]

        # E. Hardware Terminals Query
        if can_read_hardware:
            clause, params = build_branch_filter(session, table_alias="t")
            sql = f"""
                SELECT id, sn, alias, state, is_enrollment_terminal, last_activity, ip_address
                FROM zkteco_terminals t
                WHERE 1=1 {clause}
                ORDER BY alias ASC
                LIMIT 30;
            """
            rows = await conn.fetch(sql, *params)
            terminals_rows = [serialize_record(r) for r in rows]

        # 4. Optional External LLM Execution
        llm_answer = None
        if settings.AI_PROVIDER_API_KEY and settings.AI_PROVIDER_API_KEY.strip():
            # Build scoped context payload
            context_summary = {
                "user_role": session.get("role", "User"),
                "active_organization": str(session.get("organization_id", "")),
                "active_branches": session.get("active_branch_ids", ["all"]),
                "employees_count": len(employees_rows),
                "employees_sample": employees_rows[:30],
                "attendance_sample": attendance_rows[:20],
                "leaves_sample": leaves_rows[:20],
                "payroll_sample": payroll_rows[:10],
                "terminals_sample": terminals_rows[:10],
                "salary_permitted": can_view_salary,
            }
            system_prompt = (
                "You are an enterprise AI Assistant embedded within an ERP system. "
                "You operate strictly within the provided permission-scoped context. "
                "Do NOT fabricate information outside the provided data. "
                "Always format your response cleanly in GitHub-flavored Markdown. "
                f"Data Context:\n{json.dumps(context_summary, default=str)}"
            )

            llm_answer = await asyncio.to_thread(
                call_external_llm_sync,
                settings.AI_PROVIDER_API_KEY,
                settings.AI_PROVIDER_URL,
                settings.AI_MODEL_NAME,
                system_prompt,
                user_query
            )

        # 5. Deterministic Local Intent Analyzer Fallback
        if not llm_answer:
            analysis_result = run_deterministic_intent_analyzer(
                query_text=user_query,
                session=session,
                employees_data=employees_rows,
                attendance_data=attendance_rows,
                leaves_data=leaves_rows,
                payroll_data=payroll_rows,
                terminals_data=terminals_rows,
                permissions=permissions_map
            )
            final_answer = analysis_result["answer"]
            suggested_nav = analysis_result["suggested_navigation"]
        else:
            final_answer = llm_answer
            # Determine appropriate navigation chip
            suggested_nav = None
            if any(k in q_lower for k in ["employee", "staff", "qid", "visa", "passport", "headcount"]):
                if can_read_employees:
                    suggested_nav = {"moduleId": "hr", "menuId": "employees"}
            elif any(k in q_lower for k in ["attendance", "punch", "clock", "check-in"]):
                if can_read_attendance:
                    suggested_nav = {"moduleId": "attendance", "menuId": "attendances"}
            elif any(k in q_lower for k in ["leave", "vacation"]):
                if can_read_leaves:
                    suggested_nav = {"moduleId": "hr", "menuId": "leaves"}
            elif any(k in q_lower for k in ["payroll", "wps", "batch"]):
                if can_read_payroll:
                    suggested_nav = {"moduleId": "payroll", "menuId": "batches"}
            elif any(k in q_lower for k in ["terminal", "hardware", "zkteco"]):
                if can_read_hardware:
                    suggested_nav = {"moduleId": "hardware", "menuId": "terminals"}

        # 6. Audit Trail Logging (SOX 404 / ISO 27001 Cryptographic Hash Chain)
        await log_audit_event(
            conn=conn,
            entity_type="ai_assistant",
            entity_id=str(session.get("user_id") or "anonymous"),
            action="AI_ASSISTANT_QUERY",
            session=session,
            client_ip=client_ip,
            note=f"AI query processed: {user_query[:100]}",
            changes={
                "query": user_query,
                "allowed_scopes": allowed_scopes,
                "used_external_llm": bool(llm_answer),
            }
        )

        return {
            "answer": final_answer,
            "allowed_scopes": allowed_scopes,
            "suggested_navigation": suggested_nav,
            "role": session.get("role") or "User",
            "active_scope": {
                "organization_id": session.get("active_organization_id") or session.get("organization_id"),
                "branches": session.get("active_branch_ids", ["all"])
            }
        }
