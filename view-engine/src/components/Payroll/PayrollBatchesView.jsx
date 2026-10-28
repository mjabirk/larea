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
  ChevronLeft,
  Eye,
  EyeOff,
  X,
  Building2,
  Briefcase,
  Clock,
  FileText,
  Check,
  AlertTriangle,
  Layers,
  Sparkles,
  ChevronDown,
  Mail,
  MessageCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenancy } from '../../context/TenancyContext';
import { useAccessControl } from '../../context/AccessControlContext';
import { SendEmailModal } from '../common/SendEmailModal';
import { SendMessageModal } from '../common/SendMessageModal';
import { PrintDocumentModal } from './PrintDocumentModal';

function formatMonthName(ym) {
  if (!ym) return 'N/A';
  const parts = ym.split('-');
  if (parts.length < 2) return ym;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateDisplay(dStr) {
  if (!dStr) return '—';
  try {
    const d = new Date(dStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dStr;
  }
}

export function PayrollBatchesView() {
  const auth = useAuth();
  const tenancy = useTenancy();
  const tenantEpoch = tenancy?.tenantEpoch || 0;
  const isAllBranchesSelected = tenancy?.isAllBranchesSelected ?? true;
  const selectedBranchIds = tenancy?.selectedBranchIds || ['all'];
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

  // Master-Detail View Mode: 'registry' (default list) | 'detail' (deep-dive payslips)
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'registry';
    const p = new URLSearchParams(window.location.search);
    return p.get('view') === 'detail' && p.get('id') ? 'detail' : 'registry';
  });
  const [selectedYearTab, setSelectedYearTab] = useState('ALL');
  const [registryStatusFilter, setRegistryStatusFilter] = useState('ALL');
  const [registrySearch, setRegistrySearch] = useState('');
  const [batchToDelete, setBatchToDelete] = useState(null);

  // State
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search);
    return p.get('view') === 'detail' ? (p.get('id') || null) : null;
  });

  useEffect(() => {
    const isDetail = viewMode === 'detail' && Boolean(selectedBatchId);
    window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: isDetail } }));
    try {
      const p = new URLSearchParams(window.location.search);
      if (isDetail) {
        p.set('view', 'detail');
        p.set('id', String(selectedBatchId));
      } else {
        p.delete('view');
        p.delete('id');
      }
      const qs = p.toString();
      window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    } catch (e) {}
    return () => {
      if (isDetail) window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: false } }));
    };
  }, [viewMode, selectedBatchId]);
  const [currentBatchData, setCurrentBatchData] = useState(null); // { batch, payslips, ... }
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSyncingAdjustments, setIsSyncingAdjustments] = useState(false);
  const [actionMessage, setActionMessage] = useState(null); // { type: 'success' | 'error', text: string }

  // Filter & Search inside payslips table
  const [searchTerm, setSearchTerm] = useState('');
  const [wpsFilter, setWpsFilter] = useState('ALL'); // 'ALL' | 'ready' | 'missing'
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [showDetailSummary, setShowDetailSummary] = useState(false);

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
  const [isPayslipDirty, setIsPayslipDirty] = useState(false);

  // Print Payslips Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printSinglePayslip, setPrintSinglePayslip] = useState(null); // null = all in batch

  // Lock confirmation modal
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const [isLocking, setIsLocking] = useState(false);

  // Delete confirmation modal
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Send by Email modal
  const [emailPayslipModalOpen, setEmailPayslipModalOpen] = useState(false);
  const [emailPayslipTarget, setEmailPayslipTarget] = useState(null);

  // Send by WhatsApp / SMS modal
  const [messagePayslipModalOpen, setMessagePayslipModalOpen] = useState(false);
  const [messagePayslipTarget, setMessagePayslipTarget] = useState(null);

  // Global Escape Key Listener for Modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isDeleteConfirmOpen) {
          setIsDeleteConfirmOpen(false);
          setBatchToDelete(null);
        } else if (isLockConfirmOpen) {
          setIsLockConfirmOpen(false);
        } else if (isPrintModalOpen) {
          setIsPrintModalOpen(false);
        } else if (editingPayslip) {
          setEditingPayslip(null);
        } else if (isGenerateModalOpen) {
          setIsGenerateModalOpen(false);
        } else if (emailPayslipModalOpen) {
          setEmailPayslipModalOpen(false);
          setEmailPayslipTarget(null);
        } else if (messagePayslipModalOpen) {
          setMessagePayslipModalOpen(false);
          setMessagePayslipTarget(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleteConfirmOpen, isLockConfirmOpen, isPrintModalOpen, editingPayslip, isGenerateModalOpen, emailPayslipModalOpen, messagePayslipModalOpen]);

  const openEmailPayslip = (p) => {
    setEmailPayslipTarget(p);
    setEmailPayslipModalOpen(true);
  };

  const openMessagePayslip = (p) => {
    setMessagePayslipTarget(p);
    setMessagePayslipModalOpen(true);
  };

  const getAuthHeaders = useCallback(() => {
    const headers = tenancy?.getAuthHeaders ? tenancy.getAuthHeaders(sessionToken) : {};
    headers['Content-Type'] = 'application/json';
    if (sessionToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return headers;
  }, [sessionToken, tenancy?.getAuthHeaders]);

  // Fetch batches list
  const fetchBatches = useCallback(async (preferredBatchId = null) => {
    setIsLoadingBatches(true);
    try {
      const res = await fetch('/api/v1/payroll/batches', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const batchList = data.batches || [];
        setBatches(batchList);
        if (preferredBatchId) {
          setSelectedBatchId(preferredBatchId);
        } else if (selectedBatchId && !batchList.some((b) => b.id === selectedBatchId)) {
          setSelectedBatchId(null);
          setCurrentBatchData(null);
          setViewMode('registry');
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
    fetchBatches();
  }, [fetchBatches, tenantEpoch]);

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

  // Dynamic Financial Years derived from batches
  const availableYears = useMemo(() => {
    const yearSet = new Set(['2026', '2025']);
    batches.forEach((b) => {
      if (b.salary_year_month) {
        const y = b.salary_year_month.split('-')[0];
        if (y) yearSet.add(y);
      }
    });
    return ['ALL', ...Array.from(yearSet).sort().reverse()];
  }, [batches]);

  // Filtered batches for Registry View
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      // Year filter
      if (selectedYearTab !== 'ALL') {
        const y = (b.salary_year_month || '').split('-')[0];
        if (y !== selectedYearTab) return false;
      }
      // Status filter
      if (registryStatusFilter !== 'ALL' && b.status !== registryStatusFilter) {
        return false;
      }
      // Search
      if (registrySearch.trim()) {
        const q = registrySearch.toLowerCase();
        const code = (b.batch_code || '').toLowerCase();
        const title = (b.title || '').toLowerCase();
        const ym = (b.salary_year_month || '').toLowerCase();
        const monthName = formatMonthName(b.salary_year_month).toLowerCase();
        if (!code.includes(q) && !title.includes(q) && !ym.includes(q) && !monthName.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [batches, selectedYearTab, registryStatusFilter, registrySearch]);

  const [registryPage, setRegistryPage] = useState(1);
  const registryPageSize = 80;

  useEffect(() => {
    setRegistryPage(1);
  }, [selectedYearTab, registryStatusFilter, registrySearch]);

  const totalRegistryRecords = filteredBatches.length;
  const totalRegistryPages = Math.max(1, Math.ceil(totalRegistryRecords / registryPageSize));
  const startRegistryIndex = (registryPage - 1) * registryPageSize;
  const endRegistryIndex = Math.min(startRegistryIndex + registryPageSize, totalRegistryRecords);
  const pagedBatches = useMemo(() => {
    return filteredBatches.slice(startRegistryIndex, endRegistryIndex);
  }, [filteredBatches, startRegistryIndex, endRegistryIndex]);

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
          branch_ids: isAllBranchesSelected ? ['all'] : selectedBranchIds,
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
        await fetchBatches(data.batch?.id);
        if (data.batch?.id) {
          setSelectedBatchId(data.batch.id);
          setViewMode('detail');
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
    const targetId = batchToDelete?.id || selectedBatchId;
    if (!targetId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/payroll/batches/${targetId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: data.message || 'Draft batch deleted.' });
        setIsDeleteConfirmOpen(false);
        setBatchToDelete(null);
        if (selectedBatchId === targetId) {
          setSelectedBatchId(null);
          setCurrentBatchData(null);
          setViewMode('registry');
        }
        fetchBatches();
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
  const handleExportSIF = async (targetBatchId = selectedBatchId, targetBatchCode = null) => {
    const bId = targetBatchId || selectedBatchId;
    if (!bId) return;
    try {
      const headers = {};
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch(`/api/v1/payroll/batches/${bId}/export-sif`, {
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to export SIF.' }));
        throw new Error(err.detail || 'Export failed.');
      }

      const disposition = res.headers.get('Content-Disposition');
      let filename = `SIF_${targetBatchCode || currentBatchData?.batch?.batch_code || 'payroll'}.sif`;
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
        text: `Bank salary file "${filename}" downloaded.`,
      });
      fetchBatches();
      if (selectedBatchId === bId) {
        fetchBatchDetails(bId);
      }
    } catch (err) {
      console.error('Export SIF error:', err);
      setActionMessage({ type: 'error', text: err.message || 'Error exporting bank file.' });
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
    setIsPayslipDirty(false);
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
        setIsPayslipDirty(false);
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
      {/* Action Notification Alert (Global across views) */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-xs font-medium animate-fadeIn ${
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

      {viewMode === 'registry' ? (
        /* BATCH REGISTRY VIEW (Default list view) */
        <div className="space-y-2 animate-fadeIn">
          {/* 1. Slim 44px Control Bar */}
          <div className="h-11 min-h-[44px] flex items-center justify-between gap-2 px-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg shadow-2xs">
            {/* Left: Action Button, Title & Refresh */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  setGenerateYearMonth(ym);
                  setGenerateTitle(`Payroll Reconciliation - ${ym}`);
                  setIsGenerateModalOpen(true);
                }}
                className="h-9 px-3.5 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                title="Generate Monthly Batch"
              >
                <Plus className="w-4 h-4" />
                <span>Generate Batch</span>
              </button>

              <button
                type="button"
                onClick={() => fetchBatches()}
                disabled={isLoadingBatches}
                className="h-9 w-9 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
                title="Refresh Batches"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingBatches ? 'animate-spin' : ''}`} />
              </button>

              <span className="font-semibold text-base text-slate-900 dark:text-white shrink-0 ml-1">
                Payroll Batches
              </span>
            </div>

            {/* Center: Search & Inline Dropdowns */}
            <div className="flex items-center gap-2 flex-1 max-w-xl mx-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={registrySearch}
                  onChange={(e) => setRegistrySearch(e.target.value)}
                  placeholder="Search batch code, title, month..."
                  className="w-full h-9 text-sm font-normal pl-9 pr-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
                {registrySearch && (
                  <button
                    type="button"
                    onClick={() => setRegistrySearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Financial Year Selector */}
              <select
                value={selectedYearTab}
                onChange={(e) => setSelectedYearTab(e.target.value)}
                className="h-9 text-sm font-medium px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 cursor-pointer shrink-0"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr === 'ALL' ? 'All Years' : yr}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={registryStatusFilter}
                onChange={(e) => setRegistryStatusFilter(e.target.value)}
                className="h-9 text-sm font-medium px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 cursor-pointer shrink-0"
              >
                <option value="ALL">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="locked">Locked</option>
                <option value="exported">Exported</option>
              </select>
            </div>

            {/* Right: Odoo Pager */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 h-7">
                <span className="text-[11.5px] font-mono text-slate-600 dark:text-slate-300 font-semibold tracking-tight">
                  {totalRegistryRecords === 0 ? '0-0 / 0' : `${startRegistryIndex + 1}-${endRegistryIndex} / ${totalRegistryRecords}`}
                </span>
                <button
                  type="button"
                  disabled={registryPage <= 1}
                  onClick={() => setRegistryPage((p) => Math.max(1, p - 1))}
                  className="p-0.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={registryPage >= totalRegistryPages}
                  onClick={() => setRegistryPage((p) => Math.min(totalRegistryPages, p + 1))}
                  className="p-0.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Batches Table */}
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11.5px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <tr className="h-8">
                    <th className="py-1 px-2.5">Batch Code & Title</th>
                    <th className="py-1 px-2.5">Target Month</th>
                    <th className="py-1 px-2.5">Status</th>
                    <th className="py-1 px-2.5">Employees</th>
                    <th className="py-1 px-2.5 text-right">Total Net Payout</th>
                    <th className="py-1 px-2.5">Bank Info</th>
                    <th className="py-1 px-2.5">Date Created</th>
                    <th className="py-1 px-2.5 text-right w-44">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[12.5px] text-slate-800 dark:text-slate-200">
                  {pagedBatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <FileSpreadsheet className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                          <span>No payroll batches match the selected filters.</span>
                          <button
                            type="button"
                            onClick={() => {
                              const now = new Date();
                              const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                              setGenerateYearMonth(ym);
                              setGenerateTitle(`Payroll Reconciliation - ${ym}`);
                              setIsGenerateModalOpen(true);
                            }}
                            className="mt-1 text-amber-600 dark:text-amber-400 font-semibold hover:underline cursor-pointer text-xs"
                          >
                            + Generate a new monthly batch
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedBatches.map((b) => {
                      const totalEmp = Number(b.total_employees || b.total_payslips_count || 0);
                      const readyCount = b.wps_ready_count !== undefined
                        ? Number(b.wps_ready_count)
                        : (b.status === 'exported' ? totalEmp : 0);
                      const wpsPct = totalEmp > 0 ? Math.round((readyCount / totalEmp) * 100) : 100;
                      const isDraftBatch = b.status === 'draft';

                      return (
                        <tr
                          key={b.id}
                          onClick={() => {
                            setSelectedBatchId(b.id);
                            setViewMode('detail');
                          }}
                          className="h-8 odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/40 dark:even:bg-slate-800/40 hover:bg-amber-50/30 dark:hover:bg-slate-800/70 border-b border-slate-200/60 dark:border-slate-800/60 transition-colors cursor-pointer"
                        >
                          {/* Batch Code & Title */}
                          <td className="py-1 px-2.5 align-middle">
                            <span
                              className="font-mono font-bold text-[12px] text-amber-600 dark:text-amber-400 truncate max-w-[220px] block"
                              title={`${b.batch_code} - ${b.title || 'Payroll Reconciliation'}`}
                            >
                              {b.batch_code}
                            </span>
                          </td>

                          {/* Target Month */}
                          <td className="py-1 px-2.5 align-middle font-mono text-[12px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatMonthName(b.salary_year_month)}
                          </td>

                          {/* Status badge */}
                          <td className="py-1 px-2.5 align-middle whitespace-nowrap">
                            <span
                              className={`inline-flex items-center justify-center h-5 text-[10.5px] font-semibold uppercase px-1.5 rounded border ${
                                b.status === 'locked'
                                  ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                                  : b.status === 'exported'
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>

                          {/* Employees count */}
                          <td className="py-1 px-2.5 align-middle font-mono text-[12px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {totalEmp} Staff
                          </td>

                          {/* Total Net Payout */}
                          <td className="py-1 px-2.5 align-middle text-right font-mono font-bold text-[12px] text-slate-900 dark:text-white whitespace-nowrap">
                            {Number(b.total_net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                          </td>

                          {/* WPS Compliance % */}
                          <td className="py-1 px-2.5 align-middle whitespace-nowrap">
                            <span
                              className={`inline-flex items-center justify-center h-5 text-[10.5px] font-semibold px-1.5 rounded border ${
                                wpsPct === 100 || b.status === 'exported'
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                              }`}
                            >
                              {wpsPct}% Ready
                            </span>
                          </td>

                          {/* Date Created / Sealed */}
                          <td
                            className="py-1 px-2.5 align-middle text-slate-500 dark:text-slate-400 font-mono text-[11.5px] whitespace-nowrap truncate max-w-[120px]"
                            title={`Created: ${b.created_at}${b.locked_at ? ` | Sealed: ${b.locked_at}` : ''}`}
                          >
                            {formatDateDisplay(b.created_at)}
                          </td>

                          {/* Actions */}
                          <td className="py-1 px-2.5 align-middle text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBatchId(b.id);
                                  setViewMode('detail');
                                }}
                                className="h-6 px-2 rounded text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
                              >
                                Open
                              </button>

                              <button
                                type="button"
                                onClick={() => handleExportSIF(b.id, b.batch_code)}
                                className="h-6 px-2 rounded text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                                title="Export Bank File (.SIF)"
                              >
                                Export
                              </button>

                              {isDraftBatch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchToDelete(b);
                                    setIsDeleteConfirmOpen(true);
                                  }}
                                  className="h-6 w-6 flex items-center justify-center rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                                  title="Delete Draft Batch"
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
      ) : (
        /* BATCH DETAIL / PAYSLIPS VIEW */
        <div className="space-y-6 animate-fadeIn">
          {/* Breadcrumb Header & Sub-Header Actions */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Breadcrumb Navigation */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('registry')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Return to Batch Registry"
                >
                  <span>← Back to All Batches</span>
                </button>
                <span className="text-slate-300 dark:text-slate-700 font-bold">/</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-mono">
                    {selectedBatch?.batch_code || 'Batch'}
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                    ({formatMonthName(selectedBatch?.salary_year_month)})
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              {selectedBatch && (
                <span
                  className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                    selectedBatch.status === 'locked'
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                      : selectedBatch.status === 'exported'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {selectedBatch.status}
                </span>
              )}
            </div>

            {/* Pinned Sub-Header Action Buttons */}
            <div className="flex items-center flex-wrap gap-2">
              {selectedBatch && isDraft && (
                <button
                  type="button"
                  onClick={handleSyncAdjustments}
                  disabled={isSyncingAdjustments}
                  className="flex items-center gap-1.5 h-10 px-3 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  title="Recalculate and pull approved overtime, bonuses and deductions into draft payslips"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAdjustments ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Sync Adjustments</span>
                </button>
              )}

              {selectedBatch && isDraft && (
                <button
                  type="button"
                  onClick={() => setIsLockConfirmOpen(true)}
                  className="flex items-center gap-1.5 h-10 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white shadow-2xs transition-colors cursor-pointer"
                  title="Seal batch and sync attendance hours"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Lock & Seal</span>
                </button>
              )}

              {selectedBatch && (
                <button
                  type="button"
                  onClick={() => handleExportSIF(selectedBatch.id, selectedBatch.batch_code)}
                  className="flex items-center gap-1.5 h-10 px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
                  title="Download salary bank transfer file (.SIF)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Bank File</span>
                </button>
              )}

              {selectedBatch && (
                <button
                  type="button"
                  onClick={() => {
                    setPrintSinglePayslip(null);
                    setIsPrintModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 h-10 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Print All Payslips"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-500" />
                  <span className="hidden sm:inline">Print All</span>
                </button>
              )}

              {selectedBatch && isDraft && (
                <button
                  type="button"
                  onClick={() => {
                    setBatchToDelete(selectedBatch);
                    setIsDeleteConfirmOpen(true);
                  }}
                  className="h-10 p-2.5 text-xs rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Delete Draft Batch"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDetailSummary((prev) => !prev)}
                className={`h-10 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  showDetailSummary
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                }`}
                title="Toggle Metrics Summary"
              >
                {showDetailSummary ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>Summary</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  fetchBatches();
                  if (selectedBatchId) fetchBatchDetails(selectedBatchId);
                }}
                disabled={isLoadingBatches || isLoadingDetails}
                className="h-10 p-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${(isLoadingBatches || isLoadingDetails) ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

      {/* 2. Metrics Bar: Slim Single-Line 28px by default or full grid when toggled */}
      {showDetailSummary ? (
        <div className="bg-slate-50 dark:bg-slate-900/70 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:divide-x divide-slate-200 dark:divide-slate-800 text-xs">
            <div className="px-2">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 block">Employees</span>
              <span className="text-[16px] font-bold text-slate-900 dark:text-white font-mono mt-0.5 block">
                {selectedBatch ? selectedBatch.total_employees : 0} <span className="text-[11px] font-normal text-slate-500 font-sans">active</span>
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                {kpiMetrics.readyCount} Bank Ready ({kpiMetrics.wpsPct}%)
              </span>
            </div>

            <div className="px-2 lg:pl-4">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 block">Base Salaries</span>
              <span className="text-[15px] font-bold text-slate-900 dark:text-white font-mono mt-0.5 block">
                {Number(selectedBatch?.total_base_salary || 0).toLocaleString()} QAR
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">Contract Base</span>
            </div>

            <div className="px-2 lg:pl-4">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 block">Allowances</span>
              <span className="text-[15px] font-bold text-slate-900 dark:text-white font-mono mt-0.5 block">
                +{Number(selectedBatch?.total_allowances || 0).toLocaleString()} QAR
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">Housing & Transport</span>
            </div>

            <div className="px-2 lg:pl-4">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 block">Overtime & Variable</span>
              <span className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">
                +{Number(selectedBatch?.total_overtime_pay || 0).toLocaleString()} QAR
              </span>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 block mt-0.5">Attn & Tasks</span>
            </div>

            <div className="px-2 lg:pl-4">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 block">Deductions</span>
              <span className="text-[15px] font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5 block">
                -{Number(selectedBatch?.total_deductions || 0).toLocaleString()} QAR
              </span>
              <span className="text-[11px] text-rose-600/80 dark:text-rose-400/80 block mt-0.5">Unpaid & Loans</span>
            </div>

            <div className="px-2 lg:pl-4 col-span-2 sm:col-span-1">
              <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300 block">Net Disbursement</span>
              <span className="text-[17px] font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-0.5 block">
                {Number(selectedBatch?.total_net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Period: {selectedBatch?.salary_year_month || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-7 min-h-[28px] px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-[11.5px] text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <span>Staff: <strong className="font-mono text-slate-900 dark:text-white">{selectedBatch ? selectedBatch.total_employees : 0}</strong> ({kpiMetrics.readyCount} Bank Ready)</span>
            <span>Base: <strong className="font-mono text-slate-900 dark:text-white">{Number(selectedBatch?.total_base_salary || 0).toLocaleString()} QAR</strong></span>
            <span>Allowances: <strong className="font-mono text-slate-900 dark:text-white">+{Number(selectedBatch?.total_allowances || 0).toLocaleString()} QAR</strong></span>
            <span>OT/Var: <strong className="font-mono text-emerald-600 dark:text-emerald-400">+{Number(selectedBatch?.total_overtime_pay || 0).toLocaleString()} QAR</strong></span>
            <span>Deductions: <strong className="font-mono text-rose-600 dark:text-rose-400">-{Number(selectedBatch?.total_deductions || 0).toLocaleString()} QAR</strong></span>
            <span>Net: <strong className="font-mono text-amber-600 dark:text-amber-400">{Number(selectedBatch?.total_net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR</strong></span>
          </div>
          <span className="text-[10.5px] text-slate-400">{selectedBatch?.salary_year_month || ''}</span>
        </div>
      )}

      {/* 3. Slim Single-Line WPS Validation Warning Banner */}
      {currentBatchData && currentBatchData.wps_missing_count > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 text-xs text-amber-800 dark:text-amber-300 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-medium">
              {currentBatchData.wps_missing_count} employee{currentBatchData.wps_missing_count > 1 ? 's' : ''} missing valid Qatar IBAN or QID.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setWpsFilter((prev) => (prev === 'missing' ? 'ALL' : 'missing'))}
            className="px-2.5 py-1 rounded-lg bg-amber-200/60 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-100 font-semibold text-[11px] transition cursor-pointer shrink-0"
          >
            {wpsFilter === 'missing' ? 'Show All Employees' : 'View Missing'}
          </button>
        </div>
      )}

      {/* 4. Full-Width Employee Payslips Table */}
      {!selectedBatch ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
          Select or generate a payroll batch above to view employee payslips.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
          {/* Table Filter Toolbar */}
          <div className="h-9 min-h-[36px] px-3 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search employee, ID, department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-7 pl-8 pr-2 text-[12px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {/* Bank Info Filter */}
              <select
                value={wpsFilter}
                onChange={(e) => setWpsFilter(e.target.value)}
                className="h-7 text-[11.5px] font-medium px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="ALL">Bank: All</option>
                <option value="ready">Bank Ready</option>
                <option value="missing">Missing IBAN / ID</option>
              </select>

              {/* Department Filter */}
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-7 text-[11.5px] font-medium px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none max-w-[130px] truncate"
              >
                <option value="ALL">Dept: All</option>
                {uniqueDepts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* High-Density Table with Sticky Header */}
          <div className="max-h-[calc(100vh-140px)] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11.5px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <tr className="h-8">
                  <th className="py-1 px-2.5">Employee</th>
                  <th className="py-1 px-2.5">Bank Info</th>
                  <th className="py-1 px-2.5">Days</th>
                  <th className="py-1 px-2.5">Hours / OT</th>
                  <th className="py-1 px-2.5 text-right">Base Wage</th>
                  <th className="py-1 px-2.5 text-right">Allowances</th>
                  <th className="py-1 px-2.5 text-right">Variable / OT</th>
                  <th className="py-1 px-2.5 text-right">Deductions</th>
                  <th className="py-1 px-2.5 text-right font-bold text-slate-900 dark:text-white">Net (QAR)</th>
                  <th className="py-1 px-2.5 text-right w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[12.5px] text-slate-800 dark:text-slate-200">
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

                    const totalVar =
                      Number(p.overtime_pay || 0) +
                      Number(p.task_benefit_pay || 0) +
                      Number(p.bonus_pay || 0);

                    return (
                      <tr
                        key={p.id}
                        className="h-8 odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/40 dark:even:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 border-b border-slate-200/60 dark:border-slate-800/60 transition-colors"
                      >
                        {/* Employee Column */}
                        <td className="py-1 px-2.5 align-middle">
                          <span
                            className="font-medium text-slate-900 dark:text-white truncate max-w-[170px] block"
                            title={`${p.employee_name} (${p.employee_number || 'EMP'}) • ${p.department || 'General'} • QID: ${p.national_id_number || 'None'}${breakdown.length > 0 ? ` • ${breakdown.length} Adj.` : ''}`}
                          >
                            {p.employee_name}
                          </span>
                        </td>

                        {/* WPS Status */}
                        <td className="py-1 px-2.5 align-middle whitespace-nowrap">
                          <span
                            className={`inline-flex items-center justify-center h-5 text-[10.5px] font-semibold px-1.5 rounded border ${
                              isWpsReady
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                            }`}
                            title={isWpsReady ? 'Valid Qatar IBAN & QID' : 'Missing 29-char Qatar IBAN or QID'}
                          >
                            {isWpsReady ? 'Ready' : 'Missing'}
                          </span>
                        </td>

                        {/* Days */}
                        <td className="py-1 px-2.5 align-middle font-mono text-[12px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {p.working_days ?? 30}d
                        </td>

                        {/* Hours / OT */}
                        <td className="py-1 px-2.5 align-middle font-mono text-[12px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          <span title={Number(p.overtime_hours || 0) > 0 ? `+${Number(p.overtime_hours).toFixed(1)} OT` : ''}>
                            {Number(p.verified_attendance_hours || 0).toFixed(1)}h{Number(p.overtime_hours || 0) > 0 ? ` (+${Number(p.overtime_hours).toFixed(1)})` : ''}
                          </span>
                        </td>

                        {/* Base Wage */}
                        <td className="py-1 px-2.5 align-middle text-right font-mono text-[12px] whitespace-nowrap">
                          {Number(p.base_salary || 0).toLocaleString()}
                        </td>

                        {/* Allowances */}
                        <td className="py-1 px-2.5 align-middle text-right font-mono text-[12px] whitespace-nowrap">
                          {totAllowances > 0 ? `+${totAllowances.toLocaleString()}` : '0'}
                        </td>

                        {/* Variable / OT */}
                        <td className="py-1 px-2.5 align-middle text-right font-mono text-[12px] whitespace-nowrap">
                          {totalVar > 0 ? (
                            <span
                              className="text-emerald-600 dark:text-emerald-400 font-medium"
                              title={`OT: ${Number(p.overtime_pay || 0).toLocaleString()} | Task: ${Number(p.task_benefit_pay || 0).toLocaleString()} | Bonus: ${Number(p.bonus_pay || 0).toLocaleString()}`}
                            >
                              +{totalVar.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>

                        {/* Deductions */}
                        <td className="py-1 px-2.5 align-middle text-right font-mono text-[12px] whitespace-nowrap">
                          {Number(p.deductions || 0) > 0 ? (
                            <span
                              className="text-rose-600 dark:text-rose-400 font-medium"
                              title={`Loan: ${Number(p.loan_deduction || 0).toLocaleString()} | Penalty: ${Number(p.penalty_deduction || 0).toLocaleString()} | Other: ${Number(p.other_deductions || 0).toLocaleString()}`}
                            >
                              -{Number(p.deductions).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>

                        {/* Net (QAR) */}
                        <td className="py-1 px-2.5 align-middle text-right font-mono font-bold text-[12px] text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          {Number(p.net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR
                        </td>

                        {/* Actions */}
                        <td className="py-1 px-2.5 align-middle text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {isDraft && (
                              <button
                                type="button"
                                onClick={() => openEditPayslip(p)}
                                className="h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition cursor-pointer"
                                title="Adjust payslip components"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setPrintSinglePayslip(p);
                                setIsPrintModalOpen(true);
                              }}
                              className="h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                              title="View & Print Official Payslip"
                            >
                              <Printer className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEmailPayslip(p)}
                              className="h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                              title="Send Payslip by Email"
                            >
                              <Mail className="w-3.5 h-3.5 text-indigo-500" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openMessagePayslip(p)}
                              className="h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"
                              title="Send Payslip via WhatsApp / SMS"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
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
      )}
        </div>
      )}

      {/* 4. MODAL: Generate Monthly Payroll Batch */}
      {isGenerateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => setIsGenerateModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
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
                className="flex items-center gap-1.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                title="Close (Esc)"
                aria-label="Close dialog"
              >
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 group-hover:border-slate-300">
                  Esc
                </span>
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
                  placeholder="October 2026 Monthly Payroll"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => setEditingPayslip(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
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
                className="flex items-center gap-1.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                title="Close (Esc)"
                aria-label="Close dialog"
              >
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 group-hover:border-slate-300">
                  Esc
                </span>
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
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, working_days: e.target.value });
                      setIsPayslipDirty(true);
                    }}
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
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, overtime_hours: e.target.value });
                      setIsPayslipDirty(true);
                    }}
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
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, overtime_pay: e.target.value });
                      setIsPayslipDirty(true);
                    }}
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
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, other_allowances: e.target.value });
                      setIsPayslipDirty(true);
                    }}
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
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, deductions: e.target.value });
                      setIsPayslipDirty(true);
                    }}
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
                  onChange={(e) => {
                    setEditFormData({ ...editFormData, notes: e.target.value });
                    setIsPayslipDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPayslip(null);
                    setIsPayslipDirty(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPayslip || !isPayslipDirty}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition shadow-xs ${
                    !isPayslipDirty || isSavingPayslip
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60'
                      : 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                  }`}
                >
                  {isSavingPayslip && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Adjustments</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: Professional Vector A4 PDF Print & Export Dialog */}
      <PrintDocumentModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        batch={selectedBatch}
        payslip={printSinglePayslip}
        totalEmployees={filteredPayslips.length}
        getAuthHeaders={getAuthHeaders}
        onOpenEmail={openEmailPayslip}
        onOpenMessage={openMessagePayslip}
      />

      {/* 7. MODAL: Lock Batch Confirmation */}
      {isLockConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => setIsLockConfirmOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5 text-purple-600 dark:text-purple-400">
                <Lock className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Seal & Lock Payroll Batch?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLockConfirmOpen(false)}
                className="flex items-center gap-1.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                title="Close (Esc)"
                aria-label="Close dialog"
              >
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 group-hover:border-slate-300">
                  Esc
                </span>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Locking this batch marks it as finalized and converts matching verified attendance records for <strong>{selectedBatch?.salary_year_month}</strong> to <strong>synced</strong>. Once locked, payslip amounts cannot be modified.
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => {
            setIsDeleteConfirmOpen(false);
            setBatchToDelete(null);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <Trash2 className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Delete Draft Batch?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setBatchToDelete(null);
                }}
                className="flex items-center gap-1.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                title="Close (Esc)"
                aria-label="Close dialog"
              >
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 group-hover:border-slate-300">
                  Esc
                </span>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Are you sure you want to delete batch <strong>{(batchToDelete || selectedBatch)?.batch_code}</strong>? All generated employee payslips in this batch will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setBatchToDelete(null);
                }}
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

      {/* 8. Send Payslip by Email Modal */}
      {emailPayslipModalOpen && emailPayslipTarget && (
        <SendEmailModal
          isOpen={emailPayslipModalOpen}
          onClose={() => {
            setEmailPayslipModalOpen(false);
            setEmailPayslipTarget(null);
          }}
          recordModel="payroll.payslip"
          recordId={emailPayslipTarget.id}
          recordData={{
            ...emailPayslipTarget,
            month: selectedBatch?.salary_year_month || 'October 2026',
          }}
          defaultRecipient={emailPayslipTarget.work_email || ''}
          defaultRecipientName={emailPayslipTarget.employee_name}
          onSuccess={() => {
            setActionMessage({ type: 'success', text: `Payslip email dispatched for ${emailPayslipTarget.employee_name}.` });
          }}
        />
      )}

      {/* 9. Send Payslip by WhatsApp / SMS Modal */}
      {messagePayslipModalOpen && messagePayslipTarget && (
        <SendMessageModal
          isOpen={messagePayslipModalOpen}
          onClose={() => {
            setMessagePayslipModalOpen(false);
            setMessagePayslipTarget(null);
          }}
          recordModel="payroll.payslip"
          recordId={messagePayslipTarget.id}
          recordData={{
            ...messagePayslipTarget,
            month: selectedBatch?.salary_year_month || 'October 2026',
            salary_month: selectedBatch?.salary_year_month || 'October 2026',
            net_salary_qar: messagePayslipTarget.net_salary || 0,
            employee_name: messagePayslipTarget.employee_name,
            phone: messagePayslipTarget.mobile || messagePayslipTarget.phone || '+974 5599 8877',
          }}
          defaultChannel="whatsapp"
          onSuccess={() => {
            setActionMessage({ type: 'success', text: `Message dispatched for ${messagePayslipTarget.employee_name}.` });
          }}
        />
      )}
    </div>
  );
}
