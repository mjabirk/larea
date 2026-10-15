import asyncio
import asyncpg
import bcrypt
import json

async def setup_rec_user():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/enterprise_db')
    pwd = b"Rec@Secure2026!"
    hashed = bcrypt.hashpw(pwd, bcrypt.gensalt()).decode('utf-8')
    
    await conn.execute("""
        UPDATE users
        SET password_hash = $1, status = 'active', is_superadmin = false
        WHERE email = 'rec@mail.com'
    """, hashed)
    
    # Ensure role_944a8999af58 ("Rec") has ["attendances", "terminals"] (0 iam menus, 1 operations menu)
    await conn.execute("""
        UPDATE roles
        SET menu_access = $1::jsonb
        WHERE id = 'role_944a8999af58'
    """, json.dumps(["attendances", "terminals"]))
    
    row = await conn.fetchrow("""
        SELECT u.email, u.role_id, r.name, r.menu_access 
        FROM users u 
        JOIN roles r ON u.role_id = r.id 
        WHERE u.email = 'rec@mail.com'
    """)
    print("Rec User Configured:", dict(row))
    await conn.close()

if __name__ == '__main__':
    asyncio.run(setup_rec_user())
