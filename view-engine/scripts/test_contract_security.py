import asyncio
import json
import httpx
import asyncpg
import uuid

BASE_URL = "http://127.0.0.1:8000"

async def run_tests():
    print("[1] Connecting to database to inspect test users and roles...")
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:5432/enterprise_db")
    
    # Check admin user
    admin_row = await conn.fetchrow("SELECT id, email, status, is_superadmin FROM users WHERE LOWER(email) = 'admin@company.local';")
    print(f"Admin user: {admin_row}")

    # Check roles
    roles = await conn.fetch("SELECT id, name, permissions FROM roles;")
    print("Configured roles count:", len(roles))
    for r in roles:
        p_raw = r["permissions"]
        perms = json.loads(p_raw) if isinstance(p_raw, str) else p_raw
        print(f"  Role '{r['name']}': security_groups = {perms.get('security_groups', [])}")

    # Verify or create a test user with ONLY hr.contracts_read (Auditor / Basic Admin)
    # Role: 'test_contracts_only_role'
    test_role_id = "role_contracts_reader"
    await conn.execute("""
        INSERT INTO roles (id, name, description, permissions)
        VALUES ($1, 'contracts_reader_role', 'Contracts Reader Only', $2::jsonb)
        ON CONFLICT (id) DO UPDATE SET permissions = $2::jsonb;
    """, test_role_id, '{"security_groups": ["hr.contracts_read"], "menu_access": ["contracts", "employees"]}')

    test_role = await conn.fetchrow("SELECT id FROM roles WHERE id = $1;", test_role_id)
    
    # Test user with this role
    import bcrypt
    hashed = bcrypt.hashpw(b"Reader@123", bcrypt.gensalt()).decode()
    test_user_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO users (id, email, password_hash, full_name, status, is_superadmin, role_id)
        VALUES ($1, 'reader@company.local', $2, 'Contracts Reader Staff', 'active', false, $3)
        ON CONFLICT (email) DO UPDATE SET password_hash = $2, role_id = $3, status = 'active', is_superadmin = false;
    """, test_user_id, hashed, test_role["id"])
    print("Created/updated test user: reader@company.local with role contracts_reader_role (only hr.contracts_read)")

    # Verify or create a test user with NO contracts permissions
    await conn.execute("""
        INSERT INTO users (id, email, password_hash, full_name, status, is_superadmin, role_id)
        VALUES ($1, 'no_contracts@company.local', $2, 'No Contract Staff', 'active', false, NULL)
        ON CONFLICT (email) DO UPDATE SET password_hash = $2, role_id = NULL, status = 'active', is_superadmin = false;
    """, str(uuid.uuid4()), hashed)
    print("Created/updated test user: no_contracts@company.local without permissions")

    await conn.close()

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        print("\n[2] Testing Superadmin Login...")
        login_res = await client.post("/api/v1/auth/login", json={
            "username": "admin@company.local",
            "password": "Admin@123",
            "totp_code": "123456"
        })
        print(f"Admin login status: {login_res.status_code}")
        if login_res.status_code != 200:
            print("Admin login error:", login_res.text)
            return
        admin_token = login_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        print("\n[3] Fetching Global Contracts as Superadmin (has all permissions)...")
        c_res = await client.get("/api/v1/contracts", headers=admin_headers)
        print(f"Contracts status: {c_res.status_code}")
        c_data = c_res.json()
        print(f"Found {len(c_data.get('contracts', []))} contracts")
        if c_data.get("contracts"):
            first_c = c_data["contracts"][0]
            print(f"Superadmin view: wage_base={first_c.get('wage_base')}, net_package_total={first_c.get('net_package_total')}")
            assert first_c.get("wage_base") is not None, "Superadmin should see unmasked wage_base"

        print("\n[4] Testing User with NO permissions (no_contracts@company.local)...")
        no_perm_login = await client.post("/api/v1/auth/login", json={
            "username": "no_contracts@company.local",
            "password": "Reader@123",
            "totp_code": "123456"
        })
        no_perm_token = no_perm_login.json()["access_token"]
        no_perm_headers = {"Authorization": f"Bearer {no_perm_token}"}
        forbidden_res = await client.get("/api/v1/contracts", headers=no_perm_headers)
        print(f"No perm user /api/v1/contracts status: {forbidden_res.status_code}")
        assert forbidden_res.status_code == 403, f"Expected 403, got {forbidden_res.status_code}"
        print("PASS: Access without hr.contracts_read is properly rejected with 403 Forbidden.")

        print("\n[5] Testing User with ONLY hr.contracts_read (reader@company.local)...")
        reader_login = await client.post("/api/v1/auth/login", json={
            "username": "reader@company.local",
            "password": "Reader@123",
            "totp_code": "123456"
        })
        reader_token = reader_login.json()["access_token"]
        reader_headers = {"Authorization": f"Bearer {reader_token}"}
        reader_res = await client.get("/api/v1/contracts", headers=reader_headers)
        print(f"Reader user /api/v1/contracts status: {reader_res.status_code}")
        assert reader_res.status_code == 200, f"Expected 200, got {reader_res.status_code}"
        reader_data = reader_res.json()
        if reader_data.get("contracts"):
            r_c = reader_data["contracts"][0]
            print(f"Reader view: wage_base={r_c.get('wage_base')}, allowances_total={r_c.get('allowances_total')}, net_package_total={r_c.get('net_package_total')}")
            assert r_c.get("wage_base") is None, "wage_base must be None for user lacking hr.salary_read"
            assert r_c.get("allowances_total") is None, "allowances_total must be None"
            assert r_c.get("deductions_total") is None, "deductions_total must be None"
            assert r_c.get("net_package_total") is None, "net_package_total must be None"
            print("PASS: Compensation figures are masked (None) when user lacks hr.salary_read.")

        print("\n[6] Testing Employee Contracts endpoint masking...")
        if c_data.get("contracts"):
            emp_id = c_data["contracts"][0]["employee_id"]
            emp_c_res = await client.get(f"/api/v1/employees/{emp_id}/contracts", headers=reader_headers)
            print(f"Reader employee contracts status: {emp_c_res.status_code}")
            assert emp_c_res.status_code == 200
            emp_c_data = emp_c_res.json()
            first_emp_c = emp_c_data["contracts"][0]
            assert first_emp_c.get("wage_base") is None, "wage_base must be None"
            assert first_emp_c.get("net_package_total") is None, "net_package_total must be None"
            for b in first_emp_c.get("benefit_lines", []):
                assert b.get("amount_value") is None, "amount_value in benefit line must be None"
                assert b.get("computed_monthly_total") is None, "computed_monthly_total in benefit line must be None"
            print("PASS: Employee contracts and all benefit line amounts are fully redacted for reader.")

        print("\n[7] Testing Audit Trail Logging on Contract Salary Update...")
        if c_data.get("contracts"):
            target_c = c_data["contracts"][0]
            target_id = target_c["id"]
            update_res = await client.put(f"/api/v1/contracts/{target_id}", json={
                "wage_base": 24500.0,
                "title": target_c["title"]
            }, headers=admin_headers)
            print(f"Admin update contract status: {update_res.status_code}")
            assert update_res.status_code == 200

            # Check audit logs in DB
            conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:5432/enterprise_db")
            audit_entry = await conn.fetchrow("""
                SELECT * FROM audit_logs 
                WHERE entity_type = 'contracts' AND entity_id = $1 
                ORDER BY created_at DESC LIMIT 1;
            """, target_id)
            print(f"Audit log entry found: action={audit_entry['action']}, note={audit_entry['note']}")
            assert audit_entry is not None, "Audit entry must exist"
            assert "Compensation modified" in audit_entry["note"] or "24500" in audit_entry["note"] or audit_entry["action"] == "UPDATE"
            print("PASS: Audit trail entry logged in audit_logs successfully.")
            await conn.close()

    print("\nALL CONTRACT SECURITY AND MASKING TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(run_tests())
