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

  const getInitials = (name) => {
    if (!name) return 'EMP';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className="space-y-4">
      {/* 1. Standard Top Action Bar / Control Panel (Optional / Bespoke header) */}
      {showHeader && (
        <div className="h-14 min-h-[56px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs px-5 flex items-center justify-between gap-4">
          {/* Left: Breadcrumbs / Title */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium">Human Resources</span>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                Employees Directory
              </span>
            </div>
            <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {employees.length} Employees
            </span>
          </div>

          {/* Right: + Create New Employee button */}
          <button
            type="button"
            onClick={onNewEmployee}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Create New Employee</span>
          </button>
        </div>
      )}

      {/* 2. Search & Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-1 items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, employee code, QID, job title..."
              className="w-full text-xs pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            onChange={(e) => setComplianceFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Compliance Statuses</option>
            <option value="EXPIRING">⚠️ Expiring within 30 Days</option>
            <option value="VALID">✓ Compliant & Valid</option>
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Employee</th>
                <th className="px-4 py-3.5">Job Title & Dept</th>
                <th className="px-4 py-3.5">Branch / Nationality</th>
                <th className="px-4 py-3.5">Immigration & Visa Status</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading international workforce directory...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No employee records match the active criteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const complianceIssues = getComplianceStatus(emp);
                  const isExpiring = complianceIssues.length > 0;

                  return (
                    <tr
                      key={emp.id}
                      onClick={() => onSelectEmployee(emp)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      {/* Avatar + Name + Local Name + Code */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            {getInitials(emp.full_name)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{emp.full_name}</span>
                              {emp.display_name_local && (
                                <span className="font-normal text-slate-400 text-[11px]" dir="rtl">
                                  ({emp.display_name_local})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {emp.employee_number} • {emp.work_email || 'No email registered'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Job Title & Department */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>{emp.job_title || 'Staff Associate'}</span>
                          {emp.grade_code && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                              title={emp.grade_name || emp.grade_code}
                            >
                              {emp.grade_code}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {emp.department_id || 'Operations'} • {emp.employment_type || 'Full-Time'}
                        </div>
                      </td>

                      {/* Branch & Nationality */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {emp.nationality || 'Qatar'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Doha Headquarters (HQ-01)
                        </div>
                      </td>

                      {/* Expat Residency & Visa Status with 30-Day Warning Pills */}
                      <td className="px-4 py-3.5">
                        {isExpiring ? (
                          <div className="space-y-1">
                            {complianceIssues.map((iss, i) => (
                              <div
                                key={i}
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  iss.urgent
                                    ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                    : 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                }`}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                <span>{iss.label}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Valid & Compliant</span>
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          QID: {emp.national_id_number || 'N/A'} • Visa: {emp.visa_number || 'N/A'}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            emp.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : emp.status === 'On Leave'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                              : emp.status === 'Terminated'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {emp.status || 'Active'}
                        </span>
                      </td>

                      {/* Action Chevron */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center text-slate-400 group-hover:text-blue-500 transition">
                          <span className="text-[11px] font-medium mr-1 opacity-0 group-hover:opacity-100 transition">
                            View Profile
                          </span>
                          <ChevronRight className="w-4 h-4" />
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
  );
}
