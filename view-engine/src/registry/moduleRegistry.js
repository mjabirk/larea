// Enterprise ERP Module Registry & Scalable 2-Tier Navigation
export const APP_MODULES = [
  {
    id: "hr",
    name: "Human Resources",
    shortName: "HR",
    iconName: "Users",
    description: "Biometric attendance logs, shift rosters, employee time tracking & leave management",
    color: "#2563eb",
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
  },
  {
    id: "iam",
    name: "Security & IAM",
    shortName: "IAM",
    iconName: "Shield",
    description: "Identity lifecycle, zero-trust sessions, RBAC permission matrices & corporate tenancy",
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
      },
      {
        id: "orgs",
        label: "Organizations & Branches",
        model: "organizations",
        required_groups: ["iam.tenancy_admin", "iam.security_admin", "org.read", "org.manage"]
      }
    ]
  },
  {
    id: "operations",
    name: "Operations & Hardware",
    shortName: "Ops",
    iconName: "Cpu",
    description: "Biometric ADMS terminals, hardware health monitors & subnet policies",
    color: "#059669",
    menus: [
      {
        id: "terminals",
        label: "Hardware Terminals",
        model: "terminals",
        required_groups: ["operations.terminals_admin", "operations.hardware_operator"]
      }
    ]
  },
  {
    id: "payroll",
    name: "Payroll Engine",
    shortName: "Payroll",
    iconName: "Banknote",
    description: "Salary rules computation, automated overtime calculation & lock batches",
    color: "#d97706",
    menus: [
      {
        id: "batches",
        label: "Payroll Batches",
        model: "payroll_batches",
        required_groups: ["payroll.batches_admin", "payroll.manager"]
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
