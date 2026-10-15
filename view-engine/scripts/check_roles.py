import asyncio
import asyncpg
import json

async def check():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/enterprise_db')
    users = await conn.fetch('SELECT id, email, role_id, is_superadmin FROM users')
    print("USERS:")
    for u in users:
        print(f"  {u['email']} | role_id: {u['role_id']} | is_superadmin: {u['is_superadmin']}")
    roles = await conn.fetch('SELECT id, name, code, menu_access FROM roles')
    print("\nROLES:")
    for r in roles:
        print(f"  {r['id']} | name: {r['name']} | code: {r['code']} | menu_access: {r['menu_access']}")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(check())
