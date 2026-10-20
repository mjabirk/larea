import React, { useState, useEffect } from 'react';
import {
    Building2,
    Banknote,
    ShieldCheck,
    BellRing,
    Clock,
    Save,
    CheckCircle2,
    SlidersHorizontal,
    CreditCard,
    FileSpreadsheet,
} from 'lucide-react';
import { SalaryRulesView } from './SalaryRulesView';
import { APIKeysView } from './APIKeysView';
import { OrganizationsView } from '../Tenancy/OrganizationsView';
import { MailServersView } from './MailServersView';
import { MailTemplatesView } from './MailTemplatesView';
import { MailLogsView } from './MailLogsView';
import { SMSGatewaysView } from './SMSGatewaysView';
import { WhatsAppConfigsView } from './WhatsAppConfigsView';
import { WhatsAppTemplatesView } from './WhatsAppTemplatesView';
import { CommunicationLogsView } from './CommunicationLogsView';
import { AutomationTriggersView } from './AutomationTriggersView';
import { useAuth } from '../../context/AuthContext';

export function ConfigurationView({ activeMenuId = 'wps_config' }) {
    const [savedBanner, setSavedBanner] = useState('');
    const { refreshSSOConfig } = useAuth();

    const getAuthHeaders = () => {
        const token = typeof window !== 'undefined'
            ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
            : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    // Windows SSO & Active Directory Federation Settings State
    const [ssoSettings, setSsoSettings] = useState({
        sso_entra_enabled: false,
        sso_entra_tenant_id: 'common',
        sso_entra_client_id: '',
        sso_entra_client_secret: '',
        sso_entra_redirect_uri: '',
        sso_kerberos_enabled: false,
        sso_kerberos_service_principal: 'HTTP@localhost',
        sso_trust_remote_user_header: false,
        ldap_enabled: false,
        ldap_server_uri: 'ldap://dc01.corp.internal:389',
        ldap_domain: 'CORP',
        ldap_base_dn: 'DC=corp,DC=internal',
        sso_auto_provision: true,
        sso_default_role_id: 'role-viewer',
        sso_auto_login_default: false,
    });

    // Qatar WPS Bank Settings State (Persisted to localStorage / system_metadata)
    const [wpsConfig, setWpsConfig] = useState(() => {
        try {
            const saved = localStorage.getItem('enterprise_qatar_wps_config');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        return {
            employer_eid: '12345678', // 7/8-digit MoI Establishment ID (Computer Card)
            payer_cr_number: 'QA-90281726-CR',
            payer_bank_short_code: 'QNBA',
            payer_iban: 'QA55QNBA000000001122334455667',
            default_salary_frequency: 'M',
            sif_currency: 'QAR',
        };
    });

    // Qatar HR, Labor Law & Expiry Alert Rules State
    const [hrConfig, setHrConfig] = useState(() => {
        try {
            const saved = localStorage.getItem('enterprise_qatar_hr_config');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        return {
            standard_weekly_hours: 40,
            ramadan_weekly_hours: 36,
            overtime_day_rate: 1.25,
            overtime_night_holiday_rate: 1.5,
            eosb_days_per_year: 21, // Qatar Labour Law Art. 54 (min 3 weeks per year)
            qid_alert_days: '60, 30, 15, 7',
            visa_alert_days: '60, 30, 15, 7',
            passport_alert_days: '180, 90, 30',
            notify_hr_email: 'hr-compliance@company.local',
            departments: [
                'Operations',
                'Human Resources',
                'Engineering',
                'Finance & Accounts',
                'General Administration',
                'Sales & Business Dev',
                'IT Infrastructure',
            ],
        };
    });

    const [newDept, setNewDept] = useState('');

    useEffect(() => {
        let isMounted = true;
        const loadSettings = async () => {
            try {
                const [wpsRes, hrRes, ssoRes] = await Promise.all([
                    fetch('/api/v1/settings/qatar_wps_config', { headers: getAuthHeaders() }),
                    fetch('/api/v1/settings/qatar_hr_config', { headers: getAuthHeaders() }),
                    fetch('/api/v1/system/sso-settings', { headers: getAuthHeaders() }),
                ]);

                if (wpsRes.ok) {
                    const wpsData = await wpsRes.json();
                    if (wpsData?.value && typeof wpsData.value === 'object' && Object.keys(wpsData.value).length > 0 && isMounted) {
                        setWpsConfig(wpsData.value);
                        localStorage.setItem('enterprise_qatar_wps_config', JSON.stringify(wpsData.value));
                    }
                }

                if (hrRes.ok) {
                    const hrData = await hrRes.json();
                    if (hrData?.value && typeof hrData.value === 'object' && Object.keys(hrData.value).length > 0 && isMounted) {
                        setHrConfig(hrData.value);
                        localStorage.setItem('enterprise_qatar_hr_config', JSON.stringify(hrData.value));
                    }
                }

                if (ssoRes.ok) {
                    const ssoData = await ssoRes.json();
                    if (ssoData && typeof ssoData === 'object' && isMounted) {
                        setSsoSettings((prev) => ({
                            ...prev,
                            ...ssoData,
                            sso_entra_client_secret: '',
                        }));
                    }
                }
            } catch (err) {
                console.warn('Failed to load settings from PostgreSQL:', err);
            }
        };

        loadSettings();
        return () => {
            isMounted = false;
        };
    }, []);

    // Route to dedicated sub-components if selected
    if (activeMenuId === 'salary_rules') return <SalaryRulesView />;
    if (activeMenuId === 'api_keys') return <APIKeysView />;
    if (activeMenuId === 'orgs') return <OrganizationsView />;
    if (activeMenuId === 'mail_servers') return <MailServersView />;
    if (activeMenuId === 'mail_templates') return <MailTemplatesView />;
    if (activeMenuId === 'mail_logs') return <MailLogsView />;
    if (activeMenuId === 'sms_gateways') return <SMSGatewaysView />;
    if (activeMenuId === 'whatsapp_configs' || activeMenuId === 'whatsapp_accounts') return <WhatsAppConfigsView />;
    if (activeMenuId === 'whatsapp_templates') return <WhatsAppTemplatesView />;
    if (activeMenuId === 'communication_logs' || activeMenuId === 'sms_whatsapp_logs') return <CommunicationLogsView />;
    if (activeMenuId === 'automation_triggers') return <AutomationTriggersView />;

    const handleSaveSso = async (e) => {
        e.preventDefault();
        try {
            const payload = { ...ssoSettings };
            if (!payload.sso_entra_client_secret) {
                delete payload.sso_entra_client_secret;
            }
            const res = await fetch('/api/v1/system/sso-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                if (refreshSSOConfig) await refreshSSOConfig();
                setSavedBanner('Windows Single Sign-On & Identity Federation settings saved to PostgreSQL.');
            } else {
                const err = await res.json().catch(() => ({}));
                setSavedBanner(err.detail || 'Failed to save Windows SSO settings (Superadmin required).');
            }
        } catch (err) {
            console.warn('Failed to persist Windows SSO settings:', err);
            setSavedBanner('Failed to save Windows SSO settings.');
        }
        setTimeout(() => setSavedBanner(''), 3500);
    };

    const handleSaveWps = async (e) => {
        e.preventDefault();
        localStorage.setItem('enterprise_qatar_wps_config', JSON.stringify(wpsConfig));
        try {
            await fetch('/api/v1/settings/qatar_wps_config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ value: wpsConfig }),
            });
        } catch (err) {
            console.warn('Failed to persist WPS settings to PostgreSQL:', err);
        }
        setSavedBanner('Qatar WPS Bank & SIF settings saved.');
        setTimeout(() => setSavedBanner(''), 3000);
    };

    const handleSaveHr = async (e) => {
        e.preventDefault();
        localStorage.setItem('enterprise_qatar_hr_config', JSON.stringify(hrConfig));
        try {
            await fetch('/api/v1/settings/qatar_hr_config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ value: hrConfig }),
            });
        } catch (err) {
            console.warn('Failed to persist HR settings to PostgreSQL:', err);
        }
        setSavedBanner('Qatar Labor Law & Expiry Alert rules saved.');
        setTimeout(() => setSavedBanner(''), 3000);
    };

    const handleAddDepartment = () => {
        const clean = newDept.trim();
        if (!clean || hrConfig.departments.includes(clean)) return;
        setHrConfig((prev) => ({
            ...prev,
            departments: [...prev.departments, clean],
        }));
        setNewDept('');
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn">
            {savedBanner && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{savedBanner}</span>
                </div>
            )}

            {/* 1. QATAR WPS BANK CONFIGURATION */}
            {activeMenuId === 'wps_config' && (
                <form
                    onSubmit={handleSaveWps}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5"
                >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div>
                            <div className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
                                <CreditCard className="w-4 h-4" />
                                <span>Qatar Central Bank (QCB) & Ministry of Labour WPS</span>
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                                Salary Information File (.SIF) Header Settings
                            </h2>
                        </div>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                            <Save className="w-4 h-4" />
                            <span>Save WPS Config</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Employer Establishment ID (MoI Computer Card Number) *
                            </label>
                            <input
                                type="text"
                                required
                                value={wpsConfig.employer_eid}
                                onChange={(e) => setWpsConfig({ ...wpsConfig, employer_eid: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Payer Bank Routing Code (Qatar Clearing Bank) *
                            </label>
                            <select
                                value={wpsConfig.payer_bank_short_code}
                                onChange={(e) => setWpsConfig({ ...wpsConfig, payer_bank_short_code: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                            >
                                <option value="QNBA">QNBA — Qatar National Bank</option>
                                <option value="CBQA">CBQA — Commercial Bank of Qatar</option>
                                <option value="QISB">QISB — Qatar Islamic Bank</option>
                                <option value="DOHB">DOHB — Doha Bank</option>
                                <option value="MAHQ">MAHQ — Masraf Al Rayan</option>
                                <option value="ABQQ">ABQQ — Ahlibank Qatar</option>
                                <option value="QIIB">QIIB — Qatar International Islamic Bank</option>
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Payer IBAN (29-Character QA IBAN) *
                            </label>
                            <input
                                type="text"
                                required
                                value={wpsConfig.payer_iban}
                                onChange={(e) => setWpsConfig({ ...wpsConfig, payer_iban: e.target.value.toUpperCase() })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>
                </form>
            )}

            {/* 2. HR, QATAR LABOUR LAW & EXPIRY ALERT RULES */}
            {(activeMenuId === 'hr_config' || activeMenuId === 'compliance_alerts') && (
                <form
                    onSubmit={handleSaveHr}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-6"
                >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div>
                            <div className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
                                <BellRing className="w-4 h-4" />
                                <span>Qatar Labour Law No. 14 of 2004 & MoI Compliance</span>
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                                HR Statutory Policies, Departments & Document Expiry Alerts
                            </h2>
                        </div>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                            <Save className="w-4 h-4" />
                            <span>Save HR Policies</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                QID / Residency Alert Thresholds (Days)
                            </label>
                            <input
                                type="text"
                                value={hrConfig.qid_alert_days}
                                onChange={(e) => setHrConfig({ ...hrConfig, qid_alert_days: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                EOSB Gratuity Days / Year (Min 21)
                            </label>
                            <input
                                type="number"
                                min={21}
                                value={hrConfig.eosb_days_per_year}
                                onChange={(e) => setHrConfig({ ...hrConfig, eosb_days_per_year: Number(e.target.value) })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Ramadan Weekly Hours Cap
                            </label>
                            <input
                                type="number"
                                value={hrConfig.ramadan_weekly_hours}
                                onChange={(e) => setHrConfig({ ...hrConfig, ramadan_weekly_hours: Number(e.target.value) })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* Departments Manager */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
                        <label className="block font-bold uppercase tracking-wider text-slate-500">
                            Configured Operating Departments ({hrConfig.departments.length})
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {hrConfig.departments.map((dept) => (
                                <span
                                    key={dept}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700"
                                >
                                    <span>{dept}</span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setHrConfig((prev) => ({
                                                ...prev,
                                                departments: prev.departments.filter((d) => d !== dept),
                                            }))
                                        }
                                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 max-w-sm pt-1">
                            <input
                                type="text"
                                value={newDept}
                                onChange={(e) => setNewDept(e.target.value)}
                                placeholder="Add new department..."
                                className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                            <button
                                type="button"
                                onClick={handleAddDepartment}
                                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                            >
                                + Add
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* 3. WINDOWS SINGLE SIGN-ON & IDENTITY FEDERATION (ENTRA OIDC / KERBEROS / AD LDAP) */}
            {activeMenuId === 'windows_sso' && (
                <form
                    onSubmit={handleSaveSso}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-6"
                >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div>
                            <div className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
                                <ShieldCheck className="w-4 h-4" />
                                <span>Enterprise Identity & Windows Single Sign-On</span>
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                                Microsoft Entra ID (OIDC), Kerberos SPNEGO & Active Directory Federation
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Configure web-based Windows authentication for multi-user Linux/WSL server deployments accessed by remote Windows client workstations.
                            </p>
                        </div>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                            <Save className="w-4 h-4" />
                            <span>Save SSO Settings</span>
                        </button>
                    </div>

                    {/* Section A: Microsoft Entra ID (Azure AD) OIDC v2.0 with PKCE */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                                    1. Microsoft Entra ID (Azure AD) OpenID Connect v2.0 + PKCE
                                </h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Enables seamless one-click "Sign in with Windows" using Windows Hello, PRT, and Entra ID conditional access.
                                </p>
                            </div>
                            <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={Boolean(ssoSettings.sso_entra_enabled)}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_entra_enabled: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                                />
                                <span>Enable Entra ID OIDC</span>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Directory (Tenant) ID
                                </label>
                                <input
                                    type="text"
                                    value={ssoSettings.sso_entra_tenant_id || ''}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_entra_tenant_id: e.target.value })}
                                    placeholder="common or 00000000-0000-0000-0000-000000000000"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Application (Client) ID
                                </label>
                                <input
                                    type="text"
                                    value={ssoSettings.sso_entra_client_id || ''}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_entra_client_id: e.target.value })}
                                    placeholder="00000000-0000-0000-0000-000000000000"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Client Secret (Optional for Confidential Client)
                                </label>
                                <input
                                    type="password"
                                    value={ssoSettings.sso_entra_client_secret || ''}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_entra_client_secret: e.target.value })}
                                    placeholder={ssoSettings.sso_entra_client_secret_configured ? '•••••••• (Configured — leave blank to keep)' : 'Enter Entra Client Secret'}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    OAuth2 Redirect URI (Optional Override)
                                </label>
                                <input
                                    type="text"
                                    value={ssoSettings.sso_entra_redirect_uri || ''}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_entra_redirect_uri: e.target.value })}
                                    placeholder={typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://erp.company.com/'}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section B: HTTP SPNEGO / Kerberos & Reverse Proxy */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                                    2. Integrated Windows Authentication (HTTP SPNEGO / Kerberos)
                                </h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Zero-prompt intranet Single Sign-On for domain-joined Windows PCs using Kerberos tickets or a trusted reverse proxy.
                                </p>
                            </div>
                            <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={Boolean(ssoSettings.sso_kerberos_enabled)}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_kerberos_enabled: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                                />
                                <span>Enable Kerberos SPNEGO</span>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Kerberos Service Principal Name (SPN)
                                </label>
                                <input
                                    type="text"
                                    value={ssoSettings.sso_kerberos_service_principal || ''}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_kerberos_service_principal: e.target.value })}
                                    placeholder="HTTP@erp.corp.internal"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                            <div className="pt-4">
                                <label className="flex items-start gap-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(ssoSettings.sso_trust_remote_user_header)}
                                        onChange={(e) => setSsoSettings({ ...ssoSettings, sso_trust_remote_user_header: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 mt-0.5 cursor-pointer"
                                    />
                                    <div>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                            Trust Reverse-Proxy Header (X-Remote-User / X-Forwarded-User)
                                        </span>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                            Enable only when Nginx/Apache/IIS terminates Kerberos or OAuth2 Proxy in front of FastAPI.
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Section C: Active Directory LDAP / LDAPS Bind */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                                    3. Active Directory LDAP / LDAPS Direct Authentication
                                </h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Allows users to sign in on the ERP login form using their Windows domain credentials (DOMAIN\username or user@domain).
                                </p>
                            </div>
                            <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={Boolean(ssoSettings.ldap_enabled)}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, ldap_enabled: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                                />
                                <span>Enable AD LDAP Bind</span>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    LDAP / LDAPS Server URI
                                </label>
                                <input
                                    type="text"
                                    value={ssoSettings.ldap_server_uri || ''}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, ldap_server_uri: e.target.value })}
                                    placeholder="ldaps://dc01.corp.internal:636"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Active Directory NetBIOS / Domain
                                </label>
                                <input
                                    type="text"
                                    value={ssoSettings.ldap_domain || ''}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, ldap_domain: e.target.value })}
                                    placeholder="CORP"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Search Base DN
                                </label>
                                <input
                                    type="text"
                                    value={ssoSettings.ldap_base_dn || ''}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, ldap_base_dn: e.target.value })}
                                    placeholder="DC=corp,DC=internal"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section D: Just-in-Time (JIT) User Provisioning & Default Auto-SSO */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                            4. Just-In-Time (JIT) Account Provisioning & Auto-Login Policy
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                            <label className="flex items-start gap-2.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(ssoSettings.sso_auto_provision)}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_auto_provision: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 mt-0.5 cursor-pointer"
                                />
                                <div>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                        Auto-Provision New Windows Users
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                        Automatically create an ERP user account on first verified Windows sign-in.
                                    </span>
                                </div>
                            </label>

                            <label className="flex items-start gap-2.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(ssoSettings.sso_auto_login_default)}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_auto_login_default: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 mt-0.5 cursor-pointer"
                                />
                                <div>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                        Default Silent Kerberos Auto-Login
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                        Attempt silent SPNEGO sign-in on boot for all domain workstations.
                                    </span>
                                </div>
                            </label>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Default Role for Auto-Provisioned Users
                                </label>
                                <select
                                    value={ssoSettings.sso_default_role_id || 'role-viewer'}
                                    onChange={(e) => setSsoSettings({ ...ssoSettings, sso_default_role_id: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                                >
                                    <option value="role-viewer">role-viewer (Read-Only Staff)</option>
                                    <option value="role-supervisor">role-supervisor (Site Supervisor)</option>
                                    <option value="role-hr-manager">role-hr-manager (HR Manager)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
}