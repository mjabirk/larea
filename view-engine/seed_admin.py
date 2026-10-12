import asyncio
import uuid
import bcrypt
import asyncpg

DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/enterprise_db"

async def init_admin():
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(b"Admin@123", salt).decode('utf-8')
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS system_metadata (
                key VARCHAR PRIMARY KEY, 
                value VARCHAR, 
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        await conn.execute("""
            INSERT INTO system_metadata (key, value) 
            VALUES ('is_initialized', 'true') 
            ON CONFLICT (key) DO UPDATE SET value = 'true';
        """)
        # Ensure role exists
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(50),
                description TEXT,
                badge_color VARCHAR(30),
                is_system BOOLEAN DEFAULT FALSE,
                permissions JSONB DEFAULT '{}',
                menu_access JSONB DEFAULT '[]'
            );
        """)
        await conn.execute("""
            INSERT INTO roles (id, name, code, is_system, permissions, menu_access)
            VALUES ('role_superadmin', 'Superadmin', 'ROLE_SUPERADMIN', true, '{"*": {"create": true, "read": true, "update": true, "delete": true}}'::jsonb, '["attendances", "rosters", "users", "roles", "orgs", "terminals", "batches"]'::jsonb)
            ON CONFLICT (id) DO UPDATE SET is_system = true;
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                is_superadmin BOOLEAN DEFAULT FALSE,
                organization_id UUID,
                branch_id UUID,
                role_id VARCHAR(50),
                department VARCHAR(100),
                allowed_cidrs JSONB DEFAULT '[]',
                date_of_birth DATE,
                age INT
            );
        """)
        await conn.execute("""
            INSERT INTO users (id, email, full_name, password_hash, status, is_superadmin, role_id)
            VALUES ($1, 'admin@company.local', 'Root Superadmin', $2, 'active', true, 'role_superadmin')
            ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'active', is_superadmin = true;
        """, uuid.uuid4(), hashed)
        print("Admin seed complete: admin@company.local / Admin@123")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(init_admin())
