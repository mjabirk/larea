import requests

BASE_URL = "http://127.0.0.1:8000"
USER_ID = "c8677fb4-9d51-42d5-875c-206a4cde6a56"
USER_EMAIL = "Rec@mail.com"
USER_PASSWORD = "Rec@mail.com123"  # Update with rec@mail.com password

def run_security_checks():
    session = requests.Session()

    # 1. Authenticate as Standard User
    print(f"[*] Authenticating as {USER_EMAIL}...")
    login_resp = session.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"username": USER_EMAIL, "password": USER_PASSWORD}
    )
    if login_resp.status_code != 200:
        print(f"[!] Login failed ({login_resp.status_code}): {login_resp.text}")
        return

    token = login_resp.json().get("access_token")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    print("[+] Successfully authenticated. Bearer token acquired.")

    # -------------------------------------------------------------------------
    # Check 1: Privilege Escalation Prevention
    # -------------------------------------------------------------------------
    print("\n--- Check 1: Testing Privilege Escalation (PUT /api/v1/iam/users/{id}) ---")
    escalation_payload = {
        "full_name": "rec@mail.com",
        "email": USER_EMAIL,
        "is_superadmin": True  # Attempt unauthorized self-promotion
    }
    put_resp = session.put(
        f"{BASE_URL}/api/v1/iam/users/{USER_ID}",
        headers=headers,
        json=escalation_payload
    )

    print(f"Response Status: {put_resp.status_code}")
    print(f"Response Body:   {put_resp.text}")

    # Inspect the user profile to ensure is_superadmin was not granted
    me_resp = session.get(f"{BASE_URL}/api/v1/auth/me", headers=headers)
    user_state = me_resp.json()
    is_superadmin = user_state.get("is_superadmin", False)

    if put_resp.status_code in (400, 403) or not is_superadmin:
        print("[PASS] Check 1 Passed: Privilege escalation attempt was blocked or sanitized.")
        print(f"       Verified user status: is_superadmin = {is_superadmin}")
    else:
        print("[FAIL] Check 1 Failed: User was able to promote themselves to superadmin!")

    # -------------------------------------------------------------------------
    # Check 2: Path Traversal (LFI) File Attachment Prevention
    # -------------------------------------------------------------------------
    print("\n--- Check 2: Testing Path Traversal (POST /api/v1/mail/send) ---")
    mail_payload = {
        "to_addresses": ["test@example.com"],
        "subject": "Security Test",
        "body_html": "<p>Test</p>",
        "custom_attachments": [
            {
                "filename": ".env",
                "disk_path": ".env"  # Directory traversal targeting root secrets
            }
        ]
    }
    mail_resp = session.post(
        f"{BASE_URL}/api/v1/mail/send",
        headers=headers,
        json=mail_payload
    )

    print(f"Response Status: {mail_resp.status_code}")
    print(f"Response Body:   {mail_resp.text}")

    if mail_resp.status_code == 403:
        print("[PASS] Check 2 Passed: Server rejected unauthorized path traversal with 403 Forbidden.")
    elif mail_resp.status_code == 404:
        print("[PASS] Check 2 Passed: File path outside attachment boundaries was rejected.")
    else:
        print(f"[FAIL] Check 2 Failed: Expected 403 Forbidden, but received {mail_resp.status_code}.")

if __name__ == "__main__":
    run_security_checks()