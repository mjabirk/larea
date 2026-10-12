# Server-Driven UI (SDUI) View Engine Specification

## 1. Executive Summary & Core Philosophy

The Enterprise View Engine implements an enterprise-grade **Server-Driven UI (SDUI)** architecture. In traditional web applications, frontends are tightly coupled to domain data models: every new business entity requires custom React components, state handlers, table columns, form inputs, and validation logic.

The Enterprise View Engine eliminates this hardcoded overhead through a unified declarative contract:

```
┌────────────────────────────────────────────────────────┐
│                   Backend Metadata                     │
│  - Field types & constraints                           │
│  - Relational links & widgets                          │
│  - View configurations (List, Form, Graph, etc.)       │
└──────────────────────────┬─────────────────────────────┘
                           │ Declarative JSON Schema
                           ▼
┌────────────────────────────────────────────────────────┐
│               Enterprise React SDUI Engine             │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │  List View   │ │  Form View   │ │   Graph View   │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │Calendar View │ │  Pivot View  │ │   Gantt View   │  │
│  └──────────────┘ └──────────────┘ └────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Key Architectural Advantages
1. **Zero-Code Screen Authoring:** Defining or altering a business module is achieved by publishing a JSON schema. New fields, statusbar stages, and aggregations render instantly without bundling or redeploying the frontend.
2. **Schema-Driven Validation:** Field constraints (`required`, `readonly`, `type`, numeric bounds) are enforced consistently across client UI widgets and server API validation.
3. **Consistent Enterprise UX:** Universal support for keyboard navigation (`Tab`, `Escape`, `Enter`, `Ctrl+K`), WCAG 2.1 AA accessible contrast ratios, dynamic dark mode, and responsive layouts across all 6 view types.
4. **Asymmetric 70/30 Information Density:** Form views adhere to the golden ratio of enterprise productivity: 70% primary operational canvas and 30% contextual metadata, biometric device logs, and tamper-evident audit trails.

---

## 2. Top-Level Schema Structure

Every business model registered with the View Engine is declared through a top-level JSON schema with the following schema structure:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "model": "hr.attendance",
  "title": "Attendance & Rosters",
  "description": "Biometric punch logs, shift rosters, and payroll synchronization",
  "version": "1.4.0",
  "icon": "Users",
  "color": "#2563eb",
  "endpoint": "/api/v1/attendances",
  "fields": {
    "<field_name>": { /* FieldDefinition */ }
  },
  "views": {
    "list": { /* ListViewDefinition */ },
    "form": { /* FormViewDefinition */ },
    "graph": { /* GraphViewDefinition */ },
    "calendar": { /* CalendarViewDefinition */ },
    "pivot": { /* PivotViewDefinition */ },
    "gantt": { /* GanttViewDefinition */ }
  }
}
```

---

## 3. Data Dictionary: Field Definitions & Widgets

The `fields` object defines all structural properties, storage types, display labels, access behaviors, and rendering widgets for the entity.

### Field Property Reference

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | `string` | *(Required)* | Storage datatype: `string`, `integer`, `float`, `boolean`, `date`, `datetime`, `selection`, `text`, `reference`, `json`. |
| `label` | `string` | *(Required)* | Human-readable internationalized field label displayed in headers and form labels. |
| `widget` | `string` | `default` | Specialized UI component used to display and edit values (e.g., `float_time`, `many2one_avatar`, `badge`, `gps`, `masked_pan`). |
| `required` | `boolean` | `false` | If `true`, form submissions and batch commits prevent saving null or empty strings. |
| `readonly` | `boolean` | `false` | If `true`, input element is disabled and protected against modification in form and list edits. |
| `masked` | `boolean` | `false` | If `true`, values are obscured in UI (e.g. `•••• 4821` or `***@***.com`) unless user has explicit privileged grant. |
| `options` | `array` | `[]` | For `selection` type: list of `{ "value": string, "label": string, "color"?: string }`. |
| `relation` | `string` | `null` | For `reference` type: target model identifier (e.g., `"res.users"` or `"company.branch"`). |
| `default` | `any` | `null` | Initial value populated when initializing a new record in Form View. |
| `help` | `string` | `""` | Contextual tooltip displayed on hover over field label in Form View. |

### Field Types & Available Widgets

#### 1. String & Text
```json
"employee_name": {
  "type": "string",
  "label": "Employee Name",
  "required": true,
  "help": "Full legal name as registered in civil identification"
},
"notes": {
  "type": "text",
  "label": "Supervisor Notes",
  "widget": "textarea",
  "readonly": false
}
```

#### 2. Temporal (`date` & `datetime`)
Rendered via `<DateTimeWidget />` with localized formatting (e.g., `Oct 06, 2026, 08:30 AM`).
```json
"check_in": {
  "type": "datetime",
  "label": "Check In Punch",
  "required": true,
  "widget": "datetime"
}
```

#### 3. Numeric & Float Time (`float_time`)
Converts decimal hours (e.g. `8.5`) to enterprise hour:minute notation (`08:30`) seamlessly:
```json
"duration_hours": {
  "type": "float",
  "label": "Hours Worked",
  "widget": "float_time",
  "suffix": "Hours",
  "readonly": true
}
```

#### 4. Selection & Lifecycle Badges (`badge`)
Renders color-coded pills with glowing status dots:
```json
"status": {
  "type": "selection",
  "label": "Workflow State",
  "widget": "badge",
  "options": [
    { "value": "draft", "label": "Draft / Pending", "color": "amber" },
    { "value": "verified", "label": "Supervisor Verified", "color": "indigo" },
    { "value": "synced", "label": "Pushed to Payroll", "color": "emerald" }
  ]
}
```

#### 5. Relational Avatars (`many2one_avatar`)
Displays circular employee initials avatar alongside name and job title:
```json
"employee_id": {
  "type": "reference",
  "relation": "hr.employee",
  "label": "Staff Member",
  "widget": "many2one_avatar",
  "required": true
}
```

#### 6. Geographic / GPS Coordinates (`gps`)
Parses latitude and longitude with inline Google Maps / OpenStreetMap modal trigger:
```json
"punch_location": {
  "type": "json",
  "label": "Geolocation",
  "widget": "gps"
}
```

---

## 4. The 6 View Type Specifications

```
                       ┌─────────────────────────┐
                       │   View Engine Router    │
                       └────────────┬────────────┘
         ┌──────────────┬───────────┼───────────┬──────────────┐
         ▼              ▼           ▼           ▼              ▼
   ┌───────────┐  ┌───────────┐┌───────────┐┌───────────┐┌───────────┐
   │ List View │  │ Form View ││Graph View ││Cal. View  ││Pivot View │
   └───────────┘  └───────────┘└───────────┘└───────────┘└───────────┘
                                    │
                              ┌─────▼─────┐
                              │Gantt View │
                              └───────────┘
```

---

### View 1: List View (`list`)

The List View renders dense, high-throughput tabular grids designed for scanning hundreds of enterprise records with zero horizontal layout shift.

#### List View Capabilities
- **Sticky Column Headers:** Persists column names and sorting affordances while scrolling through records.
- **Bi-directional Sorting:** Clicking column headers triggers ASC / DESC sorting with visual arrow indicators.
- **Batch Selection & Mutate Actions:** Checkboxes allow bulk record verification, export to CSV/Excel, and deletion.
- **Aggregation Footers:** Summarizes numeric columns (`sum` duration, `avg` scores) in a sticky footer row.
- **Multi-Level Grouping:** Collapsible rows grouped by `department`, `status`, or `branch`.

#### JSON Schema
```json
{
  "views": {
    "list": {
      "columns": [
        "id",
        "employee_name",
        "department",
        "check_in",
        "check_out",
        "duration_hours",
        "status"
      ],
      "default_sort": {
        "field": "check_in",
        "order": "desc"
      },
      "sticky_header": true,
      "page_size": 25,
      "batch_actions": [
        {
          "id": "bulk_verify",
          "label": "Verify Selected",
          "action": "set_status",
          "target_value": "verified",
          "style": "primary",
          "required_permission": "attendance.write"
        },
        {
          "id": "bulk_delete",
          "label": "Delete Records",
          "action": "delete",
          "style": "danger",
          "required_permission": "attendance.delete"
        }
      ],
      "aggregations": {
        "duration_hours": "sum"
      }
    }
  }
}
```

---

### View 2: Form View (`form`)

The Form View implements an asymmetric **70 / 30 split layout**:
- **Left Panel (70%):** Core operational fields, editable inputs, relational assignments, and action controls.
- **Right Panel (30%):** Lifecycle statusbar, biometric hardware diagnostics, audit timestamps, and system fingerprint cards.

#### Key Features
1. **Interactive Lifecycle Statusbar:** Visual step indicators representing sequential lifecycle phases (`Draft` $\rightarrow$ `Verified` $\rightarrow$ `Synced`). Transition buttons automatically update state and trigger server actions.
2. **Dynamic Dependent Calculations:** Client-side compute hooks (e.g., updating `check_out` automatically recalculates `duration_hours = check_out - check_in`).
3. **Audit Trails & Tamper Inspection:** Hardware IP addresses, biometric terminal serials, and user IDs are grouped into tamper-evident readonly cards.

#### JSON Schema
```json
{
  "views": {
    "form": {
      "layout": "asymmetric_70_30",
      "statusbar": {
        "field": "status",
        "stages": [
          { "id": "draft", "label": "Draft / Biometric Ingest", "description": "Captured from ADMS terminal" },
          { "id": "verified", "label": "Supervisor Verified", "description": "HR reviewed & confirmed" },
          { "id": "synced", "label": "Pushed to Payroll", "description": "Locked against changes" }
        ],
        "buttons": [
          {
            "id": "btn_verify",
            "label": "Verify Record",
            "target": "verified",
            "style": "primary",
            "visible_when": { "status": "draft" }
          },
          {
            "id": "btn_sync",
            "label": "Push to Payroll",
            "target": "synced",
            "style": "success",
            "visible_when": { "status": "verified" }
          },
          {
            "id": "btn_reset",
            "label": "Reset to Draft",
            "target": "draft",
            "style": "secondary",
            "visible_when": { "status": "verified" }
          }
        ]
      },
      "sections": [
        {
          "title": "Employee & Punch Timing",
          "target_panel": "main",
          "columns": 12,
          "fields": [
            { "name": "employee_name", "span": 6, "widget": "many2one_avatar" },
            { "name": "department", "span": 6 },
            { "name": "check_in", "span": 6, "widget": "datetime" },
            { "name": "check_out", "span": 6, "widget": "datetime" },
            { "name": "duration_hours", "span": 6, "widget": "float_time" }
          ]
        },
        {
          "title": "Supervisor Remarks",
          "target_panel": "main",
          "columns": 12,
          "fields": [
            { "name": "notes", "span": 12, "widget": "textarea" }
          ]
        },
        {
          "title": "Hardware & ADMS Ingestion",
          "target_panel": "sidebar",
          "columns": 12,
          "fields": [
            { "name": "terminal_id", "span": 12, "readonly": true },
            { "name": "machine_ip", "span": 12, "readonly": true },
            { "name": "ingestion_time", "span": 12, "readonly": true },
            { "name": "last_modified_by", "span": 12, "readonly": true }
          ]
        }
      ]
    }
  }
}
```

---

### View 3: Graph View (`graph`)

The Graph View provides instant analytical aggregations over active datasets with dynamic dimension slicing, measure selection, and chart switching.

#### Supported Chart Types
- `bar`: Vertical categorical distribution (e.g. Total Hours worked per Department).
- `line`: Chronological velocity and trend lines across dates.
- `pie`: Fractional percentage composition.

#### Supported Aggregators
- `sum`: Arithmetic sum of the selected measure.
- `avg`: Mean average per dimension group.
- `count`: Record count per dimension group.

#### JSON Schema
```json
{
  "views": {
    "graph": {
      "default_chart": "bar",
      "supported_charts": ["bar", "line", "pie"],
      "dimension": "department",
      "available_dimensions": ["department", "status", "terminal_id"],
      "measure": "duration_hours",
      "available_measures": ["duration_hours", "id"],
      "aggregator": "sum",
      "supported_aggregators": ["sum", "avg", "count"],
      "palette": [
        "#2563eb",
        "#0ea5e9",
        "#10b981",
        "#f59e0b",
        "#6366f1",
        "#8b5cf6"
      ]
    }
  }
}
```

---

### View 4: Calendar View (`calendar`)

The Calendar View plots chronological records onto an interactive month/week grid, visualizing shifts, check-in windows, and absences.

#### Key Features
- **Temporal Event Binding:** Configurable start and stop datetime mappings.
- **Status Color Mapping:** Background tones bound directly to selection options (`draft` = amber, `verified` = indigo, `synced` = emerald).
- **Navigation Controls:** Seamless month-to-month stepping, 'Today' shortcut, and single-click event drill-down to Form View.

#### JSON Schema
```json
{
  "views": {
    "calendar": {
      "date_start": "check_in",
      "date_stop": "check_out",
      "event_title": "employee_name",
      "color_field": "status",
      "color_map": {
        "draft": "bg-amber-100 text-amber-900 border-amber-300",
        "verified": "bg-indigo-100 text-indigo-900 border-indigo-300",
        "synced": "bg-emerald-100 text-emerald-900 border-emerald-300"
      },
      "default_mode": "month"
    }
  }
}
```

---

### View 5: Pivot View (`pivot`)

The Pivot View provides an in-browser **Online Analytical Processing (OLAP)** cross-tabulation matrix.

#### Key Features
- **Multi-Dimensional Cross Tabulation:** Evaluates rows by category (`department`) against columns by workflow state (`status`).
- **Dynamic Cell Computation:** Computes matrix intersections with row-level subtotals, column-level subtotals, and a grand total.
- **Null Safety:** Handles missing matrix intersections safely with fallback zeroes (`0.0`).

#### JSON Schema
```json
{
  "views": {
    "pivot": {
      "row_groupby": ["department"],
      "col_groupby": ["status"],
      "measures": ["duration_hours"],
      "aggregator": "sum",
      "display_format": "{value}h",
      "show_row_totals": true,
      "show_col_totals": true,
      "show_grand_total": true
    }
  }
}
```

---

### View 6: Gantt View (`gantt`)

The Gantt View maps sequential and concurrent task allocations, shift coverages, and hardware operating windows along a chronological timeline.

#### Key Features
- **Hierarchical Grouping:** Groups duration bars by organizational units (`department` or `branch`).
- **Percentage Progress Bar:** Renders internal progress fills within timeline pills.
- **Dependency Indicators:** Visual connector lines between dependent work packages.

#### JSON Schema
```json
{
  "views": {
    "gantt": {
      "date_start": "check_in",
      "date_stop": "check_out",
      "title": "employee_name",
      "group_by": "department",
      "progress_field": null,
      "color_field": "status",
      "color_map": {
        "draft": "bg-amber-500",
        "verified": "bg-indigo-500",
        "synced": "bg-emerald-500"
      },
      "scale": "day"
    }
  }
}
```

---

## 5. Control Panel & Filter Bar Architecture

All 6 view types share a unified top navigation surface known as the `<ControlPanel />`.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔍 [Search Records...] │ ⚡ Filters ▼ │ 🏢 Group By ▼ │ 📄 View: [📋 📝 📊 📅 🧮 📊]  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Supported Control Panel Contracts
1. **Dynamic Full-Text Search:** Substring match across searchable fields declared in the schema.
2. **Contextual Filter Chips:** Predefined SQL/state filters (e.g. `Only Unverified`, `High Overtime (> 8 hrs)`).
3. **Dynamic Grouping (`activeGroupBy`):** Re-partitions List View and Gantt View rows on the fly.
4. **View Switcher:** Persistent toggle icons allowing users to switch between the 6 views while maintaining filter context.
5. **Batch Action Trigger:** Appears automatically when 1 or more records are selected in List View.

---

## 6. Implementation Summary

To integrate a new view type or extend existing layouts:
1. Store schema definitions in `public/schemas/<model>_schema.json` or export from `src/schema/`.
2. Ensure fields referenced in views match declared keys in the `fields` dictionary.
3. The `<ViewEngine />` component consumes the schema and mounts the corresponding view based on URL query parameter `?view=<list|form|graph|calendar|pivot|gantt>`.
