/**
 * Enterprise Legal Policy Registry & Statutory Business Verification Data
 * Compliant with GDPR (EU 2016/679), Qatar PDPL (Law No. 13 of 2016), and WCAG 2.1 AA.
 */

export const BUSINESS_DETAILS = {
  legalEntityName: "Apex Global Enterprises Q.P.S.C.",
  tradeName: "Apex Global ERP & Attendance Solutions",
  crNumber: "QA-90281726-CR",
  taxNumber: "VAT-100293848",
  jurisdiction: "State of Qatar & GCC Regional Cloud Zone",
  registeredAddress: "Tower 4, Floors 18-21, West Bay Financial District, P.O. Box 24891, Doha, Qatar",
  officialSupportContact: "support@apexglobal.com",
  dpoContact: "dpo@apexglobal.com",
  legalContact: "legal@apexglobal.com",
  supportPhone: "+974 4499 8000",
  regulatoryBody: "Ministry of Commerce and Industry (MOCI) & National Cyber Security Agency (NCSA)",
  complianceFrameworks: [
    "ISO/IEC 27001:2022 Certified",
    "SOC 2 Type II Audited",
    "EU General Data Protection Regulation (GDPR 2016/679)",
    "Qatar Personal Data Privacy Law (PDPL 13/2016)",
    "WCAG 2.1 Level AA Accessibility Certified"
  ]
};

export const LEGAL_POLICIES = {
  privacy: {
    id: "privacy",
    title: "Privacy Policy & Data Subject Rights",
    version: "2026.2.0",
    effectiveDate: "October 1, 2026",
    summary: "Comprehensive transparency disclosure governing personal data collection, lawful processing bases, biometric ingestion safeguards, and data subject rights under GDPR & Qatar PDPL.",
    sections: [
      {
        heading: "1. Data Controller Identification",
        content: `Apex Global Enterprises Q.P.S.C., registered under Commercial Registration No. QA-90281726-CR with headquarters in West Bay Financial District, Doha, Qatar, operates as the Data Controller (or Data Processor on behalf of enterprise tenants) for all personal data collected through this platform. You may contact our designated Data Protection Officer (DPO) at dpo@apexglobal.com.`
      },
      {
        heading: "2. Lawful Bases for Processing (GDPR Article 6)",
        content: `We collect and process personal data exclusively under lawful statutory bases:
• Contractual Necessity (Art. 6(1)(b)): Provisioning enterprise accounts, authenticating sessions, and calculating worked hours for payroll.
• Legal Obligation (Art. 6(1)(c)): Compliance with statutory labor laws, wage protection systems (WPS), and financial audit reporting.
• Legitimate Interests (Art. 6(1)(f)): Securing computing assets, mitigating brute-force intrusion, and verifying biometric hardware terminal integrity.
• Explicit Consent (Art. 6(1)(a) & Art. 9(2)(a)): Where applicable for non-essential cookies, optional analytics, and minor/guardian verified data processing.`
      },
      {
        heading: "3. Categories of Data Processed & Data Minimization",
        content: `Under strict GDPR Article 5(1)(c) Data Minimization mandates, we collect strictly what is essential for identity management and attendance:
• Identity Data: Full name, enterprise email address, department, branch assignment, and RBAC role.
• Attendance & Hardware Logs: Timestamped punch event records, terminal device IDs, and IP verification blocks. Raw biometric vector templates remain isolated inside physical edge hardware and are NEVER stored as unencrypted biometric images on server tables.
• Technical & Audit Logs: Rolling 30-minute stateful session tokens, user-agent strings, and cryptographically hashed audit trails.`
      },
      {
        heading: "4. Data Subject Rights (GDPR Articles 15–22)",
        content: `All personnel and data subjects retain statutory privacy rights:
• Right of Access (Art. 15): Request a complete copy of personal records and attendance histories.
• Right to Rectification (Art. 16): Correct inaccurate names, departments, or operating branch memberships.
• Right to Erasure / Right-to-be-Forgotten (Art. 17): Self-service trigger available in User Preferences. Sets account to pending deletion with a 30-day grace period while pseudonymizing audit tables as DELETED_USER_XXXX and preserving mandatory payroll totals for statutory financial audits.
• Right to Restriction & Objection (Art. 18 & 21): Limit automated processing or dispute disputed shift reconciliation logs.
• Right to Data Portability (Art. 20): Export verified shifts and profile data in machine-readable JSON or CSV format.`
      },
      {
        heading: "5. Data Retention & Sandboxed Air-Gapped Storage",
        content: `Personal data is retained only for statutory periods: active employment tenure plus statutory audit duration (typically 5 to 7 years for wage records). All backend operations run strictly in self-hosted regional clusters without unvetted third-party telemetry, pixels, or remote tracking scripts.`
      }
    ]
  },
  terms: {
    id: "terms",
    title: "Terms of Service & SaaS Agreement",
    version: "2026.1.4",
    effectiveDate: "September 15, 2026",
    summary: "Statutory terms governing multi-tenant cloud usage, service level agreements (99.95% uptime SLA), acceptable use policies, and administrative account obligations.",
    sections: [
      {
        heading: "1. Acceptance of Terms",
        content: `By logging into, configuring, or interacting with the Enterprise View Engine platform, you and the legal entity you represent agree to be bound by these statutory Terms of Service. If you do not agree, you must immediately terminate platform access.`
      },
      {
        heading: "2. Multi-Tenant Boundaries & Row-Level Security (RLS)",
        content: `Tenants are cryptographically and logically isolated via PostgreSQL Row-Level Security and tenant-scoped session tokens. Users are strictly prohibited from attempting to bypass tenant boundaries, inject unauthenticated headers, or access records belonging to another operating branch or tenant.`
      },
      {
        heading: "3. Service Level Agreement (SLA)",
        content: `Apex Global Enterprises guarantees a 99.95% monthly service availability for core attendance ingestion and authentication gateways. Scheduled maintenance windows will be communicated at least 72 hours in advance.`
      },
      {
        heading: "4. Administrative Responsibilities & Credential Security",
        content: `Superadmins and Branch Managers are responsible for enforcing mandatory multi-factor authentication (FIDO2 passkey or TOTP) on privileged roles, regularly auditing active user sessions, and promptly offboarding separated personnel.`
      },
      {
        heading: "5. Limitation of Liability & Dispute Resolution",
        content: `Neither party shall be liable for indirect, punitive, or consequential damages. Disputes arising under this agreement shall be submitted to the exclusive jurisdiction of the Commercial Courts of the State of Qatar or GCC commercial arbitration tribunals.`
      }
    ]
  },
  refund: {
    id: "refund",
    title: "Enterprise Refund & Cancellation Policy",
    version: "2026.1.0",
    effectiveDate: "January 1, 2026",
    summary: "Fair commercial terms governing annual subscription licensing, branch expansion credits, statutory cancellation rights, and pro-rated billing adjustments.",
    sections: [
      {
        heading: "1. Statutory 14-Day Cooling-Off Period",
        content: `For new enterprise organization license purchases, customer organizations are entitled to a full 100% refund within fourteen (14) calendar days of initial deployment, provided no cryptographic payroll WPS batches have been officially committed and submitted to banking clearinghouses.`
      },
      {
        heading: "2. Pro-Rated Adjustments for Downsized Branches",
        content: `If an organization terminates an operating branch or reduces active employee headcount by more than 25%, unused prepaid monthly fees are converted into non-expiring platform credits applicable toward future billing cycles.`
      },
      {
        heading: "3. SLA Downtime Credits",
        content: `In the event that monthly service uptime drops below 99.95%, affected enterprise tenants are automatically eligible for service fee credits ranging from 10% to 50% of the monthly subscription fee, credited to the subsequent invoice upon ticket review.`
      },
      {
        heading: "4. Non-Refundable Custom Engineering",
        content: `Fees paid for custom on-premise ADMS hardware bridge integrations, tailored Typst vector report styling, or dedicated single-tenant database migration work are non-refundable once engineering milestones are signed off.`
      }
    ]
  },
  cookie: {
    id: "cookie",
    title: "Cookie & Local Storage Policy",
    version: "2026.2.0",
    effectiveDate: "October 1, 2026",
    summary: "Detailed classification of persistent and session cookies, local storage keys, purpose definitions, and granular user opt-in controls.",
    sections: [
      {
        heading: "1. Storage Technology Overview",
        content: `This enterprise application uses localized browser storage (HTML5 localStorage and secure HTTP cookies) solely to manage authentication state, user preferences, and accessibility settings. We do NOT use third-party marketing cookies, cross-site trackers, or telemetry beacons.`
      },
      {
        heading: "2. Strictly Necessary Storage (Locked / Mandatory)",
        content: `Essential for platform functionality and security. Cannot be switched off:
• session_token / access_token: Stateful cryptographic token validating your authenticated session against the DragonflyDB session cache (expires upon logout or 30-min idle timeout).
• user_cookie_consent: Records your granular privacy and storage preferences with timestamp and version.
• active_tenant_id: Ensures Row-Level Security isolation across multiple enterprise entities.`
      },
      {
        heading: "3. Functional Storage (User Preference Customization)",
        content: `Enhances your personal experience but non-essential for core operations:
• user_preferences: Remembers your selected language (English LTR / Arabic RTL), date format, time format, and timezone.
• enterprise_theme_mode: Retains your chosen interface theme (Light, Dark, or System Sync).
• enterprise_font_scale: Preserves your preferred UI typography scaling factor for accessibility.`
      },
      {
        heading: "4. Analytics Storage (Performance & Diagnostics)",
        content: `Collects anonymized local telemetry (e.g. view render duration and table sorting latency) to help engineers diagnose performance bottlenecks. Completely free of PII and requires your explicit affirmative opt-in. Unchecked by default.`
      },
      {
        heading: "5. Consent Management & Revocation",
        content: `You may re-examine, modify, or revoke your storage consent toggles at any time by clicking 'Cookie Preferences' in the global footer or accessing the Data Privacy tab inside your User Profile modal.`
      }
    ]
  }
};
