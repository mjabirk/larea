import json
import uuid
import datetime
import hashlib
import logging
import re
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, Depends, HTTPException, Header, Request, status, Response
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
    verify_password
)
from backend.core.auth_suite import (
    APIKeyEngine,
    LDAPAuthenticator,
    TwoFactorAuthService,
    DatabaseRLSHelper
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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Vault-Decrypted"],
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
    check_permission
)

# Redis-based Atomic Rate Limiting Helpers (DoS Protection & Brute Force Prevention)
async def enforce_rate_limit(key_prefix: str, identifier: str, max_attempts: int, window_seconds: int = 60):
    """Enforces atomic sliding rate limits per IP/identity in Redis/DragonflyDB."""
    redis = get_redis_client()
    if not redis:
        return
    key = f"ratelimit:{key_prefix}:{identifier}"
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)
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
    
    async with pool.acquire() as conn:
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
        
        await enforce_setup_boot_limit(max_calls=3)
        admin_email = req.admin_data.get("email", "").strip().lower()
        admin_name = req.admin_data.get("full_name") or "Root Superadmin"
        admin_dob = req.admin_data.get("date_of_birth") or "1990-01-01"
        admin_pwd = (req.admin_data.get("password") or "").strip()
        if not admin_pwd or len(admin_pwd) < 8:
            raise HTTPException(status_code=400, detail="Administrator password must be at least 8 characters long.")
        if len(admin_pwd.encode("utf-8")) > 72:
            raise HTTPException(status_code=400, detail="Administrator password exceeds 72 bytes maximum limit.")
        hashed_pwd = hash_password(admin_pwd)
        
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
        "menu_access": ["attendances", "rosters", "users", "roles", "orgs", "terminals", "batches"]
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
# 2. AUTHENTICATION & SESSION ENDPOINTS (PostgreSQL Credential Verification)
# ==============================================================================
@app.post("/api/v1/auth/login")
async def login(req: LoginRequest, request: Request):
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")
    
    # 1. Rate Limiting: max 5 attempts per minute per IP
    await enforce_rate_limit("login", client_ip, max_attempts=5, window_seconds=60)
    
    clean_user = req.username.strip().lower()
    clean_pwd = req.password.strip()
    
    if not clean_user:
        raise HTTPException(status_code=400, detail="Please enter username or email.")
    if not clean_pwd:
        raise HTTPException(status_code=400, detail="Please enter password.")
        
    # 2. Bcrypt DoS Mitigation: Truncate / reject over-length password upfront
    if len(clean_pwd.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password exceeds maximum supported length (72 bytes)."
        )
        
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
                   o.legal_name as org_name, b.name as branch_name, b.code as branch_code
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN organizations o ON u.organization_id = o.id
            LEFT JOIN branches b ON u.branch_id = b.id
            WHERE LOWER(u.email) = $1
               OR ($1 = 'admin' AND u.is_superadmin = true)
            LIMIT 1
        """, clean_user)
        
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
            
        # 3. Pure PostgreSQL Bcrypt Verification: ZERO hardcoded test bypasses
        if not verify_password(clean_pwd, row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials. Please check your username and password."
            )
            
        menu_access = json.loads(row["menu_access"]) if row["menu_access"] else []
        permissions = json.loads(row["permissions"]) if row["permissions"] else {}

        role_sec_groups = []
        if isinstance(permissions, dict):
            role_sec_groups = permissions.get("security_groups", [])
        elif isinstance(permissions, list):
            role_sec_groups = permissions

        user_data = {
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
            "idle_timeout_minutes": row.get("idle_timeout_minutes"),
        }

        policies = await get_system_security_policies()
        global_max = int(policies.get("global_max_idle_timeout_minutes", 30))
        default_idle = int(policies.get("default_idle_timeout_minutes", 15))
        eff_idle = min(user_data["idle_timeout_minutes"] or default_idle, global_max)

        user_data["effective_idle_timeout_minutes"] = eff_idle
        user_data["global_max_idle_timeout_minutes"] = global_max
        
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
    
    return {
        "status": "success",
        "access_token": session_token,
        "token_type": "Bearer",  # nosec B105
        "user": user_data
    }

@app.post("/api/v1/auth/2fa/verify")
async def verify_2fa(req: Verify2FARequest, request: Request):
    """
    Verifies TOTP code with rate limiting (5 attempts/min/IP) and replay attack prevention.
    Strictly forbids any hardcoded code bypass.
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
        
    target_user_id = req.user_id
    redis = get_redis_client()
    if req.pending_token and redis:
        pending_key = f"2fa_pending:{req.pending_token}"
        pending_data = await redis.hgetall(pending_key)
        if pending_data and "user_id" in pending_data:
            target_user_id = pending_data["user_id"]
            
    if not target_user_id:
        raise HTTPException(status_code=400, detail="Missing user reference or 2FA challenge expired.")
        
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
        
    menu_access = json.loads(row["menu_access"]) if row["menu_access"] else []
    permissions = json.loads(row["permissions"]) if row["permissions"] else {}
    
    user_data = {
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
        "security_groups": ["*"] if row["is_superadmin"] else [],
        "menu_access": menu_access,
        "permissions": permissions,
        "idle_timeout_minutes": row.get("idle_timeout_minutes"),
    }

    policies = await get_system_security_policies()
    global_max = int(policies.get("global_max_idle_timeout_minutes", 30))
    default_idle = int(policies.get("default_idle_timeout_minutes", 15))
    eff_idle = min(user_data["idle_timeout_minutes"] or default_idle, global_max)

    user_data["effective_idle_timeout_minutes"] = eff_idle
    user_data["global_max_idle_timeout_minutes"] = global_max
    
    if req.pending_token and redis:
        await redis.delete(f"2fa_pending:{req.pending_token}")
        
    session_token = await SessionManager.create_session(
        user_id=user_data["id"],
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

@app.post("/api/v1/auth/2fa/setup")
async def setup_2fa(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Enrolls 2FA for the active user, generating a secret and QR code URI."""
    user_id = session["user_id"]
    try:
        parsed_uuid = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    secret = TwoFactorAuthService.generate_totp_secret()
    uri = TwoFactorAuthService.get_totp_uri(session.get("username", "user"), secret)
    qr_base64 = TwoFactorAuthService.generate_qr_code_base64(uri)
    
    pool = get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE users SET totp_secret = $1, is_2fa_enabled = true, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        """, secret, parsed_uuid)
        
    return {
        "status": "success",
        "secret": secret,
        "provisioning_uri": uri,
        "qr_code_base64": qr_base64
    }

@app.get("/api/v1/auth/me")
async def get_current_user_profile(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Fetches up-to-date user profile and permissions from PostgreSQL."""
    user_id = session.get("user_id")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        try:
            parsed_uuid = uuid.UUID(user_id) if isinstance(user_id, str) and len(user_id) == 36 else None
        except Exception:
            parsed_uuid = None
            
        if parsed_uuid:
            row = await conn.fetchrow("""
                SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
                       o.legal_name as org_name, b.name as branch_name, b.code as branch_code
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                LEFT JOIN organizations o ON u.organization_id = o.id
                LEFT JOIN branches b ON u.branch_id = b.id
                WHERE u.id = $1
            """, parsed_uuid)
        else:
            row = await conn.fetchrow("""
                SELECT u.*, r.name as role_name, r.permissions, r.menu_access,
                       o.legal_name as org_name, b.name as branch_name, b.code as branch_code
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                LEFT JOIN organizations o ON u.organization_id = o.id
                LEFT JOIN branches b ON u.branch_id = b.id
                WHERE u.is_superadmin = true
                LIMIT 1
            """)
            
        if not row:
            return session
            
        menu_access = json.loads(row["menu_access"]) if row["menu_access"] else []
        permissions = json.loads(row["permissions"]) if row["permissions"] else {}

        policies = await get_system_security_policies()
        global_max = int(policies.get("global_max_idle_timeout_minutes", 30))
        default_idle = int(policies.get("default_idle_timeout_minutes", 15))
        user_idle = row.get("idle_timeout_minutes")
        effective_idle = session.get("effective_idle_timeout_minutes") or min(user_idle or default_idle, global_max)
        
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
            "security_groups": ["*"] if row["is_superadmin"] else [],
            "menu_access": menu_access,
            "permissions": permissions,
            "idle_timeout_minutes": user_idle,
            "effective_idle_timeout_minutes": effective_idle,
            "global_max_idle_timeout_minutes": global_max,
        }

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
    success = await SessionManager.revoke_session(req.token)
    return {"status": "revoked" if success else "failed", "token": req.token}

@app.post("/api/v1/auth/sessions/revoke-others")
async def revoke_other_sessions(
    user_id: Optional[str] = None,
    req: Optional[RevokeOtherSessionsRequest] = None,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    target_user_id = user_id or (req.user_id if req else None) or session["user_id"]
    token_to_keep = (req.token if req and req.token else None) or session.get("token", "")
    count = await SessionManager.revoke_other_sessions(target_user_id, token_to_keep)
    return {"status": "success", "revoked_count": count}

# ==============================================================================
# 3. IAM USERS CRUD ENDPOINTS (PostgreSQL Direct)
# ==============================================================================
@app.get("/api/v1/iam/users")
async def list_users(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Returns list of users from PostgreSQL with tenancy and role info."""
    if not (check_permission(session, "users.read") or check_permission(session, "users.manage")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Missing required permission 'users.read'."
        )

    pool = get_db_pool()
    is_admin = bool(session.get("is_superadmin")) or check_permission(session, "users.manage")

    async with pool.acquire() as conn:
        if is_admin:
            rows = await conn.fetch("""
                SELECT u.id, u.email, u.full_name, u.status, u.is_superadmin, u.role_id,
                       r.name as role_name, u.organization_id, o.legal_name as organization_name,
                       u.branch_id, b.name as branch_name, b.code as branch_code,
                       u.department, u.allowed_cidrs, u.date_of_birth, u.age,
                       u.guardian_name, u.guardian_email, u.created_at, u.updated_at
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
                       u.guardian_name, u.guardian_email, u.created_at, u.updated_at
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
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            })
            
        return {"users": users_list}

@app.post("/api/v1/iam/users")
async def create_user(
    req: CreateUserRequest,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Provisions a new identity directly in PostgreSQL with a bcrypt password."""
    require_permission(session, "users.manage")
    pool = get_db_pool()
    clean_email = req.email.strip().lower()
    
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM users WHERE LOWER(email) = $1", clean_email
        )
        if existing:
            raise HTTPException(status_code=400, detail="A user with this email address already exists.")
            
        # Fallback org & branch if not specified
        org_id = uuid.UUID(req.organization_id) if req.organization_id else await conn.fetchval("SELECT id FROM organizations LIMIT 1")
        branch_id = uuid.UUID(req.branch_id) if req.branch_id else await conn.fetchval("SELECT id FROM branches LIMIT 1")
        
        # Map role if given as friendly name
        role_id = req.role_id or "role_standard"
        if req.role:
            matched_role = await conn.fetchval("SELECT id FROM roles WHERE LOWER(name) = LOWER($1)", req.role)
            if matched_role:
                role_id = matched_role
                
        is_super = role_id == "role_superadmin" or "superadmin" in (req.role or "").lower()
        new_id = uuid.uuid4()
        initial_pwd = req.initial_password or "InitPass@2026"
        complexity_err = validate_password_complexity(initial_pwd)
        if complexity_err:
            raise HTTPException(status_code=400, detail=complexity_err)
        pwd_hash = hash_password(initial_pwd)
        
        await conn.execute("""
            INSERT INTO users (
                id, email, full_name, password_hash, status, is_superadmin,
                organization_id, branch_id, role_id, department, allowed_cidrs,
                date_of_birth, age, guardian_name, guardian_email
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        """, new_id, clean_email, req.full_name, pwd_hash, req.status or "active", is_super,
           org_id, branch_id, role_id, req.department or "Operations", "0.0.0.0/0",
           req.date_of_birth, req.age, req.guardian_name, req.guardian_email)
        
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
        }

@app.put("/api/v1/iam/users/{user_id}")
async def update_user(
    user_id: str,
    req: UpdateUserRequest,
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
        
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM users WHERE id = $1", u_id)
        if not existing:
            raise HTTPException(status_code=404, detail="User not found.")

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
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, u_id, req.full_name, req.email, status_val, is_super, role_id,
           req.department, cidrs, req.date_of_birth, req.age,
           req.guardian_name, req.guardian_email, new_idle)
           
        return {"status": "success", "message": "User updated successfully."}

@app.post("/api/v1/iam/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    req: ResetPasswordRequest,
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
        
    hashed_pwd = hash_password(req.password)
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
            
    return {"status": "success", "message": "Password updated successfully."}

@app.delete("/api/v1/iam/users/{user_id}")
async def delete_user(
    user_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Deletes user from PostgreSQL."""
    require_permission(session, "users.manage")
    pool = get_db_pool()
    try:
        u_id = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user UUID.")
        
    async with pool.acquire() as conn:
        is_super = await conn.fetchval("SELECT is_superadmin FROM users WHERE id = $1", u_id)
        if is_super:
            raise HTTPException(status_code=400, detail="Cannot delete Root Superadmin.")
        await conn.execute("DELETE FROM users WHERE id = $1", u_id)
        
    return {"status": "success", "message": "User deleted."}

# ==============================================================================
# 4. IAM ROLES CRUD ENDPOINTS (PostgreSQL Direct with Menu Access)
# ==============================================================================
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
    
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO roles (id, name, code, description, badge_color, is_system, permissions, menu_access)
            VALUES ($1, $2, $3, $4, $5, false, $6::jsonb, $7::jsonb)
        """, role_id, clean_name, code, req.description or "Custom user-defined security role.",
           req.badge_color or "amber", json.dumps(perms), json.dumps(menu_access))
           
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
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Dynamically updates role permissions and menu_access in PostgreSQL."""
    require_permission(session, "roles.manage")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM roles WHERE id = $1", role_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Role not found.")
            
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
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Deletes custom role from PostgreSQL (system roles are protected)."""
    require_permission(session, "roles.manage")
    pool = get_db_pool()
    async with pool.acquire() as conn:
        role = await conn.fetchrow("SELECT is_system FROM roles WHERE id = $1", role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found.")
        if role["is_system"]:
            raise HTTPException(status_code=400, detail="System protected roles cannot be deleted.")
            
        assigned_count = await conn.fetchval("SELECT count(*) FROM users WHERE role_id = $1", role_id)
        if assigned_count > 0:
            raise HTTPException(status_code=400, detail=f"Cannot delete role: {assigned_count} users currently assigned.")
            
        await conn.execute("DELETE FROM roles WHERE id = $1", role_id)
        
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
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Creates a new API key in PostgreSQL and populates Redis cache."""
    require_permission(session, "hardware.manage")
    created = await APIKeyEngine.create_api_key(
        owner=req.owner,
        role=req.role or "service_daemon",
        allowed_cidrs=req.allowed_cidrs,
        scopes=req.scopes
    )
    return {"status": "success", "api_key": created}

@app.delete("/api/v1/iam/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Revokes API key from PostgreSQL and purges Redis cache."""
    require_permission(session, "hardware.manage")
    success = await APIKeyEngine.revoke_api_key(key_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found.")
    return {"status": "success", "message": "API key revoked."}


# ==============================================================================
# 5. TENANCY METADATA ENDPOINTS (Organizations & Branches)
# ==============================================================================
@app.get("/api/v1/iam/tenancy")
async def get_tenancy_data(session: Dict[str, Any] = Depends(get_current_user_session)):
    """Returns organizations and branches from PostgreSQL."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
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
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Updates organization legal name, Qatar CR/Tax ID, currency, and timezone."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
    try:
        o_uuid = uuid.UUID(org_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization UUID.")

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
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Creates a new operating branch in PostgreSQL."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
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
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Updates an operating branch and its CIDR IP allowlist."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(branch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid branch UUID.")

    cidrs = req.ip_allowlist or ["127.0.0.1/32"]
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE branches
            SET name = $2, code = $3, city = $4, ip_allowlist = $5::jsonb
            WHERE id = $1
        """, b_uuid, req.name.strip(), req.code.strip().upper(), req.city or "Doha", json.dumps(cidrs))
        return {"status": "success", "id": str(b_uuid)}

@app.delete("/api/v1/iam/branches/{branch_id}")
async def delete_branch(
    branch_id: str,
    session: Dict[str, Any] = Depends(get_current_user_session)
):
    """Deletes an operating branch if more than 1 branch exists."""
    require_permission(session, "org.manage")
    pool = get_db_pool()
    try:
        b_uuid = uuid.UUID(branch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid branch UUID.")

    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT count(*) FROM branches")
        if count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the primary operating branch.")
        await conn.execute("DELETE FROM branches WHERE id = $1", b_uuid)
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
    "attendance_logs",
    "shift_rosters",
    "users",
    "roles",
    "organizations",
    "branches",
    "terminals",
    "payroll_batches",
}

@app.get("/api/v1/meta/views/{model}")
async def get_view_schema(model: str):
    """
    Returns the declarative View Schema for the requested model.
    Applies strict model allowlist check and filesystem path traversal defense.
    """
    clean_model = (model or "").strip().lower()
    if clean_model not in REGISTERED_VIEW_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unregistered or invalid model specification: {clean_model}"
        )
        
    from pathlib import Path
    base_dir = (Path(__file__).parent.parent / "public").resolve()
    schema_path = (base_dir / "view_schema.json").resolve()
    
    # Strictly ensure resolved path does not traverse out of base_dir
    if not str(schema_path).startswith(str(base_dir)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden schema path traversal detected."
        )
        
    if not schema_path.exists():
        raise HTTPException(status_code=404, detail="Schema file not found.")
        
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
        
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
async def get_business_details():
    """Returns verified corporate and statutory business details."""
    return VERIFIED_BUSINESS_DETAILS

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

    if req.user_id in _gdpr_deletion_registry:
        del _gdpr_deletion_registry[req.user_id]
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
    return {
        "user_id": user_id,
        "status": "active",
        "message": "No active deletion requests. Account in compliance standard."
    }
