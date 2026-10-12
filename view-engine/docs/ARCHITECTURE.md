# Enterprise ERP System Architecture & Technical Specifications

---

## 1. Executive Architectural Overview

The Enterprise ERP platform is a decoupled, high-performance, multi-tenant application built to satisfy tier-1 statutory compliance, security governance, and scalable operations. It leverages a **Server-Driven UI (SDUI)** engine, centralized relational persistence with **PostgreSQL**, high-throughput in-memory state management with **DragonflyDB / Redis**, and an asynchronous API layer driven by **FastAPI**.

### Core Design Principles

1. **Zero-Trust Multi-Tenancy:** Isolation begins at the network and connection levels. All database interactions enforce tenant and branch boundary policies through PostgreSQL Row-Level Security (RLS) contexts.
2. **Server-Driven UI (SDUI):** Frontend rendering engines are declarative. UI views (Lists, Forms, Graphs, Calendars, Pivots, Gantts) are dynamically driven by backend JSON schema contracts, eliminating brittle screen reimplementations.
3. **Decoupled Stateless Application Core with Stateful Fast-Cache:** The API tier remains stateless for horizontal scalability, while active sessions, 2FA tokens, and rate limits are managed in an in-memory key-value cache with rolling expiration.
4. **Statutory Compliance & Accessibility First:** Built-in GDPR Right-to-be-Forgotten workflows, localized data privacy governance, and strict adherence to **WCAG 2.1 AA** accessibility standards (including high-contrast color palettes, screen reader labels, and keyboard navigability).

---

## 2. Multi-Tenant Organizational Hierarchy

The platform implements an enterprise 4-tier tenancy model:

```
+-----------------------------------------------------------------------+
|                         System Superadmin                             |
|              (Cross-tenant platform oversight & IAM)                  |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                    Organizations (Legal Entities)                     |
|           - Legal Name, Tax/CR ID, Base Currency, Timezone            |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                     Branches (Operating Units)                        |
|             - Code, Physical Location, IP/CIDR Subnets                |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                     Departments & Business Roles                      |
|         - Attendance Rosters, RBAC Permissions, Security Groups       |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                           Identities & Users                          |
|             - Scoped records, Single-session or Multi-device          |
+-----------------------------------------------------------------------+
```

### Tenancy Isolation Rules
- **Organization Boundary:** Organizations share the physical database schema, but are cryptographically and logically segregated. Every table contains an `organization_id` foreign key.
- **Branch Boundary:** Operating branches represent physical sites or operational offices. Users, hardware terminals, and shift logs are partitioned by `branch_id`.
- **Cross-Organization Switcher:** Superadmins and authorized multi-tenant operators can switch active organizations via contextual session switching without re-authenticating.

---

## 3. Technology Stack Breakdown

```
+-------------------------------------------------------------------------------+
| LAYER                 | TECHNOLOGY             | VERSION  | PRIMARY ROLE      |
+-----------------------+------------------------+----------+-------------------+
| Frontend Engine       | React                  | 18 / 19  | Reactive UI Tree  |
| Build & Tooling       | Vite                   | 8.x      | HMR & Bundling    |
| CSS & Design Tokens   | Tailwind CSS (Slate)   | 4.x      | Design System     |
| Component Primitives  | Radix UI / Lucide      | 1.52+    | Accessible Icons  |
| API Backend           | FastAPI (Starlette)    | 0.115+   | Asynchronous HTTP |
| Database Driver       | asyncpg                | 0.29+    | Native Async PG   |
| Object Validation     | Pydantic v2            | 2.9+     | Strict Schema DTO |
| Fast Cache / Session  | DragonflyDB / Redis    | 8.x      | Stateful Sessions |
| Relational Storage    | PostgreSQL             | 16+      | RLS, ACID Data    |
| Security & Hashing    | Bcrypt + PyOTP         | 4.x/2.10 | Password & 2FA    |
+-----------------------+------------------------+----------+-------------------+
```

### Backend (`/backend`)
- **FastAPI Core:** Python asynchronous REST API featuring non-blocking route handlers and dependency injection for security gates, database connection leasing, and rate limiting.
- **asyncpg Pool:** Direct binary PostgreSQL protocol driver, providing native connection pooling, prepared statements, and transactional context injection.
- **Pydantic v2:** Input parsing, strict request payload validation, and serializable Data Transfer Objects (DTOs).

### Cache & Session Tier (`DragonflyDB / Redis`)
- **DragonflyDB / Redis:** High-throughput in-memory datastore running on port `6379`.
- **Responsibilities:**
  - Token-to-session hash lookup (`session:<token>`).
  - Active user session sets for concurrent device revocation (`user_sessions:<user_id>`).
  - Single-use TOTP replay prevention keys (`totp_used:<user_id>:<hash>`).
  - Atomic sliding-window rate limit counters (`ratelimit:<scope>:<ip>`).

### Relational Database Tier (`PostgreSQL 16+`)
- **Primary Database (`enterprise_db`):** Running on port `5432`.
- **Responsibilities:**
  - Core identities (`users`, `roles`, `organizations`, `branches`).
  - System metadata initialization flag (`system_metadata`).
  - Dynamic JSONB storage for model-level CRUD permission matrices and menu navigation access lists.
  - Native Row-Level Security (RLS) enforcement.

### Frontend (`/src`)
- **React Application Shell:** Single-Page Application (SPA) leveraging a modular 2-tier navigation model (App Launcher overlay + context-aware sub-navbar).
- **Client State Contexts:**
  - `AuthContext`: Backend-verified authentication lifecycle and session tokens.
  - `TenancyContext`: Organizations, operating branches, and multi-tenant switching.
  - `AccessControlContext`: Dynamic role definitions, CRUD matrices, and menu visibility gates.
  - `ThemeContext`: Dark/Light/System theme synchronization.
  - `LocaleContext`: Multilingual localization and RTL text direction.

---

## 4. End-to-End System Request Lifecycle

The diagram below outlines the full lifecycle of an authenticated request entering the ERP platform:

```
[ Browser / Client ]
         |
         | 1. HTTP Request (Bearer Token in Authorization header)
         v
[ Reverse Proxy / Nginx ]
         |
         | 2. Passes X-Forwarded-For & terminates TLS
         v
[ FastAPI Middleware: get_client_ip & Rate Limiting ]
         |
         |-- 3. Verify IP against TRUSTED_PROXIES & ALLOWED_CIDR_NETWORKS
         |-- 4. Check Redis Rate Limit: INCR ratelimit:<endpoint>:<ip> (Max 5/min)
         |
         v
[ Session Authentication Dependency: get_current_user_session ]
         |
         | 5. Query DragonflyDB: HGETALL session:<token>
         |    - If absent: 401 Unauthorized
         |    - If (now > max_expiry): Delete & 401 Unauthorized
         |    - If valid: EXPIRE session:<token> 1800 (Roll 30 min idle TTL)
         |
         v
[ asyncpg PostgreSQL Pool: acquire() ]
         |
         | 6. Inject RLS Session Context:
         |    SELECT set_config('app.current_user_id', $1, true),
         |           set_config('app.current_tenant_id', $2, true),
         |           set_config('app.current_role', $3, true);
         |
         v
[ Controller / Business Logic Execution ]
         |
         | 7. Execute Parameterized Query ($1, $2, ...)
         |    (PostgreSQL RLS filters out rows outside current tenant/branch)
         |
         v
[ Response Serializer: Pydantic DTO ]
         |
         | 8. Strip internal hashes & format JSON response
         v
[ React ViewEngine / SDUI Renderer ]
         |
         | 9. Updates DOM / Canvas (List, Form, Graph, Calendar, Pivot, Gantt)
```

---

## 5. Security & Accessibility Architecture

### WCAG 2.1 AA Compliance Architecture
- **Contrast Ratios:** Text across all views maintains a minimum 4.5:1 contrast ratio against light backgrounds (`#f8fafc`) and dark surfaces (`#0f172a`).
- **Focus Rings:** Interactive elements feature explicit, visible focus rings (`focus-visible:ring-2 focus-visible:ring-blue-500`).
- **Semantic ARIA Attributes:** All navigation overlays, modals, search palettes, and tables provide standard ARIA landmarks (`role="dialog"`, `role="region"`, `aria-expanded`, `aria-current="page"`).
- **Keyboard Navigation:** Full support for `Esc` (dismiss overlays/modals), `Ctrl + K` (open command palette), and arrow navigation across tables.

### GDPR Compliance Architecture
- **Right to be Forgotten (Art. 17):** Users can queue accounts for cryptographic pseudonymization and archival via `/api/v1/compliance/gdpr/request-deletion`.
- **Consent Governance:** Persistent non-blocking cookie and local storage banner (`CookieConsentBanner.jsx`) tracking explicit user consent.
- **Audit Metadata:** Statutory business modal with verified legal entity details, Tax/CR registry numbers, and Data Protection Officer (DPO) contact information.
