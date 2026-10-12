import json
import logging
from typing import Optional, Dict, Any, List
import asyncpg
import bcrypt
from backend.core.config import settings

logger = logging.getLogger("enterprise.db")

db_pool: Optional[asyncpg.Pool] = None

def clean_dsn(url: str) -> str:
    """Normalize asyncpg connection string."""
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql://" + url[len("postgresql+asyncpg://"):]
    return url

async def init_db_pool() -> asyncpg.Pool:
    """Initialize asyncpg connection pool and verify schema."""
    global db_pool
    dsn = clean_dsn(settings.DATABASE_URL)
    try:
        db_pool = await asyncpg.create_pool(
            dsn,
            min_size=1,
            max_size=10,
            command_timeout=60,
        )
        logger.info("PostgreSQL database pool initialized successfully.")
        await init_schema()
        return db_pool
    except Exception as e:
        logger.error(f"Failed to initialize PostgreSQL pool: {e}")
        raise

async def close_db_pool():
    """Close asyncpg connection pool."""
    global db_pool
    if db_pool:
        await db_pool.close()
        db_pool = None
        logger.info("PostgreSQL database pool closed.")

def get_db_pool() -> asyncpg.Pool:
    """Retrieve active connection pool."""
    if not db_pool:
        raise RuntimeError("Database connection pool is not initialized.")
    return db_pool

def hash_password(password: str) -> str:
    """Generate bcrypt password hash with 72-byte safe truncation (Bcrypt DoS mitigation)."""
    pwd_bytes = (password or "").encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against bcrypt hash with 72-byte safe truncation."""
    try:
        if not plain_password or not hashed_password:
            return False
        pwd_bytes = plain_password.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))
    except Exception:
        return False

# ==============================================================================
# SCHEMA INITIALIZATION & SYSTEM SEEDING
# ==============================================================================
async def init_schema():
    """Ensure required tables, constraints, and default roles exist."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        # 1. System Metadata table (centralized initialization state)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS system_metadata (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 2. Roles & Permissions table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(50),
                description TEXT,
                badge_color VARCHAR(50) DEFAULT 'slate',
                is_system BOOLEAN DEFAULT false,
                permissions JSONB DEFAULT '{}'::jsonb,
                menu_access JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 3. Organizations table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS organizations (
                id UUID PRIMARY KEY,
                legal_name VARCHAR(255) NOT NULL,
                tax_id VARCHAR(100),
                base_currency VARCHAR(10) DEFAULT 'USD',
                default_timezone VARCHAR(50) DEFAULT 'UTC',
                default_locale VARCHAR(10) DEFAULT 'en',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 4. Branches table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS branches (
                id UUID PRIMARY KEY,
                organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50),
                city VARCHAR(100),
                ip_allowlist JSONB DEFAULT '["127.0.0.1/32"]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 5. Users table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                is_superadmin BOOLEAN DEFAULT false,
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
                role_id VARCHAR(50) REFERENCES roles(id) ON DELETE SET NULL,
                department VARCHAR(100) DEFAULT 'General',
                allowed_cidrs VARCHAR(255) DEFAULT '0.0.0.0/0',
                date_of_birth VARCHAR(50),
                age INT,
                guardian_name VARCHAR(255),
                guardian_email VARCHAR(255),
                totp_secret VARCHAR(64),
                is_2fa_enabled BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
            ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN DEFAULT false;
        """)

        # 6. Seed Baseline System Roles if not already present
        default_roles = [
            (
                "role_superadmin",
                "Superadmin",
                "SUPERADMIN",
                "Unrestricted platform authority across all tenant organizations, system policies, and security configurations.",
                "violet",
                True,
                json.dumps({
                    "attendance_logs": {"create": True, "read": True, "update": True, "delete": True},
                    "organizations": {"create": True, "read": True, "update": True, "delete": True},
                    "users": {"create": True, "read": True, "update": True, "delete": True},
                }),
                json.dumps(["attendances", "rosters", "users", "roles", "orgs", "terminals", "batches"])
            ),
            (
                "role_ops_lead",
                "Operations Lead",
                "OPS_LEAD",
                "Regional operations oversight with full operational CRUD rights, attendance verification, and branch reporting.",
                "blue",
                True,
                json.dumps({
                    "attendance_logs": {"create": True, "read": True, "update": True, "delete": True},
                    "organizations": {"create": False, "read": True, "update": True, "delete": False},
                    "users": {"create": True, "read": True, "update": True, "delete": False},
                }),
                json.dumps(["attendances", "rosters", "terminals"])
            ),
            (
                "role_supervisor",
                "Supervisor",
                "SUPERVISOR",
                "Shift supervisor with departmental attendance verification, roster scheduling, and read-only directory access.",
                "emerald",
                True,
                json.dumps({
                    "attendance_logs": {"create": True, "read": True, "update": True, "delete": False},
                    "organizations": {"create": False, "read": True, "update": False, "delete": False},
                    "users": {"create": False, "read": True, "update": False, "delete": False},
                }),
                json.dumps(["attendances", "rosters"])
            ),
            (
                "role_standard",
                "Standard User",
                "STANDARD_USER",
                "Base workforce member with personal self-service check-in logging and self-profile visibility.",
                "slate",
                True,
                json.dumps({
                    "attendance_logs": {"create": True, "read": True, "update": False, "delete": False},
                    "organizations": {"create": False, "read": False, "update": False, "delete": False},
                    "users": {"create": False, "read": True, "update": False, "delete": False},
                }),
                json.dumps(["attendances"])
            )
        ]

        for r_id, r_name, r_code, r_desc, r_badge, r_sys, r_perms, r_menu in default_roles:
            await conn.execute("""
                INSERT INTO roles (id, name, code, description, badge_color, is_system, permissions, menu_access)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    code = EXCLUDED.code,
                    description = EXCLUDED.description,
                    badge_color = EXCLUDED.badge_color,
                    is_system = EXCLUDED.is_system;
            """, r_id, r_name, r_code, r_desc, r_badge, r_sys, r_perms, r_menu)

        logger.info("PostgreSQL schema initialization and role seeding completed.")
