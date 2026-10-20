import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  ShieldCheck,
  Globe2,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Lock,
  Mail,
  User,
  Clock,
  DollarSign,
  MapPin,
  X,
  Palette,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';

const ACCENT_COLORS = [
  { id: 'blue', label: 'Enterprise Blue', hex: '#2563eb', bgClass: 'bg-blue-600' },
  { id: 'indigo', label: 'Executive Indigo', hex: '#4f46e5', bgClass: 'bg-indigo-600' },
  { id: 'emerald', label: 'Fintech Emerald', hex: '#059669', bgClass: 'bg-emerald-600' },
  { id: 'violet', label: 'Modern Violet', hex: '#7c3aed', bgClass: 'bg-violet-600' },
];

export function SetupWizard({ isOpen, onClose }) {
  const { completeSetupWizard, closeSetupWizard } = useTenancy();
  const { t, language, updatePreferences } = useLocale();
  const { activateSystem, isSystemInitialized } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Clean Slate Organization Data
  const [orgData, setOrgData] = useState({
    legal_name: '',
    tax_id: '',
    base_currency: 'USD',
    default_timezone: 'UTC',
    primary_branch_name: '',
    branch_city: '',
    branch_code: '',
  });

  // Step 2: Clean Slate Root Superadmin Data
  const [adminData, setAdminData] = useState({
    full_name: '',
    email: '',
    date_of_birth: '',
    password: '',
    confirm_password: '',
  });

  // Step 3: Localization & Ethical Statutory Preferences
  const [prefData, setPrefData] = useState({
    language: language || 'en',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    accentColor: 'blue',
    terms_consent: false,     // Unchecked by default (prevent dark patterns)
    telemetry_opt_in: false,  // Unchecked by default
  });

  const [error, setError] = useState('');
  const modalRef = useRef(null);

  // Keyboard navigation & accessible focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || isSystemInitialized) return null;

  const calculateAge = (dobString) => {
    if (!dobString) return 0;
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return 0;
    const diffMs = Date.now() - dob.getTime();
    return Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      closeSetupWizard();
    }
  };

  const handleNext = () => {
    setError('');
    if (currentStep === 1) {
      if (!orgData.legal_name.trim() || !orgData.primary_branch_name.trim()) {
        setError('Please provide organization legal name and primary branch name.');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!adminData.full_name.trim() || !adminData.email.trim() || !adminData.password) {
        setError('Please complete all superadmin fields.');
        return;
      }
      if (!adminData.date_of_birth) {
        setError('Date of birth is required for superadmin age verification.');
        return;
      }
      const age = calculateAge(adminData.date_of_birth);
      if (age < 18) {
        setError('Root Superadmin must be an adult (at least 18 years of age) under statutory governance rules.');
        return;
      }
      if (adminData.password !== adminData.confirm_password) {
        setError('Passwords do not match.');
        return;
      }
      setCurrentStep(3);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prefData.terms_consent) {
      setError('You must affirmatively agree to the statutory Terms of Service and Privacy Policy to complete initialization.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      updatePreferences(prefData);
      if (activateSystem) {
        const res = await activateSystem({ orgData, adminData, prefData });
        if (res && !res.success) {
          setError(res.error || 'Initialization failed. Please check server logs.');
          setIsSubmitting(false);
          return;
        }
      }
      if (completeSetupWizard) {
        completeSetupWizard({ orgData, adminData, prefData });
      }
      if (closeSetupWizard) {
        closeSetupWizard();
      }
      if (onClose) {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Setup submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-wizard-title"
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Wizard Header */}
        <div className="bg-slate-900 text-white p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[11px] font-semibold tracking-wide border border-blue-400/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('setup_title')}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-100 tracking-tight">
              Enterprise Initialization Wizard
            </h2>
            <p className="text-xs text-slate-400">
              {t('setup_subtitle')}
            </p>
          </div>

          {isSystemInitialized && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title={t('close')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 3-Step Stepper Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
          {[
            { num: 1, title: t('step1_org'), icon: Building2 },
            { num: 2, title: t('step2_admin'), icon: ShieldCheck },
            { num: 3, title: t('step3_pref'), icon: Globe2 },
          ].map((stg) => {
            const isCompleted = currentStep > stg.num;
            const isCurrent = currentStep === stg.num;
            const Icon = stg.icon;

            return (
              <div key={stg.num} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition shadow-2xs ${
                    isCompleted
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : stg.num}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${
                    isCurrent ? 'text-slate-900 font-bold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {stg.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Form Body */}
        <div className="p-8 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold">
              {error}
            </div>
          )}

          {/* STEP 1: ORGANIZATION DETAILS */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('org_legal_name')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgData.legal_name}
                    onChange={(e) => setOrgData({ ...orgData, legal_name: e.target.value })}
                    placeholder="e.g. Acme Corporation"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('tax_id')}
                  </label>
                  <input
                    type="text"
                    value={orgData.tax_id}
                    onChange={(e) => setOrgData({ ...orgData, tax_id: e.target.value })}
                    placeholder="e.g. TAX-90281726-CR"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('base_currency')}
                  </label>
                  <select
                    value={orgData.base_currency}
                    onChange={(e) => setOrgData({ ...orgData, base_currency: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white cursor-pointer"
                  >
                    <option value="QAR">QAR (Qatari Riyal)</option>
                    <option value="SAR">SAR (Saudi Riyal)</option>
                    <option value="AED">AED (UAE Dirham)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('default_timezone')}
                  </label>
                  <select
                    value={orgData.default_timezone}
                    onChange={(e) => setOrgData({ ...orgData, default_timezone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white cursor-pointer"
                  >
                    <option value="Asia/Qatar">Asia/Qatar (GMT+3)</option>
                    <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="Europe/London">Europe/London (GMT+1)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('primary_branch_name')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgData.primary_branch_name}
                    onChange={(e) => setOrgData({ ...orgData, primary_branch_name: e.target.value })}
                    placeholder="e.g. Headquarters Campus"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('branch_city')}
                  </label>
                  <input
                    type="text"
                    value={orgData.branch_city}
                    onChange={(e) => setOrgData({ ...orgData, branch_city: e.target.value })}
                    placeholder="e.g. Doha"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: ROOT SUPERADMIN */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  {t('admin_name')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={adminData.full_name}
                  onChange={(e) => setAdminData({ ...adminData, full_name: e.target.value })}
                  placeholder="e.g. Jane Doe"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  {t('admin_email')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={adminData.email}
                  onChange={(e) => setAdminData({ ...adminData, email: e.target.value })}
                  placeholder="e.g. admin@acmecorp.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                />
              </div>

              {/* Date of Birth & Age Compliance */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Date of Birth (Statutory Adult Verification) <span className="text-rose-500">*</span>
                  </label>
                  {adminData.date_of_birth && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Age: {calculateAge(adminData.date_of_birth)} (Verified Adult)
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={adminData.date_of_birth}
                  onChange={(e) => setAdminData({ ...adminData, date_of_birth: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('admin_password')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={adminData.password}
                    onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                    placeholder="Enter master password (min 8 chars)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('confirm_password')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={adminData.confirm_password}
                    onChange={(e) => setAdminData({ ...adminData, confirm_password: e.target.value })}
                    placeholder="Re-enter master password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PERSONAL PREFERENCES & BRAND ACCENT */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-fadeIn">
              {/* Language */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  {t('language')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPrefData({ ...prefData, language: 'en' })}
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                      prefData.language === 'en'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>English (LTR)</span>
                    {prefData.language === 'en' && <Check className="w-4 h-4 text-blue-600" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrefData({ ...prefData, language: 'ar' })}
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer transition font-sans ${
                      prefData.language === 'ar'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>العربية (RTL)</span>
                    {prefData.language === 'ar' && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                </div>
              </div>

              {/* Date & Time Formats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('date_format')}
                  </label>
                  <select
                    value={prefData.dateFormat}
                    onChange={(e) => setPrefData({ ...prefData, dateFormat: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white cursor-pointer"
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 06/10/2026)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-10-06)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 10/06/2026)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('time_format')}
                  </label>
                  <select
                    value={prefData.timeFormat}
                    onChange={(e) => setPrefData({ ...prefData, timeFormat: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white cursor-pointer"
                  >
                    <option value="12h">12-Hour (08:30 AM / 05:00 PM)</option>
                    <option value="24h">24-Hour Military (08:30 / 17:00)</option>
                  </select>
                </div>
              </div>

              {/* Brand Accent Color */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('accent_theme')}</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {ACCENT_COLORS.map((col) => {
                    const isSelected = prefData.accentColor === col.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setPrefData({ ...prefData, accentColor: col.id })}
                        className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-2 cursor-pointer transition ${
                          isSelected
                            ? 'bg-slate-50 border-slate-800 text-slate-900 shadow-2xs font-semibold ring-1 ring-slate-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full ${col.bgClass} shrink-0`} />
                        <span className="truncate">{col.label.split(' ')[1]}</span>
                        {isSelected && <Check className="w-3 h-3 text-slate-900 ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Statutory Ethical Opt-In Checkboxes (Unchecked by default to prevent dark patterns) */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Statutory Consent & Legal Compliance Policies</span>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefData.terms_consent}
                    onChange={(e) => setPrefData({ ...prefData, terms_consent: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                  />
                  <span className="text-slate-700 text-xs leading-snug">
                    I confirm that I have read and affirmatively accept the statutory <strong>Terms of Service</strong>, <strong>Privacy Policy</strong>, and <strong>GDPR Data Processing Agreement</strong>. <span className="text-rose-500">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefData.telemetry_opt_in}
                    onChange={(e) => setPrefData({ ...prefData, telemetry_opt_in: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                  />
                  <span className="text-slate-600 text-[11px] leading-snug">
                    Optional: Opt-in to receive statutory security advisory alerts and platform upgrade bulletins. (Unchecked by default).
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => prev - 1)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                <span>{t('back')}</span>
              </button>
            )}
          </div>

          <div>
            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
              >
                <span>{t('continue')}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>{t('complete_setup')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
