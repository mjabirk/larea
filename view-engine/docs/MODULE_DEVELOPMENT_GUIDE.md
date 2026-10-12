# Developer Guide: Building & Registering Custom Business Modules

This tutorial provides an end-to-end walkthrough for creating and registering a production-grade business module in the Enterprise ERP View Engine platform.

As a reference example, we will implement an **Asset Management (`assets`)** module that tracks corporate hardware, serial numbers, warranty lifecycles, and custody assignments across multiple branches and tenant organizations.

---

## Architecture Flow for New Modules

```
┌────────────────────────────────────────────────────────────────────────┐
│  Step 1: PostgreSQL DDL Migration & Row-Level Security (RLS)           │
│  - UUID Primary Keys, Tenant & Branch FKs, Audit Timestamps            │
│  - Branch isolation RLS policies                                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2: FastAPI Controller & API Routes (`/api/v1/assets/`)           │
│  - Pydantic v2 schemas for payload validation                          │
│  - Session authentication & RBAC permission dependency injection       │
│  - Context injection: `SELECT set_config('app.current_user_id', ...)` │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 3: Declarative SDUI Schema (`public/schemas/asset_schema.json`)   │
│  - Field types, widgets, validation constraints                        │
│  - List View, 70/30 Form View, Graph Analytics, and Calendar Views     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 4: Module Registry Integration (`src/registry/moduleRegistry.js`)│
│  - App card configuration (Icon, Color, Description)                   │
│  - Sub-menus and `required_groups` access guards                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 5: RBAC Security Groups & Role Seeding                           │
│  - Define model permissions (`assets`: create, read, update, delete)   │
│  - Add menu groups (`assets.user`, `assets.manager`) to system roles   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 6: End-to-End Verification Checklist                             │
│  - App Launcher (9-dot) render & Command Palette (`Ctrl+K`) search     │
│  - RBAC gate enforcement (403 Forbidden checks)                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Database Migration & Model Definition

Every entity in the platform must support multi-tenancy, branch partitioning, and complete audit tracking.

### 1.1 Create the Database Table

Execute the following DDL migration in PostgreSQL (or add it to `backend/core/database.py` inside `init_schema()`):

```sql
-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Asset Management Table
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    asset_tag VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- e.g. 'Laptop', 'Server', 'Biometric Terminal'
    serial_number VARCHAR(100),
    purchase_date DATE,
    purchase_cost NUMERIC(12, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'in_service', 'maintenance', 'retired'
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    last_modified_by UUID REFERENCES users(id)
);

-- Fast Lookups & Foreign Key Indices
CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_assets_branch ON assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
```

### 1.2 Enable Row-Level Security (RLS)

Isolate assets strictly to the active user's tenant organization and authorized branch:

```sql
-- Enable RLS on the table
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policy (Superadmins bypass, standard users restricted)
CREATE POLICY assets_tenant_isolation_policy ON assets
    AS RESTRICTIVE
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
              AND (
                  u.is_superadmin = true 
                  OR u.organization_id = assets.organization_id
              )
        )
    );

-- Branch Isolation Policy (Standard users only see assets in their branch)
CREATE POLICY assets_branch_isolation_policy ON assets
    AS RESTRICTIVE
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
              AND (
                  u.is_superadmin = true 
                  OR u.branch_id IS NULL 
                  OR assets.branch_id IS NULL
                  OR u.branch_id = assets.branch_id
              )
        )
    );
```

---

## Step 2: Backend API Routes & Controller

Create FastAPI routes adhering to asyncpg connection pooling, session validation, and permission checks.

### 2.1 Define Pydantic Schemas

```python
# backend/schemas/asset.py
from typing import Optional
from pydantic import BaseModel, Field
import uuid
import datetime

class AssetBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    category: str = Field(..., min_length=2, max_length=100)
    serial_number: Optional[str] = None
    purchase_date: Optional[datetime.date] = None
    purchase_cost: Optional[float] = 0.0
    status: Optional[str] = "draft"
    branch_id: Optional[uuid.UUID] = None
    assigned_user_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None

class AssetCreate(AssetBase):
    asset_tag: str = Field(..., min_length=3, max_length=50)

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[datetime.date] = None
    purchase_cost: Optional[float] = None
    status: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    assigned_user_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None

class AssetResponse(AssetBase):
    id: uuid.UUID
    asset_tag: str
    organization_id: uuid.UUID
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True
```

### 2.2 Implement FastAPI Endpoints

```python
# backend/routes/assets.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
import uuid

from backend.core.database import get_db_pool
from backend.core.auth_suite import DatabaseRLSHelper
from backend.main import get_current_user_session
from backend.schemas.asset import AssetCreate, AssetUpdate, AssetResponse

router = APIRouter(prefix="/api/v1/assets", tags=["Assets"])

def require_asset_permission(action: str):
    """Dependency verifying user has permissions for model 'assets'"""
    async def permission_checker(session: Dict[str, Any] = Depends(get_current_user_session)):
        if session.get("is_superadmin"):
            return session
            
        role_id = session.get("role_id")
        pool = get_db_pool()
        async with pool.acquire() as conn:
            perms = await conn.fetchval(
                "SELECT permissions FROM roles WHERE id = $1", role_id
            )
            model_perms = (perms or {}).get("assets", {})
            if not model_perms.get(action):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing '{action}' permission on assets."
                )
        return session
    return permission_checker

@router.get("/", response_model=List[Dict[str, Any]])
async def list_assets(
    session: Dict[str, Any] = Depends(require_asset_permission("read"))
):
    user_id = session["user_id"]
    pool = get_db_pool()
    
    async with pool.acquire() as conn:
        # 1. Inject PostgreSQL RLS context
        await DatabaseRLSHelper.inject_session_context(conn, user_id)
        
        # 2. Query isolated records
        rows = await conn.fetch("""
            SELECT id, asset_tag, name, category, serial_number, 
                   purchase_date, purchase_cost, status, branch_id, 
                   assigned_user_id, notes, created_at
            FROM assets
            ORDER BY created_at DESC
        """)
        return [dict(r) for r in rows]

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_asset(
    payload: AssetCreate,
    session: Dict[str, Any] = Depends(require_asset_permission("create"))
):
    user_id = session["user_id"]
    org_id = session["organization_id"]
    asset_id = uuid.uuid4()
    pool = get_db_pool()
    
    async with pool.acquire() as conn:
        await DatabaseRLSHelper.inject_session_context(conn, user_id)
        
        await conn.execute("""
            INSERT INTO assets (
                id, organization_id, branch_id, asset_tag, name, 
                category, serial_number, purchase_date, purchase_cost, 
                status, assigned_user_id, notes, created_by, last_modified_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
        """, 
            asset_id, uuid.UUID(org_id), payload.branch_id, payload.asset_tag,
            payload.name, payload.category, payload.serial_number, payload.purchase_date,
            payload.purchase_cost, payload.status or 'draft', payload.assigned_user_id,
            payload.notes, uuid.UUID(user_id)
        )
        
    return {"status": "success", "asset_id": str(asset_id)}
```

Mount this router in `backend/main.py`:
```python
from backend.routes.assets import router as assets_router
app.include_router(assets_router)
```

---

## Step 3: Declarative View Schema Creation

Create the declarative Server-Driven UI specification inside `public/schemas/asset_schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "model": "company.asset",
  "title": "Hardware & Asset Management",
  "endpoint": "/api/v1/assets",
  "fields": {
    "id": { "type": "string", "label": "UUID", "readonly": true },
    "asset_tag": { "type": "string", "label": "Asset Tag", "required": true },
    "name": { "type": "string", "label": "Asset Name", "required": true },
    "category": {
      "type": "selection",
      "label": "Category",
      "required": true,
      "options": [
        { "value": "Workstation", "label": "Developer Workstation" },
        { "value": "Server", "label": "Rackmount Server" },
        { "value": "Biometric", "label": "ADMS Biometric Terminal" },
        { "value": "Networking", "label": "Core Switch / Firewall" }
      ]
    },
    "serial_number": { "type": "string", "label": "Serial Number" },
    "purchase_date": { "type": "date", "label": "Acquisition Date" },
    "purchase_cost": { "type": "float", "label": "Cost ($)", "suffix": "USD" },
    "status": {
      "type": "selection",
      "label": "Operational Status",
      "widget": "badge",
      "options": [
        { "value": "draft", "label": "In Provisioning", "color": "amber" },
        { "value": "in_service", "label": "In Active Service", "color": "emerald" },
        { "value": "maintenance", "label": "Under Maintenance", "color": "blue" },
        { "value": "retired", "label": "Decommissioned", "color": "slate" }
      ]
    },
    "notes": { "type": "text", "label": "Maintenance Notes", "widget": "textarea" }
  },
  "views": {
    "list": {
      "columns": [
        "asset_tag",
        "name",
        "category",
        "serial_number",
        "purchase_cost",
        "status"
      ],
      "default_sort": { "field": "asset_tag", "order": "asc" },
      "sticky_header": true,
      "aggregations": {
        "purchase_cost": "sum"
      }
    },
    "form": {
      "layout": "asymmetric_70_30",
      "statusbar": {
        "field": "status",
        "stages": [
          { "id": "draft", "label": "Provisioning" },
          { "id": "in_service", "label": "Active Service" },
          { "id": "maintenance", "label": "Maintenance" },
          { "id": "retired", "label": "Retired" }
        ],
        "buttons": [
          {
            "id": "btn_deploy",
            "label": "Deploy to Service",
            "target": "in_service",
            "style": "primary",
            "visible_when": { "status": "draft" }
          },
          {
            "id": "btn_service",
            "label": "Send to Maintenance",
            "target": "maintenance",
            "style": "secondary",
            "visible_when": { "status": "in_service" }
          },
          {
            "id": "btn_retire",
            "label": "Decommission Asset",
            "target": "retired",
            "style": "danger",
            "visible_when": { "status": "maintenance" }
          }
        ]
      },
      "sections": [
        {
          "title": "General Identification",
          "target_panel": "main",
          "columns": 12,
          "fields": [
            { "name": "asset_tag", "span": 6 },
            { "name": "name", "span": 6 },
            { "name": "category", "span": 6 },
            { "name": "serial_number", "span": 6 }
          ]
        },
        {
          "title": "Procurement & Accounting",
          "target_panel": "main",
          "columns": 12,
          "fields": [
            { "name": "purchase_date", "span": 6 },
            { "name": "purchase_cost", "span": 6 }
          ]
        },
        {
          "title": "Notes & History",
          "target_panel": "main",
          "columns": 12,
          "fields": [
            { "name": "notes", "span": 12 }
          ]
        }
      ]
    },
    "graph": {
      "default_chart": "bar",
      "dimension": "category",
      "measure": "purchase_cost",
      "aggregator": "sum"
    }
  }
}
```

---

## Step 4: Registering in Module Registry

Update `src/registry/moduleRegistry.js` to register the new module into the global app index:

```javascript
// src/registry/moduleRegistry.js
export const APP_MODULES = [
  // ... existing modules (hr, iam, operations, payroll) ...
  {
    id: "assets",
    name: "Asset Management",
    shortName: "Assets",
    iconName: "Server", // Lucide Icon identifier
    description: "Enterprise IT hardware registry, lifecycle provisioning, warranty tracking & depreciation",
    color: "#0284c7", // Sky blue accent
    menus: [
      {
        id: "hardware_assets",
        label: "Hardware Registry",
        model: "assets",
        required_groups: ["assets.user", "assets.manager"]
      },
      {
        id: "asset_analytics",
        label: "Depreciation & Costs",
        model: "assets_analytics",
        required_groups: ["assets.manager"]
      }
    ]
  }
];
```

---

## Step 5: Access Control & Permissions Integration

To integrate the new module into the dynamic RBAC permissions matrix:

### 5.1 Seed Security Groups into System Roles
Execute the following update in PostgreSQL to grant `Superadmin` and `Operations Lead` access to the new module:

```sql
-- Add 'assets' to Superadmin permissions and menu access
UPDATE roles 
SET permissions = jsonb_set(
        permissions, 
        '{assets}', 
        '{"create": true, "read": true, "update": true, "delete": true}'::jsonb
    ),
    menu_access = (
        SELECT jsonb_agg(DISTINCT elem)
        FROM jsonb_array_elements_text(menu_access || '["hardware_assets", "asset_analytics"]'::jsonb) elem
    )
WHERE id = 'role_superadmin';

-- Add read/update to Operations Lead
UPDATE roles 
SET permissions = jsonb_set(
        permissions, 
        '{assets}', 
        '{"create": true, "read": true, "update": true, "delete": false}'::jsonb
    ),
    menu_access = (
        SELECT jsonb_agg(DISTINCT elem)
        FROM jsonb_array_elements_text(menu_access || '["hardware_assets"]'::jsonb) elem
    )
WHERE id = 'role_ops_lead';
```

---

## Step 6: Testing & Verification Checklist

Follow this systematic checklist to ensure the custom module functions seamlessly across all layers:

- [ ] **1. Full-Screen App Grid Launcher (9-Dot):**
  - Open the App Launcher by clicking the 9-dot grid icon in the top navbar.
  - Verify that **"Asset Management"** appears with its blue `Server` icon.
  - Verify that quick-link chips (**Hardware Registry**, **Depreciation & Costs**) are clickable.
- [ ] **2. Command Palette (`Ctrl + K`):**
  - Press `Ctrl + K` anywhere in the application.
  - Type `Asset` or `Hardware`.
  - Confirm that the search results include the new menus and navigate correctly upon pressing `Enter`.
- [ ] **3. URL State Persistence:**
  - Navigate to `/?module=assets&menu=hardware_assets`.
  - Refresh the browser (`F5` or `Ctrl + R`).
  - Verify that the app re-mounts on the Asset Management module without redirecting away.
- [ ] **4. Server-Driven UI Rendering:**
  - Verify that the **List View** displays columns (`Asset Tag`, `Name`, `Category`, `Cost`).
  - Click on a record to open the **70/30 Form View**.
  - Verify that clicking the statusbar button **"Deploy to Service"** updates the state to `in_service`.
- [ ] **5. Access Control (403 Enforcement):**
  - Log in with a user whose role lacks `hardware_assets` in `menu_access`.
  - Verify that the module card is omitted from the 9-dot launcher.
  - Directly navigating to `/?module=assets&menu=hardware_assets` must render the **Access Denied (403)** screen.
