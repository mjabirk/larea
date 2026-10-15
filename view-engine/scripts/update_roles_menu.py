import asyncio
import asyncpg
import json

async def update_roles():
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:5432/enterprise_db")
    rows = await conn.fetch("SELECT id, menu_access FROM roles;")
    for r in rows:
        menus = json.loads(r["menu_access"]) if isinstance(r["menu_access"], str) else list(r["menu_access"] or [])
        if "employees" in menus and "new_employee" not in menus:
            menus.append("new_employee")
            await conn.execute("UPDATE roles SET menu_access = $1 WHERE id = $2", json.dumps(menus), r["id"])
            print(f"Updated role {r['id']} with new_employee: {menus}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(update_roles())
