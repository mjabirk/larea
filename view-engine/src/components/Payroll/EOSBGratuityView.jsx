import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Banknote,
  Calendar,
  Clock,
  ShieldCheck,
  Search,
  RefreshCw,
  FileText,
  Printer,
  X,
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Award,
  Layers,
  ChevronRight,
  Download,
  Check
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccessControl } from '../../context/AccessControlContext';

export function EOSBGratuityView() {
  const auth = useAuth();
  const { hasPermission } = useAccessControl();

  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const isSuperadmin = Boolean(auth?.currentUser?.is_superadmin || auth?.user?.is_superadmin);
  const canReadSalary = hasPermission('hr.salary_read') || hasPermission('hr.salary_manage') || isSuperadmin;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Filters & State
  const [asOfDate, setAsOfDate] = useState(todayStr);
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Data
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    total_active_employees: 0,
    eligible_employees_count: 0,
    total_eosb_liability_qar: null,
    total_leave_encashment_qar: null,
    total_settlement_liability_qar: null,
  });

  // Certificate Statement Modal
  const [selectedEmpForStatement, setSelectedEmpForStatement] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  // Fetch EOSB summary
  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = `/api/v1/hr/eosb/summary?as_of_date=${asOfDate}`;
      if (departmentFilter !== 'ALL') url += `&department=${departmentFilter}`;

      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        if (data.summary) setSummary(data.summary);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({ type: 'error', text: err.detail || 'Failed to calculate EOSB summary.' });
      }
    } catch (err) {
      console.error('Error fetching EOSB:', err);
      setActionMessage({ type: 'error', text: 'Network error calculating gratuity liability.' });
    } finally {
      setIsLoading(false);
    }
  }, [asOfDate, departmentFilter, getAuthHeaders]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Fetch individual clearance statement
  const handleOpenStatement = async (emp) => {
    setSelectedEmpForStatement(emp);
    setIsLoadingStatement(true);
    setStatementData(null);
    try {
      const res = await fetch(
        `/api/v1/hr/eosb/employees/${emp.employee_id}/settlement?termination_date=${asOfDate}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setStatementData(data.statement);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({ type: 'error', text: err.detail || 'Failed to generate settlement statement.' });
      }
    } catch (err) {
      console.error('Statement error:', err);
      setActionMessage({ type: 'error', text: 'Error generating clearance certificate.' });
    } finally {
      setIsLoadingStatement(false);
    }
  };

  // Distinct departments for filter
  const departments = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      if (r.department) set.add(r.department);
    });
    return Array.from(set);
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.toLowerCase();
    return records.filter((r) => {
      return (
        (r.employee_name || '').toLowerCase().includes(term) ||
        (r.employee_number || '').toLowerCase().includes(term) ||
        (r.department || '').toLowerCase().includes(term)
      );
    });
  }, [records, searchTerm]);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  End-of-Service Gratuity &amp; Final Settlement
                </h1>
                {!canReadSalary && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-500" />
                    Salary Masked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Accrued end-of-service gratuity, unused leave encashment, and printable clearance statements.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* As-Of / Termination Date Simulator */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-500">As-Of Date:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="bg-transparent font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden"
              title="Simulate / Calculate Gratuity Liability as of date"
            />
          </div>

          <button
            type="button"
            onClick={fetchSummary}
            disabled={isLoading}
            className="p-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Recalculate Liability"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-xs font-medium ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Workforce Headcount</span>
            <User className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {summary.total_active_employees}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            {summary.eligible_employees_count} eligible (≥ 1 year)
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Total Gratuity Liability (QAR)</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {!canReadSalary || summary.total_eosb_liability_qar === null
              ? '•••• (Restricted)'
              : `${Number(summary.total_eosb_liability_qar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR`}
          </div>
          <div className="text-[11px] text-slate-400">
            Accrued at 21 days / year
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Leave Encashment Liability</span>
            <Calendar className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {!canReadSalary || summary.total_leave_encashment_qar === null
              ? '•••• (Restricted)'
              : `${Number(summary.total_leave_encashment_qar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR`}
          </div>
          <div className="text-[11px] text-slate-400">
            Unused annual leave balance
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Total Settlement Liability</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {!canReadSalary || summary.total_settlement_liability_qar === null
              ? '•••• (Restricted)'
              : `${Number(summary.total_settlement_liability_qar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR`}
          </div>
          <div className="text-[11px] text-slate-400">
            Gratuity + Encashment net liability
          </div>
        </div>
      </div>

      {/* 3. Employees Liability Table & Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee, ID, department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-3">Hire Date</th>
                <th className="py-3 px-3">Tenure (Y/M/D)</th>
                <th className="py-3 px-3">Eligibility</th>
                <th className="py-3 px-3">Gratuity Days</th>
                <th className="py-3 px-3">Unused Leave</th>
                <th className="py-3 px-3">Basic Salary</th>
                <th className="py-3 px-3 font-extrabold text-slate-900 dark:text-white">EOSB Gratuity (QAR)</th>
                <th className="py-3 px-3 font-extrabold text-slate-900 dark:text-white">Net Settlement (QAR)</th>
                <th className="py-3 px-4 text-right">Clearance Statement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-xs">
                    No active employees found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  return (
                    <tr key={r.employee_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{r.employee_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {r.employee_number} • {r.department}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {r.hire_date}
                      </td>

                      <td className="py-3 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {r.tenure_formatted}
                      </td>

                      <td className="py-3 px-3">
                        {r.is_eligible ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200">
                            <Check className="w-3 h-3" />
                            <span>Eligible</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                            <Clock className="w-3 h-3" />
                            <span>Ineligible (&lt;1y)</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {r.accrued_gratuity_days} Days
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                        <div><strong>{r.unused_leave_days}</strong> Days</div>
                        <div className="text-[10px] text-slate-400">of {r.accrued_annual_leave_days}d accrued</div>
                      </td>

                      <td className="py-3 px-3 font-mono">
                        {!canReadSalary || r.base_salary === null ? (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            ••••
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {Number(r.base_salary).toLocaleString()} QAR
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono font-bold">
                        {!canReadSalary || r.eosb_amount_qar === null ? (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5" />
                            •••• (Restricted)
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">
                            {Number(r.eosb_amount_qar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono font-bold">
                        {!canReadSalary || r.net_settlement_qar === null ? (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5" />
                            •••• (Restricted)
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {Number(r.net_settlement_qar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenStatement(r)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Clearance Statement</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL: Official Qatar Final Settlement & Clearance Certificate */}
      {selectedEmpForStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-6 max-h-[95vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    End-of-Service Clearance Statement
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Certificate</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEmpForStatement(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isLoadingStatement ? (
              <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
                <span>Generating settlement statement...</span>
              </div>
            ) : statementData ? (
              <div id="printable-settlement-certificate" className="space-y-6 text-xs text-slate-900 dark:text-white">
                {/* Certificate Header Banner */}
                <div className="border-b-2 border-slate-900 dark:border-white pb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                      {statementData.employer_name}
                    </h2>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Reg. No: {statementData.cr_number || '—'}
                    </p>
                    <div className="text-[11px] font-bold text-purple-700 dark:text-purple-400 mt-1">
                      END-OF-SERVICE GRATUITY &amp; FINAL CLEARANCE SETTLEMENT
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <div className="font-bold text-slate-900 dark:text-white">{statementData.statement_number}</div>
                    <div className="text-slate-500">Date: {statementData.service_tenure.termination_date}</div>
                  </div>
                </div>

                {/* Employee Identification Card */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Employee Full Name</span>
                    <strong className="text-slate-900 dark:text-white">{statementData.employee.full_name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">National ID</span>
                    <strong className="font-mono text-slate-900 dark:text-white">{statementData.employee.national_id_number || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Employee Number</span>
                    <strong className="font-mono text-slate-900 dark:text-white">{statementData.employee.employee_number}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Designation / Role</span>
                    <strong className="text-slate-900 dark:text-white">{statementData.employee.job_title || 'General Staff'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Department</span>
                    <strong className="text-slate-900 dark:text-white">{statementData.employee.department || 'General'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Bank IBAN</span>
                    <strong className="font-mono text-slate-900 dark:text-white truncate block">{statementData.employee.bank_iban || 'N/A'}</strong>
                  </div>
                </div>

                {/* Service Tenure Breakdown */}
                <div className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      Continuous Service Period
                    </span>
                    <span className="font-mono font-bold text-amber-900 dark:text-amber-200">
                      {statementData.service_tenure.tenure_formatted}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                    Commenced: {statementData.service_tenure.hire_date} • Concluded: {statementData.service_tenure.termination_date} ({statementData.service_tenure.total_service_days} calendar days)
                  </div>
                </div>

                {/* Itemized Calculation Ledger */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase font-bold text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4 text-left">Settlement Item</th>
                        <th className="py-2.5 px-4 text-left">Basis &amp; Ratio</th>
                        <th className="py-2.5 px-4 text-right">Amount (QAR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-semibold">1. Basic Wage Rate</td>
                        <td className="py-2.5 px-4 text-slate-500">Contractual Monthly Base</td>
                        <td className="py-2.5 px-4 text-right font-bold">
                          {!canReadSalary || statementData.calculation_breakdown.basic_monthly_salary === null
                            ? '••••'
                            : `${Number(statementData.calculation_breakdown.basic_monthly_salary).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-semibold">2. End-of-Service Gratuity</td>
                        <td className="py-2.5 px-4 text-slate-500">
                          {statementData.calculation_breakdown.accrued_gratuity_days} days @ daily rate
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {!canReadSalary || statementData.calculation_breakdown.eosb_gratuity_amount === null
                            ? '•••• (Restricted)'
                            : `+${Number(statementData.calculation_breakdown.eosb_gratuity_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-semibold">3. Annual Leave Encashment</td>
                        <td className="py-2.5 px-4 text-slate-500">
                          {statementData.calculation_breakdown.unused_leave_days} unused days ({statementData.calculation_breakdown.annual_leave_taken_days} taken)
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {!canReadSalary || statementData.calculation_breakdown.leave_encashment_amount === null
                            ? '•••• (Restricted)'
                            : `+${Number(statementData.calculation_breakdown.leave_encashment_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`}
                        </td>
                      </tr>
                      {Number(statementData.calculation_breakdown.outstanding_deductions_amount || 0) > 0 && (
                        <tr>
                          <td className="py-2.5 px-4 font-sans font-semibold text-rose-600">4. Outstanding Loan / Advance Recovery</td>
                          <td className="py-2.5 px-4 text-rose-500">Deductions per company policy</td>
                          <td className="py-2.5 px-4 text-right font-bold text-rose-600">
                            {!canReadSalary || statementData.calculation_breakdown.outstanding_deductions_amount === null
                              ? '••••'
                              : `-${Number(statementData.calculation_breakdown.outstanding_deductions_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold text-sm">
                        <td colSpan={2} className="py-3 px-4 font-sans text-slate-900 dark:text-white uppercase">
                          Net Final Settlement Payable:
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">
                          {!canReadSalary || statementData.calculation_breakdown.net_settlement_payable === null
                            ? '•••• (Restricted)'
                            : `${Number(statementData.calculation_breakdown.net_settlement_payable).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Settlement Acknowledgement */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-6">
                  <p className="text-[10px] text-slate-500 italic leading-relaxed">
                    "I hereby acknowledge receipt of all wages, end-of-service gratuity, leave encashment, and final settlement amounts due to me, and confirm full clearance with no remaining financial claims against {statementData.employer_name}."
                  </p>

                  <div className="grid grid-cols-3 gap-6 pt-4 text-center text-xs">
                    <div className="space-y-8">
                      <div className="border-b border-dashed border-slate-400 pb-12" />
                      <div>
                        <strong className="block text-slate-900 dark:text-white">{statementData.employee.full_name}</strong>
                        <span className="text-[10px] text-slate-400 uppercase">Employee Signature & QID</span>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="border-b border-dashed border-slate-400 pb-12" />
                      <div>
                        <strong className="block text-slate-900 dark:text-white">Director of Human Resources</strong>
                        <span className="text-[10px] text-slate-400 uppercase">HR Attestation & Company Seal</span>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="border-b border-dashed border-slate-400 pb-12" />
                      <div>
                        <strong className="block text-slate-900 dark:text-white">Chief Financial Officer</strong>
                        <span className="text-[10px] text-slate-400 uppercase">Finance & Accounts Clearance</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default EOSBGratuityView;
