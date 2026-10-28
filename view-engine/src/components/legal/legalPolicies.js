/**
 * Workspace Policies & Default Company Metadata
 */

export const BUSINESS_DETAILS = {
  legalEntityName: "Larea Workspace",
  tradeName: "Larea ERP",
  crNumber: "—",
  taxNumber: "—",
  registeredAddress: "Configured in Settings → Companies & Branches",
  officialSupportContact: "support@company.local",
  supportPhone: "",
};

export const LEGAL_POLICIES = {
  privacy: {
    id: "privacy",
    title: "Privacy Notice",
    version: "1.0",
    effectiveDate: "October 2026",
    summary:
      "How Larea ERP handles user account details, employee records, attendance logs, and browser storage within your workspace.",
    sections: [
      {
        heading: "1. Workspace Data Ownership",
        content: `All employee profiles, contracts, attendance logs, leave requests, and payroll records entered into this workspace belong to your company. Data is stored in your configured database for internal HR and operational management.`,
      },
      {
        heading: "2. Information Stored",
        content: `We store only the information needed to run your workspace:
• Account Details: Name, work email, assigned branch, and role permissions.
• HR & Payroll Records: Employee contact details, contracts, attendance timestamps, leave balances, and salary calculations.
• Activity Logs: Sign-in sessions and record change history for internal accountability.`,
      },
      {
        heading: "3. Security & Access Control",
        content: `Access to records is restricted by user roles and company/branch assignments. Passwords are stored using secure one-way hashing, and sensitive actions are recorded in the internal activity log.`,
      },
      {
        heading: "4. Account Removal",
        content: `Users may request account deletion from Account & Privacy settings. Account deletion includes a 30-day grace period before credentials are removed, while historical company payroll and attendance totals are preserved for internal bookkeeping.`,
      },
    ],
  },
  terms: {
    id: "terms",
    title: "Terms of Use",
    version: "1.0",
    effectiveDate: "October 2026",
    summary:
      "Guidelines for authorized users accessing and managing company records in Larea ERP.",
    sections: [
      {
        heading: "1. Authorized Workspace Access",
        content: `Access to this system is limited to authorized team members of your organization. Users must keep their login credentials confidential and only access data relevant to their role.`,
      },
      {
        heading: "2. Company & Branch Isolation",
        content: `Each company and branch workspace maintains separate operational records. Users should verify the active company selector in the top bar before creating or modifying records.`,
      },
      {
        heading: "3. Administrator Responsibilities",
        content: `Workspace administrators are responsible for managing user roles, reviewing approval workflows, maintaining accurate company settings, and deactivating accounts when staff members leave the company.`,
      },
    ],
  },
  refund: {
    id: "refund",
    title: "Billing & Cancellation",
    version: "1.0",
    effectiveDate: "October 2026",
    summary:
      "General terms for workspace subscriptions, plan changes, and cancellations.",
    sections: [
      {
        heading: "1. Plan Changes & Cancellations",
        content: `Organizations may upgrade, downgrade, or cancel their workspace plan according to their service agreement. When cancelling, administrators may export employee, attendance, and payroll reports prior to workspace deactivation.`,
      },
      {
        heading: "2. Custom Setup Services",
        content: `Optional onboarding, data migration, or custom hardware setup services are billed separately as agreed in your project scope.`,
      },
    ],
  },
  cookie: {
    id: "cookie",
    title: "Cookies & Browser Storage",
    version: "1.0",
    effectiveDate: "October 2026",
    summary:
      "How browser local storage is used to keep you signed in and save interface preferences.",
    sections: [
      {
        heading: "1. Essential Session Storage",
        content: `Larea ERP uses local browser storage to store your active sign-in token, selected company/branch context, and storage preferences. We do not use third-party advertising trackers.`,
      },
      {
        heading: "2. Display Preferences",
        content: `Optional preference keys remember your chosen theme (light or dark mode), interface language, and text size settings across browser reloads.`,
      },
    ],
  },
};
