import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Globe2,
  Clock,
  Calendar,
  Check,
  Building2,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Sun,
  Moon,
  Laptop,
  Palette,
  Type,
  Printer,
  SlidersHorizontal,
  ShieldAlert,
} from 'lucide-react';
import { useTenancy } from '../context/TenancyContext';
import { useLocale } from '../context/LocaleContext';
import { useTheme, ACCENT_PRESETS, FONT_SCALE_PRESETS } from '../context/ThemeContext';
import { DataDeletionManager } from './legal/DataDeletionManager';

export function UserProfileModal({ isOpen, onClose }) {
  const { currentUser, currentOrganization, currentBranch, userMemberships, resetToSetup } = useTenancy();
  const {
    t,
    language,
    timezone,
    dateFormat,
    timeFormat,
    updatePreferences,
  } = useLocale();

  const {
    themeMode,
    accentColor,
    fontScale,
    setThemeMode,
    setAccentColor,
    setFontScale,
    updateThemePreferences,
  } = useTheme();

  const [activeTab, setActiveTab] = useState('appearance'); // 'appearance' | 'localization'

  // Local state for staged edits
  const [localThemeMode, setLocalThemeMode] = useState(themeMode);
  const [localAccent, setLocalAccent] = useState(accentColor);
  const [localFontScale, setLocalFontScale] = useState(fontScale);

  const [localLang, setLocalLang] = useState(language);
  const [localTz, setLocalTz] = useState(timezone);
  const [localDateFmt, setLocalDateFmt] = useState(dateFormat);
  const [localTimeFmt, setLocalTimeFmt] = useState(timeFormat);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleApply = (e) => {
    e.preventDefault();

    // 1. Apply theme & font scale
    setThemeMode(localThemeMode);
    setAccentColor(localAccent);
    setFontScale(localFontScale);
    updateThemePreferences({
      themeMode: localThemeMode,
      accentColor: localAccent,
      fontScale: localFontScale,
    });

    // 2. Apply localization
    updatePreferences({
      language: localLang,
      timezone: localTz,
      dateFormat: localDateFmt,
      timeFormat: localTimeFmt,
      accentColor: localAccent,
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
  };

  const handleTriggerWizard = () => {
    onClose();
    resetToSetup();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-profile-modal-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden flex flex-col text-slate-800 dark:text-slate-100 max-h-[90vh] my-auto"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs ring-2 ring-slate-800" aria-label="User Avatar">
              {currentUser?.full_name ? currentUser.full_name.slice(0, 2).toUpperCase() : 'SJ'}
            </div>
            <div>
              <h3 id="user-profile-modal-title" className="font-bold text-sm text-slate-100">
                {currentUser?.full_name || 'Sarah Jenkins'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {currentUser?.email || 's.jenkins@apexglobal.com'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close Profile Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="px-6 pt-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 text-xs font-semibold overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`pb-2.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'appearance'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Theme & Appearance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('localization')}
            className={`pb-2.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'localization'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>{t('preferences_title')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`pb-2.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'privacy'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            <span>Privacy & GDPR</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleApply} className="p-6 space-y-6">
          {/* Active Memberships Summary */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>{t('company')}</span>
              </span>
              <strong className="text-slate-800 dark:text-slate-200">{currentOrganization?.legal_name}</strong>
            </div>

            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t('active_role')}</span>
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {userMemberships[0]?.role || 'Root Superadmin'}
              </span>
            </div>
          </div>

          {/* TAB 1: THEME & APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-5 animate-fadeIn">
              {/* Theme Mode: Light / Dark / System */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Interface Theme Mode
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'system', label: 'System', icon: Laptop },
                  ].map((mode) => {
                    const isSelected = localThemeMode === mode.id;
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setLocalThemeMode(mode.id)}
                        className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-slate-800 border-blue-600 text-blue-900 dark:text-blue-300 ring-1 ring-blue-500/30'
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Brand Accent Palette */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-slate-400" />
                  <span>Dynamic Brand Accent (--primary-color)</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {Object.values(ACCENT_PRESETS).map((accent) => {
                    const isSelected = localAccent === accent.id;
                    return (
                      <button
                        key={accent.id}
                        type="button"
                        onClick={() => setLocalAccent(accent.id)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition ${
                          isSelected
                            ? 'bg-slate-50 dark:bg-slate-800 border-slate-800 dark:border-slate-200 text-slate-900 dark:text-white shadow-2xs ring-1 ring-slate-800 dark:ring-slate-300'
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: accent.primary }}
                        />
                        <span className="truncate">{accent.label}</span>
                        {isSelected && <Check className="w-3 h-3 ml-auto text-slate-900 dark:text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* User-Level Font Size Scaling */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-slate-400" />
                    <span>User Interface Font Scaling</span>
                  </label>
                  <span className="text-[11px] font-mono font-semibold text-blue-600 dark:text-blue-400">
                    {localFontScale}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FONT_SCALE_PRESETS.map((preset) => {
                    const isSelected = localFontScale === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setLocalFontScale(preset.id)}
                        className={`p-2 rounded-lg border text-xs font-semibold transition cursor-pointer text-center ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-slate-800 border-blue-600 text-blue-900 dark:text-blue-300 shadow-2xs ring-1 ring-blue-500/30'
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Print & PDF Isolation Notice */}
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
                  <Printer className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                  <span>
                    <strong>Export Isolation Guaranteed:</strong> UI font scale applies to interactive screens only. PDF slips and Excel export reports remain locked to standard 100% typography.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LOCALIZATION & REGIONAL */}
          {activeTab === 'localization' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Language Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('language')}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLocalLang('en')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                      localLang === 'en'
                        ? 'bg-blue-50 dark:bg-slate-800 border-blue-600 text-blue-900 dark:text-blue-300 shadow-2xs'
                        : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>English (LTR)</span>
                    {localLang === 'en' && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocalLang('ar')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer transition font-sans ${
                      localLang === 'ar'
                        ? 'bg-blue-50 dark:bg-slate-800 border-blue-600 text-blue-900 dark:text-blue-300 shadow-2xs'
                        : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>العربية (RTL)</span>
                    {localLang === 'ar' && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                  </button>
                </div>
              </div>

              {/* Date Format */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('date_format')}</span>
                </label>
                <select
                  value={localDateFmt}
                  onChange={(e) => setLocalDateFmt(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 06/10/2026)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-10-06)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 10/06/2026)</option>
                </select>
              </div>

              {/* Time Format */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('time_format')}</span>
                </label>
                <select
                  value={localTimeFmt}
                  onChange={(e) => setLocalTimeFmt(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="12h">12-Hour (08:30 AM / 05:00 PM)</option>
                  <option value="24h">24-Hour Military (08:30 / 17:00)</option>
                </select>
              </div>

              {/* Timezone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {t('timezone')}
                </label>
                <select
                  value={localTz}
                  onChange={(e) => setLocalTz(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="Asia/Qatar">Asia/Qatar (GMT+3)</option>
                  <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="Europe/London">Europe/London (GMT+1)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                </select>
              </div>
            </div>
          )}

          {/* TAB 3: DATA PRIVACY & GDPR SUBJECT RIGHTS */}
          {activeTab === 'privacy' && (
            <div className="space-y-4 animate-fadeIn">
              <DataDeletionManager user={currentUser} />
            </div>
          )}

          {/* Setup Wizard Trigger for Demonstration */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">{t('create_new_org_hint')}</span>
            <button
              type="button"
              onClick={handleTriggerWizard}
              className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('rerun_setup')}</span>
            </button>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {t('close')}
            </button>
            {activeTab !== 'privacy' && (
              <button
                type="submit"
                className="px-4 py-2 rounded-lg btn-primary-dynamic text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>{t('applied')}</span>
                  </>
                ) : (
                  <span>{t('apply_preferences')}</span>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
