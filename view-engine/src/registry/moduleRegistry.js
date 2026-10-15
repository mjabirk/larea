// src/registry/moduleRegistry.js
export const APP_MODULES = [
  {
    id: "hr",
    name: "Human Resources",
    shortName: "HR",
    iconName: "Users",
    description: "Expat workforce directory, QID/Visa compliance, contracts, biometric attendance & shift rosters",
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
        label: "Attendance Logs",
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
        label: "Configuration",
        model: "hr_settings",
        required_groups: ["hr.manager", "employee.write"]
      }
    ]
  },
  {
    id: "payroll",
    name: "Payroll & WPS",
    shortName: "Payroll",
    iconName: "Banknote",
    description: "Qatar WPS SIF file generator, monthly salary batches, EOSB gratuity & allowance rules",
    color: "#d97706",
    menus: [
      {
        id: "batches",
        label: "Payroll Batches & WPS",
        model: "payroll_batches",
        required_groups: ["payroll.batches_admin", "payroll.manager", "payroll.read"]
      },
      {
        id: "payroll_adjustments",
        label: "Variable Pay & Approvals",
        model: "payroll_adjustments",
        required_groups: ["payroll.read", "attendance.write", "hr.manager"]
      },
      {
        id: "eosb",
        label: "EOSB & Final Settlement",
        model: "eosb_gratuity",
        required_groups: ["payroll.read", "hr.contracts_read", "hr.manager"]
      },
      {
        id: "salary_rules",
        label: "Salary Rules & Allowances",
        model: "salary_rules",
        required_groups: ["hr.salary_manage", "payroll.manager"]
      },
      {
        id: "wps_config",
        label: "WPS Bank Configuration",
        model: "wps_settings",
        required_groups: ["hr.salary_manage", "payroll.manager"]
      }
    ]
  },
  {
    id: "operations",
    name: "Operations & Hardware",
    shortName: "Ops",
    iconName: "Cpu",
    description: "Biometric ADMS terminals, ZKTeco push gateway, hardware health & API keys",
    color: "#059669",
    menus: [
      {
        id: "terminals",
        label: "Hardware Terminals",
        model: "terminals",
        required_groups: ["operations.terminals_admin", "operations.hardware_operator", "hardware.read"]
      },
      {
        id: "api_keys",
        label: "ADMS API Keys",
        model: "api_keys",
        required_groups: ["hardware.manage", "users.manage"]
      }
    ]
  },
  {
    id: "iam",
    name: "Security & IAM",
    shortName: "IAM",
    iconName: "Shield",
    description: "Identity lifecycle, zero-trust DragonflyDB sessions, RBAC permission matrices & 2FA",
    color: "#7c3aed",
    menus: [
      {
        id: "users",
        label: "Users & Identities",
        model: "users",
        required_groups: ["iam.users_admin", "iam.security_admin", "users.read", "users.manage"]
      },
      {
        id: "roles",
        label: "Roles & Permissions",
        model: "roles",
        required_groups: ["iam.roles_admin", "iam.security_admin", "users.manage"]
      }
    ]
  },
  {
    id: "settings",
    name: "System Configuration",
    shortName: "Settings",
    iconName: "SlidersHorizontal",
    description: "Organizations & branches, Qatar CR/Establishment IDs, expiry alert rules & system audit logs",
    color: "#475569",
    menus: [
      {
        id: "orgs",
        label: "Companies & Branches",
        model: "organizations",
        required_groups: ["org.read", "org.manage"]
      },
      {
        id: "compliance_alerts",
        label: "QID & Visa Alert Rules",
        model: "compliance_settings",
        required_groups: ["org.manage", "hr.manager"]
      },
      {
        id: "mail_servers",
        label: "Email Servers",
        model: "mail_servers",
        required_groups: ["org.manage"]
      },
      {
        id: "mail_templates",
        label: "Email Templates",
        model: "mail_templates",
        required_groups: ["org.manage"]
      },
      {
        id: "mail_logs",
        label: "Outgoing & Incoming Mail Logs",
        model: "mail_messages",
        required_groups: ["org.manage"]
      },
      {
        id: "sms_gateways",
        label: "SMS Gateways",
        model: "sms_gateways",
        required_groups: ["org.manage"]
      },
      {
        id: "whatsapp_configs",
        label: "WhatsApp Accounts (Cloud API)",
        model: "whatsapp_configs",
        required_groups: ["org.manage"]
      },
      {
        id: "whatsapp_templates",
        label: "WhatsApp Templates",
        model: "whatsapp_templates",
        required_groups: ["org.manage"]
      },
      {
        id: "communication_logs",
        label: "SMS & WhatsApp Logs",
        model: "communication_logs",
        required_groups: ["org.manage"]
      },
      {
        id: "automation_triggers",
        label: "Automation Triggers",
        model: "automation_triggers",
        required_groups: ["org.manage"]
      }
    ]
  }
];

export function getModuleById(moduleId) {
  return APP_MODULES.find((m) => m.id === moduleId) || APP_MODULES[0];
}

export function getMenuById(moduleId, menuId) {
  const mod = getModuleById(moduleId);
  return mod.menus.find((menu) => menu.id === menuId) || mod.menus[0];
}