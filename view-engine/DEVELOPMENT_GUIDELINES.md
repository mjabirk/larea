# Enterprise Development Guidelines & Quality Contract

> **Binding Contract**: This document defines the permanent architectural, security, performance, and maintainability standards for the View Engine Enterprise Core codebase.  
> Before and after designing, implementing, or modifying any module, endpoint, or user interface component, engineers and automated agents **must** review, adhere to, and strictly enforce the standards detailed below.

---

## 1. Architectural Blueprint

### 1.1 High-Performance Modular Monolith
The system is intentionally engineered as a **High-Performance Modular Monolith**. It unifies backend services, data access layers, asynchronous processing, and client presentation within clear internal boundaries:
- **Backend Core**: FastAPI (Python 3.10+) utilizing asynchronous I/O and ASGI concurrency.
- **Relational Data Layer**: PostgreSQL 16 accessed natively via the asynchronous, non-blocking `asyncpg` driver and connection pooling.
- **In-Memory Cache & Session State**: DragonflyDB / Redis (Redis protocol 5.1+ compatibility) via `redis.asyncio` for millisecond-latency session storage, sliding rate limiters, and real-time pub/sub.
- **Frontend Layer**: React 19 with Vite, TailwindCSS, and Server-Driven UI (SDUI) architecture dynamically generating forms and grids from declarative schemas.

```
+-------------------------------------------------------------------------+
|                              REACT 19 SPA                               |
|        (Server-Driven Views, Chat Dock, Realtime Notifications)         |
+------------------------------------+------------------------------------+
                                     | JSON / WebSocket
                                     v
+------------------------------------+------------------------------------+
|                         FASTAPI CORE (ASGI)                             |
|  +--------------------+  +-------------------+  +--------------------+  |
|  |  IAM & 2FA Engine  |  |  Attendance & ZK  |  | Payroll & WPS SIF  |  |
|  +--------------------+  +-------------------+  +--------------------+  |
|  +--------------------+  +-------------------+  +--------------------+  |
|  | Document Vault AES |  | Leave & EOSB Sync |  | Comms & Mail Hub   |  |
|  +--------------------+  +-------------------+  +--------------------+  |
+-------------------+--------------------------------+--------------------+
                    |                                |
                    v                                v
+-------------------+--------------+   +-------------+--------------------+
|      POSTGRESQL 16 (asyncpg)     |   |    DRAGONFLYDB / REDIS (Cache)   |
|  - 100% Parameterized Queries    |   |  - Rolling 30m / 8h Sessions     |
|  - Row-Level Security (RLS)      |   |  - Sliding-Window Rate Limiting  |
|  - Strict ACID Transactions      |   |  - WebSocket Pub/Sub Dispatch    |
+----------------------------------+   +----------------------------------+
```

### 1.2 Anti-Fragmentation Mandate
- **No Premature Microservice Fragmentation**: Domain logic (Identity, Contracts, Attendance, Payroll, Gratuity, Auditing, Documents) must reside within modular backend packages (`backend/api/v1/`, `backend/core/`).
- **Zero Distributed Consensus Overhead**: Do not introduce distributed consensus frameworks (e.g., Raft, Paxos, Kafka, ZooKeeper) or multi-service RPC meshes when ACID transactions and async in-memory messaging deliver greater throughput, deterministic testing, and zero network partition anomalies.

---

## 2. Security & Access Control

### 2.1 Zero Unprotected Business Routes
Every business endpoint without exception must authenticate and authorize incoming requests:
```python
@router.post("/example/action")
async def perform_action(
    payload: ActionPayload,
    session: Dict[str, Any] = Depends(get_current_user_session),
):
    require_permission(session, "domain.action_permission")
    ...
```
- **Session Injection**: Every API endpoint handling tenant, operational, or IAM data must declare `session: Dict[str, Any] = Depends(get_current_user_session)`.
- **Atomic Permission Enforcement**: Business routes must call `require_permission(session, "<permission_key>")`. Access must be denied with HTTP 403 Forbidden if the token lacks the permission and is not a superadmin.
- **Strictly Allowlisted Public Endpoints**: Only the following routes are exempt from user session dependency:
  1. `GET /healthz` (container orchestrator and load balancer liveness/readiness probe)
  2. `GET /api/v1/system/status` (bootstrap readiness verification)
  3. `POST /api/v1/setup/init` (first-run setup wizard; guarded by database initialized check and boot-count rate limiter)
  4. `POST /api/v1/auth/login` (credential authentication)
  5. `POST /api/v1/auth/2fa/verify` (two-factor authentication verification)
  6. `GET /api/v1/compliance/business-details` (statutory public registry metadata)

### 2.2 Strict Salary Confidentiality & Compensation Masking
Compensation data represents high-risk confidentiality assets.
- **Mandatory Masking Helper**: All compensation, unit rates, salary totals, and monetary deduction fields must be shielded behind `can_read_salary(session)`:
  ```python
  def can_read_salary(session: Dict[str, Any]) -> bool:
      if not session:
          return False
      if session.get("is_superadmin"):
          return True
      return bool(check_permission(session, "hr.salary_read") or check_permission(session, "hr.salary_manage"))
  ```
- **Supervisor Operational View**: Department managers, branch supervisors, and attendance officers must only view operational quantities:
  - Allowed: Worked hours, overtime hours, attendance dates, task trip units, leave days.
  - Prohibited / Redacted: Hourly rates, base salary, housing allowance, overtime pay QAR, penalty deduction QAR, net salaries, and EOSB settlement amounts.
- **Response Scrubbing**: When `not can_read_salary(session)`, all monetary attributes must be set to `None` or omitted before serialization.

### 2.3 Secrets Management & Environment Isolation
- **Strict `.env` Loading**: All sensitive credentials (`DATABASE_URL`, `REDIS_URL`, `FILE_ENCRYPTION_KEY`, `LDAP_PASSWORD`, `SMTP_PASSWORD`) must load exclusively via environment variables or `.env` through `pydantic-settings`:
  ```python
  model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
  ```
- **Startup Production Safeguard**: The application **must fail to start** (raising `RuntimeError`) if `APP_ENV != "development"` and any production secret uses an insecure fallback or default placeholder:
  ```python
  if settings.APP_ENV != "development":
      if not settings.FILE_ENCRYPTION_KEY or settings.FILE_ENCRYPTION_KEY == DEFAULT_INSECURE_FILE_KEY:
          raise RuntimeError("Insecure FILE_ENCRYPTION_KEY detected in non-development environment.")
  ```
- **No Hardcoded Keys**: Committing production credentials, private certificates, or cryptographic keys to version control is strictly prohibited.

### 2.4 Browser Security & Content Defense
- **OWASP Defense-in-Depth Headers**: The backend ASGI pipeline must attach security headers to every response:
  - `X-Content-Type-Options: nosniff` (prevents MIME confusion attacks)
  - `X-Frame-Options: SAMEORIGIN` (prevents clickjacking)
  - `X-XSS-Protection: 1; mode=block` (legacy filter activation)
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **Strict File Download Headers**: File exports (e.g., Qatar WPS `.sif` files, encrypted vault documents) must emit parameterized headers:
  - `Content-Disposition: attachment; filename="<sanitized_name>"`
  - `Access-Control-Expose-Headers: Content-Disposition, X-Vault-Decrypted`
- **Accessibility & Focus Rings**: Frontend components must maintain full keyboard accessibility and visible focus rings compliant with WCAG 2.1 AA (`focus:ring-2 focus:ring-amber-500 focus:outline-none`).

---

## 3. Data Integrity & High-Throughput Performance

### 3.1 100% Parameterized asyncpg Queries
- **Zero SQL String Concatenation**: Raw SQL string concatenation, f-strings, `.format()`, or `%` formatting inside database queries is strictly forbidden.
- **Native Bind Parameters**: All queries must utilize asyncpg positional parameters (`$1, $2, ...`):
  ```python
  # CORRECT:
  await conn.fetch("SELECT * FROM employees WHERE department_id = $1 AND status = $2;", dept_id, status)

  # FORBIDDEN:
  await conn.fetch(f"SELECT * FROM employees WHERE department_id = '{dept_id}';")
  ```

### 3.2 N+1 Query Elimination
- Loop-nested database lookups are prohibited.
- Foreign-key lookups and associations must be resolved using SQL `JOIN`s or batched using PostgreSQL array containment `ANY($1::uuid[])`:
  ```python
  # CORRECT: Batch fetch related records
  parent_ids = [r["id"] for r in parents]
  children = await conn.fetch("SELECT * FROM child_table WHERE parent_id = ANY($1::uuid[]);", parent_ids)
  ```

### 3.3 Transaction Safety & Connection Lifecycle
- **Multi-Step Write Atomicity**: All business workflows modifying multiple tables or rows (e.g., payroll batch generation, batch locking, payslip recalculations, and leave deduction syncs) must run within an explicit transaction:
  ```python
  async with pool.acquire() as conn:
      async with conn.transaction():
          batch = await conn.fetchrow("SELECT * FROM payroll_batches WHERE id = $1 FOR UPDATE;", b_uuid)
          await conn.execute("UPDATE payroll_batches SET status = 'locked' WHERE id = $1;", b_uuid)
          await conn.execute("UPDATE attendance_logs SET status = 'synced' WHERE ...;")
          await conn.execute("INSERT INTO audit_logs ...")
  ```
- **Connection Leak Prevention**: Never hold an `asyncpg` connection open during external network calls, file compression, PDF rendering, CSV string assembly, email dispatch, or HTTP response streaming. Fetch the data, commit the transaction, release the connection back to the pool, and then perform presentation formatting.

### 3.4 Idempotency & Rate Limiting
- **Attendance Double-Punch Suppression**: Terminal punch handlers and attendance log syncs must enforce a **120-second sliding debounce window**. Multiple check-in/out attempts from the same employee within 120 seconds must be safely de-duplicated.
- **Atomic Sliding Rate Limiters**: Authentication endpoints (`/api/v1/auth/login`, `/api/v1/auth/2fa/verify`, password reset) must enforce sliding rate limits stored in Redis/DragonflyDB via atomic `INCR` + `EXPIRE` commands.
- **Idempotent Mutations**: Database schema must employ unique indexes and `ON CONFLICT DO UPDATE` or `ON CONFLICT DO NOTHING` to guarantee safe replay of failed network requests.

---

## 4. Maintainability, Operations & Evolution

### 4.1 Unauthenticated Health Checks (`GET /healthz`)
The root application must provide a dedicated, unauthenticated health check endpoint:
- **PostgreSQL Pool Probe**: Executes `SELECT 1;`.
- **DragonflyDB / Redis Probe**: Executes `await redis.ping()`.
- **Response Contract**:
  - All dependencies UP: HTTP 200 `{"status": "healthy", "database": "up", "redis": "up", "timestamp": "..."}`
  - Any dependency DOWN: HTTP 503 `{"status": "unhealthy", "database": "down", "redis": "up", "timestamp": "..."}`

### 4.2 Predictable Database Evolution
- **Idempotent Schema Statements**: All schema migrations and bootstrap definitions must be idempotent:
  - `CREATE TABLE IF NOT EXISTS`
  - `ALTER TABLE <tbl> ADD COLUMN IF NOT EXISTS <col> <type>`
  - `CREATE INDEX IF NOT EXISTS`
- **Zero-Downtime Column Additions**: New columns must either be nullable or carry explicit default values.

### 4.3 Backup & Disaster Recovery Architecture
- **Daily Encrypted Database Dumps**: PostgreSQL dumps (`pg_dump -Fc`) must be executed daily, encrypted with AES-256 via GPG/OpenSSL, and synchronized to remote air-gapped storage with 30-day retention policies.
- **Encrypted File Vault Backups**: Storage volume archives for employee biometric files and document attachments (`FILE_ENCRYPTION_KEY`) must be versioned and archived daily.

### 4.4 Explicit Dependency Pinning
- **Backend**: Every package in `backend/requirements.txt` must specify explicit version boundaries (`fastapi>=0.115.0`, `asyncpg>=0.29.0`, `pydantic-settings>=2.5.0`).
- **Frontend**: `package.json` must pin major/minor versions without loose wildcards. Routine audit checks (`npm audit`, `pip-audit`) must be run to prevent upstream supply-chain vulnerabilities.

---

## 5. Development Review Checklist

Before opening a pull request or deploying changes, verify the following checklist:

- [ ] **Auth Guard**: Does every newly created business endpoint include `session: Dict[str, Any] = Depends(get_current_user_session)`?
- [ ] **RBAC / Permissions**: Is `require_permission(session, "...")` called before executing business logic?
- [ ] **Salary Masking**: Are monetary rates, bonuses, deductions, and wage totals masked behind `can_read_salary(session)`?
- [ ] **Parameterized SQL**: Are all SQL statements 100% parameterized with asyncpg `$1, $2, ...` tokens?
- [ ] **Transaction Wrapping**: Are multi-table updates encapsulated within `async with conn.transaction():`?
- [ ] **No Leaked Pool Connections**: Are database connections released before slow I/O, CSV formatting, or trigger dispatching?
- [ ] **Security Headers**: Does the endpoint inherit global nosniff, SAMEORIGIN, and secure Content-Disposition headers?
- [ ] **Health Probe Intact**: Does `GET /healthz` return HTTP 200 with active PostgreSQL and Redis?
- [ ] **Config Safeguards**: Does `backend/core/config.py` reject default encryption keys when `APP_ENV != "development"`?
- [ ] **Accessibility (WCAG 2.1 AA)**: Do all new UI controls feature proper focus rings, keyboard navigation, and semantic tags?
