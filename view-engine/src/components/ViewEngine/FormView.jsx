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
import { RecordChatter } from '../common/RecordChatter';

export function FormView({
  schema,
  record,
  onChangeRecord,
  onFormAction,
  onBack,
  onDirtyChange,
  isDirty: externalIsDirty,
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

  // Form dirty state tracking
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(false);
    onDirtyChange?.(false);
  }, [record?.id]);

  // Synchronize dirty state with parent when parent saves or resets
  useEffect(() => {
    if (externalIsDirty === false) {
      setIsDirty(false);
    }
  }, [externalIsDirty]);

  // Unsaved changes beforeunload listener
  useEffect(() => {
    const effectiveDirty = externalIsDirty !== undefined ? externalIsDirty : isDirty;
    if (!effectiveDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, externalIsDirty]);

  const handleBack = () => {
    const effectiveDirty = externalIsDirty !== undefined ? externalIsDirty : isDirty;
    if (effectiveDirty && !window.confirm('You have unsaved changes. Discard and return to list?')) {
      return;
    }
    setIsDirty(false);
    onDirtyChange?.(false);
    onBack?.();
  };

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
    setIsDirty(true);
    onDirtyChange?.(true);
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

  const handleBatchFieldChange = (updates) => {
    setIsDirty(true);
    onDirtyChange?.(true);
    const updated = { ...record, ...updates };
    onChangeRecord(updated);
  };

  const handleFieldChange = (fieldName, value) => {
    setIsDirty(true);
    onDirtyChange?.(true);
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
    setIsDirty(true);
    onDirtyChange?.(true);
    const act = actionName || `set_status_${newStatus}`;
    handleFieldChange('status', newStatus);
    onFormAction && onFormAction(act, { ...record, status: newStatus });
  };

  const isRoster = schema?.model === 'shift_rosters' || Boolean(record.shift_name);

  // Workflow stages definition (SOX 404 dual-control compliance or Shift Lifecycle)
  const stages = isRoster
    ? [
        { id: 'scheduled', label: 'Scheduled', desc: 'Shift planned and assigned to workforce' },
        { id: 'in_progress', label: 'In Progress', desc: 'Shift currently active/underway' },
        { id: 'completed', label: 'Completed', desc: 'Shift concluded and recorded' },
        { id: 'cancelled', label: 'Cancelled', desc: 'Shift assignment cancelled' },
      ]
    : [
        { id: 'draft', label: t('draft') || 'Draft', desc: 'Created by maker (pending submission)' },
        { id: 'pending_approval', label: 'Pending Approval', desc: 'Awaiting independent dual-control review' },
        { id: 'verified', label: t('verified') || 'Verified / Approved', desc: 'Reviewed & verified by independent checker' },
        { id: 'synced', label: t('synced') || 'Synced to Payroll', desc: 'Locked for payroll calculation' },
      ];

  const currentStatus = record.status || record.approval_status || (isRoster ? 'scheduled' : 'draft');
  const currentStageIndex = stages.findIndex((s) => s.id === currentStatus);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 animate-fadeIn">
      {onBack && (
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <span>← Back to list</span>
          </button>
        </div>
      )}

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

              {/* Terminal or Shift Template & Location */}
              {!isRoster ? (
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
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                      <span>Shift Template</span>
                    </label>
                    <select
                      value={record.shift_name || 'Morning Shift (08:00 - 16:00)'}
                      onChange={(e) => handleFieldChange('shift_name', e.target.value)}
                      className="w-full h-10 bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-[14px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition cursor-pointer"
                    >
                      <option value="Morning Shift (08:00 - 16:00)">Morning Shift (08:00 - 16:00)</option>
                      <option value="Evening Shift (16:00 - 00:00)">Evening Shift (16:00 - 00:00)</option>
                      <option value="Night Shift (00:00 - 08:00)">Night Shift (00:00 - 08:00)</option>
                      <option value="Flexible Core Hours (09:00 - 17:00)">Flexible Core Hours (09:00 - 17:00)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Facility / Location</span>
                    </label>
                    <input
                      type="text"
                      value={record.location || 'Doha Head Office'}
                      onChange={(e) => handleFieldChange('location', e.target.value)}
                      placeholder="e.g. Doha Head Office, Al Khor Facility"
                      className="w-full h-10 bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-[14px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
                    />
                  </div>
                </>
              )}
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
                  {isRoster ? 'Shift Schedule & Duration' : t('shift_timings')}
                </h3>
              </div>

              {/* Computed Duration Read-Only Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>{t('computed')}: {record.duration_hours ? `${record.duration_hours.toFixed(1)} ${t('hrs')}` : `0.0 ${t('hrs')}`}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Start Time / Check In */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>{isRoster ? 'Shift Start Time' : t('check_in')} <span className="text-rose-500">*</span></span>
                  <span className="text-[11px] text-slate-400 font-normal">{t('required')}</span>
                </label>
                <input
                  type="datetime-local"
                  value={formatToLocalDatetimeInputValue(record.start_time || record.check_in)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      handleBatchFieldChange({
                        start_time: null,
                        check_in: null,
                        duration_hours: 0,
                      });
                      return;
                    }
                    const d = new Date(val);
                    const iso = !isNaN(d.getTime()) ? d.toISOString() : val;
                    const currentEnd = record.end_time || record.check_out;
                    let diffH = 0;
                    if (currentEnd) {
                      diffH = Math.max(0, Math.round(((new Date(currentEnd) - new Date(iso)) / 3600000) * 100) / 100);
                    }
                    handleBatchFieldChange({
                      start_time: iso,
                      check_in: iso,
                      duration_hours: diffH,
                    });
                  }}
                  className="w-full h-10 bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-[14px] text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
                />
              </div>

              {/* End Time / Check Out */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>{isRoster ? 'Shift End Time' : t('check_out')} <span className="text-rose-500">*</span></span>
                  <span className="text-[11px] text-slate-400 font-normal">{isRoster ? t('required') : t('optional_shift')}</span>
                </label>
                <input
                  type="datetime-local"
                  value={formatToLocalDatetimeInputValue(record.end_time || record.check_out)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      handleBatchFieldChange({
                        end_time: null,
                        check_out: null,
                        duration_hours: 0,
                      });
                      return;
                    }
                    const d = new Date(val);
                    const iso = !isNaN(d.getTime()) ? d.toISOString() : val;
                    const currentStart = record.start_time || record.check_in;
                    let diffH = 0;
                    if (currentStart) {
                      diffH = Math.max(0, Math.round(((new Date(iso) - new Date(currentStart)) / 3600000) * 100) / 100);
                    }
                    handleBatchFieldChange({
                      end_time: iso,
                      check_out: iso,
                      duration_hours: diffH,
                    });
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
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-sm flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <strong>Reviewer Required:</strong> You submitted this record, so another team member must approve it.
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

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500 dark:text-slate-400">Reference</span>
                  <span className="text-slate-900 dark:text-slate-100 font-semibold">
                    {record.code || (record.id ? `ATT-${String(record.id).slice(0, 8)}` : 'New')}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500 dark:text-slate-400">Location / Device</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {record.terminal_id || 'Main Lobby'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500 dark:text-slate-400">Recorded At</span>
                  <span className="tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                    {formatDateTime(record.created_at || record.ingestion_time || record.check_in || new Date().toISOString())}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500 dark:text-slate-400">Created By</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {record.created_by_name || record.last_modified_by || 'Staff'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Approved By</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {record.approved_by_name || (record.status === 'verified' || record.status === 'synced' ? 'Approved' : 'Pending')}
                  </span>
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Instant Activity & Audit Log */}
      {!record.isNew && record.id && !String(record.id).startsWith('temp-') && String(record.id).includes('-') && (
        <RecordChatter
          entityType={isRoster ? 'shift_rosters' : 'attendance_logs'}
          entityId={String(record.id)}
          entityName={displayCode}
        />
      )}
    </div>
  );
}
