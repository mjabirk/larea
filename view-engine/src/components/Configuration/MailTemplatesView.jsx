import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Code,
  Tag,
  Search,
  X,
  FileSpreadsheet,
  Clock,
  Layers,
  Sparkles,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  Check
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';

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

const DEFAULT_NEW_FORM = {
  name: '',
  model_scope: 'payroll.payslip',
  subject: 'Salary Statement for {{month}} — {{employee_name}}',
  body_html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; max-width: 600px;">
  <p>Dear <strong>{{employee_name}}</strong>,</p>
  <p>Your salary statement for <strong>{{month}}</strong> is ready.</p>
  <p>Net Amount: <strong>{{net_salary}} QAR</strong></p>
  <p>Please find your payslip attached.</p>
</div>`,
  attach_system_report: true,
  report_generator_hook: 'generate_payslip_pdf',
  purge_override: 'inherit',
  purge_days: 30,
};

export function MailTemplatesView() {
  const { t } = useLocale();
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState('all');

  // Standard in-place view mode
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'form' ? 'form' : 'list'
  ); // 'list' | 'form'
  const [pendingId, setPendingId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search);
    return p.get('view') === 'form' ? (p.get('id') || 'new') : null;
  });
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'preview'
  const [banner, setBanner] = useState('');

  const bodyInputRef = useRef(null);

  const [formData, setFormData] = useState(DEFAULT_NEW_FORM);

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

  useEffect(() => {
    if (!pendingId) return;
    if (pendingId === 'new') {
      setPendingId(null);
      return;
    }
    if (templates.length > 0) {
      const found = templates.find((item) => String(item.id) === String(pendingId));
      if (found) loadRecordIntoForm(found);
      setPendingId(null);
    }
  }, [pendingId, templates]);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (viewMode === 'form') {
        p.set('view', 'form');
        p.set('id', String(pendingId || selectedRecord?.id || 'new'));
      } else {
        p.delete('view');
        p.delete('id');
      }
      const qs = p.toString();
      window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    } catch (e) {}
  }, [viewMode, selectedRecord, pendingId]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        !searchQuery ||
        t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.model_scope?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesScope =
        selectedScope === 'all' || t.model_scope === selectedScope;

      return matchesSearch && matchesScope;
    });
  }, [templates, searchQuery, selectedScope]);

  // Record Pager resolution
  const currentRecordIndex = useMemo(() => {
    if (!selectedRecord) return -1;
    return filtered.findIndex((t) => t.id === selectedRecord.id);
  }, [selectedRecord, filtered]);

  const loadRecordIntoForm = useCallback((tmpl) => {
    setSelectedRecord(tmpl);
    setFormData({
      name: tmpl.name || '',
      model_scope: tmpl.model_scope || 'payroll.payslip',
      subject: tmpl.subject || '',
      body_html: tmpl.body_html || '',
      attach_system_report: Boolean(tmpl.attach_system_report),
      report_generator_hook: tmpl.report_generator_hook || '',
      purge_override: tmpl.purge_override || 'inherit',
      purge_days: tmpl.purge_days || 30,
    });
    setIsDirty(false);
    setActiveTab('editor');
  }, []);

  const handleStepRecord = (direction) => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and proceed?')) {
      return;
    }
    const nextIndex = currentRecordIndex + direction;
    if (nextIndex >= 0 && nextIndex < filtered.length) {
      loadRecordIntoForm(filtered[nextIndex]);
    }
  };

  const openCreateForm = () => {
    setSelectedRecord(null);
    setFormData(DEFAULT_NEW_FORM);
    setIsDirty(false);
    setActiveTab('editor');
    setViewMode('form');
  };

  const openEditForm = (tmpl) => {
    loadRecordIntoForm(tmpl);
    setViewMode('form');
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleInsertTag = (tag) => {
    setFormData((prev) => ({
      ...prev,
      body_html: prev.body_html + ` ${tag} `,
    }));
    setIsDirty(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    const url = selectedRecord
      ? `/api/v1/mail/templates/${selectedRecord.id}`
      : '/api/v1/mail/templates';
    const method = selectedRecord ? 'PUT' : 'POST';

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
      const data = await res.json();
      const updated = data.template || { ...formData, id: selectedRecord?.id || Date.now() };
      setSelectedRecord(updated);
      setIsDirty(false);
      setBanner({ text: selectedRecord ? 'Template updated successfully.' : 'Template created successfully.', type: 'success' });
      setTimeout(() => setBanner(null), 3000);
      fetchTemplates();
    } catch (err) {
      setBanner({ text: err.message || 'Operation failed.', type: 'error' });
      setTimeout(() => setBanner(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }
    setViewMode('list');
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete template "${name}"?`)) return;
    try {
      await fetch(`/api/v1/mail/templates/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setBanner({ text: 'Template deleted.', type: 'success' });
      setTimeout(() => setBanner(null), 3000);
      fetchTemplates();
      if (selectedRecord?.id === id) {
        setViewMode('list');
      }
    } catch (err) {
      setBanner({ text: 'Delete failed: ' + err.message, type: 'error' });
      setTimeout(() => setBanner(null), 4000);
    }
  };

  const availableVariables =
    MODEL_VARIABLES[formData.model_scope] || MODEL_VARIABLES['custom'];

  return (
    <div className="space-y-3 animate-fadeIn">
      {/* Toast Notification Banner */}
      {banner && (
        <div
          role="status"
          aria-live="polite"
          className={`p-3 rounded-xl border text-xs flex items-center justify-between shadow-xs ${
            typeof banner === 'object' && banner.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {typeof banner === 'object' && banner.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span className="font-semibold">{typeof banner === 'object' ? banner.text : banner}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="hover:opacity-80 transition cursor-pointer p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewMode === 'form' ? (
        /* =========================================================================
           IN-PLACE FULL-CANVAS FORM VIEW
           ========================================================================= */
        <div className="space-y-4">
          {/* Top Sticky Breadcrumbs & Actions Header */}
          <div className="sticky top-14 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            {/* Left: Back Button & Breadcrumbs */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDiscard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer text-xs font-semibold"
                title="Back to Email Templates list"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Templates</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">System Configuration</span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="text-slate-400">Email Templates</span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {formData.name || 'New Template'}
                </span>
              </div>
            </div>

            {/* Center: Record Pager */}
            {selectedRecord && filtered.length > 1 && currentRecordIndex !== -1 && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-300 mx-auto sm:mx-0">
                <button
                  type="button"
                  disabled={currentRecordIndex === 0}
                  onClick={() => handleStepRecord(-1)}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Previous record"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1 text-[11px] font-semibold">
                  {currentRecordIndex + 1} of {filtered.length}
                </span>
                <button
                  type="button"
                  disabled={currentRecordIndex === filtered.length - 1}
                  onClick={() => handleStepRecord(1)}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Next record"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Right: Discard & Sticky Save Changes */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleDiscard}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || (selectedRecord && !isDirty)}
                className={`px-4 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs ${
                  isSaving || (selectedRecord && !isDirty)
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-300 dark:border-slate-700'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                <span>{selectedRecord ? 'Save Changes' : 'Create Template'}</span>
              </button>
            </div>
          </div>

          {/* Form Body Canvas */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <form onSubmit={handleSave} className="space-y-5 text-xs max-w-5xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Template Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Monthly Payslip Notification"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Model Scope *
                  </label>
                  <select
                    value={formData.model_scope}
                    onChange={(e) => handleFieldChange('model_scope', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    Subject Line *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Salary Statement for {{month}} — {{employee_name}}"
                    value={formData.subject}
                    onChange={(e) => handleFieldChange('subject', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* Dynamic Placeholders Toolbar */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold mb-2">
                  <Tag className="w-3.5 h-3.5 text-blue-500" />
                  <span>Click-to-Insert Placeholders ({formData.model_scope}):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableVariables.map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => handleInsertTag(v.tag)}
                      className="px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 text-slate-700 dark:text-slate-300 font-mono text-[11px] hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer flex items-center gap-1"
                      title={v.label}
                    >
                      <span>{v.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* HTML Editor with Preview Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Email HTML Layout *
                  </label>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px]">
                    <button
                      type="button"
                      onClick={() => setActiveTab('editor')}
                      className={`px-3 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'editor'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>HTML Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className={`px-3 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'preview'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Live Preview</span>
                    </button>
                  </div>
                </div>

                {activeTab === 'editor' ? (
                  <textarea
                    ref={bodyInputRef}
                    rows={12}
                    required
                    value={formData.body_html}
                    onChange={(e) => handleFieldChange('body_html', e.target.value)}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                    placeholder="Enter HTML layout..."
                  />
                ) : (
                  <div className="w-full min-h-[250px] p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-y-auto">
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
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Paperclip className="w-4 h-4 text-emerald-500" />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white text-xs">
                        Attach Generated PDF Report
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Automatically generates and attaches the PDF document when sending
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.attach_system_report}
                    onChange={(e) => handleFieldChange('attach_system_report', e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                {formData.attach_system_report && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-mono text-[11px]">Generator Hook:</span>
                    <input
                      type="text"
                      value={formData.report_generator_hook}
                      onChange={(e) => handleFieldChange('report_generator_hook', e.target.value)}
                      placeholder="generate_payslip_pdf"
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px] text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {/* Retention Purge Override */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">
                    Retention Purge Rule
                  </label>
                  <select
                    value={formData.purge_override}
                    onChange={(e) => handleFieldChange('purge_override', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
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
                      onChange={(e) => handleFieldChange('purge_days', parseInt(e.target.value) || 30)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* =========================================================================
           LIST VIEW
           ========================================================================= */
        <>
          {/* Slim Top Control Bar (44px) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between shadow-2xs gap-3">
            {/* Left: Action Button + Title */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openCreateForm}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('add_template')}</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                  {t('mail_templates')}
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {filtered.length}
                </span>
              </div>
            </div>

            {/* Center: Search & Scope Filters */}
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search template name, subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ps-8 pe-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs focus:outline-none"
              >
                <option value="all">All Scopes</option>
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
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Refresh templates"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Templates Table List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 font-semibold">
                    <th className="px-3 py-2">{t('template_code')}</th>
                    <th className="px-3 py-2">{t('channel')}</th>
                    <th className="px-3 py-2">{t('subject')}</th>
                    <th className="px-3 py-2">{t('attachments')}</th>
                    <th className="px-3 py-2">{t('retention_purge')}</th>
                    <th className="px-3 py-2 text-end">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading && templates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-blue-500" />
                        Loading communication templates...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No templates found. Click "New Template" to register an email template.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((tmpl) => (
                      <tr
                        key={tmpl.id}
                        onClick={() => openEditForm(tmpl)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                      >
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="group-hover:text-blue-600 transition-colors">
                              {tmpl.name}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {tmpl.model_scope}
                          </span>
                        </td>

                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-mono text-[11px] max-w-xs truncate">
                          {tmpl.subject}
                        </td>

                        <td className="px-3 py-2">
                          {tmpl.attach_system_report ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <Paperclip className="w-3 h-3" />
                              PDF Report
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>

                        <td className="px-3 py-2 text-slate-500 text-[11px]">
                          {tmpl.purge_override === 'inherit'
                            ? 'Inherit Server'
                            : tmpl.purge_override === 'immediate'
                            ? 'Immediate'
                            : `${tmpl.purge_days} Days`}
                        </td>

                        <td className="px-3 py-2 text-end">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEditForm(tmpl)}
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
        </>
      )}
    </div>
  );
}
