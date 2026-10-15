import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
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
  Save,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useAccessControl } from '../../context/AccessControlContext';
import { DEFAULT_ROLES } from '../../schema/rbacSchema';
import { ResetPasswordModal } from './ResetPasswordModal';

export function UserFormView({ user, onBackToList }) {
  const { users, currentUser, organizations, branches, organization_memberships, updateUser } = useTenancy();
  const { session } = useAuth();
  const { roles } = useAccessControl();
  const { t } = useLocale();

  const activeUser = user || currentUser || users[0];

  // Active stateful DragonflyDB sessions
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingSession, setIsRevokingSession] = useState(false);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);

  // State for modals
  const [sessionToRevoke, setSessionToRevoke] = useState(null);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [notification, setNotification] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const userMembership = organization_memberships.find((m) => m.user_id === activeUser?.id);
  const userRole = activeUser?.role || userMembership?.role || (activeUser?.is_superadmin ? 'Superadmin' : 'Operations Lead');

  // Editable user state
  const [formData, setFormData] = useState({
    full_name: activeUser?.full_name || '',
    email: activeUser?.email || '',
    status: activeUser?.status || 'active',
    is_superadmin: Boolean(activeUser?.is_superadmin),
    role: userRole,
    department: activeUser?.department || 'Operations',
    allowed_cidrs: activeUser?.allowed_cidrs || '192.168.10.0/24, 10.0.4.0/24',
    date_of_birth: activeUser?.date_of_birth || '',
    age_consent_verified: Boolean(activeUser?.age_consent_verified),
    guardian_name: activeUser?.guardian_name || '',
    guardian_email: activeUser?.guardian_email || '',
  });

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
  };

  const handleSaveUser = () => {
    updateUser(activeUser.id, {
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
    });
    setIsDirty(false);
    setNotification('User profile successfully saved.');
    setTimeout(() => setNotification(''), 3000);
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
          setNotification(msg);
          setTimeout(() => setNotification(''), 3500);
        }}
      />

      {/* Top Sticky Tier 2 Control Bar with Back Button */}
      <div className="sticky top-14 z-20 h-14 min-h-[56px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
              <span>Back to Users</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="text-slate-400">Users</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-semibold text-slate-900 dark:text-white text-[15px]">
              {formData.full_name}
            </span>
          </div>

          <span className="font-mono text-[12px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {activeUser.id}
          </span>
        </div>

        {/* Center: Record Status Badge */}
        <div className="hidden sm:flex items-center">
          <span className={formData.status === 'active' ? 'ui-badge-valid' : 'ui-badge-missing'}>
            Status: {formData.status.toUpperCase()}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={handleSaveUser}
              className="h-[36px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
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
                  className="w-full h-[42px] text-[15px] font-normal px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-850 placeholder:text-slate-400 transition"
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
                  className="w-full h-[42px] text-[15px] font-normal px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-850 font-mono placeholder:text-slate-400 transition"
                />
              </div>

              {/* Assigned Role */}
              <div>
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                  Assigned RBAC Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => handleFieldChange('role', e.target.value)}
                  className="w-full h-[42px] text-[13px] font-medium px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer transition"
                >
                  {(roles || DEFAULT_ROLES).map((r) => (
                    <option key={r.id} value={r.name}>
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
                  className="w-full h-[42px] text-[13px] font-medium px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer transition"
                >
                  <option value="Operations">Operations</option>
                  <option value="Human Resources">Human Resources</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Finance">Finance</option>
                  <option value="IT Infrastructure">IT Infrastructure</option>
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
                  className="w-full h-10 text-[14px] font-normal px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-850 font-mono placeholder:text-slate-400 transition"
                />
                <span className="text-[12px] text-slate-500 dark:text-slate-400 block mt-1">
                  Restricts account access to designated networks or IP ranges.
                </span>
              </div>

              {/* Date of Birth & Age Compliance */}
              <div className="md:col-span-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="user-dob" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Date of Birth (GDPR Art. 8 / Age Verification)
                  </label>
                  {currentAge !== null && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${isMinor ? 'ui-badge-pending' : 'ui-badge-valid'
                      }`}>
                      {currentAge} years old {isMinor ? '• Minor (Guardian Consent Required)' : '• Verified Adult'}
                    </span>
                  )}
                </div>
                <input
                  id="user-dob"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleFieldChange('date_of_birth', e.target.value)}
                  className="w-full h-[42px] text-[15px] font-normal px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-850 transition"
                />
              </div>

              {/* Minor Guardian Consent Safeguard if under 18 */}
              {isMinor && (
                <div className="md:col-span-2 p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Statutory Child Privacy Protection & Guardian Consent (COPPA / GDPR Art. 8)</span>
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
                        className="w-full h-[42px] text-[15px] font-normal px-3.5 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
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
                        className="w-full h-[42px] text-[15px] font-normal px-3.5 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono placeholder:text-slate-400"
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

          {/* 2. Active Sessions Panel */}
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
        </div>
      </div>

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
