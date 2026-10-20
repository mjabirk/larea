import React, { useState } from 'react';
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
} from 'lucide-react';

export function EmployeeListView({
  employees = [],
  isLoading = false,
  onSelectEmployee,
  onNewEmployee,
  searchTerm: externalSearchTerm,
  onSearchChange: externalOnSearchChange,
  showHeader = false,
}) {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = externalOnSearchChange || setInternalSearchTerm;
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [complianceFilter, setComplianceFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 80;

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
      (emp.work_email || '').toLowerCase().includes(q);

    const matchDept =
      deptFilter === 'ALL' || emp.department_id === deptFilter;

    const complianceIssues = getComplianceStatus(emp);
    const matchCompliance =
      complianceFilter === 'ALL' ||
      (complianceFilter === 'EXPIRING' && complianceIssues.length > 0) ||
      (complianceFilter === 'VALID' && complianceIssues.length === 0);

    return matchSearch && matchDept && matchCompliance;
  });

  // 80-record pagination
  const totalRecords = filteredEmployees.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const pagedEmployees = filteredEmployees.slice(startIndex, endIndex);

  return (
    <div className="space-y-2.5">
      {/* 1. Top Action Bar (When standalone showHeader is true) */}
      {showHeader && (
        <div className="h-11 min-h-[44px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs px-3 sm:px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNewEmployee}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Create New Employee</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs pl-2 border-l border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-900 dark:text-white">Employees Directory</span>
              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {employees.length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Slim 36px Search & Filter Strip with Odoo-style Pager */}
      <div className="h-9 min-h-[36px] bg-white dark:bg-slate-900 px-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-2.5">
        <div className="flex flex-1 items-center gap-2 max-w-xl">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search name, code, QID, title..."
              className="w-full h-7 text-xs pl-7 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-7 text-[11.5px] font-medium px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer shrink-0"
          >
            <option value="ALL">All Departments</option>
            <option value="Operations">Operations</option>
            <option value="Human Resources">Human Resources</option>
            <option value="Engineering">Engineering</option>
            <option value="General">General</option>
          </select>

          {/* Compliance Filter */}
          <select
            value={complianceFilter}
            onChange={(e) => {
              setComplianceFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-7 text-[11.5px] font-medium px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer shrink-0 hidden sm:block"
          >
            <option value="ALL">All Compliance</option>
            <option value="EXPIRING">⚠️ Expiring &lt;30d</option>
            <option value="VALID">✓ Valid</option>
          </select>
        </div>

        {/* Right: Odoo-Style Pager [ 1-80 / N ] < > */}
        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-xs pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">
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

      {/* 3. High-Density Employees Table (32px row height, sticky header, 80 records per view) */}
      <div className="max-h-[calc(100vh-140px)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 shadow-2xs">
            <tr className="h-8 text-slate-600 dark:text-slate-400 font-semibold text-[11.5px] uppercase tracking-wider">
              <th className="py-1 px-2.5">Employee</th>
              <th className="py-1 px-2.5">Job Title</th>
              <th className="py-1 px-2.5">Department</th>
              <th className="py-1 px-2.5">Nationality</th>
              <th className="py-1 px-2.5">Immigration & Visa</th>
              <th className="py-1 px-2.5">Status</th>
              <th className="py-1 px-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-[12.5px] text-slate-800 dark:text-slate-200 divide-y divide-slate-100 dark:divide-slate-800/80">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                  Loading workforce directory...
                </td>
              </tr>
            ) : pagedEmployees.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                  No employee records match the active criteria.
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
                    className="h-8 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/40 dark:even:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800/60 transition-colors cursor-pointer"
                  >
                    {/* Employee Name (Single-line truncate, ID & email in tooltip) */}
                    <td className="py-1 px-2.5">
                      <span
                        className="truncate max-w-[200px] font-semibold text-slate-900 dark:text-white block cursor-default"
                        title={`${emp.employee_number} • ${emp.work_email || 'No email'}${emp.display_name_local ? ` (${emp.display_name_local})` : ''}`}
                      >
                        {emp.full_name}
                      </span>
                    </td>

                    {/* Job Title (Single line) */}
                    <td className="py-1 px-2.5">
                      <span className="truncate max-w-[150px] font-medium text-slate-800 dark:text-slate-200 block" title={emp.job_title}>
                        {emp.job_title || 'Staff Associate'}
                      </span>
                    </td>

                    {/* Department (Single line) */}
                    <td className="py-1 px-2.5">
                      <span className="truncate max-w-[120px] text-slate-600 dark:text-slate-300 block">
                        {emp.department_id || 'Operations'}
                      </span>
                    </td>

                    {/* Nationality (Single line) */}
                    <td className="py-1 px-2.5">
                      <span className="truncate max-w-[120px] text-slate-600 dark:text-slate-300 block">
                        {emp.nationality || 'Qatar'}
                      </span>
                    </td>

                    {/* Immigration / Visa Status (Compact 20px pill) */}
                    <td className="py-1 px-2.5">
                      {isExpiring ? (
                        <span
                          className="inline-flex items-center gap-1 h-5 px-1.5 py-0 rounded text-[10.5px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0"
                          title={complianceIssues.map((i) => i.label).join(' | ')}
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>{complianceIssues[0]?.label || 'Expiring'}</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 h-5 px-1.5 py-0 rounded text-[10.5px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0"
                          title={`QID: ${emp.national_id_number || 'N/A'} • Visa: ${emp.visa_number || 'N/A'}`}
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>Valid</span>
                        </span>
                      )}
                    </td>

                    {/* Status Pill (Compact 20px) */}
                    <td className="py-1 px-2.5">
                      <span
                        className={`inline-flex items-center h-5 px-1.5 py-0 rounded text-[10.5px] font-bold border shrink-0 ${
                          emp.status === 'Active'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : emp.status === 'On Leave'
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        {emp.status || 'Active'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-1 px-2.5 text-right">
                      <span className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer">
                        View →
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
