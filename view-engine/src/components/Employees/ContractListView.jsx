import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  Filter,
  Download,
  Printer,
  AlertTriangle,
  Clock,
  Building2,
  Briefcase,
  CheckCircle2,
  Calendar,
  Lock,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Layers,
  X,
  FileCheck2,
  Plus,
  Save,
  RotateCcw,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useAccessControl } from '../../context/AccessControlContext';
import { useAuth } from '../../context/AuthContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useSystemLookups } from '../../services/lookupService';
import { RecordChatter } from '../common/RecordChatter';
import { getUrlParam, syncViewUrlParams, notifyRecordChatterUpdated } from '../../utils/urlState';

export function ContractListView({ onSelectEmployee }) {
  const { hasPermission } = useAccessControl();
  const { currencies } = useSystemLookups();
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const canReadContracts = hasPermission('hr.contracts_read');
  const canReadSalary = hasPermission('hr.salary_read');
  const canManageContracts = hasPermission('hr.contracts_manage');
  const canManageSalary = hasPermission('hr.salary_manage');

  const [contracts, setContracts] = useState([]);
  const [totalContracts, setTotalContracts] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Form View State
  const [viewMode, setViewMode] = useState(() => (getUrlParam('view') === 'form' ? 'form' : 'list')); // 'list' | 'form'
  const [pendingContractId, setPendingContractId] = useState(() =>
    getUrlParam('view') === 'form' ? (getUrlParam('id') || null) : null
  );
  const [formContract, setFormContract] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contractError, setContractError] = useState('');
  const [contractSuccess, setContractSuccess] = useState('');
  const [employeesList, setEmployeesList] = useState([]);

  // Contract Amendment Modal State
  const [isAmendModalOpen, setIsAmendModalOpen] = useState(false);
  const [isAmending, setIsAmending] = useState(false);
  const [amendError, setAmendError] = useState('');
  const [amendFormData, setAmendFormData] = useState({
    wage_base: 15000,
    currency: 'QAR',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    isOpenEnded: false,
    amendment_reason: '',
  });

  const [contractFormData, setContractFormData] = useState({
    employee_id: '',
    employee_name: '',
    employee_number: '',
    job_title: '',
    department: '',
    title: 'Expat Fixed-Term Employment Agreement',
    contract_reference: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    isOpenEnded: false,
    status: 'active',
    wage_base: 15000,
    currency: 'QAR',
    notice_period_days: 30,
    trial_period_days: 90,
    working_hours_per_week: 40,
    terms_notes: 'Standard employment agreement.',
  });

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showSummary, setShowSummary] = useState(false);

  // Unsaved changes beforeunload listener
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isPrintModalOpen) setIsPrintModalOpen(false);
        if (isAmendModalOpen) setIsAmendModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPrintModalOpen, isAmendModalOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, deptFilter, expiringSoonFilter, pageSize]);

  // Helper for expiry countdown
  const getDaysRemaining = (expiryDateStr) => {
    if (!expiryDateStr) return null;
    try {
      const now = new Date();
      const exp = new Date(expiryDateStr);
      const diffTime = exp.getTime() - now.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  // Fetch contracts from global endpoint with debounced search and limit/offset pagination
  const fetchContracts = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers = {};
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (deptFilter !== 'ALL') params.append('department', deptFilter);
      if (expiringSoonFilter) params.append('expiring_days', '30');
      params.append('limit', String(pageSize));
      params.append('offset', String((currentPage - 1) * pageSize));

      const res = await fetch(`/api/v1/contracts?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
        setTotalContracts(data.total !== undefined ? data.total : (data.contracts || []).length);
      } else {
        console.error('Failed to load contracts:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching global contracts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken, debouncedSearch, statusFilter, deptFilter, expiringSoonFilter, pageSize, currentPage]);

  const fetchEmployees = async () => {
    try {
      const headers = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
      const res = await fetch('/api/v1/employees', { headers });
      if (res.ok) {
        const data = await res.json();
        setEmployeesList(Array.isArray(data) ? data : (data.employees || []));
      }
    } catch (err) {
      console.warn('Failed to load employees for contracts:', err);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Notify operational form state & sync URL params (view, id) for browser reload persistence
  useEffect(() => {
    const isForm = viewMode === 'form';
    window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: isForm } }));
    const effectiveId = isForm
      ? (pendingContractId || formContract?.id || 'new')
      : null;
    syncViewUrlParams({
      view: isForm ? 'form' : null,
      id: effectiveId ? String(effectiveId) : null,
    });
    return () => {
      if (isForm) {
        window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: false } }));
      }
    };
  }, [viewMode, formContract, pendingContractId]);

  // Hydrate pendingContractId from URL on browser reload
  useEffect(() => {
    if (!pendingContractId) return;
    if (pendingContractId === 'new') {
      if (employeesList.length > 0) {
        setPendingContractId(null);
        handleOpenCreateContract();
      }
      return;
    }

    const inList = contracts.find((c) => String(c.id) === String(pendingContractId));
    if (inList) {
      setPendingContractId(null);
      handleOpenDetailContract(inList);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const headers = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
        const res = await fetch(`/api/v1/contracts/${pendingContractId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setPendingContractId(null);
            handleOpenDetailContract(data);
          }
        } else if (!cancelled && res.status === 404) {
          setPendingContractId(null);
          setViewMode('list');
        }
      } catch (e) {
        console.warn('Failed to hydrate contract on reload:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingContractId, contracts, employeesList, sessionToken]);

  const handleOpenCreateContract = () => {
    setPendingContractId(null);
    setSelectedIds(new Set());
    setFormContract(null);
    const currentYear = new Date().getFullYear();
    const firstEmp = employeesList[0];
    setContractFormData({
      employee_id: firstEmp?.id || '',
      employee_name: firstEmp?.full_name || '',
      employee_number: firstEmp?.employee_number || '',
      job_title: firstEmp?.job_title || 'Operations Specialist',
      department: firstEmp?.department || 'Operations',
      title: 'Fixed-Term Employment Agreement',
      contract_reference: `CNT-${currentYear}-${(firstEmp?.employee_number || 'EMP').replace('EMP-', '')}-1`,
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      isOpenEnded: false,
      status: 'active',
      wage_base: firstEmp?.base_salary || 15000,
      currency: firstEmp?.currency || 'QAR',
      notice_period_days: 30,
      trial_period_days: 90,
      working_hours_per_week: 40,
      terms_notes: 'Standard employment agreement.',
    });
    setIsDirty(false);
    setContractError('');
    setContractSuccess('');
    setViewMode('form');
  };

  const handleOpenDetailContract = (contract) => {
    setPendingContractId(null);
    setFormContract(contract);
    setContractFormData({
      employee_id: contract.employee_id || '',
      employee_name: contract.employee_name || '',
      employee_number: contract.employee_number || '',
      job_title: contract.job_title || '',
      department: contract.department || '',
      title: contract.title || 'Employment Agreement',
      contract_reference: contract.contract_reference || '',
      start_date: contract.start_date || '',
      end_date: contract.end_date || '',
      isOpenEnded: !contract.end_date,
      status: contract.status || 'active',
      wage_base: contract.wage_base ?? 15000,
      currency: contract.currency || 'QAR',
      notice_period_days: contract.notice_period_days ?? 30,
      trial_period_days: contract.trial_period_days ?? 90,
      working_hours_per_week: contract.working_hours_per_week ?? 40,
      terms_notes: contract.terms_notes || '',
    });
    setIsDirty(false);
    setContractError('');
    setContractSuccess('');
    setViewMode('form');
  };

  const handleContractFieldChange = (field, value) => {
    setContractFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setContractError('');
  };

  const handleSelectEmployeeChange = (empId) => {
    const emp = employeesList.find((e) => e.id === empId);
    if (emp) {
      const currentYear = new Date().getFullYear();
      setContractFormData((prev) => ({
        ...prev,
        employee_id: emp.id,
        employee_name: emp.full_name,
        employee_number: emp.employee_number,
        job_title: emp.job_title || prev.job_title,
        department: emp.department || prev.department,
        wage_base: emp.base_salary || prev.wage_base,
        contract_reference: `CNT-${currentYear}-${(emp.employee_number || 'EMP').replace('EMP-', '')}-1`,
      }));
      setIsDirty(true);
    }
  };

  const handleSaveContract = async () => {
    setContractError('');
    setContractSuccess('');
    setIsSaving(true);

    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

    try {
      if (!formContract) {
        // Create Mode
        if (!contractFormData.employee_id) {
          setContractError('Please select an employee party for this contract.');
          setIsSaving(false);
          return;
        }

        const payload = {
          title: contractFormData.title || 'Standard Employment Agreement',
          contract_reference: contractFormData.contract_reference || null,
          start_date: contractFormData.start_date,
          end_date: contractFormData.isOpenEnded ? null : (contractFormData.end_date || null),
          wage_base: Number(contractFormData.wage_base) || 0,
          currency: contractFormData.currency || 'QAR',
          status: contractFormData.status || 'active',
          notice_period_days: Number(contractFormData.notice_period_days) || 30,
          trial_period_days: Number(contractFormData.trial_period_days) || 90,
          working_hours_per_week: Number(contractFormData.working_hours_per_week) || 40,
          terms_notes: contractFormData.terms_notes || '',
        };

        const res = await fetch(`/api/v1/employees/${contractFormData.employee_id}/contracts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Failed to create contract');
        }

        const created = await res.json();
        setFormContract(created);
        setIsDirty(false);
        notifyRecordChatterUpdated(created.id, 'contracts');
        setContractSuccess('Contract created.');
        await fetchContracts();
      } else {
        // Edit Mode
        const payload = {
          title: contractFormData.title,
          contract_reference: contractFormData.contract_reference,
          start_date: contractFormData.start_date,
          end_date: contractFormData.isOpenEnded ? null : (contractFormData.end_date || null),
          wage_base: canManageSalary ? (Number(contractFormData.wage_base) || 0) : undefined,
          currency: contractFormData.currency,
          status: contractFormData.status,
          notice_period_days: Number(contractFormData.notice_period_days) || 30,
          trial_period_days: Number(contractFormData.trial_period_days) || 90,
          working_hours_per_week: Number(contractFormData.working_hours_per_week) || 40,
          terms_notes: contractFormData.terms_notes,
        };

        const res = await fetch(`/api/v1/contracts/${formContract.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Failed to update contract');
        }

        const updated = await res.json();
        setFormContract(updated);
        setIsDirty(false);
        notifyRecordChatterUpdated(updated.id || formContract.id, 'contracts');
        setContractSuccess('Contract changes saved.');
        await fetchContracts();
      }
    } catch (err) {
      console.error('Failed to save contract:', err);
      setContractError(err.message || 'Failed to save contract');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardContract = () => {
    if (formContract) {
      handleOpenDetailContract(formContract);
    } else {
      handleOpenCreateContract();
    }
    setIsDirty(false);
  };

  const handleOpenAmendModal = () => {
    if (!formContract) return;
    setAmendError('');
    setAmendFormData({
      wage_base: formContract.wage_base ?? contractFormData.wage_base ?? 15000,
      currency: formContract.currency || contractFormData.currency || 'QAR',
      start_date: new Date().toISOString().split('T')[0],
      end_date: formContract.end_date || '',
      isOpenEnded: !formContract.end_date,
      amendment_reason: '',
    });
    setIsAmendModalOpen(true);
  };

  const handleAmendSubmit = async (e) => {
    e?.preventDefault();
    if (!formContract) return;

    const cleanReason = (amendFormData.amendment_reason || '').trim();
    if (!cleanReason) {
      setAmendError('Please enter a reason for this contract amendment.');
      return;
    }

    setIsAmending(true);
    setAmendError('');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const payload = {
        amendment_reason: cleanReason,
        wage_base: canManageSalary ? Number(amendFormData.wage_base) : undefined,
        currency: amendFormData.currency,
        start_date: amendFormData.start_date,
        end_date: amendFormData.isOpenEnded ? null : (amendFormData.end_date || null),
      };

      const res = await fetch(`/api/v1/contracts/${formContract.id}/amend`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to amend contract');
      }

      const created = await res.json();
      setIsAmendModalOpen(false);
      notifyRecordChatterUpdated(created.id, 'contracts');
      setContractSuccess(
        `Contract amended as Revision ${created.revision_number || '2'} (${created.contract_reference}).`
      );
      setContractError('');
      handleOpenDetailContract(created);
      await fetchContracts();
    } catch (err) {
      console.error('Failed to amend contract:', err);
      setAmendError(err.message || 'Failed to amend contract');
    } finally {
      setIsAmending(false);
    }
  };

  const handleBackToList = () => {
    if (isDirty && !window.confirm("You have unsaved changes. Discard and return to list?")) return;
    setPendingContractId(null);
    setViewMode('list');
    setFormContract(null);
    setIsDirty(false);
    setContractError('');
    setContractSuccess('');
  };

  // Filtered contracts using debounced search
  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      // 1. Search filter
      if (debouncedSearch.trim()) {
        const term = debouncedSearch.toLowerCase();
        const matchesRef = (c.contract_reference || '').toLowerCase().includes(term);
        const matchesEmp = (c.employee_name || '').toLowerCase().includes(term);
        const matchesJob = (c.job_title || '').toLowerCase().includes(term);
        const matchesEmpNum = (c.employee_number || '').toLowerCase().includes(term);
        if (!matchesRef && !matchesEmp && !matchesJob && !matchesEmpNum) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter !== 'ALL') {
        if ((c.status || '').toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Department filter
      if (deptFilter !== 'ALL') {
        if ((c.department || '').toLowerCase() !== deptFilter.toLowerCase()) {
          return false;
        }
      }

      // 4. Expiring soon (<30 days)
      if (expiringSoonFilter) {
        const days = getDaysRemaining(c.end_date);
        if (days === null || days > 30 || days < 0) {
          return false;
        }
      }

      return true;
    });
  }, [contracts, debouncedSearch, statusFilter, deptFilter, expiringSoonFilter]);

  // Statistics counters
  const stats = useMemo(() => {
    let total = contracts.length;
    let active = 0;
    let drafts = 0;
    let expiringSoon = 0;

    contracts.forEach((c) => {
      if (c.status === 'active') active++;
      if (c.status === 'draft') drafts++;
      const days = getDaysRemaining(c.end_date);
      if (days !== null && days >= 0 && days <= 30) expiringSoon++;
    });

    return { total, active, drafts, expiringSoon };
  }, [contracts]);

  // Pagination calculations bound to limit, offset, and total
  const totalCount = totalContracts || filteredContracts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const showingStart = totalCount === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(startIndex + filteredContracts.length, totalCount);
  const pagedContracts = useMemo(() => {
    if (totalContracts > 0 && contracts.length <= pageSize) {
      return filteredContracts;
    }
    return filteredContracts.slice(startIndex, endIndex);
  }, [filteredContracts, totalContracts, contracts.length, pageSize, startIndex, endIndex]);

  // Selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(pagedContracts.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Batch Action 1: Export CSV
  const handleExportCSV = () => {
    const targets = selectedIds.size > 0
      ? filteredContracts.filter((c) => selectedIds.has(c.id))
      : filteredContracts;

    if (targets.length === 0) return;

    const headers = [
      'Contract Reference',
      'Employee Name',
      'Employee Code',
      'Job Title',
      'Department',
      'Start Date',
      'End Date',
      'Status',
      'Notice Days',
      'Trial Days',
      'Hours/Week',
      'Monthly Base Wage',
      'Net Package Total',
      'Currency',
    ];

    const rows = targets.map((c) => [
      `"${c.contract_reference || ''}"`,
      `"${c.employee_name || ''}"`,
      `"${c.employee_number || ''}"`,
      `"${c.job_title || ''}"`,
      `"${c.department || ''}"`,
      `"${c.start_date || ''}"`,
      `"${c.end_date || 'Open-Ended'}"`,
      `"${c.status || ''}"`,
      c.notice_period_days || 30,
      c.trial_period_days || 90,
      c.working_hours_per_week || 40,
      canReadSalary ? (c.wage_base ?? 'N/A') : '"•••••• (RESTRICTED)"',
      canReadSalary ? (c.net_package_total ?? 'N/A') : '"•••••• (RESTRICTED)"',
      `"${c.currency || 'QAR'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Enterprise_Contracts_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Batch Action 2: Print Contract Slips
  const handlePrintSlips = () => {
    setIsPrintModalOpen(true);
  };

  const executePrint = () => {
    window.print();
  };

  const printTargets = selectedIds.size > 0
    ? filteredContracts.filter((c) => selectedIds.has(c.id))
    : filteredContracts;

  if (viewMode === 'form') {
    if (pendingContractId && pendingContractId !== 'new' && !formContract) {
      return (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading contract...</span>
        </div>
      );
    }
    const daysRemaining = contractFormData.end_date ? getDaysRemaining(contractFormData.end_date) : null;
    const isCreateMode = !formContract;
    const isActiveOrApproved = Boolean(formContract && (formContract.status === 'active' || formContract.status === 'approved'));

    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-16 animate-fadeIn">
        {/* Top Control Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Breadcrumbs & Back */}
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleBackToList}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Contracts</span>
            </button>

            <span className="text-slate-400">/</span>
            <span className="font-semibold text-sm text-slate-900 dark:text-white">
              {contractFormData.contract_reference || contractFormData.title || (isCreateMode ? 'New Contract' : 'Contract Details')}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                isCreateMode
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200'
                  : contractFormData.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isCreateMode ? 'New' : (contractFormData.status || 'Active')}
            </span>
            {isDirty && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved changes" />
            )}
          </div>

          {/* Right: Save, Amend, Discard, and Back */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {isActiveOrApproved ? (
              canManageContracts && (
                <button
                  type="button"
                  onClick={handleOpenAmendModal}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+ Amend Contract</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={handleSaveContract}
                disabled={!isDirty || isSaving || !contractFormData.employee_id}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer ${
                  isDirty && !isSaving && contractFormData.employee_id
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            )}

            {!isActiveOrApproved && (
              <button
                type="button"
                onClick={handleDiscardContract}
                disabled={!isDirty}
                className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs transition cursor-pointer ${
                  isDirty
                    ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    : 'border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleBackToList}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <span>Back to List</span>
            </button>
          </div>
        </div>

        {/* Active Contract Status Banner */}
        {isActiveOrApproved && (
          <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-emerald-950 dark:text-emerald-100">
                  Active Contract — Terms Locked
                </h4>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                  Salary, dates, and reference are locked while active. Use Amend Contract to create a new revision.
                </p>
              </div>
            </div>
            {canManageContracts && (
              <button
                type="button"
                onClick={handleOpenAmendModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium shadow-xs transition cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <Sparkles className="w-4 h-4" />
                <span>Amend Contract</span>
              </button>
            )}
          </div>
        )}

        {/* Alerts */}
        {contractError && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{contractError}</span>
            </div>
            <button
              type="button"
              onClick={() => setContractError('')}
              className="text-rose-700 dark:text-rose-400 hover:text-rose-900 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {contractSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{contractSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setContractSuccess('')}
              className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 12-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Form (8 Cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Card 1: Core Terms & Employee Party */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <Briefcase className="w-4 h-4" />
                </div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Contract Terms & Employee Party
                </h3>
              </div>

              {/* Employee Party Selection / Display */}
              {isCreateMode ? (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Employee Party <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={contractFormData.employee_id}
                    onChange={(e) => handleSelectEmployeeChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer text-xs"
                    required
                  >
                    <option value="" disabled>-- Select Employee --</option>
                    {employeesList.map((emp) => (
                      <option key={emp.id} value={emp.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                        {emp.full_name} ({emp.employee_number || 'EMP'}) — {emp.job_title || 'Operations Specialist'} [{emp.department || 'Operations'}]
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Selecting an employee auto-populates title, department, wage benchmark, and recommended reference.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      {(contractFormData.employee_name || 'E').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {contractFormData.employee_name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {contractFormData.employee_number} • {contractFormData.job_title} ({contractFormData.department})
                      </p>
                    </div>
                  </div>
                  {onSelectEmployee && contractFormData.employee_id && (
                    <button
                      type="button"
                      onClick={() => onSelectEmployee({ id: contractFormData.employee_id, full_name: contractFormData.employee_name })}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 transition cursor-pointer flex items-center gap-1"
                    >
                      <span>View Employee</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Title & Reference */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Contract Title / Type <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={contractFormData.title}
                    onChange={(e) => handleContractFieldChange('title', e.target.value)}
                    placeholder="e.g. Expat Fixed-Term Employment Agreement"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Contract Reference
                  </label>
                  <input
                    type="text"
                    value={contractFormData.contract_reference}
                    onChange={(e) => handleContractFieldChange('contract_reference', e.target.value)}
                    disabled={isActiveOrApproved}
                    placeholder="e.g. CNT-2026-004-1"
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs transition-colors ${
                      isActiveOrApproved
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-500 cursor-not-allowed'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                    }`}
                  />
                  {isActiveOrApproved && (
                    <span className="text-[10px] text-slate-400 block">Immutable sealed reference</span>
                  )}
                </div>
              </div>

              {/* Dates & Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={contractFormData.start_date}
                    disabled={isActiveOrApproved}
                    onChange={(e) => handleContractFieldChange('start_date', e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs transition-colors ${
                      isActiveOrApproved
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-500 cursor-not-allowed'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                    }`}
                    required
                  />
                  {isActiveOrApproved && (
                    <span className="text-[10px] text-slate-400 block">Locked (Amend to change)</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={contractFormData.end_date}
                    disabled={isActiveOrApproved || contractFormData.isOpenEnded}
                    onChange={(e) => handleContractFieldChange('end_date', e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs transition-colors ${
                      isActiveOrApproved || contractFormData.isOpenEnded
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                    }`}
                  />
                  <label className={`inline-flex items-center gap-1.5 text-[11px] mt-1 ${
                    isActiveOrApproved ? 'text-slate-400 cursor-not-allowed' : 'text-slate-600 dark:text-slate-400 cursor-pointer'
                  }`}>
                    <input
                      type="checkbox"
                      checked={contractFormData.isOpenEnded}
                      disabled={isActiveOrApproved}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        handleContractFieldChange('isOpenEnded', checked);
                        if (checked) handleContractFieldChange('end_date', '');
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <span>Open-ended (indefinite term)</span>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Status
                  </label>
                  <select
                    value={contractFormData.status}
                    disabled={isActiveOrApproved}
                    onChange={(e) => handleContractFieldChange('status', e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs transition-colors ${
                      isActiveOrApproved
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-500 cursor-not-allowed'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer'
                    }`}
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="expired">Expired</option>
                    <option value="terminated">Terminated</option>
                  </select>
                  {isActiveOrApproved && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">Sealed Active State</span>
                  )}
                </div>
              </div>

              {/* Working Parameters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Working Hours / Week
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={contractFormData.working_hours_per_week}
                    onChange={(e) => handleContractFieldChange('working_hours_per_week', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-xs"
                  />
                  <span className="text-[10px] text-slate-400 block">Standard: 40–48h / week</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Notice Period (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={contractFormData.notice_period_days}
                    onChange={(e) => handleContractFieldChange('notice_period_days', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-xs"
                  />
                  <span className="text-[10px] text-slate-400 block">Standard: 30 days</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Trial Period (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={contractFormData.trial_period_days}
                    onChange={(e) => handleContractFieldChange('trial_period_days', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-xs"
                  />
                  <span className="text-[10px] text-slate-400 block">Max 180 days (6 months)</span>
                </div>
              </div>
            </div>

            {/* Card 2: Compensation & Legal Clauses */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                </div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Compensation Structure & Custom Clauses
                </h3>
              </div>

              {/* Monthly Base Wage */}
              {canReadSalary ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                      Monthly Base Wage <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="100"
                      value={contractFormData.wage_base}
                      onChange={(e) => handleContractFieldChange('wage_base', e.target.value)}
                      disabled={isActiveOrApproved || !canManageSalary}
                      className={`w-full px-3 py-2 rounded-xl border text-xs transition-colors font-mono font-bold ${
                        isActiveOrApproved || !canManageSalary
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                      }`}
                    />
                    {isActiveOrApproved ? (
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>Sealed: To modify compensation, use <strong>+ Amend Contract</strong>.</span>
                      </p>
                    ) : !canManageSalary && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                        Read-only: Modifying base wage requires <code>hr.salary_manage</code> permission.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                      Settlement Currency
                    </label>
                    <select
                      value={contractFormData.currency}
                      onChange={(e) => handleContractFieldChange('currency', e.target.value)}
                      disabled={isActiveOrApproved || !canManageSalary}
                      className={`w-full px-3 py-2 rounded-xl border text-xs transition-colors ${
                        isActiveOrApproved || !canManageSalary
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer'
                      }`}
                    >
                      {currencies.map((curr) => (
                        <option key={curr.code} value={curr.code}>
                          {curr.code} — {curr.name} ({curr.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-amber-500" />
                  <span>
                    Monthly compensation structure is masked under strict Salary Governance. Viewing or modifying salary requires the <code>hr.salary_read</code> permission.
                  </span>
                </div>
              )}

              {/* Special Terms & Notes */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                  Special Terms &amp; Notes
                </label>
                <textarea
                  rows={4}
                  value={contractFormData.terms_notes}
                  onChange={(e) => handleContractFieldChange('terms_notes', e.target.value)}
                  placeholder="Enter contract notes, probation terms, or additional agreements..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Right Rail (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Timeline & Milestones */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
                <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  Timeline & Status Overview
                </h4>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Effective Start:</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {contractFormData.start_date || 'N/A'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Contract Term:</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {contractFormData.isOpenEnded ? 'Open-Ended' : (contractFormData.end_date || 'N/A')}
                  </span>
                </div>

                {!contractFormData.isOpenEnded && contractFormData.end_date && daysRemaining !== null && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Remaining Duration:</span>
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                        daysRemaining < 0
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : daysRemaining <= 60
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      {daysRemaining < 0 ? `Expired (${Math.abs(daysRemaining)}d ago)` : `${daysRemaining} days left`}
                    </span>
                  </div>
                )}

                {formContract?.created_at && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500">Record Created:</span>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {new Date(formContract.created_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Instant Activity & Audit Log */}
        {formContract?.id && (
          <RecordChatter
            entityType="contracts"
            entityId={formContract.id}
            entityName={formContract.contract_reference}
          />
        )}

        {/* Contract Amendment Modal */}
        {isAmendModalOpen && formContract && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Issue Contract Amendment Revision
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Creates a new contract revision while preserving the prior contract history
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAmendModalOpen(false)}
                  disabled={isAmending}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleAmendSubmit} className="p-6 overflow-y-auto space-y-5">
                {amendError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{amendError}</span>
                  </div>
                )}

                {/* Section a: Original Contract Info (Read-only reference and previous wage) */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Original Contract Reference</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                      {formContract.contract_reference}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Employee Party</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formContract.employee_name || contractFormData.employee_name} ({formContract.employee_number || contractFormData.employee_number})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Previous Base Wage</span>
                    {canReadSalary ? (
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formContract.wage_base !== null && formContract.wage_base !== undefined
                          ? `${Number(formContract.wage_base).toLocaleString()} ${formContract.currency}`
                          : '—'}
                      </span>
                    ) : (
                      <span className="font-mono text-slate-400">•••••• (Restricted)</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Previous Duration</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {formContract.start_date || 'N/A'} to {formContract.end_date || 'Open-Ended'}
                    </span>
                  </div>
                </div>

                {/* Section b: New Wage Base and Currency inputs */}
                {canReadSalary && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                        New Wage Base <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="100"
                        value={amendFormData.wage_base}
                        onChange={(e) => setAmendFormData((prev) => ({ ...prev, wage_base: e.target.value }))}
                        disabled={!canManageSalary}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                        Currency <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={amendFormData.currency}
                        onChange={(e) => setAmendFormData((prev) => ({ ...prev, currency: e.target.value }))}
                        disabled={!canManageSalary}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      >
                        {currencies.map((curr) => (
                          <option key={curr.code} value={curr.code}>
                            {curr.code} — {curr.name} ({curr.symbol})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Section c: New Effective Start Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                      Effective Start Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={amendFormData.start_date}
                      onChange={(e) => setAmendFormData((prev) => ({ ...prev, start_date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                      New End Date
                    </label>
                    <input
                      type="date"
                      value={amendFormData.end_date}
                      disabled={amendFormData.isOpenEnded}
                      onChange={(e) => setAmendFormData((prev) => ({ ...prev, end_date: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-xl border text-xs ${
                        amendFormData.isOpenEnded
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                      }`}
                    />
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={amendFormData.isOpenEnded}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAmendFormData((prev) => ({
                            ...prev,
                            isOpenEnded: checked,
                            end_date: checked ? '' : prev.end_date,
                          }));
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Open-ended (indefinite term)</span>
                    </label>
                  </div>
                </div>

                {/* Section d: Mandatory text area */}
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Amendment Reason <span className="text-rose-500">*</span></span>
                    <span className="text-xs text-slate-400 font-normal">Required</span>
                  </label>
                  <textarea
                    rows={3}
                    value={amendFormData.amendment_reason}
                    onChange={(e) => setAmendFormData((prev) => ({ ...prev, amendment_reason: e.target.value }))}
                    placeholder="e.g. Annual merit compensation increase following Q4 appraisal and board approval..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    required
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    This justification is permanently inscribed into the cryptographically chained audit log and links the new revision to the prior contract.
                  </p>
                </div>

                {/* Modal Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsAmendModalOpen(false)}
                    disabled={isAmending}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAmending || !amendFormData.amendment_reason.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    {isAmending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Issuing Amendment...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Issue Amendment Revision</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 1. Slim 44px Control Bar */}
      <div className="h-11 min-h-[44px] flex items-center justify-between gap-2 px-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg shadow-2xs">
        {/* Left: Action Buttons & Title */}
        <div className="flex items-center gap-1.5 shrink-0">
          {canManageContracts && (
            <button
              type="button"
              onClick={handleOpenCreateContract}
              className="h-7 px-2.5 text-[11px] font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-xs transition cursor-pointer"
              title="Create New Contract"
            >
              <Plus className="w-3 h-3" />
              <span>+ New Contract</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            className="h-7 px-2 text-[11px] font-medium rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 transition cursor-pointer"
            title="Export CSV"
          >
            <Download className="w-3 h-3 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrintSlips}
            className="h-7 px-2 text-[11px] font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-xs transition cursor-pointer"
            title="Print Slips"
          >
            <Printer className="w-3 h-3" />
            <span>Print Slips</span>
          </button>

          <button
            type="button"
            onClick={fetchContracts}
            disabled={isLoading}
            className="h-7 w-7 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
            title="Refresh contracts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <span className="font-bold text-[13px] text-slate-900 dark:text-white shrink-0 ml-1">
            Contracts
          </span>

          {!canReadSalary && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Lock className="w-2.5 h-2.5" />
              Redacted
            </span>
          )}

          {selectedIds.size > 0 && (
            <span className="text-[10.5px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
              {selectedIds.size} sel
            </span>
          )}
        </div>

        {/* Center: Slim Search & Inline Filter Dropdowns */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xl mx-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search reference, employee, job..."
              className="w-full h-7 text-[12px] font-normal pl-8 pr-6 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7 text-[11.5px] font-medium px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shrink-0"
          >
            <option value="ALL">Status: All</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="expired">Expired</option>
          </select>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-7 text-[11.5px] font-medium px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shrink-0 max-w-[130px] truncate"
          >
            <option value="ALL">Dept: All</option>
            <option value="Operations">Operations</option>
            <option value="Human Resources">HR</option>
            <option value="Engineering">Engineering</option>
            <option value="Finance & Accounts">Finance</option>
            <option value="General Administration">Admin</option>
            <option value="Sales & Business Dev">Sales</option>
          </select>

          <button
            type="button"
            onClick={() => setExpiringSoonFilter(!expiringSoonFilter)}
            className={`h-7 inline-flex items-center gap-1 px-2 text-[11px] font-medium rounded-md border transition cursor-pointer shrink-0 ${
              expiringSoonFilter
                ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
            }`}
            title="Filter contracts expiring in <30 days"
          >
            <AlertTriangle className="w-3 h-3" />
            <span>&lt;30d</span>
          </button>
        </div>

        {/* Right: Summary toggle & Clean Pagination Controls (Page X of Y, Showing A–B of Total, Prev/Next, and 25/50/100 selector) */}
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setShowSummary((v) => !v)}
            className={`h-7 px-2 text-[11px] font-medium rounded-md border transition cursor-pointer flex items-center gap-1 ${
              showSummary
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900'
                : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900'
            }`}
          >
            {showSummary ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span className="hidden xl:inline">Summary</span>
          </button>

          {/* Page Size Selector (25 / 50 / 100) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400 hidden sm:inline">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-7 text-xs font-medium px-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              title="Page size (limit)"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Showing A–B of Total */}
          <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 hidden md:inline">
            Showing {showingStart}–{showingEnd} of {totalCount}
          </span>

          <span className="text-slate-300 dark:text-slate-600 hidden md:inline">|</span>

          {/* Page X of Y */}
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            Page {totalCount === 0 ? 0 : currentPage} of {totalPages}
          </span>

          {/* Previous / Next buttons */}
          <div className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xs">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
            </button>
            <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-700" />
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible 28px Metric Summary Ribbon */}
      {showSummary && (
        <div className="h-7 min-h-[28px] px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md flex items-center justify-between text-[11.5px] text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <span>Total: <strong className="font-mono text-slate-900 dark:text-white">{stats.total}</strong></span>
            <span>Active: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{stats.active}</strong></span>
            <span>Expiring (&lt;30d): <strong className="font-mono text-amber-600 dark:text-amber-400">{stats.expiringSoon}</strong></span>
            <span>Drafts: <strong className="font-mono text-blue-600 dark:text-blue-400">{stats.drafts}</strong></span>
          </div>
          <span className="text-[10.5px] text-slate-400">Page {currentPage} of {totalPages}</span>
        </div>
      )}

      {/* 2. Contracts Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="max-h-[calc(100vh-140px)] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              <tr className="min-h-[38px] h-[38px]">
                <th className="py-2 px-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={pagedContracts.length > 0 && pagedContracts.every((c) => selectedIds.has(c.id))}
                    onChange={handleSelectAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-2 px-2.5">Reference</th>
                <th className="py-2 px-2.5">Employee</th>
                <th className="py-2 px-2.5">Job Title</th>
                <th className="py-2 px-2.5">Department</th>
                <th className="py-2 px-2.5">Start Date</th>
                <th className="py-2 px-2.5">End Date</th>
                <th className="py-2 px-2.5">Status</th>
                <th className="py-2 px-2.5 text-right">Wage / Package</th>
                <th className="py-2 px-2.5 text-right w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[13.5px] font-medium text-slate-800 dark:text-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-xs text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-blue-500" />
                    <span>Loading contracts...</span>
                  </td>
                </tr>
              ) : pagedContracts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-xs text-slate-400">
                    <FileText className="w-6 h-6 mx-auto mb-1 opacity-40" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">No contracts found</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Try adjusting your filters or search keywords.</p>
                  </td>
                </tr>
              ) : (
                pagedContracts.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  const daysLeft = getDaysRemaining(c.end_date);
                  const isExpiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;
                  const isExpired = daysLeft !== null && daysLeft < 0;

                  return (
                    <tr
                      key={c.id}
                      className={`min-h-[38px] h-[38px] odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/40 dark:even:bg-slate-800/40 hover:bg-blue-50/40 dark:hover:bg-slate-800/70 border-b border-slate-200/60 dark:border-slate-800/60 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''
                      }`}
                      onClick={() => handleOpenDetailContract(c)}
                    >
                      <td
                        className="py-2 px-2.5 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(c.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Reference */}
                      <td className="py-2 px-2.5 align-middle">
                        <span
                          className="font-mono font-semibold text-[13px] text-blue-600 dark:text-blue-400 truncate max-w-[140px] block"
                          title={`${c.contract_reference} - ${c.title || ''}`}
                        >
                          {c.contract_reference}
                        </span>
                      </td>

                      {/* Employee Name */}
                      <td className="py-2 px-2.5 align-middle">
                        <span
                          className="font-medium text-[13.5px] text-slate-900 dark:text-white truncate max-w-[170px] block"
                          title={`${c.employee_name || 'Staff Member'} (${c.employee_number || 'EMP-XXXX'})`}
                        >
                          {c.employee_name || 'Staff Member'}
                        </span>
                      </td>

                      {/* Job Title */}
                      <td className="py-2 px-2.5 align-middle">
                        <span
                          className="text-slate-600 dark:text-slate-300 truncate max-w-[130px] block text-[13.5px]"
                          title={c.job_title || ''}
                        >
                          {c.job_title || '—'}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="py-2 px-2.5 align-middle">
                        <span
                          className="text-slate-500 dark:text-slate-400 truncate max-w-[110px] block text-[13.5px]"
                          title={c.department || ''}
                        >
                          {c.department || '—'}
                        </span>
                      </td>

                      {/* Start Date */}
                      <td className="py-2 px-2.5 align-middle font-mono text-[13px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {c.start_date || '—'}
                      </td>

                      {/* End Date */}
                      <td className="py-2 px-2.5 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-[13px]">
                          <span className="text-slate-900 dark:text-slate-200">
                            {c.end_date ? c.end_date : 'Open-Ended'}
                          </span>
                          {isExpiringSoon && (
                            <span className="h-4 px-1 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/30 flex items-center gap-0.5">
                              {daysLeft}d
                            </span>
                          )}
                          {isExpired && (
                            <span className="h-4 px-1 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/30">
                              Expired
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2 px-2.5 align-middle whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center h-5 text-[11px] font-semibold px-1.5 rounded uppercase ${
                            c.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : c.status === 'draft'
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300/50 dark:border-slate-700'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>

                      {/* Wage / Net Package */}
                      <td className="py-2 px-2.5 align-middle text-right font-mono text-[13.5px] whitespace-nowrap">
                        {canReadSalary ? (
                          <span
                            className="font-semibold text-slate-900 dark:text-white"
                            title={c.net_package_total ? `Net: ${Number(c.net_package_total).toLocaleString()} ${c.currency}` : ''}
                          >
                            {Number(c.wage_base || 0).toLocaleString()} {c.currency}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">••••••</span>
                        )}
                      </td>

                      {/* Action */}
                      <td
                        className="py-2 px-2.5 align-middle text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenDetailContract(c)}
                          className="h-6 px-2.5 rounded text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition cursor-pointer"
                        >
                          View
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

      {/* 6. Printable Contract Slips Modal */}
      {isPrintModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setIsPrintModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Contract Slips Summary ({printTargets.length} records)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={executePrint}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Print Now
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="flex items-center gap-1 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <span className="text-[10px] font-mono text-slate-400">(Esc)</span>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="space-y-6 print:space-y-8">
              {printTargets.map((c) => (
                <div
                  key={c.id}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 print:border-black print:text-black space-y-3"
                >
                  <div className="flex items-center justify-between border-b pb-2">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white print:text-black">
                        {c.contract_reference} • {c.title}
                      </h4>
                      <p className="text-xs text-slate-500 print:text-black">
                        Employee: {c.employee_name} ({c.employee_number}) — {c.job_title} ({c.department})
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold uppercase px-2 py-0.5 rounded border">
                      {c.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block print:text-gray-600">Start Date:</span>
                      <span className="font-mono font-bold">{c.start_date}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block print:text-gray-600">End Date:</span>
                      <span className="font-mono font-bold">{c.end_date || 'Open-Ended'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block print:text-gray-600">Notice Period:</span>
                      <span className="font-mono font-bold">{c.notice_period_days || 30} days</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block print:text-gray-600">Base Wage:</span>
                      <span className="font-mono font-bold">
                        {canReadSalary ? `${Number(c.wage_base || 0).toLocaleString()} ${c.currency}` : '•••••• (RESTRICTED)'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
