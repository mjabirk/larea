import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Search,
  ChevronDown,
  Lock,
  Unlock,
  AlertCircle,
  Sparkles,
  Briefcase,
  X,
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { useTenancy } from '../../context/TenancyContext';
import { formatToLocalDatetimeInputValue, formatDateTime } from './Widgets';

export function FormView({
  schema,
  record,
  onChangeRecord,
  onFormAction,
}) {
  const { t } = useLocale();
  const { currentUser } = useTenancy();

  const [employees, setEmployees] = useState([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const comboboxRef = useRef(null);

  useEffect(() => {
    let active = true;
    setIsLoadingEmployees(true);
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    fetch('/api/v1/employees', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : { employees: [] }))
      .then((data) => {
        if (active) {
          setEmployees(data.employees || []);
        }
      })
      .catch((err) => console.warn('Failed to load workforce directory:', err))
      .finally(() => {
        if (active) setIsLoadingEmployees(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target)) {
        setIsComboboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectedEmployee = useMemo(() => {
    if (!record) return null;
    if (record.employee_id) {
      return employees.find((e) => e.id === record.employee_id) || null;
    }
    if (record.employee_name) {
      return (
        employees.find(
          (e) => (e.full_name || '').toLowerCase() === String(record.employee_name || '').toLowerCase()
        ) || null
      );
    }
    return null;
  }, [employees, record]);

  const isSupervisorOrAbove = Boolean(
    currentUser?.is_superadmin ||
    /admin|supervisor|manager|lead|director/i.test(currentUser?.role || '')
  );

  const inheritedDepartment = selectedEmployee?.department_id || selectedEmployee?.department || 'Operations';
  const isDepartmentOverridden = Boolean(
    selectedEmployee &&
    record?.department &&
    String(record.department || '').toLowerCase() !== String(inheritedDepartment || '').toLowerCase()
  );

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase();
    return employees.filter(
      (e) =>
        (e.full_name || '').toLowerCase().includes(q) ||
        (e.employee_number || '').toLowerCase().includes(q) ||
        (e.job_title || '').toLowerCase().includes(q) ||
        (e.department_id || '').toLowerCase().includes(q)
    );
  }, [employees, searchQuery]);

  const handleSelectEmployee = (emp) => {
    handleFieldChange('employee_id', emp.id);
    handleFieldChange('employee_name', emp.full_name);
    handleFieldChange('department', emp.department_id || emp.department || 'Operations');
    setIsComboboxOpen(false);
    setSearchQuery('');
  };

  if (!record) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400">
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
              {/* Employee Selection Combobox */}
              <div className="space-y-1.5 relative" ref={comboboxRef}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    {t('employee_name')} <span className="text-rose-500">*</span>
                  </label>
                  {selectedEmployee?.employee_number && (
                    <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200/60 dark:border-blue-800/60">
                      {selectedEmployee.employee_number}
                    </span>
                  )}
                </div>

                {/* Combobox Trigger */}
                <div
                  onClick={() => setIsComboboxOpen((prev) => !prev)}
                  className={`w-full min-h-[38px] px-3 py-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between gap-2 transition ${
                    isComboboxOpen
                      ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {selectedEmployee ? (
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {selectedEmployee.full_name ? selectedEmployee.full_name.charAt(0) : 'E'}
                      </div>
                      <div className="truncate">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {selectedEmployee.full_name}
                        </span>
                        {selectedEmployee.job_title && (
                          <span className="text-slate-400 dark:text-slate-500 ml-1.5 text-[11px]">
                            • {selectedEmployee.job_title}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : record.employee_name ? (
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="font-medium">{record.employee_name}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">
                      Search active employee by name, code (EMP-XXXX), or title...
                    </span>
                  )}

                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      isComboboxOpen ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                {/* Combobox Dropdown Popover */}
                {isComboboxOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fadeIn">
                    {/* Search Field */}
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-800/50">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Type employee name, EMP code, title..."
                        className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Results list */}
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100/60 dark:divide-slate-800/60">
                      {isLoadingEmployees ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          Loading workforce directory...
                        </div>
                      ) : filteredEmployees.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          No matching active employees found.
                        </div>
                      ) : (
                        filteredEmployees.map((emp) => {
                          const isSelected =
                            record.employee_id === emp.id ||
                            (!record.employee_id && record.employee_name === emp.full_name);
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => handleSelectEmployee(emp)}
                              className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 text-xs transition cursor-pointer hover:bg-blue-50/80 dark:hover:bg-blue-950/40 ${
                                isSelected
                                  ? 'bg-blue-50/50 dark:bg-blue-950/30'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                                  {emp.full_name ? emp.full_name.charAt(0) : 'E'}
                                </div>
                                <div className="truncate">
                                  <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                    <span>{emp.full_name}</span>
                                    <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1 py-0.2 rounded font-normal">
                                      {emp.employee_number || 'EMP'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                                    <span>{emp.job_title || 'Staff Member'}</span>
                                    <span>•</span>
                                    <span className="text-slate-400">{emp.department_id || emp.department || 'Operations'}</span>
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Department Resolution & Optional Supervisory Override */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    {t('department')}
                  </label>
                  {selectedEmployee && !isDepartmentOverridden && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Inherited from Employee Profile
                    </span>
                  )}
                  {selectedEmployee && isDepartmentOverridden && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <AlertCircle className="w-3 h-3 text-amber-500" />
                      Manual Supervisory Override
                    </span>
                  )}
                </div>

                <div className="relative">
                  <select
                    value={record.department || 'Operations'}
                    disabled={!isSupervisorOrAbove}
                    onChange={(e) => handleFieldChange('department', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition ${
                      !isSupervisorOrAbove
                        ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 cursor-not-allowed opacity-90'
                        : 'bg-slate-50/50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 cursor-pointer'
                    }`}
                  >
                    <option value="Operations">Operations</option>
                    <option value="Human Resources">Human Resources</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                    <option value="Finance">Finance</option>
                    <option value="General Administration">General Administration</option>
                    <option value="Sales & Business Dev">Sales & Business Dev</option>
                    <option value="IT Infrastructure">IT Infrastructure</option>
                  </select>

                  {!isSupervisorOrAbove && (
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-slate-400 pointer-events-none">
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span>Inherited</span>
                    </div>
                  )}
                </div>

                {isSupervisorOrAbove && isDepartmentOverridden && (
                  <button
                    type="button"
                    onClick={() => handleFieldChange('department', inheritedDepartment)}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 mt-0.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Profile Department ({inheritedDepartment})
                  </button>
                )}
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
                    {record.code || (record.id ? `ATT-${String(record.id).slice(0, 8)}` : 'ATT-NEW')}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">{t('machine_ip')}</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {record.machine_ip || record.client_ip || record.ip_address || '127.0.0.1'}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">{t('ingestion_time')}</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                    {formatDateTime(record.created_at || record.ingestion_time || record.check_in || new Date().toISOString())}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">{t('ingestion_source')}</span>
                  <span className="text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                    {record.ingestion_source || record.source || (record.terminal_id ? `Biometric ADMS (${record.terminal_id})` : 'Direct ADMS Listener Ingestion')}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 py-1">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">{t('last_modified_by')}</span>
                  <span className="text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                    {record.created_by_name || record.last_modified_by || record.updated_by || currentUser?.full_name || 'System Operator'}
                  </span>
                </div>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}
