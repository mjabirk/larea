import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  ArrowRight,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenancy } from '../../context/TenancyContext';
import { useLocale } from '../../context/LocaleContext';

function WindowsLogoIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 21 21" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export function LoginView({ onOpenPolicy, onOpenBusinessModal }) {
  const { t } = useLocale();
  const {
    login,
    verify2FA,
    loginWithWindowsSSO,
    ssoConfig,
    ssoError,
    setSsoError,
  } = useAuth();
  const { currentOrganization } = useTenancy();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false); // Unchecked by default (Ethical UX)
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSsoLoading, setIsSsoLoading] = useState(false);

  // Two-Factor Authentication (2FA) step state
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingToken, setPendingToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const isIdleTimeout =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('reason') === 'idle_timeout';

  useEffect(() => {
    if (ssoError) {
      setError(ssoError);
      if (setSsoError) setSsoError('');
    }
  }, [ssoError, setSsoError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setIsLoading(true);

    try {
      const res = await login({ email, password, rememberMe });
      if (res.requires2FA) {
        setRequires2FA(true);
        setPendingToken(res.pendingToken || '');
        setTotpCode('');
      } else if (!res.success) {
        setError(res.error || 'Authentication failed. Please verify your credentials.');
      }
    } catch (err) {
      setError('An unexpected error occurred during sign-in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await verify2FA({
        pendingToken,
        totpCode,
        rememberMe,
      });
      if (!res.success) {
        setError(res.error || 'Invalid 6-digit authenticator code.');
      }
    } catch (err) {
      setError('Failed to verify two-factor authentication code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWindowsSSO = async () => {
    setError('');
    setInfoMessage('');
    setIsSsoLoading(true);
    try {
      const res = await loginWithWindowsSSO({
        mode: 'auto',
        loginHint: email.includes('@') ? email : '',
        rememberMe: true,
      });
      if (res?.redirecting) {
        return;
      }
      if (res?.requiresDomainCredentials) {
        const domainPrefix = `${res.domain || 'COMPANY'}\\`;
        if (!email.includes('\\')) {
          setEmail(domainPrefix);
        }
        setInfoMessage(res.error);
        const inputEl = document.getElementById('login-email');
        if (inputEl) inputEl.focus();
      } else if (!res?.success) {
        setError(res?.error || 'Windows Single Sign-On could not complete.');
      }
    } catch (err) {
      setError('Windows SSO handshake failed. Please sign in with your credentials below.');
    } finally {
      setIsSsoLoading(false);
    }
  };

  const orgName = currentOrganization?.legal_name || 'Enterprise View Engine';

  const ssoModeLabel = ssoConfig?.entra_enabled
    ? 'Microsoft Entra ID'
    : ssoConfig?.kerberos_enabled
    ? 'Windows Domain (IWA)'
    : ssoConfig?.ldap_enabled
    ? `${ssoConfig.ldap_domain || 'Active Directory'} LDAP`
    : 'Windows Identity';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Subtle Brand Bar */}
      <header className="h-16 px-6 sm:px-10 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
            <Building2 className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-bold text-sm sm:text-base tracking-tight text-white truncate max-w-[280px] sm:max-w-none">
            {orgName}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
          <span>{ssoConfig?.sso_available ? `${t('windows_sso_active')} (${ssoModeLabel})` : t('windows_sso_ready')}</span>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="space-y-1.5 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('enterprise_sso')}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {requires2FA ? t('authenticator_2fa') : t('sign_in_workspace')}
            </h1>
            <p className="text-xs text-slate-400">
              {requires2FA
                ? t('totp_helper_text')
                : t('login_subtitle')}
            </p>
          </div>

          {/* Idle Timeout Warning */}
          {isIdleTimeout && !error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-amber-950/80 border border-amber-800/80 text-amber-200 text-xs flex items-start gap-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="leading-snug">
                Your session expired due to inactivity in accordance with corporate security and data regulations. Please sign in again.
              </div>
            </div>
          )}

          {/* Info Alert */}
          {infoMessage && !error && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-blue-950/80 border border-blue-800/80 text-blue-200 text-xs flex items-start gap-2.5 animate-fadeIn"
            >
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="leading-snug">{infoMessage}</div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="leading-snug">{error}</div>
            </div>
          )}

          {requires2FA ? (
            /* Two-Factor Authentication Step */
            <form onSubmit={handleVerify2FA} className="space-y-4 text-xs" noValidate>
              <div className="space-y-1.5">
                <label
                  htmlFor="login-totp-code"
                  className="font-semibold text-slate-200 block text-xs"
                >
                  {t('enter_totp_code')} <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <KeyRound
                    className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="login-totp-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl ps-9 pe-3 py-3 text-white placeholder-slate-600 text-base tracking-[0.35em] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || totpCode.length !== 6}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('verifying_code')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('verify_and_sign_in')}</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRequires2FA(false);
                  setPendingToken('');
                  setTotpCode('');
                  setError('');
                }}
                className="w-full py-2 px-4 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('back_to_sign_in')}</span>
              </button>
            </form>
          ) : (
            <>
              {/* One-Click Sign in with Windows Button */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleWindowsSSO}
                  disabled={isSsoLoading || isLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/60 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2.5 cursor-pointer transition shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {isSsoLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      <span>{t('connecting_windows_idp')}</span>
                    </>
                  ) : (
                    <>
                      <WindowsLogoIcon className="w-4 h-4 shrink-0" />
                      <span>{t('sign_in_windows')}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                        {ssoModeLabel}
                      </span>
                    </>
                  )}
                </button>

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-slate-800" />
                  <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    {t('or_credentials')}
                  </span>
                  <div className="flex-grow border-t border-slate-800" />
                </div>
              </div>

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4 text-xs" noValidate>
                {/* Work Email or Domain Account */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-email"
                    className="font-semibold text-slate-200 block text-xs"
                  >
                    {t('work_email_or_windows')} <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail
                      className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="login-email"
                      type="text"
                      name="email"
                      autoComplete="username"
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@enterprise.com or DOMAIN\username"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl ps-9 pe-3 py-2.5 text-white placeholder-slate-500 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono transition"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="font-semibold text-slate-200 block text-xs"
                    >
                      {t('account_password')} <span className="text-rose-400">*</span>
                    </label>
                  </div>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('password_placeholder')}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl ps-9 pe-10 py-2.5 text-white placeholder-slate-500 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me Checkbox (Unchecked by default) */}
                <div className="pt-1 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                    <span className="text-slate-300 text-xs font-medium">
                      {t('remember_me')}
                    </span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || isSsoLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 mt-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('validating_session')}</span>
                    </>
                  ) : (
                    <>
                      <span>{t('sign_in_workspace')}</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      {/* Statutory Footer */}
      <footer className="py-4 border-t border-slate-800 text-center text-xs text-slate-400 space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-4 text-[11px]">
          {onOpenPolicy && (
            <>
              <button
                type="button"
                onClick={() => onOpenPolicy('privacy')}
                className="hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
              >
                {t('privacy_policy')}
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => onOpenPolicy('terms')}
                className="hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
              >
                {t('terms_of_service')}
              </button>
              <span>•</span>
            </>
          )}
          {onOpenBusinessModal && (
            <button
              type="button"
              onClick={onOpenBusinessModal}
              className="hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
            >
              {t('business_verification')}
            </button>
          )}
        </div>
        <div className="text-[10px] text-slate-500">
          {t('security_tagline')}
        </div>
      </footer>
    </div>
  );
}

