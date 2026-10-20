import os
from typing import Optional, Dict, Any, List
from fastapi import Request, HTTPException, status, Header, Depends

from backend.core.config import settings
from backend.core.session import SessionManager, verify_client_cidr
from backend.core.auth_suite import APIKeyEngine


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
    if x_api_key:
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
    if not authorization or not authorization.startswith("Bearer "):
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
                "org": "organizations",
                "organizations": "organizations",
                "users": "users",
                "roles": "roles",
                "role": "roles",
                "hardware": "hardware",
                "documents": "employees",
                "document": "employees",
            }
            target_model = model_map.get(model_name, model_name)

            if isinstance(perms.get(target_model), dict):
                m_perms = perms[target_model]
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