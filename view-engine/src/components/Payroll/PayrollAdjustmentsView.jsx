import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Truck,
  Gift,
  AlertOctagon,
  Plus,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  RefreshCw,
  Check,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Layers,
  Trash2,
  Lock,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccessControl } from '../../context/AccessControlContext';

export function PayrollAdjustmentsView() {
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

  const [adjustments, setAdjustments] = useState([]);
  const [summary, setSummary] = useState({
    pending_supervisor_count: 0,
    pending_hr_count: 0,
    approved_additions_qar: null,
    approved_deductions_qar: null,
  });
  const [employees, setEmployees] = useState([]);
  const [taskRules, setTaskRules] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Filters
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedYm, setSelectedYm] = useState(currentYm);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 80;
  const [showSummary, setShowSummary] = useState(false);

  // Modals
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [entryMode, setEntryMode] = useState('overtime'); // 'overtime' | 'task_benefit' | 'bonus' | 'deduction'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rejection modal
  const [rejectingAdj, setRejectingAdj] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Form State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeBasis, setEmployeeBasis] = useState(null); // { base_salary, housing_allowance, allowances_by_rule, ... }
  const [loadingBasis, setLoadingBasis] = useState(false);

  // Preset Selection & Form Inputs
  const [rulePresetId, setRulePresetId] = useState('');
  const [quantity, setQuantity] = useState(1.0);
  const [title, setTitle] = useState('');
  const [fixedAmount, setFixedAmount] = useState(0.0);
  const [notes, setNotes] = useState('');

  const handleDiscardEntry = useCallback(() => {
    const isDirty = Boolean(selectedEmployeeId || title || notes || fixedAmount > 0 || (quantity !== 1.0 && quantity !== '1.0' && quantity !== ''));
    if (isDirty) {
      if (!window.confirm('Discard unsaved entry and return to variable payroll list?')) return;
    }
    setSelectedEmployeeId('');
    setRulePresetId('');
    setQuantity(1.0);
    setTitle('');
    setFixedAmount(0.0);
    setNotes('');
    setEmployeeBasis(null);
    setIsNewEntryOpen(false);
  }, [selectedEmployeeId, title, notes, fixedAmount, quantity]);

  // Global Escape key listener for modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (rejectingAdj) {
          setRejectingAdj(null);
        } else if (isNewEntryOpen) {
          handleDiscardEntry();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rejectingAdj, isNewEntryOpen, handleDiscardEntry]);

  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  // Fetch adjustments
  const fetchAdjustments = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = `/api/v1/payroll/adjustments?salary_year_month=${selectedYm}`;
      if (typeFilter !== 'ALL') url += `&adjustment_type=${typeFilter}`;
      if (statusFilter !== 'ALL') url += `&approval_status=${statusFilter}`;

      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAdjustments(data.adjustments || []);
        if (data.summary) setSummary(data.summary);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({ type: 'error', text: err.detail || 'Failed to load adjustments.' });
      }
    } catch (err) {
      console.error('Error fetching adjustments:', err);
      setActionMessage({ type: 'error', text: 'Network error loading payroll adjustments.' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedYm, typeFilter, statusFilter, getAuthHeaders]);

  // Fetch employees list for dropdown
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

  // Fetch task rules from centralized configuration
  const fetchTaskRules = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/payroll/task-rules', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTaskRules(data.rules || []);
      }
    } catch (err) {
      console.error('Error loading task rules:', err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  useEffect(() => {
    fetchEmployees();
    fetchTaskRules();
  }, [fetchEmployees, fetchTaskRules]);

  // Filter rules by active entryMode
  const availableRules = useMemo(() => {
    return taskRules.filter((r) => r.entry_type === entryMode);
  }, [taskRules, entryMode]);

  // When entryMode changes or rules load, auto-select the first rule
  useEffect(() => {
    if (availableRules.length > 0) {
      const exists = availableRules.some((r) => r.id === rulePresetId);
      if (!exists) {
        const first = availableRules[0];
        setRulePresetId(first.id);
        setTitle(first.name);
        if (first.calculation_mode === 'fixed_amount' && Number(first.default_unit_rate || 0) > 0) {
          setFixedAmount(Number(first.default_unit_rate));
        } else {
          setFixedAmount(0.0);
        }
        if (entryMode === 'overtime') setQuantity(2.0);
        else setQuantity(1.0);
      }
    } else {
      setRulePresetId('');
    }
  }, [entryMode, availableRules, rulePresetId]);

  // Current active rule definition
  const selectedRule = useMemo(() => {
    return taskRules.find((r) => r.id === rulePresetId) || null;
  }, [taskRules, rulePresetId]);

  // When selected employee changes in modal, fetch basis (if authorized)
  useEffect(() => {
    if (!selectedEmployeeId) {
      setEmployeeBasis(null);
      return;
    }
    const loadBasis = async () => {
      setLoadingBasis(true);
      try {
        const res = await fetch(`/api/v1/payroll/employees/${selectedEmployeeId}/basis`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setEmployeeBasis(data);
        }
      } catch (err) {
        console.error('Error fetching employee basis:', err);
      } finally {
        setLoadingBasis(false);
      }
    };
    loadBasis();
  }, [selectedEmployeeId, getAuthHeaders]);

  // Handle Preset Selection
  const handleSelectRule = (ruleId) => {
    setRulePresetId(ruleId);
    const rule = taskRules.find((r) => r.id === ruleId);
    if (rule) {
      setTitle(rule.name);
      if (rule.calculation_mode === 'fixed_amount' && Number(rule.default_unit_rate || 0) > 0) {
        setFixedAmount(Number(rule.default_unit_rate));
      } else {
        setFixedAmount(0.0);
      }
    }
  };

  // Helper for computing custom basis in frontend preview
  const computeCustomBasisPreview = useCallback((basis, includedRules) => {
    if (!basis) return 0;
    let total = Number(basis.base_salary || 0);
    const alws = basis.allowances_by_rule || {};
    let rules = [];
    if (Array.isArray(includedRules)) {
      rules = includedRules;
    } else if (typeof includedRules === 'string') {
      try {
        rules = JSON.parse(includedRules);
      } catch {
        rules = [];
      }
    }
    for (const rId of rules) {
      if (alws[rId] !== undefined) {
        total += Number(alws[rId] || 0);
      } else if (rId === 'ALW_HOUSING' || String(rId).toUpperCase().includes('HOUSING')) {
        total += Number(basis.housing_allowance || 0);
      }
    }
    return total;
  }, []);

  // Live calculation preview math (only visible if canReadSalary is true)
  const livePreviewMath = useMemo(() => {
    if (!selectedRule || !canReadSalary) {
      return { unitRate: 0, totalAmount: 0, basisVal: 0 };
    }
    const calcMode = selectedRule.calculation_mode || (selectedRule.entry_type === 'overtime' ? 'hourly_multiplier' : 'piece_rate');
    const multPct = Number(selectedRule.ot_multiplier_pct || 100);
    const qty = Number(quantity || 0);

    if (calcMode === 'hourly_multiplier') {
      if (!employeeBasis || employeeBasis.restricted) return { unitRate: 0, totalAmount: 0, basisVal: 0 };
      const basisVal = computeCustomBasisPreview(employeeBasis, selectedRule.included_benefit_rules);
      const unitRate = Math.round((basisVal / 240.0) * (multPct / 100.0) * 100) / 100;
      const totalAmount = Math.round(unitRate * qty * 100) / 100;
      return { unitRate, totalAmount, basisVal };
    }

    if (calcMode === 'piece_rate') {
      const unitRate = Number(selectedRule.default_unit_rate || 0);
      const totalAmount = Math.round(unitRate * qty * 100) / 100;
      return { unitRate, totalAmount, basisVal: 0 };
    }

    if (calcMode === 'daily_rate') {
      if (!employeeBasis || employeeBasis.restricted) return { unitRate: 0, totalAmount: 0, basisVal: 0 };
      const basisVal = computeCustomBasisPreview(employeeBasis, selectedRule.included_benefit_rules);
      const unitRate = Math.round((basisVal / 30.0) * (multPct / 100.0) * 100) / 100;
      const totalAmount = Math.round(unitRate * qty * 100) / 100;
      return { unitRate, totalAmount, basisVal };
    }

    if (calcMode === 'percentage_of_basis') {
      if (!employeeBasis || employeeBasis.restricted) return { unitRate: 0, totalAmount: 0, basisVal: 0 };
      const basisVal = computeCustomBasisPreview(employeeBasis, selectedRule.included_benefit_rules);
      const unitRate = Math.round(basisVal * (multPct / 100.0) * 100) / 100;
      const totalAmount = Math.round(unitRate * qty * 100) / 100;
      return { unitRate, totalAmount, basisVal };
    }

    if (calcMode === 'fixed_amount') {
      const defRate = Number(selectedRule.default_unit_rate || 0);
      const amt = defRate > 0 ? defRate : Number(fixedAmount || 0);
      return { unitRate: amt, totalAmount: amt, basisVal: 0 };
    }

    const unitRate = Number(selectedRule.default_unit_rate || 0);
    return { unitRate, totalAmount: Math.round(unitRate * qty * 100) / 100, basisVal: 0 };
  }, [selectedRule, canReadSalary, employeeBasis, quantity, fixedAmount, computeCustomBasisPreview]);

  // Submit New Adjustment Entry
  const handleSubmitEntry = async (e) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setActionMessage({ type: 'error', text: 'Please select an employee.' });
      return;
    }
    if (!rulePresetId) {
      setActionMessage({ type: 'error', text: 'Please select a valid configuration preset.' });
      return;
    }
    if (entryMode === 'deduction' && !notes.trim()) {
      setActionMessage({ type: 'error', text: 'A mandatory audit note is required for salary deductions.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        employee_id: selectedEmployeeId,
        salary_year_month: selectedYm,
        rule_id: rulePresetId,
        quantity: Number(quantity || 1.0),
        computed_amount: Number(fixedAmount || 0.0),
        title: title.trim() || selectedRule?.name || 'Variable Payroll Adjustment',
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/v1/payroll/adjustments', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Adjustment ${data.adjustment?.code || ''} created successfully and queued for approval.`,
        });
        setIsNewEntryOpen(false);
        setSelectedEmployeeId('');
        setNotes('');
        fetchAdjustments();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to submit adjustment.' });
      }
    } catch (err) {
      console.error('Submit adjustment error:', err);
      setActionMessage({ type: 'error', text: 'Network error submitting adjustment.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Approve adjustment handler (L1 or L2 or Fast-track)
  const handleApprove = async (adj, fastTrack = false) => {
    try {
      const res = await fetch(`/api/v1/payroll/adjustments/${adj.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ fast_track: fastTrack }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Adjustment ${adj.code} ${fastTrack ? 'fast-track approved' : 'approved'}!`,
        });
        fetchAdjustments();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to approve adjustment.' });
      }
    } catch (err) {
      console.error('Approve error:', err);
      setActionMessage({ type: 'error', text: 'Error executing approval action.' });
    }
  };

  // Reject adjustment handler
  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectingAdj) return;
    setIsRejecting(true);
    try {
      const res = await fetch(`/api/v1/payroll/adjustments/${rejectingAdj.id}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: `Adjustment ${rejectingAdj.code} rejected.` });
        setRejectingAdj(null);
        setRejectionReason('');
        fetchAdjustments();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to reject adjustment.' });
      }
    } catch (err) {
      console.error('Reject error:', err);
      setActionMessage({ type: 'error', text: 'Error rejecting adjustment.' });
    } finally {
      setIsRejecting(false);
    }
  };

  // Delete adjustment handler
  const handleDelete = async (adj) => {
    if (!window.confirm(`Delete adjustment ${adj.code} (${adj.title})?`)) return;
    try {
      const res = await fetch(`/api/v1/payroll/adjustments/${adj.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: data.message || 'Adjustment deleted.' });
        fetchAdjustments();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to delete adjustment.' });
      }
    } catch (err) {
      console.error('Delete error:', err);
      setActionMessage({ type: 'error', text: 'Error deleting adjustment.' });
    }
  };

  // Filter adjustments by search
  const filteredAdjustments = useMemo(() => {
    if (!searchTerm.trim()) return adjustments;
    const term = searchTerm.toLowerCase();
    return adjustments.filter((a) => {
      return (
        (a.employee_name || '').toLowerCase().includes(term) ||
        (a.employee_number || '').toLowerCase().includes(term) ||
        (a.code || '').toLowerCase().includes(term) ||
        (a.title || '').toLowerCase().includes(term) ||
        (a.department || '').toLowerCase().includes(term)
      );
    });
  }, [adjustments, searchTerm]);

  // 80-record Odoo-style pagination
  const totalRecords = filteredAdjustments.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const pagedAdjustments = useMemo(() => {
    return filteredAdjustments.slice(startIndex, endIndex);
  }, [filteredAdjustments, startIndex, endIndex]);

  if (isNewEntryOpen) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn pb-16">
        {/* Top Breadcrumb & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDiscardEntry}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
              title="Back to Adjustments List"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Payroll & WPS</span>
                <span>/</span>
                <span>Variable Pay & Approvals</span>
                <span>/</span>
                <span className="text-slate-900 dark:text-white font-medium">New Variable Payroll Entry</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                New Variable Payroll Entry
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Target Month: <span className="font-bold text-slate-700 dark:text-slate-200">{selectedYm}</span>
            </span>
            <button
              type="button"
              onClick={handleDiscardEntry}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Discard
            </button>
            <button
              type="submit"
              form="variableEntryForm"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Submit for Sign-Off</span>
            </button>
          </div>
        </div>

        {/* In-place Form Content */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-6">
          {/* Mode Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setEntryMode('overtime')}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'overtime'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Overtime</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('task_benefit')}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'task_benefit'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Task / Trips</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('bonus')}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'bonus'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Bonus</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('deduction')}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'deduction'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Deduction</span>
            </button>
          </div>

          <form id="variableEntryForm" onSubmit={handleSubmitEntry} className="space-y-4 text-xs">
            {/* Employee Selection */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Select Employee *
              </label>
              <select
                required
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden"
              >
                <option value="">-- Choose Employee --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_number}) - {emp.department_id || emp.department || 'General'}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Salary Basis Banner: STRICTLY HIDDEN IF !canReadSalary */}
            {canReadSalary && loadingBasis && (
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 flex items-center gap-2 text-slate-500">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Loading live employee contract basis...</span>
              </div>
            )}

            {canReadSalary && employeeBasis && !employeeBasis.restricted && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Base Salary</span>
                  <strong className="font-mono text-slate-900 dark:text-white">{Number(employeeBasis.base_salary || 0).toLocaleString()} QAR</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Housing Allowance</span>
                  <strong className="font-mono text-slate-900 dark:text-white">{Number(employeeBasis.housing_allowance || 0).toLocaleString()} QAR</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Basic Rate / Hr</span>
                  <strong className="font-mono text-blue-600 dark:text-blue-400">{employeeBasis.hourly_basic_rate} QAR/h</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Basic+Housing / Hr</span>
                  <strong className="font-mono text-blue-600 dark:text-blue-400">{employeeBasis.hourly_basic_plus_housing_rate} QAR/h</strong>
                </div>
              </div>
            )}

            {/* Dynamic Preset Dropdown Across All Modes */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Preset Configuration Rule *
              </label>
              <select
                required
                value={rulePresetId}
                onChange={(e) => handleSelectRule(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                {availableRules.length === 0 ? (
                  <option value="">No presets configured for this category</option>
                ) : (
                  availableRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                      {canReadSalary && Number(rule.default_unit_rate || 0) > 0 ? ` (${rule.default_unit_rate} QAR/${rule.unit_label || 'Unit'})` : ''}
                      {rule.calculation_mode === 'hourly_multiplier' ? ` (${rule.ot_multiplier_pct}%)` : ''}
                      {rule.calculation_mode === 'daily_rate' ? ` (${rule.ot_multiplier_pct}% of Daily Basis)` : ''}
                      {rule.calculation_mode === 'percentage_of_basis' ? ` (${rule.ot_multiplier_pct}% of Basis)` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* MODE 1: OVERTIME */}
            {entryMode === 'overtime' && (
              <div className="space-y-3 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/20">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Overtime Hours Completed *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Calculation Multiplier
                    </label>
                    <div className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {selectedRule?.ot_multiplier_pct || 125}%
                    </div>
                  </div>
                </div>

                {/* Rate / Total Preview or Confidentiality Pill */}
                {canReadSalary ? (
                  <div className="p-3 rounded-xl bg-blue-100/60 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-blue-900 dark:text-blue-200 block text-xs">
                        Total Overtime Disbursement:
                      </span>
                      <span className="text-[11px] text-blue-700 dark:text-blue-400 font-mono">
                        {quantity} hrs × {livePreviewMath.unitRate} QAR/h
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-blue-900 dark:text-blue-200">
                      +{livePreviewMath.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-blue-100/40 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300 text-xs flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600" />
                    <span>Compensation rates are calculated automatically by the Payroll Engine based on the selected preset.</span>
                  </div>
                )}
              </div>
            )}

            {/* MODE 2: TASK / TRIP PIECE-RATE */}
            {entryMode === 'task_benefit' && (
              <div className="space-y-3 p-4 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Completed Qty ({selectedRule?.unit_label || 'Trips'}) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Unit Type
                    </label>
                    <div className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {selectedRule?.unit_label || 'Trips'} (Locked)
                    </div>
                  </div>
                </div>

                {canReadSalary ? (
                  <div className="p-3 rounded-xl bg-amber-100/60 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-amber-900 dark:text-amber-200 block text-xs">
                        Piece-Rate Incentive Total:
                      </span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 font-mono">
                        {quantity} {selectedRule?.unit_label || 'Trips'} × {selectedRule?.default_unit_rate || 0} QAR
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-amber-900 dark:text-amber-200">
                      +{livePreviewMath.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-100/40 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Compensation rates are calculated automatically by the Payroll Engine based on the selected preset.</span>
                  </div>
                )}
              </div>
            )}

            {/* MODE 3: BONUS */}
            {entryMode === 'bonus' && (
              <div className="space-y-3 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/20">
                {selectedRule?.calculation_mode === 'fixed_amount' && Number(selectedRule?.default_unit_rate || 0) === 0 ? (
                  canReadSalary ? (
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        Bonus Amount (QAR) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        value={fixedAmount}
                        onChange={(e) => setFixedAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-100/40 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>Compensation rates are calculated automatically by the Payroll Engine based on the selected preset.</span>
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        Completed Qty ({selectedRule?.unit_label || 'Units'}) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        Calculation Mode
                      </label>
                      <div className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {selectedRule?.calculation_mode || 'fixed_amount'}
                      </div>
                    </div>
                  </div>
                )}

                {canReadSalary && (selectedRule?.calculation_mode !== 'fixed_amount' || Number(selectedRule?.default_unit_rate || 0) > 0) && (
                  <div className="p-3 rounded-xl bg-emerald-100/60 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
                    <span className="font-bold text-emerald-900 dark:text-emerald-200 block text-xs">
                      Estimated Bonus Disbursement:
                    </span>
                    <div className="text-base font-bold font-mono text-emerald-900 dark:text-emerald-200">
                      +{livePreviewMath.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                    </div>
                  </div>
                )}

                {!canReadSalary && (
                  <div className="p-3 rounded-xl bg-emerald-100/40 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Compensation rates are calculated automatically by the Payroll Engine based on the selected preset.</span>
                  </div>
                )}
              </div>
            )}

            {/* MODE 4: DEDUCTION */}
            {entryMode === 'deduction' && (
              <div className="space-y-3 p-4 rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20">
                {selectedRule?.calculation_mode === 'daily_rate' ? (
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Number of Disciplinary Days *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                ) : selectedRule?.calculation_mode === 'fixed_amount' && Number(selectedRule?.default_unit_rate || 0) === 0 ? (
                  canReadSalary ? (
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        Deduction Amount (QAR) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        value={fixedAmount}
                        onChange={(e) => setFixedAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-rose-100/40 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>Deduction amounts are calculated or verified by HR during payroll review.</span>
                    </div>
                  )
                ) : (
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Quantity ({selectedRule?.unit_label || 'Units'}) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                )}

                {canReadSalary && (
                  <div className="p-3 rounded-xl bg-rose-100/60 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-center justify-between">
                    <span className="font-bold text-rose-900 dark:text-rose-200 block text-xs">
                      Estimated Deduction Total:
                    </span>
                    <div className="text-base font-bold font-mono text-rose-900 dark:text-rose-200">
                      -{livePreviewMath.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                    </div>
                  </div>
                )}

                {!canReadSalary && (
                  <div className="p-3 rounded-xl bg-rose-100/40 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>Compensation rates are calculated automatically by the Payroll Engine based on the selected preset.</span>
                  </div>
                )}
              </div>
            )}

            {/* Title & Notes */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Title / Reference Description *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                {entryMode === 'deduction' ? 'Mandatory Audit Note *' : 'Audit Notes / Justification (Optional)'}
              </label>
              <textarea
                rows={2}
                required={entryMode === 'deduction'}
                placeholder={entryMode === 'deduction' ? 'Provide legal / contractual reason for salary deduction...' : 'Trip details, shift remarks...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* 1. Odoo-Style Consolidated 44px Top Control Bar */}
      <div className="h-11 min-h-[44px] bg-white dark:bg-slate-900 px-3 sm:px-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-3">
        {/* Left: Primary Action + Title + Month + Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsNewEntryOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New Entry</span>
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-900 dark:text-white hidden sm:inline">
              Variable Pay & Approvals
            </span>

            {/* Target Month */}
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">
              <Calendar className="w-3 h-3 text-slate-400" />
              <input
                type="text"
                pattern="^\d{4}-(0[1-9]|1[0-2])$"
                value={selectedYm}
                onChange={(e) => setSelectedYm(e.target.value)}
                className="bg-transparent font-mono text-[11.5px] font-bold text-slate-800 dark:text-slate-200 w-14 focus:outline-hidden"
                title="Filter by Salary Month (YYYY-MM)"
              />
            </div>

            <button
              type="button"
              onClick={fetchAdjustments}
              disabled={isLoading}
              className="p-1.5 text-xs rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Refresh Records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Center: Slim expandable search + inline filter dropdown tags */}
        <div className="flex items-center gap-2 flex-1 max-w-md mx-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search employee, ID, code..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 text-xs pl-8 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-8 px-2 text-[11.5px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer shrink-0"
          >
            <option value="ALL">All Types</option>
            <option value="overtime">Overtime</option>
            <option value="task_benefit">Piece-Rate</option>
            <option value="bonus">Bonus</option>
            <option value="deduction">Deduction</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-8 px-2 text-[11.5px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer shrink-0 hidden md:block"
          >
            <option value="ALL">All Status</option>
            <option value="pending_supervisor">Pending L1</option>
            <option value="pending_hr">Pending L2</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Right: Summary Toggle + Odoo-Style Pager */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowSummary(!showSummary)}
            className={`flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              showSummary
                ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Toggle KPI Summary Ribbon"
          >
            {showSummary ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Summary</span>
          </button>

          {/* Odoo-style Pager [ 1-80 / 391 ] < > */}
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-xs pl-2 border-l border-slate-200 dark:border-slate-700">
            <span className="tabular-nums">
              {totalRecords === 0 ? '0-0' : `${startIndex + 1}-${endIndex}`} / {totalRecords}
            </span>
            <div className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous 80 Records"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              </button>
              <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-700" />
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next 80 Records"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium ${
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
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Collapsed 28px Single-Line Summary Ribbon (Toggled) */}
      {showSummary && (
        <div className="h-7 min-h-[28px] px-3 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 animate-fadeIn">
          <div className="flex items-center gap-4 flex-wrap text-[11.5px]">
            <span className="flex items-center gap-1.5">
              <span className="text-slate-500">Pending Supervisor (L1):</span>
              <strong className="font-mono text-amber-600 dark:text-amber-400">{summary.pending_supervisor_count}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="flex items-center gap-1.5">
              <span className="text-slate-500">Pending HR/Finance (L2):</span>
              <strong className="font-mono text-purple-600 dark:text-purple-400">{summary.pending_hr_count}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="flex items-center gap-1.5">
              <span className="text-slate-500">Approved Additions:</span>
              <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                {!canReadSalary || summary.approved_additions_qar === null
                  ? '••••'
                  : `+${Number(summary.approved_additions_qar || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`}
              </strong>
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="flex items-center gap-1.5">
              <span className="text-slate-500">Approved Deductions:</span>
              <strong className="font-mono text-rose-600 dark:text-rose-400">
                {!canReadSalary || summary.approved_deductions_qar === null
                  ? '••••'
                  : `-${Number(summary.approved_deductions_qar || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSummary(false)}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            Hide
          </button>
        </div>
      )}

      {/* 3. High-Density Adjustments Table (Strict 28-32px row height, sticky header, 80 records per view) */}
      <div className="max-h-[calc(100vh-140px)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 shadow-2xs">
            <tr className="h-8 text-slate-600 dark:text-slate-400 font-semibold text-[11.5px] uppercase tracking-wider">
              <th className="py-1 px-2.5">Adjustment / Code</th>
              <th className="py-1 px-2.5">Employee</th>
              <th className="py-1 px-2.5">Type</th>
              <th className="py-1 px-2.5">Basis / Rate</th>
              <th className="py-1 px-2.5 text-right">Quantity</th>
              <th className="py-1 px-2.5 text-right font-semibold text-slate-900 dark:text-white">Amount (QAR)</th>
              <th className="py-1 px-2.5">Status</th>
              <th className="py-1 px-2.5">Audit Trail</th>
              <th className="py-1 px-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-[12.5px] text-slate-800 dark:text-slate-200 divide-y divide-slate-100 dark:divide-slate-800/80">
            {pagedAdjustments.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                  No variable adjustments found for {selectedYm}. Click "+ New Entry" to record overtime or piece-rates.
                </td>
              </tr>
            ) : (
              pagedAdjustments.map((adj) => {
                const isPendingL1 = adj.approval_status === 'pending_supervisor';
                const isPendingL2 = adj.approval_status === 'pending_hr';
                const isApproved = adj.approval_status === 'approved';
                const isRejected = adj.approval_status === 'rejected';

                const typeColor =
                  adj.adjustment_type === 'overtime'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200'
                    : adj.adjustment_type === 'task_benefit'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200'
                    : adj.adjustment_type === 'bonus'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200';

                const statusBadgeColor =
                  isApproved
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200'
                    : isPendingL2
                    ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200'
                    : isPendingL1
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200';

                const isAmountMasked = !canReadSalary || adj.computed_amount === null || adj.computed_amount === undefined;
                const isRateMasked = !canReadSalary || adj.unit_rate === null || adj.unit_rate === undefined;

                // Single-line Rate format
                let rateDisplay = '—';
                if (isRateMasked) {
                  rateDisplay = '•••• (Masked)';
                } else if (adj.adjustment_type === 'overtime') {
                  rateDisplay = `${Number(adj.unit_rate || 0).toFixed(2)} QAR/hr (${adj.multiplier_pct}%)`;
                } else if (adj.adjustment_type === 'task_benefit') {
                  rateDisplay = `${Number(adj.unit_rate || 0).toFixed(2)} QAR/${adj.unit_label || 'unit'}`;
                } else if (adj.calculation_basis === 'daily_rate') {
                  rateDisplay = `${Number(adj.unit_rate || 0).toFixed(2)} QAR/day`;
                } else {
                  rateDisplay = (adj.category_subtype || '').replace('_', ' ') || 'Fixed';
                }

                // Audit tooltip
                const auditTooltip = `Submitted by: ${adj.submitted_by_name || 'System'}${
                  adj.level1_approved_by ? `\nL1 Supervisor: ${adj.level1_approved_by}` : ''
                }${adj.level2_approved_by ? `\nL2 HR: ${adj.level2_approved_by}` : ''}${
                  adj.rejection_reason ? `\nRejection: ${adj.rejection_reason}` : ''
                }`;

                return (
                  <tr
                    key={adj.id}
                    className="h-8 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/40 dark:even:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800/60 transition-colors"
                  >
                    {/* Adjustment Title (single-line truncate, code in tooltip) */}
                    <td className="py-1 px-2.5">
                      <span
                        className="truncate max-w-[200px] font-semibold text-slate-900 dark:text-white block cursor-default"
                        title={`${adj.code} • ${adj.salary_year_month} • ${adj.title}${adj.rule_id ? ` [${adj.rule_id}]` : ''}`}
                      >
                        {adj.title}
                      </span>
                    </td>

                    {/* Employee Name (single-line, ID & Dept in tooltip) */}
                    <td className="py-1 px-2.5">
                      <span
                        className="truncate max-w-[150px] font-medium text-slate-900 dark:text-white block cursor-default"
                        title={`${adj.employee_name} (${adj.employee_number}) • ${adj.department || 'General'}`}
                      >
                        {adj.employee_name}
                      </span>
                    </td>

                    {/* Type Pill (compact 20px) */}
                    <td className="py-1 px-2.5">
                      <span className={`inline-flex items-center h-5 px-1.5 py-0 rounded text-[10.5px] font-bold border uppercase shrink-0 ${typeColor}`}>
                        {adj.adjustment_type.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Single-line Basis / Rate */}
                    <td className="py-1 px-2.5">
                      <span className="font-mono text-[12px] text-slate-600 dark:text-slate-300 truncate max-w-[130px] block" title={rateDisplay}>
                        {rateDisplay}
                      </span>
                    </td>

                    {/* Quantity (Monospace, right-aligned) */}
                    <td className="py-1 px-2.5 text-right font-mono text-[12px] font-bold text-slate-700 dark:text-slate-300">
                      {adj.quantity} {adj.unit_label}
                    </td>

                    {/* Amount (Monospace, right-aligned) */}
                    <td className="py-1 px-2.5 text-right font-mono text-[12px] font-bold">
                      {isAmountMasked ? (
                        <span className="text-slate-400 dark:text-slate-500">••••</span>
                      ) : (
                        <span className={adj.adjustment_type === 'deduction' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                          {adj.adjustment_type === 'deduction' ? '-' : '+'}{Number(adj.computed_amount || 0).toFixed(2)}
                        </span>
                      )}
                    </td>

                    {/* Status Pill (compact 20px) */}
                    <td className="py-1 px-2.5">
                      <span className={`inline-flex items-center h-5 px-1.5 py-0 rounded text-[10.5px] font-bold border shrink-0 ${statusBadgeColor}`}>
                        {adj.approval_status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Audit Trail (Single compact pill with tooltip) */}
                    <td className="py-1 px-2.5">
                      <span
                        className="inline-flex items-center h-5 px-1.5 py-0 rounded text-[10.5px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-help"
                        title={auditTooltip}
                      >
                        {adj.level2_approved_by
                          ? 'L2 Signed'
                          : adj.level1_approved_by
                          ? 'L1 Signed'
                          : adj.rejection_reason
                          ? 'Rejected'
                          : 'Draft'}
                      </span>
                    </td>

                    {/* Actions (compact 24px buttons) */}
                    <td className="py-1 px-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isPendingL1 && (
                          <button
                            type="button"
                            onClick={() => handleApprove(adj, false)}
                            className="h-6 px-2 text-[11px] font-semibold rounded-md bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                            title="Sign as Shift Supervisor"
                          >
                            Approve L1
                          </button>
                        )}

                        {isPendingL1 && canManagePayroll && (
                          <button
                            type="button"
                            onClick={() => handleApprove(adj, true)}
                            className="h-6 px-2 text-[11px] font-semibold rounded-md bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
                            title="Fast-Track Approval"
                          >
                            Fast-Track
                          </button>
                        )}

                        {isPendingL2 && (
                          <button
                            type="button"
                            onClick={() => handleApprove(adj, false)}
                            className="h-6 px-2 text-[11px] font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            title="Final HR / Finance Approval"
                          >
                            Approve L2
                          </button>
                        )}

                        {!isRejected && !isApproved && (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingAdj(adj);
                              setRejectionReason('');
                            }}
                            className="h-6 px-2 text-[11px] font-semibold rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Reject"
                          >
                            Reject
                          </button>
                        )}

                        {!isApproved && (
                          <button
                            type="button"
                            onClick={() => handleDelete(adj)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Delete Entry"
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

      {/* 5. MODAL: Rejection Reason */}
      {rejectingAdj && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => setRejectingAdj(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertCircle className="w-5 h-5" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Reject Variable Adjustment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingAdj(null)}
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
              Rejecting <strong>{rejectingAdj.code}</strong> ({rejectingAdj.title}) for {rejectingAdj.employee_name}. This will prevent inclusion in monthly payslips.
            </p>

            <form onSubmit={handleReject} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Rejection Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail reason for rejection (e.g. invalid trip manifest, unauthorized overtime)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRejectingAdj(null)}
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
