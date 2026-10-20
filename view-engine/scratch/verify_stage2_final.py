import asyncio
import uuid
import httpx
from backend.core.database import init_db_pool, close_db_pool
from backend.core.session import SessionManager, init_redis, close_redis

BASE_URL = "http://127.0.0.1:8000"

async def main():
    pool = await init_db_pool()
    await init_redis()

    async with pool.acquire() as conn:
        admin_row = await conn.fetchrow("SELECT id, organization_id, branch_id FROM users WHERE is_superadmin = true LIMIT 1;")
        admin_id = admin_row["id"]
        org_id = admin_row["organization_id"]
        branch_id = admin_row["branch_id"]

    admin_token = await SessionManager.create_session(
        user_id=str(admin_id),
        user_data={
            "user_id": str(admin_id),
            "username": "admin@compliance.local",
            "role": "SUPERADMIN",
            "is_superadmin": True,
            "organization_id": str(org_id),
            "branch_id": str(branch_id),
            "permissions": {"*": True, "roles.manage": True, "roles.read": True}
        },
        client_ip="127.0.0.1",
        user_agent="TestClient/1.0"
    )

    headers = {"Authorization": f"Bearer {admin_token}"}

    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as client:
        print("=== 1. Testing Schema Metadata Endpoints ===")
        models = ['attendance', 'contracts', 'attendance_logs', 'employee_contracts']
        for model in models:
            res = await client.get(f"/api/v1/meta/views/{model}")
            assert res.status_code == 200, f"Failed for {model}: {res.status_code} {res.text}"
            data = res.json()
            assert "security_controls" in data, f"Missing security_controls in {model}"
            assert data["security_controls"]["maker_checker"] is True, f"maker_checker not true in {model}"
            buttons = data["views"]["form"]["statusbar"]["buttons"]
            button_actions = [b.get("action") for b in buttons]
            print(f"  ✓ {model}: title='{data.get('title')}', maker_checker={data['security_controls']['maker_checker']}, buttons={button_actions}")

        print("\n=== 2. Testing SoD Matrix Endpoint ===")
        res_sod = await client.get("/api/v1/iam/sod/matrix")
        assert res_sod.status_code == 200, f"SoD Matrix failed: {res_sod.status_code} {res_sod.text}"
        sod_rules = res_sod.json().get("rules", [])
        assert len(sod_rules) >= 4, f"Expected at least 4 rules, got {len(sod_rules)}"
        for r in sod_rules:
            print(f"  ✓ SoD Rule [{r.get('id')}]: {r.get('name')} (Risk: {r.get('risk_level')})")

        print("\n=== 3. Testing SoD Conflict Prevention on Roles ===")
        # Attempt to create conflicting role: banking vs payroll
        conflict_payload = {
            "name": "Toxic Combination Test Role",
            "description": "Attempting to combine vendor banking with payroll disbursement",
            "permissions": {
                "banking.manage": True,
                "payroll.approve": True
            }
        }
        res_conflict = await client.post("/api/v1/iam/roles", json=conflict_payload)
        assert res_conflict.status_code == 409, f"Expected 409 Conflict, got {res_conflict.status_code}: {res_conflict.text}"
        conflict_data = res_conflict.json()
        conflict_info = conflict_data.get("detail", conflict_data)
        assert conflict_info.get("error") == "SOD_CONFLICT", f"Expected error SOD_CONFLICT, got {conflict_data}"
        print(f"  ✓ Rejected conflicting role creation with 409 Conflict (Violation: {conflict_info.get('message')})")

        print("\n=== ALL STAGE 2 COMPLIANCE CHECKS PASSED SUCCESSFULLY ===")

    await close_redis()
    await close_db_pool()

if __name__ == "__main__":
    asyncio.run(main())
