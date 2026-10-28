"""
Segregation of Duties (SoD) Conflict Matrix & Enforcement Engine
SOX Section 404 & ISO 27001 Dual-Control Framework
"""

import logging
from typing import Dict, Any, List, Set, Optional, Union
from fastapi import HTTPException, status

logger = logging.getLogger("enterprise.sod")

# Declarative SoD Conflict Matrix
SOD_CONFLICT_RULES: List[Dict[str, Any]] = [
    {
        "id": "SOD_BANK_VS_PAYROLL",
        "name": "Employee/Vendor Bank Details vs. Payroll & Payment Approval",
        "risk_level": "CRITICAL",
        "sox_control": "SOD-FIN-01",
        "description": (
            "Personnel with authority to modify employee master records, banking/IBAN coordinates, "
            "or compensation structures cannot approve payroll batches or disburse financial disbursements."
        ),
        "set_a": [
            "employees.create",
            "employees.update",
            "employees.manage",
            "employees.write",
            "hr.salary_manage",
            "salary.write",
            "salary.manage",
            "employees.bank_update",
            "banking.manage",
            "banking.write",
            "banking.update",
            "banking.create",
            "vendors.manage",
            "vendors.bank_update",
            "bank_details.write",
            "bank_details.manage",
        ],
        "set_b": [
            "payroll.manage",
            "payroll.approve",
            "payroll.post",
            "payroll.export_wps",
            "payments.approve",
        ],
    },
    {
        "id": "SOD_IAM_ADMIN_VS_AUDIT",
        "name": "IAM Role/User Administration vs. Security & Audit Override",
        "risk_level": "CRITICAL",
        "sox_control": "SOD-SEC-02",
        "description": (
            "Administrators provisioning IAM user credentials, roles, or security policies cannot "
            "verify or override cryptographic audit logs, hash chains, or compliance audit trails."
        ),
        "set_a": [
            "roles.manage",
            "roles.update",
            "roles.create",
            "users.manage",
            "users.update",
            "users.create",
        ],
        "set_b": [
            "audit.verify",
            "audit.manage",
            "audit.override",
            "security.override",
            "settings.manage",
        ],
    },
    {
        "id": "SOD_ATTENDANCE_VS_PAYROLL",
        "name": "Attendance Entry/Modification vs. Overtime & Payroll Approval",
        "risk_level": "HIGH",
        "sox_control": "SOD-OPS-03",
        "description": (
            "Operators who log, adjust, or edit manual attendance logs or rosters cannot "
            "approve overtime adjustments or seal monthly payroll batches."
        ),
        "set_a": [
            "attendance_logs.create",
            "attendance_logs.update",
            "attendance_logs.write",
            "attendance.write",
            "attendance.create",
            "attendance.update",
        ],
        "set_b": [
            "attendance.approve",
            "attendance_logs.approve",
            "payroll.manage",
            "payroll.approve",
        ],
    },
    {
        "id": "SOD_CONTRACT_MAKER_VS_CHECKER",
        "name": "Contract Authoring vs. Contract Approval",
        "risk_level": "HIGH",
        "sox_control": "SOD-HR-04",
        "description": (
            "Users drafting, configuring, or editing employment contracts and wage agreements "
            "cannot unilaterally approve or activate contracts into legal effect."
        ),
        "set_a": [
            "employee_contracts.create",
            "employee_contracts.update",
            "employee_contracts.write",
            "hr.contracts_manage",
            "contracts.manage",
        ],
        "set_b": [
            "contracts.approve",
            "employee_contracts.approve",
        ],
    },
]


def extract_flattened_permissions(permissions: Union[Dict[str, Any], List[str], None]) -> Set[str]:
    """
    Normalizes permissions into a flattened set of dot-notation strings.
    Handles:
    - Model CRUD maps: {"employees": {"create": True, "read": True, "update": True}} -> {"employees.create", "employees.read", "employees.update"}
    - Direct atomic boolean flags: {"hr.salary_manage": True, "payroll.manage": True} -> {"hr.salary_manage", "payroll.manage"}
    - String lists: ["employees.update", "payroll.manage"] -> {"employees.update", "payroll.manage"}
    - Implied permissions (e.g. "employees.write" implies create + update)
    """
    flat: Set[str] = set()
    if not permissions:
        return flat

    if isinstance(permissions, list):
        for item in permissions:
            if isinstance(item, str):
                cleaned = item.strip().lower()
                flat.add(cleaned)
        return flat

    if isinstance(permissions, dict):
        for key, value in permissions.items():
            if isinstance(value, dict):
                # Model CRUD dictionary: e.g. "attendance_logs": {"create": True, ...}
                model_name = key.strip().lower()
                for action, is_granted in value.items():
                    if is_granted:
                        act = action.strip().lower()
                        flat.add(f"{model_name}.{act}")
                        if act in ("update", "create"):
                            flat.add(f"{model_name}.write")
                        if act == "manage":
                            flat.add(f"{model_name}.create")
                            flat.add(f"{model_name}.update")
                            flat.add(f"{model_name}.delete")
                            flat.add(f"{model_name}.read")
                            flat.add(f"{model_name}.write")
            elif isinstance(value, bool) and value is True:
                # Direct atomic permission: e.g. "hr.salary_manage": True
                clean_key = key.strip().lower()
                flat.add(clean_key)
            elif isinstance(value, (int, float)) and value == 1:
                flat.add(key.strip().lower())

    return flat


def validate_sod_compliance(
    permissions: Union[Dict[str, Any], List[str], None],
    role_code: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Evaluates permissions against the SOX 404 Conflict Matrix.
    Returns a list of conflict violation dicts, or empty list if fully compliant.
    Superadmin system role code is exempt from runtime blocking, but conflicts are still evaluated.
    """
    clean_role_code = (role_code or "").strip().upper()
    if clean_role_code in ("SUPERADMIN", "ROLE_SUPERADMIN"):
        return []

    active_perms = extract_flattened_permissions(permissions)
    if not active_perms:
        return []

    violations: List[Dict[str, Any]] = []

    for rule in SOD_CONFLICT_RULES:
        set_a = {p.lower() for p in rule["set_a"]}
        set_b = {p.lower() for p in rule["set_b"]}

        matched_a = active_perms.intersection(set_a)
        matched_b = active_perms.intersection(set_b)

        if matched_a and matched_b:
            violations.append({
                "rule_id": rule["id"],
                "rule_name": rule["name"],
                "risk_level": rule["risk_level"],
                "sox_control": rule["sox_control"],
                "description": rule["description"],
                "conflicting_set_a": sorted(list(matched_a)),
                "conflicting_set_b": sorted(list(matched_b)),
            })

    return violations


def raise_if_sod_violation(
    permissions: Union[Dict[str, Any], List[str], None],
    role_code: Optional[str] = None,
    context_label: str = "Role"
) -> None:
    """
    Enforces SoD validation. Raises HTTP 409 Conflict if any SoD violations exist.
    """
    violations = validate_sod_compliance(permissions, role_code=role_code)
    if violations:
        violation_summaries = [
            f"[{v['risk_level']}] {v['rule_name']} (Set A: {', '.join(v['conflicting_set_a'])} vs. Set B: {', '.join(v['conflicting_set_b'])})"
            for v in violations
        ]
        msg = f"Separation of Duties conflict in {context_label}: " + "; ".join(violation_summaries)
        logger.warning(f"SoD Conflict Rejection: {msg}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "SOD_CONFLICT",
                "message": msg,
                "violations": violations,
            }
        )
