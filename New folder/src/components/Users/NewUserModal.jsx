import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  UserPlus,
  X,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  Calendar,
  AlertTriangle,
  FileText,
  Lock,
  Loader2,
} from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { useAccessControl } from '../../context/AccessControlContext';
import { DEFAULT_ROLES } from '../../schema/rbacSchema';
import { validatePasswordComplexity } from '../../schema/securityValidation';
import { useModalEscape } from '../../hooks/useModalEscape';

export function NewUserModal({ isOpen, onClose, onUserCreated, onOpenPolicy }) {
  const { branches, createUser } = useTenancy();
  const { roles } = useAccessControl();
  const modalRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    date_of_birth: '',
    branch_id: branches[0]?.id || '',
    role_id: roles[0]?.id || 'role_ops_lead',
    initial_password: 'TempAdminPass@2026',
    require_change: false, // Unchecked by default to prevent dark patterns
    terms_consent: false,  // Unchecked by default to prevent dark patterns
    age_consent_verified: false, // Unchecked by default
    guardian_name: '',
    guardian_email: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Calculate age from DOB
  const calculateAge = (dobString) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return null;
    const diffMs = Date.now() - dob.getTime();
    const ageDt = new Date(diffMs);
    return Math.abs(ageDt.getUTCFullYear() - 1970);
  };

  const calculatedAge = calculateAge(formData.date_of_birth);
  const isMinor = calculatedAge !== null && calculatedAge < 18;

  // Keyboard navigation, accessible focus trapping, and escape handling
  useModalEscape(onClose, isOpen, modalRef);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.full_name.trim() || !formData.email.trim()) {
      setError('Please provide full name and work email.');
      return;
    }

    if (!formData.email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    if (!formData.date_of_birth) {
      setError('Date of birth is required for age compliance verification.');
      return;
    }

    if (isMinor) {
      if (!formData.guardian_name.trim() || !formData.guardian_email.trim()) {
        setError('Minor applicant: Parent or legal guardian name and email are mandatory under GDPR Art. 8.');
        return;
      }
      if (!formData.age_consent_verified) {
        setError('Minor applicant: Explicit parental/guardian consent verification must be confirmed.');
        return;
      }
    }

    if (!formData.terms_consent) {
      setError('You must confirm consent to the statutory Terms of Service and Privacy Policy.');
      return;
    }

    const pwdError = validatePasswordComplexity(formData.initial_password);
    if (pwdError) {
      setError(pwdError);
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedRole = (roles || DEFAULT_ROLES).find((r) => r.id === formData.role_id);
      const created = await createUser({
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        date_of_birth: formData.date_of_birth,
        age: calculatedAge,
        is_minor: isMinor,
        guardian_name: isMinor ? formData.guardian_name.trim() : null,
        guardian_email: isMinor ? formData.guardian_email.trim() : null,
        age_consent_verified: isMinor ? formData.age_consent_verified : true,
        terms_consent_recorded: true,
        role_id: formData.role_id,
        role: selectedRole?.name || 'Operations Lead',
        branch_id: formData.branch_id || branches[0]?.id,
        initial_password: formData.initial_password,
        require_change: formData.require_change,
      });

      onUserCreated && onUserCreated(created);
      onClose();
    } catch (err) {
      console.error('User creation failed:', err);
      setError(err.message || 'Failed to provision user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-user-modal-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden text-slate-800 dark:text-slate-100 flex flex-col max-h-[90vh] my-auto"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 id="new-user-modal-title" className="font-bold text-sm text-slate-100">
                Provision New Enterprise Identity
              </h3>
              <p className="text-[11px] text-slate-400">
                GDPR-compliant registration with statutory age verification
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="Close Registration Dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Full Name */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. Tariq Mansour"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Work Email */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Work Email <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="t.mansour@company.com"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
              />
            </div>

            {/* Date of Birth & Age Verification */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Date of Birth (GDPR Art. 8 Verification) <span className="text-rose-500">*</span></span>
                </label>
                {calculatedAge !== null && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    isMinor
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                  }`}>
                    Age: {calculatedAge} ({isMinor ? 'Minor - Consent Required' : 'Adult'})
                  </span>
                )}
              </div>
              <input
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Minor Safeguards / Guardian Information */}
            {isMinor && (
              <div className="md:col-span-2 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 space-y-3 animate-fadeIn">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Statutory Minor Protection (Under 18 Years)</span>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Under GDPR Article 8 and Child Online Privacy regulations, parental or guardian consent must be explicitly recorded before processing minors' personal data.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-amber-950 dark:text-amber-200 block">
                      Parent / Guardian Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.guardian_name}
                      onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
                      placeholder="e.g. Fatima Mansour (Parent)"
                      className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-amber-950 dark:text-amber-200 block">
                      Guardian Email Contact <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.guardian_email}
                      onChange={(e) => setFormData({ ...formData, guardian_email: e.target.value })}
                      placeholder="guardian@family.org"
                      className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={formData.age_consent_verified}
                    onChange={(e) => setFormData({ ...formData, age_consent_verified: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
                    I confirm that verified legal guardian consent (<code>age_consent_verified</code>) has been obtained in accordance with statutory child privacy laws.
                  </span>
                </label>
              </div>
            )}

            {/* Initial Role */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Initial RBAC Role
              </label>
              <select
                value={formData.role_id}
                onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer font-medium"
              >
                {(roles || DEFAULT_ROLES).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} - {r.code} {r.is_system ? '(System)' : '(Custom)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Primary Branch */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Primary Branch
              </label>
              <select
                value={formData.branch_id}
                onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer font-medium"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Temporary Password */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Temporary Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.initial_password}
                  onChange={(e) => setFormData({ ...formData, initial_password: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Ethical Form-Level Consents (Unchecked by default to prevent dark patterns) */}
            <div className="md:col-span-2 space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Ethical Consents & Security Policies:
              </div>

              {/* Terms and Privacy Consent Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.terms_consent}
                  onChange={(e) => setFormData({ ...formData, terms_consent: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                />
                <span className="text-slate-700 dark:text-slate-300 text-[11px] leading-snug">
                  I agree to the statutory <span className="text-blue-600 dark:text-blue-400 font-semibold underline">Terms of Service</span> and acknowledge the <span className="text-blue-600 dark:text-blue-400 font-semibold underline">Privacy Policy</span> regarding enterprise data processing. <span className="text-rose-500">*</span>
                </span>
              </label>

              {/* Require Change Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.require_change}
                  onChange={(e) => setFormData({ ...formData, require_change: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                />
                <span className="text-slate-700 dark:text-slate-300 text-[11px] leading-snug">
                  Require password change on first sign-in (Unchecked by default).
                </span>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Provisioning User...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Provision User</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
