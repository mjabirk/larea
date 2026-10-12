import React from 'react';
import {
  User,
  Clock,
  Calendar,
  CheckCircle2,
  Circle,
  ShieldCheck,
  Send,
  Building2,
  Cpu,
  FileText,
  RotateCcw,
  Check,
  ArrowRight,
  Server,
  Terminal,
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { formatToLocalDatetimeInputValue, formatDateTime } from './Widgets';

export function FormView({
  schema,
  record,
  onChangeRecord,
  onFormAction,
}) {
  const { t } = useLocale();

  if (!record) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
        No record selected
      </div>
    );
  }

  const handleFieldChange = (fieldName, value) => {
    const updated = { ...record, [fieldName]: value };

    // Auto calculate duration_hours if check_in and check_out are provided
    if (fieldName === 'check_in' || fieldName === 'check_out') {
      if (updated.check_in && updated.check_out) {
        try {
          const tIn = new Date(updated.check_in).getTime();
          const tOut = new Date(updated.check_out).getTime();
          if (tOut > tIn) {
            const hours = Math.round(((tOut - tIn) / (1000 * 60 * 60)) * 10) / 10;
            updated.duration_hours = hours;
          } else {
            updated.duration_hours = 0;
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        updated.duration_hours = 0;
      }
    }

    onChangeRecord(updated);
  };

  const handleTransition = (newStatus) => {
    handleFieldChange('status', newStatus);
    onFormAction && onFormAction(`set_status_${newStatus}`, { ...record, status: newStatus });
  };

  // Workflow stages definition
  const stages = [
    { id: 'draft', label: t('draft'), desc: 'Created via terminal ingestion' },
    { id: 'verified', label: t('verified'), desc: 'Reviewed by HR supervisor' },
    { id: 'synced', label: t('synced'), desc: 'Locked for payroll calculation' },
  ];

  const currentStatus = record.status || 'draft';
  const currentStageIndex = stages.findIndex((s) => s.id === currentStatus);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 animate-fadeIn">
      {/* ASYMMETRIC TWO-PANEL LAYOUT (Main 70% / Sidebar 30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT PANEL (70%): Main Content & Attendance Cards */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Employee & Log Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {t('employee_assignment')}
                </h3>
              </div>
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {record.code || `ATT-${record.id}`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Employee Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {t('employee_name')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={record.employee_name || ''}
                  onChange={(e) => handleFieldChange('employee_name', e.target.value)}
                  placeholder="e.g. Alexander Hayes"
                  className="w-full bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
                />
              </div>

              {/* Department */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {t('department')}
                </label>
                <select
                  value={record.department || 'Operations'}
                  onChange={(e) => handleFieldChange('department', e.target.value)}
                  className="w-full bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition cursor-pointer"
                >
                  <option value="Operations">Operations</option>
                  <option value="Human Resources">Human Resources</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Finance">Finance</option>
                  <option value="IT Infrastructure">IT Infrastructure</option>
                </select>
              </div>

              {/* Biometric Device ID / Terminal */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('terminal_id')}</span>
                </label>
                <input
                  type="text"
                  value={record.terminal_id || ''}
                  onChange={(e) => handleFieldChange('terminal_id', e.target.value)}
                  placeholder="Terminal #01 (Main Lobby Gate)"
                  className="w-full bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
                />
              </div>
            </div>
          </div>

          {/* 2. Time & Attendance Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {t('shift_timings')}
                </h3>
              </div>

              {/* Computed Duration Read-Only Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>{t('computed')}: {record.duration_hours ? `${record.duration_hours.toFixed(1)} ${t('hrs')}` : `0.0 ${t('hrs')}`}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Check In Datetime Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>{t('check_in')} <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">{t('required')}</span>
                </label>
                <input
                  type="datetime-local"
                  value={formatToLocalDatetimeInputValue(record.check_in)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      handleFieldChange('check_in', null);
                      return;
                    }
                    const d = new Date(val);
                    handleFieldChange(
                      'check_in',
                      !isNaN(d.getTime()) ? d.toISOString() : val
                    );
                  }}
                  className="w-full bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
                />
              </div>

              {/* Check Out Datetime Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>{t('check_out')}</span>
                  <span className="text-[10px] text-slate-400 font-normal">{t('optional_shift')}</span>
                </label>
                <input
                  type="datetime-local"
                  value={formatToLocalDatetimeInputValue(record.check_out)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      handleFieldChange('check_out', null);
                      return;
                    }
                    const d = new Date(val);
                    handleFieldChange(
                      'check_out',
                      !isNaN(d.getTime()) ? d.toISOString() : val
                    );
                  }}
                  className="w-full bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
                />
              </div>
            </div>
          </div>

          {/* 3. Notes / Exceptions */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {t('notes_exceptions')}
              </h3>
            </div>

            <textarea
              value={record.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              rows={4}
              placeholder={t('notes_placeholder')}
              className="w-full bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
            />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT SIDEBAR (30%): Workflow Stepper, Action Triggers, Audit Metadata */}
        {/* ========================================================================= */}
        <div className="lg:col-span-3 space-y-6">
          {/* 1. Workflow Stage Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-5 space-y-5 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('lifecycle_stage')}
              </h4>
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 capitalize">
                {t(currentStatus) || currentStatus}
              </span>
            </div>

            {/* Visual Vertical Stepper */}
            <div className="space-y-4 pl-1 rtl:pr-1 rtl:pl-0">
              {stages.map((stg, idx) => {
                const isPast = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;
                const isFuture = idx > currentStageIndex;

                return (
                  <div key={stg.id} className="flex items-start gap-3 relative">
                    {/* Stepper Connector Line */}
                    {idx < stages.length - 1 && (
                      <div
                        className={`absolute left-[11px] rtl:right-[11px] rtl:left-auto top-6 w-[2px] h-8 ${
                          isPast ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    )}

                    {/* Step Icon */}
                    <div className="shrink-0 mt-0.5">
                      {isPast ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xs">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      ) : isCurrent ? (
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center ring-4 ring-blue-100 dark:ring-blue-950 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-400 flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                        </div>
                      )}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1">
                      <div
                        className={`text-xs font-semibold ${
                          isCurrent
                            ? 'text-blue-600 dark:text-blue-400 font-bold'
                            : isPast
                            ? 'text-slate-800 dark:text-slate-200'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {stg.label}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                        {stg.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Contextual Action Trigger Button */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              {currentStatus === 'draft' && (
                <button
                  type="button"
                  onClick={() => handleTransition('verified')}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('verify_record')}</span>
                </button>
              )}

              {currentStatus === 'verified' && (
                <button
                  type="button"
                  onClick={() => handleTransition('synced')}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <Send className="w-4 h-4 rtl:rotate-180" />
                  <span>{t('push_to_payroll')}</span>
                </button>
              )}

              {currentStatus === 'synced' && (
                <div className="space-y-2">
                  <div className="w-full py-2 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{t('locked_payroll')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTransition('draft')}
                    className="w-full py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] font-medium transition cursor-pointer"
                  >
                    {t('reopen_draft')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. Audit Metadata Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-5 space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {t('audit_metadata')}
              </h4>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-800/60">
                <span className="text-slate-400 dark:text-slate-500 font-medium">{t('record_id')}</span>
                <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                  {record.code || `ATT-${record.id}`}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-800/60">
                <span className="text-slate-400 dark:text-slate-500 font-medium">{t('machine_ip')}</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  {record.machine_ip || '192.168.10.104'}
                </span>
              </div>

              <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                <span className="text-slate-400 dark:text-slate-500 font-medium">{t('ingestion_time')}</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                  {formatDateTime(record.ingestion_time || record.check_in || '2026-10-06 08:00:12')}
                </span>
              </div>

              <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                <span className="text-slate-400 dark:text-slate-500 font-medium">{t('ingestion_source')}</span>
                <span className="text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                  {record.ingestion_source || 'Biometric ADMS Terminal'}
                </span>
              </div>

              <div className="flex flex-col gap-0.5 py-1">
                <span className="text-slate-400 dark:text-slate-500 font-medium">{t('last_modified_by')}</span>
                <span className="text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                  {record.last_modified_by || 'Sarah Jenkins (HR Lead)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
