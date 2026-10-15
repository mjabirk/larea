#!/usr/bin/env python3
import asyncio
import asyncpg
import json
import os

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/enterprise_db")

async def update_roles():
    print(f"Connecting to {DB_URL}...")
    conn = await asyncpg.connect(DB_URL)

    # 1. Update role_superadmin
    superadmin_perms = json.dumps({
        'attendance_logs': {'create': True, 'read': True, 'update': True, 'delete': True},
        'organizations': {'create': True, 'read': True, 'update': True, 'delete': True},
        'users': {'create': True, 'read': True, 'update': True, 'delete': True},
        'employees': {'create': True, 'read': True, 'update': True, 'delete': True},
        'employee_contracts': {'create': True, 'read': True, 'update': True, 'delete': True},
        'hr.contracts_read': True,
        'hr.contracts_manage': True,
        'hr.salary_read': True,
        'hr.salary_manage': True,
    })
    superadmin_menus = json.dumps(['employees', 'contracts', 'new_employee', 'attendances', 'rosters', 'users', 'roles', 'orgs', 'terminals', 'batches'])
    await conn.execute("""
        UPDATE roles 
        SET permissions = $1::jsonb, menu_access = $2::jsonb 
        WHERE id = 'role_superadmin';
    """, superadmin_perms, superadmin_menus)

    # 2. Update role_ops_lead
    ops_perms = json.dumps({
        'attendance_logs': {'create': True, 'read': True, 'update': True, 'delete': True},
        'organizations': {'create': False, 'read': True, 'update': True, 'delete': False},
        'users': {'create': True, 'read': True, 'update': True, 'delete': False},
        'employees': {'create': True, 'read': True, 'update': True, 'delete': True},
        'employee_contracts': {'create': True, 'read': True, 'update': True, 'delete': False},
        'hr.contracts_read': True,
        'hr.contracts_manage': True,
        'hr.salary_read': False,
        'hr.salary_manage': False,
    })
    ops_menus = json.dumps(['employees', 'contracts', 'new_employee', 'attendances', 'rosters', 'terminals'])
    await conn.execute("""
        UPDATE roles 
        SET permissions = $1::jsonb, menu_access = $2::jsonb 
        WHERE id = 'role_ops_lead';
    """, ops_perms, ops_menus)

    # 3. Update role_supervisor
    sup_perms = json.dumps({
        'attendance_logs': {'create': True, 'read': True, 'update': True, 'delete': False},
        'organizations': {'create': False, 'read': True, 'update': False, 'delete': False},
        'users': {'create': False, 'read': True, 'update': False, 'delete': False},
        'employees': {'create': False, 'read': True, 'update': True, 'delete': False},
        'employee_contracts': {'create': False, 'read': True, 'update': False, 'delete': False},
        'hr.contracts_read': True,
        'hr.contracts_manage': False,
        'hr.salary_read': False,
        'hr.salary_manage': False,
    })
    sup_menus = json.dumps(['employees', 'contracts', 'attendances', 'rosters'])
    await conn.execute("""
        UPDATE roles 
        SET permissions = $1::jsonb, menu_access = $2::jsonb 
        WHERE id = 'role_supervisor';
    """, sup_perms, sup_menus)

    # 4. Update role_standard
    std_perms = json.dumps({
        'attendance_logs': {'create': True, 'read': True, 'update': False, 'delete': False},
        'organizations': {'create': False, 'read': False, 'update': False, 'delete': False},
        'users': {'create': False, 'read': True, 'update': False, 'delete': False},
        'employees': {'create': False, 'read': True, 'update': False, 'delete': False},
        'employee_contracts': {'create': False, 'read': False, 'update': False, 'delete': False},
        'hr.contracts_read': False,
        'hr.contracts_manage': False,
        'hr.salary_read': False,
        'hr.salary_manage': False,
    })
    await conn.execute("""
        UPDATE roles 
        SET permissions = $1::jsonb 
        WHERE id = 'role_standard';
    """, std_perms)

    print("[SUCCESS] Roles successfully updated with contract permissions and menu access!")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(update_roles())
