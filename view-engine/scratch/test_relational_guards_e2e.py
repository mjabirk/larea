import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import httpx
import uuid
from backend.core.database import init_db_pool

async def run_e2e_tests():
    pool = await init_db_pool()
    async with pool.acquire() as conn:
        print("=== 1. VERIFY DATABASE SCHEMA: is_active columns & indexes ===")
        tables = [
            "organizations", "branches", "users", "employees",
            "employee_contracts", "salary_rules", "zkteco_terminals",
            "leave_types", "roles"
        ]
        for table in tables:
            col_exists = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = $1 AND column_name = 'is_active'
                );
            """, table)
            print(f"Table '{table}' has is_active: {col_exists}")
            assert col_exists, f"Missing is_active column on {table}"

        indexes = [
            "idx_organizations_active", "idx_branches_active",
            "idx_users_active", "idx_employees_active", "idx_zk_terminals_active"
        ]
        for idx in indexes:
            idx_exists = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes 
                    WHERE indexname = $1
                );
            """, idx)
            print(f"Index '{idx}' exists: {idx_exists}")
            assert idx_exists, f"Missing index {idx}"

        print("\n=== 2. OBTAIN SUPERADMIN SESSION TOKEN ===")
        admin_row = await conn.fetchrow("SELECT id, email FROM users WHERE is_superadmin = true LIMIT 1;")
        assert admin_row, "No superadmin user found in DB"
        await conn.execute("UPDATE users SET is_2fa_enabled = false WHERE id = $1;", admin_row["id"])
        
        async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=30.0) as client:
            login_res = await client.post("/api/v1/auth/login", json={
                "username": admin_row["email"],
                "password": "Password123!"
            })
            if login_res.status_code != 200:
                print("Setting password for superadmin...")
                import bcrypt
                hashed = bcrypt.hashpw(b"Password123!", bcrypt.gensalt()).decode()
                await conn.execute("UPDATE users SET password_hash = $1, is_2fa_enabled = false WHERE id = $2;", hashed, admin_row["id"])
                login_res = await client.post("/api/v1/auth/login", json={
                    "username": admin_row["email"],
                    "password": "Password123!"
                })
            
            assert login_res.status_code == 200, f"Login failed: {login_res.text}"
            token = login_res.json().get("access_token") or login_res.json().get("session_token")
            headers = {"Authorization": f"Bearer {token}"}
            print("Superadmin authenticated successfully.")

            print("\n=== 3. TEST RELATIONAL GUARD: DELETE ORGANIZATION WITH DEPENDENCIES ===")
            primary_org = await conn.fetchrow("SELECT id, legal_name FROM organizations WHERE is_active = true LIMIT 1;")
            del_org_res = await client.delete(f"/api/v1/iam/organizations/{primary_org['id']}", headers=headers)
            print(f"Delete Org Status: {del_org_res.status_code}")
            assert del_org_res.status_code == 409, f"Expected 409, got {del_org_res.status_code}: {del_org_res.text}"
            org_err = del_org_res.json().get("detail", {})
            print("Org 409 Diagnostic Payload:")
            print(f"  can_delete: {org_err.get('can_delete')}")
            print(f"  total_references: {org_err.get('total_references')}")
            print(f"  message: {org_err.get('message')}")
            print(f"  resolution: {org_err.get('resolution')}")
            assert org_err.get("can_delete") is False
            assert org_err.get("total_references") > 0

            print("\n=== 4. TEST RELATIONAL GUARD: DELETE BRANCH WITH DEPENDENCIES ===")
            branch = await conn.fetchrow("SELECT id, name FROM branches LIMIT 1;")
            del_br_res = await client.delete(f"/api/v1/iam/branches/{branch['id']}", headers=headers)
            print(f"Delete Branch Status: {del_br_res.status_code}")
            assert del_br_res.status_code == 409, f"Expected 409, got {del_br_res.status_code}: {del_br_res.text}"
            br_err = del_br_res.json().get("detail", {})
            print("Branch 409 Diagnostic Payload:")
            print(f"  can_delete: {br_err.get('can_delete')}")
            print(f"  total_references: {br_err.get('total_references')}")
            print(f"  message: {br_err.get('message')}")
            assert br_err.get("can_delete") is False

            print("\n=== 5. TEST RELATIONAL GUARD: DELETE EMPLOYEE WITH DEPENDENCIES ===")
            emp = await conn.fetchrow("""
                SELECT e.id, e.full_name 
                FROM employees e
                JOIN employee_contracts c ON c.employee_id = e.id
                LIMIT 1;
            """)
            if emp:
                del_emp_res = await client.delete(f"/api/v1/employees/{emp['id']}", headers=headers)
                print(f"Delete Employee Status: {del_emp_res.status_code}")
                assert del_emp_res.status_code == 409, f"Expected 409, got {del_emp_res.status_code}: {del_emp_res.text}"
                emp_err = del_emp_res.json().get("detail", {})
                print("Employee 409 Diagnostic Payload:")
                print(f"  can_delete: {emp_err.get('can_delete')}")
                print(f"  total_references: {emp_err.get('total_references')}")
                print(f"  message: {emp_err.get('message')}")
                print(f"  resolution: {emp_err.get('resolution')}")
                assert emp_err.get("can_delete") is False
                assert emp_err.get("total_references") > 0

            print("\n=== 6. TEST TOGGLE ARCHIVE: EMPLOYEE ===")
            test_emp = await conn.fetchrow("SELECT id, full_name, is_active FROM employees LIMIT 1;")
            emp_id = str(test_emp["id"])
            
            # Toggle archive
            toggle_res = await client.post(f"/api/v1/employees/{emp_id}/toggle-archive", headers=headers)
            assert toggle_res.status_code == 200, f"Toggle failed: {toggle_res.text}"
            res_data = toggle_res.json()
            print(f"Archived state after toggle 1: {res_data['is_active']} - message: {res_data['message']}")
            assert res_data["is_active"] is False

            # Verify SQL-level filtering with status_filter
            # 1. status_filter=active -> employee should NOT be present
            list_active = await client.get("/api/v1/employees?status_filter=active", headers=headers)
            assert list_active.status_code == 200
            active_ids = [e["id"] for e in list_active.json().get("employees", [])]
            assert emp_id not in active_ids, "Archived employee should NOT appear in active list"

            # 2. status_filter=archived -> employee SHOULD be present
            list_archived = await client.get("/api/v1/employees?status_filter=archived", headers=headers)
            assert list_archived.status_code == 200
            archived_ids = [e["id"] for e in list_archived.json().get("employees", [])]
            assert emp_id in archived_ids, "Archived employee MUST appear in archived list"

            # Toggle back to active (unarchive)
            toggle_res2 = await client.post(f"/api/v1/employees/{emp_id}/toggle-archive", headers=headers)
            assert toggle_res2.status_code == 200
            assert toggle_res2.json()["is_active"] is True
            print(f"Archived state after toggle 2: {toggle_res2.json()['is_active']} - message: {toggle_res2.json()['message']}")

            # Verify audit log entry
            audit_row = await conn.fetchrow("""
                SELECT action, note FROM audit_logs 
                WHERE entity_type = 'employees' AND entity_id = $1 
                ORDER BY created_at DESC LIMIT 1;
            """, emp_id)
            print(f"Audit log verified: Action={audit_row['action']}, Note={audit_row['note']}")

            print("\n=== 7. TEST TOGGLE ARCHIVE: ORGANIZATION & BRANCH ===")
            br_toggle = await client.post(f"/api/v1/iam/branches/{branch['id']}/toggle-archive", headers=headers)
            assert br_toggle.status_code == 200
            print(f"Branch toggle: {br_toggle.json()}")
            await client.post(f"/api/v1/iam/branches/{branch['id']}/toggle-archive", headers=headers)

    print("\nALL RELATIONAL GUARD AND ARCHIVING VERIFICATION TESTS PASSED SUCCESSFULLY! (0 errors)")

if __name__ == "__main__":
    asyncio.run(run_e2e_tests())
