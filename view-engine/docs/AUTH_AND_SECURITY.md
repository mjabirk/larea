# Authentication, Access Control & Enterprise Security Architecture

---

## 1. Stateful In-Memory Session Engine

The platform departs from stateless JWTs in favor of **stateful, in-memory sessions** managed within **DragonflyDB / Redis**. This guarantees immediate revocation capabilities, concurrent device tracking, and mitigation of token-theft replay attacks.

### 1.1 Dual-Key Data Structure

Every authenticated user session is tracked across two coordinated key patterns in Redis:

```
+-------------------------------------------------------------------------------+
| REDIS KEY                     | TYPE | VALUE / CONTENTS                       |
+-------------------------------+------+----------------------------------------+
| session:<token>               | HASH | token, user_id, username, role,        |
|                               |      | department, client_ip, user_agent,     |
|                               |      | created_at, last_active, max_expiry    |
+-------------------------------+------+----------------------------------------+
| user_sessions:<user_id>       | SET  | Set of active session tokens belonging |
|                               |      | to this specific user ID               |
+-------------------------------+------+----------------------------------------+
```

#### Field Schema of `session:<token>`
```json
{
  "token": "Q1YIzusjdZx4nwkoEa-2UjFjSekJvPQv-na1RRahymg",
  "user_id": "eda7f19e-bf88-477b-8977-ce8741739f26",
  "username": "admin@company.local",
  "role": "Superadmin",
  "department": "Executive Administration",
  "client_ip": "127.0.0.1",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  "created_at": "1728676800",
  "last_active": "1728678200",
  "max_expiry": "1728705600"
}
```

### 1.2 Session Lifecycles: Rolling TTL & Absolute Expiration Cap

To balance security and operator convenience, sessions implement two complementary lifecycles:

1. **Rolling 30-Minute Idle Timeout:**
   - On creation, Redis sets an expiration of 1,800 seconds (`EXPIRE session:<token> 1800`).
   - Every authenticated request passing through `get_current_user_session` resets this TTL back to 1,800 seconds and updates `last_active`.
   - If a terminal sits inactive for 30 minutes, Redis automatically purges the session.
2. **Hard 8-Hour Absolute Lifetime Cap:**
   - Stored in the hash as `max_expiry = created_at + 28800`.
   - Even if activity is continuous, when `current_time > max_expiry`, the session is forcefully revoked. The user must re-authenticate to prevent indefinitely stale sessions.

### 1.3 Remote Session Revocation Architecture

```python
# Atomic Revocation of Single Session
async def revoke_session(token: str) -> bool:
    session_key = f"session:{token}"
    user_id = await redis_client.hget(session_key, "user_id")
    async with redis_client.pipeline(transaction=True) as pipe:
        await pipe.delete(session_key)
        if user_id:
            await pipe.srem(f"user_sessions:{user_id}", token)
        await pipe.execute()
    return True

# Revocation of All Other Sessions (Device Killswitch)
async def revoke_other_sessions(user_id: str, current_token: str) -> int:
    user_sessions_key = f"user_sessions:{user_id}"
    all_tokens = await redis_client.smembers(user_sessions_key)
    revoked_count = 0
    for token in all_tokens:
        if token != current_token:
            await redis_client.delete(f"session:{token}")
            await redis_client.srem(user_sessions_key, token)
            revoked_count += 1
    return revoked_count
```

---

## 2. PostgreSQL Row-Level Security (RLS)

PostgreSQL Row-Level Security provides defense-in-depth at the database layer. Even if an application bug omitted a tenant filter in a SQL `WHERE` clause, the PostgreSQL engine itself blocks access to rows outside the active tenant boundary.

### 2.1 Session Context Injection via `set_config`

FastAPI injects transaction-local parameters using the PostgreSQL `set_config` function with `is_local = true`:

```python
class DatabaseRLSHelper:
    @staticmethod
    async def set_rls_session_context(connection, user_id: str, tenant_id: str, role: str):
        """
        Injects local session context into the PostgreSQL transaction.
        'true' parameter ensures the configuration is scoped exclusively to this transaction.
        """
        query = """
        SELECT set_config('app.current_user_id', $1, true),
               set_config('app.current_tenant_id', $2, true),
               set_config('app.current_role', $3, true);
        """
        await connection.execute(query, str(user_id), str(tenant_id), str(role))
```

> **Why `SET LOCAL app.current_user_id = $1` was replaced:**
> PostgreSQL SQL grammar does not support prepared statement bind parameters (`$1, $2, ...`) inside `SET` or `SET LOCAL` statements. Using `SELECT set_config(..., true)` is the official, parameterized method to set runtime parameters safely without string formatting.

### 2.2 RLS Policy Examples

```sql
-- 1. Enable RLS on business tables
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_rosters ENABLE ROW LEVEL SECURITY;

-- 2. Define Tenant Boundary Policy
CREATE POLICY tenant_isolation_policy ON attendance_logs
FOR ALL
USING (
    -- Superadmin bypass
    current_setting('app.current_role', true) = 'role_superadmin'
    OR
    -- Tenant boundary match
    organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
);

-- 3. Define Branch Boundary Policy for Non-Supervisors
CREATE POLICY branch_isolation_policy ON shift_rosters
FOR ALL
USING (
    current_setting('app.current_role', true) IN ('role_superadmin', 'role_ops_lead')
    OR
    branch_id = NULLIF(current_setting('app.current_branch_id', true), '')::uuid
);
```

---

## 3. Multi-Tier RBAC & Access Control

Access control operates across three layers:
1. **Model-Level Permissions:** CRUD capabilities on business models.
2. **Menu-Level Navigation Groups:** Visibility of workspaces, sub-navbars, and command palette entries.
3. **In-App URL Gates:** Hard 403 Forbidden screens on URL-tampering.

### 3.1 `roles` Table Schema

```sql
CREATE TABLE roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE,
    description TEXT,
    badge_color VARCHAR(50) DEFAULT 'slate',
    is_system BOOLEAN DEFAULT false,
    permissions JSONB DEFAULT '{}'::jsonb,
    menu_access JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Model CRUD Matrix (`permissions` JSONB)
Each role defines granular model-level capabilities:
```json
{
  "attendance_logs": { "create": true, "read": true, "update": true, "delete": false },
  "organizations": { "create": false, "read": true, "update": false, "delete": false },
  "users": { "create": true, "read": true, "update": true, "delete": false }
}
```

### 3.3 Menu Navigation Security Groups (`menu_access` JSONB)
Sub-menus and workspace entries in `src/registry/moduleRegistry.js` define `required_groups`:
```javascript
{
  id: "hr",
  name: "Human Resources",
  menus: [
    {
      id: "attendances",
      label: "Attendance Logs",
      model: "attendance_logs",
      required_groups: ["hr.attendance_user", "hr.manager", "attendance.read"]
    },
    {
      id: "rosters",
      label: "Shift Rosters",
      model: "shift_rosters",
      required_groups: ["hr.roster_manager", "hr.manager", "attendance.write"]
    }
  ]
}
```

The active user role stores permitted menu IDs in `menu_access`:
```json
["attendances", "rosters", "terminals"]
```

### 3.4 Dynamic UI Filtering & 403 Forbidden URL Gate

- **Navigation Filtering:** `SubNavBar.jsx` and `CommandPalette.jsx` filter out menus where `hasMenuAccess(menu.id)` evaluates to `false`.
- **In-App 403 Forbidden Screen:** If a user directly types an unauthorized route into the browser address bar (e.g., `/?app=iam&menu=roles` while logged in as a standard user), the application maintains the route and renders a clean 403 Forbidden state:

```jsx
// src/App.jsx
!hasMenuAccess(activeMenuId) ? (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
    <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-500 mb-4">
      <ShieldAlert className="w-8 h-8" />
    </div>
    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
      403 Forbidden • Access Denied
    </h2>
    <p className="text-xs text-slate-500 mt-2">
      Access Denied: You do not have the required permissions for this menu.
    </p>
  </div>
) : (
  <WorkspaceRenderer />
)
```

---

## 4. Multi-Factor & Service Authentication

### 4.1 TOTP Two-Factor Authentication Flow

```
[ Stage 1: Credential Submission ]
  POST /api/v1/auth/login
  Body: { username: "admin", password: "..." }
        |
        v
  [ Valid Password & 2FA Enrolled ]
        |
        v
  Return Stage 1 Token:
  {
    "status": "2fa_required",
    "requires_2fa": true,
    "pending_token": "a8f3b29c...",   <-- Stored in Redis for 5 minutes
    "user_id": "..."
  }

[ Stage 2: Code Verification ]
  POST /api/v1/auth/2fa/verify
  Body: { pending_token: "...", totp_code: "482910" }
        |
        +-- 1. Rate Limit Check: max 5 attempts per minute per IP
        +-- 2. Retrieve user secret from PostgreSQL
        +-- 3. Verify TOTP code via PyOTP (+/- 30s drift window)
        +-- 4. TOTP Replay Prevention Check:
               Atomic SET in Redis:
               SET totp_used:<user_id>:<code_hash> "1" EX 90 NX
               - If key already exists: 401 Unauthorized (Replay detected)
               - If success: Issue full session token & delete pending_token
```

### 4.2 Headless API Key Engine (ADMS & Terminal Sync)

Headless biometric attendance devices (e.g. ZKTeco, Suprema) communicate without interactive user logins:
- **Hashing:** Keys are transmitted in HTTP headers (`X-API-Key`) and stored in Redis hashed with SHA-256 (`apikey:<hash>`).
- **Subnet Restriction:** Keys define specific permitted IP subnets. Requests originating outside the allowlist are denied.
- **Scope Scoping:** Keys specify limited scopes (e.g. `attendance:sync`, `terminals:heartbeat`).

---

## 5. Denial-of-Service & Input Hardening

1. **Bcrypt DoS Mitigation:**
   - The Bcrypt algorithm consumes exponential CPU cycles on oversized inputs and truncates at 72 bytes.
   - All password inputs are validated upfront: payloads exceeding 72 bytes are rejected with `400 Bad Request`.
   - Backend hashing routines safely slice inputs (`pwd.encode('utf-8')[:72]`).
2. **Atomic Rate Limiting:**
   - Integrated on sensitive routes (`/api/v1/auth/login`, `/api/v1/auth/2fa/verify`, `/api/v1/setup/init`).
   - Managed via Redis atomic counters with automatic window expiration.
