# Production Deployment Guide & Operations Runbook

> **Target OS:** Ubuntu 22.04 / 24.04 LTS (x86_64 or ARM64)  
> **Target Cloud Providers:** AWS EC2, DigitalOcean, Hetzner, Google Cloud, Azure, or Qatar Local Datacenters (Ooredoo Cloud, Meeza, Malomatia)  
> **Repository Path:** `/var/www/view-engine`  
> **Application User:** `erpadmin`  
> **Web Server:** Nginx 1.24+ with Let's Encrypt TLS 1.3  
> **Application Runtime:** FastAPI (Python 3.10+) via Gunicorn + Uvicorn Workers  
> **Datastores:** PostgreSQL 16+ & Redis 7+ / DragonflyDB  

---

## Table of Contents
1. [Server Prerequisites & Base System Hardening](#1-server-prerequisites--base-system-hardening)
2. [Database & In-Memory Cache Setup](#2-database--in-memory-cache-setup)
3. [Python Backend Service Configuration](#3-python-backend-service-configuration)
4. [Frontend Production Build](#4-frontend-production-build)
5. [Nginx Reverse Proxy & Domain Configuration](#5-nginx-reverse-proxy--domain-configuration)
6. [SSL / TLS Configuration (Let's Encrypt)](#6-ssl--tls-configuration-lets-encrypt)
7. [Automated Backups & Maintenance Runbook](#7-automated-backups--maintenance-runbook)
8. [System Health Verification Checklist](#8-system-health-verification-checklist)

---

## 1. Server Prerequisites & Base System Hardening

### 1.1 Minimum Server Hardware Sizing
For standard production workloads (100–2,000 employees with 5–20 real-time biometric terminals):

| Resource | Minimum (Small Business) | Recommended (Mid-to-Large Enterprise) |
| :--- | :--- | :--- |
| **vCPU** | 2 Cores | 4–8 Cores |
| **RAM** | 4 GB | 8–16 GB |
| **Storage** | 40 GB NVMe SSD | 100+ GB NVMe SSD (RAID or EBS gp3) |
| **Network** | 1 Gbps port | 1 Gbps port with low latency to Qatar/GCC |

---

### 1.2 System Updates & Essential Tooling
Log in to your newly provisioned Ubuntu server as `root` via SSH:

```bash
# 1. Update package indices and upgrade existing packages
sudo apt update && sudo apt upgrade -y

# 2. Install core utilities, compilers, and required libraries
sudo apt install -y \
    build-essential \
    curl \
    wget \
    git \
    ufw \
    fail2ban \
    htop \
    unzip \
    software-properties-common \
    libpq-dev \
    python3-dev \
    python3-venv \
    python3-pip \
    pkg-config \
    openssl

# 3. Enable NTP time synchronization (Critical for ZKTeco punch pairing & TOTP 2FA)
sudo timedatectl set-timezone Asia/Qatar
sudo timedatectl set-ntp on
timedatectl status
```

---

### 1.3 Dedicated Non-Root Application User (`erpadmin`)
For security governance, never execute application processes as `root`. Create a dedicated service user named `erpadmin`:

```bash
# 1. Create the user with a home directory and bash shell
sudo adduser --gecos "" --disabled-password erpadmin

# 2. Grant sudo privileges
sudo usermod -aG sudo erpadmin

# 3. Add erpadmin to the web server group (www-data)
sudo usermod -aG www-data erpadmin

# 4. Configure SSH Key access for erpadmin
sudo mkdir -p /home/erpadmin/.ssh
sudo cp /root/.ssh/authorized_keys /home/erpadmin/.ssh/
sudo chown -R erpadmin:erpadmin /home/erpadmin/.ssh
sudo chmod 700 /home/erpadmin/.ssh
sudo chmod 600 /home/erpadmin/.ssh/authorized_keys

# 5. Lock down SSH configuration (Disable root login and password authentication)
sudo sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

---

### 1.4 UFW Firewall Hardening
Enforce strict ingress policies. Only SSH, HTTP, and HTTPS ports may be exposed. Datastores (PostgreSQL 5432 and Redis 6379) must **never** be accessible publicly:

```bash
# 1. Set default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 2. Allow SSH (port 22 or custom port if changed)
sudo ufw allow 22/tcp comment 'SSH Remote Access'

# 3. Allow Web Traffic (HTTP 80 and HTTPS 443)
sudo ufw allow 80/tcp comment 'HTTP / Let’s Encrypt ACME'
sudo ufw allow 443/tcp comment 'HTTPS / Web App & ADMS Device Push'

# 4. Explicitly reject external access to datastores
sudo ufw deny 5432/tcp comment 'Block PostgreSQL from Public Internet'
sudo ufw deny 6379/tcp comment 'Block Redis from Public Internet'

# 5. Enable the firewall
sudo ufw --force enable
sudo ufw status verbose
```

---

## 2. Database & In-Memory Cache Setup

```
┌─────────────────────────────────────────────────────────────────┐
│                      LOCAL SERVER BOUNDARY                      │
│                                                                 │
│   FastAPI App (8000) ──► PostgreSQL (127.0.0.1:5432)            │
│                       └► Redis Cache (127.0.0.1:6379)           │
│                                                                 │
│   * Zero external exposure for database or in-memory ports      │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.1 PostgreSQL 16+ Installation & Hardening

```bash
# 1. Add official PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# 2. Verify PostgreSQL is active
sudo systemctl status postgresql --no-pager
```

#### Provision Database & Service Account
Execute the following commands in the PostgreSQL CLI to provision `enterprise_db` and a dedicated user:

```bash
# Generate a cryptographically secure database password
DB_PASS=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-20)
echo "Generated PostgreSQL Password: $DB_PASS"

# Run PostgreSQL commands
sudo -u postgres psql <<EOF
-- Create the dedicated application database user
CREATE USER erp_user WITH ENCRYPTED PASSWORD '${DB_PASS}';

-- Create the relational database owned by erp_user
CREATE DATABASE enterprise_db OWNER erp_user;

-- Grant schema authorizations
\c enterprise_db
GRANT ALL ON SCHEMA public TO erp_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO erp_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO erp_user;
EOF
```

> [!IMPORTANT]
> Save the generated password securely. You will insert it into `/var/www/view-engine/.env` as `DATABASE_URL`.

#### Optimize PostgreSQL Performance (`/etc/postgresql/16/main/postgresql.conf`)
Open the configuration file and apply production tuning for standard 8 GB RAM servers:

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```

Adjust the following keys:
```ini
# Strictly bind to local loopback (No public internet access)
listen_addresses = '127.0.0.1'

# Connection Pooling Settings
max_connections = 100

# Memory Tuning (For 8GB RAM Server)
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 20MB
min_wal_size = 1GB
max_wal_size = 4GB
```

Restart PostgreSQL to apply changes:
```bash
sudo systemctl restart postgresql
sudo systemctl enable postgresql
```

---

### 2.2 Redis 7+ / DragonflyDB Setup & Password Hardening

```bash
# 1. Install standard Redis server
sudo apt install -y redis-server

# 2. Generate a secure Redis password
REDIS_PASS=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-20)
echo "Generated Redis Password: $REDIS_PASS"
```

#### Edit Configuration (`/etc/redis/redis.conf`)
```bash
sudo nano /etc/redis/redis.conf
```

Ensure the following parameters are strictly configured:
```ini
# Strictly bind to local loopback interface
bind 127.0.0.1 ::1
protected-mode yes
port 6379

# Enforce strong authentication
requirepass YourSecureRedisPasswordGoesHere

# Memory limits & eviction policy for sessions
maxmemory 512mb
maxmemory-policy volatile-lru

# Persistence settings (AOF enabled for session durability)
appendonly yes
appendfsync everysec
```

Restart and verify Redis:
```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Test authentication
redis-cli -a "YourSecureRedisPasswordGoesHere" ping
# Output must be: PONG
```

---

## 3. Python Backend Service Configuration

### 3.1 Clone the Codebase
Clone the platform into `/var/www/view-engine` and set directory ownership:

```bash
# 1. Create directory structure
sudo mkdir -p /var/www/view-engine
sudo chown -R erpadmin:www-data /var/www/view-engine

# 2. Clone repository as erpadmin
sudo -u erpadmin git clone https://github.com/your-org/view-engine.git /var/www/view-engine

# 3. Create persistent storage folders for encrypted vaults and system logs
sudo -u erpadmin mkdir -p /var/www/view-engine/storage/vault
sudo -u erpadmin mkdir -p /var/www/view-engine/storage/logs
sudo mkdir -p /var/log/erp
sudo chown -R erpadmin:www-data /var/log/erp
sudo chmod -R 775 /var/www/view-engine/storage
```

---

### 3.2 Python Virtual Environment & Dependencies
Initialize Python `.venv` and install production requirements:

```bash
cd /var/www/view-engine

# 1. Create Python 3 virtual environment
sudo -u erpadmin python3 -m venv .venv

# 2. Upgrade pip and build tools inside the venv
sudo -u erpadmin /var/www/view-engine/.venv/bin/pip install --upgrade pip setuptools wheel

# 3. Install core dependencies
sudo -u erpadmin /var/www/view-engine/.venv/bin/pip install -r backend/requirements.txt

# 4. Install Gunicorn production WSGI/ASGI runner
sudo -u erpadmin /var/www/view-engine/.venv/bin/pip install gunicorn uvicorn[standard]
```

---

### 3.3 Production Environment File (`.env`)
Generate an enterprise master encryption key and populate the `.env` file:

```bash
# Generate 32-byte hex key for AES-256-GCM file encryption at rest
MASTER_KEY=$(openssl rand -hex 32)

sudo -u erpadmin tee /var/www/view-engine/.env > /dev/null <<EOF
# ==============================================================================
# ENTERPRISE ERP PRODUCTION CONFIGURATION
# ==============================================================================
PROJECT_NAME="Enterprise View Engine Core"
APP_ENV=production
DEBUG=false
API_V1_STR=/api/v1

# ------------------------------------------------------------------------------
# PostgreSQL Connection (asyncpg Direct Binary Driver)
# ------------------------------------------------------------------------------
DATABASE_URL="postgresql://erp_user:YourDbPasswordHere@127.0.0.1:5432/enterprise_db"
DATABASE_POOL_MIN_SIZE=2
DATABASE_POOL_MAX_SIZE=10

# ------------------------------------------------------------------------------
# Redis Stateful Session & Fast Cache
# ------------------------------------------------------------------------------
REDIS_URL="redis://:YourRedisPasswordHere@127.0.0.1:6379/0"

# ------------------------------------------------------------------------------
# AES-256-GCM Master Key for Document Vault Encryption At Rest
# ------------------------------------------------------------------------------
FILE_ENCRYPTION_KEY="${MASTER_KEY}"

# ------------------------------------------------------------------------------
# Stateful Session Lifecycles
# ------------------------------------------------------------------------------
SESSION_IDLE_TIMEOUT_SECONDS=1800
SESSION_ABSOLUTE_MAX_SECONDS=28800

# ------------------------------------------------------------------------------
# Network Security & Reverse Proxy Trust
# ------------------------------------------------------------------------------
ALLOWED_CIDR_NETWORKS="127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,0.0.0.0/0"
TRUSTED_PROXIES="127.0.0.1,::1"

# ------------------------------------------------------------------------------
# Frontend Production URL Binding
# ------------------------------------------------------------------------------
VITE_API_BASE_URL="/api/v1"
EOF

# Restrict permissions so only erpadmin can read secrets
sudo chmod 600 /var/www/view-engine/.env
sudo chown erpadmin:www-data /var/www/view-engine/.env
```

---

### 3.4 Database Schema Initialization & Superadmin Seeding
Execute the database initialization script to seed tables, default system roles, salary rules, Qatar statutory leave tiers, and the default Superadmin:

```bash
cd /var/www/view-engine

# Run the seeding script via the virtual environment
sudo -u erpadmin /var/www/view-engine/.venv/bin/python seed_admin.py
```

Expected output:
```
PostgreSQL database pool initialized successfully.
Admin seed complete: admin@company.local / Admin@123
```

> [!WARNING]
> Immediately log in to the web console after deployment to change the default superadmin password (`Admin@123`) and enable TOTP 2FA.

---

### 3.5 Systemd Service Configuration (`erp-backend.service`)
Create a persistent Systemd unit running Gunicorn with Uvicorn workers:

```bash
sudo tee /etc/systemd/system/erp-backend.service > /dev/null <<EOF
[Unit]
Description=Enterprise ERP FastAPI Backend Service
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=erpadmin
Group=www-data
WorkingDirectory=/var/www/view-engine
EnvironmentFile=/var/www/view-engine/.env

# Gunicorn Multi-Worker Execution: (2 x vCPUs) + 1 workers
ExecStart=/var/www/view-engine/.venv/bin/gunicorn backend.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --access-logfile /var/log/erp/backend-access.log \
    --error-logfile /var/log/erp/backend-error.log

Restart=always
RestartSec=5s
KillMode=mixed

# Security Sandbox
PrivateTmp=true
ProtectSystem=full
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start the backend service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable erp-backend
sudo systemctl start erp-backend
sudo systemctl status erp-backend --no-pager
```

---

## 4. Frontend Production Build

The frontend is a single-page React 19 application compiled into optimized static HTML, CSS, and JS assets served directly by Nginx.

### 4.1 Install Node.js 20+ LTS via NodeSource

```bash
# 1. Install NodeSource repository for Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Verify versions
node -v   # Must output v20.x or v22.x
npm -v    # Must output 10.x+
```

---

### 4.2 Compile Frontend Assets (`/dist`)

```bash
cd /var/www/view-engine

# 1. Clean install NPM dependencies
sudo -u erpadmin npm ci

# 2. Compile optimized production bundle
sudo -u erpadmin npm run build

# 3. Verify that the production directory exists and contains index.html
ls -la /var/www/view-engine/dist
```

Ensure permissions allow Nginx to read the compiled files:
```bash
sudo chown -R erpadmin:www-data /var/www/view-engine/dist
sudo chmod -R 755 /var/www/view-engine/dist
```

---

## 5. Nginx Reverse Proxy & Domain Configuration

```
[ Browser / Mobile Client ] ──► HTTPS:443 ──┐
                                            │
[ ZKTeco ADMS Biometric ] ────► HTTP:80/443 ─┤
                                            │
                                            ▼
                             ┌─────────────────────────────┐
                             │       Nginx Web Server      │
                             └──────────────┬──────────────┘
                                            │
                   ┌────────────────────────┴────────────────────────┐
                   ▼                                                 ▼
      Static Assets & Routing                            API & Device Push
      /var/www/view-engine/dist                          http://127.0.0.1:8000
      try_files $uri $uri/ /index.html;                  (/api/ & /iclock/)
```

---

### 5.1 Nginx Installation
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

### 5.2 Server Block Configuration (`/etc/nginx/sites-available/erp.conf`)
Replace `erp.yourdomain.com` with your fully qualified domain name (FQDN):

```bash
sudo tee /etc/nginx/sites-available/erp.conf > /dev/null <<'EOF'
# Upstream definition for Gunicorn/Uvicorn cluster
upstream erp_backend {
    server 127.0.0.1:8000 fail_timeout=0;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name erp.yourdomain.com;

    # Root directory for compiled React frontend
    root /var/www/view-engine/dist;
    index index.html;

    # Maximum file upload limit (Allow 25MB encrypted documents)
    client_max_body_size 25M;

    # Logging
    access_log /var/log/nginx/erp-access.log;
    error_log /var/log/nginx/erp-error.log warn;

    # Gzip Compression (Optimized for GCC/Qatar networks)
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    # --------------------------------------------------------------------------
    # 1. FRONTEND STATIC ASSETS & CLIENT-SIDE SPA ROUTING
    # --------------------------------------------------------------------------
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Static Assets Cache (Vite hashes filenames in /assets/)
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, no-transform, immutable";
        access_log off;
    }

    # --------------------------------------------------------------------------
    # 2. REST API PROXY (FastAPI Backend)
    # --------------------------------------------------------------------------
    location /api/ {
        proxy_pass http://erp_backend;
        proxy_http_version 1.1;

        # WebSocket support (For intra-company chat and live telemetry)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Request headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for heavy reports & WPS batch generation
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        # Disable buffering for live streaming responses
        proxy_buffering off;
    }

    # --------------------------------------------------------------------------
    # 3. ZKTECO ADMS BIOMETRIC PUSH GATEWAY
    # --------------------------------------------------------------------------
    # Biometric clocks send push queries directly to /iclock/*
    location /iclock/ {
        proxy_pass http://erp_backend;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable proxy buffering for real-time punch ingestion
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 90s;
    }

    # --------------------------------------------------------------------------
    # 4. HARDENED ENTERPRISE SECURITY HEADERS
    # --------------------------------------------------------------------------
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
}
EOF
```

---

### 5.3 Enable Configuration & Test Nginx
```bash
# 1. Enable site configuration
sudo ln -sf /etc/nginx/sites-available/erp.conf /etc/nginx/sites-enabled/

# 2. Remove default Nginx welcome page
sudo rm -f /etc/nginx/sites-enabled/default

# 3. Test configuration syntax
sudo nginx -t

# 4. Reload Nginx
sudo systemctl reload nginx
```

---

## 6. SSL / TLS Configuration (Let's Encrypt)

Secure your deployment with automated, free TLS certificates using Certbot.

### 6.1 Obtain Let's Encrypt Certificate
Make sure your DNS `A` record for `erp.yourdomain.com` points to your cloud server's public IP address before running this step:

```bash
# 1. Install Certbot and the Nginx plugin
sudo apt install -y certbot python3-certbot-nginx

# 2. Run Certbot to acquire certificate and automatically update Nginx
sudo certbot --nginx -d erp.yourdomain.com --agree-tos --email admin@yourdomain.com --redirect
```

---

### 6.2 Modern TLS 1.3 Hardening
Certbot will inject SSL directives into `/etc/nginx/sites-available/erp.conf`. Verify that the SSL parameters use modern ciphers:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";

# Enable HTTP Strict Transport Security (HSTS)
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

---

### 6.3 Test Certificate Auto-Renewal
Certbot registers a systemd timer that renews certificates automatically before they expire:

```bash
# Verify timer status
sudo systemctl status certbot.timer --no-pager

# Perform a dry-run renewal test
sudo certbot renew --dry-run
```

---

## 7. Automated Backups & Maintenance Runbook

### 7.1 Automated Daily Encrypted Backup Script
Create `/usr/local/bin/erp-backup.sh` to execute daily automated backups of the PostgreSQL database and the AES-256 encrypted document vault:

```bash
sudo tee /usr/local/bin/erp-backup.sh > /dev/null <<'EOF'
#!/bin/bash
# ==============================================================================
# ENTERPRISE ERP AUTOMATED BACKUP SCRIPT (POSTGRESQL + ENCRYPTED VAULT)
# ==============================================================================

set -euo pipefail

BACKUP_DIR="/var/backups/erp"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=30

mkdir -p "${BACKUP_DIR}"

echo "[${TIMESTAMP}] Starting Enterprise ERP Backup..."

# 1. Backup PostgreSQL Database
PG_BACKUP_FILE="${BACKUP_DIR}/erp_db_${TIMESTAMP}.sql.gz"
sudo -u postgres pg_dump enterprise_db | gzip > "${PG_BACKUP_FILE}"
chmod 600 "${PG_BACKUP_FILE}"
echo "[OK] PostgreSQL dump saved: ${PG_BACKUP_FILE}"

# 2. Archive Encrypted Document Vault
VAULT_BACKUP_FILE="${BACKUP_DIR}/erp_vault_${TIMESTAMP}.tar.gz"
tar -czf "${VAULT_BACKUP_FILE}" -C /var/www/view-engine/storage vault
chmod 600 "${VAULT_BACKUP_FILE}"
echo "[OK] Document vault archived: ${VAULT_BACKUP_FILE}"

# 3. Prune Backups Older Than 30 Days
find "${BACKUP_DIR}" -type f -name "erp_*.gz" -mtime +${RETENTION_DAYS} -delete
echo "[OK] Pruned archives older than ${RETENTION_DAYS} days."

echo "[${TIMESTAMP}] Backup completed successfully."
EOF

# Make executable and restrict permissions
sudo chmod 700 /usr/local/bin/erp-backup.sh
```

---

### 7.2 Crontab Scheduling
Schedule the backup script to run automatically every night at 02:00 AM Qatar Time:

```bash
sudo crontab -l 2>/dev/null | grep -v "erp-backup.sh" | sudo crontab -
(sudo crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/erp-backup.sh >> /var/log/erp/backup.log 2>&1") | sudo crontab -
```

---

### 7.3 Operational Runbook: Updating the Application
When deploying code updates from Git:

```bash
# 1. Switch to application directory as erpadmin
cd /var/www/view-engine

# 2. Pull the latest code
sudo -u erpadmin git pull origin main

# 3. Update Python dependencies (if backend/requirements.txt changed)
sudo -u erpadmin /var/www/view-engine/.venv/bin/pip install -r backend/requirements.txt

# 4. Rebuild the frontend
sudo -u erpadmin npm ci
sudo -u erpadmin npm run build

# 5. Restart backend workers gracefully
sudo systemctl restart erp-backend

# 6. Reload Nginx
sudo systemctl reload nginx

echo "Deployment update completed successfully."
```

---

## 8. System Health Verification Checklist

Run these commands to verify that all platform services are running correctly:

### 1. Check Service Statuses
```bash
sudo systemctl status postgresql --no-pager
sudo systemctl status redis-server --no-pager
sudo systemctl status erp-backend --no-pager
sudo systemctl status nginx --no-pager
```

### 2. Verify FastAPI System Health Endpoint
```bash
curl -s http://127.0.0.1:8000/api/v1/system/status | jq .
```
Expected output:
```json
{
  "is_initialized": true,
  "database_connected": true,
  "status": "healthy"
}
```

### 3. Verify ZKTeco ADMS Biometric Handshake
Simulate a biometric clock handshake request against the local server:
```bash
curl -i "http://127.0.0.1:8000/iclock/cdata?SN=TEST-TERMINAL-01"
```
Expected output:
```http
HTTP/1.1 200 OK
content-type: text/plain; charset=utf-8

GET OPTION FROM: TEST-TERMINAL-01
Stamp=0
OpStamp=0
ErrorDelay=60
Delay=30
TransInterval=1
TransFlag=1111111111
Realtime=1
Encrypt=0
```

### 4. Monitor Live Service Logs
```bash
# Backend application logs
journalctl -u erp-backend -f -n 50

# Nginx access & error logs
tail -f /var/log/nginx/erp-access.log
tail -f /var/log/nginx/erp-error.log
```

---

> **DOCUMENT REVISION & SECURITY GOVERNANCE**  
> *Author: Lead Systems Architect*  
> *Approved for Production Deployments Across State of Qatar & GCC Cloud Infrastructures.*
