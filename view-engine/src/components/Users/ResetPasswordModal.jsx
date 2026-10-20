import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X, Check, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { validatePasswordComplexity } from '../../schema/securityValidation';
import { useModalEscape } from '../../hooks/useModalEscape';

export function ResetPasswordModal({ isOpen, onClose, targetUser, onSuccess }) {
  const { resetUserPassword } = useTenancy();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requireChange, setRequireChange] = useState(false); // Unchecked by default (Ethical UX safeguard)
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef(null);

  useModalEscape(onClose, isOpen, modalRef);

  if (!isOpen || !targetUser) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const pwdError = validatePasswordComplexity(password);
    if (pwdError) {
      setError(pwdError);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetUserPassword(targetUser.id, password, requireChange);
      onSuccess && onSuccess(`Password updated successfully for ${targetUser.full_name}.`);
      onClose();
    } catch (err) {
      console.error('Password reset failed:', err);
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-pwd-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden text-slate-800 dark:text-slate-100"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <KeyRound className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 id="reset-pwd-title" className="font-bold text-sm text-slate-100">
                Set / Reset User Password
              </h3>
              <p className="text-[11px] text-slate-400">
                Target: <span className="text-white font-medium">{targetUser.full_name}</span> ({targetUser.email})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close password reset modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-lg font-semibold">
              {error}
            </div>
          )}

          {/* New Password */}
          <div className="space-y-1.5">
            <label htmlFor="modal-new-password" className="font-semibold text-slate-700 dark:text-slate-300 block">
              New Master Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="modal-new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter minimum 8 characters"
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white font-mono pr-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password text" : "Show password text"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label htmlFor="modal-confirm-password" className="font-semibold text-slate-700 dark:text-slate-300 block">
              Confirm New Password <span className="text-rose-500">*</span>
            </label>
            <input
              id="modal-confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            />
          </div>

          {/* Force Change on Next Sign In */}
          <div className="pt-2">
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={requireChange}
                onChange={(e) => setRequireChange(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-amber-600 mt-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              />
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 dark:text-white block">
                  Require password change on next sign-in
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight">
                  User will be prompted to create a personal password upon their next session initialization.
                </span>
              </div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
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
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm Password Reset</span>
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
