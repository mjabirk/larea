from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List, AsyncGenerator
from fastapi import Request, HTTPException, status, Header, Depends

from backend.core.config import settings
from backend.core.session import SessionManager, verify_client_cidr
from backend.core.auth_suite import APIKeyEngine, DatabaseRLSHelper
from backend.core.database import get_db_pool


def get_client_ip(request: Request) -> str:
    """Extract client IP, inspecting trusted reverse proxy headers if applicable."""
    remote_host = request.client.host if request.client else "127.0.0.1"
    if remote_host == "testclient":
        return "127.0.0.1"
    if remote_host in settings.TRUSTED_PROXIES:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return remote_host


async def get_current_user_session(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None)
) -> Dict[str, Any]:
    """
    Zero-Trust Session Authentication Dependency.
    Validates network CIDR restrictions, API keys, or stateful DragonflyDB Bearer tokens.
    Rejects unauthenticated requests with 401 Unauthorized.
    """
    client_ip = get_client_ip(request)

    # 1. Check CIDR network restriction
    if not verify_client_cidr(client_ip, settings.ALLOWED_CIDR_NETWORKS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden from this network subnet."
        )

    # 2. Check Headless API Key authentication
    if x_api_key and isinstance(x_api_key, str):
        api_data = await APIKeyEngine.validate_api_key(x_api_key, client_ip)
        if api_data:
            return {
                "user_id": api_data["key_id"],
                "username": f"api_key_{api_data['key_id'][:8]}",
                "role": api_data["role"],
                "is_superadmin": api_data.get("role") == "SUPERADMIN",
                "organization_id": api_data.get("organization_id"),
                "branch_id": api_data.get("branch_id"),
                "auth_type": "api_key"
            }
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key.")

    # 3. Check Stateful Session Bearer Token
    if not authorization or not isinstance(authorization, str) or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session token.")

    token = authorization.replace("Bearer ", "").strip()
    session = await SessionManager.validate_session(token, client_ip)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired (idle timeout or max lifetime reached). Please log in again."
        )

    return session


def check_permission(session: Dict[str, Any], permission_key: str) -> bool:
    """Evaluate whether the authenticated session holds a specific atomic permission or model CRUD right."""
    if not session:
        return False
    if session.get("is_superadmin"):
        return True

    # 1. Direct security_groups list
    sec_groups = session.get("security_groups", [])
    if "*" in sec_groups or permission_key in sec_groups:
        return True

    # 2. Permissions dictionary or array
    perms = session.get("permissions", {})
    if isinstance(perms, list):
        if "*" in perms or permission_key in perms:
            return True
    elif isinstance(perms, dict):
        if perms.get(permission_key) is True or perms.get(permission_key) == 1:
            return True
        if permission_key in perms.get("security_groups", []):
            return True

        # Specific HR Contract & Salary permission fallbacks
        if permission_key == "hr.contracts_read":
            if perms.get("employee_contracts", {}).get("read") or perms.get("contracts", {}).get("read"):
                return True
        elif permission_key == "hr.contracts_manage":
            if (perms.get("employee_contracts", {}).get("create") or perms.get("employee_contracts", {}).get("update") or
                perms.get("contracts", {}).get("create") or perms.get("contracts", {}).get("update") or perms.get("contracts", {}).get("manage")):
                return True
        elif permission_key == "hr.salary_read":
            if perms.get("employee_contracts", {}).get("salary_read") or perms.get("salary", {}).get("read"):
                return True
        elif permission_key == "hr.salary_manage":
            if perms.get("employee_contracts", {}).get("salary_manage") or perms.get("salary", {}).get("manage") or perms.get("salary", {}).get("write"):
                return True

        # Support "model.action" syntax (e.g., "employees.read", "employees.update", "attendance.write")
        if "." in permission_key:
            model_name, action = permission_key.split(".", 1)
            model_map = {
                "employee": "employees",
                "employees": "employees",
                "attendance": "attendance_logs",
                "attendance_logs": "attendance_logs",
                "roster": "shift_rosters",
                "rosters": "shift_rosters",
                "shift_rosters": "shift_rosters",
                "contract": "employee_contracts",
                "contracts": "employee_contracts",
                "employee_contracts": "employee_contracts",
                "org": "organizations",
                "organizations": "organizations",
                "branch": "branches",
                "branches": "branches",
                "terminal": "terminals",
                "terminals": "terminals",
                "payroll": "payroll_batches",
                "payroll_batches": "payroll_batches",
                "users": "users",
                "roles": "roles",
                "role": "roles",
                "hardware": "hardware",
                "documents": "employees",
                "document": "employees",
            }
            target_model = model_map.get(model_name, model_name)

            m_perms = perms.get(target_model)
            if not isinstance(m_perms, dict) and target_model == "shift_rosters":
                m_perms = perms.get("attendance_logs")
            elif not isinstance(m_perms, dict) and target_model in ("contracts", "employee_contracts"):
                m_perms = perms.get("employee_contracts") or perms.get("contracts")
            elif not isinstance(m_perms, dict) and target_model in ("payroll_batches", "payroll"):
                m_perms = perms.get("payroll_batches") or perms.get("payroll")
            elif not isinstance(m_perms, dict) and target_model in ("terminals", "hardware"):
                m_perms = perms.get("terminals") or perms.get("hardware")
            elif not isinstance(m_perms, dict) and target_model in ("branches", "organizations"):
                m_perms = perms.get("branches") or perms.get("organizations")

            if isinstance(m_perms, dict):
                if action == "read":
                    if m_perms.get("read"):
                        return True
                elif action == "delete":
                    if m_perms.get("delete") or m_perms.get("manage"):
                        return True
                elif action == "update":
                    if m_perms.get("update") or m_perms.get("write") or m_perms.get("manage"):
                        return True
                elif action == "create":
                    if m_perms.get("create") or m_perms.get("write") or m_perms.get("manage"):
                        return True
                elif action == "write":
                    if m_perms.get("write") or m_perms.get("update") or m_perms.get("create") or m_perms.get("manage"):
                        return True
                elif action == "manage":
                    if m_perms.get("manage") or (m_perms.get("create") and m_perms.get("update")):
                        return True
                elif action == "approve":
                    if m_perms.get("approve") or m_perms.get("update") or m_perms.get("manage"):
                        return True
                else:
                    if m_perms.get(action):
                        return True

            # Menu access check fallback
            menu_access = session.get("menu_access", [])
            if isinstance(menu_access, list):
                if permission_key in ("roles.read", "roles.manage") and "roles" in menu_access:
                    return True
                if permission_key in ("hardware.manage", "hardware.read") and ("terminals" in menu_access or "api_keys" in menu_access):
                    return True
                if permission_key in ("org.manage", "org.read") and ("orgs" in menu_access or "organizations" in menu_access):
                    return True

    return False


def require_permission(session: Dict[str, Any], permission_key: str):
    """Raise HTTP 403 Forbidden if user lacks required permission."""
    if not check_permission(session, permission_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Missing required permission '{permission_key}'."
        )


def can_read_salary(session: Dict[str, Any]) -> bool:
    """Returns True if the authenticated session holds salary reading permissions or superadmin."""
    if not session:
        return False
    if session.get("is_superadmin"):
        return True
    return bool(check_permission(session, "hr.salary_read") or check_permission(session, "hr.salary_manage"))


async def get_tenant_db_conn(
    session: Dict[str, Any] = Depends(get_current_user_session)
) -> AsyncGenerator[Any, None]:
    """
    FastAPI dependency and async context manager that acquires a pooled database connection,
    starts a transaction, and executes DatabaseRLSHelper.set_rls_session_context to apply
    PostgreSQL Row-Level Security (RLS) policies for the authenticated caller's tenant.
    Cleanly releases the connection and closes the transaction on exit.
    """
    pool = get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            user_id = str(session.get("user_id", "") or "")
            tenant_id = str(session.get("organization_id", "") or "")
            role = (
                "role_superadmin"
                if session.get("is_superadmin")
                else str(session.get("role_id") or session.get("role", "") or "")
            )
            await DatabaseRLSHelper.set_rls_session_context(
                conn,
                user_id=user_id,
                tenant_id=tenant_id,
                role=role
            )
            yield conn


tenant_db_context = asynccontextmanager(get_tenant_db_conn)


def verify_record_tenant(record_org_id: Any, session: Dict[str, Any]) -> None:
    """
    Enforce tenant boundary checks on record mutations and lookups.
    Superadmins bypass this check.
    Raises HTTP 403 Forbidden on cross-tenant mismatch.
    """
    if (
        not session.get("is_superadmin")
        and session.get("organization_id")
        and record_org_id
        and str(record_org_id) != str(session.get("organization_id"))
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant access denied."
        )