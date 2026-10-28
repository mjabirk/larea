import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Edit2,
  Send,
  X,
  ExternalLink,
  Tag,
  Layers,
  ChevronDown,
  FileDown,
  Image as ImageIcon,
  MessageSquare,
  Sparkles,
  Check,
  Globe,
  Sliders,
  HelpCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';

// Predefined ERP Field Suggestions per Model Scope
const FIELD_SUGGESTIONS = {
  'payroll.payslip': [
    { field: 'employee_name', label: 'Employee Full Name' },
    { field: 'salary_month', label: 'Salary Month (e.g. October 2026)' },
    { field: 'net_salary_qar', label: 'Net Payable Salary (QAR)' },
    { field: 'basic_salary_qar', label: 'Basic Salary (QAR)' },
    { field: 'bank_name', label: 'Bank Name' },
    { field: 'bank_iban', label: 'Bank IBAN' },
    { field: 'company_name', label: 'Employer Company' },
  ],
  'hr.leave': [
    { field: 'employee_name', label: 'Employee Full Name' },
    { field: 'leave_type', label: 'Leave Type (Annual, Sick, Emergency)' },
    { field: 'start_date', label: 'Leave Start Date' },
    { field: 'end_date', label: 'Leave End Date' },
    { field: 'duration_days', label: 'Duration (Days)' },
    { field: 'status', label: 'Approval Status' },
    { field: 'approver_name', label: 'Manager / Approver' },
  ],
  'hr.contract': [
    { field: 'employee_name', label: 'Employee Full Name' },
    { field: 'contract_title', label: 'Job Title / Designation' },
    { field: 'contract_expiry', label: 'Contract Expiration Date' },
    { field: 'notice_period', label: 'Notice Period' },
    { field: 'company_name', label: 'Company Name' },
  ],
  general: [
    { field: 'recipient_name', label: 'Recipient Name' },
    { field: 'company_name', label: 'Company Name' },
    { field: 'date', label: 'Current Date' },
    { field: 'reference_number', label: 'Reference Code / ID' },
  ],
};

const DEFAULT_NEW_FORM = {
  config_id: '',
  template_name: '',
  category: 'UTILITY',
  language: 'en_US',
  model_scope: 'general',
  header_type: 'NONE',
  header_text: '',
  body_text: '',
  footer_text: '',
  buttons_json: '[]',
  variable_mapping_json: '{}',
};

export function WhatsAppTemplatesView() {
  const { t } = useLocale();
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [templates, setTemplates] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionMessage, setActionMessage] = useState(null);

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

  // Builder Form State
  const [formData, setFormData] = useState(DEFAULT_NEW_FORM);

  // Buttons Editor State
  const [buttonType, setButtonType] = useState('NONE'); // NONE, QUICK_REPLY, CTA_URL
  const [buttonText, setButtonText] = useState('View In Portal');
  const [buttonUrl, setButtonUrl] = useState('https://erp.apexglobal.qa');

  // Live Variable Mappings Map: { "1": "employee_name", "2": "salary_month" }
  const [variableMap, setVariableMap] = useState({});

  // Snake Case Validation State
  const isNameSnakeCase = useMemo(() => {
    if (!formData.template_name) return true;
    return /^[a-z0-9_]+$/.test(formData.template_name);
  }, [formData.template_name]);

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        fetch('/api/v1/communication/whatsapp-templates', { headers: getHeaders() }),
        fetch('/api/v1/communication/whatsapp-configs', { headers: getHeaders() }),
      ]);
      if (tRes.ok) {
        const tData = await tRes.json();
        setTemplates(tData.templates || []);
      }
      if (cRes.ok) {
        const cData = await cRes.json();
        setConfigs(cData.configs || []);
      }
    } catch (e) {
      console.error('Failed to load WhatsApp templates:', e);
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (!pendingId) return;
    if (pendingId === 'new') {
      if (configs.length > 0) {
        setPendingId(null);
        setFormData((prev) => ({ ...prev, config_id: prev.config_id || configs[0]?.id || '' }));
      }
      return;
    }
    if (templates.length > 0) {
      const found = templates.find((item) => String(item.id) === String(pendingId));
      if (found) loadRecordIntoForm(found);
      setPendingId(null);
    }
  }, [pendingId, templates, configs]);

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
      if (filterScope !== 'all' && t.model_scope !== filterScope) return false;
      if (filterStatus !== 'all' && t.approval_status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.template_name?.toLowerCase().includes(q) ||
          t.body_text?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [templates, search, filterScope, filterStatus]);

  // Record Pager resolution
  const currentRecordIndex = useMemo(() => {
    if (!selectedRecord) return -1;
    return filtered.findIndex((t) => t.id === selectedRecord.id);
  }, [selectedRecord, filtered]);

  const loadRecordIntoForm = useCallback((tmpl) => {
    setSelectedRecord(tmpl);
    setFormData({
      config_id: tmpl.config_id || '',
      template_name: tmpl.template_name || '',
      category: tmpl.category || 'UTILITY',
      language: tmpl.language || 'en_US',
      model_scope: tmpl.model_scope || 'general',
      header_type: tmpl.header_type || 'NONE',
      header_text: tmpl.header_text || '',
      body_text: tmpl.body_text || '',
      footer_text: tmpl.footer_text || '',
      buttons_json: tmpl.buttons_json || '[]',
      variable_mapping_json: tmpl.variable_mapping_json || '{}',
    });

    try {
      const parsedButtons = JSON.parse(tmpl.buttons_json || '[]');
      if (parsedButtons.length > 0) {
        setButtonType(parsedButtons[0].type || 'QUICK_REPLY');
        setButtonText(parsedButtons[0].text || 'View In Portal');
        setButtonUrl(parsedButtons[0].url || 'https://erp.apexglobal.qa');
      } else {
        setButtonType('NONE');
      }
    } catch {
      setButtonType('NONE');
    }

    try {
      const parsedVars = JSON.parse(tmpl.variable_mapping_json || '{}');
      setVariableMap(parsedVars);
    } catch {
      setVariableMap({});
    }

    setIsDirty(false);
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

  const handleOpenCreate = () => {
    setSelectedRecord(null);
    setFormData({
      ...DEFAULT_NEW_FORM,
      config_id: configs[0]?.id || '',
    });
    setButtonType('NONE');
    setVariableMap({});
    setIsDirty(false);
    setViewMode('form');
  };

  const handleOpenEdit = (tmpl) => {
    loadRecordIntoForm(tmpl);
    setViewMode('form');
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  // Detected body variable indices: ['1', '2', ...]
  const detectedVariables = useMemo(() => {
    const matches = formData.body_text.match(/\{\{(\d+)\}\}/g) || [];
    const indices = matches.map((m) => m.replace(/[{}]/g, ''));
    return [...new Set(indices)].sort((a, b) => parseInt(a) - parseInt(b));
  }, [formData.body_text]);

  // Insert sequential placeholder {{1}}, {{2}}...
  const handleInsertNextVariable = (suggestedFieldName) => {
    const nextIndex = detectedVariables.length + 1;
    const tag = `{{${nextIndex}}}`;
    setFormData((prev) => ({
      ...prev,
      body_text: prev.body_text + (prev.body_text.endsWith(' ') || !prev.body_text ? '' : ' ') + tag + ' ',
    }));
    if (suggestedFieldName) {
      setVariableMap((prev) => ({
        ...prev,
        [String(nextIndex)]: suggestedFieldName,
      }));
    }
    setIsDirty(true);
  };

  const handleSaveTemplate = async (autoSubmit = false) => {
    if (!formData.template_name.trim() || !formData.body_text.trim()) {
      setActionMessage({ type: 'error', text: 'Template name and body content are required.' });
      return;
    }

    if (!isNameSnakeCase) {
      setActionMessage({
        type: 'error',
        text: 'Template name must be strictly lowercase snake_case (e.g. employee_leave_v1).',
      });
      return;
    }

    setIsSaving(true);
    try {
      const buttonsPayload =
        buttonType === 'NONE'
          ? []
          : [
              {
                type: buttonType,
                text: buttonText,
                url: buttonType === 'CTA_URL' ? buttonUrl : undefined,
              },
            ];

      const payload = {
        ...formData,
        buttons_json: JSON.stringify(buttonsPayload),
        variable_mapping_json: JSON.stringify(variableMap),
      };

      const url = selectedRecord
        ? `/api/v1/communication/whatsapp-templates/${selectedRecord.id}`
        : '/api/v1/communication/whatsapp-templates';
      const method = selectedRecord ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save template');
      }

      const resData = await res.json();
      const updated = resData.template || { ...payload, id: selectedRecord?.id || Date.now() };
      setSelectedRecord(updated);
      setIsDirty(false);

      if (autoSubmit && updated.id) {
        await handleSubmitToMeta(updated);
      } else {
        setActionMessage({
          type: 'success',
          text: selectedRecord ? 'Template draft updated successfully.' : 'New template registered as DRAFT.',
        });
      }
      fetchTemplates();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitToMeta = async (tmpl) => {
    try {
      const res = await fetch(`/api/v1/communication/whatsapp-templates/${tmpl.id}/submit`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Meta submission failed');
      setActionMessage({
        type: 'success',
        text: `Template "${tmpl.template_name}" successfully submitted to Meta Graph API. Status: PENDING.`,
      });
      fetchTemplates();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleSyncMetaStatus = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/v1/communication/whatsapp-templates/sync', {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Sync failed');
      setActionMessage({
        type: 'success',
        text: `Synced with Meta Cloud API. Updated ${data.updated_count || 0} templates.`,
      });
      fetchTemplates();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (tmpl) => {
    if (!window.confirm(`Delete WhatsApp template "${tmpl.template_name}"?`)) return;
    try {
      const res = await fetch(`/api/v1/communication/whatsapp-templates/${tmpl.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete template');
      }
      setActionMessage({ type: 'success', text: `Template "${tmpl.template_name}" deleted.` });
      fetchTemplates();
      if (selectedRecord?.id === tmpl.id) {
        setViewMode('list');
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleDiscard = () => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }
    setViewMode('list');
  };

  // Preview body interpolation
  const previewBody = useMemo(() => {
    let result = formData.body_text || '';
    const sampleValues = {
      employee_name: 'Tariq Al-Mansoor',
      salary_month: 'October 2026',
      net_salary_qar: '28,500.00',
      basic_salary_qar: '22,000.00',
      bank_name: 'Qatar National Bank (QNB)',
      bank_iban: 'QA55QNBA••••••••••••',
      company_name: 'Apex Global Enterprises Q.P.S.C.',
      leave_type: 'Annual Vacation',
      start_date: '2026-11-01',
      end_date: '2026-11-15',
      duration_days: '14',
      status: 'APPROVED',
      approver_name: 'Hamad Al-Thani (HR Director)',
      contract_title: 'Lead Operations Engineer',
      contract_expiry: '2027-12-31',
      notice_period: '30 Days',
      recipient_name: 'Valued Colleague',
      date: '18-Oct-2026',
      reference_number: 'REF-2026-0988',
    };

    detectedVariables.forEach((idx) => {
      const mappedField = variableMap[idx];
      const replacement = (mappedField && sampleValues[mappedField]) || `[${mappedField || `Var ${idx}`}]`;
      result = result.split(`{{${idx}}}`).join(replacement);
    });

    return result;
  }, [formData.body_text, detectedVariables, variableMap]);

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Meta Review
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Toast Feedback */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-semibold shadow-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white cursor-pointer ms-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewMode === 'form' ? (
        /* =========================================================================
           IN-PLACE FULL-CANVAS TEMPLATE BUILDER VIEW
           ========================================================================= */
        <div className="space-y-4">
          {/* Top Sticky Breadcrumbs & Actions Header */}
          <div className="sticky top-14 z-10 bg-slate-900/95 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            {/* Left: Back Button & Breadcrumbs */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDiscard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition cursor-pointer text-xs font-semibold"
                title="Back to WhatsApp Templates list"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Templates</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">System Configuration</span>
                <span className="text-slate-700">/</span>
                <span className="text-slate-400">WhatsApp Templates</span>
                <span className="text-slate-700">/</span>
                <span className="font-bold text-white truncate max-w-[200px]">
                  {formData.template_name || 'New Template'}
                </span>
              </div>
            </div>

            {/* Center: Record Pager */}
            {selectedRecord && filtered.length > 1 && currentRecordIndex !== -1 && (
              <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-lg text-xs font-mono text-slate-300 mx-auto sm:mx-0">
                <button
                  type="button"
                  disabled={currentRecordIndex === 0}
                  onClick={() => handleStepRecord(-1)}
                  className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                  className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Next record"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Right: Discard, Save Draft, and Save & Submit */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleDiscard}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold text-xs transition cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={isSaving || !isNameSnakeCase}
                onClick={() => handleSaveTemplate(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 border border-slate-700"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Draft</span>
              </button>
              <button
                type="button"
                disabled={isSaving || !isNameSnakeCase}
                onClick={() => handleSaveTemplate(true)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Save &amp; Submit to Meta</span>
              </button>
            </div>
          </div>

          {/* Builder Canvas (Two-Column Layout) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xs grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
            {/* Left Column: Form Builder Controls (7 cols) */}
            <div className="lg:col-span-7 p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-slate-300">
                      Template Identifier (snake_case) <span className="text-rose-400">*</span>
                    </label>
                    <span
                      className={`text-[10px] font-mono ${
                        isNameSnakeCase ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isNameSnakeCase ? '✓ Valid Meta format' : '✗ Lowercase, numbers, underscores only'}
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. payslip_notice_v1"
                    value={formData.template_name}
                    onChange={(e) =>
                      handleFieldChange('template_name', e.target.value.toLowerCase().replace(/\s+/g, '_'))
                    }
                    className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none transition ${
                      isNameSnakeCase ? 'border-slate-800 focus:border-emerald-500' : 'border-rose-500'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleFieldChange('category', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="UTILITY">Utility (Account, alerts, billing)</option>
                    <option value="MARKETING">Marketing (Promotional)</option>
                    <option value="AUTHENTICATION">Authentication (OTP codes)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Language</label>
                  <select
                    value={formData.language}
                    onChange={(e) => handleFieldChange('language', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="en_US">English (US) - en_US</option>
                    <option value="ar">Arabic - ar</option>
                    <option value="fr">French - fr</option>
                    <option value="es">Spanish - es</option>
                    <option value="ur">Urdu - ur</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">ERP Model Scope</label>
                  <select
                    value={formData.model_scope}
                    onChange={(e) => handleFieldChange('model_scope', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="payroll.payslip">Payroll Payslips (payroll.payslip)</option>
                    <option value="hr.leave">HR Leaves (hr.leave)</option>
                    <option value="hr.contract">HR Contracts (hr.contract)</option>
                    <option value="general">General Broadcast</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Header Type</label>
                  <select
                    value={formData.header_type}
                    onChange={(e) => handleFieldChange('header_type', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="NONE">None</option>
                    <option value="DOCUMENT">Document (PDF attachment)</option>
                    <option value="TEXT">Text Heading</option>
                    <option value="IMAGE">Image Header</option>
                  </select>
                </div>

                {formData.header_type === 'TEXT' && (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-medium text-slate-300">Header Text</label>
                    <input
                      type="text"
                      placeholder="e.g. Apex Global Official Notice"
                      value={formData.header_text}
                      onChange={(e) => handleFieldChange('header_text', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Variable Quick-Insert Toolbar */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    ERP Fields for {formData.model_scope}:
                  </span>
                  <span className="text-[10px] text-slate-500">Click to append placeholder</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(FIELD_SUGGESTIONS[formData.model_scope] || FIELD_SUGGESTIONS.general).map((sug) => (
                    <button
                      key={sug.field}
                      type="button"
                      onClick={() => handleInsertNextVariable(sug.field)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-slate-800 rounded-lg text-[10px] transition cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>{sug.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Body Editor */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-slate-300">
                    Message Body Text <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formData.body_text.length}/1024 chars
                  </span>
                </div>
                <textarea
                  rows={6}
                  required
                  placeholder="Dear {{1}}, your official statement for {{2}} is ready..."
                  value={formData.body_text}
                  onChange={(e) => handleFieldChange('body_text', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 font-sans focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              {/* Variable Mapping Matrix */}
              {detectedVariables.length > 0 && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-3 h-3 text-emerald-400" />
                    <span>Dynamic Variable Parameter Binding ({detectedVariables.length}):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {detectedVariables.map((idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                        <span className="w-6 h-6 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[11px] flex items-center justify-center font-bold">
                          {`{{${idx}}}`}
                        </span>
                        <input
                          type="text"
                          placeholder="e.g. employee_name"
                          value={variableMap[idx] || ''}
                          onChange={(e) => {
                            setVariableMap({ ...variableMap, [idx]: e.target.value });
                            setIsDirty(true);
                          }}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Text */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300">Footer Text (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Apex Global Automated Enterprise System"
                  value={formData.footer_text}
                  onChange={(e) => handleFieldChange('footer_text', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Action Buttons Config */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
                <div className="text-[11px] font-semibold text-slate-300">
                  Interactive Action Buttons (Optional)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <select
                      value={buttonType}
                      onChange={(e) => {
                        setButtonType(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="NONE">No Buttons</option>
                      <option value="QUICK_REPLY">Quick Reply Button</option>
                      <option value="CTA_URL">Call To Action (URL)</option>
                    </select>
                  </div>
                  {buttonType !== 'NONE' && (
                    <>
                      <div>
                        <input
                          type="text"
                          placeholder="Button Label"
                          value={buttonText}
                          onChange={(e) => {
                            setButtonText(e.target.value);
                            setIsDirty(true);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      {buttonType === 'CTA_URL' && (
                        <div>
                          <input
                            type="text"
                            placeholder="https://..."
                            value={buttonUrl}
                            onChange={(e) => {
                              setButtonUrl(e.target.value);
                              setIsDirty(true);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Live WhatsApp Bubble Preview (5 cols) */}
            <div className="lg:col-span-5 p-5 sm:p-6 bg-slate-950/40 flex flex-col justify-start">
              <div className="text-xs font-bold text-slate-300 mb-3 flex items-center justify-between">
                <span>Live Simulated Message View</span>
                <span className="text-[10px] font-mono text-emerald-400">Meta Preview</span>
              </div>

              <div className="rounded-2xl border border-slate-800 overflow-hidden shadow-2xl bg-[#0B141A] max-w-sm mx-auto w-full">
                {/* Chat Header */}
                <div className="bg-[#202C33] px-3.5 py-2.5 flex items-center justify-between border-b border-[#2A3942]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-bold">
                      A
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white leading-tight">
                        Apex Global Official
                      </div>
                      <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Official Business Account
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400">WhatsApp</span>
                </div>

                {/* Chat Wallpaper Canvas */}
                <div className="p-3 bg-[#0B141A] min-h-[300px] flex flex-col justify-end space-y-2">
                  {/* Message Bubble */}
                  <div className="self-start max-w-[92%] bg-[#005C4B] text-white rounded-lg rounded-tl-none p-3 shadow-md space-y-1.5 relative text-xs">
                    {/* Document / Media Header Preview */}
                    {formData.header_type === 'DOCUMENT' && (
                      <div className="bg-[#025142] rounded p-2 flex items-center gap-2 border border-[#006e5a] mb-1">
                        <FileDown className="w-4 h-4 text-emerald-300" />
                        <div className="overflow-hidden">
                          <div className="font-semibold text-[11px] truncate text-emerald-100">
                            Official_Document.pdf
                          </div>
                          <div className="text-[9px] text-emerald-300">PDF • Dynamic ERP Report</div>
                        </div>
                      </div>
                    )}

                    {formData.header_type === 'TEXT' && formData.header_text && (
                      <div className="font-bold text-sm text-emerald-200 border-b border-[#006e5a] pb-1">
                        {formData.header_text}
                      </div>
                    )}

                    {/* Body Content */}
                    <div className="whitespace-pre-wrap leading-relaxed text-[11.5px] text-slate-100 font-sans">
                      {previewBody || 'Your WhatsApp message body will appear here with live dynamic values.'}
                    </div>

                    {/* Footer */}
                    {formData.footer_text && (
                      <div className="text-[10px] text-slate-300 pt-1 border-t border-[#006e5a]/60">
                        {formData.footer_text}
                      </div>
                    )}

                    {/* Timestamp & Double Checkmarks */}
                    <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-200/80 pt-0.5">
                      <span>12:45 PM</span>
                      <span>✓✓</span>
                    </div>
                  </div>

                  {/* CTA / Quick Reply Button Preview */}
                  {buttonType !== 'NONE' && (
                    <div className="self-start max-w-[92%] w-full bg-[#1F2C34] hover:bg-[#2A3942] transition rounded-lg text-center py-2 px-3 border border-[#2A3942] text-xs text-emerald-400 font-medium flex items-center justify-center gap-1.5 shadow-sm">
                      {buttonType === 'CTA_URL' && <ExternalLink className="w-3 h-3" />}
                      <span>{buttonText}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
           LIST VIEW
           ========================================================================= */
        <>
          {/* Header Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between shadow-2xs gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New WhatsApp Template</span>
              </button>

              <button
                type="button"
                onClick={handleSyncMetaStatus}
                disabled={isSyncing}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                title="Sync Approval Statuses with Meta Graph API"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                <span className="hidden sm:inline">Sync Meta</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-100 text-xs">
                  {t('whatsapp_templates')}
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {filtered.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full ps-8 pe-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={filterScope}
                onChange={(e) => setFilterScope(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 text-xs focus:outline-none"
              >
                <option value="all">All Scopes</option>
                <option value="payroll.payslip">payroll.payslip</option>
                <option value="hr.leave">hr.leave</option>
                <option value="hr.contract">hr.contract</option>
                <option value="general">general</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 text-xs focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING">Pending</option>
                <option value="DRAFT">Draft</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <button
              type="button"
              onClick={fetchTemplates}
              disabled={isLoading}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Refresh templates"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Templates Table List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold">
                    <th className="px-3.5 py-2">{t('template_code')}</th>
                    <th className="px-3.5 py-2">Category</th>
                    <th className="px-3.5 py-2">Scope</th>
                    <th className="px-3.5 py-2">{t('language')}</th>
                    <th className="px-3.5 py-2">Header</th>
                    <th className="px-3.5 py-2">{t('status_label')}</th>
                    <th className="px-3.5 py-2 text-end">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                  {isLoading && templates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-500" />
                        Loading WhatsApp Cloud API templates...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                        No WhatsApp templates found. Click "New WhatsApp Template" to create one.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => handleOpenEdit(t)}
                        className="hover:bg-slate-800/40 transition group cursor-pointer"
                      >
                        <td className="px-3.5 py-2 text-white font-semibold flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="group-hover:text-emerald-400 transition-colors">
                            {t.template_name}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-slate-300">{t.category}</td>
                        <td className="px-3.5 py-2">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {t.model_scope}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-slate-400">{t.language}</td>
                        <td className="px-3.5 py-2">
                          <span className="text-[10px] text-slate-400 uppercase">
                            {t.header_type || 'NONE'}
                          </span>
                        </td>
                        <td className="px-3.5 py-2">{renderStatusBadge(t.approval_status)}</td>
                        <td className="px-3.5 py-2 text-end font-sans">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {['DRAFT', 'REJECTED'].includes(t.approval_status) && (
                              <button
                                type="button"
                                onClick={() => handleSubmitToMeta(t)}
                                title="Submit for Meta Approval"
                                className="px-2 py-0.5 rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 transition cursor-pointer text-[10px] flex items-center gap-1"
                              >
                                <Send className="w-2.5 h-2.5" />
                                <span>Submit</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(t)}
                              title="Edit Template"
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(t)}
                              title="Delete Template"
                              className="p-1 rounded bg-slate-800 hover:bg-rose-950/40 text-rose-400 border border-slate-700 hover:border-rose-800 transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
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
