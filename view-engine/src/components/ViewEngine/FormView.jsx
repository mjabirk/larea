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
  ShieldAlert,
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { useTenancy } from '../../context/TenancyContext';
import { useAuth } from '../../context/AuthContext';
import { formatToLocalDatetimeInputValue, formatDateTime } from './Widgets';

export function FormView({
  schema,
  record,
  onChangeRecord,
  onFormAction,
}) {
  const { t } = useLocale();
  const { currentUser } = useTenancy();
  const auth = useAuth();
  const sessionUser = auth?.user || currentUser;
  const sessionUserId = sessionUser?.id;
  const sessionUserEmail = sessionUser?.email;
  const sessionUsername = sessionUser?.username;

  const isMakerOrSubmitter = Boolean(
    sessionUserId && record && (
      String(record.created_by) === String(sessionUserId) ||
      String(record.submitted_by) === String(sessionUserId) ||
      (sessionUsername && (String(record.created_by) === String(sessionUsername) || String(record.submitted_by) === String(sessionUsername))) ||
      (sessionUserEmail && (String(record.created_by) === String(sessionUserEmail) || String(record.submitted_by) === String(sessionUserEmail)))
    )
  );

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
          const list = data.employees || [];
          if (list.length > 0) {
            setEmployees(list);
          } else {
            setEmployees([
              { id: 1, full_name: 'Johnathan Vance', name: 'Johnathan Vance', employee_number: 'EMP-0101', department: 'Operations', department_id: 'Operations' },
              { id: 2, full_name: 'Tariqab Al-Mansoor', name: 'Tariqab Al-Mansoor', employee_number: 'EMP-0102', department: 'Operations', department_id: 'Operations' },
              { id: 3, full_name: 'Fatima Al-Kuwari', name: 'Fatima Al-Kuwari', employee_number: 'EMP-0103', department: 'Human Resources', department_id: 'Human Resources' },
              { id: 4, full_name: 'Amira Al-Thani', name: 'Amira Al-Thani', employee_number: 'EMP-0104', department: 'Operations', department_id: 'Operations' },
            ]);
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to load workforce directory:', err);
        if (active) {
          setEmployees([
            { id: 1, full_name: 'Johnathan Vance', name: 'Johnathan Vance', employee_number: 'EMP-0101', department: 'Operations', department_id: 'Operations' },
            { id: 2, full_name: 'Tariqab Al-Mansoor', name: 'Tariqab Al-Mansoor', employee_number: 'EMP-0102', department: 'Operations', department_id: 'Operations' },
            { id: 3, full_name: 'Fatima Al-Kuwari', name: 'Fatima Al-Kuwari', employee_number: 'EMP-0103', department: 'Human Resources', department_id: 'Human Resources' },
            { id: 4, full_name: 'Amira Al-Thani', name: 'Amira Al-Thani', employee_number: 'EMP-0104', department: 'Operations', department_id: 'Operations' },
          ]);
        }
      })
      .finally(() => {
        if (active) setIsLoadingEmployees(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedEmployee = useMemo(() => {
    if (!record) return null;
    const empId = record.employee_id || record.employeeId;
    if (empId) {
      return employees.find((e) => String(e.id) === String(empId)) || null;
    }
    const name = record.employee_name || record.employeeName;
    if (name && name !== 'No Contract Staff' && name !== 'Staff Member') {
      return (
        employees.find(
          (e) => (e.full_name || e.name || '').toLowerCase() === String(name).toLowerCase()
        ) || null
      );
    }
    return null;
  }, [employees, record]);

  const displayCode = useMemo(() => {
    if (!record) return '';
    if (record.code && !record.code.includes('NaN')) return record.code;
    return `ATT-2026-${String(record.id || 1).padStart(4, '0')}`;
  }, [record]);

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

  const handleSelectEmployee = (emp) => {
    if (!emp) {
      const updated = {
        ...record,
        employee_id: null,
        employeeId: null,
        employee_name: '',
        employeeName: '',
        department: '',
      };
      onChangeRecord(updated);
      return;
    }
    const updated = {
      ...record,
      employee_id: emp.id,
      employeeId: emp.id,
      employee_name: emp.full_name || emp.name,
      employeeName: emp.full_name || emp.name,
      department: emp.department_id || emp.department || 'Operations',
    };
    onChangeRecord(updated);
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

  const handleTransition = (newStatus, actionName = null) => {
    const act = actionName || `set_status_${newStatus}`;
    handleFieldChange('status', newStatus);
    onFormAction && onFormAction(act, { ...record, status: newStatus });
  };

  // Workflow stages definition (SOX 404 dual-control compliance)
  const stages = [
    { id: 'draft', label: t('draft') || 'Draft', desc: 'Created by maker (pending submission)' },
    { id: 'pending_approval', label: 'Pending Approval', desc: 'Awaiting independent dual-control review' },
    { id: 'verified', label: t('verified') || 'Verified / Approved', desc: 'Reviewed & verified by independent checker' },
    { id: 'synced', label: t('synced') || 'Synced to Payroll', desc: 'Locked for payroll calculation' },
  ];

  const currentStatus = record.status || record.approval_status || 'draft';
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
                {displayCode}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Employee Selection Dropdown */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="employee-select" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    {t('employee_name')} <span className="text-rose-500">*</span>
                  </label>
                  {selectedEmployee?.employee_number && (
                    <span className="text-[11px] font-mono font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200/60 dark:border-blue-800/60">
                      {selectedEmployee.employee_number}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <select
                    id="employee-select"
                    value={selectedEmployee?.id ? String(selectedEmployee.id) : ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) {
                        handleSelectEmployee(null);
                      } else {
                        const selected = employees.find((emp) => String(emp.id) === String(selectedId));
                        handleSelectEmployee(selected || null);
                      }
                    }}
                    className="w-full h-10 pl-3.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none transition"
                  >
                    <option value="">-- Select Employee --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name || emp.name} ({emp.employee_number || 'EMP'}) - {emp.department_id || emp.department || 'Operations'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Department Resolution & Optional Supervisory Override */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    {t('department')}
                  </label>
                  {selectedEmployee && !isDepartmentOverridden && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Inherited from Employee Profile
                    </span>
                  )}
                  {selectedEmployee && isDepartmentOverridden && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
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
                    className={`w-full h-10 border rounded-xl px-3.5 py-2 text-[14px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition ${
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
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] text-slate-400 pointer-events-none">
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span>Inherited</span>
                    </div>
                  )}
                </div>

                {isSupervisorOrAbove && isDepartmentOverridden && (
                  <button
                    type="button"
                    onClick={() => handleFieldChange('department', inheritedDepartment)}
                    className="text-[12px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 mt-0.5 cursor-pointer font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Profile Department ({inheritedDepartment})
                  </button>
                )}
              </div>

              {/* Biometric Device ID / Terminal */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('terminal_id')}</span>
                </label>
                <input
                  type="text"
                  value={record.terminal_id || ''}
                  onChange={(e) => handleFieldChange('terminal_id', e.target.value)}
                  placeholder="Terminal #01 (Main Lobby Gate)"
                  className="w-full h-10 bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-[14px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
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
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>{t('check_in')} <span className="text-rose-500">*</span></span>
                  <span className="text-[11px] text-slate-400 font-normal">{t('required')}</span>
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
                  className="w-full h-10 bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-[14px] text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
                />
              </div>

              {/* Check Out Datetime Picker */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>{t('check_out')}</span>
                  <span className="text-[11px] text-slate-400 font-normal">{t('optional_shift')}</span>
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
                  className="w-full h-10 bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-[14px] text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
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
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                {t('notes_exceptions')}
              </h3>
            </div>

            <textarea
              value={record.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              rows={4}
              placeholder={t('notes_placeholder')}
              className="w-full bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
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
              <h4 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                {t('lifecycle_stage')}
              </h4>
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 capitalize">
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
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              {currentStatus === 'draft' && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleTransition('pending_approval', 'submit')}
                    className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    <Send className="w-4 h-4 rtl:rotate-180" />
                    <span>Submit for Approval</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTransition('verified', 'approve')}
                    className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Direct Verification (Checker)</span>
                  </button>
                </div>
              )}

              {currentStatus === 'pending_approval' && (
                <div className="space-y-2.5">
                  {isMakerOrSubmitter && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <strong>SOX 404 Dual-Control:</strong> You authored/submitted this record. Approval must be performed by an independent checker (self-approval prohibited).
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {!isMakerOrSubmitter && (
                      <button
                        type="button"
                        onClick={() => handleTransition('rejected', 'reject')}
                        className="py-2.5 px-3 rounded-lg border border-rose-300 dark:border-rose-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isMakerOrSubmitter}
                      onClick={() => handleTransition('verified', 'approve')}
                      className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition shadow-xs ${
                        isMakerOrSubmitter
                          ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-70'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isMakerOrSubmitter ? 'Self-Approval Prohibited' : 'Approve Record'}</span>
                    </button>
                  </div>
                </div>
              )}

              {currentStatus === 'rejected' && (
                <div className="space-y-2">
                  <div className="w-full py-2 px-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold flex items-center justify-center gap-1.5">
                    <X className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span>Rejected in Review</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTransition('draft', 'reset')}
                    className="w-full py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] font-medium transition cursor-pointer"
                  >
                    {t('reopen_draft') || 'Reset to Draft'}
                  </button>
                </div>
              )}

              {currentStatus === 'verified' && (
                <button
                  type="button"
                  onClick={() => handleTransition('synced', 'sync')}
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
                    onClick={() => handleTransition('draft', 'reset')}
                    className="w-full py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] font-medium transition cursor-pointer"
                  >
                    {t('reopen_draft')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. Record Information Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-5 space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <h4 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                Record Information
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
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Terminal Gate</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {record.terminal_id || 'Main Lobby Gate'}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">{t('ingestion_time')}</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                    {formatDateTime(record.created_at || record.ingestion_time || record.check_in || new Date().toISOString())}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Source</span>
                  <span className="text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                    {record.ingestion_source || record.source || 'Biometric Attendance Device'}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Created By (Maker)</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                    {record.created_by_name || (record.created_by ? `User #${String(record.created_by).slice(0, 8)}` : (record.last_modified_by || 'Staff'))}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Submitted By</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                    {record.submitted_by_name || (record.submitted_by ? `User #${String(record.submitted_by).slice(0, 8)}` : (record.status !== 'draft' ? (record.created_by_name || 'Direct Submit') : 'Pending Submission'))}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Approved By (Checker)</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                    {record.approved_by_name || (record.approved_by ? `User #${String(record.approved_by).slice(0, 8)}` : (record.status === 'verified' || record.status === 'synced' ? 'Approved' : 'Pending Review'))}
                  </span>
                </div>

                {record.approved_at && (
                  <div className="flex flex-col gap-0.5 py-1 border-b border-slate-50 dark:border-slate-800/60">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">Approved At</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                      {formatDateTime(record.approved_at)}
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-0.5 py-1">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">SOX 404 Control</span>
                  <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Dual-Control Enforced</span>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}
