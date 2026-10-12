import hashlib
import time
import secrets
from typing import Optional, Dict, Any, List
import pyotp
import qrcode
import io
import base64
from backend.core.config import settings
from backend.core.session import get_redis_client

# ==============================================================================
# 1. API KEY ENGINE (Headless Biometric Terminal Sync & Automated Daemons)
# ==============================================================================
class APIKeyEngine:
    @staticmethod
    def hash_key(raw_api_key: str) -> str:
        return hashlib.sha256(raw_api_key.encode("utf-8")).hexdigest()

    @staticmethod
    async def validate_api_key(
        raw_key: str,
        client_ip: str,
        required_scope: str = "attendance:sync"
    ) -> Optional[Dict[str, Any]]:
        """
        Validates SHA-256 hashed API Key.
        Bypasses idle timeout, but strictly verifies IP whitelist and scopes.
        """
        redis = get_redis_client()
        if not redis or not raw_key:
            return None
            
        key_hash = APIKeyEngine.hash_key(raw_key)
        api_data = await redis.hgetall(f"apikey:{key_hash}")
        
        if not api_data:
            return None
            
        # Check IP restriction if configured on this key
        allowed_ips = api_data.get("allowed_ips", "").split(",")
        if allowed_ips and allowed_ips != [""] and client_ip not in allowed_ips:
            return None
            
        # Check scope
        scopes = api_data.get("scopes", "").split(",")
        if required_scope not in scopes and "*" not in scopes:
            return None
            
        return {
            "key_id": api_data.get("id"),
            "owner": api_data.get("owner"),
            "role": api_data.get("role", "service_daemon")
        }


# ==============================================================================
# 2. WINDOWS ACTIVE DIRECTORY / LDAP INTEGRATION
# ==============================================================================
class LDAPAuthenticator:
    @staticmethod
    def authenticate_ad_user(username: str, password: str) -> Optional[Dict[str, Any]]:
        """
        Authenticates against Active Directory / LDAP and maps
        AD Security Groups to internal application roles.
        Sanitizes LDAP search filters and enforces secure transport (LDAPS / START_TLS).
        Zero hardcoded credentials or backdoor bypasses allowed.
        """
        try:
            from ldap3 import Server, Connection, ALL, NTLM, Tls
            from ldap3.utils.conv import escape_filter_chars
            import ssl

            # Sanitize username against LDAP Injection attacks
            safe_username = escape_filter_chars(username.strip())
            
            is_ldaps = settings.LDAP_SERVER.lower().startswith("ldaps://")
            tls_config = Tls(validate=ssl.CERT_REQUIRED) if is_ldaps else None

            # Enforce secure transport: LDAPS (port 636) or START_TLS
            server = Server(
                settings.LDAP_SERVER,
                use_ssl=is_ldaps,
                tls=tls_config,
                get_info=ALL
            )
            user_dn = f"{settings.LDAP_DOMAIN}\\{safe_username}"
            
            conn = Connection(server, user=user_dn, password=password, authentication=NTLM)
            
            # If standard ldap:// connection, enforce START_TLS prior to bind
            if not is_ldaps:
                conn.open()
                conn.start_tls()
                
            if not conn.bind():
                return None  # Invalid domain credentials or unreachable domain controller
                
            # Query user groups in AD using sanitized search filter
            conn.search(
                search_base=settings.LDAP_BASE_DN,
                search_filter=f"(sAMAccountName={safe_username})",
                attributes=["memberOf", "mail", "displayName", "department"]
            )
            
            if not conn.entries:
                return None
                
            entry = conn.entries[0]
            member_of = [str(g) for g in entry.memberOf] if hasattr(entry, "memberOf") else []
            
            # Map AD Groups to Application Roles
            app_role = "user"
            if any("CN=Domain Admins" in g or "CN=ERP_Admins" in g for g in member_of):
                app_role = "admin"
            elif any("CN=HR_Managers" in g for g in member_of):
                app_role = "hr_officer"
            elif any("CN=Department_Heads" in g for g in member_of):
                app_role = "manager"
                
            return {
                "username": safe_username,
                "email": str(getattr(entry, "mail", f"{safe_username}@company.local")),
                "full_name": str(getattr(entry, "displayName", safe_username)),
                "department": str(getattr(entry, "department", "General")),
                "role": app_role,
                "ad_groups": member_of
            }
        except Exception:
            # Strictly return None on error; no hardcoded bypass or mock fallback allowed
            return None


# ==============================================================================
# 3. TWO-FACTOR AUTHENTICATION (TOTP via PyOTP with Replay Attack Prevention)
# ==============================================================================
class TwoFactorAuthService:
    @staticmethod
    def generate_totp_secret() -> str:
        return pyotp.random_base32()

    @staticmethod
    def get_totp_uri(username: str, secret: str, issuer: str = "Enterprise ERP") -> str:
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(name=username, issuer_name=issuer)

    @staticmethod
    def generate_qr_code_base64(uri: str) -> str:
        qr = qrcode.QRCode(version=1, box_size=8, border=2)
        qr.add_data(uri)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        return f"data:image/png;base64,{base64.b64encode(buffered.getvalue()).decode()}"

    @staticmethod
    async def create_2fa_pending_token(user_data: Dict[str, Any]) -> str:
        """Stores stage 1 credentials in DragonflyDB with 5-minute TTL"""
        redis = get_redis_client()
        if not redis:
            raise RuntimeError("Redis client not initialized")
            
        pending_token = secrets.token_urlsafe(32)
        key = f"2fa_pending:{pending_token}"
        
        await redis.hset(key, mapping={
            "user_id": str(user_data["id"]),
            "username": user_data.get("username", user_data.get("email", "")),
            "role": user_data.get("role", "Standard User"),
            "department": user_data.get("department", "General")
        })
        await redis.expire(key, 300)  # 5 minutes
        return pending_token

    @staticmethod
    def verify_totp_code(secret: str, code: str) -> bool:
        """
        Cryptographic TOTP validation against user secret.
        Zero hardcoded bypasses allowed.
        """
        if not secret or not code:
            return False
        clean_code = str(code).strip()
        totp = pyotp.TOTP(secret)
        return totp.verify(clean_code, valid_window=1)  # allow +/- 30s drift

    @staticmethod
    async def verify_totp_code_with_replay_prevention(user_id: str, secret: str, code: str) -> bool:
        """
        Verifies TOTP code against secret and enforces single-use replay prevention.
        Stores totp_used:<user_id>:<code_hash> in Redis with a 90-second TTL.
        Rejects subsequent verification attempts if the key already exists.
        """
        if not TwoFactorAuthService.verify_totp_code(secret, code):
            return False
            
        clean_code = str(code).strip()
        code_hash = hashlib.sha256(clean_code.encode("utf-8")).hexdigest()
        redis = get_redis_client()
        
        if redis:
            replay_key = f"totp_used:{user_id}:{code_hash}"
            # Atomically set if not exists with 90-second TTL
            is_new = await redis.set(replay_key, "1", ex=90, nx=True)
            if not is_new:
                # Key already exists: replay attack detected!
                return False
                
        return True


# ==============================================================================
# 4. POSTGRESQL ROW-LEVEL SECURITY (RLS) INJECTION
# ==============================================================================
class DatabaseRLSHelper:
    @staticmethod
    async def set_rls_session_context(connection, user_id: str, tenant_id: str, role: str):
        """
        Injects local session context into PostgreSQL connection using set_config().
        Enforces database-level Row-Level Security (RLS) policies with parameterized inputs.
        """
        query = """
        SELECT set_config('app.current_user_id', $1, true),
               set_config('app.current_tenant_id', $2, true),
               set_config('app.current_role', $3, true);
        """
        await connection.execute(query, str(user_id), str(tenant_id), str(role))
