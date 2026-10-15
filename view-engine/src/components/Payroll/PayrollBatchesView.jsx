import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Banknote,
  FileSpreadsheet,
  Download,
  Printer,
  Lock,
  Unlock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Calendar,
  DollarSign,
  Users,
  Edit3,
  Trash2,
  Plus,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  Eye,
  X,
  Building2,
  Briefcase,
  Clock,
  FileText,
  Check,
  AlertTriangle,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccessControl } from '../../context/AccessControlContext';

export function PayrollBatchesView() {
  const auth = useAuth();
  const { hasPermission } = useAccessControl();

  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const canManagePayroll = hasPermission('payroll.manage');
  const canReadPayroll = hasPermission('payroll.read');

  // State
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [currentBatchData, setCurrentBatchData] = useState(null); // { batch, payslips, ... }
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSyncingAdjustments, setIsSyncingAdjustments] = useState(false);
  const [actionMessage, setActionMessage] = useState(null); // { type: 'success' | 'error', text: string }

  // Filter & Search inside payslips table
  const [searchTerm, setSearchTerm] = useState('');
  const [wpsFilter, setWpsFilter] = useState('ALL'); // 'ALL' | 'ready' | 'missing'
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Modals
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateYearMonth, setGenerateYearMonth] = useState('2026-10');
  const [generateTitle, setGenerateTitle] = useState('');
  const [isSubmittingGenerate, setIsSubmittingGenerate] = useState(false);

  // Edit Payslip Modal
  const [editingPayslip, setEditingPayslip] = useState(null);
  const [editFormData, setEditFormData] = useState({
    working_days: 30,
    overtime_hours: 0,
    overtime_pay: 0,
    other_allowances: 0,
    deductions: 0,
    notes: '',
  });
  const [isSavingPayslip, setIsSavingPayslip] = useState(false);

  // Print Payslips Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printSinglePayslip, setPrintSinglePayslip] = useState(null); // null = all in batch

  // Lock confirmation modal
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const [isLocking, setIsLocking] = useState(false);

  // Delete confirmation
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return headers;
  }, [sessionToken]);

  // Fetch batches list
  const fetchBatches = useCallback(async (selectNewest = false) => {
    setIsLoadingBatches(true);
    try {
      const res = await fetch('/api/v1/payroll/batches', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const batchList = data.batches || [];
        setBatches(batchList);
        if (batchList.length > 0) {
          if (selectNewest || !selectedBatchId) {
            setSelectedBatchId(batchList[0].id);
          }
        } else {
          setSelectedBatchId(null);
          setCurrentBatchData(null);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({ type: 'error', text: err.detail || 'Failed to load payroll batches.' });
      }
    } catch (err) {
      console.error('Error fetching batches:', err);
      setActionMessage({ type: 'error', text: 'Network error loading payroll batches.' });
    } finally {
      setIsLoadingBatches(false);
    }
  }, [getAuthHeaders, selectedBatchId]);

  // Fetch selected batch details & payslips
  const fetchBatchDetails = useCallback(async (batchId) => {
    if (!batchId) return;
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/v1/payroll/batches/${batchId}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentBatchData(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({ type: 'error', text: err.detail || 'Failed to load batch details.' });
      }
    } catch (err) {
      console.error('Error fetching batch details:', err);
      setActionMessage({ type: 'error', text: 'Network error loading batch details.' });
    } finally {
      setIsLoadingDetails(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchBatches(true);
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      fetchBatchDetails(selectedBatchId);
    }
  }, [selectedBatchId, fetchBatchDetails]);

  // Auto-dismiss alert
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Quick Metrics (KPIs)
  const kpiMetrics = useMemo(() => {
    const totalBatches = batches.length;
    const lockedBatches = batches.filter((b) => b.status === 'locked' || b.status === 'exported').length;

    // Total net disbursement across active/latest batch or all
    const latestBatch = batches[0];
    const latestNet = latestBatch ? Number(latestBatch.total_net_salary || 0) : 0;
    const latestMonth = latestBatch ? latestBatch.salary_year_month : 'None';

    // WPS compliance in current viewed batch
    const readyCount = currentBatchData?.wps_ready_count || 0;
    const totalSlips = currentBatchData?.total_payslips || 0;
    const wpsPct = totalSlips > 0 ? Math.round((readyCount / totalSlips) * 100) : 100;

    return {
      totalBatches,
      lockedBatches,
      latestNet,
      latestMonth,
      wpsPct,
      readyCount,
      totalSlips,
    };
  }, [batches, currentBatchData]);

  // Generate Batch Handler
  const handleGenerateBatch = async (e) => {
    e.preventDefault();
    if (!generateYearMonth) return;
    setIsSubmittingGenerate(true);
    try {
      const res = await fetch('/api/v1/payroll/batches', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          salary_year_month: generateYearMonth.trim(),
          title: generateTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Batch ${data.batch?.batch_code || ''} generated successfully with ${data.payslips_generated || 0} employee payslips.`,
        });
        setIsGenerateModalOpen(false);
        setGenerateTitle('');
        await fetchBatches();
        if (data.batch?.id) {
          setSelectedBatchId(data.batch.id);
        }
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to generate payroll batch.' });
      }
    } catch (err) {
      console.error('Generate batch error:', err);
      setActionMessage({ type: 'error', text: 'Error connecting to payroll engine.' });
    } finally {
      setIsSubmittingGenerate(false);
    }
  };

  // Lock Batch Handler
  const handleLockBatch = async () => {
    if (!selectedBatchId) return;
    setIsLocking(true);
    try {
      const res = await fetch(`/api/v1/payroll/batches/${selectedBatchId}/lock`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Batch locked and sealed. ${data.synced_attendance_records || 0} attendance records marked as synced.`,
        });
        setIsLockConfirmOpen(false);
        fetchBatches();
        fetchBatchDetails(selectedBatchId);
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to lock batch.' });
      }
    } catch (err) {
      console.error('Lock batch error:', err);
      setActionMessage({ type: 'error', text: 'Network error locking batch.' });
    } finally {
      setIsLocking(false);
    }
  };

  // Delete Batch Handler
  const handleDeleteBatch = async () => {
    if (!selectedBatchId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/payroll/batches/${selectedBatchId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: data.message || 'Draft batch deleted.' });
        setIsDeleteConfirmOpen(false);
        fetchBatches(true);
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to delete batch.' });
      }
    } catch (err) {
      console.error('Delete batch error:', err);
      setActionMessage({ type: 'error', text: 'Network error deleting batch.' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Export SIF file Handler
  const handleExportSIF = async () => {
    if (!selectedBatchId) return;
    try {
      const headers = {};
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch(`/api/v1/payroll/batches/${selectedBatchId}/export-sif`, {
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to export SIF.' }));
        throw new Error(err.detail || 'Export failed.');
      }

      const disposition = res.headers.get('Content-Disposition');
      let filename = `SIF_${currentBatchData?.batch?.batch_code || 'payroll'}.sif`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setActionMessage({
        type: 'success',
        text: `Official Qatar WPS file "${filename}" downloaded successfully.`,
      });
      // Refresh batch status if it transitioned to 'exported'
      fetchBatches();
      fetchBatchDetails(selectedBatchId);
    } catch (err) {
      console.error('Export SIF error:', err);
      setActionMessage({ type: 'error', text: err.message || 'Error exporting WPS .SIF file.' });
    }
  };

  // Sync approved variable adjustments handler
  const handleSyncAdjustments = async () => {
    if (!selectedBatchId) return;
    setIsSyncingAdjustments(true);
    try {
      const res = await fetch(`/api/v1/payroll/batches/${selectedBatchId}/sync-adjustments`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: data.message || 'Approved variable payroll adjustments synchronized!',
        });
        fetchBatchDetails(selectedBatchId);
        fetchBatches();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to sync adjustments.' });
      }
    } catch (err) {
      console.error('Sync adjustments error:', err);
      setActionMessage({ type: 'error', text: 'Error connecting to payroll adjustments engine.' });
    } finally {
      setIsSyncingAdjustments(false);
    }
  };

  // Open Edit Payslip Modal
  const openEditPayslip = (p) => {
    setEditingPayslip(p);
    setEditFormData({
      working_days: p.working_days ?? 30,
      overtime_hours: p.overtime_hours ?? 0,
      overtime_pay: p.overtime_pay ?? 0,
      other_allowances: p.other_allowances ?? 0,
      deductions: p.deductions ?? 0,
      notes: p.notes ?? '',
    });
  };

  // Submit Edit Payslip
  const handleSavePayslip = async (e) => {
    e.preventDefault();
    if (!editingPayslip) return;
    setIsSavingPayslip(true);
    try {
      const res = await fetch(`/api/v1/payroll/payslips/${editingPayslip.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          working_days: parseInt(editFormData.working_days, 10),
          overtime_hours: parseFloat(editFormData.overtime_hours) || 0,
          overtime_pay: parseFloat(editFormData.overtime_pay) || 0,
          other_allowances: parseFloat(editFormData.other_allowances) || 0,
          deductions: parseFloat(editFormData.deductions) || 0,
          notes: editFormData.notes || '',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Payslip for ${editingPayslip.employee_name} updated successfully.`,
        });
        setEditingPayslip(null);
        // Refresh details & batches
        fetchBatchDetails(selectedBatchId);
        fetchBatches();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to update payslip.' });
      }
    } catch (err) {
      console.error('Update payslip error:', err);
      setActionMessage({ type: 'error', text: 'Error saving payslip adjustments.' });
    } finally {
      setIsSavingPayslip(false);
    }
  };

  // Filtered payslips
  const payslipsList = currentBatchData?.payslips || [];
  const uniqueDepts = useMemo(() => {
    const set = new Set();
    payslipsList.forEach((p) => {
      if (p.department) set.add(p.department);
    });
    return Array.from(set).sort();
  }, [payslipsList]);

  const filteredPayslips = useMemo(() => {
    return payslipsList.filter((p) => {
      // Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = (p.employee_name || '').toLowerCase().includes(term);
        const matchesNum = (p.employee_number || '').toLowerCase().includes(term);
        const matchesDept = (p.department || '').toLowerCase().includes(term);
        const matchesQid = (p.national_id_number || '').toLowerCase().includes(term);
        if (!matchesName && !matchesNum && !matchesDept && !matchesQid) return false;
      }
      // WPS filter
      if (wpsFilter === 'ready' && p.wps_status !== 'ready') return false;
      if (wpsFilter === 'missing' && p.wps_status === 'ready') return false;
      // Dept filter
      if (deptFilter !== 'ALL' && p.department !== deptFilter) return false;

      return true;
    });
  }, [payslipsList, searchTerm, wpsFilter, deptFilter]);

  const selectedBatch = currentBatchData?.batch || batches.find((b) => b.id === selectedBatchId);
  const isDraft = selectedBatch?.status === 'draft';

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  Qatar WPS Payroll Engine
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-bold border border-amber-200 dark:border-amber-900">
                  QCB Law No. 1 / 2015
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Automated attendance reconciliation, contract benefit computation, and official Qatar Central Bank .SIF file generation.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              fetchBatches();
              if (selectedBatchId) fetchBatchDetails(selectedBatchId);
            }}
            disabled={isLoadingBatches || isLoadingDetails}
            className="p-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoadingBatches || isLoadingDetails) ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              setGenerateYearMonth(ym);
              setGenerateTitle(`Payroll Reconciliation - ${ym}`);
              setIsGenerateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Monthly Batch</span>
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
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Total Payroll Batches</span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {kpiMetrics.totalBatches}
          </div>
          <div className="text-[11px] text-slate-400">
            {kpiMetrics.lockedBatches} sealed or exported
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Active Month Disbursement</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {kpiMetrics.latestNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">QAR</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            Period: {kpiMetrics.latestMonth}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>WPS Compliance Score</span>
            <ShieldCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {kpiMetrics.wpsPct}%
          </div>
          <div className="text-[11px] text-slate-400">
            {kpiMetrics.readyCount} of {kpiMetrics.totalSlips} employees ready for WPS
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Locked & Audited Batches</span>
            <Lock className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {kpiMetrics.lockedBatches}
          </div>
          <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
            Attendance hours synchronized
          </div>
        </div>
      </div>

      {/* 3. Main Workspace: Batches Selector & Interactive Batch Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Batches List Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Payroll Batches ({batches.length})
            </h2>
          </div>

          <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
            {batches.length === 0 ? (
              <div className="p-6 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 text-xs">
                No payroll batches created yet. Click "+ Generate Monthly Batch" to compute your first batch.
              </div>
            ) : (
              batches.map((b) => {
                const isSelected = b.id === selectedBatchId;
                const statusColor =
                  b.status === 'locked'
                    ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                    : b.status === 'exported'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBatchId(b.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-500 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {b.batch_code}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColor}`}>
                            {b.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium line-clamp-1 mt-0.5">
                          {b.title}
                        </p>
                      </div>
                      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'text-amber-600 rotate-90' : 'text-slate-400'}`} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">Period</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {b.salary_year_month}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Employees</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {b.total_employees} active
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white pt-1">
                        <span>Net Disbursement:</span>
                        <span className="font-mono text-amber-600 dark:text-amber-400">
                          {Number(b.total_net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Interactive Batch Detail & Payslips Table (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {!selectedBatch ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              Select a payroll batch from the left to view detailed payslips and generate WPS files.
            </div>
          ) : (
            <>
              {/* Batch Detail Header Card */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {selectedBatch.title}
                      </h2>
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {selectedBatch.batch_code}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          selectedBatch.status === 'locked'
                            ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200'
                            : selectedBatch.status === 'exported'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200'
                        }`}
                      >
                        {selectedBatch.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Salary Month: <strong className="text-slate-700 dark:text-slate-300">{selectedBatch.salary_year_month}</strong> • Created by {selectedBatch.created_by_name || 'System Admin'}
                      {selectedBatch.locked_at && ` • Sealed on ${new Date(selectedBatch.locked_at).toLocaleString()}`}
                    </p>
                  </div>

                  {/* Batch Action Buttons */}
                  <div className="flex items-center flex-wrap gap-2">
                    {/* Sync Approved Adjustments Button */}
                    {isDraft && (
                      <button
                        type="button"
                        onClick={handleSyncAdjustments}
                        disabled={isSyncingAdjustments}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        title="Recalculate and pull approved overtime, trips, bonuses and deductions into draft payslips"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAdjustments ? 'animate-spin' : ''}`} />
                        <span>Sync Approved Adjustments</span>
                      </button>
                    )}

                    {/* Lock Batch Button */}
                    {isDraft && (
                      <button
                        type="button"
                        onClick={() => setIsLockConfirmOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white shadow-xs transition-colors cursor-pointer"
                        title="Seal batch and sync attendance hours"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Lock & Seal Batch</span>
                      </button>
                    )}

                    {/* Export SIF Button */}
                    <button
                      type="button"
                      onClick={handleExportSIF}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
                      title="Download official Qatar Central Bank .SIF file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export WPS (.SIF)</span>
                    </button>

                    {/* Print Payslips Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setPrintSinglePayslip(null);
                        setIsPrintModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-blue-500" />
                      <span>Print All Payslips</span>
                    </button>

                    {/* Delete Batch (Draft only) */}
                    {isDraft && (
                      <button
                        type="button"
                        onClick={() => setIsDeleteConfirmOpen(true)}
                        className="p-2 text-xs rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete Draft Batch"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Batch Breakdown Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Base Salaries</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {Number(selectedBatch.total_base_salary || 0).toLocaleString()} QAR
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Allowances</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      +{Number(selectedBatch.total_allowances || 0).toLocaleString()} QAR
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Overtime Pay</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{Number(selectedBatch.total_overtime_pay || 0).toLocaleString()} QAR
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Deductions</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      -{Number(selectedBatch.total_deductions || 0).toLocaleString()} QAR
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 col-span-2">
                    <span className="text-amber-700 dark:text-amber-400 block text-[10px] uppercase font-bold">Total Net Disbursement</span>
                    <span className="font-mono text-sm font-bold text-amber-700 dark:text-amber-300">
                      {Number(selectedBatch.total_net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR
                    </span>
                  </div>
                </div>

                {/* WPS Ready Warning / Indicator */}
                {currentBatchData && currentBatchData.wps_missing_count > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <strong>WPS Validation Warning:</strong> {currentBatchData.wps_missing_count} employee(s) in this batch are missing a valid 29-character Qatar IBAN (starting with QA) or QID/Visa number. The Ministry of Labour WPS portal will reject lines with invalid bank credentials.
                    </div>
                  </div>
                )}
              </div>

              {/* Payslips Search, Filter & Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                {/* Table Filter Toolbar */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search employee, ID, QID, department..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {/* WPS Status Filter */}
                    <select
                      value={wpsFilter}
                      onChange={(e) => setWpsFilter(e.target.value)}
                      className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-hidden"
                    >
                      <option value="ALL">All WPS Statuses</option>
                      <option value="ready">WPS Ready</option>
                      <option value="missing">Missing QA IBAN / QID</option>
                    </select>

                    {/* Department Filter */}
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-hidden"
                    >
                      <option value="ALL">All Departments</option>
                      {uniqueDepts.map((d) => (
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
                        <th className="py-3 px-3">WPS Status</th>
                        <th className="py-3 px-3">Days</th>
                        <th className="py-3 px-3">Hours / OT</th>
                        <th className="py-3 px-3">Base</th>
                        <th className="py-3 px-3">Allowances</th>
                        <th className="py-3 px-3">Variable / OT</th>
                        <th className="py-3 px-3">Deductions</th>
                        <th className="py-3 px-3 font-extrabold text-slate-900 dark:text-white">Net (QAR)</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredPayslips.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                            No employee payslips found matching current filters.
                          </td>
                        </tr>
                      ) : (
                        filteredPayslips.map((p) => {
                          const isWpsReady = p.wps_status === 'ready';
                          const totAllowances =
                            Number(p.housing_allowance || 0) +
                            Number(p.transport_allowance || 0) +
                            Number(p.other_allowances || 0);

                          const breakdown = Array.isArray(p.adjustments_breakdown)
                            ? p.adjustments_breakdown
                            : (typeof p.adjustments_breakdown === 'string'
                                ? (function() { try { return JSON.parse(p.adjustments_breakdown || '[]'); } catch { return []; } })()
                                : []);

                          return (
                            <tr
                              key={p.id}
                              className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                            >
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {p.employee_name}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {p.employee_number || 'EMP'} • {p.department || 'General'}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  QID: {p.national_id_number || 'None'}
                                </div>
                                {breakdown.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                                      title={`${breakdown.length} approved variable adjustment(s) applied`}
                                    >
                                      <span>{breakdown.length} Adj.</span>
                                    </span>
                                  </div>
                                )}
                              </td>

                              <td className="py-3 px-3">
                                {isWpsReady ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <Check className="w-3 h-3" />
                                    <span>WPS Ready</span>
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                                    title="Missing 29-char Qatar IBAN or QID"
                                  >
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Missing QA IBAN / QID</span>
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                                {p.working_days ?? 30}
                              </td>

                              <td className="py-3 px-3 font-mono text-[11px]">
                                <div>{Number(p.verified_attendance_hours || 0).toFixed(1)} hrs</div>
                                {Number(p.overtime_hours || 0) > 0 && (
                                  <div className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    +{Number(p.overtime_hours).toFixed(1)} OT
                                  </div>
                                )}
                              </td>

                              <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                                {Number(p.base_salary || 0).toLocaleString()}
                              </td>

                              <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                                {totAllowances > 0 ? `+${totAllowances.toLocaleString()}` : '0'}
                              </td>

                              <td className="py-3 px-3 font-mono text-[11px]">
                                {Number(p.overtime_pay || 0) > 0 && (
                                  <div className="font-medium text-emerald-600 dark:text-emerald-400">
                                    +{Number(p.overtime_pay).toLocaleString()} OT
                                  </div>
                                )}
                                {Number(p.task_benefit_pay || 0) > 0 && (
                                  <div className="text-cyan-600 dark:text-cyan-400 font-semibold text-[10px]">
                                    +{Number(p.task_benefit_pay).toLocaleString()} Task
                                  </div>
                                )}
                                {Number(p.bonus_pay || 0) > 0 && (
                                  <div className="text-indigo-600 dark:text-indigo-400 font-semibold text-[10px]">
                                    +{Number(p.bonus_pay).toLocaleString()} Bonus
                                  </div>
                                )}
                                {Number(p.overtime_pay || 0) === 0 && Number(p.task_benefit_pay || 0) === 0 && Number(p.bonus_pay || 0) === 0 && (
                                  <span className="text-slate-400">0</span>
                                )}
                              </td>

                              <td className="py-3 px-3 font-mono text-[11px]">
                                {Number(p.deductions || 0) > 0 ? (
                                  <div className="font-medium text-rose-600 dark:text-rose-400">
                                    -{Number(p.deductions).toLocaleString()}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )}
                                {Number(p.loan_deduction || 0) > 0 && (
                                  <div className="text-rose-500 text-[10px]">
                                    (Loan: -{Number(p.loan_deduction).toLocaleString()})
                                  </div>
                                )}
                                {Number(p.penalty_deduction || 0) > 0 && (
                                  <div className="text-rose-500 text-[10px]">
                                    (Penalty: -{Number(p.penalty_deduction).toLocaleString()})
                                  </div>
                                )}
                                {Number(p.other_deductions || 0) > 0 && (
                                  <div className="text-rose-500 text-[10px]">
                                    (Recovery: -{Number(p.other_deductions).toLocaleString()})
                                  </div>
                                )}
                              </td>

                              <td className="py-3 px-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                                {Number(p.net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>

                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Edit button (draft only) */}
                                  {isDraft && (
                                    <button
                                      type="button"
                                      onClick={() => openEditPayslip(p)}
                                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                      title="Adjust payslip components"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                    </button>
                                  )}

                                  {/* Print single payslip */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPrintSinglePayslip(p);
                                      setIsPrintModalOpen(true);
                                    }}
                                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    title="View & Print Official Payslip"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-blue-500" />
                                  </button>
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
            </>
          )}
        </div>
      </div>

      {/* 4. MODAL: Generate Monthly Payroll Batch */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Generate Monthly Payroll Batch
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateBatch} className="space-y-4 text-xs">
              <p className="text-slate-500 dark:text-slate-400">
                The engine will query all Active employees, pull salary lines from active contracts, compute verified attendance hours from biometric logs, and create ready-to-audit payslips.
              </p>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Salary Month (YYYY-MM) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="2026-10"
                  pattern="^\d{4}-(0[1-9]|1[0-2])$"
                  value={generateYearMonth}
                  onChange={(e) => setGenerateYearMonth(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Example: 2026-10 (October 2026)
                </span>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Batch Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="October 2026 Shift Reconciliation & WPS Payroll"
                  value={generateTitle}
                  onChange={(e) => setGenerateTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGenerate}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingGenerate && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Generate Batch</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: Edit Payslip (Draft only) */}
      {editingPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Adjust Employee Payslip
                </h3>
                <p className="text-xs text-slate-400">
                  {editingPayslip.employee_name} ({editingPayslip.employee_number}) • {editingPayslip.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayslip(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePayslip} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Working Days
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={editFormData.working_days}
                    onChange={(e) => setEditFormData({ ...editFormData, working_days: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Overtime Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={editFormData.overtime_hours}
                    onChange={(e) => setEditFormData({ ...editFormData, overtime_hours: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Overtime Pay (QAR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormData.overtime_pay}
                    onChange={(e) => setEditFormData({ ...editFormData, overtime_pay: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Other Allowances (QAR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormData.other_allowances}
                    onChange={(e) => setEditFormData({ ...editFormData, other_allowances: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Deductions (QAR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormData.deductions}
                    onChange={(e) => setEditFormData({ ...editFormData, deductions: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Calculated Net (Preview)
                  </label>
                  <div className="w-full px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 font-mono font-bold">
                    {(
                      Number(editingPayslip.base_salary || 0) +
                      Number(editingPayslip.housing_allowance || 0) +
                      Number(editingPayslip.transport_allowance || 0) +
                      (parseFloat(editFormData.other_allowances) || 0) +
                      (parseFloat(editFormData.overtime_pay) || 0) -
                      (parseFloat(editFormData.deductions) || 0)
                    ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    QAR
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Audit Notes / Comments
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes explaining manual adjustment..."
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPayslip(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPayslip}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingPayslip && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Adjustments</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: Official Qatar Payslip Printable View */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header controls (hidden on print) */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {printSinglePayslip ? `Payslip: ${printSinglePayslip.employee_name}` : `All Payslips (${filteredPayslips.length} employees)`}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="space-y-8 print:space-y-12">
              {(printSinglePayslip ? [printSinglePayslip] : filteredPayslips).map((p) => {
                const breakdown = Array.isArray(p.adjustments_breakdown)
                  ? p.adjustments_breakdown
                  : (typeof p.adjustments_breakdown === 'string'
                      ? (function() { try { return JSON.parse(p.adjustments_breakdown || '[]'); } catch { return []; } })()
                      : []);
                const earningAdjustments = breakdown.filter((item) => item.type !== 'deduction');
                const deductionAdjustments = breakdown.filter((item) => item.type === 'deduction');

                const totAllowances =
                  Number(p.housing_allowance || 0) +
                  Number(p.transport_allowance || 0) +
                  Number(p.other_allowances || 0);
                const grossSalary =
                  Number(p.base_salary || 0) +
                  totAllowances +
                  Number(p.overtime_pay || 0) +
                  Number(p.task_benefit_pay || 0) +
                  Number(p.bonus_pay || 0);

                const statutoryDeductions = Math.max(
                  0,
                  Number(p.deductions || 0) -
                    (Number(p.loan_deduction || 0) +
                      Number(p.penalty_deduction || 0) +
                      Number(p.other_deductions || 0))
                );

                return (
                  <div
                    key={p.id}
                    className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 print:border-black print:text-black space-y-5 print:p-8"
                  >
                    {/* Header: Company & Ministry */}
                    <div className="flex items-start justify-between border-b pb-4 border-slate-200 dark:border-slate-800 print:border-black">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400 print:text-black">
                          State of Qatar • Ministry of Labour & WPS Compliant
                        </span>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white print:text-black">
                          OFFICIAL SALARY DISBURSEMENT SLIP / قسيمة الراتب
                        </h4>
                        <p className="text-xs text-slate-500 print:text-black">
                          Payroll Month: <strong>{selectedBatch?.salary_year_month}</strong> • Batch: {selectedBatch?.batch_code}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-3 py-1 rounded-md text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 print:border print:border-black">
                          {p.wps_status === 'ready' ? 'WPS VERIFIED' : 'PENDING WPS'}
                        </span>
                      </div>
                    </div>

                    {/* Employee Profile Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl print:bg-gray-100 print:border">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase print:text-gray-600">Employee Name:</span>
                        <span className="font-bold text-slate-900 dark:text-white print:text-black">{p.employee_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase print:text-gray-600">Employee ID:</span>
                        <span className="font-mono font-bold">{p.employee_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase print:text-gray-600">Qatar QID / Visa:</span>
                        <span className="font-mono font-bold">{p.national_id_number || p.visa_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase print:text-gray-600">Department / Title:</span>
                        <span className="font-semibold">{p.department} - {p.job_title}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase print:text-gray-600">Disbursement IBAN:</span>
                        <span className="font-mono font-semibold">{p.bank_iban || 'No IBAN on file'} ({p.bank_name || 'Bank'})</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase print:text-gray-600">Working Days:</span>
                        <span className="font-mono font-bold">{p.working_days || 30} days</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase print:text-gray-600">Verified Attendance:</span>
                        <span className="font-mono font-bold">{Number(p.verified_attendance_hours || 0).toFixed(1)} hrs</span>
                      </div>
                    </div>

                    {/* Earnings & Deductions Breakdown Tables */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      {/* Earnings */}
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="font-bold text-slate-900 dark:text-white print:text-black border-b pb-1 text-[11px] uppercase tracking-wider text-emerald-600">
                          Earnings Breakdown (QAR)
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500 print:text-black">Basic Salary</span>
                          <span className="font-mono font-semibold">{Number(p.base_salary || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500 print:text-black">Housing Allowance</span>
                          <span className="font-mono font-semibold">{Number(p.housing_allowance || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500 print:text-black">Transport Allowance</span>
                          <span className="font-mono font-semibold">{Number(p.transport_allowance || 0).toFixed(2)}</span>
                        </div>
                        {Number(p.other_allowances || 0) > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-500 print:text-black">Other Fixed Allowances</span>
                            <span className="font-mono font-semibold">{Number(p.other_allowances || 0).toFixed(2)}</span>
                          </div>
                        )}
                        {Number(p.overtime_pay || 0) > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-500 print:text-black">Overtime Pay ({Number(p.overtime_hours || 0).toFixed(1)} hrs)</span>
                            <span className="font-mono font-semibold text-emerald-600">+{Number(p.overtime_pay || 0).toFixed(2)}</span>
                          </div>
                        )}
                        {Number(p.task_benefit_pay || 0) > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-500 print:text-black">Task / Trip Benefit Pay</span>
                            <span className="font-mono font-semibold text-cyan-600">+{Number(p.task_benefit_pay || 0).toFixed(2)}</span>
                          </div>
                        )}
                        {Number(p.bonus_pay || 0) > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-500 print:text-black">Bonuses & Incentives</span>
                            <span className="font-mono font-semibold text-indigo-600">+{Number(p.bonus_pay || 0).toFixed(2)}</span>
                          </div>
                        )}

                        {/* Itemized Variable Adjustments (Earnings) */}
                        {earningAdjustments.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 print:border-gray-200">
                            <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-600 block mb-1">
                              Approved Variable Earnings Detail:
                            </span>
                            <div className="space-y-1">
                              {earningAdjustments.map((adj, i) => (
                                <div key={i} className="flex justify-between text-[11px] bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded print:bg-transparent">
                                  <div>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 print:text-black">{adj.title}</span>
                                    {adj.quantity && adj.unit_rate ? (
                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1 print:text-gray-600">
                                        ({adj.quantity} {adj.unit_label || 'units'} @ {Number(adj.unit_rate).toFixed(2)} QAR)
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="font-mono font-semibold text-emerald-600">+{Number(adj.amount || 0).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between pt-2 border-t font-bold text-slate-900 dark:text-white print:text-black">
                          <span>Gross Earnings</span>
                          <span className="font-mono">{grossSalary.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Deductions */}
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="font-bold text-slate-900 dark:text-white print:text-black border-b pb-1 text-[11px] uppercase tracking-wider text-rose-600">
                          Deductions (QAR)
                        </div>
                        {statutoryDeductions > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-500 print:text-black">Contract / Statutory / Unpaid</span>
                            <span className="font-mono font-semibold text-rose-600">
                              -{statutoryDeductions.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {Number(p.loan_deduction || 0) > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-500 print:text-black">Company Loan Installment</span>
                            <span className="font-mono font-semibold text-rose-600">
                              -{Number(p.loan_deduction || 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                        {Number(p.penalty_deduction || 0) > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-500 print:text-black">Disciplinary Penalties / Fines</span>
                            <span className="font-mono font-semibold text-rose-600">
                              -{Number(p.penalty_deduction || 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                        {Number(p.other_deductions || 0) > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-500 print:text-black">Other Recoveries / Deductions</span>
                            <span className="font-mono font-semibold text-rose-600">
                              -{Number(p.other_deductions || 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                        {Number(p.deductions || 0) === 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-slate-400 print:text-black">No deductions applied</span>
                            <span className="font-mono font-semibold text-slate-400">0.00</span>
                          </div>
                        )}

                        {/* Itemized Variable Adjustments (Deductions) */}
                        {deductionAdjustments.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 print:border-gray-200">
                            <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-600 block mb-1">
                              Approved Variable Deductions Detail:
                            </span>
                            <div className="space-y-1">
                              {deductionAdjustments.map((adj, i) => (
                                <div key={i} className="flex justify-between text-[11px] bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded print:bg-transparent">
                                  <div>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 print:text-black">{adj.title}</span>
                                    {adj.notes ? (
                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1 print:text-gray-600">
                                        ({adj.notes})
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="font-mono font-semibold text-rose-600">-{Number(adj.amount || 0).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between pt-2 border-t font-bold text-slate-900 dark:text-white print:text-black">
                          <span>Total Deductions</span>
                          <span className="font-mono text-rose-600">-{Number(p.deductions || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Net Payable Banner */}
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-center justify-between text-amber-900 dark:text-amber-200 print:border-black print:text-black">
                      <div>
                        <span className="text-xs uppercase font-bold tracking-wider">Net Amount Payable (صافي الراتب):</span>
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 print:text-black">Disbursed via Qatar WPS Central Bank Protocol</p>
                      </div>
                      <div className="text-xl font-bold font-mono">
                        {Number(p.net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR
                      </div>
                    </div>

                    {/* Signatures */}
                    <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 dark:border-slate-800 print:border-black text-xs text-slate-500 print:text-black">
                      <div className="space-y-6">
                        <span>Prepared & Authorized By (Finance / HR Officer):</span>
                        <div className="border-b border-dashed border-slate-400 w-48 pt-4" />
                        <span className="text-[10px] text-slate-400">Stamp & Official Signature</span>
                      </div>
                      <div className="space-y-6 text-right">
                        <span>Employee Acknowledgment:</span>
                        <div className="border-b border-dashed border-slate-400 w-48 ml-auto pt-4" />
                        <span className="text-[10px] text-slate-400">Signature / Date Received</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: Lock Batch Confirmation */}
      {isLockConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-purple-600">
              <Lock className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Seal & Lock Payroll Batch?
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Locking this batch marks it as finalized and converts matching verified attendance records for {selectedBatch?.salary_year_month} to <strong>synced</strong>. Once locked, payslip amounts cannot be modified.
            </p>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsLockConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLockBatch}
                disabled={isLocking}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isLocking && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm & Lock Batch</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: Delete Batch Confirmation */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete Draft Batch?
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Are you sure you want to delete batch <strong>{selectedBatch?.batch_code}</strong>? All generated employee payslips in this batch will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteBatch}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Batch</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
