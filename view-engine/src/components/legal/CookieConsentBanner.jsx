import React, { useState, useEffect } from 'react';
import {
  Cookie,
  ShieldCheck,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  SlidersHorizontal,
  Lock,
  Sparkles,
} from 'lucide-react';

const STORAGE_KEY = 'user_cookie_consent';
const CONSENT_VERSION = '2026.2.0';

export function CookieConsentBanner({ onOpenPolicy }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showGranularToggles, setShowGranularToggles] = useState(false);

  // Consent states: Strictly Necessary is locked to true
  const [consents, setConsents] = useState({
    strictly_necessary: true, // Always locked
    functional: false,        // Default unselected (prevents dark patterns)
    analytics: false,         // Default unselected (prevents dark patterns)
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // First load: Show banner without blocking background interaction
        setIsOpen(true);
      } else {
        const parsed = JSON.parse(stored);
        if (parsed.version !== CONSENT_VERSION) {
          // Version updated: prompt for re-consent
          setIsOpen(true);
        } else if (parsed.consents) {
          setConsents(parsed.consents);
        }
      }
    } catch (e) {
      console.error('Failed reading cookie consent', e);
      setIsOpen(true);
    }

    // Listen to manual re-open events from footer or profile
    const handleReopen = () => {
      setIsOpen(true);
      setShowGranularToggles(true);
    };

    window.addEventListener('enterprise_reopen_cookie_banner', handleReopen);
    return () => window.removeEventListener('enterprise_reopen_cookie_banner', handleReopen);
  }, []);

  const saveConsent = (updatedConsents) => {
    const payload = {
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      consents: updatedConsents,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('Failed saving cookie consent', e);
    }
    setConsents(updatedConsents);
    setIsOpen(false);
  };

  const handleAcceptAll = () => {
    const allConsents = {
      strictly_necessary: true,
      functional: true,
      analytics: true,
    };
    saveConsent(allConsents);
  };

  const handleRejectNonEssential = () => {
    const essentialOnly = {
      strictly_necessary: true,
      functional: false,
      analytics: false,
    };
    saveConsent(essentialOnly);
  };

  const handleSaveCustom = () => {
    saveConsent(consents);
  };

  if (!isOpen) return null;

  return (
    <aside
      aria-label="Cookie and Local Storage Privacy Controls"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-xl z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xl p-4 sm:p-5 text-slate-800 dark:text-slate-100 animate-fadeIn"
    >
      <div className="space-y-3.5">
        {/* Banner Header */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shrink-0">
            <Cookie className="w-5 h-5" />
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Storage Preferences
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              We use browser storage to keep your session signed in and remember your display preferences. Optional preferences can be customized anytime.
            </p>
          </div>
        </div>

        {/* Granular Toggles Drawer */}
        {showGranularToggles && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 text-xs animate-fadeIn">
            {/* 1. Strictly Necessary */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 dark:text-white">Strictly Necessary</span>
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                    <Lock className="w-2.5 h-2.5" /> Locked
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Stateful session tokens, RLS tenant isolation, and security headers. Essential for platform operation.
                </p>
              </div>
              <input
                type="checkbox"
                checked={true}
                disabled={true}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 cursor-not-allowed opacity-80"
                aria-label="Strictly Necessary Cookies (Always Active)"
              />
            </div>

            <div className="h-[1px] bg-slate-200 dark:bg-slate-700" />

            {/* 2. Functional Storage */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 dark:text-white block">Functional & Localization</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Remembers your language choice (English/Arabic), theme mode, and accessibility font scaling factor.
                </p>
              </div>
              <input
                type="checkbox"
                checked={consents.functional}
                onChange={(e) => setConsents({ ...consents, functional: e.target.checked })}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                aria-label="Functional and Localization Storage"
              />
            </div>

            <div className="h-[1px] bg-slate-200 dark:bg-slate-700" />

            {/* 3. Analytics Storage */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 dark:text-white block">Performance Diagnostics</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Aggregated client-side latency and rendering telemetry. No personal data or cross-site tracking.
                </p>
              </div>
              <input
                type="checkbox"
                checked={consents.analytics}
                onChange={(e) => setConsents({ ...consents, analytics: e.target.checked })}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                aria-label="Performance Diagnostics Telemetry Storage"
              />
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGranularToggles(!showGranularToggles)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded p-1"
              aria-expanded={showGranularToggles}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showGranularToggles ? 'Hide Options' : 'Customize Toggles'}</span>
              {showGranularToggles ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {onOpenPolicy && (
              <button
                type="button"
                onClick={() => onOpenPolicy('cookie')}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer p-1"
              >
                Read Cookie Policy
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRejectNonEssential}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Reject Non-Essential
            </button>

            {showGranularToggles ? (
              <button
                type="button"
                onClick={handleSaveCustom}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Save Preferences
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAcceptAll}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Accept All
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

// Utility to re-open cookie preferences from footer or profile settings
export function reopenCookieConsentBanner() {
  window.dispatchEvent(new CustomEvent('enterprise_reopen_cookie_banner'));
}
