// Two-Tier Security Groups & App Access Architecture
// Fine-grained atomic permissions bundled into functional App Access Profiles

export const normalizeAppId = (appId) => {
  if (!appId) return '';
  const map = {
    'human_resources': 'hr',
    'hr': 'hr',
    'security_iam': 'iam',
    'iam': 'iam',
    'operations_hardware': 'operations',
    'operations': 'operations',
    'payroll_engine': 'payroll',
    'payroll': 'payroll',
  };
  return map[appId.toLowerCase()] || appId.toLowerCase();
};

// 1. Atomic Security Groups
export const security_groups = [
  // Human Resources & Attendance
  {
    key: "attendance.read",
    name: "Read Attendance Logs",
    description: "Query and view biometric attendance records, clock-in timestamps, and employee timesheets.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "attendance.write",
    name: "Write Attendance Logs",
    description: "Insert manual attendance logs, modify check-in/out times, and edit shift remarks.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "attendance.verify",
    name: "Verify & Sign Attendance",
    description: "Approve attendance punch records and mark shifts verified for payroll reconciliation.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "attendance.delete",
    name: "Delete Attendance Logs",
    description: "Purge or archive attendance punch records.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "roster.read",
    name: "Read Shift Rosters",
    description: "View scheduled department shift rosters, rotation calendars, and assigned duty slots.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "roster.write",
    name: "Manage Shift Rosters",
    description: "Assign workers to departmental schedules and configure shift rotation rules.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "employee.read",
    name: "Read Employees Directory",
    description: "Query and view international employee profiles, contracts, and residency details.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "employee.write",
    name: "Manage Employees",
    description: "Create and update employee records, bank details, and ID documents.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "employee.delete",
    name: "Delete Employees",
    description: "De-provision and archive employee personnel records.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "hr.employee_user",
    name: "Employee Self-Service Access",
    description: "Base workforce access to employee directory.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "hr.manager",
    name: "HR Management Role",
    description: "Full HR management privileges over workforce and employee documents.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "hr.contracts_read",
    name: "Contract Administrator - Basic",
    description: "Permits viewing contract existence, reference (CNT-2026-XXXX), title, start/end dates, probation, and notice periods. Strictly denies access to base wages, salary rules, benefit amounts, and net package totals.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "hr.contracts_manage",
    name: "Contract Officer",
    description: "Permits creating, editing, and activating contracts, modifying duration, and uploading signed agreements.",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "hr.salary_read",
    name: "Payroll / Compensation Auditor",
    description: "Grants read access to confidential compensation fields (wage_base, currency, benefit line figures, total monthly net package).",
    category: "Human Resources",
    app_id: "hr",
  },
  {
    key: "hr.salary_manage",
    name: "Payroll / Compensation Director",
    description: "Full authority to configure base wages, attach/remove dynamic benefit rules, and override rule percentages/amounts.",
    category: "Human Resources",
    app_id: "hr",
  },

  // Security & Identity Access Management (IAM)
  {
    key: "users.read",
    name: "Read Users & Directory",
    description: "View enterprise user profiles, email addresses, assigned roles, and tenancy memberships.",
    category: "Security & IAM",
    app_id: "iam",
  },
  {
    key: "users.manage",
    name: "Manage User Identities",
    description: "Create new user accounts, update profile attributes, reset credentials, and trigger deactivations.",
    category: "Security & IAM",
    app_id: "iam",
  },
  {
    key: "roles.read",
    name: "Read RBAC Matrices",
    description: "View role definitions, permissions breakdown, and security group bundles.",
    category: "Security & IAM",
    app_id: "iam",
  },
  {
    key: "roles.manage",
    name: "Manage RBAC Matrices",
    description: "Configure CRUD access matrices and assign app access bundles to roles.",
    category: "Security & IAM",
    app_id: "iam",
  },
  {
    key: "org.read",
    name: "Read Organizations & Branches",
    description: "Inspect multi-tenant company details, tax identifiers, and branch locations.",
    category: "Security & IAM",
    app_id: "iam",
  },
  {
    key: "org.manage",
    name: "Manage Organizations & Branches",
    description: "Create new operating branches, configure base currencies, and update legal entity profiles.",
    category: "Security & IAM",
    app_id: "iam",
  },

  // Operations & Hardware Gateway
  {
    key: "hardware.read",
    name: "Read Biometric Terminals",
    description: "Inspect online device status, IP addresses, ping latencies, and ADMS push gateway feeds.",
    category: "Operations & Hardware",
    app_id: "operations",
  },
  {
    key: "hardware.manage",
    name: "Configure Hardware Gateways",
    description: "Register new facial/fingerprint terminals, modify IP allowlists, and dispatch terminal sync commands.",
    category: "Operations & Hardware",
    app_id: "operations",
  },

  // Payroll Engine
  {
    key: "payroll.read",
    name: "Read Payroll Batches",
    description: "Query monthly shift reconciliation batches and calculated verified working hours.",
    category: "Payroll Engine",
    app_id: "payroll",
  },
  {
    key: "payroll.manage",
    name: "Lock & Export Payroll Batches",
    description: "Approve monthly payroll batches and generate bank salary export files.",
    category: "Payroll Engine",
    app_id: "payroll",
  },
];

// Alias for uppercase import
export const SECURITY_GROUPS = security_groups;

// 2. Bundled App Access Profiles
export const app_access_profiles = [
  // Human Resources Profiles
  {
    id: "app_hr_manager",
    app_id: "human_resources",
    name: "HR Operations Lead",
    description: "Full supervisory oversight over attendance punches, verification workflows, and shift rosters.",
    granted_groups: [
      "attendance.read",
      "attendance.write",
      "attendance.verify",
      "attendance.delete",
      "roster.read",
      "roster.write",
      "employee.read",
      "employee.write",
      "employee.delete",
      "hr.employee_user",
      "hr.manager",
      "hr.contracts_read",
      "hr.contracts_manage",
      "hr.salary_read",
      "hr.salary_manage",
    ],
  },
  {
    id: "app_hr_supervisor",
    app_id: "human_resources",
    name: "HR Shift Supervisor",
    description: "Shift punch validation, manual timesheet correction, and roster schedule inspection.",
    granted_groups: [
      "attendance.read",
      "attendance.write",
      "attendance.verify",
      "roster.read",
      "employee.read",
      "employee.write",
      "hr.employee_user",
      "hr.contracts_read",
    ],
  },
  {
    id: "app_hr_viewer",
    app_id: "human_resources",
    name: "HR Staff Member",
    description: "Self-service viewing of duty rosters and personal verified attendance logs.",
    granted_groups: [
      "attendance.read",
      "roster.read",
      "employee.read",
      "hr.employee_user",
    ],
  },

  // Security & IAM Profiles
  {
    id: "app_iam_admin",
    app_id: "security_iam",
    name: "IAM Security Administrator",
    description: "Comprehensive administration of enterprise user accounts, RBAC matrices, and tenant branches.",
    granted_groups: [
      "users.read",
      "users.manage",
      "roles.read",
      "roles.manage",
      "org.read",
      "org.manage",
    ],
  },
  {
    id: "app_iam_auditor",
    app_id: "iam",
    name: "Security & Access Reviewer",
    description: "Read-only inspection of corporate directory, security profiles, and tenancy branches.",
    granted_groups: [
      "users.read",
      "roles.read",
      "org.read",
    ],
  },

  // Operations & Hardware Profiles
  {
    id: "app_ops_engineer",
    app_id: "operations",
    name: "Hardware Gateway Engineer",
    description: "Full operational authority over biometric hardware devices and ADMS listener gateways.",
    granted_groups: [
      "hardware.read",
      "hardware.manage",
    ],
  },
  {
    id: "app_ops_viewer",
    app_id: "operations",
    name: "Terminal Status Observer",
    description: "Read-only telemetry monitoring of biometric terminal connectivity and ping latency.",
    granted_groups: [
      "hardware.read",
    ],
  },

  // Payroll Engine Profiles
  {
    id: "app_payroll_officer",
    app_id: "payroll",
    name: "Payroll Operations Officer",
    description: "Reconciliation of verified shifts, batch locking, and bank salary export.",
    granted_groups: [
      "payroll.read",
      "payroll.manage",
      "hr.contracts_read",
      "hr.salary_read",
      "hr.salary_manage",
    ],
  },
  {
    id: "app_payroll_auditor",
    app_id: "payroll_engine",
    name: "Payroll Reconciliation Auditor",
    description: "Read-only audit inspection of monthly attendance batches and verified hours.",
    granted_groups: [
      "payroll.read",
      "hr.contracts_read",
      "hr.salary_read",
    ],
  },
];

// Alias for uppercase import
export const APP_ACCESS_PROFILES = app_access_profiles;

// 3. Sub-Menu Model Permission Requirements
export const MENU_PERMISSIONS = {
  employees: "employee.read",
  new_employee: "employee.write",
  contracts: "hr.contracts_read",
  attendances: "attendance.read",
  rosters: "roster.read",
  leaves: "attendance.read",
  hr_config: "employee.write",
  batches: "payroll.read",
  payroll_adjustments: "attendance.write",
  eosb: "hr.contracts_read",
  salary_rules: "hr.salary_manage",
  wps_config: "hr.salary_manage",
  terminals: "hardware.read",
  api_keys: "hardware.manage",
  users: "users.read",
  roles: "roles.read",
  orgs: "org.read",
  general_settings: "org.manage",
  paper_format: "org.manage",
  windows_sso: "org.manage",
  about: "org.read",
  compliance_alerts: "org.manage",
  mail_servers: "org.manage",
  mail_templates: "org.manage",
  mail_logs: "org.manage",
  sms_gateways: "org.manage",
  whatsapp_configs: "org.manage",
  whatsapp_accounts: "org.manage",
  whatsapp_templates: "org.manage",
  communication_logs: "org.manage",
  sms_whatsapp_logs: "org.manage",
  automation_triggers: "org.manage",
};

// 4. Default Role to App Access Profile Mappings
export const DEFAULT_ROLE_PROFILES = {
  role_superadmin: [
    "app_hr_manager",
    "app_iam_admin",
    "app_ops_engineer",
    "app_payroll_officer",
  ],
  role_ops_lead: [
    "app_hr_manager",
    "app_ops_engineer",
    "app_iam_auditor",
    "app_payroll_auditor",
  ],
  role_supervisor: [
    "app_hr_supervisor",
    "app_ops_viewer",
  ],
  role_standard: [
    "app_hr_viewer",
  ],
};
