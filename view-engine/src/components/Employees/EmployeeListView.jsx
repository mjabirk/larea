import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  AlertTriangle,
  Clock,
  Building2,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  ChevronLeft,
  X,
  Archive,
} from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { useSystemLookups } from '../../services/lookupService';

export function EmployeeListView({
  employees = [],
  isLoading = false,
  onSelectEmployee,
  onNewEmployee,
  searchTerm: externalSearchTerm,
  onSearchChange: externalOnSearchChange,
  statusFilter = 'all',
  onStatusFilterChange,
  showHeader = false,
  embeddedInControlPanel = false,
  total: externalTotal,
  page: externalPage,
  pageSize: externalPageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const [searchInput, setSearchInput] = useState(externalSearchTerm !== undefined ? externalSearchTerm : '');
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync externalSearchTerm changes from parent
  useEffect(() => {
    if (externalSearchTerm !== undefined && externalSearchTerm !== searchInput) {
      setSearchInput(externalSearchTerm);
      if (embeddedInControlPanel) {
        setCurrentPage(1);
        onPageChange?.(1);
      }
    }
  }, [externalSearchTerm, embeddedInControlPanel]);

  // Notify parent of debounced search changes and reset page
  useEffect(() => {
    if (embeddedInControlPanel) return;
    if (externalOnSearchChange && debouncedSearch !== externalSearchTerm) {
      externalOnSearchChange(debouncedSearch);
    }
    setCurrentPage(1);
    onPageChange?.(1);
  }, [debouncedSearch, embeddedInControlPanel]);

  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : debouncedSearch;
  const { countries, getCountryName, getCountryCode } = useSystemLookups();
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [nationalityFilter, setNationalityFilter] = useState('ALL');
  const [complianceFilter, setComplianceFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(externalPage || 1);
  const [pageSize, setPageSize] = useState(externalPageSize || 25);

  useEffect(() => {
    if (externalPage !== undefined) setCurrentPage(externalPage);
  }, [externalPage]);

  useEffect(() => {
    if (externalPageSize !== undefined) setPageSize(externalPageSize);
  }, [externalPageSize]);

  // Helper to calculate days remaining until expiry
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

  const getComplianceStatus = (emp) => {
    const qidDays = getDaysRemaining(emp.national_id_expiry);
    const visaDays = getDaysRemaining(emp.visa_expiry);

    const issues = [];
    if (qidDays !== null && qidDays <= 30) {
      issues.push({
        type: 'qid',
        label: qidDays < 0 ? `QID Expired (${Math.abs(qidDays)}d ago)` : `QID Expires in ${qidDays}d`,
        urgent: qidDays <= 15,
        days: qidDays,
      });
    }

    if (visaDays !== null && visaDays <= 30) {
      issues.push({
        type: 'visa',
        label: visaDays < 0 ? `Visa Expired (${Math.abs(visaDays)}d ago)` : `Visa Expires in ${visaDays}d`,
        urgent: visaDays <= 15,
        days: visaDays,
      });
    }

    return issues;
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = searchTerm.trim().toLowerCase();
    const matchSearch =
      !q ||
      (emp.full_name || '').toLowerCase().includes(q) ||
      (emp.employee_number || '').toLowerCase().includes(q) ||
      (emp.job_title || '').toLowerCase().includes(q) ||
      (emp.display_name_local || '').toLowerCase().includes(q) ||
      (emp.national_id_number || '').toLowerCase().includes(q) ||
      (emp.work_email || '').toLowerCase().includes(q) ||
      (emp.nationality || '').toLowerCase().includes(q) ||
      (getCountryName(emp.nationality) || '').toLowerCase().includes(q);

    const matchDept =
      deptFilter === 'ALL' || emp.department_id === deptFilter;

    const matchNationality =
      nationalityFilter === 'ALL' ||
      emp.nationality === nationalityFilter ||
      getCountryCode(emp.nationality) === nationalityFilter ||
      getCountryName(emp.nationality) === nationalityFilter;

    const complianceIssues = getComplianceStatus(emp);
    const matchCompliance =
      complianceFilter === 'ALL' ||
      (complianceFilter === 'EXPIRING' && complianceIssues.length > 0) ||
      (complianceFilter === 'VALID' && complianceIssues.length === 0);

    return matchSearch && matchDept && matchNationality && matchCompliance;
  });

  // Pagination calculation bound to limit, offset, and total
  const totalRecords = externalTotal !== undefined ? externalTotal : filteredEmployees.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const showingStart = totalRecords === 0 ? 0 : startIndex + 1;
  const showingEnd = endIndex;
  const pagedEmployees = externalTotal !== undefined && employees.length <= pageSize
    ? filteredEmployees
    : filteredEmployees.slice(startIndex, endIndex);

  return (
    <div className="space-y-3">
      {/* 1. Top Action Bar (When standalone showHeader is true) */}
      {showHeader && (
        <div className="min-h-[52px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onNewEmployee}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-2xs transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New Employee</span>
            </button>
            <div className="flex items-center gap-2 text-sm pl-3 border-l border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-900 dark:text-white">Employees</span>
              <span className="tabular-nums text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {totalRecords}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Status Segmented Filter Chips */}
      {!embeddedInControlPanel && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {[
            { id: 'all', label: 'All Active' },
            { id: 'active', label: 'Active' },
            { id: 'on leave', label: 'On Leave' },
            { id: 'terminated', label: 'Terminated' },
            { id: 'archived', label: 'Archived' },
          ].map((chip) => {
            const isActive = (statusFilter || 'all').toLowerCase() === chip.id.toLowerCase();
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  onStatusFilterChange?.(chip.id);
                  setCurrentPage(1);
                  onPageChange?.(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? chip.id === 'archived'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                {chip.id === 'archived' && <Archive className="w-3.5 h-3.5" />}
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 2. Filter & Pagination Strip */}
      <div className="min-h-[48px] py-1.5 bg-white dark:bg-slate-900 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
        <div className={`flex items-center gap-2 ${embeddedInControlPanel ? 'shrink-0' : 'flex-1 max-w-2xl'}`}>
          {!embeddedInControlPanel && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, code, QID, title..."
                className="w-full h-9 text-sm pl-9 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    externalOnSearchChange?.('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setCurrentPage(1);
              onPageChange?.(1);
            }}
            className="h-9 text-sm font-medium px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer shrink-0"
          >
            <option value="ALL">All Departments</option>
            <option value="Operations">Operations</option>
            <option value="Human Resources">Human Resources</option>
            <option value="Engineering">Engineering</option>
            <option value="General">General</option>
          </select>

          {/* Nationality Filter */}
          <select
            value={nationalityFilter}
            onChange={(e) => {
              setNationalityFilter(e.target.value);
              setCurrentPage(1);
              onPageChange?.(1);
            }}
            className="h-9 text-sm font-medium px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer shrink-0 max-w-[160px]"
            title="Filter by Nationality"
          >
            <option value="ALL">All Nationalities</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>

          {/* Compliance Filter */}
          <select
            value={complianceFilter}
            onChange={(e) => {
              setComplianceFilter(e.target.value);
              setCurrentPage(1);
              onPageChange?.(1);
            }}
            className="h-9 text-sm font-medium px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer shrink-0"
          >
            <option value="ALL">All Documents</option>
            <option value="EXPIRING">Expiring (&lt;30d)</option>
            <option value="VALID">Valid</option>
          </select>
        </div>

        {/* Right: Clean Pagination Controls */}
        <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400 pl-3 border-l border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 hidden sm:inline">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setPageSize(newSize);
                setCurrentPage(1);
                onPageSizeChange?.(newSize);
                onPageChange?.(1);
              }}
              className="h-8 text-xs font-medium px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              title="Rows per page"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <span className="tabular-nums text-xs text-slate-600 dark:text-slate-300 hidden md:inline">
            {showingStart}–{showingEnd} of {totalRecords}
          </span>

          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                const prev = Math.max(1, currentPage - 1);
                setCurrentPage(prev);
                onPageChange?.(prev);
              }}
              disabled={currentPage <= 1}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </button>
            <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700" />
            <button
              type="button"
              onClick={() => {
                const next = Math.min(totalPages, currentPage + 1);
                setCurrentPage(next);
                onPageChange?.(next);
              }}
              disabled={currentPage >= totalPages}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Readable Employees Table */}
      <div className="max-h-[calc(100vh-160px)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <tr className="h-11 text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase tracking-wider">
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">Job Title</th>
              <th className="py-3 px-4">Department</th>
              <th className="py-3 px-4">Nationality</th>
              <th className="py-3 px-4">Documents</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-800 dark:text-slate-200 divide-y divide-slate-100 dark:divide-slate-800/80">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  Loading employees...
                </td>
              </tr>
            ) : pagedEmployees.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  No employees match your filter.
                </td>
              </tr>
            ) : (
              pagedEmployees.map((emp) => {
                const complianceIssues = getComplianceStatus(emp);
                const isExpiring = complianceIssues.length > 0;

                return (
                  <tr
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className={`h-12 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${
                      emp.is_active === false
                        ? 'bg-slate-50/70 dark:bg-slate-900/80 text-slate-500 opacity-80'
                        : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <span
                        className="truncate max-w-[220px] font-medium text-sm text-slate-900 dark:text-white block"
                        title={`${emp.employee_number} • ${emp.work_email || 'No email'}${emp.display_name_local ? ` (${emp.display_name_local})` : ''}`}
                      >
                        {emp.full_name}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="truncate max-w-[170px] text-sm text-slate-700 dark:text-slate-300 block" title={emp.job_title}>
                        {emp.job_title || 'Staff Associate'}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="truncate max-w-[140px] text-sm text-slate-600 dark:text-slate-300 block">
                        {emp.department_id || 'Operations'}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="truncate max-w-[140px] text-sm text-slate-600 dark:text-slate-300 block" title={getCountryName(emp.nationality) || emp.nationality || 'Qatar'}>
                        {getCountryName(emp.nationality) || emp.nationality || 'Qatar'}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {isExpiring ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0"
                          title={complianceIssues.map((i) => i.label).join(' | ')}
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>{complianceIssues[0]?.label || 'Expiring'}</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0"
                          title={`QID: ${emp.national_id_number || 'N/A'} • Visa: ${emp.visa_number || 'N/A'}`}
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>Valid</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {emp.is_active === false ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                          <Archive className="w-3 h-3" />
                          <span>Archived</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${
                            emp.status === 'Active'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : emp.status === 'On Leave'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {emp.status || 'Active'}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer">
                        Open
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
