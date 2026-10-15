import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { useAccessControl } from '../../context/AccessControlContext';
import { useAuth } from '../../context/AuthContext';

export function ContractListView({ onSelectEmployee }) {
  const { hasPermission } = useAccessControl();
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
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [detailContract, setDetailContract] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (detailContract) setDetailContract(null);
        if (isPrintModalOpen) setIsPrintModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailContract, isPrintModalOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, deptFilter, expiringSoonFilter]);

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

  // Fetch contracts from global endpoint
  const fetchContracts = async () => {
    setIsLoading(true);
    try {
      const headers = {};
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
      const res = await fetch('/api/v1/contracts', { headers });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      } else {
        console.error('Failed to load contracts:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching global contracts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  // Filtered contracts
  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      // 1. Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
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
  }, [contracts, searchTerm, statusFilter, deptFilter, expiringSoonFilter]);

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

  // Pagination calculations
  const totalCount = filteredContracts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const pagedContracts = useMemo(() => {
    return filteredContracts.slice(startIndex, endIndex);
  }, [filteredContracts, startIndex, endIndex]);

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

  return (
    <div className="space-y-2">
      {/* 1. Slim 44px Control Bar */}
      <div className="h-11 min-h-[44px] flex items-center justify-between gap-2 px-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg shadow-2xs">
        {/* Left: Action Buttons & Title */}
        <div className="flex items-center gap-1.5 shrink-0">
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reference, employee, job..."
              className="w-full h-7 text-[12px] font-normal pl-8 pr-6 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

        {/* Right: Summary toggle & Odoo Pager */}
        <div className="flex items-center gap-1.5 shrink-0">
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
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11.5px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              <tr className="h-8">
                <th className="py-1 px-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={pagedContracts.length > 0 && pagedContracts.every((c) => selectedIds.has(c.id))}
                    onChange={handleSelectAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-1 px-2.5">Reference</th>
                <th className="py-1 px-2.5">Employee</th>
                <th className="py-1 px-2.5">Job Title</th>
                <th className="py-1 px-2.5">Department</th>
                <th className="py-1 px-2.5">Start Date</th>
                <th className="py-1 px-2.5">End Date</th>
                <th className="py-1 px-2.5">Status</th>
                <th className="py-1 px-2.5 text-right">Wage / Package</th>
                <th className="py-1 px-2.5 text-right w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[12.5px] text-slate-800 dark:text-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[12px] text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-blue-500" />
                    <span>Loading contracts...</span>
                  </td>
                </tr>
              ) : pagedContracts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[12px] text-slate-400">
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
                      className={`h-8 odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/40 dark:even:bg-slate-800/40 hover:bg-blue-50/40 dark:hover:bg-slate-800/70 border-b border-slate-200/60 dark:border-slate-800/60 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''
                      }`}
                      onClick={() => setDetailContract(c)}
                    >
                      <td
                        className="py-1 px-2.5 align-middle"
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
                      <td className="py-1 px-2.5 align-middle">
                        <span
                          className="font-mono font-semibold text-[12px] text-blue-600 dark:text-blue-400 truncate max-w-[140px] block"
                          title={`${c.contract_reference} - ${c.title || ''}`}
                        >
                          {c.contract_reference}
                        </span>
                      </td>

                      {/* Employee Name */}
                      <td className="py-1 px-2.5 align-middle">
                        <span
                          className="font-medium text-slate-900 dark:text-white truncate max-w-[170px] block"
                          title={`${c.employee_name || 'Staff Member'} (${c.employee_number || 'EMP-XXXX'})`}
                        >
                          {c.employee_name || 'Staff Member'}
                        </span>
                      </td>

                      {/* Job Title */}
                      <td className="py-1 px-2.5 align-middle">
                        <span
                          className="text-slate-600 dark:text-slate-300 truncate max-w-[130px] block"
                          title={c.job_title || ''}
                        >
                          {c.job_title || '—'}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="py-1 px-2.5 align-middle">
                        <span
                          className="text-slate-500 dark:text-slate-400 truncate max-w-[110px] block"
                          title={c.department || ''}
                        >
                          {c.department || '—'}
                        </span>
                      </td>

                      {/* Start Date */}
                      <td className="py-1 px-2.5 align-middle font-mono text-[12px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {c.start_date || '—'}
                      </td>

                      {/* End Date */}
                      <td className="py-1 px-2.5 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-[12px]">
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
                      <td className="py-1 px-2.5 align-middle whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center h-5 text-[10.5px] font-semibold px-1.5 rounded uppercase ${
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
                      <td className="py-1 px-2.5 align-middle text-right font-mono text-[12px] whitespace-nowrap">
                        {canReadSalary ? (
                          <span
                            className="font-semibold text-slate-900 dark:text-white"
                            title={c.net_package_total ? `Net: ${Number(c.net_package_total).toLocaleString()} ${c.currency}` : ''}
                          >
                            {Number(c.wage_base || 0).toLocaleString()} {c.currency}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">••••••</span>
                        )}
                      </td>

                      {/* Action */}
                      <td
                        className="py-1 px-2.5 align-middle text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setDetailContract(c)}
                          className="h-6 px-2 rounded text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition cursor-pointer"
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

      {/* 5. Detail Drawer / Modal */}
      {detailContract && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn"
          onClick={() => setDetailContract(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {detailContract.contract_reference}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${detailContract.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                    >
                      {detailContract.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{detailContract.title}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailContract(null)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition cursor-pointer"
                title="Close (Esc)"
              >
                <span className="text-[10px] font-mono text-slate-400">(Esc)</span>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Employee Banner */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Contract Party</span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {detailContract.employee_name} ({detailContract.employee_number})
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                  {detailContract.job_title} • {detailContract.department}
                </span>
              </div>
              {onSelectEmployee && (
                <button
                  type="button"
                  onClick={() => {
                    const empId = detailContract.employee_id;
                    setDetailContract(null);
                    onSelectEmployee(empId);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Profile</span>
                </button>
              )}
            </div>

            {/* Contract Key Milestones */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Start Date</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                  {detailContract.start_date}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">End Date</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                  {detailContract.end_date || 'Open-Ended'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Notice Period</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                  {detailContract.notice_period_days || 30} days
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Trial Period</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                  {detailContract.trial_period_days || 90} days
                </span>
              </div>
            </div>

            {/* Compensation & Salary Gating */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  Compensation & Wages Protection
                </h4>
                {!canReadSalary && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Lock className="w-2.5 h-2.5" />
                    Restricted Confidential Field
                  </span>
                )}
              </div>

              {canReadSalary ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Monthly Base Wage</span>
                    <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                      {Number(detailContract.wage_base || 0).toLocaleString()} {detailContract.currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Total Net Package</span>
                    <span className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                      {Number(detailContract.net_package_total || detailContract.wage_base || 0).toLocaleString()} {detailContract.currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Working Hours</span>
                    <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                      {detailContract.working_hours_per_week || 40} hrs/week
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-amber-500" />
                  <span>
                    Base wage, dynamic benefit lines, and net package total are protected under security group <code className="font-mono font-bold">hr.salary_read</code>.
                  </span>
                </div>
              )}
            </div>

            {detailContract.terms_notes && (
              <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/20 p-3 rounded-xl border border-slate-100 dark:border-slate-800/60 font-mono">
                <span className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Terms Notes:</span>
                {detailContract.terms_notes}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDetailContract(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
