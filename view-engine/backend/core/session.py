import time
import secrets
import ipaddress
import json
import logging
from typing import Optional, Dict, Any, List
import redis.asyncio as aioredis
from fastapi import Request, HTTPException, status
from backend.core.config import settings

logger = logging.getLogger("enterprise.session")

# Global async Redis/DragonflyDB pool
redis_client: Optional[aioredis.Redis] = None

async def init_redis():
    global redis_client
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()

def get_redis_client() -> Optional[aioredis.Redis]:
    global redis_client
    return redis_client

async def get_system_security_policies() -> Dict[str, Any]:
    """Retrieves system security policies (global ceiling and default idle timeout)."""
    global redis_client
    if redis_client:
        try:
            cached = await redis_client.get("cache:security_policies")
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    try:
        from backend.core.database import get_db_pool
        pool = get_db_pool()
        if pool:
            async with pool.acquire() as conn:
                row = await conn.fetchval("SELECT value FROM system_metadata WHERE key = 'cfg:security_policies';")
                if row:
                    policies = json.loads(row)
                    if redis_client:
                        try:
                            await redis_client.set("cache:security_policies", json.dumps(policies), ex=300)
                        except Exception:
                            pass
                    return policies
    except Exception as e:
        logger.warning(f"Failed to fetch security policies: {e}")

    return {
        "global_max_idle_timeout_minutes": 30,
        "default_idle_timeout_minutes": 15
    }

class SessionManager:
    """
    DragonflyDB / Redis Stateful Session Engine
    Implements tiered rolling idle timeout, 8-hr absolute hard cap,
    device tracking, and remote revocation.
    """
    
    @staticmethod
    def generate_token() -> str:
        return secrets.token_urlsafe(32)

    @staticmethod
    async def create_session(
        user_id: str,
        user_data: Dict[str, Any],
        client_ip: str,
        user_agent: str
    ) -> str:
        if not redis_client:
            raise RuntimeError("Redis client not initialized")
            
        token = SessionManager.generate_token()
        now = int(time.time())
        max_expiry = now + settings.SESSION_ABSOLUTE_MAX_SECONDS
        
        session_key = f"session:{token}"
        user_sessions_key = f"user_sessions:{user_id}"
        
        sec_groups = user_data.get("security_groups", [])
        perms = user_data.get("permissions", {})

        # Compute tiered auto-logoff timeout
        policies = await get_system_security_policies()
        global_max = int(policies.get("global_max_idle_timeout_minutes", 30))
        default_idle = int(policies.get("default_idle_timeout_minutes", 15))

        user_timeout = user_data.get("idle_timeout_minutes")
        if user_timeout is not None and str(user_timeout).strip() and str(user_timeout).strip() != "None":
            try:
                candidate = int(user_timeout)
                timeout_val = candidate if candidate > 0 else default_idle
            except (ValueError, TypeError):
                timeout_val = default_idle
        else:
            timeout_val = default_idle

        effective_timeout_minutes = min(timeout_val, global_max)
        idle_timeout_seconds = effective_timeout_minutes * 60

        session_payload = {
            "token": token,
            "user_id": str(user_id),
            "username": user_data.get("username", "") or user_data.get("email", ""),
            "full_name": user_data.get("full_name", ""),
            "email": user_data.get("email", ""),
            "role": user_data.get("role", "user"),
            "role_id": user_data.get("role_id", "role_standard"),
            "is_superadmin": "true" if user_data.get("is_superadmin") else "false",
            "department": user_data.get("department", "General"),
            "organization_id": str(user_data.get("organization_id") or ""),
            "branch_id": str(user_data.get("branch_id") or ""),
            "security_groups": json.dumps(sec_groups),
            "permissions": json.dumps(perms),
            "menu_access": json.dumps(user_data.get("menu_access", [])),
            "client_ip": client_ip,
            "user_agent": user_agent[:128],
            "created_at": str(now),
            "last_active": str(now),
            "max_expiry": str(max_expiry),
            "idle_timeout_seconds": str(idle_timeout_seconds),
            "effective_idle_timeout_minutes": str(effective_timeout_minutes),
        }
        
        # Pipeline: Write session hash, set dynamic idle TTL, add token to user_sessions set
        async with redis_client.pipeline(transaction=True) as pipe:
            await pipe.hset(session_key, mapping=session_payload)
            await pipe.expire(session_key, idle_timeout_seconds)
            await pipe.sadd(user_sessions_key, token)
            await pipe.execute()
            
        return token

    @staticmethod
    async def validate_session(token: str, client_ip: str) -> Optional[Dict[str, Any]]:
        if not redis_client or not token:
            return None
            
        session_key = f"session:{token}"
        session_data = await redis_client.hgetall(session_key)
        
        if not session_data:
            return None  # Expired via idle timeout or revoked
            
        now = int(time.time())
        max_expiry = int(session_data.get("max_expiry", 0))
        
        # Enforce Absolute Expiry (Hard cap 8 hours)
        if now > max_expiry:
            await SessionManager.revoke_session(token)
            return None
            
        # Enforce Rolling Idle Timeout: extend TTL by idle_timeout_seconds on each request
        idle_timeout_seconds = int(session_data.get("idle_timeout_seconds", settings.SESSION_IDLE_TIMEOUT_SECONDS))
        await redis_client.expire(session_key, idle_timeout_seconds)
        await redis_client.hset(session_key, "last_active", str(now))
        
        # Cast boolean is_superadmin
        session_data["is_superadmin"] = session_data.get("is_superadmin") == "true"
        if not session_data.get("username"):
            session_data["username"] = session_data.get("email", "") or session_data.get("full_name", "") or "Authorized User"

        session_data["effective_idle_timeout_minutes"] = int(session_data.get("effective_idle_timeout_minutes", idle_timeout_seconds // 60))
        session_data["idle_timeout_seconds"] = idle_timeout_seconds

        try:
            session_data["security_groups"] = json.loads(session_data.get("security_groups", "[]"))
        except Exception:
            session_data["security_groups"] = []

        try:
            session_data["permissions"] = json.loads(session_data.get("permissions", "{}"))
        except Exception:
            session_data["permissions"] = {}

        try:
            session_data["menu_access"] = json.loads(session_data.get("menu_access", "[]"))
        except Exception:
            session_data["menu_access"] = []
            
        return session_data

    @staticmethod
    async def revoke_session(token: str) -> bool:
        if not redis_client:
            return False
            
        session_key = f"session:{token}"
        user_id = await redis_client.hget(session_key, "user_id")
        
        async with redis_client.pipeline(transaction=True) as pipe:
            await pipe.delete(session_key)
            if user_id:
                await pipe.srem(f"user_sessions:{user_id}", token)
            await pipe.execute()
            
        return True

    @staticmethod
    async def revoke_other_sessions(user_id: str, current_token: str) -> int:
        """Revokes all active sessions for a user except the current one."""
        if not redis_client:
            return 0
            
        user_sessions_key = f"user_sessions:{user_id}"
        all_tokens = await redis_client.smembers(user_sessions_key)
        
        revoked_count = 0
        for token in all_tokens:
            if token != current_token:
                await redis_client.delete(f"session:{token}")
                await redis_client.srem(user_sessions_key, token)
                revoked_count += 1
                
        return revoked_count

    @staticmethod
    async def list_active_sessions(user_id: str) -> List[Dict[str, str]]:
        if not redis_client:
            return []
            
        user_sessions_key = f"user_sessions:{user_id}"
        all_tokens = await redis_client.smembers(user_sessions_key)
        
        active = []
        for token in all_tokens:
            data = await redis_client.hgetall(f"session:{token}")
            if data:
                active.append(data)
            else:
                # Clean stale tokens
                await redis_client.srem(user_sessions_key, token)
        return active


def verify_client_cidr(client_ip: str, allowed_cidrs: List[str]) -> bool:
    """Enforces network restrictions against allowed CIDR subnet blocks."""
    try:
        ip_obj = ipaddress.ip_address(client_ip)
        for cidr in allowed_cidrs:
            if ip_obj in ipaddress.ip_network(cidr, strict=False):
                return True
        return False
    except ValueError:
        return False
