import React from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, Clock, ArrowRight } from 'lucide-react';

export function SessionExpiringModal({ isOpen, secondsRemaining, onStayLoggedIn }) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expiring-title"
      aria-describedby="session-expiring-desc"
    >
      <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/60 rounded-2xl shadow-2xl p-6 sm:p-7 max-w-md w-full space-y-5 text-slate-900 dark:text-slate-100 ring-4 ring-amber-500/10">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 id="session-expiring-title" className="text-base font-bold text-slate-900 dark:text-white">
              Session Expiring
            </h3>
            <p id="session-expiring-desc" className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              You have been inactive. For security under Qatar banking & data regulations, your session will lock in{' '}
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                {secondsRemaining} seconds
              </span>.
            </p>
          </div>
        </div>

        {/* Countdown visual progress bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-amber-500 h-full transition-all duration-1000 ease-linear rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, (secondsRemaining / 60) * 100))}%` }}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onStayLoggedIn}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition shadow-xs flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span>Stay Logged In</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
