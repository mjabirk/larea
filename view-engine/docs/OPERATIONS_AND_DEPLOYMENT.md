# Operations, Deployment & Runbook Guide

## 1. Environment Configuration

All environment variables must be declared in a secure `.env` file at the root of the workspace. Below is the production reference specification.

### Production `.env.example`

```bash
# ==============================================================================
# ENTERPRISE ERP RUNTIME CONFIGURATION
# ==============================================================================

# Application Branding & Metadata
PROJECT_NAME="Enterprise View Engine Core"
APP_ENV=production                         # development | staging | production
DEBUG=false
API_V1_STR=/api/v1

# ------------------------------------------------------------------------------
# Persistent Storage: PostgreSQL 16+
# ------------------------------------------------------------------------------
# Format: postgresql://<user>:<password>@<host>:<port>/<dbname>
DATABASE_URL="postgresql://postgres:SecureDbSecret2026!@127.0.0.1:5432/enterprise_db"
DATABASE_POOL_MIN_SIZE=5
DATABASE_POOL_MAX_SIZE=25
DATABASE_TIMEOUT_SECONDS=30

# ------------------------------------------------------------------------------
# Fast In-Memory Cache: DragonflyDB / Redis 7+
# ------------------------------------------------------------------------------
# Format: redis://[:password@]host:port/db
REDIS_URL="redis://:RedisAuthSecret2026!@127.0.0.1:6379/0"

# ------------------------------------------------------------------------------
# Session Lifetime & Security Policies
# ------------------------------------------------------------------------------
# Rolling idle timeout in seconds (default: 1800s / 30 minutes)
SESSION_IDLE_TIMEOUT_SECONDS=1800

# Hard absolute session cap in seconds (default: 28800s / 8 hours)
SESSION_ABSOLUTE_MAX_SECONDS=28800

# ------------------------------------------------------------------------------
# Network Security & CIDR Subnets
# ------------------------------------------------------------------------------
# Permitted subnets for administrative and interactive browser access (comma-separated)
ALLOWED_CIDR_NETWORKS="127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

# Trusted Reverse Proxy IP addresses for X-Forwarded-For resolution
TRUSTED_PROXIES="127.0.0.1,::1,10.0.1.1"

# ------------------------------------------------------------------------------
# LDAP / Active Directory Integration (Optional Enterprise SSO)
# ------------------------------------------------------------------------------
LDAP_SERVER="ldap://ad.company.local:389"
LDAP_BASE_DN="DC=company,DC=local"
LDAP_DOMAIN="COMPANY"

# ------------------------------------------------------------------------------
# Frontend / Vite Configuration
# ------------------------------------------------------------------------------
VITE_API_BASE_URL="https://erp.company.local/api/v1"
VITE_ENABLE_MOCK_FALLBACK=false
```

---

## 2. Initialization Lifecycle & First-Run Setup Wizard

The platform implements a centralized, database-backed initialization lock to guarantee zero orphaned setups and prevent unauthorized re-initialization.

```
                     ┌─────────────────────────────┐
                     │   Browser Loads Web App     │
                     └──────────────┬──────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │ GET /api/v1/system/status   │
                     └──────────────┬──────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
          is_initialized: false               is_initialized: true
                  │                                   │
                  ▼                                   ▼
       ┌──────────────────────┐             ┌──────────────────┐
       │ Mount /setup Wizard  │             │ Mount Auth Login │
       └──────────┬───────────┘             └──────────────────┘
                  │ Submit Wizard
                  ▼
       ┌──────────────────────┐
       │ POST /api/v1/setup/init
       │ 1. Verify system_metadata key != 'true'
       │ 2. Create Organization, Branch, Superadmin
       │ 3. Hash admin password (Bcrypt max 72 bytes)
       │ 4. INSERT INTO system_metadata key='is_initialized', value='true'
       │ 5. Issue active Bearer session token
       └──────────────────────┘
```

### Safety & DoS Mitigations in `/setup/init`
1. **Database Lock (`system_metadata`):** If `system_metadata.is_initialized == 'true'`, the `/api/v1/setup/init` route terminates immediately with HTTP `400 Bad Request` ("System is already initialized").
2. **Boot Rate Limiter:** An atomic Redis counter (`ratelimit:setup:boot_count`) allows at most 3 initialization attempts per system boot.
3. **Bcrypt 72-Byte Truncation:** User and admin passwords are automatically clamped to 72 bytes prior to bcrypt hashing to eliminate long-string CPU-exhaustion DoS attacks.

---

## 3. Administrative CLI Recipes & Runbooks

These command-line recipes allow systems engineers to perform administrative actions directly against the database and DragonflyDB/Redis caches.

### 3.1 Resetting the Superadmin Password

If an administrator is locked out or credentials are lost, reset the password directly via PostgreSQL using Python's `bcrypt`:

```bash
# 1. Generate the bcrypt hash for the new password (e.g. 'Admin@123')
python -c "import bcrypt; print(bcrypt.hashpw(b'Admin@123', bcrypt.gensalt()).decode())"
```

Output:
```
$2b$12$e8V/F7mH0v9uVf6QzBq9Oe7V8X1F5kZ0e7...
```

```bash
# 2. Update the user password in PostgreSQL
psql -h localhost -U postgres -d enterprise_db -c "
UPDATE users 
SET password_hash = '\$2b\$12\$e8V/F7mH0v9uVf6QzBq9Oe7V8X1F5kZ0e7...'
WHERE email = 'admin@company.local' OR is_superadmin = true;
"
```

### 3.2 Terminating Active Sessions & Remote Session Revocation

To revoke all active sessions for a compromised user account or flush the entire token store:

```bash
# Flush specific user's active tokens:
# 1. Inspect active token hashes for user
redis-cli SMEMBERS "user_sessions:<user_uuid>"

# 2. Delete individual tokens
redis-cli DEL "session:<token_hash_1>" "session:<token_hash_2>"
redis-cli DEL "user_sessions:<user_uuid>"

# Emergency: Invalidate ALL user sessions across the cluster
redis-cli --eval - <<EOF
local keys = redis.call('keys', 'session:*')
for i=1,#keys,5000 do
    redis.call('del', unpack(keys, i, math.min(i+4999, #keys)))
end
return #keys
EOF
```

### 3.3 Inspecting Active Database Schema & Roles

```bash
# Check registered roles and permissions
psql -h localhost -U postgres -d enterprise_db -c "
SELECT id, name, is_system, jsonb_pretty(permissions) FROM roles;
"

# Check active tenant organizations and branches
psql -h localhost -U postgres -d enterprise_db -c "
SELECT o.legal_name, b.name as branch_name, b.code 
FROM organizations o 
JOIN branches b ON b.organization_id = o.id;
"
```

---

## 4. Production Deployment & Security Best Practices

### 4.1 Production Architecture Topology

```
┌────────────────────────────────────────────────────────┐
│               Public Internet / Corporate LAN           │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS (Port 443)
                           ▼
┌────────────────────────────────────────────────────────┐
│           Nginx / Traefik Reverse Proxy                │
│  - TLS Termination (TLS 1.3, HSTS)                     │
│  - Content-Security-Policy & Security Headers          │
│  - Static Asset Delivery (Vite /dist)                  │
│  - Rate Limiting (100 req/sec per IP)                  │
└────────────┬─────────────────────────────┬─────────────┘
             │ Proxy Pass (127.0.0.1:8000) │ Proxy Pass (/ws)
             ▼                             ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│     FastAPI Gunicorn      │ │     FastAPI WebSockets    │
│  (Uvicorn Workers: 4-8)   │ │   (Push Notifications)    │
└────────────┬──────────────┘ └────────────┬──────────────┘
             │                             │
             ├─────────────────────────────┤
             ▼                             ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│  DragonflyDB / Redis 7    │ │      PostgreSQL 16+       │
│  - Fast Session Cache     │ │  - Multi-tenant RLS       │
│  - Rolling Expirations    │ │  - Relational Integrity   │
└───────────────────────────┘ └───────────────────────────┘
```

### 4.2 Nginx Reverse Proxy Configuration Reference

```nginx
# /etc/nginx/sites-available/enterprise-erp.conf

upstream fastapi_backend {
    server 127.0.0.1:8000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 80;
    server_name erp.company.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name erp.company.local;

    # TLS Certificates
    ssl_certificate /etc/ssl/certs/erp.company.local.crt;
    ssl_certificate_key /etc/ssl/private/erp.company.local.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Enterprise Hardened Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:;" always;

    # Static Frontend Assets
    location / {
        root /var/www/enterprise-erp/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API Endpoints
    location /api/ {
        proxy_pass http://fastapi_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
}
```

### 4.3 Database Backup & Disaster Recovery

Run automated daily snapshots of the PostgreSQL database with point-in-time recovery (PITR):

```bash
# Daily Logical Dump
pg_dump -h 127.0.0.1 -U postgres -d enterprise_db -F c -b -v -f "/backups/enterprise_db_$(date +%Y%m%d_%H%M%S).dump"

# Encrypting Backup with OpenSSL AES-256
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in "/backups/enterprise_db_$(date +%Y%m%d_%H%M%S).dump" \
  -out "/backups/enterprise_db_$(date +%Y%m%d_%H%M%S).dump.enc" \
  -k "MasterBackupKey2026!"
```

---

## 5. Production Go-Live Verification Checklist

Prior to commissioning the system into full production operation, execute and sign off on each item:

- [ ] **1. HTTPS / TLS 1.3:** SSL certificate verified with A+ rating on SSL Labs; all HTTP traffic redirects to HTTPS.
- [ ] **2. Default Passwords Rotated:** Seed passwords (`Admin@123`, `InitPass@2026`) changed across all environments.
- [ ] **3. CIDR White-listing Verified:** `ALLOWED_CIDR_NETWORKS` rejects requests from unauthorized external subnets with HTTP `403`.
- [ ] **4. Rate Limiting Active:** Brute-force attacks against `/api/v1/auth/login` triggered HTTP `429 Too Many Requests` after threshold.
- [ ] **5. Stateful Session Eviction:** Tested remote session revocation via `/api/v1/auth/revoke_other_sessions` successfully invalidated secondary devices.
- [ ] **6. Database Connection Pooling:** Verified `asyncpg` min/max pools operate cleanly under simulated load without connection exhaustion.
- [ ] **7. RLS Isolation Validated:** Confirmed that non-superadmin users receive only their own tenant and branch records.
