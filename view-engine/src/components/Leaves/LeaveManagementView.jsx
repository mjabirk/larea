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
  TrendingDown,
  ArrowLeft,
  Save,
  Info,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Mail,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccessControl } from '../../context/AccessControlContext';
import { useModalEscape } from '../../hooks/useModalEscape';
import { SendEmailModal } from '../common/SendEmailModal';
import { SendMessageModal } from '../common/SendMessageModal';

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
  const [emailLeave, setEmailLeave] = useState(null);
  const [messageLeave, setMessageLeave] = useState(null);

  // Filters
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedYm, setSelectedYm] = useState(currentYm);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);
  const [showSummary, setShowSummary] = useState(false);

  // ERP View Switcher: 'list' | 'form'
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'form' ? 'form' : 'list'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const isForm = viewMode === 'form';
    window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: isForm } }));
    try {
      const p = new URLSearchParams(window.location.search);
      if (isForm) p.set('view', 'form');
      else p.delete('view');
      const qs = p.toString();
      window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    } catch (e) {}
    return () => {
      if (isForm) window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: false } }));
    };
  }, [viewMode]);

  // Rejection modal
  const [rejectingLeave, setRejectingLeave] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  useModalEscape(() => setRejectingLeave(null), Boolean(rejectingLeave));
  useModalEscape(() => setViewMode('list'), viewMode === 'form');

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

  // Notify operational form state to hide compliance footer when in form mode
  useEffect(() => {
    const isForm = viewMode === 'form';
    window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: isForm } }));
    return () => {
      if (isForm) {
        window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: false } }));
      }
    };
  }, [viewMode]);

  // Expected return date calculation (automatically computed as End Date + 1 day / next shift day)
  const returnDate = useMemo(() => {
    if (!endDate) return '';
    const d = new Date(endDate);
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + 1);
    // If next day is Friday (day 5), Qatar statutory rest day, next shift day is Saturday (+1 day)
    if (d.getDay() === 5) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  }, [startDate, endDate]);

  // Working days calculation (excluding Friday per Qatar Labour Law Art. 73)
  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    let count = 0;
    const cur = new Date(s);
    while (cur <= e) {
      if (cur.getDay() !== 5) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }, [startDate, endDate]);

  // Selected Employee object
  const selectedEmployee = useMemo(() => {
    return employees.find((e) => String(e.id) === String(selectedEmpId)) || null;
  }, [employees, selectedEmpId]);

  // Employee Leave Balances (Available, Used, Pending)
  const employeeBalances = useMemo(() => {
    if (!selectedEmpId) return null;
    const maxQuota = Number(activePolicy?.max_days_per_year ?? 21);

    const empLeaves = leaves.filter((l) => String(l.employee_id) === String(selectedEmpId));

    const usedDays = empLeaves
      .filter((l) => l.approval_status === 'approved' && (!selectedTypeId || l.leave_type_id === selectedTypeId))
      .reduce((sum, l) => sum + (Number(l.total_days) || 0), 0);

    const pendingDays = empLeaves
      .filter(
        (l) =>
          (l.approval_status === 'pending_supervisor' || l.approval_status === 'pending_hr') &&
          (!selectedTypeId || l.leave_type_id === selectedTypeId)
      )
      .reduce((sum, l) => sum + (Number(l.total_days) || 0), 0);

    const availableDays = Math.max(0, maxQuota - usedDays - pendingDays);
    const usedPercent = Math.min(100, Math.round(((usedDays + pendingDays) / (maxQuota || 1)) * 100));

    return {
      maxQuota,
      usedDays,
      pendingDays,
      availableDays,
      usedPercent,
    };
  }, [selectedEmpId, activePolicy, selectedTypeId, leaves]);

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
    if (e && e.preventDefault) e.preventDefault();
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
        setViewMode('list');
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

  // Handle Save Draft
  const handleSaveDraft = () => {
    if (!selectedEmpId) {
      setActionMessage({ type: 'error', text: 'Please select an employee before saving draft.' });
      return;
    }
    const emp = employees.find((e) => String(e.id) === String(selectedEmpId));
    setActionMessage({
      type: 'success',
      text: `Draft leave request saved for ${emp?.full_name || 'selected employee'}.`,
    });
    setViewMode('list');
  };

  // Handle Discard
  const handleDiscard = () => {
    setSelectedEmpId('');
    setReason('');
    setStartDate(now.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
    setViewMode('list');
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter, selectedYm]);

  const totalCount = filteredLeaves.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const pagedLeaves = useMemo(() => {
    return filteredLeaves.slice(startIndex, endIndex);
  }, [filteredLeaves, startIndex, endIndex]);

  return (
    <div className="space-y-6">
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

      {viewMode === 'form' ? (
        /* DEDICATED FORM VIEW */
        <div className="space-y-6">
          {/* Sticky Top Action Header */}
          <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-5 py-3.5 -mx-1 -mt-1 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="inline-flex items-center gap-1.5 h-[42px] px-3.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Leaves</span>
              </button>
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Human Resources</span>
                  <span>/</span>
                  <span>Leave & Time Off</span>
                  <span>/</span>
                  <span className="text-slate-900 dark:text-white font-medium">New Leave Request</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <h1 className="text-base font-bold text-slate-900 dark:text-white">New Leave Request</h1>
                  <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900">
                    Draft
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={handleDiscard}
                className="h-[42px] px-4 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 h-[42px] px-4 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition cursor-pointer"
              >
                <Save className="w-4 h-4 text-slate-500" />
                <span>Save Draft</span>
              </button>
              <button
                type="button"
                onClick={handleSubmitRequest}
                disabled={isSubmitting || calculatedDays <= 0}
                className="inline-flex items-center gap-1.5 h-[42px] px-5 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Submit for Approval</span>
              </button>
            </div>
          </div>

          {/* Form Content: 2-Column ERP Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Section: Form inputs */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-5">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Leave Details
                </h2>
              </div>

              {/* Employee Selection */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Employee <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[14px] text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_number}) - {emp.department_id || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Leave Type */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Leave Type <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedTypeId}
                  onChange={(e) => setSelectedTypeId(e.target.value)}
                  className="w-full h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[14px] text-slate-900 dark:text-white font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} (Max {lt.max_days_per_year}d, {lt.pay_percentage}% pay)
                    </option>
                  ))}
                </select>
              </div>

              {/* Dates & Return Date Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[14px] text-slate-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    End Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[14px] text-slate-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Expected Return Date
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={returnDate || '—'}
                      className="w-full h-[42px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 text-[14px] text-slate-500 dark:text-slate-400 font-mono cursor-not-allowed focus:outline-hidden"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Duration Badge */}
              <div className="p-4 rounded-xl bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-xs text-purple-950 dark:text-purple-200 block">
                      Calculated Absence Duration
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800/80 text-center shadow-2xs">
                    <div className="font-mono text-base font-bold text-purple-700 dark:text-purple-300 leading-tight">
                      {workingDays}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">
                      Working Days
                    </div>
                  </div>
                  <div className="px-3.5 py-1.5 rounded-lg bg-purple-100/70 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800/60 text-center">
                    <div className="font-mono text-base font-bold text-slate-800 dark:text-slate-200 leading-tight">
                      {calculatedDays}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                      Calendar Days
                    </div>
                  </div>
                </div>
              </div>

              {/* Statutory Pay / Deduction Preview (if unpaid component) */}
              {activePolicy && Number(activePolicy.pay_percentage || 100) < 100 && (
                canReadSalary ? (
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-center justify-between text-xs">
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
                  <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Leave pay and deductions are calculated automatically during payroll.</span>
                  </div>
                )
              )}

              {/* Reason / Notes */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Reason / Absence Justification
                </label>
                <textarea
                  rows={3}
                  placeholder="Detail reasons for leave, travel arrangements, emergency details, handover notes..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-3.5 text-[14px] text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Right Section: Employee Leave Balance Widget */}
            <div className="lg:col-span-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-5 sticky top-20">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-sm">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <span>Employee Leave Balance</span>
                  </div>
                  {selectedEmployee && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {selectedEmployee.employee_number}
                    </span>
                  )}
                </div>

                {!selectedEmployee ? (
                  <div className="py-10 text-center text-slate-400 space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                      <User className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        No Employee Selected
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[220px] mx-auto">
                        Choose an employee from the dropdown to view available quota, used days, and pending leaves.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Employee Quick Info */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <div className="w-10 h-10 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {(selectedEmployee.full_name || 'E')
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {selectedEmployee.full_name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {selectedEmployee.department_id || 'General Department'} • {selectedEmployee.job_title || 'Employee'}
                        </div>
                      </div>
                    </div>

                    {/* Quota Highlights */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {activePolicy?.name || 'Leave'}
                        </span>
                        <span className="font-mono text-slate-500 text-[11px]">
                          {employeeBalances?.maxQuota || 21} Days / Year
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
                          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            Available
                          </div>
                          <div className="text-lg font-bold text-emerald-800 dark:text-emerald-200 font-mono mt-0.5">
                            {employeeBalances?.availableDays ?? 0}
                          </div>
                          <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Days</div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            Used
                          </div>
                          <div className="text-lg font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                            {employeeBalances?.usedDays ?? 0}
                          </div>
                          <div className="text-[10px] text-slate-500">Days</div>
                        </div>

                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60">
                          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            Pending
                          </div>
                          <div className="text-lg font-bold text-amber-800 dark:text-amber-200 font-mono mt-0.5">
                            {employeeBalances?.pendingDays ?? 0}
                          </div>
                          <div className="text-[10px] text-amber-600/80 dark:text-amber-400/80">Days</div>
                        </div>
                      </div>

                      {/* Quota Progress */}
                      <div className="pt-2 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span>Quota Utilization</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {(employeeBalances?.usedDays || 0) + (employeeBalances?.pendingDays || 0)} of {employeeBalances?.maxQuota || 21} Days
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${employeeBalances?.usedPercent || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Leave Allowance Summary */}
                    {activePolicy && (
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                          <FileText className="w-3.5 h-3.5 text-purple-600" />
                          <span>Leave Allowance</span>
                        </div>
                        <div className="text-[12px] text-slate-600 dark:text-slate-400 space-y-1.5">
                          <div className="flex justify-between">
                            <span>Pay Coverage:</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {activePolicy.pay_percentage}% paid
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Annual Limit:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {activePolicy.max_days_per_year} Days
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-2">
          {/* 1. Slim 44px Control Bar */}
          <div className="h-11 min-h-[44px] flex items-center justify-between gap-2 px-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg shadow-2xs">
            {/* Left: Action Button, Month Picker, Refresh & Title */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('form')}
                className="h-7 px-2.5 text-[11px] font-bold rounded-md bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1 shadow-xs transition cursor-pointer"
                title="New Leave Request"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Request Time Off</span>
              </button>

              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 px-2 h-7 rounded-md border border-slate-200 dark:border-slate-700">
                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                <input
                  type="text"
                  pattern="^\d{4}-(0[1-9]|1[0-2])$"
                  value={selectedYm}
                  onChange={(e) => setSelectedYm(e.target.value)}
                  className="bg-transparent font-mono text-[11.5px] font-bold text-slate-800 dark:text-slate-200 w-16 focus:outline-none"
                  title="Target Month (YYYY-MM)"
                />
              </div>

              <button
                type="button"
                onClick={fetchLeaves}
                disabled={isLoading}
                className="h-7 w-7 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
                title="Refresh Records"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              <span className="font-bold text-[13px] text-slate-900 dark:text-white shrink-0 ml-1">
                Leaves
              </span>

              {!canReadSalary && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Lock className="w-2.5 h-2.5" />
                  Masked
                </span>
              )}
            </div>

            {/* Center: Slim Search & Inline Dropdowns */}
            <div className="flex items-center gap-1.5 flex-1 max-w-xl mx-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search employee, ID, code, reason..."
                  className="w-full h-7 text-[12px] font-normal pl-8 pr-6 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-7 text-[11.5px] font-medium px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer shrink-0 max-w-[130px] truncate"
              >
                <option value="ALL">Type: All</option>
                {leaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-7 text-[11.5px] font-medium px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer shrink-0 max-w-[130px] truncate"
              >
                <option value="ALL">Status: All</option>
                <option value="pending_supervisor">Pending Manager</option>
                <option value="pending_hr">Pending HR</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Right: Summary Toggle & Odoo Pager */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowSummary((v) => !v)}
                className={`h-7 px-2 text-[11px] font-medium rounded-md border transition cursor-pointer flex items-center gap-1 ${
                  showSummary
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900'
                }`}
              >
                {showSummary ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>Summary</span>
              </button>

              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 h-7">
                <span className="text-[11.5px] font-mono text-slate-600 dark:text-slate-300 font-semibold tracking-tight">
                  {totalCount === 0 ? '0-0 / 0' : `${startIndex + 1}-${endIndex} / ${totalCount}`}
                </span>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-0.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-0.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible 28px Metric Summary Ribbon */}
          {showSummary && (
            <div className="h-7 min-h-[28px] px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md flex items-center justify-between text-[11.5px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-4">
                <span>Pending L1: <strong className="font-mono text-amber-600 dark:text-amber-400">{summary.pending_supervisor_count}</strong></span>
                <span>Pending L2: <strong className="font-mono text-purple-600 dark:text-purple-400">{summary.pending_hr_count}</strong></span>
                <span>Approved Days: <strong className="font-mono text-blue-600 dark:text-blue-400">{summary.approved_days_total}</strong></span>
                <span>Deductions: <strong className="font-mono text-rose-600 dark:text-rose-400">{!canReadSalary || summary.approved_deduction_qar === null ? '••••' : `-${Number(summary.approved_deduction_qar || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`}</strong></span>
              </div>
              <span className="text-[10.5px] text-slate-400">Page {currentPage} of {totalPages}</span>
            </div>
          )}

          {/* 2. Leave Requests Table */}
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11.5px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <tr className="h-8">
                    <th className="py-1 px-2.5">Code</th>
                    <th className="py-1 px-2.5">Employee</th>
                    <th className="py-1 px-2.5">Leave Type</th>
                    <th className="py-1 px-2.5">Dates</th>
                    <th className="py-1 px-2.5">Days</th>
                    <th className="py-1 px-2.5">Pay</th>
                    <th className="py-1 px-2.5 text-right">Deduction (QAR)</th>
                    <th className="py-1 px-2.5">Status</th>
                    <th className="py-1 px-2.5 text-right w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[12.5px] text-slate-800 dark:text-slate-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[12px] text-slate-400">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-purple-500" />
                        <span>Loading leave requests...</span>
                      </td>
                    </tr>
                  ) : pagedLeaves.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[12px] text-slate-400">
                        <Calendar className="w-6 h-6 mx-auto mb-1 opacity-40" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">No leave requests found for {selectedYm}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Click &quot;+ Request Time Off&quot; to submit an absence.</p>
                      </td>
                    </tr>
                  ) : (
                    pagedLeaves.map((leave) => {
                      const isPendingL1 = leave.approval_status === 'pending_supervisor';
                      const isPendingL2 = leave.approval_status === 'pending_hr';
                      const isApproved = leave.approval_status === 'approved';
                      const isRejected = leave.approval_status === 'rejected';

                      const payPct = Number(leave.pay_percentage !== undefined ? leave.pay_percentage : 100);
                      const payBadgeColor =
                        payPct >= 100
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : payPct > 0
                          ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-600 border-rose-500/20';

                      const statusBadgeColor =
                        isApproved
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : isPendingL2
                          ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                          : isPendingL1
                          ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-600 border-rose-500/20';

                      const isAmountMasked = !canReadSalary || leave.computed_deduction_qar === null || leave.computed_deduction_qar === undefined;

                      const auditText = `Submitted by: ${leave.submitted_by_name || 'System'}${leave.level1_approved_by ? ` | L1: ${leave.level1_approved_by}` : ''}${leave.level2_approved_by ? ` | L2: ${leave.level2_approved_by}` : ''}${leave.rejection_reason ? ` | Rejected: ${leave.rejection_reason}` : ''}`;
                      const auditLabel = isApproved ? 'L2 Signed' : isPendingL2 ? 'L1 Signed' : isRejected ? 'Rejected' : 'Submitted';

                      return (
                        <tr
                          key={leave.id}
                          className="h-8 odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/40 dark:even:bg-slate-800/40 hover:bg-purple-50/30 dark:hover:bg-slate-800/70 border-b border-slate-200/60 dark:border-slate-800/60 transition-colors"
                        >
                          {/* Request Code */}
                          <td className="py-1 px-2.5 align-middle">
                            <span
                              className="font-mono font-semibold text-[12px] text-purple-600 dark:text-purple-400 truncate max-w-[130px] block"
                              title={`${leave.code} • Created ${new Date(leave.created_at).toLocaleDateString()}`}
                            >
                              {leave.code}
                            </span>
                          </td>

                          {/* Employee Name */}
                          <td className="py-1 px-2.5 align-middle">
                            <span
                              className="font-medium text-slate-900 dark:text-white truncate max-w-[170px] block"
                              title={`${leave.employee_name} (${leave.employee_number}) • ${leave.department || 'General'}`}
                            >
                              {leave.employee_name}
                            </span>
                          </td>

                          {/* Policy / Type */}
                          <td className="py-1 px-2.5 align-middle">
                            <span
                              className="text-slate-700 dark:text-slate-300 truncate max-w-[130px] block"
                              title={`${leave.leave_type_name} (${leave.leave_type_id})`}
                            >
                              {leave.leave_type_name}
                            </span>
                          </td>

                          {/* Date Range */}
                          <td className="py-1 px-2.5 align-middle font-mono text-[12px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {leave.start_date} → {leave.end_date}
                          </td>

                          {/* Days */}
                          <td className="py-1 px-2.5 align-middle font-mono font-semibold text-[12px] text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {leave.total_days}d
                          </td>

                          {/* Coverage */}
                          <td className="py-1 px-2.5 align-middle whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center h-5 text-[10.5px] font-semibold px-1.5 rounded border ${payBadgeColor}`}>
                              {payPct.toFixed(0)}% {payPct >= 100 ? 'Full' : payPct > 0 ? 'Half' : 'Unpaid'}
                            </span>
                          </td>

                          {/* Deduction (QAR) */}
                          <td className="py-1 px-2.5 align-middle text-right font-mono text-[12px] whitespace-nowrap">
                            {isAmountMasked ? (
                              <span className="text-slate-400 text-[11px]">••••••</span>
                            ) : Number(leave.computed_deduction_qar || 0) > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                -{Number(leave.computed_deduction_qar).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0.00 QAR</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-1 px-2.5 align-middle whitespace-nowrap">
                            <span
                              className={`inline-flex items-center justify-center gap-1 h-5 text-[10.5px] font-semibold px-1.5 rounded uppercase border ${statusBadgeColor}`}
                              title={auditText}
                            >
                              {isApproved && <Check className="w-2.5 h-2.5" />}
                              <span>{leave.approval_status.replace('_', ' ')}</span>
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-1 px-2.5 align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {isPendingL1 && (
                                <button
                                  type="button"
                                  onClick={() => handleApprove(leave, false)}
                                  className="h-6 px-2 text-[11px] font-semibold rounded bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                                  title="Sign as Shift Supervisor (Move to HR Review)"
                                >
                                  Approve L1
                                </button>
                              )}

                              {isPendingL1 && canManagePayroll && (
                                <button
                                  type="button"
                                  onClick={() => handleApprove(leave, true)}
                                  className="h-6 px-2 text-[11px] font-semibold rounded bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
                                  title="Fast-Track Final Approval"
                                >
                                  Fast-Track
                                </button>
                              )}

                              {isPendingL2 && (
                                <button
                                  type="button"
                                  onClick={() => handleApprove(leave, false)}
                                  className="h-6 px-2 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
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
                                  className="h-6 px-2 text-[11px] font-semibold rounded border border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                  title="Reject Leave"
                                >
                                  Reject
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setEmailLeave(leave)}
                                className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
                                title="Send Leave Notice by Email"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setMessageLeave(leave)}
                                className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                                title="Send Leave Notice via WhatsApp / SMS"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                              </button>

                              {!isApproved && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(leave)}
                                  className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
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
        </div>
      )}

      {/* 5. MODAL: Rejection Reason */}
      {rejectingLeave && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => setRejectingLeave(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertCircle className="w-5 h-5" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Reject Leave Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingLeave(null)}
                className="flex items-center gap-1.5 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                title="Close (Esc)"
                aria-label="Close dialog"
              >
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Esc
                </span>
                <X className="w-4 h-4" />
              </button>
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

      {/* Corporate Email Dispatcher Modal */}
      {emailLeave && (
        <SendEmailModal
          isOpen={Boolean(emailLeave)}
          onClose={() => setEmailLeave(null)}
          recordModel="hr.leave"
          recordId={String(emailLeave.id)}
          defaultToEmail={
            employees.find((e) => e.id === emailLeave.employee_id || e.full_name === emailLeave.employee_name)?.work_email ||
            emailLeave.employee_email ||
            ''
          }
          defaultSubject={`Leave Request Update — ${emailLeave.employee_name}`}
          recordData={{
            employee_name: emailLeave.employee_name,
            employee_number: emailLeave.employee_number,
            leave_type: emailLeave.leave_type_name,
            start_date: emailLeave.start_date,
            end_date: emailLeave.end_date,
            total_days: emailLeave.total_days,
            approval_status: emailLeave.approval_status,
            rejection_reason: emailLeave.rejection_reason || '',
          }}
          onSent={() => {
            // Dispatches window event
          }}
        />
      )}

      {/* WhatsApp & SMS Notification Modal */}
      {messageLeave && (
        <SendMessageModal
          isOpen={Boolean(messageLeave)}
          onClose={() => setMessageLeave(null)}
          recordModel="hr.leave"
          recordId={String(messageLeave.id)}
          recordData={{
            employee_name: messageLeave.employee_name,
            leave_type: messageLeave.leave_type_name,
            start_date: messageLeave.start_date,
            end_date: messageLeave.end_date,
            total_days: messageLeave.total_days,
            status: messageLeave.approval_status,
            phone:
              employees.find((e) => e.id === messageLeave.employee_id || e.full_name === messageLeave.employee_name)?.phone ||
              '+974 5599 8877',
          }}
          defaultChannel="whatsapp"
          onSuccess={() => {
            setActionMessage({ type: 'success', text: `Message dispatched for ${messageLeave.employee_name}.` });
          }}
        />
      )}
    </div>
  );
}

export default LeaveManagementView;
