import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  Paperclip,
  Code,
  Tag,
  Search,
  X,
  FileSpreadsheet,
  Clock,
  Layers,
  Sparkles
} from 'lucide-react';

const MODEL_VARIABLES = {
  'payroll.payslip': [
    { tag: '{{employee_name}}', label: 'Employee Full Name' },
    { tag: '{{employee_number}}', label: 'Employee ID' },
    { tag: '{{month}}', label: 'Salary Period / Month' },
    { tag: '{{net_salary}}', label: 'Net Disbursed Salary' },
    { tag: '{{base_salary}}', label: 'Basic Wage' },
    { tag: '{{deductions}}', label: 'Total Deductions' },
    { tag: '{{overtime_pay}}', label: 'Overtime Earnings' },
    { tag: '{{bank_name}}', label: 'Bank Name' },
    { tag: '{{bank_iban}}', label: 'Bank IBAN' },
    { tag: '{{company_name}}', label: 'Organization Legal Name' },
  ],
  'hr.employee': [
    { tag: '{{employee_name}}', label: 'Employee Full Name' },
    { tag: '{{employee_number}}', label: 'Employee ID' },
    { tag: '{{job_title}}', label: 'Job Title' },
    { tag: '{{department}}', label: 'Department' },
    { tag: '{{work_email}}', label: 'Work Email' },
    { tag: '{{hire_date}}', label: 'Hire Date' },
    { tag: '{{base_salary}}', label: 'Salary Wage' },
    { tag: '{{company_name}}', label: 'Organization Legal Name' },
  ],
  'hr.leave': [
    { tag: '{{employee_name}}', label: 'Employee Full Name' },
    { tag: '{{leave_type}}', label: 'Leave Type Name' },
    { tag: '{{start_date}}', label: 'Start Date' },
    { tag: '{{end_date}}', label: 'End Date' },
    { tag: '{{total_days}}', label: 'Total Calendar Days' },
    { tag: '{{status}}', label: 'Approval Status' },
    { tag: '{{remarks}}', label: 'Manager / Applicant Remarks' },
  ],
  'hr.contract': [
    { tag: '{{employee_name}}', label: 'Employee Full Name' },
    { tag: '{{employee_number}}', label: 'Employee ID' },
    { tag: '{{company_name}}', label: 'Organization Legal Name' },
  ],
  'custom': [
    { tag: '{{employee_name}}', label: 'Employee Full Name' },
    { tag: '{{company_name}}', label: 'Organization Legal Name' },
    { tag: '{{today}}', label: 'Current Date' },
  ],
};

export function MailTemplatesView() {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'preview'
  const [banner, setBanner] = useState('');

  const bodyInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    model_scope: 'payroll.payslip',
    subject: '',
    body_html: '',
    attach_system_report: false,
    report_generator_hook: 'generate_payslip_pdf',
    purge_override: 'inherit',
    purge_days: 30,
  });

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/mail/templates', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.warn('Failed to fetch mail templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      model_scope: 'payroll.payslip',
      subject: 'Salary Statement for {{month}} — {{employee_name}}',
      body_html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; max-width: 600px;">
  <p>Dear <strong>{{employee_name}}</strong>,</p>
  <p>Your official salary statement for <strong>{{month}}</strong> has been processed in accordance with Qatar WPS standards.</p>
  <p>Net Disbursement: <strong>{{net_salary}} QAR</strong></p>
  <p>Please find attached your official payslip report.</p>
</div>`,
      attach_system_report: true,
      report_generator_hook: 'generate_payslip_pdf',
      purge_override: 'inherit',
      purge_days: 30,
    });
    setActiveTab('editor');
    setIsModalOpen(true);
  };

  const openEditModal = (tmpl) => {
    setEditingTemplate(tmpl);
    setFormData({
      name: tmpl.name,
      model_scope: tmpl.model_scope,
      subject: tmpl.subject,
      body_html: tmpl.body_html,
      attach_system_report: tmpl.attach_system_report,
      report_generator_hook: tmpl.report_generator_hook || '',
      purge_override: tmpl.purge_override || 'inherit',
      purge_days: tmpl.purge_days || 30,
    });
    setActiveTab('editor');
    setIsModalOpen(true);
  };

  const handleInsertTag = (tag) => {
    // Append or insert tag at cursor position
    setFormData((prev) => ({
      ...prev,
      body_html: prev.body_html + ` ${tag} `,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const url = editingTemplate
      ? `/api/v1/mail/templates/${editingTemplate.id}`
      : '/api/v1/mail/templates';
    const method = editingTemplate ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save mail template.');
      }
      setIsModalOpen(false);
      setBanner(editingTemplate ? 'Template updated.' : 'Template created.');
      setTimeout(() => setBanner(''), 3000);
      fetchTemplates();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete template "${name}"?`)) return;
    try {
      await fetch(`/api/v1/mail/templates/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setBanner('Template deleted.');
      setTimeout(() => setBanner(''), 3000);
      fetchTemplates();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const filtered = templates.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.model_scope.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesScope =
      selectedScope === 'all' || t.model_scope === selectedScope;

    return matchesSearch && matchesScope;
  });

  const availableVariables =
    MODEL_VARIABLES[formData.model_scope] || MODEL_VARIABLES['custom'];

  return (
    <div className="space-y-3 animate-fadeIn">
      {/* 1. Slim Top Control Bar (44px) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between shadow-2xs gap-3">
        {/* Left: Action Button + Title */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Template</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
              Email Templates
            </span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {filtered.length}
            </span>
          </div>
        </div>

        {/* Center: Search & Scope Filters */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search template name, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={selectedScope}
            onChange={(e) => setSelectedScope(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-mono"
          >
            <option value="all">All Models</option>
            <option value="payroll.payslip">payroll.payslip</option>
            <option value="hr.employee">hr.employee</option>
            <option value="hr.leave">hr.leave</option>
            <option value="hr.contract">hr.contract</option>
            <option value="custom">custom</option>
          </select>
        </div>

        {/* Right: Refresh */}
        <button
          type="button"
          onClick={fetchTemplates}
          disabled={isLoading}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="Refresh Templates"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {banner && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      {/* 2. Odoo-Style High Density Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/80 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider h-8">
                <th className="px-3 py-1 font-semibold">Template Name</th>
                <th className="px-3 py-1 font-semibold">Target Model</th>
                <th className="px-3 py-1 font-semibold">Subject Template</th>
                <th className="px-3 py-1 font-semibold">System Report</th>
                <th className="px-3 py-1 font-semibold">Retention</th>
                <th className="px-3 py-1 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    No email templates found.
                  </td>
                </tr>
              ) : (
                filtered.map((tmpl) => (
                  <tr
                    key={tmpl.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition h-8 text-[12px]"
                  >
                    <td className="px-3 py-1 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate max-w-[200px]">{tmpl.name}</span>
                    </td>

                    <td className="px-3 py-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                        {tmpl.model_scope}
                      </span>
                    </td>

                    <td className="px-3 py-1 text-slate-700 dark:text-slate-300 font-mono text-[11px] truncate max-w-[320px]">
                      {tmpl.subject}
                    </td>

                    <td className="px-3 py-1">
                      {tmpl.attach_system_report ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[10px]">
                          <Paperclip className="w-2.5 h-2.5" />
                          <span>PDF Payslip</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="px-3 py-1 text-slate-500 text-[11px]">
                      {tmpl.purge_override === 'inherit'
                        ? 'Inherit Server'
                        : tmpl.purge_override === 'immediate'
                        ? 'Immediate'
                        : `${tmpl.purge_days} Days`}
                    </td>

                    <td className="px-3 py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(tmpl)}
                          className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title="Edit Template"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tmpl.id, tmpl.name)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="Delete Template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Template Builder & Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-2xs">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingTemplate ? 'Edit Email Template' : 'Create New Email Template'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Template-driven messaging with click-to-insert placeholders & ReportLab PDF hook
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Template Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Monthly Payslip Notification"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Model Scope *
                  </label>
                  <select
                    value={formData.model_scope}
                    onChange={(e) => setFormData({ ...formData, model_scope: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="payroll.payslip">payroll.payslip</option>
                    <option value="hr.employee">hr.employee</option>
                    <option value="hr.leave">hr.leave</option>
                    <option value="hr.contract">hr.contract</option>
                    <option value="custom">custom (General)</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Subject Line *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Official Statement: {{month}} — {{employee_name}}"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Click-to-insert placeholder pills */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  <Tag className="w-3 h-3 text-blue-500" />
                  <span>Click to insert record variable:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableVariables.map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => handleInsertTag(v.tag)}
                      className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 text-[10px] font-mono transition cursor-pointer flex items-center gap-1 shadow-2xs"
                      title={v.label}
                    >
                      <span>{v.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor / Live HTML Preview Tabs */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Template HTML Body *
                  </label>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px]">
                    <button
                      type="button"
                      onClick={() => setActiveTab('editor')}
                      className={`px-2.5 py-0.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                        activeTab === 'editor'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Code className="w-3 h-3" />
                      <span>HTML Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className={`px-2.5 py-0.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                        activeTab === 'preview'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Live Preview</span>
                    </button>
                  </div>
                </div>

                {activeTab === 'editor' ? (
                  <textarea
                    ref={bodyInputRef}
                    rows={8}
                    required
                    value={formData.body_html}
                    onChange={(e) => setFormData({ ...formData, body_html: e.target.value })}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter HTML layout..."
                  />
                ) : (
                  <div className="w-full min-h-[180px] p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-y-auto">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: formData.body_html
                          .replace(/\{\{employee_name\}\}/g, 'Tariq Al-Mansoor')
                          .replace(/\{\{month\}\}/g, 'October 2026')
                          .replace(/\{\{net_salary\}\}/g, '28,500.00')
                          .replace(/\{\{base_salary\}\}/g, '28,500.00')
                          .replace(/\{\{deductions\}\}/g, '1,425.00')
                          .replace(/\{\{bank_name\}\}/g, 'Qatar National Bank (QNB)')
                          .replace(/\{\{bank_iban\}\}/g, 'QA55QNBA••••••••••••')
                          .replace(/\{\{company_name\}\}/g, 'Apex Global Enterprises Q.P.S.C.'),
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Dynamic PDF Report Hook Toggle */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-emerald-500" />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white text-xs">
                        Attach Generated PDF Report
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Renders dynamic WPS-compliant PDF to physical disk and includes in email payload
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.attach_system_report}
                    onChange={(e) => setFormData({ ...formData, attach_system_report: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {formData.attach_system_report && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-mono text-[11px]">Generator Hook:</span>
                    <input
                      type="text"
                      value={formData.report_generator_hook}
                      onChange={(e) => setFormData({ ...formData, report_generator_hook: e.target.value })}
                      placeholder="generate_payslip_pdf"
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px] text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {/* Retention Purge Override */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">
                    Retention Purge Rule
                  </label>
                  <select
                    value={formData.purge_override}
                    onChange={(e) => setFormData({ ...formData, purge_override: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="inherit">Inherit Mail Server Rule</option>
                    <option value="immediate">Immediate (Purge upon delivery)</option>
                    <option value="custom_days">Custom Days</option>
                  </select>
                </div>

                {formData.purge_override === 'custom_days' && (
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
                      Custom Retention Days
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={formData.purge_days}
                      onChange={(e) => setFormData({ ...formData, purge_days: parseInt(e.target.value) || 30 })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition cursor-pointer"
                >
                  Cancel (Esc)
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs"
                >
                  {editingTemplate ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
