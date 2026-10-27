import uuid
from typing import Dict, Any, List, Optional

# Declarative Registry of Relational Constraints:
# Parent Entity -> List of child tables to check before allowing deletion
DEPENDENCY_REGISTRY = {
    "organizations": [
        {"table": "branches", "fk": "organization_id", "label": "Operating Branches", "name_col": "name"},
        {"table": "employees", "fk": "organization_id", "label": "Employees", "name_col": "first_name"},
        {"table": "users", "fk": "organization_id", "label": "User Accounts", "name_col": "email"},
        {"table": "payroll_batches", "fk": "organization_id", "label": "Payroll Batches", "name_col": "batch_code"},
        {"table": "zkteco_terminals", "fk": "organization_id", "label": "Biometric Terminals", "name_col": "alias"},
    ],
    "branches": [
        {"table": "employees", "fk": "branch_id", "label": "Employees Assigned", "name_col": "first_name"},
        {"table": "users", "fk": "branch_id", "label": "User Accounts Assigned", "name_col": "email"},
        {"table": "zkteco_terminals", "fk": "branch_id", "label": "Biometric Terminals Assigned", "name_col": "alias"},
    ],
    "employees": [
        {"table": "employee_contracts", "fk": "employee_id", "label": "Employment Contracts", "name_col": "contract_reference"},
        {"table": "attendance_logs", "fk": "employee_id", "label": "Attendance Records", "name_col": "code"},
        {"table": "payslips", "fk": "employee_id", "label": "Payslips", "name_col": "payslip_number"},
        {"table": "leave_requests", "fk": "employee_id", "label": "Leave Requests", "name_col": "code"},
        {"table": "zkteco_transactions", "fk": "employee_id", "label": "Biometric Transactions", "name_col": "emp_code"},
    ],
    "roles": [
        {"table": "users", "fk": "role_id", "label": "Assigned Users", "name_col": "full_name"},
    ],
    "users": [
        {"table": "audit_logs", "fk": "changed_by_user_id", "label": "Audit Trail Logs", "name_col": "action"},
    ],
    "salary_rules": [
        {"table": "contract_benefit_lines", "fk": "rule_id", "label": "Contract Benefit Lines", "name_col": "id"},
    ],
    "zkteco_terminals": [
        {"table": "zkteco_transactions", "fk": "terminal_sn", "fk_type": "string", "label": "Hardware Attendance Punches", "name_col": "id"},
    ],
    "leave_types": [
        {"table": "leave_requests", "fk": "leave_type_id", "label": "Leave Applications", "name_col": "code"},
    ]
}

async def inspect_dependencies(
    conn,
    entity_type: str,
    entity_id: Any,
    entity_name: str = ""
) -> Optional[Dict[str, Any]]:
    """
    Scans all referencing child records. If dependencies are found, returns
    a structured diagnostic payload explaining why the item cannot be deleted.
    """
    rules = DEPENDENCY_REGISTRY.get(entity_type, [])
    if not rules:
        return None

    violations: List[Dict[str, Any]] = []

    for rule in rules:
        table = rule["table"]
        fk_field = rule["fk"]
        label = rule["label"]
        name_col = rule.get("name_col", "id")
        is_string_fk = rule.get("fk_type") == "string"

        # Check if table exists in postgres schema
        exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = $2
            );
        """, table, fk_field)
        if not exists:
            continue

        try:
            param = str(entity_id) if is_string_fk else (uuid.UUID(str(entity_id)) if isinstance(entity_id, (str, uuid.UUID)) else entity_id)
            row = await conn.fetchrow(f"SELECT count(*) FROM {table} WHERE {fk_field} = $1;", param)
            count = row[0] if row else 0

            if count > 0:
                # Check if name_col exists, else fallback to id
                col_exists = await conn.fetchval("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = $1 AND column_name = $2
                    );
                """, table, name_col)
                display_col = name_col if col_exists else "id"

                samples = await conn.fetch(f"SELECT {display_col}::text FROM {table} WHERE {fk_field} = $1 LIMIT 3;", param)
                sample_names = [str(r[0]) for r in samples if r[0] is not None]
                violations.append({
                    "model": table,
                    "label": label,
                    "count": count,
                    "sample_records": sample_names
                })
        except Exception:
            continue

    if not violations:
        return None

    # Construct actionable explanation
    total_blocked = sum(v["count"] for v in violations)
    details = [f"• {v['count']} {v['label']} (e.g. {', '.join(v['sample_records']) or 'records'})" for v in violations]
    
    return {
        "can_delete": False,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "entity_name": entity_name or str(entity_id),
        "total_references": total_blocked,
        "dependencies": violations,
        "message": f"Cannot permanently delete '{entity_name or entity_type}' because it is actively referenced by {total_blocked} records across the system.",
        "details": details,
        "resolution": "To protect historical audit and statutory compliance, reassign or remove the linked records first, or use 'Archive' to deactivate this record while preserving historical reporting."
    }
