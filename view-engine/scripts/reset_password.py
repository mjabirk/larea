#!/usr/bin/env python3
"""
scripts/reset_password.py
Automated CLI Utility for Autonomous Agent Login Recovery.
Updates or provisions credentials for admin@company.local in PostgreSQL.
"""

import sys
import os
import argparse
import asyncio
import uuid
import bcrypt
import asyncpg

# Add parent directory to sys.path so backend modules can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEFAULT_EMAIL = "admin@company.local"
DEFAULT_PASSWORD = "Admin@123"
DEFAULT_DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/enterprise_db")


def hash_password(password: str) -> str:
    """Safely hash password using bcrypt with 72-byte truncation."""
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


async def reset_password(email: str, new_password: str, db_url: str):
    clean_email = email.strip().lower()
    hashed = hash_password(new_password)
    print(hashed)
    print(f"[*] Connecting to PostgreSQL at {db_url} ...")
    conn = await asyncpg.connect(db_url)
    try:
        # Check if users table exists
        table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'users'
            );
        """)
        
        if not table_exists:
            print("[!] 'users' table not found. Creating schema...")
            # Import and run schema initializer if needed
            from backend.core.database import init_schema, init_db_pool
            await init_db_pool()

        # Update existing user
        updated_row = await conn.fetchrow("""
            UPDATE users
            SET password_hash = $1,
                status = 'active',
                is_superadmin = true,
                updated_at = CURRENT_TIMESTAMP
            WHERE LOWER(email) = $2
            RETURNING id, email, full_name, status, is_superadmin;
        """, hashed, clean_email)

        if updated_row:
            print("=" * 60)
            print("[SUCCESS] Autonomous Agent Recovery: Password successfully updated!")
            print(f"User ID:        {updated_row['id']}")
            print(f"Email:          {updated_row['email']}")
            print(f"Full Name:      {updated_row['full_name']}")
            print(f"Status:         {updated_row['status']}")
            print(f"Is Superadmin:  {updated_row['is_superadmin']}")
            print(f"New Password:   {new_password}")
            print("=" * 60)
            return True
        else:
            print(f"[*] User '{clean_email}' not found. Provisioning root superadmin user...")
            new_id = uuid.uuid4()
            # Ensure role_superadmin exists
            role_exists = await conn.fetchval("SELECT id FROM roles WHERE id = 'role_superadmin'")
            if not role_exists:
                await conn.execute("""
                    INSERT INTO roles (id, name, code, is_system, permissions, menu_access)
                    VALUES ('role_superadmin', 'Superadmin', 'ROLE_SUPERADMIN', true,
                            '{"*": {"create": true, "read": true, "update": true, "delete": true}}'::jsonb,
                            '["attendances", "rosters", "users", "roles", "orgs", "terminals", "batches"]'::jsonb)
                    ON CONFLICT (id) DO NOTHING;
                """)

            await conn.execute("""
                INSERT INTO users (
                    id, email, full_name, password_hash, status, is_superadmin, role_id, department, allowed_cidrs
                )
                VALUES ($1, $2, 'Root Superadmin', $3, 'active', true, 'role_superadmin', 'Executive Administration', '0.0.0.0/0')
            """, new_id, clean_email, hashed)

            print("=" * 60)
            print("[SUCCESS] Provisioned new superadmin account!")
            print(f"User ID:        {new_id}")
            print(f"Email:          {clean_email}")
            print(f"Status:         active")
            print(f"Is Superadmin:  True")
            print(f"New Password:   {new_password}")
            print("=" * 60)
            return True
    finally:
        await conn.close()


def main():
    parser = argparse.ArgumentParser(description="Autonomous Agent Login Recovery CLI Utility")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="User email address")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="New plaintext password to set")
    parser.add_argument("--db-url", default=DEFAULT_DB_URL, help="PostgreSQL connection URL")
    args = parser.parse_args()

    asyncio.run(reset_password(args.email, args.password, args.db_url))


if __name__ == "__main__":
    main()
