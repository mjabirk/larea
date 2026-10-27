import hashlib
import time
import secrets
import json
import uuid
import threading
from typing import Optional, Dict, Any, List
import pyotp
import qrcode
import io
import base64
from backend.core.config import settings
from backend.core.session import get_redis_client, verify_client_cidr

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
        Survives Redis cache restarts by falling back to PostgreSQL api_keys table,
        using Redis strictly as a cache layer.
        Verifies CIDR allowlists and permission scopes.
        """
        if not raw_key:
            return None

        key_hash = APIKeyEngine.hash_key(raw_key)
        redis = get_redis_client()
        api_data = None

        # 1. Check Redis Cache
        if redis:
            try:
                cached = await redis.hgetall(f"apikey:{key_hash}")
                if cached:
                    api_data = cached
            except Exception:
                pass

        # 2. Cache Miss: Fall back to PostgreSQL api_keys table
        if not api_data:
            try:
                from backend.core.database import get_db_pool
                pool = get_db_pool()
                async with pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT id, key_hash, owner, role, allowed_cidrs, scopes, created_at
                        FROM api_keys
                        WHERE key_hash = $1
                        LIMIT 1
                    """, key_hash)

                    if row:
                        cidrs_raw = row["allowed_cidrs"]
                        if isinstance(cidrs_raw, str):
                            try:
                                cidrs = json.loads(cidrs_raw)
                            except Exception:
                                cidrs = [cidrs_raw]
                        else:
                            cidrs = cidrs_raw or []

                        scopes_raw = row["scopes"]
                        if isinstance(scopes_raw, str):
                            try:
                                scopes = json.loads(scopes_raw)
                            except Exception:
                                scopes = [scopes_raw]
                        else:
                            scopes = scopes_raw or []

                        api_data = {
                            "id": str(row["id"]),
                            "owner": row["owner"],
                            "role": row["role"] or "service_daemon",
                            "allowed_cidrs": json.dumps(cidrs),
                            "scopes": json.dumps(scopes)
                        }

                        # Populate Redis Cache with 1-hour TTL
                        if redis:
                            try:
                                cache_key = f"apikey:{key_hash}"
                                await redis.hset(cache_key, mapping=api_data)
                                await redis.expire(cache_key, 3600)
                            except Exception:
                                pass
            except Exception:
                pass

        if not api_data:
            return None

        # 3. Verify CIDR / IP Network Restrictions
        allowed_cidrs_val = api_data.get("allowed_cidrs", "[]")
        if isinstance(allowed_cidrs_val, str):
            try:
                allowed_cidrs = json.loads(allowed_cidrs_val)
            except Exception:
                allowed_cidrs = [c.strip() for c in allowed_cidrs_val.split(",") if c.strip()]
        else:
            allowed_cidrs = allowed_cidrs_val or []

        if allowed_cidrs and allowed_cidrs != [""] and allowed_cidrs != ["*"] and allowed_cidrs != ["0.0.0.0/0"]:
            if not verify_client_cidr(client_ip, allowed_cidrs):
                return None

        # 4. Verify Scopes
        scopes_val = api_data.get("scopes", "[]")
        if isinstance(scopes_val, str):
            try:
                scopes = json.loads(scopes_val)
            except Exception:
                scopes = [s.strip() for s in scopes_val.split(",") if s.strip()]
        else:
            scopes = scopes_val or []

        if scopes and "*" not in scopes and required_scope not in scopes:
            return None

        return {
            "key_id": api_data.get("id"),
            "owner": api_data.get("owner"),
            "role": api_data.get("role", "service_daemon")
        }

    @staticmethod
    async def create_api_key(
        owner: str,
        role: str = "service_daemon",
        allowed_cidrs: Optional[List[str]] = None,
        scopes: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Creates an API key in PostgreSQL and populates Redis cache."""
        from backend.core.database import get_db_pool
        pool = get_db_pool()
        key_id = f"ak_{uuid.uuid4().hex[:16]}"
        raw_key = f"ak_live_{secrets.token_urlsafe(32)}"
        key_hash = APIKeyEngine.hash_key(raw_key)
        cidrs = allowed_cidrs if allowed_cidrs is not None else ["0.0.0.0/0"]
        key_scopes = scopes if scopes is not None else ["attendance:sync"]

        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO api_keys (id, key_hash, owner, role, allowed_cidrs, scopes)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
            """, key_id, key_hash, owner, role, json.dumps(cidrs), json.dumps(key_scopes))

        redis = get_redis_client()
        if redis:
            try:
                cache_key = f"apikey:{key_hash}"
                await redis.hset(cache_key, mapping={
                    "id": key_id,
                    "owner": owner,
                    "role": role,
                    "allowed_cidrs": json.dumps(cidrs),
                    "scopes": json.dumps(key_scopes)
                })
                await redis.expire(cache_key, 3600)
            except Exception:
                pass

        return {
            "id": key_id,
            "raw_api_key": raw_key,
            "owner": owner,
            "role": role,
            "allowed_cidrs": cidrs,
            "scopes": key_scopes
        }

    @staticmethod
    async def list_api_keys() -> List[Dict[str, Any]]:
        """Lists API keys from PostgreSQL."""
        from backend.core.database import get_db_pool
        pool = get_db_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, owner, role, allowed_cidrs, scopes, created_at
                FROM api_keys
                ORDER BY created_at DESC
            """)
            result = []
            for r in rows:
                result.append({
                    "id": r["id"],
                    "owner": r["owner"],
                    "role": r["role"],
                    "allowed_cidrs": json.loads(r["allowed_cidrs"]) if isinstance(r["allowed_cidrs"], str) else (r["allowed_cidrs"] or []),
                    "scopes": json.loads(r["scopes"]) if isinstance(r["scopes"], str) else (r["scopes"] or []),
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None
                })
            return result

    @staticmethod
    async def revoke_api_key(key_id: str) -> bool:
        """Revokes an API key from PostgreSQL and removes from Redis."""
        from backend.core.database import get_db_pool
        pool = get_db_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT key_hash FROM api_keys WHERE id = $1", key_id)
            if not row:
                return False
            key_hash = row["key_hash"]
            await conn.execute("DELETE FROM api_keys WHERE id = $1", key_id)

        redis = get_redis_client()
        if redis:
            try:
                await redis.delete(f"apikey:{key_hash}")
            except Exception:
                pass
        return True


# ==============================================================================
# 2. WINDOWS ACTIVE DIRECTORY / LDAP & WEB SSO ENGINE (ENTRA OIDC + KERBEROS)
# ==============================================================================
class LDAPAuthenticator:
    @staticmethod
    def authenticate_ad_user(
        username: str,
        password: str,
        ldap_config: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Authenticates against Active Directory / LDAP and maps
        AD Security Groups to internal application roles.
        Sanitizes LDAP search filters and enforces secure transport (LDAPS / START_TLS).
        Zero hardcoded credentials or backdoor bypasses allowed.
        """
        if not username or not password:
            return None
        try:
            from ldap3 import Server, Connection, ALL, NTLM, SIMPLE, Tls
            from ldap3.utils.conv import escape_filter_chars
            import ssl

            cfg = ldap_config or {}
            ldap_server = (cfg.get("ldap_server") or settings.LDAP_SERVER or "").strip()
            ldap_base_dn = (cfg.get("ldap_base_dn") or settings.LDAP_BASE_DN or "").strip()
            ldap_domain = (cfg.get("ldap_domain") or settings.LDAP_DOMAIN or "").strip()

            if not ldap_server:
                return None

            raw_user = username.strip()
            domain_part = ldap_domain
            sam_part = raw_user
            upn_part = raw_user

            if "\\" in raw_user:
                domain_part, sam_part = raw_user.split("\\", 1)
            elif "@" in raw_user:
                sam_part = raw_user.split("@", 1)[0]

            # Sanitize username against LDAP Injection attacks
            safe_sam = escape_filter_chars(sam_part.strip())
            safe_upn = escape_filter_chars(upn_part.strip())

            is_ldaps = ldap_server.lower().startswith("ldaps://")
            tls_config = Tls(validate=ssl.CERT_REQUIRED) if is_ldaps else None

            # Enforce secure transport: LDAPS (port 636) or START_TLS
            server = Server(
                ldap_server,
                use_ssl=is_ldaps,
                tls=tls_config,
                get_info=ALL
            )

            if "@" in raw_user and not domain_part:
                bind_user = safe_upn
                auth_mode = SIMPLE
            else:
                bind_user = f"{domain_part}\\{safe_sam}" if domain_part else safe_sam
                auth_mode = NTLM if domain_part else SIMPLE

            conn = Connection(server, user=bind_user, password=password, authentication=auth_mode)

            # If standard ldap:// connection, enforce START_TLS prior to bind
            if not is_ldaps:
                conn.open()
                conn.start_tls()

            if not conn.bind():
                return None  # Invalid domain credentials or unreachable domain controller

            # Query user groups in AD using sanitized search filter
            conn.search(
                search_base=ldap_base_dn,
                search_filter=f"(|(sAMAccountName={safe_sam})(userPrincipalName={safe_upn})(mail={safe_upn}))",
                attributes=["memberOf", "mail", "displayName", "department", "userPrincipalName", "sAMAccountName", "objectGUID"]
            )

            if not conn.entries:
                return None

            entry = conn.entries[0]
            member_of = [str(g) for g in entry.memberOf] if hasattr(entry, "memberOf") else []

            # Map AD Groups to Application Roles
            app_role_id = "role_user"
            if any("CN=Domain Admins" in g or "CN=ERP_Admins" in g for g in member_of):
                app_role_id = "role_admin"
            elif any("CN=HR_Managers" in g for g in member_of):
                app_role_id = "role_hr"
            elif any("CN=Department_Heads" in g for g in member_of):
                app_role_id = "role_manager"

            resolved_upn = str(getattr(entry, "userPrincipalName", "") or getattr(entry, "mail", "") or f"{safe_sam}@{ldap_domain.lower()}.local")
            resolved_email = str(getattr(entry, "mail", "") or resolved_upn).lower()
            resolved_sam = str(getattr(entry, "sAMAccountName", "") or safe_sam)
            resolved_guid = str(getattr(entry, "objectGUID", "") or "")

            return {
                "provider": "ad_ldap",
                "username": resolved_sam,
                "ad_sam_account": f"{domain_part}\\{resolved_sam}" if domain_part else resolved_sam,
                "windows_upn": resolved_upn.lower(),
                "external_id": resolved_guid or resolved_upn.lower(),
                "email": resolved_email,
                "full_name": str(getattr(entry, "displayName", "") or resolved_sam),
                "department": str(getattr(entry, "department", "") or "General"),
                "role_id": app_role_id,
                "ad_groups": member_of
            }
        except Exception:
            # Strictly return None on error; no hardcoded bypass or mock fallback allowed
            return None


class WindowsSSOEngine:
    """
    Enterprise Web-Based Windows Single Sign-On Engine for Linux/WSL Backends:
    1. Microsoft Entra ID (Azure AD) OIDC / OAuth2 v2.0 with PKCE (S256)
    2. HTTP SPNEGO / Kerberos ('WWW-Authenticate: Negotiate') & Trusted Proxy IWA
    3. Active Directory LDAP/LDAPS Synchronization & JIT User Provisioning
    """
    _memory_state_store: Dict[str, Dict[str, Any]] = {}
    _memory_state_lock = threading.Lock()

    @classmethod
    def _store_state(cls, state: str, payload: Dict[str, Any]):
        """Store SSO state in memory with automatic eviction of expired entries (>600s)."""
        with cls._memory_state_lock:
            now = int(time.time())
            expired = [k for k, v in cls._memory_state_store.items() if now - int(v.get("created_at", 0)) > 600]
            for k in expired:
                cls._memory_state_store.pop(k, None)
            cls._memory_state_store[state] = payload

    @classmethod
    def _pop_state(cls, state: str) -> Optional[Dict[str, Any]]:
        """Atomically pop SSO state from memory store."""
        with cls._memory_state_lock:
            return cls._memory_state_store.pop(state, None)

    @staticmethod
    async def get_sso_settings() -> Dict[str, Any]:
        """Load Windows SSO settings from PostgreSQL system_metadata merged with env defaults."""
        defaults = {
            "entra_enabled": settings.SSO_ENTRA_ENABLED,
            "entra_tenant_id": settings.SSO_ENTRA_TENANT_ID,
            "entra_client_id": settings.SSO_ENTRA_CLIENT_ID,
            "entra_client_secret": settings.SSO_ENTRA_CLIENT_SECRET,
            "entra_redirect_uri": settings.SSO_ENTRA_REDIRECT_URI,
            "kerberos_enabled": settings.SSO_KERBEROS_ENABLED,
            "kerberos_service_principal": settings.SSO_KERBEROS_SERVICE_PRINCIPAL,
            "trust_remote_user_header": settings.SSO_TRUST_REMOTE_USER_HEADER,
            "ldap_enabled": settings.LDAP_ENABLED,
            "ldap_server": settings.LDAP_SERVER,
            "ldap_base_dn": settings.LDAP_BASE_DN,
            "ldap_domain": settings.LDAP_DOMAIN,
            "auto_provision": settings.SSO_AUTO_PROVISION,
            "default_role_id": settings.SSO_DEFAULT_ROLE_ID,
            "auto_login_default": settings.SSO_AUTO_LOGIN_DEFAULT,
        }
        try:
            from backend.core.database import get_db_pool
            pool = get_db_pool()
            async with pool.acquire() as conn:
                val = await conn.fetchval("SELECT value FROM system_metadata WHERE key = 'cfg:sso_settings'")
                if val:
                    stored = json.loads(val)
                    if isinstance(stored, dict):
                        defaults.update(stored)
        except Exception:
            pass
        return defaults

    @staticmethod
    async def save_sso_settings(new_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Persist Windows SSO settings to PostgreSQL system_metadata."""
        current = await WindowsSSOEngine.get_sso_settings()
        allowed_keys = {
            "entra_enabled", "entra_tenant_id", "entra_client_id", "entra_client_secret",
            "entra_redirect_uri", "kerberos_enabled", "kerberos_service_principal",
            "trust_remote_user_header", "ldap_enabled", "ldap_server", "ldap_base_dn",
            "ldap_domain", "auto_provision", "default_role_id", "auto_login_default"
        }
        for k, v in new_settings.items():
            if k in allowed_keys:
                # Preserve existing secret if masked placeholder is sent from UI
                if k == "entra_client_secret" and isinstance(v, str) and v.startswith("••••"):
                    continue
                current[k] = v

        from backend.core.database import get_db_pool
        pool = get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO system_metadata (key, value, updated_at)
                VALUES ('cfg:sso_settings', $1, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
            """, json.dumps(current))
        return current

    @staticmethod
    async def create_entra_authorization_url(
        redirect_uri: Optional[str] = None,
        login_hint: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Generates Microsoft Entra ID OAuth2 v2.0 Authorization URL with PKCE (S256),
        cryptographic state, and OIDC nonce stored in DragonflyDB/Redis.
        """
        from urllib.parse import urlencode
        sso_cfg = await WindowsSSOEngine.get_sso_settings()
        if not sso_cfg.get("entra_enabled") or not sso_cfg.get("entra_client_id"):
            raise ValueError("Microsoft Entra ID SSO is not enabled or missing Client ID.")

        tenant_id = (sso_cfg.get("entra_tenant_id") or "common").strip()
        client_id = sso_cfg["entra_client_id"].strip()
        effective_redirect = (redirect_uri or sso_cfg.get("entra_redirect_uri") or "http://localhost:5173").strip()

        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(24)
        code_verifier = secrets.token_urlsafe(64)
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

        state_payload = {
            "code_verifier": code_verifier,
            "nonce": nonce,
            "redirect_uri": effective_redirect,
            "created_at": str(int(time.time()))
        }

        redis = get_redis_client()
        if redis:
            try:
                await redis.hset(f"sso_state:{state}", mapping=state_payload)
                await redis.expire(f"sso_state:{state}", 600)
            except Exception:
                WindowsSSOEngine._store_state(state, state_payload)
        else:
            WindowsSSOEngine._store_state(state, state_payload)

        params = {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": effective_redirect,
            "response_mode": "query",
            "scope": "openid profile email User.Read",
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        if login_hint:
            params["login_hint"] = login_hint.strip()

        authorize_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize?{urlencode(params)}"
        return {
            "authorize_url": authorize_url,
            "state": state,
            "redirect_uri": effective_redirect
        }

    @staticmethod
    async def exchange_entra_code(
        code: str,
        state: str,
        redirect_uri: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validates OAuth2 state, exchanges authorization code + PKCE code_verifier
        with Microsoft Entra ID token endpoint, verifies OIDC ID token claims,
        and fetches authoritative user identity from Microsoft Graph (/v1.0/me).
        """
        import httpx
        sso_cfg = await WindowsSSOEngine.get_sso_settings()
        if not sso_cfg.get("entra_enabled") or not sso_cfg.get("entra_client_id"):
            raise ValueError("Microsoft Entra ID SSO is not enabled.")

        redis = get_redis_client()
        state_data = None
        if redis:
            try:
                # Atomic transaction pipeline: fetch and delete state atomically
                async with redis.pipeline(transaction=True) as pipe:
                    pipe.hgetall(f"sso_state:{state}")
                    pipe.delete(f"sso_state:{state}")
                    pipe_res = await pipe.execute()
                raw_data, deleted_count = pipe_res[0], pipe_res[1]
                # Only accept state if key was actually deleted by this transaction (prevents race/reuse)
                if raw_data and deleted_count > 0:
                    state_data = raw_data
            except Exception as e:
                logger.warning(f"Atomic Redis state retrieval failed: {e}")
        if not state_data:
            state_data = WindowsSSOEngine._pop_state(state)

        if not state_data or not state_data.get("code_verifier"):
            raise ValueError("Invalid or expired SSO state token. Please try signing in again.")

        created_at = int(state_data.get("created_at", "0"))
        if int(time.time()) - created_at > 600:
            raise ValueError("SSO login state expired. Please try signing in again.")

        tenant_id = (sso_cfg.get("entra_tenant_id") or "common").strip()
        client_id = sso_cfg["entra_client_id"].strip()
        client_secret = (sso_cfg.get("entra_client_secret") or "").strip()
        effective_redirect = (redirect_uri or state_data.get("redirect_uri") or sso_cfg.get("entra_redirect_uri")).strip()

        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        form_data = {
            "client_id": client_id,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": effective_redirect,
            "code_verifier": state_data["code_verifier"],
            "scope": "openid profile email User.Read",
        }
        if client_secret:
            form_data["client_secret"] = client_secret

        async with httpx.AsyncClient(timeout=15.0) as client:
            token_resp = await client.post(token_url, data=form_data)
            if token_resp.status_code != 200:
                err_body = token_resp.json() if token_resp.headers.get("content-type", "").startswith("application/json") else {}
                err_desc = err_body.get("error_description") or "Token exchange rejected by Microsoft Entra ID."
                raise ValueError(err_desc)

            tokens = token_resp.json()
            id_token = tokens.get("id_token", "")
            access_token = tokens.get("access_token", "")

            if not id_token:
                raise ValueError("Microsoft Entra ID response did not include an OIDC id_token.")

            # Decode and verify ID token payload (received directly over TLS from login.microsoftonline.com)
            parts = id_token.split(".")
            if len(parts) != 3:
                raise ValueError("Malformed OIDC id_token.")

            header_padded = parts[0] + "=" * (-len(parts[0]) % 4)
            header = json.loads(base64.urlsafe_b64decode(header_padded.encode("ascii")).decode("utf-8"))

            padded = parts[1] + "=" * (-len(parts[1]) % 4)
            claims = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))

            # Validate iss claim against https://login.microsoftonline.com/{tenant_id}/v2.0
            # (or the token's tid when tenant_id == "common")
            expected_tid = claims.get("tid") if tenant_id == "common" and claims.get("tid") else tenant_id
            expected_iss = f"https://login.microsoftonline.com/{expected_tid}/v2.0"
            if claims.get("iss") != expected_iss:
                raise ValueError(f"OIDC ID token issuer mismatch: expected '{expected_iss}', got '{claims.get('iss')}'.")

            # Verify audience, expiration, and nonce
            if claims.get("aud") != client_id:
                raise ValueError("OIDC ID token audience mismatch.")
            if int(claims.get("exp", 0)) < int(time.time()) - 60:
                raise ValueError("OIDC ID token has expired.")
            if state_data.get("nonce") and claims.get("nonce") != state_data["nonce"]:
                raise ValueError("OIDC ID token nonce mismatch.")

            # Verify JWT signature against Microsoft's JWKS keys using cryptography
            kid = header.get("kid")
            if not kid:
                raise ValueError("OIDC ID token header missing 'kid'.")

            jwks_url = f"https://login.microsoftonline.com/{expected_tid}/discovery/v2.0/keys"
            jwks_resp = await client.get(jwks_url)
            if jwks_resp.status_code != 200:
                if expected_tid != tenant_id:
                    jwks_resp = await client.get(f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys")
                if jwks_resp.status_code != 200:
                    raise ValueError(f"Failed to fetch Microsoft JWKS keys from {jwks_url}.")

            jwks = jwks_resp.json()
            matching_key = None
            for key_obj in jwks.get("keys", []):
                if key_obj.get("kid") == kid:
                    matching_key = key_obj
                    break

            if not matching_key:
                raise ValueError(f"No matching public key found in Microsoft JWKS for kid '{kid}'.")

            from cryptography.hazmat.primitives.asymmetric import rsa, padding
            from cryptography.hazmat.primitives import hashes
            from cryptography.exceptions import InvalidSignature

            n_padded = matching_key["n"] + "=" * (-len(matching_key["n"]) % 4)
            e_padded = matching_key["e"] + "=" * (-len(matching_key["e"]) % 4)
            n_int = int.from_bytes(base64.urlsafe_b64decode(n_padded.encode("ascii")), "big")
            e_int = int.from_bytes(base64.urlsafe_b64decode(e_padded.encode("ascii")), "big")
            public_key = rsa.RSAPublicNumbers(e=e_int, n=n_int).public_key()

            sig_padded = parts[2] + "=" * (-len(parts[2]) % 4)
            sig_bytes = base64.urlsafe_b64decode(sig_padded.encode("ascii"))
            signed_data = f"{parts[0]}.{parts[1]}".encode("ascii")

            try:
                public_key.verify(sig_bytes, signed_data, padding.PKCS1v15(), hashes.SHA256())
            except InvalidSignature:
                raise ValueError("OIDC ID token cryptographic signature verification failed.")

            # Optionally enrich and cross-verify via Microsoft Graph /v1.0/me
            graph_profile = {}
            if access_token:
                try:
                    g_resp = await client.get(
                        "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,department,jobTitle,onPremisesSamAccountName",
                        headers={"Authorization": f"Bearer {access_token}"}
                    )
                    if g_resp.status_code == 200:
                        graph_profile = g_resp.json()
                except Exception:
                    pass

        oid = graph_profile.get("id") or claims.get("oid") or claims.get("sub")
        upn = (
            graph_profile.get("userPrincipalName")
            or claims.get("upn")
            or claims.get("preferred_username")
            or claims.get("email")
            or ""
        ).strip().lower()
        email = (
            graph_profile.get("mail")
            or claims.get("email")
            or upn
        ).strip().lower()
        full_name = (
            graph_profile.get("displayName")
            or claims.get("name")
            or (upn.split("@")[0] if upn else "Windows User")
        ).strip()
        department = (graph_profile.get("department") or "General").strip()
        sam_account = (graph_profile.get("onPremisesSamAccountName") or "").strip()

        if not upn and not email:
            raise ValueError("Could not determine Windows User Principal Name (UPN) or email from Entra ID token.")

        return {
            "provider": "entra_oidc",
            "external_id": str(oid or upn),
            "windows_upn": upn or email,
            "email": email or upn,
            "full_name": full_name,
            "department": department,
            "ad_sam_account": sam_account,
            "groups": claims.get("groups", []) or claims.get("roles", [])
        }

    @staticmethod
    def verify_kerberos_or_proxy_request(
        auth_header: Optional[str],
        remote_user_header: Optional[str],
        client_ip: str,
        sso_cfg: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Authenticates HTTP SPNEGO/Kerberos ('Authorization: Negotiate <token>')
        or verified reverse-proxy Windows authentication header ('X-Remote-User').
        Never uses local OS environment variables.
        """
        # 1. Check Trusted Reverse Proxy Header (e.g. Nginx/Apache/IIS Kerberos Auth Proxy)
        if sso_cfg.get("trust_remote_user_header") and remote_user_header:
            if client_ip in settings.TRUSTED_PROXIES:
                principal = remote_user_header.strip()
                if principal and principal.lower() != "anonymous":
                    domain_part = sso_cfg.get("ldap_domain") or settings.LDAP_DOMAIN
                    sam_part = principal
                    upn = principal.lower()
                    if "\\" in principal:
                        domain_part, sam_part = principal.split("\\", 1)
                        upn = f"{sam_part.lower()}@{domain_part.lower()}.local"
                    elif "@" in principal:
                        sam_part = principal.split("@", 1)[0]
                        upn = principal.lower()
                    else:
                        upn = f"{sam_part.lower()}@{domain_part.lower()}.local"

                    return {
                        "status": "authenticated",
                        "identity": {
                            "provider": "kerberos_proxy",
                            "external_id": principal.lower(),
                            "windows_upn": upn,
                            "email": upn,
                            "full_name": sam_part,
                            "department": "General",
                            "ad_sam_account": f"{domain_part}\\{sam_part}" if domain_part else sam_part,
                        }
                    }

        # 2. Check HTTP SPNEGO / Kerberos Negotiate Header
        if not sso_cfg.get("kerberos_enabled"):
            return {
                "status": "disabled",
                "message": "Kerberos / SPNEGO Integrated Windows Authentication is not enabled."
            }

        if not auth_header or not auth_header.startswith("Negotiate "):
            return {
                "status": "challenge",
                "www_authenticate": "Negotiate",
                "message": "SPNEGO Negotiate token required."
            }

        token_b64 = auth_header[len("Negotiate "):].strip()
        if not token_b64:
            return {
                "status": "challenge",
                "www_authenticate": "Negotiate",
                "message": "Empty SPNEGO Negotiate token."
            }

        try:
            in_token = base64.b64decode(token_b64)
        except Exception:
            return {"status": "error", "message": "Malformed base64 SPNEGO token."}

        # Validate using pyspnego / gssapi on Linux server
        try:
            import spnego
            spn = (sso_cfg.get("kerberos_service_principal") or "HTTP@localhost").strip()
            service_part = "HTTP"
            host_part = None
            if "@" in spn:
                service_part, host_part = spn.split("@", 1)
            elif "/" in spn:
                service_part, host_part = spn.split("/", 1)

            ctx = spnego.server(hostname=host_part, service=service_part)
            out_token = ctx.step(in_token)
            out_b64 = base64.b64encode(out_token).decode("ascii") if out_token else None

            if not ctx.complete:
                return {
                    "status": "challenge",
                    "www_authenticate": f"Negotiate {out_b64}" if out_b64 else "Negotiate",
                    "message": "SPNEGO multi-step negotiation in progress."
                }

            principal = str(ctx.client_principal or "").strip()
            if not principal:
                return {"status": "error", "message": "SPNEGO context completed without a client principal."}

            sam_part = principal.split("@")[0].split("\\")[-1]
            upn = principal.lower() if "@" in principal else f"{sam_part.lower()}@{(sso_cfg.get('ldap_domain') or 'company').lower()}.local"

            return {
                "status": "authenticated",
                "www_authenticate": f"Negotiate {out_b64}" if out_b64 else None,
                "identity": {
                    "provider": "kerberos_spnego",
                    "external_id": principal.lower(),
                    "windows_upn": upn,
                    "email": upn,
                    "full_name": sam_part,
                    "department": "General",
                    "ad_sam_account": sam_part,
                }
            }
        except ImportError:
            return {
                "status": "error",
                "message": "Server Kerberos library (pyspnego/gssapi) is not installed on this Linux host, and no trusted reverse-proxy header was provided. Use Microsoft Entra ID SSO or Active Directory domain login."
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Kerberos SPNEGO verification failed: {str(e)}"
            }


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
        if not (clean_code.isdigit() and len(clean_code) == 6):
            return False
        return pyotp.TOTP(secret).verify(clean_code, valid_window=1)  # allow +/- 30s drift

        
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
