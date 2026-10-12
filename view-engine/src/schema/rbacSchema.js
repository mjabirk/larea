// Granular Role-Based Access Control (RBAC) Specification
// Supports system-defined protected roles and user-defined custom roles

export const INITIAL_ROLE_PERMISSIONS = {
  role_superadmin: {
    attendance_logs: { create: true, read: true, update: true, delete: true },
    organizations: { create: true, read: true, update: true, delete: true },
    users: { create: true, read: true, update: true, delete: true },
  },
  role_ops_lead: {
    attendance_logs: { create: true, read: true, update: true, delete: true },
    organizations: { create: false, read: true, update: true, delete: false },
    users: { create: true, read: true, update: true, delete: false },
  },
  role_supervisor: {
    attendance_logs: { create: true, read: true, update: true, delete: false },
    organizations: { create: false, read: true, update: false, delete: false },
    users: { create: false, read: true, update: false, delete: false },
  },
  role_standard: {
    attendance_logs: { create: true, read: true, update: false, delete: false },
    organizations: { create: false, read: false, update: false, delete: false },
    users: { create: false, read: true, update: false, delete: false },
  },
};

export const DEFAULT_ROLES = [
  {
    id: "role_superadmin",
    name: "Superadmin",
    code: "SUPERADMIN",
    description: "Unrestricted platform authority across all tenant organizations, system policies, and security configurations.",
    is_system: true, // System-defined: protected from deletion or slug modification
    badgeColor: "violet",
    permissions: INITIAL_ROLE_PERMISSIONS.role_superadmin,
  },
  {
    id: "role_ops_lead",
    name: "Operations Lead",
    code: "OPS_LEAD",
    description: "Regional operations oversight with full operational CRUD rights, attendance verification, and branch reporting.",
    is_system: true, // System-defined: protected from deletion or slug modification
    badgeColor: "blue",
    permissions: INITIAL_ROLE_PERMISSIONS.role_ops_lead,
  },
  {
    id: "role_supervisor",
    name: "Supervisor",
    code: "SUPERVISOR",
    description: "Shift supervisor with departmental attendance verification, roster scheduling, and read-only directory access.",
    is_system: true, // System-defined: protected from deletion or slug modification
    badgeColor: "emerald",
    permissions: INITIAL_ROLE_PERMISSIONS.role_supervisor,
  },
  {
    id: "role_standard",
    name: "Standard User",
    code: "STANDARD_USER",
    description: "Base workforce member with personal self-service check-in logging and self-profile visibility.",
    is_system: true, // System-defined: protected from deletion or slug modification
    badgeColor: "slate",
    permissions: INITIAL_ROLE_PERMISSIONS.role_standard,
  },
];

export const RBAC_ENTITIES = [
  {
    key: "attendance_logs",
    name: "Attendance Logs & Rosters",
    description: "Biometric clock-ins, shift timings, overtime justifications, and payroll export synchronization.",
    category: "Operations",
    iconName: "Clock",
  },
  {
    key: "organizations",
    name: "Organizations & Branches",
    description: "Multi-tenant company profiles, branch locations, tax IDs, base currencies, and IP allowlists.",
    category: "Tenancy",
    iconName: "Building2",
  },
  {
    key: "users",
    name: "Users & Credentials",
    description: "User profiles, roles, organization memberships, security credentials, and active session tokens.",
    category: "Identity & Access",
    iconName: "Users",
  },
];
