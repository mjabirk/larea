import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  RefreshCw,
  Plus,
  Check,
  ShieldCheck,
  Trash2,
  FileText,
  Lock,
  Paperclip,
  User,
  AlertOctagon,
  TrendingDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccessControl } from '../../context/AccessControlContext';

export function LeaveManagementView() {
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
  const canManagePayroll = hasPermission('payroll.manage') || isSuperadmin;
  const canReadSalary = hasPermission('hr.salary_read') || hasPermission('hr.salary_manage') || isSuperadmin;

  const [leaves, setLeaves] = useState([]);
  const [summary, setSummary] = useState({
    pending_supervisor_count: 0,
    pending_hr_count: 0,
    approved_days_total: 0,
    approved_deduction_qar: null,
  });
  const [employees, setEmployees] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Filters
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedYm, setSelectedYm] = useState(currentYm);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rejection modal
  const [rejectingLeave, setRejectingLeave] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // New Request Form State
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('LEAVE_ANNUAL');
  const [startDate, setStartDate] = useState(now.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [empBasis, setEmpBasis] = useState(null);

  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  // Fetch leaves
  const fetchLeaves = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = `/api/v1/hr/leaves?month=${selectedYm}`;
      if (typeFilter !== 'ALL') url += `&leave_type_id=${typeFilter}`;
      if (statusFilter !== 'ALL') url += `&approval_status=${statusFilter}`;

      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLeaves(data.leaves || []);
        if (data.summary) setSummary(data.summary);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({ type: 'error', text: err.detail || 'Failed to load leaves.' });
      }
    } catch (err) {
      console.error('Error fetching leaves:', err);
      setActionMessage({ type: 'error', text: 'Network error loading leave records.' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedYm, typeFilter, statusFilter, getAuthHeaders]);

  // Fetch employee list
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/employees?limit=300', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error('Error loading employees:', err);
    }
  }, [getAuthHeaders]);

  // Fetch leave types
  const fetchLeaveTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/hr/leave-types', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLeaveTypes(data.leave_types || []);
      }
    } catch (err) {
      console.error('Error loading leave types:', err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    fetchEmployees();
    fetchLeaveTypes();
  }, [fetchEmployees, fetchLeaveTypes]);

  // When selected employee changes, fetch basis if authorized
  useEffect(() => {
    if (!selectedEmpId || !canReadSalary) {
      setEmpBasis(null);
      return;
    }
    const loadBasis = async () => {
      try {
        const res = await fetch(`/api/v1/payroll/employees/${selectedEmpId}/basis`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setEmpBasis(data);
        }
      } catch (err) {
        console.error('Error fetching employee basis:', err);
      }
    };
    loadBasis();
  }, [selectedEmpId, canReadSalary, getAuthHeaders]);

  // Selected policy details
  const activePolicy = useMemo(() => {
    return leaveTypes.find((lt) => lt.id === selectedTypeId) || null;
  }, [leaveTypes, selectedTypeId]);

  // Total calendar days calculation
  const calculatedDays = useMemo(() => {
    if (!startDate || !endDate) return 1;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  }, [startDate, endDate]);

  // Live estimated deduction preview (only shown if canReadSalary)
  const estimatedDeductionPreview = useMemo(() => {
    if (!canReadSalary || !activePolicy || !empBasis || calculatedDays <= 0) return 0;
    const payPct = Number(activePolicy.pay_percentage !== undefined ? activePolicy.pay_percentage : 100);
    if (payPct >= 100) return 0;

    let basisVal = Number(empBasis.base_salary || 0);
    const dedRules = activePolicy.deduction_basis_rules || [];
    const alws = empBasis.allowances_by_rule || {};

    let rules = Array.isArray(dedRules) ? dedRules : [];
    if (typeof dedRules === 'string') {
      try { rules = JSON.parse(dedRules); } catch { rules = []; }
    }

    for (const rId of rules) {
      if (alws[rId] !== undefined) {
        basisVal += Number(alws[rId] || 0);
      } else if (rId === 'ALW_HOUSING' || String(rId).toUpperCase().includes('HOUSING')) {
        basisVal += Number(empBasis.housing_allowance || 0);
      }
    }

    const unpaidRatio = (100.0 - payPct) / 100.0;
    const dailyRate = Math.round((basisVal / 30.0) * unpaidRatio * 100) / 100;
    return Math.round(dailyRate * calculatedDays * 100) / 100;
  }, [canReadSalary, activePolicy, empBasis, calculatedDays]);

  // Handle submit new leave request
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) {
      setActionMessage({ type: 'error', text: 'Please select an employee.' });
      return;
    }
    if (calculatedDays <= 0) {
      setActionMessage({ type: 'error', text: 'End date must be on or after start date.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        employee_id: selectedEmpId,
        leave_type_id: selectedTypeId,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || undefined,
      };

      const res = await fetch('/api/v1/hr/leaves', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Leave request ${data.leave?.code || ''} submitted successfully!`,
        });
        setIsRequestModalOpen(false);
        setSelectedEmpId('');
        setReason('');
        fetchLeaves();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to submit leave request.' });
      }
    } catch (err) {
      console.error('Submit leave error:', err);
      setActionMessage({ type: 'error', text: 'Network error submitting leave request.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Approve (L1 or L2 or Fast-track)
  const handleApprove = async (leave, fastTrack = false) => {
    try {
      const res = await fetch(`/api/v1/hr/leaves/${leave.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ fast_track: fastTrack }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Leave ${leave.code} ${fastTrack ? 'fast-track approved' : 'approved'}!`,
        });
        fetchLeaves();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to approve leave.' });
      }
    } catch (err) {
      console.error('Approve error:', err);
      setActionMessage({ type: 'error', text: 'Error executing approval action.' });
    }
  };

  // Handle Reject
  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectingLeave) return;
    setIsRejecting(true);
    try {
      const res = await fetch(`/api/v1/hr/leaves/${rejectingLeave.id}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: `Leave ${rejectingLeave.code} rejected.` });
        setRejectingLeave(null);
        setRejectionReason('');
        fetchLeaves();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to reject leave.' });
      }
    } catch (err) {
      console.error('Reject error:', err);
      setActionMessage({ type: 'error', text: 'Error rejecting leave.' });
    } finally {
      setIsRejecting(false);
    }
  };

  // Handle Delete
  const handleDelete = async (leave) => {
    if (!window.confirm(`Delete leave request ${leave.code} for ${leave.employee_name}?`)) return;
    try {
      const res = await fetch(`/api/v1/hr/leaves/${leave.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: data.message || 'Leave request deleted.' });
        fetchLeaves();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to delete leave.' });
      }
    } catch (err) {
      console.error('Delete error:', err);
      setActionMessage({ type: 'error', text: 'Error deleting leave request.' });
    }
  };

  // Filtered by search
  const filteredLeaves = useMemo(() => {
    if (!searchTerm.trim()) return leaves;
    const term = searchTerm.toLowerCase();
    return leaves.filter((l) => {
      return (
        (l.employee_name || '').toLowerCase().includes(term) ||
        (l.employee_number || '').toLowerCase().includes(term) ||
        (l.code || '').toLowerCase().includes(term) ||
        (l.leave_type_name || '').toLowerCase().includes(term) ||
        (l.department || '').toLowerCase().includes(term) ||
        (l.reason || '').toLowerCase().includes(term)
      );
    });
  }, [leaves, searchTerm]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  Qatar Statutory Leave & Time Off Engine
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 font-bold border border-purple-200 dark:border-purple-900">
                  Qatar Labour Law Compliant
                </span>
                {!canReadSalary && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-500" />
                    Salary Masked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Annual leave (Art. 79), tiered sick leave (Art. 82), maternity (Art. 96), and automated payroll deduction synchronization.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              pattern="^\d{4}-(0[1-9]|1[0-2])$"
              value={selectedYm}
              onChange={(e) => setSelectedYm(e.target.value)}
              className="bg-transparent font-mono text-xs font-bold text-slate-800 dark:text-slate-200 w-16 focus:outline-hidden"
              title="Filter by Target Month (YYYY-MM)"
            />
          </div>

          <button
            type="button"
            onClick={fetchLeaves}
            disabled={isLoading}
            className="p-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Refresh Records"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Request Time Off</span>
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
            <span>Pending Supervisor (L1)</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {summary.pending_supervisor_count}
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            Awaiting line supervisor verification
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Pending HR/Finance (L2)</span>
            <ShieldCheck className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {summary.pending_hr_count}
          </div>
          <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
            Ready for final statutory approval
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Total Approved Days</span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {summary.approved_days_total} <span className="text-sm font-normal text-slate-500">Days</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Approved leaves for {selectedYm}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Unpaid Leave Deductions (QAR)</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            {!canReadSalary || summary.approved_deduction_qar === null
              ? '•••• (Restricted)'
              : `-${Number(summary.approved_deduction_qar || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR`}
          </div>
          <div className="text-[11px] text-slate-400">
            Synced directly into payslip deductions
          </div>
        </div>
      </div>

      {/* 3. Leave Requests Table & Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee, ID, request code, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Policy Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="ALL">All Leave Policies</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="ALL">All Statuses</option>
              <option value="pending_supervisor">Pending Supervisor (L1)</option>
              <option value="pending_hr">Pending HR/Finance (L2)</option>
              <option value="approved">Approved & Synced</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4">Request Code</th>
                <th className="py-3 px-3">Employee</th>
                <th className="py-3 px-3">Policy / Type</th>
                <th className="py-3 px-3">Date Range</th>
                <th className="py-3 px-3">Days</th>
                <th className="py-3 px-3">Coverage</th>
                <th className="py-3 px-3 font-extrabold text-slate-900 dark:text-white">Deduction (QAR)</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Audit Trail</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLeaves.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-xs">
                    No leave requests found for {selectedYm}. Click "+ Request Time Off" to submit an absence.
                  </td>
                </tr>
              ) : (
                filteredLeaves.map((leave) => {
                  const isPendingL1 = leave.approval_status === 'pending_supervisor';
                  const isPendingL2 = leave.approval_status === 'pending_hr';
                  const isApproved = leave.approval_status === 'approved';
                  const isRejected = leave.approval_status === 'rejected';

                  const payPct = Number(leave.pay_percentage !== undefined ? leave.pay_percentage : 100);
                  const payBadgeColor =
                    payPct >= 100
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200'
                      : payPct > 0
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200';

                  const statusBadgeColor =
                    isApproved
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200'
                      : isPendingL2
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200'
                      : isPendingL1
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200';

                  const isAmountMasked = !canReadSalary || leave.computed_deduction_qar === null || leave.computed_deduction_qar === undefined;

                  return (
                    <tr key={leave.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          {leave.code}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(leave.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{leave.employee_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {leave.employee_number} • {leave.department || 'General'}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{leave.leave_type_name}</div>
                        <span className="text-[10px] text-purple-500 font-mono">{leave.leave_type_id}</span>
                      </td>

                      <td className="py-3 px-3 text-[11px] font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {leave.start_date} → {leave.end_date}
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {leave.total_days} Days
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${payBadgeColor}`}>
                          {payPct.toFixed(0)}% {payPct >= 100 ? 'Full' : payPct > 0 ? 'Half' : 'Unpaid'}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold">
                        {isAmountMasked ? (
                          <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5" />
                            •••• (Restricted)
                          </span>
                        ) : Number(leave.computed_deduction_qar || 0) > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            -{Number(leave.computed_deduction_qar).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">0.00 QAR (Paid)</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 uppercase px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeColor}`}>
                          {isApproved && <Check className="w-3 h-3" />}
                          <span>{leave.approval_status.replace('_', ' ')}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 text-[10px] text-slate-400">
                        <div>By: <strong className="text-slate-600 dark:text-slate-300">{leave.submitted_by_name || 'System'}</strong></div>
                        {leave.level1_approved_by && <div>L1: {leave.level1_approved_by}</div>}
                        {leave.level2_approved_by && <div>L2: {leave.level2_approved_by}</div>}
                        {leave.rejection_reason && (
                          <div className="text-rose-500 font-semibold truncate max-w-xs">{leave.rejection_reason}</div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPendingL1 && (
                            <button
                              type="button"
                              onClick={() => handleApprove(leave, false)}
                              className="px-2 py-1 text-[11px] font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                              title="Sign as Shift Supervisor (Move to HR Review)"
                            >
                              Approve L1
                            </button>
                          )}

                          {isPendingL1 && canManagePayroll && (
                            <button
                              type="button"
                              onClick={() => handleApprove(leave, true)}
                              className="px-2 py-1 text-[11px] font-bold rounded-lg bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
                              title="Fast-Track Final Approval"
                            >
                              Fast-Track
                            </button>
                          )}

                          {isPendingL2 && (
                            <button
                              type="button"
                              onClick={() => handleApprove(leave, false)}
                              className="px-2 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              title="Sign as HR / Finance Director (Syncs into Payslip)"
                            >
                              Approve L2
                            </button>
                          )}

                          {!isRejected && !isApproved && (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingLeave(leave);
                                setRejectionReason('');
                              }}
                              className="px-2 py-1 text-[11px] font-bold rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              title="Reject Leave"
                            >
                              Reject
                            </button>
                          )}

                          {!isApproved && (
                            <button
                              type="button"
                              onClick={() => handleDelete(leave)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Delete Leave"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL: New Leave Request */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Submit Leave / Time Off Request
                  </h3>
                  <p className="text-xs text-slate-400">Qatar Labour Law Statutory Leave Application</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} className="space-y-4 text-xs">
              {/* Employee Selection */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Select Employee *
                </label>
                <select
                  required
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_number}) - {emp.department_id || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Leave Policy Selection */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Statutory Leave Policy *
                </label>
                <select
                  required
                  value={selectedTypeId}
                  onChange={(e) => setSelectedTypeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                >
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} (Max {lt.max_days_per_year}d, {lt.pay_percentage}% pay)
                    </option>
                  ))}
                </select>
              </div>

              {/* Date pickers */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Duration calculation banner */}
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-purple-900 dark:text-purple-200 block">
                    Calculated Absence Duration:
                  </span>
                  <span className="text-[11px] text-purple-700 dark:text-purple-400">
                    Inclusive of calendar days per Qatar Labour Law
                  </span>
                </div>
                <div className="font-mono text-base font-bold text-purple-900 dark:text-purple-200">
                  {calculatedDays} Days
                </div>
              </div>

              {/* Statutory Pay / Deduction Preview */}
              {activePolicy && Number(activePolicy.pay_percentage || 100) < 100 && (
                canReadSalary ? (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-rose-900 dark:text-rose-200 block">
                        Estimated Payroll Deduction:
                      </span>
                      <span className="text-[11px] text-rose-700 dark:text-rose-400">
                        {activePolicy.pay_percentage}% Pay Coverage • Pro-rated /30d
                      </span>
                    </div>
                    <div className="font-mono text-base font-bold text-rose-600 dark:text-rose-400">
                      -{estimatedDeductionPreview.toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Statutory leave compensation and deductions are calculated automatically by the Qatar Payroll Engine.</span>
                  </div>
                )
              )}

              {/* Reason */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Reason / Absence Justification
                </label>
                <textarea
                  rows={2}
                  placeholder="Detail reasons for leave, travel arrangements, emergency details..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || calculatedDays <= 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Submit for Supervisor Sign-Off</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: Rejection Reason */}
      {rejectingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Reject Leave Request
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Rejecting leave <strong>{rejectingLeave.code}</strong> for {rejectingLeave.employee_name} ({rejectingLeave.total_days} Days).
            </p>

            <form onSubmit={handleReject} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Rejection Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail reason for rejection (e.g. shift clash, insufficient notice)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRejectingLeave(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRejecting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isRejecting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaveManagementView;
