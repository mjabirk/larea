// src/registry/moduleRegistry.js
export const APP_MODULES = [
  {
    id: "hr",
    name: "Human Resources",
    shortName: "HR",
    iconName: "Users",
    description: "Employee directory, contracts, attendance, shift schedules, and leave requests",
    color: "#2563eb",
    menus: [
      {
        id: "employees",
        label: "Employees",
        model: "employees",
        required_groups: ["hr.employee_user", "hr.manager", "employee.read"]
      },
      {
        id: "contracts",
        label: "Contracts",
        model: "employee_contracts",
        required_groups: ["hr.contracts_read"]
      },
      {
        id: "attendances",
        label: "Attendance",
        model: "attendance_logs",
        required_groups: ["hr.attendance_user", "hr.manager", "attendance.read"]
      },
      {
        id: "rosters",
        label: "Shift Rosters",
        model: "shift_rosters",
        required_groups: ["hr.roster_manager", "hr.manager", "attendance.write"]
      },
      {
        id: "leaves",
        label: "Leave & Time Off",
        model: "leave_requests",
        required_groups: ["hr.employee_user", "hr.manager", "attendance.read"]
      },
      {
        id: "hr_config",
        label: "HR Settings",
        model: "hr_settings",
        required_groups: ["hr.manager", "employee.write"]
      }
    ]
  },
  {
    id: "payroll",
    name: "Payroll",
    shortName: "Payroll",
    iconName: "Banknote",
    description: "Monthly payroll runs, bank export files, variable pay, and end-of-service settlements",
    color: "#d97706",
    menus: [
      {
        id: "batches",
        label: "Payroll Batches",
        model: "payroll_batches",
        required_groups: ["payroll.batches_admin", "payroll.manager", "payroll.read"]
      },
      {
        id: "payroll_adjustments",
        label: "Variable Pay",
        model: "payroll_adjustments",
        required_groups: ["payroll.read", "attendance.write", "hr.manager"]
      },
      {
        id: "eosb",
        label: "End of Service",
        model: "eosb_gratuity",
        required_groups: ["payroll.read", "hr.contracts_read", "hr.manager"]
      },
      {
        id: "salary_rules",
        label: "Salary Rules",
        model: "salary_rules",
        required_groups: ["hr.salary_manage", "payroll.manager"]
      },
      {
        id: "wps_config",
        label: "Bank Export Setup",
        model: "wps_settings",
        required_groups: ["hr.salary_manage", "payroll.manager"]
      }
    ]
  },
  {
    id: "operations",
    name: "Devices",
    shortName: "Devices",
    iconName: "Cpu",
    description: "Biometric attendance devices, punch logs, and device API keys",
    color: "#059669",
    menus: [
      {
        id: "terminals",
        label: "Attendance Devices",
        model: "terminals",
        required_groups: ["operations.terminals_admin", "operations.hardware_operator", "hardware.read"]
      },
      {
        id: "api_keys",
        label: "Device API Keys",
        model: "api_keys",
        required_groups: ["hardware.manage", "users.manage"]
      }
    ]
  },
  {
    id: "iam",
    name: "Users & Access",
    shortName: "Access",
    iconName: "Shield",
    description: "User accounts, roles, access permissions, and single sign-on",
    color: "#7c3aed",
    menus: [
      {
        id: "users",
        label: "Users",
        model: "users",
        required_groups: ["iam.users_admin", "iam.security_admin", "users.read", "users.manage"]
      },
      {
        id: "roles",
        label: "Roles & Permissions",
        model: "roles",
        required_groups: ["iam.roles_admin", "iam.security_admin", "users.manage"]
      },
      {
        id: "windows_sso",
        label: "Single Sign-On",
        model: "sso_settings",
        required_groups: ["iam.security_admin", "users.manage", "org.manage"]
      }
    ]
  },
  {
    id: "settings",
    name: "Settings",
    shortName: "Settings",
    iconName: "SlidersHorizontal",
    description: "Companies, branches, document layout, email & WhatsApp notifications, and automations",
    color: "#475569",
    menuGroups: [
      {
        id: "grp_tenancy",
        label: "Company",
        iconName: "Building2",
        menus: [
          { id: "orgs", label: "Companies & Branches", model: "organizations", required_groups: ["org.read", "org.manage"] },
          { id: "general_settings", label: "Regional & Preferences", model: "general_settings", required_groups: ["org.manage"] },
          { id: "paper_format", label: "Paper & Document Layout", model: "paper_format", required_groups: ["org.manage"] },
          { id: "windows_sso", label: "Single Sign-On", model: "sso_settings", required_groups: ["iam.security_admin", "users.manage", "org.manage"] },
          { id: "compliance_alerts", label: "Expiry Alerts", model: "compliance_settings", required_groups: ["org.manage", "hr.manager"] }
        ]
      },
      {
        id: "grp_email",
        label: "Email",
        iconName: "Mail",
        menus: [
          { id: "mail_servers", label: "Email Servers", model: "mail_servers", required_groups: ["org.manage"] },
          { id: "mail_templates", label: "Email Templates", model: "mail_templates", required_groups: ["org.manage", "hr.manager"] },
          { id: "mail_logs", label: "Email Logs", model: "mail_logs", required_groups: ["org.manage"] }
        ]
      },
      {
        id: "grp_messaging",
        label: "WhatsApp & SMS",
        iconName: "MessageSquare",
        menus: [
          { id: "whatsapp_accounts", label: "WhatsApp Accounts", model: "whatsapp_accounts", required_groups: ["org.manage"] },
          { id: "whatsapp_templates", label: "WhatsApp Templates", model: "whatsapp_templates", required_groups: ["org.manage", "hr.manager"] },
          { id: "sms_gateways", label: "SMS Gateways", model: "sms_gateways", required_groups: ["org.manage"] },
          { id: "sms_whatsapp_logs", label: "Message Logs", model: "sms_whatsapp_logs", required_groups: ["org.manage"] }
        ]
      },
      {
        id: "grp_automation",
        label: "Automations",
        iconName: "Sparkles",
        menus: [
          { id: "automation_triggers", label: "Automated Rules", model: "automation_triggers", required_groups: ["org.manage"] }
        ]
      },
      {
        id: "grp_about",
        label: "About",
        iconName: "Info",
        menus: [
          { id: "about", label: "About", model: "system_about", required_groups: ["org.read", "org.manage"] }
        ]
      }
    ],
    menus: [
      { id: "orgs", label: "Companies & Branches", model: "organizations" },
      { id: "general_settings", label: "Regional & Preferences", model: "general_settings" },
      { id: "paper_format", label: "Paper & Document Layout", model: "paper_format" },
      { id: "windows_sso", label: "Single Sign-On", model: "sso_settings" },
      { id: "compliance_alerts", label: "Expiry Alerts", model: "compliance_settings" },
      { id: "mail_servers", label: "Email Servers", model: "mail_servers" },
      { id: "mail_templates", label: "Email Templates", model: "mail_templates" },
      { id: "mail_logs", label: "Email Logs", model: "mail_logs" },
      { id: "whatsapp_accounts", label: "WhatsApp Accounts", model: "whatsapp_accounts" },
      { id: "whatsapp_templates", label: "WhatsApp Templates", model: "whatsapp_templates" },
      { id: "sms_gateways", label: "SMS Gateways", model: "sms_gateways" },
      { id: "sms_whatsapp_logs", label: "Message Logs", model: "sms_whatsapp_logs" },
      { id: "automation_triggers", label: "Automated Rules", model: "automation_triggers" },
      { id: "about", label: "About", model: "system_about" }
    ]
  }
];

export function getModuleById(moduleId) {
  return APP_MODULES.find((m) => m.id === moduleId) || APP_MODULES[0];
}

export function getMenuById(moduleId, menuId) {
  const mod = getModuleById(moduleId);
  if (!mod) return null;
  if (mod.menus) {
    const found = mod.menus.find((menu) => menu.id === menuId);
    if (found) return found;
  }
  if (mod.menuGroups) {
    for (const group of mod.menuGroups) {
      const found = group.menus?.find((m) => m.id === menuId);
      if (found) return found;
    }
  }
  return mod.menus?.[0] || null;
}
