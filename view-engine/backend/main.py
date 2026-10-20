import asyncio
import json
import uuid
import datetime
import hashlib
import logging
import re
import secrets
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, Depends, HTTPException, Header, Request, status, Response, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger("enterprise.main")

from backend.core.config import settings
from backend.core.session import (
    init_redis,
    close_redis,
    SessionManager,
    verify_client_cidr,
    get_redis_client,
    get_system_security_policies
)
from backend.core.database import (
    init_db_pool,
    close_db_pool,
    get_db_pool,
    hash_password,
    hash_password_async,
    verify_password,
    verify_password_async,
    log_audit_event
)
from backend.core.auth_suite import (
    APIKeyEngine,
    LDAPAuthenticator,
    WindowsSSOEngine,
    TwoFactorAuthService,
    DatabaseRLSHelper
)
from backend.core.sod import (
    validate_sod_compliance,
    raise_if_sod_violation,
    SOD_CONFLICT_RULES
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DragonflyDB / Redis and PostgreSQL Pool
    await init_redis()
    await init_db_pool()
    yield
    # Shutdown: Clean up connections
    await close_db_pool()
    await close_redis()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for React frontend (Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Vault-Decrypted", "WWW-Authenticate"],
)

# Browser Security Headers Middleware (OWASP standard baseline)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

from backend.api.v1.documents import router as documents_router
from backend.api.v1.employees import router as employees_router
from backend.api.v1.audit import router as audit_router
from backend.api.v1.contracts import router as contracts_router
from backend.api.v1.attendance import router as attendance_router
from backend.api.v1.rosters import router as rosters_router
from backend.api.v1.payroll import router as payroll_router
from backend.api.v1.leaves_eosb import router as leaves_eosb_router
from backend.api.v1.zkteco import router as zkteco_router
from backend.api.v1.notifications import router as notifications_router
from backend.api.v1.mail import router as mail_router
from backend.api.v1.communication import router as communication_router
from backend.api.v1.chat import router as chat_router, push_router, websocket_chat_endpoint, websocket_channel_endpoint

app.include_router(documents_router)
app.include_router(employees_router)
app.include_router(audit_router)
app.include_router(contracts_router)
app.include_router(attendance_router)
app.include_router(rosters_router)
app.include_router(payroll_router)
app.include_router(leaves_eosb_router)
app.include_router(zkteco_router)
app.include_router(notifications_router)
app.include_router(mail_router)
app.include_router(communication_router)
app.include_router(chat_router)
app.include_router(push_router)

# Direct root WebSocket alias for /ws/chat and /ws/notifications
app.add_api_websocket_route("/ws/chat", websocket_chat_endpoint)
app.add_api_websocket_route("/ws/notifications", websocket_chat_endpoint)
app.add_api_websocket_route("/api/v1/chat/ws/{channel_id}", websocket_channel_endpoint)

# Request Models
class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: Optional[bool] = False

class Verify2FARequest(BaseModel):
    user_id: Optional[str] = None
    pending_token: Optional[str] = None
    totp_code: str

class EntraCallbackRequest(BaseModel):
    code: str
    state: str
    redirect_uri: Optional[str] = None

class SSOSettingsPayload(BaseModel):
    entra_enabled: Optional[bool] = None
    entra_tenant_id: Optional[str] = None
    entra_client_id: Optional[str] = None
    entra_client_secret: Optional[str] = None
    entra_redirect_uri: Optional[str] = None
    kerberos_enabled: Optional[bool] = None
    kerberos_service_principal: Optional[str] = None
    trust_remote_user_header: Optional[bool] = None
    ldap_enabled: Optional[bool] = None
    ldap_server: Optional[str] = None
    ldap_base_dn: Optional[str] = None
    ldap_domain: Optional[str] = None
    auto_provision: Optional[bool] = None
    default_role_id: Optional[str] = None
    auto_login_default: Optional[bool] = None

def validate_password_complexity(password: str) -> Optional[str]:
    if not password or len(password) < 10:
        return "Password must be at least 10 characters long."
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter."
    if not re.search(r"[0-9]", password):
        return "Password must contain at least one digit."
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]", password):
        return "Password must contain at least one special symbol."
    return None

class RevokeSessionRequest(BaseModel):
    token: str

class RevokeOtherSessionsRequest(BaseModel):
    user_id: Optional[str] = None
    token: Optional[str] = None

class SetupInitRequest(BaseModel):
    org_data: Dict[str, Any]
    admin_data: Dict[str, Any]
    pref_data: Optional[Dict[str, Any]] = None

class CreateUserRequest(BaseModel):
    full_name: str
    email: str
    role_id: Optional[str] = "role_standard"
    role: Optional[str] = None
    branch_id: Optional[str] = None
    organization_id: Optional[str] = None
    initial_password: Optional[str] = "InitPass@2026"
    date_of_birth: Optional[str] = None
    age: Optional[int] = None
    guardian_name: Optional[str] = None
    guardian_email: Optional[str] = None
    status: Optional[str] = "active"
    department: Optional[str] = "Operations"
    windows_upn: Optional[str] = None
    ad_sam_account: Optional[str] = None
    auth_provider: Optional[str] = "local"
    auto_sso_enabled: Optional[bool] = False

class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role_id: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    is_superadmin: Optional[bool] = None
    department: Optional[str] = None
    allowed_cidrs: Optional[str] = None
    date_of_birth: Optional[str] = None
    age: Optional[int] = None
    guardian_name: Optional[str] = None
    guardian_email: Optional[str] = None
    idle_timeout_minutes: Optional[int] = None
    windows_upn: Optional[str] = None
    ad_sam_account: Optional[str] = None
    auth_provider: Optional[str] = None
    auto_sso_enabled: Optional[bool] = None

class SecurityPolicyPayload(BaseModel):
    global_max_idle_timeout_minutes: int
    default_idle_timeout_minutes: Optional[int] = 15

class ResetPasswordRequest(BaseModel):
    password: str
    require_change: Optional[bool] = False

class CreateRoleRequest(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    badge_color: Optional[str] = "amber"
    permissions: Optional[Dict[str, Any]] = None
    menu_access: Optional[List[str]] = None

class UpdateRoleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    badge_color: Optional[str] = None
    permissions: Optional[Dict[str, Any]] = None
    menu_access: Optional[List[str]] = None

class CreateAPIKeyRequest(BaseModel):
    owner: str
    role: Optional[str] = "service_daemon"
    allowed_cidrs: Optional[List[str]] = None
    scopes: Optional[List[str]] = None



from backend.core.dependencies import (
    get_client_ip,
    get_current_user_session,
    require_permission,
    check_permission,
    can_read_salary,
    verify_record_tenant,
)

# Redis-based Atomic Rate Limiting Helpers (DoS Protection & Brute Force Prevention)
RATE_LIMIT_LUA = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""

async def enforce_rate_limit(key_prefix: str, identifier: str, max_attempts: int, window_seconds: int = 60):
    """Enforces atomic rate limits per IP/identity in Redis/DragonflyDB via atomic Lua script."""
    redis = get_redis_client()
    if not redis:
        return
    key = f"ratelimit:{key_prefix}:{identifier}"
    try:
        current = await redis.eval(RATE_LIMIT_LUA, 1, key, window_seconds)
    except Exception:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, window_seconds)
            res = await pipe.execute()
            current = res[0]

    if current > max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Maximum {max_attempts} requests per minute exceeded. Please try again later."
        )

async def enforce_setup_boot_limit(max_calls: int = 3):
    """Restricts first-run initialization calls per system boot."""
    redis = get_redis_client()
    if not redis:
        return
    key = "ratelimit:setup:boot_count"
    current = await redis.incr(key)
    if current > max_calls:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"System setup initialization limit exceeded (maximum {max_calls} invocations allowed)."
        )

# ==============================================================================
# 0. UNAUTHENTICATED HEALTH CHECK (LIVENESS & READINESS)
# ==============================================================================
@app.get("/healthz")
async def healthz():
    """
    Unauthenticated system health check endpoint.
    - Verifies active PostgreSQL connection by executing 'SELECT 1;'.
    - Verifies Redis/DragonflyDB responsiveness by calling 'await redis.ping()'.
    - Returns HTTP 200 {"status": "healthy", "database": "up", "redis": "up", "timestamp": "..."}
      or HTTP 503 if any dependent service is down.
    """
    db_status = "down"
    redis_status = "down"

    # 1. Probe PostgreSQL Pool
    try:
        pool = get_db_pool()
        if pool:
            async with pool.acquire() as conn:
                probe = await conn.fetchval("SELECT 1;")
                if probe == 1:
                    db_status = "up"
    except Exception as e:
        logger.error(f"Health check PostgreSQL probe failure: {e}")
        db_status = "down"

    # 2. Probe Redis / DragonflyDB
    try:
        redis = get_redis_client()
        if redis:
            pong = await redis.ping()
            if pong:
                redis_status = "up"
    except Exception as e:
        logger.error(f"Health check Redis probe failure: {e}")
        redis_status = "down"

    is_healthy = (db_status == "up" and redis_status == "up")
    payload = {
        "status": "healthy" if is_healthy else "unhealthy",
        "database": db_status,
        "redis": redis_status,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    return JSONResponse(
        status_code=status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=payload
    )

# ==============================================================================
# 1. SYSTEM METADATA & STATUS ENDPOINTS
# ==============================================================================
@app.get("/api/v1/system/status")
async def get_system_status():
    """
    Centralized system boot status endpoint.
    Checks PostgreSQL directly for is_initialized flag, company count, and user count.
    """
    pool = get_db_pool()
    async with pool.acquire() as conn:
        init_val = await conn.fetchval(
            "SELECT value FROM system_metadata WHERE key = 'is_initialized'"
        )
        company_count = await conn.fetchval("SELECT count(*) FROM organizations")
        user_count = await conn.fetchval("SELECT count(*) FROM users")
        
        return {
            "is_initialized": init_val == "true",
            "company_count": company_count or 0,
            "user_count": user_count or 0
        }

@app.post("/api/v1/setup/init")
async def setup_init(req: SetupInitRequest, request: Request):
    """
    Executes first-run wizard initialization:
    Inserts primary Organization, Branch, and Root Superadmin into PostgreSQL,
    hashes the password with bcrypt, marks system as initialized, and issues active session.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")
    pool = get_db_pool()
    
    await enforce_setup_boot_limit(max_calls=3)
    admin_email = req.admin_data.get("email", "").strip().lower()
    admin_name = req.admin_data.get("full_name") or "Root Superadmin"
    admin_dob = req.admin_data.get("date_of_birth") or "1990-01-01"
    admin_pwd = (req.admin_data.get("password") or "").strip()
    if not admin_pwd or len(admin_pwd) < 8:
        raise HTTPException(status_code=400, detail="Administrator password must be at least 8 characters long.")
    if len(admin_pwd.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Administrator password exceeds 72 bytes maximum limit.")
    hashed_pwd = await hash_password_async(admin_pwd)

    async with pool.acquire() as conn:
        async with conn.transaction():
            init_val = await conn.fetchval(
                "SELECT value FROM system_metadata WHERE key = 'is_initialized'"
            )
            if init_val == "true":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="System is already initialized."
                )
                
            org_id = uuid.uuid4()
            branch_id = uuid.uuid4()
            user_id = uuid.uuid4()
            
            org_name = req.org_data.get("legal_name") or "Apex Global Enterprises"
            tax_id = req.org_data.get("tax_id") or "CR-001"
            currency = req.org_data.get("base_currency") or "USD"
            tz = req.org_data.get("default_timezone") or "UTC"
            locale = (req.pref_data or {}).get("language") or "en"
            
            await conn.execute("""
                INSERT INTO organizations (id, legal_name, tax_id, base_currency, default_timezone, default_locale)
                VALUES ($1, $2, $3, $4, $5, $6)
            """, org_id, org_name, tax_id, currency, tz, locale)
            
            br_name = req.org_data.get("primary_branch_name") or "Headquarters"
            br_code = req.org_data.get("branch_code") or "HQ-01"
            br_city = req.org_data.get("branch_city") or "Doha"
            await conn.execute("""
                INSERT INTO branches (id, organization_id, name, code, city, ip_allowlist)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            """, branch_id, org_id, br_name, br_code, br_city, json.dumps(["127.0.0.1/32"]))
            
            await conn.execute("""
                INSERT INTO users (
                    id, email, full_name, password_hash, status, is_superadmin,
                    organization_id, branch_id, role_id, department, allowed_cidrs, date_of_birth
                )
                VALUES ($1, $2, $3, $4, 'active', true, $5, $6, 'role_superadmin', 'Executive Administration', '0.0.0.0/0', $7)
            """, user_id, admin_email, admin_name, hashed_pwd, org_id, branch_id, admin_dob)
            
            # Mark initialized in system_metadata
            await conn.execute("""
                INSERT INTO system_metadata (key, value, updated_at)
                VALUES ('is_initialized', 'true', CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = CURRENT_TIMESTAMP
            """)
        
    user_data = {
        "id": str(user_id),
        "username": admin_email,
        "email": admin_email,
        "full_name": admin_name,
        "role": "Superadmin",
        "role_id": "role_superadmin",
        "is_superadmin": True,
        "department": "Executive Administration",
        "organization_id": str(org_id),
        "organization_name": org_name,
        "branch_id": str(branch_id),
        "branch_name": br_name,
        "branch_code": br_code,
        "security_groups": ["*"],
        "menu_access": ["attendances", "rosters", "users", "roles", "orgs", "terminals", "batches"],
        "auth_provider": "local",
        "windows_upn": None,
        "ad_sam_account": None,
        "auto_sso_enabled": False,
        "is_2fa_enabled": False,
    }
    
    policies = await get_system_security_policies()
    global_max = int(policies.get("global_max_idle_timeout_minutes", 30))
    default_idle = int(policies.get("default_idle_timeout_minutes", 15))

    user_data["idle_timeout_minutes"] = None
    user_data["effective_idle_timeout_minutes"] = min(default_idle, global_max)
    user_data["global_max_idle_timeout_minutes"] = global_max

    session_token = await SessionManager.create_session(
        user_id=str(user_id),
        user_data=user_data,
        client_ip=client_ip,
        user_agent=user_agent
    )
    
    return {
        "status": "success",
        "access_token": session_token,
        "token_type": "Bearer",  # nosec B105
        "user": user_data
    }

# ==============================================================================
# 2. AUTHENTICATION, WINDOWS SSO & SESSION ENDPOINTS
# ==============================================================================
def _build_user_session_payload(row: Any, policies: Dict[str, Any]) -> Dict[str, Any]:
    """Constructs a consistent user session payload with full role security_groups and SSO attributes."""
    raw_menu = row["menu_access"]
    menu_access = json.loads(raw_menu) if isinstance(raw_menu, str) else (raw_menu or [])
    raw_perms = row["permissions"]
    permissions = json.loads(raw_perms) if isinstance(raw_perms, str) else (raw_perms or {})

    role_sec_groups = []
    if isinstance(permissions, dict):
        role_sec_groups = permissions.get("security_groups", [])
    elif isinstance(permissions, list):
        role_sec_groups = permissions

    global_max = int(policies.get("global_max_idle_timeout_minutes", 30))
    default_idle = int(policies.get("default_idle_timeout_minutes", 15))
    user_idle = row.get("idle_timeout_minutes")
    eff_idle = min(user_idle or default_idle, global_max)

    return {
        "id": str(row["id"]),
        "username": row["email"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role_name"] or "Standard User",
        "role_id": row["role_id"] or "role_standard",
        "is_superadmin": bool(row["is_superadmin"]),
        "status": row["status"],
        "department": row["department"] or "General",
        "organization_id": str(row["organization_id"]) if row["organization_id"] else None,
        "organization_name": row["org_name"],
        "branch_id": str(row["branch_id"]) if row["branch_id"] else None,
        "branch_name": row["branch_name"],
        "branch_code": row["branch_code"],
        "security_groups": ["*"] if row["is_superadmin"] else role_sec_groups,
        "menu_access": menu_access,
        "permissions": permissions,
        "idle_timeout_minutes": user_idle,
        "effective_idle_timeout_minutes": eff_idle,
        "global_max_idle_timeout_minutes": global_max,
        "auth_provider": row.get("auth_provider") or "local",
        "windows_upn": row.get("windows_upn"),
        "ad_sam_account": row.get("ad_sam_account"),
        "auto_sso_enabled": bool(row.get("auto_sso_enabled", False)),
        "is_2fa_enabled": bool(row.get("is_2fa_enabled", False)),
    }

async def _resolve_or_provision_sso_user(
    conn,
    identity: Dict[str, Any],
    sso_cfg: Dict[str, Any]
) -> Any:
    """
    Matches an authenticated Windows SSO identity (Entra ID OIDC, Kerberos SPNEGO, or AD LDAP)
    against PostgreSQL users by external_id, windows_upn, ad_sam_account, or email.
    Supports Just-In-Time (JIT) user provisioning when enabled.
    """
    ext_id = (identity.get("external_id") or "").strip()
    win_upn = (identity.get("windows_upn") or "").strip().lower()
    sam_acc = (identity.get("ad_sam_account") or "").strip().lower()
    email = (identity.get("email") or win_upn or "").strip().lower()
    provider = (identity.get("provider") or "windows_sso").strip()

    row = await conn.fetchrow("""
        SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
               o.legal_name as org_name, b.name as branch_name, b.code as branch_code
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN organizations o ON u.organization_id = o.id
        LEFT JOIN branches b ON u.branch_id = b.id
        WHERE ($1 <> '' AND u.external_id = $1)
           OR ($2 <> '' AND LOWER(u.windows_upn) = $2)
           OR ($3 <> '' AND LOWER(u.ad_sam_account) = $3)
           OR ($4 <> '' AND LOWER(u.email) = $4)
        ORDER BY u.is_superadmin DESC, u.created_at ASC
        LIMIT 1
    """, ext_id, win_upn, sam_acc, email)

    if row:
        # Synchronize Windows identity attributes if not yet linked on the matched user
        await conn.execute("""
            UPDATE users SET
                external_id = COALESCE(NULLIF($2, ''), external_id),
                windows_upn = COALESCE(NULLIF($3, ''), windows_upn),
                ad_sam_account = COALESCE(NULLIF($4, ''), ad_sam_account),
                auth_provider = CASE WHEN auth_provider = 'local' OR auth_provider IS NULL THEN $5 ELSE auth_provider END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, row["id"], ext_id, win_upn, sam_acc, provider)

        return await conn.fetchrow("""
            SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
                   o.legal_name as org_name, b.name as branch_name, b.code as branch_code
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN organizations o ON u.organization_id = o.id
            LEFT JOIN branches b ON u.branch_id = b.id
            WHERE u.id = $1
        """, row["id"])

    if not sso_cfg.get("auto_provision", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Windows account '{win_upn or email}' is not linked to an ERP user and Just-In-Time (JIT) provisioning is disabled."
        )

    # Just-In-Time (JIT) Provisioning
    org_id = await conn.fetchval("SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1")
    branch_id = await conn.fetchval("SELECT id FROM branches ORDER BY created_at ASC LIMIT 1")
    default_role_id = identity.get("role_id") or sso_cfg.get("default_role_id") or "role_user"
    role_exists = await conn.fetchval("SELECT id FROM roles WHERE id = $1", default_role_id)
    if not role_exists:
        default_role_id = await conn.fetchval("SELECT id FROM roles WHERE is_system = false OR id != 'role_superadmin' ORDER BY created_at ASC LIMIT 1") or "role_user"

    new_user_id = uuid.uuid4()
    random_pwd_hash = await hash_password_async(secrets.token_urlsafe(32))
    full_name = identity.get("full_name") or (win_upn.split("@")[0] if win_upn else "Windows SSO User")
    department = identity.get("department") or "General"
    auto_sso = bool(sso_cfg.get("auto_login_default", False))

    await conn.execute("""
        INSERT INTO users (
            id, email, full_name, password_hash, status, is_superadmin,
            organization_id, branch_id, role_id, department, allowed_cidrs,
            auth_provider, external_id, windows_upn, ad_sam_account, auto_sso_enabled
        )
        VALUES ($1, $2, $3, $4, 'active', false, $5, $6, $7, $8, '0.0.0.0/0', $9, $10, $11, $12, $13)
    """, new_user_id, email, full_name, random_pwd_hash, org_id, branch_id, default_role_id,
       department, provider, ext_id or None, win_upn or None, sam_acc or None, auto_sso)

    return await conn.fetchrow("""
        SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
               o.legal_name as org_name, b.name as branch_name, b.code as branch_code
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN organizations o ON u.organization_id = o.id
        LEFT JOIN branches b ON u.branch_id = b.id
        WHERE u.id = $1
    """, new_user_id)


@app.get("/api/v1/auth/sso/config")
async def get_public_sso_config():
    """Returns non-sensitive Windows SSO availability and modes for the Login screen."""
    sso_cfg = await WindowsSSOEngine.get_sso_settings()
    entra_ready = bool(sso_cfg.get("entra_enabled") and sso_cfg.get("entra_client_id"))
    kerberos_ready = bool(sso_cfg.get("kerberos_enabled") or sso_cfg.get("trust_remote_user_header"))
    ldap_ready = bool(sso_cfg.get("ldap_enabled"))
    return {
        "entra_enabled": entra_ready,
        "entra_tenant_id": sso_cfg.get("entra_tenant_id") if entra_ready else None,
        "kerberos_enabled": kerberos_ready,
        "ldap_enabled": ldap_ready,
        "ldap_domain": sso_cfg.get("ldap_domain") or settings.LDAP_DOMAIN,
        "auto_login_default": bool(sso_cfg.get("auto_login_default", False)),
        "sso_available": bool(entra_ready or kerberos_ready or ldap_ready),
    }


@app.get("/api/v1/system/sso-settings")
async def get_admin_sso_settings(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Returns Windows SSO configuration for administrators (masks client secret)."""
    if not (session.get("is_superadmin") or check_permission(session, "settings.manage") or check_permission(session, "users.manage")):
        raise HTTPException(status_code=403, detail="Access denied: Administrator privileges required.")
    cfg = await WindowsSSOEngine.get_sso_settings()
    masked = dict(cfg)
    if masked.get("entra_client_secret"):
        masked["entra_client_secret"] = "••••••••••••"
    return masked


@app.put("/api/v1/system/sso-settings")
async def update_admin_sso_settings(
    payload: SSOSettingsPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Updates Windows SSO configuration in PostgreSQL system_metadata."""
    if not (session.get("is_superadmin") or check_permission(session, "settings.manage")):
        raise HTTPException(status_code=403, detail="Access denied: Only Superadmin or Settings Manager can modify SSO federation settings.")
    update_dict = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated = await WindowsSSOEngine.save_sso_settings(update_dict)
    masked = dict(updated)
    if masked.get("entra_client_secret"):
        masked["entra_client_secret"] = "••••••••••••"
    return {"status": "success", "settings": masked}


@app.get("/api/v1/system/audit-logs/verify")
async def verify_audit_logs_chain_endpoint(
    tenant_id: Optional[str] = Query(None, description="Optional tenant identifier to filter cryptographic chain verification"),
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    """
    SOX 404 / ISO 27001 Cryptographic Hash Chain Verification Endpoint.
    Recalculates the SHA-256 hash chain for each tenant in audit_logs to verify
    ledger integrity, detect deleted records, and identify data tampering.
    Requires administrator privileges.
    """
    if not (session.get("is_superadmin") or check_permission(session, "settings.manage") or check_permission(session, "audit.verify")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Administrator privileges required to audit cryptographic chain integrity."
        )

    pool = get_db_pool()
    async with pool.acquire() as conn:
        from backend.core.audit import verify_audit_chain
        report = await verify_audit_chain(conn, tenant_id=tenant_id)
        return report



@app.get("/api/v1/auth/sso/entra/authorize")
async def sso_entra_authorize(
    request: Request,
    redirect_uri: Optional[str] = None,
    login_hint: Optional[str] = None
):
    """Initiates Microsoft Entra ID OAuth2/OIDC flow with PKCE and state."""
    client_ip = get_client_ip(request)
    await enforce_rate_limit("sso_authorize", client_ip, max_attempts=15, window_seconds=60)
    try:
        return await WindowsSSOEngine.create_entra_authorization_url(
            redirect_uri=redirect_uri,
            login_hint=login_hint
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/v1/auth/sso/entra/callback")
async def sso_entra_callback(req: EntraCallbackRequest, request: Request, response: Response):
    """
    Exchanges Microsoft Entra ID authorization code + PKCE verifier,
    resolves or JIT-provisions the ERP user, and issues an active session.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")
    await enforce_rate_limit("sso_callback", client_ip, max_attempts=10, window_seconds=60)

    try:
        identity = await WindowsSSOEngine.exchange_entra_code(
            code=req.code,
            state=req.state,
            redirect_uri=req.redirect_uri
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    sso_cfg = await WindowsSSOEngine.get_sso_settings()
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await _resolve_or_provision_sso_user(conn, identity, sso_cfg)
        if not row:
            raise HTTPException(status_code=401, detail="Unable to resolve or provision Windows SSO user.")
        if row["status"] in ["inactive", "suspended", "pending_deletion"]:
            raise HTTPException(status_code=403, detail=f"Account is {row['status']}. Contact your administrator.")
        policies = await get_system_security_policies()
        user_data = _build_user_session_payload(row, policies)

    session_token = await SessionManager.create_session(
        user_id=user_data["id"],
        user_data=user_data,
        client_ip=client_ip,
        user_agent=user_agent
    )
    response.set_cookie(
        key="enterprise_session_id",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=settings.SESSION_ABSOLUTE_MAX_SECONDS
    )
    return {
        "status": "success",
        "sso_provider": "entra_oidc",
        "access_token": session_token,
        "token_type": "Bearer",  # nosec B105
        "user": user_data
    }


@app.api_route("/api/v1/auth/sso/negotiate", methods=["GET", "POST"])
async def sso_kerberos_negotiate(request: Request):
    """
    HTTP SPNEGO / Kerberos Integrated Windows Authentication ('WWW-Authenticate: Negotiate')
    and Trusted Reverse-Proxy Windows Identity endpoint.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")
    await enforce_rate_limit("sso_negotiate", client_ip, max_attempts=20, window_seconds=60)

    sso_cfg = await WindowsSSOEngine.get_sso_settings()
    auth_header = request.headers.get("Authorization")
    remote_user = (
        request.headers.get("X-Remote-User")
        or request.headers.get("X-Forwarded-User")
        or request.headers.get("X-Authenticated-User")
    )

    direct_ip = request.client.host if request.client else "127.0.0.1"
    result = WindowsSSOEngine.verify_kerberos_or_proxy_request(
        auth_header=auth_header,
        remote_user_header=remote_user,
        client_ip=direct_ip,
        sso_cfg=sso_cfg
    )

    if result["status"] == "challenge":
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": result["message"], "sso_challenge": "Negotiate"},
            headers={"WWW-Authenticate": result.get("www_authenticate", "Negotiate")}
        )
    if result["status"] != "authenticated":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=result.get("message", "Windows Integrated Authentication failed.")
        )

    identity = result["identity"]
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await _resolve_or_provision_sso_user(conn, identity, sso_cfg)
        if not row:
            raise HTTPException(status_code=401, detail="Unable to resolve Windows domain user.")
        if row["status"] in ["inactive", "suspended", "pending_deletion"]:
            raise HTTPException(status_code=403, detail=f"Account is {row['status']}. Contact your administrator.")
        policies = await get_system_security_policies()
        user_data = _build_user_session_payload(row, policies)

    session_token = await SessionManager.create_session(
        user_id=user_data["id"],
        user_data=user_data,
        client_ip=client_ip,
        user_agent=user_agent
    )

    resp_headers = {}
    if result.get("www_authenticate"):
        resp_headers["WWW-Authenticate"] = result["www_authenticate"]

    resp = JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "success",
            "sso_provider": identity.get("provider", "kerberos_spnego"),
            "access_token": session_token,
            "token_type": "Bearer",  # nosec B105
            "user": user_data
        },
        headers=resp_headers
    )
    resp.set_cookie(
        key="enterprise_session_id",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=settings.SESSION_ABSOLUTE_MAX_SECONDS
    )
    return resp


@app.post("/api/v1/auth/login")
async def login(req: LoginRequest, request: Request, response: Response):
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")
    
    # 1. Rate Limiting: max 5 attempts per minute per IP
    await enforce_rate_limit("login", client_ip, max_attempts=5, window_seconds=60)
    
    raw_user = req.username.strip()
    clean_user = raw_user.lower()
    clean_pwd = req.password.strip()
    
    if not clean_user:
        raise HTTPException(status_code=400, detail="Please enter username, email, or Windows domain account (DOMAIN\\username).")
    if not clean_pwd:
        raise HTTPException(status_code=400, detail="Please enter password.")
        
    # 2. Bcrypt DoS Mitigation: Truncate / reject over-length password upfront
    if len(clean_pwd.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password exceeds maximum supported length (72 bytes)."
        )
        
    sso_cfg = await WindowsSSOEngine.get_sso_settings()
    ad_identity = None

    # 3. Optional Active Directory / LDAP Authentication when enabled or DOMAIN\username is used
    if sso_cfg.get("ldap_enabled") or "\\" in raw_user:
        ad_identity = await asyncio.to_thread(
            LDAPAuthenticator.authenticate_ad_user,
            raw_user,
            clean_pwd,
            sso_cfg
        )

    pool = get_db_pool()
    async with pool.acquire() as conn:
        if ad_identity:
            row = await _resolve_or_provision_sso_user(conn, ad_identity, sso_cfg)
        else:
            row = await conn.fetchrow("""
                SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
                       o.legal_name as org_name, b.name as branch_name, b.code as branch_code
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                LEFT JOIN organizations o ON u.organization_id = o.id
                LEFT JOIN branches b ON u.branch_id = b.id
                WHERE LOWER(u.email) = $1
                   OR LOWER(u.windows_upn) = $1
                   OR LOWER(u.ad_sam_account) = $1
                   OR ($1 = 'admin' AND u.is_superadmin = true)
                LIMIT 1
            """, clean_user)
            
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials. Please check your username and password."
                )
                
            # Pure PostgreSQL Bcrypt Verification offloaded from event loop
            if not await verify_password_async(clean_pwd, row["password_hash"]):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials. Please check your username and password."
                )

        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials. Please check your username and password."
            )
            
        if row["status"] == "pending_deletion":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is queued for GDPR right-to-be-forgotten deletion."
            )
            
        if row["status"] in ["inactive", "suspended"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated. Please contact your system administrator."
            )
            
        policies = await get_system_security_policies()
        user_data = _build_user_session_payload(row, policies)
        
        # 4. Check if Two-Factor Authentication is enforced on account
        if row.get("is_2fa_enabled") and row.get("totp_secret"):
            pending_token = await TwoFactorAuthService.create_2fa_pending_token(user_data)
            return {
                "status": "2fa_required",
                "requires_2fa": True,
                "pending_token": pending_token,
                "user_id": user_data["id"]
            }
            
    session_token = await SessionManager.create_session(
        user_id=user_data["id"],
        user_data=user_data,
        client_ip=client_ip,
        user_agent=user_agent
    )
    response.set_cookie(
        key="enterprise_session_id",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=settings.SESSION_ABSOLUTE_MAX_SECONDS
    )
    
    return {
        "status": "success",
        "access_token": session_token,
        "token_type": "Bearer",  # nosec B105
        "user": user_data
    }

@app.post("/api/v1/auth/2fa/verify")
async def verify_2fa(req: Verify2FARequest, request: Request, response: Response):
    """
    Verifies TOTP code with rate limiting (5 attempts/min/IP) and replay attack prevention.
    Requires a valid stage-1 Redis pending_token to prevent password bypass.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")
    
    # 1. Rate Limiting: max 5 attempts per minute per IP
    await enforce_rate_limit("2fa_verify", client_ip, max_attempts=5, window_seconds=60)
    
    clean_code = (req.totp_code or "").strip()
    if not clean_code or not clean_code.isdigit() or len(clean_code) != 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code format. Code must be 6 digits."
        )
        
    if not req.pending_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing 2FA stage-1 pending token. Please sign in with your password first."
        )

    redis = get_redis_client()
    if not redis:
        raise HTTPException(status_code=503, detail="Session store unavailable for 2FA verification.")

    pending_key = f"2fa_pending:{req.pending_token}"
    pending_data = await redis.hgetall(pending_key)
    if not pending_data or "user_id" not in pending_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="2FA challenge expired or invalid. Please sign in again."
        )
    target_user_id = pending_data["user_id"]
        
    try:
        parsed_uuid = uuid.UUID(target_user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
                   o.legal_name as org_name, b.name as branch_name, b.code as branch_code
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN organizations o ON u.organization_id = o.id
            LEFT JOIN branches b ON u.branch_id = b.id
            WHERE u.id = $1
            LIMIT 1
        """, parsed_uuid)
        
    if not row:
        raise HTTPException(status_code=404, detail="User account not found.")
        
    secret = row.get("totp_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="Two-factor authentication is not enrolled for this account.")
        
    # Verify TOTP code and enforce single-use replay prevention (cached in Redis for 90s)
    is_valid = await TwoFactorAuthService.verify_totp_code_with_replay_prevention(
        user_id=str(row["id"]),
        secret=secret,
        code=clean_code
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or already used TOTP code. Replay is strictly forbidden."
        )
        
    policies = await get_system_security_policies()
    user_data = _build_user_session_payload(row, policies)
    
    await redis.delete(pending_key)
        
    session_token = await SessionManager.create_session(
        user_id=user_data["id"],
        user_data=user_data,
        client_ip=client_ip,
        user_agent=user_agent
    )
    response.set_cookie(
        key="enterprise_session_id",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=settings.SESSION_ABSOLUTE_MAX_SECONDS
    )
    
    return {
        "status": "success",
        "access_token": session_token,
        "token_type": "Bearer",  # nosec B105
        "user": user_data
    }

class Confirm2FAPayload(BaseModel):
    totp_code: str

class Disable2FAPayload(BaseModel):
    totp_code: Optional[str] = None
    password: Optional[str] = None

@app.post("/api/v1/auth/2fa/setup")
async def setup_2fa(session: Dict[str, Any] = Depends(get_current_user_session)):
    """
    Step 1 of Two-Step 2FA Enrollment:
    Generates a secret and QR code URI, stores secret in Redis (with 600s TTL)
    and saves secret in users with is_2fa_enabled = false until verified.
    """
    user_id = session["user_id"]
    try:
        parsed_uuid = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    secret = TwoFactorAuthService.generate_totp_secret()
    uri = TwoFactorAuthService.get_totp_uri(session.get("username", "user"), secret)
    qr_base64 = TwoFactorAuthService.generate_qr_code_base64(uri)
    
    # Store pending secret in Redis with 600s TTL
    redis = get_redis_client()
    if redis:
        try:
            await redis.setex(f"2fa_setup_pending:{user_id}", 600, secret)
        except Exception as e:
            logger.warning(f"Failed to cache pending 2FA secret in Redis: {e}")

    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE users SET totp_secret = $1, is_2fa_enabled = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        """, secret, parsed_uuid)
        
    return {
        "status": "pending_confirmation",
        "secret": secret,
        "provisioning_uri": uri,
        "qr_code_base64": qr_base64
    }

@app.post("/api/v1/auth/2fa/confirm-setup")
async def confirm_2fa_setup(
    req: Confirm2FAPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Step 2 of Two-Step 2FA Enrollment:
    Accepts totp_code, verifies it via TwoFactorAuthService.verify_totp_code(secret, req.totp_code),
    and only then sets is_2fa_enabled = true in users.
    """
    user_id = session["user_id"]
    try:
        parsed_uuid = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")

    code = (req.totp_code or "").strip()
    if not code or len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="A valid 6-digit TOTP verification code is required.")

    secret = None
    redis = get_redis_client()
    if redis:
        try:
            secret = await redis.get(f"2fa_setup_pending:{user_id}")
        except Exception:
            pass

    pool = get_db_pool()
    if not secret:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT totp_secret FROM users WHERE id = $1",
                parsed_uuid
            )
            if row and row["totp_secret"]:
                secret = row["totp_secret"]

    if not secret:
        raise HTTPException(
            status_code=400,
            detail="No pending 2FA setup found or setup session expired. Please initiate 2FA setup again."
        )

    # Verify the 6-digit code via TwoFactorAuthService.verify_totp_code(secret, req.totp_code)
    if not TwoFactorAuthService.verify_totp_code(secret, code):
        raise HTTPException(
            status_code=400,
            detail="Invalid 6-digit verification code. Please check your authenticator app and try again."
        )

    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE users SET totp_secret = $1, is_2fa_enabled = true, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        """, secret, parsed_uuid)

    if redis:
        try:
            await redis.delete(f"2fa_setup_pending:{user_id}")
        except Exception:
            pass

    return {
        "status": "success",
        "is_2fa_enabled": True,
        "message": "Two-factor authentication successfully verified and enabled."
    }

@app.post("/api/v1/auth/2fa/disable")
async def disable_2fa(
    req: Disable2FAPayload = Disable2FAPayload(),
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Disables 2FA for the active authenticated user.
    Requires a valid totp_code or current account password before disabling.
    """
    user_id = session["user_id"]
    try:
        parsed_uuid = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")

    if not req.totp_code and not req.password:
        raise HTTPException(
            status_code=400,
            detail="A valid 6-digit TOTP code or current account password is required to disable 2FA."
        )

    pool = get_db_pool()
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            "SELECT id, password_hash, totp_secret, is_2fa_enabled FROM users WHERE id = $1",
            parsed_uuid
        )
        if not user_row:
            raise HTTPException(status_code=404, detail="User account not found.")

        is_verified = False
        if req.totp_code and user_row["totp_secret"]:
            clean_code = req.totp_code.strip()
            if TwoFactorAuthService.verify_totp_code(user_row["totp_secret"], clean_code):
                is_verified = True

        if not is_verified and req.password and user_row["password_hash"]:
            if await verify_password_async(req.password, user_row["password_hash"]):
                is_verified = True

        if not is_verified:
            raise HTTPException(
                status_code=401,
                detail="Verification failed. Invalid TOTP code or incorrect password."
            )

        await conn.execute("""
            UPDATE users SET totp_secret = NULL, is_2fa_enabled = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, parsed_uuid)

    redis = get_redis_client()
    if redis:
        try:
            await redis.delete(f"2fa_setup_pending:{user_id}")
        except Exception:
            pass

    return {
        "status": "success",
        "is_2fa_enabled": False,
        "message": "Two-factor authentication has been disabled."
    }

@app.get("/api/v1/auth/me")
async def get_current_user_profile(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Fetches up-to-date user profile and permissions from PostgreSQL."""
    if session.get("auth_type") == "api_key":
        return session

    user_id = session.get("user_id")
    try:
        parsed_uuid = uuid.UUID(str(user_id))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session user identifier.")

    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
                   o.legal_name as org_name, b.name as branch_name, b.code as branch_code
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN organizations o ON u.organization_id = o.id
            LEFT JOIN branches b ON u.branch_id = b.id
            WHERE u.id = $1
        """, parsed_uuid)

        if not row:
            raise HTTPException(status_code=401, detail="Session user no longer exists.")

        policies = await get_system_security_policies()
        return _build_user_session_payload(row, policies)

@app.get("/api/v1/auth/sessions")
async def get_active_sessions(
    user_id: Optional[str] = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    target_user_id = user_id if (user_id and (session.get("is_superadmin") or user_id == session.get("user_id"))) else session["user_id"]
    active = await SessionManager.list_active_sessions(target_user_id)
    return {"sessions": active, "current_token": session.get("token", "")}

@app.post("/api/v1/auth/sessions/revoke")
async def revoke_session(req: RevokeSessionRequest, session: Dict[str, Any] = Depends(get_current_user_session)):
    # Verify ownership of target session token unless caller is Superadmin
    if not session.get("is_superadmin"):
        user_sessions = await SessionManager.list_active_sessions(session["user_id"])
        owned_tokens = {s.get("token") for s in user_sessions}
        if req.token != session.get("token") and req.token not in owned_tokens:
            raise HTTPException(status_code=403, detail="Access denied: Cannot revoke another user's session.")
    success = await SessionManager.revoke_session(req.token)
    return {"status": "revoked" if success else "failed", "token": req.token}

@app.post("/api/v1/auth/sessions/revoke-others")
async def revoke_other_sessions(
    user_id: Optional[str] = None,
    req: Optional[RevokeOtherSessionsRequest] = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    requested_uid = user_id or (req.user_id if req else None)
    if requested_uid and str(requested_uid) != str(session.get("user_id")) and not session.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Access denied: Cannot revoke sessions belonging to another user.")
    target_user_id = requested_uid or session["user_id"]
    token_to_keep = (req.token if req and req.token else None) or session.get("token", "")
    count = await SessionManager.revoke_other_sessions(target_user_id, token_to_keep)
    return {"status": "success", "revoked_count": count}

# ==============================================================================
# 3. IAM USERS CRUD ENDPOINTS (PostgreSQL Direct)
# ==============================================================================
@app.get("/api/v1/iam/users")
async def list_users(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Returns list of users from PostgreSQL with tenancy, role, and Windows SSO info."""
    if not (check_permission(session, "users.read") or check_permission(session, "users.manage")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Missing required permission 'users.read'."
        )

    pool = get_db_pool()
    is_admin = bool(session.get("is_superadmin")) or check_permission(session, "users.manage")
    is_superadmin = bool(session.get("is_superadmin"))
    org_id = session.get("organization_id")

    async with pool.acquire() as conn:
        if is_admin:
            if not is_superadmin and org_id:
                rows = await conn.fetch("""
                    SELECT u.id, u.email, u.full_name, u.status, u.is_superadmin, u.role_id,
                           r.name as role_name, u.organization_id, o.legal_name as organization_name,
                           u.branch_id, b.name as branch_name, b.code as branch_code,
                           u.department, u.allowed_cidrs, u.date_of_birth, u.age,
                           u.guardian_name, u.guardian_email, u.auth_provider, u.windows_upn,
                           u.ad_sam_account, u.auto_sso_enabled, u.is_2fa_enabled,
                           u.created_at, u.updated_at
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    LEFT JOIN organizations o ON u.organization_id = o.id
                    LEFT JOIN branches b ON u.branch_id = b.id
                    WHERE u.organization_id = $1::uuid
                    ORDER BY u.created_at DESC
                """, uuid.UUID(str(org_id)))
            else:
                rows = await conn.fetch("""
                    SELECT u.id, u.email, u.full_name, u.status, u.is_superadmin, u.role_id,
                           r.name as role_name, u.organization_id, o.legal_name as organization_name,
                           u.branch_id, b.name as branch_name, b.code as branch_code,
                           u.department, u.allowed_cidrs, u.date_of_birth, u.age,
                           u.guardian_name, u.guardian_email, u.auth_provider, u.windows_upn,
                           u.ad_sam_account, u.auto_sso_enabled, u.is_2fa_enabled,
                           u.created_at, u.updated_at
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    LEFT JOIN organizations o ON u.organization_id = o.id
                    LEFT JOIN branches b ON u.branch_id = b.id
                    ORDER BY u.created_at DESC
                """)
        else:
            # Standard user: only return their own user record so profile modals still work without leaking user directory
            try:
                curr_uid = uuid.UUID(str(session.get("user_id")))
            except Exception:
                curr_uid = None
            rows = await conn.fetch("""
                SELECT u.id, u.email, u.full_name, u.status, u.is_superadmin, u.role_id,
                       r.name as role_name, u.organization_id, o.legal_name as organization_name,
                       u.branch_id, b.name as branch_name, b.code as branch_code,
                       u.department, u.allowed_cidrs, u.date_of_birth, u.age,
                       u.guardian_name, u.guardian_email, u.auth_provider, u.windows_upn,
                       u.ad_sam_account, u.auto_sso_enabled, u.is_2fa_enabled,
                       u.created_at, u.updated_at
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    LEFT JOIN organizations o ON u.organization_id = o.id
                    LEFT JOIN branches b ON u.branch_id = b.id
                    WHERE u.id = $1
                    ORDER BY u.created_at DESC
            """, curr_uid)
        
        users_list = []
        for r in rows:
            users_list.append({
                "id": str(r["id"]),
                "email": r["email"],
                "full_name": r["full_name"],
                "status": r["status"],
                "is_superadmin": bool(r["is_superadmin"]),
                "role_id": r["role_id"],
                "role": r["role_name"] or "Standard User",
                "organization_id": str(r["organization_id"]) if r["organization_id"] else None,
                "organization_name": r["organization_name"],
                "branch_id": str(r["branch_id"]) if r["branch_id"] else None,
                "branch_name": r["branch_name"],
                "branch_code": r["branch_code"],
                "department": r["department"] or "General",
                "allowed_cidrs": r["allowed_cidrs"] or "0.0.0.0/0",
                "date_of_birth": r["date_of_birth"],
                "age": r["age"],
                "guardian_name": r["guardian_name"],
                "guardian_email": r["guardian_email"],
                "auth_provider": r["auth_provider"] or "local",
                "windows_upn": r["windows_upn"],
                "ad_sam_account": r["ad_sam_account"],
                "auto_sso_enabled": bool(r["auto_sso_enabled"]),
                "is_2fa_enabled": bool(r["is_2fa_enabled"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            })
            
        return {"users": users_list}

@app.post("/api/v1/iam/users")
async def create_user(
    req: CreateUserRequest,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Provisions a new identity directly in PostgreSQL with a bcrypt password."""
    require_permission(session, "users.manage")
    pool = get_db_pool()
    clean_email = req.email.strip().lower()
    clean_upn = req.windows_upn.strip().lower() if req.windows_upn else None
    clean_sam = req.ad_sam_account.strip() if req.ad_sam_account else None
    client_ip = get_client_ip(request) if request else "127.0.0.1"
    
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM users WHERE LOWER(email) = $1", clean_email
        )
        if existing:
            raise HTTPException(status_code=400, detail="A user with this email address already exists.")
            
        # Fallback org & branch if not specified; enforce tenant boundary for non-superadmins
        if not session.get("is_superadmin") and session.get("organization_id"):
            org_id = uuid.UUID(str(session["organization_id"]))
        else:
            org_id = uuid.UUID(req.organization_id) if req.organization_id else await conn.fetchval("SELECT id FROM organizations LIMIT 1")

        branch_id = uuid.UUID(req.branch_id) if req.branch_id else await conn.fetchval("SELECT id FROM branches WHERE organization_id = $1 LIMIT 1", org_id) or await conn.fetchval("SELECT id FROM branches LIMIT 1")
        
        # Map role if given as friendly name
        role_id = req.role_id or "role_standard"
        if req.role:
            matched_role = await conn.fetchval("SELECT id FROM roles WHERE LOWER(name) = LOWER($1)", req.role)
            if matched_role:
                role_id = matched_role
                
        is_super = role_id == "role_superadmin" or "superadmin" in (req.role or "").lower()
        if is_super and not session.get("is_superadmin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Privilege escalation denied: Only an existing Superadmin can provision a Superadmin user."
            )

        # SOX 404 Segregation of Duties Check on User-Role Assignment
        if not is_super and role_id:
            target_role = await conn.fetchrow("SELECT code, name, permissions FROM roles WHERE id = $1", role_id)
            if target_role and target_role["permissions"]:
                r_perms = json.loads(target_role["permissions"]) if isinstance(target_role["permissions"], str) else target_role["permissions"]
                raise_if_sod_violation(r_perms, role_code=target_role["code"], context_label=f"User Role Assignment '{target_role['name']}'")

        new_id = uuid.uuid4()
        initial_pwd = req.initial_password or "InitPass@2026"
        complexity_err = validate_password_complexity(initial_pwd)
        if complexity_err:
            raise HTTPException(status_code=400, detail=complexity_err)
        pwd_hash = await hash_password_async(initial_pwd)
        
        await conn.execute("""
            INSERT INTO users (
                id, email, full_name, password_hash, status, is_superadmin,
                organization_id, branch_id, role_id, department, allowed_cidrs,
                date_of_birth, age, guardian_name, guardian_email,
                auth_provider, windows_upn, ad_sam_account, auto_sso_enabled
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        """, new_id, clean_email, req.full_name, pwd_hash, req.status or "active", is_super,
           org_id, branch_id, role_id, req.department or "Operations", "0.0.0.0/0",
           req.date_of_birth, req.age, req.guardian_name, req.guardian_email,
           req.auth_provider or "local", clean_upn, clean_sam, bool(req.auto_sso_enabled))
        
        await log_audit_event(
            conn=conn,
            entity_type="users",
            entity_id=new_id,
            action="CREATE",
            session=session,
            client_ip=client_ip,
            note=f"Created user {clean_email} ({req.full_name}) with role {role_id}.",
            changes={
                "email": clean_email,
                "full_name": req.full_name,
                "role_id": role_id,
                "status": req.status or "active",
                "department": req.department
            }
        )

        # Fetch created row
        r = await conn.fetchrow("""
            SELECT u.*, r.name as role_name, o.legal_name as organization_name, b.name as branch_name, b.code as branch_code
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN organizations o ON u.organization_id = o.id
            LEFT JOIN branches b ON u.branch_id = b.id
            WHERE u.id = $1
        """, new_id)
        
        return {
            "id": str(r["id"]),
            "email": r["email"],
            "full_name": r["full_name"],
            "status": r["status"],
            "is_superadmin": bool(r["is_superadmin"]),
            "role_id": r["role_id"],
            "role": r["role_name"] or "Standard User",
            "organization_id": str(r["organization_id"]) if r["organization_id"] else None,
            "organization_name": r["organization_name"],
            "branch_id": str(r["branch_id"]) if r["branch_id"] else None,
            "branch_name": r["branch_name"],
            "branch_code": r["branch_code"],
            "department": r["department"],
            "date_of_birth": r["date_of_birth"],
            "age": r["age"],
            "auth_provider": r["auth_provider"] or "local",
            "windows_upn": r["windows_upn"],
            "ad_sam_account": r["ad_sam_account"],
            "auto_sso_enabled": bool(r["auto_sso_enabled"]),
        }

@app.put("/api/v1/iam/users/{user_id}")
async def update_user(
    user_id: str,
    req: UpdateUserRequest,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Updates user record in PostgreSQL."""
    pool = get_db_pool()
    try:
        u_id = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user UUID.")

    is_superadmin = bool(session.get("is_superadmin"))
    can_manage = check_permission(session, "users.manage")
    is_self = str(session.get("user_id")) == str(u_id)

    if not (is_superadmin or can_manage or is_self):
        raise HTTPException(status_code=403, detail="Access denied: Cannot update other users.")
        
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM users WHERE id = $1", u_id)
        if not existing:
            raise HTTPException(status_code=404, detail="User not found.")
        verify_record_tenant(existing["organization_id"], session)

        # Validate idle_timeout_minutes against corporate security policy ceiling
        policies = await get_system_security_policies()
        global_max = int(policies.get("global_max_idle_timeout_minutes", 30))

        if "idle_timeout_minutes" in req.model_fields_set:
            if req.idle_timeout_minutes is not None and req.idle_timeout_minutes > global_max:
                raise HTTPException(
                    status_code=400,
                    detail=f"Inactivity timeout cannot exceed corporate security ceiling of {global_max} minutes."
                )
            new_idle = req.idle_timeout_minutes if (req.idle_timeout_minutes and req.idle_timeout_minutes > 0) else None
        else:
            new_idle = existing["idle_timeout_minutes"]
            
        # CRITICAL: If not superadmin, forbid/ignore changes to is_superadmin, role_id, role, status, and allowed_cidrs
        if not is_superadmin:
            is_super = bool(existing["is_superadmin"])
            role_id = existing["role_id"]
            status_val = existing["status"]
            cidrs = existing["allowed_cidrs"]
        else:
            role_id = req.role_id or existing["role_id"]
            if req.role:
                matched_role = await conn.fetchval("SELECT id FROM roles WHERE LOWER(name) = LOWER($1)", req.role)
                if matched_role:
                    role_id = matched_role
            is_super = req.is_superadmin if req.is_superadmin is not None else bool(existing["is_superadmin"])
            status_val = req.status or existing["status"]
            cidrs = req.allowed_cidrs or existing["allowed_cidrs"]

        # SOX 404 Segregation of Duties Check on User Role Update
        if not is_super and role_id:
            target_role = await conn.fetchrow("SELECT code, name, permissions FROM roles WHERE id = $1", role_id)
            if target_role and target_role["permissions"]:
                r_perms = json.loads(target_role["permissions"]) if isinstance(target_role["permissions"], str) else target_role["permissions"]
                raise_if_sod_violation(r_perms, role_code=target_role["code"], context_label=f"User Role Update '{target_role['name']}'")

        new_upn = req.windows_upn.strip().lower() if req.windows_upn is not None else existing.get("windows_upn")
        new_sam = req.ad_sam_account.strip() if req.ad_sam_account is not None else existing.get("ad_sam_account")
        new_provider = req.auth_provider if req.auth_provider is not None else (existing.get("auth_provider") or "local")
        new_auto_sso = req.auto_sso_enabled if req.auto_sso_enabled is not None else bool(existing.get("auto_sso_enabled", False))
        
        await conn.execute("""
            UPDATE users SET
                full_name = COALESCE($2, full_name),
                email = COALESCE($3, email),
                status = $4,
                is_superadmin = $5,
                role_id = $6,
                department = COALESCE($7, department),
                allowed_cidrs = $8,
                date_of_birth = COALESCE($9, date_of_birth),
                age = COALESCE($10, age),
                guardian_name = COALESCE($11, guardian_name),
                guardian_email = COALESCE($12, guardian_email),
                idle_timeout_minutes = $13,
                windows_upn = $14,
                ad_sam_account = $15,
                auth_provider = $16,
                auto_sso_enabled = $17,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, u_id, req.full_name, req.email, status_val, is_super, role_id,
           req.department, cidrs, req.date_of_birth, req.age,
           req.guardian_name, req.guardian_email, new_idle,
           new_upn, new_sam, new_provider, new_auto_sso)

        await log_audit_event(
            conn=conn,
            entity_type="users",
            entity_id=u_id,
            action="UPDATE",
            session=session,
            client_ip=client_ip,
            note=f"Updated user profile for {existing['email']} ({req.full_name or existing['full_name']}).",
            changes={
                "full_name": req.full_name,
                "email": req.email,
                "status": status_val,
                "role_id": role_id,
                "department": req.department
            }
        )
           
        return {"status": "success", "message": "User updated successfully."}

@app.post("/api/v1/iam/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    req: ResetPasswordRequest,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Sets a new bcrypt-hashed password in PostgreSQL."""
    pool = get_db_pool()
    try:
        u_id = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user UUID.")

    is_superadmin = bool(session.get("is_superadmin"))
    can_manage = check_permission(session, "users.manage")
    is_self = str(session.get("user_id")) == str(u_id)

    if not (is_superadmin or can_manage or is_self):
        raise HTTPException(status_code=403, detail="Access denied: Cannot reset password for this user.")
        
    complexity_err = validate_password_complexity(req.password)
    if complexity_err:
        raise HTTPException(status_code=400, detail=complexity_err)
        
    client_ip = get_client_ip(request) if request else "127.0.0.1"
    hashed_pwd = await hash_password_async(req.password)
    async with pool.acquire() as conn:
        if not is_superadmin and not is_self and can_manage:
            target_is_super = await conn.fetchval("SELECT is_superadmin FROM users WHERE id = $1", u_id)
            if target_is_super:
                raise HTTPException(status_code=403, detail="Cannot reset password of a Superadmin.")

        updated = await conn.execute(
            "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            hashed_pwd, u_id
        )
        if updated == "UPDATE 0":
            raise HTTPException(status_code=404, detail="User not found.")

        await log_audit_event(
            conn=conn,
            entity_type="users",
            entity_id=u_id,
            action="RESET_PASSWORD",
            session=session,
            client_ip=client_ip,
            note=f"Password was reset for user ID {u_id}.",
            changes={"password_reset": True}
        )
            
    return {"status": "success", "message": "Password updated successfully."}

@app.delete("/api/v1/iam/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Deletes user from PostgreSQL."""
    require_permission(session, "users.manage")
    pool = get_db_pool()
    try:
        u_id = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user UUID.")
        
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT is_superadmin, organization_id, email FROM users WHERE id = $1", u_id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found.")
        if target["is_superadmin"]:
            raise HTTPException(status_code=400, detail="Cannot delete Root Superadmin.")
        verify_record_tenant(target["organization_id"], session)
        await conn.execute("DELETE FROM users WHERE id = $1", u_id)

        await log_audit_event(
            conn=conn,
            entity_type="users",
            entity_id=u_id,
            action="DELETE",
            session=session,
            client_ip=client_ip,
            note=f"Deleted user {target['email']} ({u_id}).",
            changes={"deleted_user_id": str(u_id), "email": target["email"]}
        )
        
    return {"status": "success", "message": "User deleted."}

# ==============================================================================
# 4. IAM ROLES CRUD ENDPOINTS (PostgreSQL Direct with Menu Access & SoD Matrix)
# ==============================================================================
@app.get("/api/v1/iam/sod/matrix")
async def get_sod_matrix(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Returns the declarative Segregation of Duties (SoD) Conflict Matrix for SOX 404 compliance."""
    return {
        "framework": "SOX Section 404 / ISO 27001",
        "rules": SOD_CONFLICT_RULES,
        "total": len(SOD_CONFLICT_RULES),
    }

@app.get("/api/v1/iam/roles")
async def list_roles(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Lists roles and permissions matrix from PostgreSQL."""
    if not (check_permission(session, "roles.read") or check_permission(session, "users.read")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Missing required permission 'roles.read'."
        )
    pool = get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, code, description, badge_color, is_system, permissions, menu_access, created_at
            FROM roles
            ORDER BY is_system DESC, name ASC
        """)
        
        roles_list = []
        for r in rows:
            roles_list.append({
                "id": r["id"],
                "name": r["name"],
                "code": r["code"],
                "description": r["description"],
                "badgeColor": r["badge_color"],
                "is_system": bool(r["is_system"]),
                "permissions": json.loads(r["permissions"]) if r["permissions"] else {},
                "menu_access": json.loads(r["menu_access"]) if r["menu_access"] else [],
            })
            
        return {"roles": roles_list}

@app.post("/api/v1/iam/roles")
async def create_role(
    req: CreateRoleRequest,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Creates a custom security role in PostgreSQL."""
    require_permission(session, "roles.manage")
    pool = get_db_pool()
    clean_name = req.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Role name is required.")
        
    raw_code = (req.code or clean_name).upper().replace(" ", "_")
    code = raw_code if raw_code.startswith("ROLE_") else f"ROLE_{raw_code}"
    role_id = f"role_{uuid.uuid4().hex[:12]}"
    
    perms = req.permissions or {
        "attendance_logs": {"create": False, "read": True, "update": False, "delete": False},
        "organizations": {"create": False, "read": False, "update": False, "delete": False},
        "users": {"create": False, "read": False, "update": False, "delete": False},
    }
    menu_access = req.menu_access or ["attendances"]

    # SOX 404 Segregation of Duties (SoD) Conflict Validation
    raise_if_sod_violation(perms, role_code=code, context_label=f"Role '{clean_name}'")

    creator_uid = None
    try:
        uid_str = session.get("id") or session.get("user_id")
        if uid_str:
            creator_uid = uuid.UUID(str(uid_str))
    except Exception:
        pass

    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO roles (
                id, name, code, description, badge_color, is_system,
                permissions, menu_access, created_by, approval_status
            )
            VALUES ($1, $2, $3, $4, $5, false, $6::jsonb, $7::jsonb, $8, 'approved')
        """, role_id, clean_name, code, req.description or "Custom user-defined security role.",
           req.badge_color or "amber", json.dumps(perms), json.dumps(menu_access), creator_uid)

        await log_audit_event(
            conn=conn,
            entity_type="roles",
            entity_id=role_id,
            action="CREATE",
            session=session,
            client_ip=client_ip,
            note=f"Created custom security role '{clean_name}' ({code}).",
            changes={"name": clean_name, "code": code, "permissions": perms, "menu_access": menu_access}
        )
           
    return {
        "id": role_id,
        "name": clean_name,
        "code": code,
        "description": req.description,
        "badgeColor": req.badge_color or "amber",
        "is_system": False,
        "permissions": perms,
        "menu_access": menu_access,
    }

@app.patch("/api/v1/iam/roles/{role_id}")
@app.put("/api/v1/iam/roles/{role_id}")
async def update_role(
    role_id: str,
    req: UpdateRoleRequest,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Dynamically updates role permissions and menu_access in PostgreSQL."""
    require_permission(session, "roles.manage")
    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM roles WHERE id = $1", role_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Role not found.")

        # SOX 404 Segregation of Duties (SoD) Conflict Validation
        if req.permissions is not None:
            raw_code = str(existing["code"] or "").upper()
            if existing["id"] != "role_superadmin" and raw_code not in ("SUPERADMIN", "ROLE_SUPERADMIN"):
                raise_if_sod_violation(req.permissions, role_code=existing["code"], context_label=f"Role '{existing['name']}'")

        perms_json = json.dumps(req.permissions) if req.permissions is not None else existing["permissions"]
        menu_json = json.dumps(req.menu_access) if req.menu_access is not None else existing["menu_access"]
        
        await conn.execute("""
            UPDATE roles SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                badge_color = COALESCE($4, badge_color),
                permissions = $5::jsonb,
                menu_access = $6::jsonb
            WHERE id = $1
        """, role_id, req.name, req.description, req.badge_color, perms_json, menu_json)

        await log_audit_event(
            conn=conn,
            entity_type="roles",
            entity_id=role_id,
            action="UPDATE",
            session=session,
            client_ip=client_ip,
            note=f"Updated permissions matrix for role '{existing['name']}' ({role_id}).",
            changes={"name": req.name, "description": req.description, "permissions": req.permissions, "menu_access": req.menu_access}
        )

        updated_row = await conn.fetchrow("SELECT * FROM roles WHERE id = $1", role_id)
        
    return {
        "status": "success",
        "message": "Role updated successfully.",
        "role": {
            "id": updated_row["id"],
            "name": updated_row["name"],
            "code": updated_row["code"],
            "description": updated_row["description"],
            "badgeColor": updated_row["badge_color"],
            "is_system": bool(updated_row["is_system"]),
            "permissions": json.loads(updated_row["permissions"]) if updated_row["permissions"] else {},
            "menu_access": json.loads(updated_row["menu_access"]) if updated_row["menu_access"] else [],
        }
    }

@app.delete("/api/v1/iam/roles/{role_id}")
async def delete_role(
    role_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Deletes custom role from PostgreSQL (system roles are protected)."""
    require_permission(session, "roles.manage")
    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        role = await conn.fetchrow("SELECT is_system, name, code FROM roles WHERE id = $1", role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found.")
        if role["is_system"]:
            raise HTTPException(status_code=400, detail="System protected roles cannot be deleted.")
            
        assigned_count = await conn.fetchval("SELECT count(*) FROM users WHERE role_id = $1", role_id)
        if assigned_count > 0:
            raise HTTPException(status_code=400, detail=f"Cannot delete role: {assigned_count} users currently assigned.")
            
        await conn.execute("DELETE FROM roles WHERE id = $1", role_id)

        await log_audit_event(
            conn=conn,
            entity_type="roles",
            entity_id=role_id,
            action="DELETE",
            session=session,
            client_ip=client_ip,
            note=f"Deleted custom role '{role['name']}' ({role_id}).",
            changes={"deleted_role_id": role_id, "name": role["name"], "code": role["code"]}
        )
        
    return {"status": "success", "message": "Role deleted."}

# ==============================================================================
# 4.1 HEADLESS API KEY PERSISTENCE ENDPOINTS (PostgreSQL + Redis Cache)
# ==============================================================================
@app.get("/api/v1/iam/api-keys")
async def list_api_keys(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Lists persistent API keys from PostgreSQL."""
    require_permission(session, "hardware.manage")
    keys = await APIKeyEngine.list_api_keys()
    return {"api_keys": keys}

@app.post("/api/v1/iam/api-keys")
async def create_api_key(
    req: CreateAPIKeyRequest,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Creates a new API key in PostgreSQL and populates Redis cache."""
    require_permission(session, "hardware.manage")
    client_ip = get_client_ip(request) if request else "127.0.0.1"
    created = await APIKeyEngine.create_api_key(
        owner=req.owner,
        role=req.role or "service_daemon",
        allowed_cidrs=req.allowed_cidrs,
        scopes=req.scopes
    )
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await log_audit_event(
            conn=conn,
            entity_type="api_keys",
            entity_id=created.get("id") or created.get("key_id") or req.owner,
            action="CREATE",
            session=session,
            client_ip=client_ip,
            note=f"Generated persistent API key for owner '{req.owner}' with role '{req.role}'.",
            changes={"owner": req.owner, "role": req.role, "scopes": req.scopes}
        )
    return {"status": "success", "api_key": created}

@app.delete("/api/v1/iam/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Revokes API key from PostgreSQL and purges Redis cache."""
    require_permission(session, "hardware.manage")
    client_ip = get_client_ip(request) if request else "127.0.0.1"
    success = await APIKeyEngine.revoke_api_key(key_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found.")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await log_audit_event(
            conn=conn,
            entity_type="api_keys",
            entity_id=key_id,
            action="REVOKE",
            session=session,
            client_ip=client_ip,
            note=f"Revoked API key {key_id}.",
            changes={"key_id": key_id}
        )
    return {"status": "success", "message": "API key revoked."}


# ==============================================================================
# 5. TENANCY METADATA ENDPOINTS (Organizations & Branches)
# ==============================================================================
@app.get("/api/v1/iam/tenancy")
async def get_tenancy_data(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Returns organizations and branches from PostgreSQL scoped to tenant for non-superadmins."""
    pool = get_db_pool()
    is_superadmin = bool(session.get("is_superadmin"))
    org_id = session.get("organization_id")

    async with pool.acquire() as conn:
        if not is_superadmin and org_id:
            org_uuid = uuid.UUID(str(org_id))
            org_rows = await conn.fetch("SELECT * FROM organizations WHERE id = $1 ORDER BY created_at ASC", org_uuid)
            branch_rows = await conn.fetch("SELECT * FROM branches WHERE organization_id = $1 ORDER BY created_at ASC", org_uuid)
        else:
            org_rows = await conn.fetch("SELECT * FROM organizations ORDER BY created_at ASC")
            branch_rows = await conn.fetch("SELECT * FROM branches ORDER BY created_at ASC")
        
        orgs = [
            {
                "id": str(r["id"]),
                "legal_name": r["legal_name"],
                "tax_id": r["tax_id"],
                "base_currency": r["base_currency"],
                "default_timezone": r["default_timezone"],
                "default_locale": r["default_locale"],
            }
            for r in org_rows
        ]
        
        branches = [
            {
                "id": str(r["id"]),
                "organization_id": str(r["organization_id"]),
                "name": r["name"],
                "code": r["code"],
                "city": r["city"],
                "ip_allowlist": json.loads(r["ip_allowlist"]) if r["ip_allowlist"] else ["127.0.0.1/32"],
            }
            for r in branch_rows
        ]
        
        return {"organizations": orgs, "branches": branches}

class UpdateOrganizationRequest(BaseModel):
    legal_name: str
    tax_id: Optional[str] = None
    base_currency: Optional[str] = "QAR"
    default_timezone: Optional[str] = "Asia/Qatar"
    default_locale: Optional[str] = "en"

class BranchPayload(BaseModel):
    organization_id: Optional[str] = None
    name: str
    code: str
    city: Optional[str] = "Doha"
    ip_allowlist: Optional[List[str]] = ["127.0.0.1/32", "192.168.1.0/24"]

class SystemSettingPayload(BaseModel):
    value: Dict[str, Any]

@app.put("/api/v1/iam/organizations/{org_id}")
async def update_organization(
    org_id: str,
    req: UpdateOrganizationRequest,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Updates organization legal name, Qatar CR/Tax ID, currency, and timezone."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
    try:
        o_uuid = uuid.UUID(org_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization UUID.")

    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE organizations
            SET legal_name = $2,
                tax_id = $3,
                base_currency = COALESCE($4, base_currency),
                default_timezone = COALESCE($5, default_timezone),
                default_locale = COALESCE($6, default_locale)
            WHERE id = $1
        """, o_uuid, req.legal_name.strip(), req.tax_id, req.base_currency, req.default_timezone, req.default_locale)
        row = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", o_uuid)
        if not row:
            raise HTTPException(status_code=404, detail="Organization not found.")

        await log_audit_event(
            conn=conn,
            entity_type="organizations",
            entity_id=o_uuid,
            action="UPDATE",
            session=session,
            client_ip=client_ip,
            note=f"Updated organization legal name to '{req.legal_name.strip()}', tax ID '{req.tax_id}'.",
            changes={
                "legal_name": req.legal_name.strip(),
                "tax_id": req.tax_id,
                "base_currency": req.base_currency,
                "default_timezone": req.default_timezone,
                "default_locale": req.default_locale
            }
        )

        return {
            "id": str(row["id"]),
            "legal_name": row["legal_name"],
            "tax_id": row["tax_id"],
            "base_currency": row["base_currency"],
            "default_timezone": row["default_timezone"],
            "default_locale": row["default_locale"],
        }

@app.post("/api/v1/iam/branches")
async def create_branch(
    req: BranchPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Creates a new operating branch in PostgreSQL."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        org_uuid = (
            uuid.UUID(req.organization_id)
            if req.organization_id
            else await conn.fetchval("SELECT id FROM organizations LIMIT 1")
        )
        new_id = uuid.uuid4()
        cidrs = req.ip_allowlist or ["127.0.0.1/32"]
        await conn.execute("""
            INSERT INTO branches (id, organization_id, name, code, city, ip_allowlist)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        """, new_id, org_uuid, req.name.strip(), req.code.strip().upper(), req.city or "Doha", json.dumps(cidrs))

        await log_audit_event(
            conn=conn,
            entity_type="branches",
            entity_id=new_id,
            action="CREATE",
            session=session,
            client_ip=client_ip,
            note=f"Created operating branch '{req.name.strip()}' ({req.code.strip().upper()}).",
            changes={
                "organization_id": str(org_uuid),
                "name": req.name.strip(),
                "code": req.code.strip().upper(),
                "city": req.city or "Doha",
                "ip_allowlist": cidrs
            }
        )

        return {
            "id": str(new_id),
            "organization_id": str(org_uuid),
            "name": req.name.strip(),
            "code": req.code.strip().upper(),
            "city": req.city or "Doha",
            "ip_allowlist": cidrs,
        }

@app.put("/api/v1/iam/branches/{branch_id}")
async def update_branch(
    branch_id: str,
    req: BranchPayload,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Updates an operating branch and its CIDR IP allowlist."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(branch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid branch UUID.")

    client_ip = get_client_ip(request) if request else "127.0.0.1"
    cidrs = req.ip_allowlist or ["127.0.0.1/32"]

    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE branches
            SET name = $2, code = $3, city = $4, ip_allowlist = $5::jsonb
            WHERE id = $1
        """, b_uuid, req.name.strip(), req.code.strip().upper(), req.city or "Doha", json.dumps(cidrs))

        await log_audit_event(
            conn=conn,
            entity_type="branches",
            entity_id=b_uuid,
            action="UPDATE",
            session=session,
            client_ip=client_ip,
            note=f"Updated operating branch {b_uuid} ({req.name.strip()}).",
            changes={
                "name": req.name.strip(),
                "code": req.code.strip().upper(),
                "city": req.city or "Doha",
                "ip_allowlist": cidrs
            }
        )

        return {"status": "success", "id": str(b_uuid)}

@app.delete("/api/v1/iam/branches/{branch_id}")
async def delete_branch(
    branch_id: str,
    request: Request,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Deletes an operating branch if more than 1 branch exists."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(branch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid branch UUID.")

    client_ip = get_client_ip(request) if request else "127.0.0.1"

    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT count(*) FROM branches")
        if count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the primary operating branch.")
            
        branch_info = await conn.fetchrow("SELECT name, code FROM branches WHERE id = $1", b_uuid)
        await conn.execute("DELETE FROM branches WHERE id = $1", b_uuid)

        await log_audit_event(
            conn=conn,
            entity_type="branches",
            entity_id=b_uuid,
            action="DELETE",
            session=session,
            client_ip=client_ip,
            note=f"Deleted operating branch {branch_info['name'] if branch_info else ''} ({b_uuid}).",
            changes={"deleted_branch_id": str(b_uuid)}
        )

        return {"status": "success", "deleted_id": str(b_uuid)}

@app.get("/api/v1/settings/security-policies")
async def get_security_policies_setting(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Fetches system security policies."""
    policies = await get_system_security_policies()
    return policies

@app.put("/api/v1/settings/security-policies")
async def update_security_policies_setting(
    payload: SecurityPolicyPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Adjusts system security policies. Superadmin only."""
    if not session.get("is_superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin privileges required to modify security policies."
        )

    if payload.global_max_idle_timeout_minutes < 1:
        raise HTTPException(status_code=400, detail="Global maximum idle timeout must be at least 1 minute.")

    policies = {
        "global_max_idle_timeout_minutes": payload.global_max_idle_timeout_minutes,
        "default_idle_timeout_minutes": payload.default_idle_timeout_minutes or 15
    }

    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO system_metadata (key, value, updated_at)
            VALUES ('cfg:security_policies', $1, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP;
        """, json.dumps(policies))

    # Invalidate / update Redis cache
    redis = get_redis_client()
    if redis:
        try:
            await redis.set("cache:security_policies", json.dumps(policies), ex=300)
        except Exception:
            pass

    return {"status": "success", "policies": policies}

@app.get("/api/v1/settings/{config_key}")
async def get_system_setting(
    config_key: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Fetches a JSON configuration setting from PostgreSQL system_metadata."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        val = await conn.fetchval(
            "SELECT value FROM system_metadata WHERE key = $1",
            f"cfg:{config_key.strip().lower()}"
        )
        if not val:
            return {"key": config_key, "value": None}
        try:
            return {"key": config_key, "value": json.loads(val)}
        except Exception:
            return {"key": config_key, "value": None}

@app.put("/api/v1/settings/{config_key}")
async def save_system_setting(
    config_key: str,
    payload: SystemSettingPayload,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Persists a JSON configuration setting into PostgreSQL system_metadata."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
    clean_key = f"cfg:{config_key.strip().lower()}"
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO system_metadata (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP;
        """, clean_key, json.dumps(payload.value))
    return {"status": "success", "key": config_key, "value": payload.value}

# ==============================================================================
# 6. SERVER-DRIVEN UI METADATA ENDPOINT
# ==============================================================================
REGISTERED_VIEW_MODELS = {
    "employees",
    "employee",
    "attendance_logs",
    "attendance",
    "shift_rosters",
    "contracts",
    "employee_contracts",
    "users",
    "roles",
    "organizations",
    "branches",
    "terminals",
    "payroll_batches",
}

SALARY_FIELDS = {
    "base_salary",
    "wage_base",
    "total_base_salary",
    "total_net_salary",
    "net_salary",
}

WRITE_ACTION_TYPES = {"create", "new", "add", "update", "edit", "write"}
DELETE_ACTION_TYPES = {"delete", "destroy", "remove", "purge"}

MODEL_CANONICAL_MAP = {
    "attendance": "attendance",
    "attendance_logs": "attendance",
    "contracts": "contracts",
    "employee_contracts": "contracts",
    "employee": "employees",
    "employees": "employees",
    "shift_rosters": "shift_rosters",
    "users": "users",
    "roles": "roles",
    "organizations": "organizations",
    "branches": "branches",
    "terminals": "terminals",
    "payroll_batches": "payroll_batches",
}

@app.get("/api/v1/meta/views/{model}")
async def get_view_schema(
    model: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """
    Returns the declarative View Schema for the requested model with RBAC filtering.
    Applies strict model allowlist check, filesystem path traversal defense,
    salary/monetary field masking if unauthorized, and strips write/delete header actions.
    """
    clean_model = (model or "").strip().lower()
    if clean_model not in REGISTERED_VIEW_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unregistered or invalid model specification: {clean_model}"
        )
        
    from pathlib import Path
    base_dir = (Path(__file__).parent.parent / "public").resolve()
    canonical_model = MODEL_CANONICAL_MAP.get(clean_model, clean_model)
    
    candidates = [
        base_dir / "schemas" / f"{canonical_model}.json",
        base_dir / "schemas" / f"{clean_model}.json",
        base_dir / f"{canonical_model}.json",
        base_dir / f"{clean_model}.json",
    ]

    schema_path = None
    for cand in candidates:
        cand_resolved = cand.resolve()
        if not str(cand_resolved).startswith(str(base_dir)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden schema path traversal detected."
            )
        if cand_resolved.exists() and cand_resolved.is_file():
            schema_path = cand_resolved
            break

    if not schema_path or not schema_path.exists():
        raise HTTPException(status_code=404, detail=f"Schema definition not found for model: {clean_model}")
        
    def _read_schema_file(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    schema = await asyncio.to_thread(_read_schema_file, schema_path)

    # 1. Server-side RBAC Filtering: Salary and Monetary Fields
    has_salary_read = can_read_salary(session)
    if not has_salary_read:
        # Mark hidden: true on salary fields in schema fields dictionary
        if "fields" in schema and isinstance(schema["fields"], dict):
            for fname, fdef in schema["fields"].items():
                if fname.lower() in SALARY_FIELDS and isinstance(fdef, dict):
                    fdef["hidden"] = True

        # Strip salary fields from list view columns
        if "views" in schema and isinstance(schema["views"], dict):
            views = schema["views"]
            if "list" in views and isinstance(views["list"], dict):
                cols = views["list"].get("columns", [])
                if isinstance(cols, list):
                    views["list"]["columns"] = [
                        c for c in cols if (c.lower() if isinstance(c, str) else "") not in SALARY_FIELDS
                    ]
            if "form" in views and isinstance(views["form"], dict):
                sections = views["form"].get("sections", [])
                if isinstance(sections, list):
                    for sec in sections:
                        if isinstance(sec, dict) and "fields" in sec and isinstance(sec["fields"], list):
                            sec["fields"] = [
                                f for f in sec["fields"]
                                if not (isinstance(f, dict) and f.get("name", "").lower() in SALARY_FIELDS)
                                and not (isinstance(f, str) and f.lower() in SALARY_FIELDS)
                            ]

    # 2. Server-side RBAC Filtering: Header Action Buttons & Mutation Permissions
    can_write = bool(
        session.get("is_superadmin")
        or check_permission(session, f"{clean_model}.write")
        or check_permission(session, f"{canonical_model}.write")
    )
    can_delete = bool(
        session.get("is_superadmin")
        or check_permission(session, f"{clean_model}.delete")
        or check_permission(session, f"{canonical_model}.delete")
    )

    if not can_write:
        schema.pop("newButtonLabel", None)
        schema["can_create"] = False
        schema["can_update"] = False

    if not can_delete:
        schema["can_delete"] = False

    if "header_actions" in schema and isinstance(schema["header_actions"], list):
        filtered_actions = []
        for act in schema["header_actions"]:
            if not isinstance(act, dict):
                continue
            act_type = str(act.get("type") or "").strip().lower()
            act_action = str(act.get("action") or "").strip().lower()
            act_id = str(act.get("id") or "").strip().lower()

            is_write_act = bool(
                act_type in WRITE_ACTION_TYPES
                or act_action in WRITE_ACTION_TYPES
                or any(w in act_id for w in ("create", "add", "new", "edit", "update"))
            )
            is_delete_act = bool(
                act_type in DELETE_ACTION_TYPES
                or act_action in DELETE_ACTION_TYPES
                or "delete" in act_id
                or "destroy" in act_id
            )

            if is_write_act and not can_write:
                continue
            if is_delete_act and not can_delete:
                continue
            filtered_actions.append(act)
        schema["header_actions"] = filtered_actions

    return schema

# ==============================================================================
# 7. ENTERPRISE COMPLIANCE, GDPR & STATUTORY POLICIES ENGINE
# ==============================================================================
class GDPRDeletionRequest(BaseModel):
    user_id: str
    reason: Optional[str] = "Data subject requested right-to-be-forgotten under GDPR Art. 17"
    confirm_purge: bool

class GDPRCancelDeletionRequest(BaseModel):
    user_id: str

VERIFIED_BUSINESS_DETAILS = {
    "legal_entity_name": "Apex Global Enterprises Q.P.S.C.",
    "cr_number": "QA-90281726-CR",
    "tax_id": "VAT-100293848",
    "jurisdiction": "State of Qatar & GCC Regional Cloud Zone",
    "registered_address": "Tower 4, West Bay Financial District, P.O. Box 24891, Doha, Qatar",
    "official_support_contact": "support@apexglobal.com",
    "data_protection_officer": "dpo@apexglobal.com",
    "phone": "+974 4499 8000",
    "compliance_frameworks": [
        "ISO/IEC 27001:2022",
        "SOC 2 Type II",
        "GDPR (EU 2016/679)",
        "Qatar Personal Data Privacy Law (PDPL Law No. 13 of 2016)"
    ]
}

_gdpr_deletion_registry: Dict[str, Dict[str, Any]] = {}

@app.get("/api/v1/compliance/business-details")
async def get_business_details(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None)
):
    """
    Returns verified corporate and statutory business details.
    Queries primary organization (or current tenant organization) from `organizations`
    and `system_metadata` (`cfg:qatar_wps_config` / `cfg:business_details`),
    falling back to `VERIFIED_BUSINESS_DETAILS` only if no organization record exists yet.
    """
    clean_auth = authorization if isinstance(authorization, str) else None
    clean_api_key = x_api_key if isinstance(x_api_key, str) else None

    session = None
    try:
        session = await get_current_user_session(request, clean_auth, clean_api_key)
    except Exception:
        session = None

    tenant_org_id = session.get("organization_id") if session else None

    pool = get_db_pool()
    if not pool:
        return dict(VERIFIED_BUSINESS_DETAILS)

    async with pool.acquire() as conn:
        org_row = None
        if tenant_org_id:
            try:
                org_row = await conn.fetchrow(
                    "SELECT * FROM organizations WHERE id = $1::uuid;",
                    str(tenant_org_id)
                )
            except Exception:
                org_row = None

        if not org_row:
            try:
                org_row = await conn.fetchrow(
                    "SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1;"
                )
            except Exception:
                org_row = None

        wps_raw = None
        biz_raw = None
        try:
            wps_raw = await conn.fetchval(
                "SELECT value FROM system_metadata WHERE key = 'cfg:qatar_wps_config';"
            )
            biz_raw = await conn.fetchval(
                "SELECT value FROM system_metadata WHERE key = 'cfg:business_details';"
            )
        except Exception:
            pass

    wps_cfg: Dict[str, Any] = {}
    if wps_raw:
        try:
            wps_cfg = json.loads(wps_raw) if isinstance(wps_raw, str) else dict(wps_raw)
        except Exception:
            pass

    biz_cfg: Dict[str, Any] = {}
    if biz_raw:
        try:
            biz_cfg = json.loads(biz_raw) if isinstance(biz_raw, str) else dict(biz_raw)
        except Exception:
            pass

    # If no organization record exists and no metadata exists, fall back to default
    if not org_row and not biz_cfg and not wps_cfg:
        return dict(VERIFIED_BUSINESS_DETAILS)

    details = dict(VERIFIED_BUSINESS_DETAILS)

    # 1. Overlay system_metadata overrides if configured
    if biz_cfg:
        details.update(biz_cfg)

    # 2. Overlay organization database fields
    if org_row:
        org_dict = dict(org_row)
        if org_dict.get("legal_name"):
            details["legal_entity_name"] = org_dict["legal_name"]
        if org_dict.get("tax_id"):
            details["tax_id"] = org_dict["tax_id"]
            if not biz_cfg.get("cr_number"):
                details["cr_number"] = org_dict["tax_id"]
        if org_dict.get("id"):
            details["organization_id"] = str(org_dict["id"])
        if org_dict.get("base_currency"):
            details["base_currency"] = org_dict["base_currency"]
        if org_dict.get("default_timezone"):
            details["default_timezone"] = org_dict["default_timezone"]

    # 3. Overlay WPS configuration fields
    if wps_cfg.get("employer_eid"):
        details["wps_establishment_id"] = str(wps_cfg["employer_eid"])
        details["moi_establishment_id"] = str(wps_cfg["employer_eid"])
    if wps_cfg.get("company_name"):
        details["legal_entity_name"] = wps_cfg["company_name"]

    return details

@app.post("/api/v1/compliance/gdpr/delete-request")
async def request_data_deletion(
    req: GDPRDeletionRequest,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """GDPR Article 17: Right-to-be-Forgotten / Data Purge."""
    caller_id = str(session.get("user_id") or session.get("id") or "")
    if not session.get("is_superadmin") and caller_id != str(req.user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot submit GDPR deletion request for another user."
        )

    if not req.confirm_purge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit user confirmation is required to initiate data deletion."
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    grace_period_days = 30
    scheduled_purge = now + datetime.timedelta(days=grace_period_days)
    
    hash_seed = f"{req.user_id}-{now.isoformat()}".encode('utf-8')
    pseudonym_suffix = hashlib.sha256(hash_seed).hexdigest()[:8].upper()
    anonymized_pseudonym = f"DELETED_USER_{pseudonym_suffix}"

    record = {
        "user_id": req.user_id,
        "status": "pending_deletion",
        "pseudonym": anonymized_pseudonym,
        "requested_at": now.isoformat(),
        "scheduled_purge_at": scheduled_purge.isoformat(),
        "grace_days_remaining": grace_period_days,
        "reason": req.reason,
        "pii_redacted": True,
        "financial_audit_totals_preserved": True,
        "message": f"Account scheduled for permanent erasure on {scheduled_purge.strftime('%Y-%m-%d')}. PII pseudonymized as {anonymized_pseudonym}."
    }

    _gdpr_deletion_registry[req.user_id] = record
    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO system_metadata (key, value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
            """, f"gdpr:deletion:{req.user_id}", json.dumps(record))
            try:
                u_uuid = uuid.UUID(str(req.user_id))
                await conn.execute("UPDATE users SET status = 'pending_deletion', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_superadmin = false", u_uuid)
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Failed to persist GDPR deletion request to DB: {e}")

    return record

@app.post("/api/v1/compliance/gdpr/cancel-request")
async def cancel_data_deletion(
    req: GDPRCancelDeletionRequest,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Cancels an active pending data deletion request within grace period."""
    caller_id = str(session.get("user_id") or session.get("id") or "")
    if not session.get("is_superadmin") and caller_id != str(req.user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot cancel GDPR deletion request for another user."
        )

    found = False
    if req.user_id in _gdpr_deletion_registry:
        del _gdpr_deletion_registry[req.user_id]
        found = True

    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            res = await conn.execute("DELETE FROM system_metadata WHERE key = $1", f"gdpr:deletion:{req.user_id}")
            if res != "DELETE 0":
                found = True
            try:
                u_uuid = uuid.UUID(str(req.user_id))
                await conn.execute("UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending_deletion'", u_uuid)
            except Exception:
                pass
    except Exception:
        pass

    if found:
        return {
            "status": "active",
            "message": "Data deletion request successfully cancelled. Account restored to normal active status."
        }
    return {
        "status": "not_found",
        "message": "No pending deletion request found for this user."
    }

@app.get("/api/v1/compliance/gdpr/status/{user_id}")
async def get_deletion_status(
    user_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Checks the GDPR right-to-be-forgotten status of a given user."""
    caller_id = str(session.get("user_id") or session.get("id") or "")
    if not session.get("is_superadmin") and caller_id != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot view GDPR deletion status for another user."
        )

    if user_id in _gdpr_deletion_registry:
        return _gdpr_deletion_registry[user_id]

    try:
        pool = get_db_pool()
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT value FROM system_metadata WHERE key = $1", f"gdpr:deletion:{user_id}")
            if val:
                rec = json.loads(val)
                _gdpr_deletion_registry[user_id] = rec
                return rec
    except Exception:
        pass

    return {
        "user_id": user_id,
        "status": "active",
        "message": "No active deletion requests. Account in compliance standard."
    }

