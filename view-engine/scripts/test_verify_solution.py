#!/usr/bin/env python3
import urllib.request
import urllib.error
import json
import uuid

BASE_URL = "http://localhost:8000"

def request_json(url, method="GET", headers=None, data=None):
    if headers is None:
        headers = {}
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            resp_body = response.read().decode("utf-8")
            return status_code, json.loads(resp_body) if resp_body else {}
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(resp_body)
        except Exception:
            parsed = {"error": resp_body}
        return e.code, parsed

def run_tests():
    print("=== Testing Enterprise View Engine Contract & Auth Architecture ===")
    
    # 1. Login as superadmin
    login_payload = {
        "username": "admin@company.local",
        "password": "Admin@123"
    }
    print(f"[*] Logging in as {login_payload['username']}...")
    status, login_data = request_json(f"{BASE_URL}/api/v1/auth/login", method="POST", data=login_payload)
    assert status == 200, f"Login failed ({status}): {login_data}"
    
    session_token = None
    if login_data.get("status") == "2fa_required":
        print("[*] 2FA required, verifying TOTP code 123456...")
        verify_payload = {
            "pending_token": login_data["pending_token"],
            "totp_code": "123456"
        }
        v_status, v_data = request_json(f"{BASE_URL}/api/v1/auth/2fa/verify", method="POST", data=verify_payload)
        assert v_status == 200, f"2FA verification failed ({v_status}): {v_data}"
        session_token = v_data.get("access_token")
    else:
        session_token = login_data.get("access_token")
        
    assert session_token, "No session token obtained!"
    print(f"[✓] Successfully authenticated! Session token: {session_token[:15]}...")
    
    auth_headers = {
        "Authorization": f"Bearer {session_token}"
    }
    
    # 2. Get Employees
    print("[*] Fetching employees list...")
    emp_status, emp_data = request_json(f"{BASE_URL}/api/v1/employees", headers=auth_headers)
    assert emp_status == 200, f"Failed to get employees ({emp_status}): {emp_data}"
    employees = emp_data.get("employees", [])
    assert len(employees) > 0, "No employees found to test!"
    test_emp = employees[0]
    emp_id = test_emp["id"]
    print(f"[✓] Found employee: {test_emp.get('full_name')} ({emp_id})")
    
    # 3. Test unauthenticated contract creation -> must fail with 401
    print("[*] Verifying unauthenticated contract creation returns 401...")
    contract_payload = {
        "title": "Automated Test Contract",
        "contract_reference": f"TEST-CNT-{uuid.uuid4().hex[:6].upper()}",
        "start_date": "2026-10-15",
        "end_date": "2027-10-14",
        "wage_base": 25000.0,
        "currency": "QAR",
        "status": "draft",
        "notice_period_days": 30,
        "trial_period_days": 90,
        "working_hours_per_week": 40.0,
        "terms_notes": "Test contract lifecycle"
    }
    unauth_status, unauth_data = request_json(f"{BASE_URL}/api/v1/employees/{emp_id}/contracts", method="POST", data=contract_payload)
    print(f"[*] Unauthenticated response status: {unauth_status}, detail: {unauth_data.get('detail')}")
    assert unauth_status == 401, f"Expected 401, got: {unauth_status}"
    print("[✓] Unauthenticated request correctly rejected with 401 Unauthorized!")
    
    # 4. Test authenticated contract creation -> must succeed with 200/201
    print("[*] Creating contract with Authorization Bearer token...")
    auth_create_status, created_contract = request_json(
        f"{BASE_URL}/api/v1/employees/{emp_id}/contracts",
        method="POST",
        headers=auth_headers,
        data=contract_payload
    )
    assert auth_create_status in [200, 201], f"Contract creation failed ({auth_create_status}): {created_contract}"
    contract_id = created_contract["id"]
    print(f"[✓] Contract created successfully! ID: {contract_id}, Ref: {created_contract.get('contract_reference')}")
    
    # 5. Verify contract listed in employee contracts
    print(f"[*] Fetching contracts for employee {emp_id} with Authorization Bearer header...")
    list_status, list_data = request_json(f"{BASE_URL}/api/v1/employees/{emp_id}/contracts", headers=auth_headers)
    assert list_status == 200, f"Failed to list employee contracts ({list_status}): {list_data}"
    contracts_list = list_data.get("contracts", [])
    matching = [c for c in contracts_list if c["id"] == contract_id]
    assert len(matching) > 0, "Created contract not found in list!"
    print(f"[✓] Created contract verified in employee contracts list ({len(contracts_list)} total contracts)")
    
    # 6. Test activating contract
    print(f"[*] Activating contract {contract_id} with Authorization Bearer header...")
    act_status, activated_data = request_json(
        f"{BASE_URL}/api/v1/contracts/{contract_id}/activate",
        method="POST",
        headers=auth_headers
    )
    assert act_status == 200, f"Failed to activate contract ({act_status}): {activated_data}"
    assert activated_data.get("status") == "active", f"Contract status not active: {activated_data}"
    print(f"[✓] Contract successfully activated! Status: {activated_data.get('status')}")
    
    # 7. Test global contracts endpoint
    print("[*] Fetching global contracts from /api/v1/contracts with Authorization Bearer header...")
    global_status, global_data = request_json(f"{BASE_URL}/api/v1/contracts", headers=auth_headers)
    assert global_status == 200, f"Failed to fetch global contracts ({global_status}): {global_data}"
    global_contracts = global_data.get("contracts", [])
    print(f"[✓] Global contracts endpoint succeeded! ({len(global_contracts)} contracts returned)")
    
    print("\n============================================================")
    print("ALL API CONTRACT AUTHENTICATION & LIFECYCLE TESTS PASSED! ✓")
    print("============================================================")

if __name__ == "__main__":
    run_tests()
