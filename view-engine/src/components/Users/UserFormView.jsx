import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Laptop,
  Globe,
  Trash2,
  Clock,
  KeyRound,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Lock,
  Mail,
  ChevronDown,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useAccessControl } from '../../context/AccessControlContext';
import { DEFAULT_ROLES } from '../../schema/rbacSchema';
import { validatePasswordComplexity } from '../../schema/securityValidation';
import { ResetPasswordModal } from './ResetPasswordModal';
import { RecordChatter } from '../common/RecordChatter';
import { notifyRecordChatterUpdated } from '../../utils/urlState';

export function UserFormView({ user, usersList = [], onSelectUser, onBackToList }) {
  const { users, currentUser, organizations, branches, organization_memberships, updateUser, createUser, refreshTenancyData } = useTenancy();
  const { session } = useAuth();
  const { roles } = useAccessControl();
  const { t } = useLocale();

  useEffect(() => {
    if (refreshTenancyData && (organizations.length === 0 || branches.length === 0 || users.length === 0)) {
      refreshTenancyData();
    }
  }, [organizations.length, branches.length, users.length, refreshTenancyData]);

  const isCreateMode = !user?.id;
  const activeUser = isCreateMode ? null : user;

  // Active stateful DragonflyDB sessions
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingSession, setIsRevokingSession] = useState(false);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);

  // State for modals & alerts
  const [sessionToRevoke, setSessionToRevoke] = useState(null);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [notification, setNotification] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Unsaved changes beforeunload listener
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleBackToList = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and return to users list?')) {
      return;
    }
    onBackToList?.();
  };

  const getInitialFormData = useCallback((targetUser) => {
    if (!targetUser?.id) {
      return {
        full_name: '',
        email: '',
        status: 'active',
        is_superadmin: false,
        role: 'Operations Lead',
        department: 'Operations',
        allowed_cidrs: '0.0.0.0/0',
        date_of_birth: '',
        initial_password: 'TempAdminPass@2026',
        age_consent_verified: false,
        guardian_name: '',
        guardian_email: '',
        windows_upn: '',
        ad_sam_account: '',
        auth_provider: 'local',
        auto_sso_enabled: false,
      };
    }
    const mem = organization_memberships.find((m) => m.user_id === targetUser.id);
    const uRole = targetUser.role || mem?.role || (targetUser.is_superadmin ? 'Superadmin' : 'Operations Lead');
    return {
      full_name: targetUser.full_name || '',
      email: targetUser.email || '',
      status: targetUser.status || 'active',
      is_superadmin: Boolean(targetUser.is_superadmin),
      role: uRole,
      department: targetUser.department || 'Operations',
      allowed_cidrs: targetUser.allowed_cidrs || '192.168.10.0/24, 10.0.4.0/24',
      date_of_birth: targetUser.date_of_birth || '',
      initial_password: '',
      age_consent_verified: Boolean(targetUser.age_consent_verified),
      guardian_name: targetUser.guardian_name || '',
      guardian_email: targetUser.guardian_email || '',
      windows_upn: targetUser.windows_upn || '',
      ad_sam_account: targetUser.ad_sam_account || '',
      auth_provider: targetUser.auth_provider || 'local',
      auto_sso_enabled: Boolean(targetUser.auto_sso_enabled),
    };
  }, [organization_memberships]);

  // Editable user state
  const [formData, setFormData] = useState(() => getInitialFormData(user));

  // Reset form data and isDirty whenever user?.id changes (e.g. record pager or switching from New to existing)
  useEffect(() => {
    setFormData(getInitialFormData(user));
    setIsDirty(false);
    setValidationError('');
  }, [user?.id, getInitialFormData]);

  // Calculate current index and total for Record Pager
  const currentIndex = usersList.findIndex((u) => u.id === (user?.id || activeUser?.id));
  const totalUsers = usersList.length;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < totalUsers - 1;

  const handlePrevious = () => {
    if (hasPrevious) {
      if (isDirty && !window.confirm("You have unsaved changes. Discard and navigate to previous user?")) return;
      onSelectUser(usersList[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      if (isDirty && !window.confirm("You have unsaved changes. Discard and navigate to next user?")) return;
      onSelectUser(usersList[currentIndex + 1]);
    }
  };

  const calculateAge = (dob) => {
    if (!dob) return null;
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return isNaN(age) ? null : age;
  };

  const currentAge = calculateAge(formData.date_of_birth);
  const isMinor = currentAge !== null && currentAge < 18;

  const isCurrentSuperadmin = Boolean(currentUser?.is_superadmin);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setValidationError('');
  };

  const handleSave = async () => {
    setValidationError('');

    if (!formData.full_name.trim() || !formData.email.trim()) {
      setValidationError('Please provide full name and work email.');
      return;
    }
    if (!formData.email.includes('@')) {
      setValidationError('Please provide a valid email address.');
      return;
    }

    if (isCreateMode) {
      const pwdError = validatePasswordComplexity(formData.initial_password);
      if (pwdError) {
        setValidationError(pwdError);
        return;
      }

      if (isMinor) {
        if (!formData.guardian_name.trim() || !formData.guardian_email.trim()) {
          setValidationError('Parent or guardian name and email are required for users under 18.');
          return;
        }
        if (!formData.age_consent_verified) {
          setValidationError('Parent or guardian consent must be confirmed for users under 18.');
          return;
        }
      }

      setIsSaving(true);
      try {
        const selectedRoleObj = (roles || DEFAULT_ROLES).find((r) => r.name === formData.role);
        const createdUser = await createUser({
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          role: formData.role,
          role_id: selectedRoleObj?.id,
          department: formData.department,
          branch_id: branches[0]?.id,
          initial_password: formData.initial_password,
          date_of_birth: formData.date_of_birth || null,
          age: currentAge,
          guardian_name: isMinor ? formData.guardian_name.trim() : null,
          guardian_email: isMinor ? formData.guardian_email.trim() : null,
          windows_upn: formData.windows_upn.trim() || null,
          ad_sam_account: formData.ad_sam_account.trim() || null,
          auth_provider: formData.auth_provider || 'local',
          auto_sso_enabled: Boolean(formData.auto_sso_enabled),
        });

        setIsDirty(false);
        setNotification('User created successfully.');
        setTimeout(() => setNotification(''), 3000);
        if (onSelectUser && createdUser) {
          onSelectUser(createdUser);
        }
      } catch (err) {
        console.error('Failed to create user:', err);
        setValidationError(err.message || 'Failed to create user.');
      } finally {
        setIsSaving(false);
      }
    } else {
      if (!activeUser?.id) return;
      setIsSaving(true);
      try {
        await updateUser(activeUser.id, {
          full_name: formData.full_name,
          email: formData.email,
          status: formData.status,
          is_superadmin: formData.is_superadmin,
          department: formData.department,
          allowed_cidrs: formData.allowed_cidrs,
          role: formData.role,
          date_of_birth: formData.date_of_birth,
          age_consent_verified: formData.age_consent_verified,
          guardian_name: formData.guardian_name,
          guardian_email: formData.guardian_email,
          windows_upn: formData.windows_upn.trim() || null,
          ad_sam_account: formData.ad_sam_account.trim() || null,
          auth_provider: formData.auth_provider || 'local',
          auto_sso_enabled: Boolean(formData.auto_sso_enabled),
        });
        setIsDirty(false);
        notifyRecordChatterUpdated(activeUser.id, 'users');
        setNotification('User profile successfully saved.');
        setTimeout(() => setNotification(''), 3000);
      } catch (err) {
        console.error('Failed to save user:', err);
        setValidationError('Failed to save user.');
        setTimeout(() => setValidationError(''), 3000);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDiscard = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard all changes?')) {
      return;
    }
    setFormData(getInitialFormData(user));
    setIsDirty(false);
    setValidationError('');
  };

  // Fetch real DragonflyDB active sessions for inspected identity
  const fetchSessions = useCallback(async () => {
    if (!activeUser?.id) return;
    setIsLoadingSessions(true);
    try {
      const token = session?.token || localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token');
      const res = await fetch(`/api/v1/auth/sessions?user_id=${activeUser.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const currentToken = data.current_token || session?.token || '';
        const mapped = (data.sessions || []).map((s) => {
          const isCurrent = s.token === currentToken || s.token === session?.token;
          let deviceName = 'Desktop Workstation';
          const ua = s.user_agent || '';
          if (ua.includes('iPhone') || ua.includes('iPad')) deviceName = 'iOS Mobile App';
          else if (ua.includes('Android')) deviceName = 'Android Mobile';
          else if (ua.includes('Macintosh') || ua.includes('Mac OS')) deviceName = 'Safari on macOS';
          else if (ua.includes('Windows')) deviceName = 'Chrome on Windows';
          else if (ua.includes('Linux')) deviceName = 'Linux Client';
          else if (ua) deviceName = ua.slice(0, 36);

          let lastAct = 'Active now';
          if (s.last_active) {
            const diffSec = Math.floor(Date.now() / 1000 - parseInt(s.last_active, 10));
            if (diffSec < 60) lastAct = 'Active now';
            else if (diffSec < 3600) lastAct = `${Math.floor(diffSec / 60)} mins ago`;
            else lastAct = `${Math.floor(diffSec / 3600)} hrs ago`;
          }

          return {
            id: s.token,
            token: s.token,
            ip_address: s.client_ip || '127.0.0.1',
            device: deviceName,
            raw_user_agent: s.user_agent,
            last_activity: lastAct,
            is_current: isCurrent,
            created_at: s.created_at,
          };
        });
        setSessions(mapped);
      }
    } catch (err) {
      console.warn('Failed to load active sessions from backend:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [activeUser?.id, session?.token]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Real DragonflyDB Single Session Revocation
  const confirmRevokeSession = async () => {
    if (!sessionToRevoke) return;
    setIsRevokingSession(true);

    try {
      const token = session?.token || localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token');
      const res = await fetch('/api/v1/auth/sessions/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ token: sessionToRevoke.token }),
      });

      if (res.ok) {
        setNotification(`Session for ${sessionToRevoke.device} (${sessionToRevoke.ip_address}) has been revoked.`);
        setSessionToRevoke(null);
        await fetchSessions();
      } else {
        setNotification('Failed to revoke session. Please try again.');
      }
    } catch (err) {
      console.error('Revocation error:', err);
      setNotification('Network error occurred while revoking session.');
    } finally {
      setIsRevokingSession(false);
      setTimeout(() => setNotification(''), 3500);
    }
  };

  // Real DragonflyDB Revoke All Other Sessions
  const handleRevokeAllOtherSessions = async () => {
    if (!activeUser?.id || isRevokingOthers) return;
    setIsRevokingOthers(true);

    try {
      const token = session?.token || localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token');
      const res = await fetch(`/api/v1/auth/sessions/revoke-others?user_id=${activeUser.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ user_id: activeUser.id, token }),
      });

      if (res.ok) {
        const data = await res.json();
        setNotification(`Successfully revoked ${data.revoked_count || 0} other active sessions.`);
        await fetchSessions();
      } else {
        setNotification('Failed to revoke other sessions.');
      }
    } catch (err) {
      console.error('Revoke others error:', err);
      setNotification('Network error occurred while terminating sessions.');
    } finally {
      setIsRevokingOthers(false);
      setTimeout(() => setNotification(''), 3500);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 animate-fadeIn">
      {/* Reset Password Modal */}
      <ResetPasswordModal
        isOpen={isResetPasswordModalOpen}
        onClose={() => setIsResetPasswordModalOpen(false)}
        targetUser={activeUser}
        onSuccess={(msg) => {
          if (activeUser?.id) notifyRecordChatterUpdated(activeUser.id, 'users');
          setNotification(msg);
          setTimeout(() => setNotification(''), 3500);
        }}
      />

      {/* Standard Global Top Control Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 mb-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Breadcrumbs & Back */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handleBackToList}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5"/>
            <span>Users</span>
          </button>

          <span className="text-slate-400">/</span>
          <span className="font-bold text-slate-900 dark:text-white">
            {formData.full_name || user?.full_name || 'New Identity'}
          </span>
          {!isCreateMode && user?.id && (
            <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
              {user.id.slice(0, 8)}...
            </span>
          )}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
            isCreateMode
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200'
              : formData.status === 'active'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200'
                : 'bg-slate-100 text-slate-600'
          }`}>
            {isCreateMode ? 'New' : (formData.status || 'Draft')}
          </span>
        </div>

        {/* Right: Save, Discard, and Pager */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer ${
              isDirty
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5"/>
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>

          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5"/>
            <span>Discard</span>
          </button>

          {/* Record Pager (1 of N < >) */}
          {!isCreateMode && totalUsers > 0 && currentIndex >= 0 && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-500">
              <span className="mr-1">{currentIndex + 1} of {totalUsers}</span>
              <button
                type="button"
                onClick={handlePrevious}
                disabled={!hasPrevious}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="Previous User"
              >
                <ChevronLeft className="w-3.5 h-3.5"/>
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!hasNext}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="Next User"
              >
                <ChevronRight className="w-3.5 h-3.5"/>
              </button>
            </div>
          )}
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification('')}
            className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {validationError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{validationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setValidationError('')}
            className="text-rose-700 dark:text-rose-400 hover:text-rose-900 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 12-COLUMN RESPONSIVE LAYOUT (8 cols main form / 4 cols right rail) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* MAIN FORM AREA (8 cols): Account Info, Assigned Role, Department, Superadmin */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. Account Credentials & Tenancy Role */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Identity Details & Tenancy Role
                </h3>
              </div>
              <span className="text-[12px] font-mono text-slate-400">
                STATUS: <strong className="text-emerald-600 uppercase">{formData.status}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Full Name */}
              <div>
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => handleFieldChange('full_name', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 dark:focus:text-white transition-colors"
                />
              </div>

              {/* Work Email */}
              <div>
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                  Work Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleFieldChange('email', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 dark:focus:text-white transition-colors font-mono"
                />
              </div>

              {/* Initial Password (Create Mode only) */}
              {isCreateMode && (
                <div className="md:col-span-2">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                    Initial Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.initial_password}
                      onChange={(e) => handleFieldChange('initial_password', e.target.value)}
                      placeholder="Min 10 chars, uppercase, digit, special symbol"
                      className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                    {formData.initial_password && validatePasswordComplexity(formData.initial_password) ? (
                      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {validatePasswordComplexity(formData.initial_password)}
                      </span>
                    ) : formData.initial_password ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Password meets enterprise complexity criteria
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Must contain at least 10 chars, 1 uppercase, 1 digit, and 1 symbol (!@#$%^&*...)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Assigned Role */}
              <div>
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                  Assigned RBAC Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => handleFieldChange('role', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 dark:focus:text-white transition-colors cursor-pointer"
                >
                  {(roles || DEFAULT_ROLES).map((r) => (
                    <option key={r.id} value={r.name} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                      {r.name} - {r.code} {r.is_system ? '(System)' : '(Custom)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                  Department
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => handleFieldChange('department', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 dark:focus:text-white transition-colors cursor-pointer"
                >
                  <option value="Operations" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Operations</option>
                  <option value="Human Resources" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Human Resources</option>
                  <option value="Engineering" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Engineering</option>
                  <option value="Finance" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Finance</option>
                  <option value="IT Infrastructure" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">IT Infrastructure</option>
                </select>
              </div>

              {/* Allowed Office Networks */}
              <div className="md:col-span-2">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                  Allowed Office Networks (IP Ranges)
                </label>
                <input
                  type="text"
                  value={formData.allowed_cidrs}
                  onChange={(e) => handleFieldChange('allowed_cidrs', e.target.value)}
                  placeholder="e.g. 192.168.10.0/24, 10.0.4.0/24"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 dark:focus:text-white transition-colors font-mono"
                />
                <span className="text-[12px] text-slate-500 dark:text-slate-400 block mt-1">
                  Restricts account access to designated networks or IP ranges.
                </span>
              </div>

              {/* Windows SSO & Active Directory Binding */}
              <div className="md:col-span-2 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Windows Single Sign-On & Directory Binding</span>
                  </span>
                  <select
                    value={formData.auth_provider || 'local'}
                    onChange={(e) => handleFieldChange('auth_provider', e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="local">Provider: Local / Hybrid</option>
                    <option value="entra_oidc">Provider: Microsoft Entra ID (OIDC)</option>
                    <option value="kerberos">Provider: Windows Kerberos (SPNEGO)</option>
                    <option value="ldap">Provider: Active Directory (LDAP)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300 block mb-1">
                      Windows User Principal Name (UPN / Entra ID)
                    </label>
                    <input
                      type="text"
                      value={formData.windows_upn || ''}
                      onChange={(e) => handleFieldChange('windows_upn', e.target.value)}
                      placeholder="e.g. user@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300 block mb-1">
                      Active Directory Domain Account (sAMAccountName)
                    </label>
                    <input
                      type="text"
                      value={formData.ad_sam_account || ''}
                      onChange={(e) => handleFieldChange('ad_sam_account', e.target.value)}
                      placeholder="e.g. CORP\jdoe or jdoe"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors font-mono text-xs"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.auto_sso_enabled)}
                    onChange={(e) => handleFieldChange('auto_sso_enabled', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                  />
                  <span className="text-[12px] text-slate-600 dark:text-slate-300">
                    Allow automatic silent Windows SSO sign-in for this user on trusted domain workstations
                  </span>
                </label>
              </div>

              {/* Date of Birth */}
              <div className="md:col-span-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="user-dob" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Date of Birth
                  </label>
                  {currentAge !== null && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${isMinor ? 'ui-badge-pending' : 'ui-badge-valid'
                      }`}>
                      {currentAge} years old{isMinor ? ' • Under 18' : ''}
                    </span>
                  )}
                </div>
                <input
                  id="user-dob"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleFieldChange('date_of_birth', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 dark:focus:text-white transition-colors"
                />
              </div>

              {/* Guardian Consent if under 18 */}
              {isMinor && (
                <div className="md:col-span-2 p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Guardian Consent (Under 18)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="guardian-name" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1">
                        Parent / Legal Guardian Full Name
                      </label>
                      <input
                        id="guardian-name"
                        type="text"
                        value={formData.guardian_name}
                        onChange={(e) => handleFieldChange('guardian_name', e.target.value)}
                        placeholder="e.g. Robert Smith"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 dark:focus:text-white transition-colors"
                      />
                    </div>
                    <div>
                      <label htmlFor="guardian-email" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1">
                        Parent / Legal Guardian Email
                      </label>
                      <input
                        id="guardian-email"
                        type="email"
                        value={formData.guardian_email}
                        onChange={(e) => handleFieldChange('guardian_email', e.target.value)}
                        placeholder="guardian@example.com"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 dark:focus:text-white transition-colors font-mono"
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.age_consent_verified}
                      onChange={(e) => handleFieldChange('age_consent_verified', e.target.checked)}
                      className="w-4 h-4 rounded border-amber-300 text-blue-600 focus:ring-blue-600 mt-0.5 cursor-pointer"
                    />
                    <span className="text-[12px] text-slate-700 dark:text-slate-300 leading-tight">
                      Confirmed written parental/guardian consent on file authorising processing of this minor's workforce and attendance data.
                    </span>
                  </label>
                </div>
              )}

              {/* Superadmin Toggle (Disabled unless current logged in user is superadmin) */}
              <div className="md:col-span-2 pt-2">
                <label
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition ${!isCurrentSuperadmin
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/20 opacity-70 cursor-not-allowed'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 cursor-pointer hover:bg-slate-100/60'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.is_superadmin}
                    disabled={!isCurrentSuperadmin}
                    onChange={(e) => handleFieldChange('is_superadmin', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white text-[13px] block">
                        Grant Root Superadmin Privileges
                      </span>
                      {!isCurrentSuperadmin && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                          <Lock className="w-3 h-3" />
                          <span>Requires Superadmin Authority</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Provides unrestricted platform authority across all organizations and system audit trails.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT SIDEBAR (4 cols): Administrative Security Card + Active Sessions Table */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 space-y-6 sticky top-[72px]">
          {/* 1. Administrative Security Card (Prominent Set / Reset Password) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <KeyRound className="w-4 h-4 text-slate-400" />
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                Administrative Security
              </h3>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                Manage access credentials and password rotation requirements for this identity.
              </p>

              <button
                type="button"
                onClick={() => setIsResetPasswordModalOpen(true)}
                disabled={!isCurrentSuperadmin}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition shadow-xs ${isCurrentSuperadmin
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                  }`}
                title={!isCurrentSuperadmin ? 'Only Superadmins can reset passwords' : ''}
              >
                <KeyRound className="w-4 h-4" />
                <span>Set / Reset Password</span>
              </button>

              {!isCurrentSuperadmin && (
                <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>Restricted to Root Superadmins</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Active Sessions Panel - Only show when editing an existing user */}
          {!isCreateMode && Boolean(user?.id) && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Active Sessions ({sessions.length})
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Logged in devices & browsers
                  </p>
                </div>

                {sessions.length > 1 && (
                  <button
                    type="button"
                    disabled={isRevokingOthers}
                    onClick={handleRevokeAllOtherSessions}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    title="Revoke all sessions except the current device"
                  >
                    {isRevokingOthers && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{isRevokingOthers ? 'Revoking...' : 'Revoke Others'}</span>
                  </button>
                )}
              </div>

              {/* Sessions List */}
              <div className="space-y-3">
                {isLoadingSessions ? (
                  <div className="py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>Loading active sessions...</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No active sessions found.
                  </div>
                ) : (
                  sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className={`p-3.5 rounded-xl border transition space-y-2.5 ${sess.is_current
                          ? 'border-blue-300 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                        }`}
                    >
                      {/* Top Row: Device & Current indicator */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {sess.device.includes('iPhone') || sess.device.includes('Mobile') ? (
                            <Smartphone className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                          ) : (
                            <Laptop className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                          )}
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 leading-tight">
                            {sess.device}
                          </span>
                        </div>

                        {sess.is_current && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Current</span>
                          </span>
                        )}
                      </div>

                      {/* Metadata: IP & Activity */}
                      <div className="space-y-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <div className="flex items-center justify-between">
                          <span>IP Address:</span>
                          <strong className="text-slate-700 dark:text-slate-300">{sess.ip_address}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Last Activity:</span>
                          <span className="text-slate-600 dark:text-slate-300 font-sans">{sess.last_activity}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span>Location:</span>
                          <span className="text-slate-400 font-sans">{sess.location}</span>
                        </div>
                      </div>

                      {/* Action: Red Revoke Button */}
                      <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setSessionToRevoke(sess)}
                          className="px-2.5 py-1 rounded-md bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition border border-rose-200 dark:border-rose-900/40"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500" />
                          <span>Revoke Session</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Instant Activity & Audit Log */}
      {!isCreateMode && activeUser?.id && (
        <RecordChatter
          entityType="users"
          entityId={activeUser.id}
          entityName={activeUser.full_name}
        />
      )}

      {/* CONFIRMATION MODAL FOR SESSION REVOCATION */}
      {sessionToRevoke && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Confirm Session Revocation
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Are you sure you want to disconnect this device?
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs space-y-1 text-slate-700 dark:text-slate-300 font-mono">
              <div>Device: <strong className="font-sans">{sessionToRevoke.device}</strong></div>
              <div>IP: <strong>{sessionToRevoke.ip_address}</strong></div>
              {sessionToRevoke.is_current && (
                <div className="text-amber-600 dark:text-amber-400 font-sans font-semibold pt-1">
                  ⚠️ Note: This is your current active device! You will be required to log in again.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isRevokingSession}
                onClick={() => setSessionToRevoke(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRevokingSession}
                onClick={confirmRevokeSession}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRevokingSession ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Revoking...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Revoke Immediately</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
