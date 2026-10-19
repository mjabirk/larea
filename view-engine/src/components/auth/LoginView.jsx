import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenancy } from '../../context/TenancyContext';

export function LoginView({ onOpenPolicy, onOpenBusinessModal }) {
  const { login } = useAuth();
  const { currentOrganization, users } = useTenancy();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false); // Unchecked by default (Ethical UX)
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isIdleTimeout = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reason') === 'idle_timeout';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await login({ email, password, rememberMe });
      if (!res.success) {
        setError(res.error || 'Authentication failed. Please verify your credentials.');
      } else {
        window.history.replaceState(null, '', '/?view=launcher');
      }
    } catch (err) {
      setError('An unexpected error occurred during sign-in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const orgName = currentOrganization?.legal_name || 'Enterprise View Engine';

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
          <span>FIDO2 / SSO Ready</span>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="space-y-1.5 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Enterprise Single Sign-On</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Sign In to Workspace
            </h1>
            <p className="text-xs text-slate-400">
              Access your authorized enterprise department and shift records.
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

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-xs" noValidate>
            {/* Work Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="font-semibold text-slate-200 block text-xs"
              >
                Work Email Address <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
                  placeholder="admin or name@enterprise.com"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono transition"
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
                  Account Password <span className="text-rose-400">*</span>
                </label>
              </div>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
                  placeholder="Enter your master password"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-10 py-2.5 text-white placeholder-slate-500 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
                  Remember me on this trusted terminal
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 mt-2"
            >
              {isLoading ? (
                <span>Validating Session...</span>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>
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
                Privacy Policy
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => onOpenPolicy('terms')}
                className="hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
              >
                Terms of Service
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
              Business Verification
            </button>
          )}
        </div>
        <div className="text-[10px] text-slate-500">
          Enterprise Security & Identity Access Management • Zero-Trust Session Controls
        </div>
      </footer>
    </div>
  );
}
