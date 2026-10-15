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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalEscape } from '../../hooks/useModalEscape';

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

export function WhatsAppTemplatesView() {
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

  // Template Builder Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Builder Form State
  const [formData, setFormData] = useState({
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
  });

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

  useModalEscape(isModalOpen, () => setIsModalOpen(false));

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

  // Extract {{1}}, {{2}} from body_text
  const detectedVariables = useMemo(() => {
    const matches = formData.body_text.match(/\{\{(\d+)\}\}/g) || [];
    const unique = Array.from(new Set(matches.map((m) => m.replace(/[\{\}]/g, ''))));
    return unique.sort((a, b) => parseInt(a) - parseInt(b));
  }, [formData.body_text]);

  // Keep variableMap updated when detected variables change
  useEffect(() => {
    setVariableMap((prev) => {
      const next = { ...prev };
      detectedVariables.forEach((num) => {
        if (!next[num]) {
          const suggestions = FIELD_SUGGESTIONS[formData.model_scope] || FIELD_SUGGESTIONS['general'];
          const defaultField = suggestions[parseInt(num) - 1]?.field || 'custom_param';
          next[num] = defaultField;
        }
      });
      return next;
    });
  }, [detectedVariables, formData.model_scope]);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormData({
      config_id: configs[0]?.id || '',
      template_name: '',
      category: 'UTILITY',
      language: 'en_US',
      model_scope: 'payroll.payslip',
      header_type: 'DOCUMENT',
      header_text: '',
      body_text: 'Dear {{1}},\n\nYour payslip for {{2}} is ready. Net payable salary: QAR {{3}}.\n\nPlease find the attached official payslip document.',
      footer_text: 'Apex Global Enterprises • Finance & Payroll',
      buttons_json: '[]',
      variable_mapping_json: '{"1": "employee_name", "2": "salary_month", "3": "net_salary_qar"}',
    });
    setButtonType('CTA_URL');
    setButtonText('Access ESS Portal');
    setButtonUrl('https://erp.apexglobal.qa');
    setVariableMap({ '1': 'employee_name', '2': 'salary_month', '3': 'net_salary_qar' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTemplate(t);
    let parsedBtns = [];
    try {
      parsedBtns = JSON.parse(t.buttons_json || '[]');
    } catch (e) {}

    let bType = 'NONE';
    let bText = 'View In Portal';
    let bUrl = 'https://erp.apexglobal.qa';
    if (parsedBtns.length > 0) {
      const b = parsedBtns[0];
      if (b.type === 'URL') {
        bType = 'CTA_URL';
        bText = b.text || 'Open Link';
        bUrl = b.url || 'https://erp.apexglobal.qa';
      } else if (b.type === 'QUICK_REPLY') {
        bType = 'QUICK_REPLY';
        bText = b.text || 'Confirm';
      }
    }

    let parsedVars = {};
    try {
      parsedVars = JSON.parse(t.variable_mapping_json || '{}');
    } catch (e) {}

    setFormData({
      config_id: t.config_id || '',
      template_name: t.template_name || '',
      category: t.category || 'UTILITY',
      language: t.language || 'en_US',
      model_scope: t.model_scope || 'general',
      header_type: t.header_type || 'NONE',
      header_text: t.header_text || '',
      body_text: t.body_text || '',
      footer_text: t.footer_text || '',
      buttons_json: t.buttons_json || '[]',
      variable_mapping_json: t.variable_mapping_json || '{}',
    });
    setButtonType(bType);
    setButtonText(bText);
    setButtonUrl(bUrl);
    setVariableMap(parsedVars);
    setIsModalOpen(true);
  };

  const handleInsertVariable = () => {
    const nextNum = detectedVariables.length + 1;
    setFormData((prev) => ({
      ...prev,
      body_text: prev.body_text + ` {{${nextNum}}}`,
    }));
  };

  const handleSaveTemplate = async (submitAfterSave = false) => {
    if (!formData.template_name.trim()) {
      setActionMessage({ type: 'error', text: 'Template Name is required.' });
      return;
    }
    if (!isNameSnakeCase) {
      setActionMessage({ type: 'error', text: 'Template Name must be lowercase snake_case (e.g. payslip_notice_v1).' });
      return;
    }
    if (!formData.body_text.trim()) {
      setActionMessage({ type: 'error', text: 'Body text is required.' });
      return;
    }

    // Assemble buttons JSON
    let assembledBtns = [];
    if (buttonType === 'CTA_URL') {
      assembledBtns = [{ type: 'URL', text: buttonText, url: buttonUrl }];
    } else if (buttonType === 'QUICK_REPLY') {
      assembledBtns = [{ type: 'QUICK_REPLY', text: buttonText }];
    }

    const payload = {
      ...formData,
      buttons_json: JSON.stringify(assembledBtns),
      variable_mapping_json: JSON.stringify(variableMap),
    };

    setIsSaving(true);
    try {
      const url = editingTemplate
        ? `/api/v1/communication/whatsapp-templates/${editingTemplate.id}`
        : '/api/v1/communication/whatsapp-templates';
      const method = editingTemplate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save template.');
      }

      const resData = await res.json();
      const targetId = editingTemplate ? editingTemplate.id : resData.id;

      if (submitAfterSave && targetId) {
        const subRes = await fetch(`/api/v1/communication/whatsapp-templates/${targetId}/submit-to-meta`, {
          method: 'POST',
          headers: getHeaders(),
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          setActionMessage({
            type: 'success',
            text: `Template saved and submitted to Meta (${subData.approval_status || 'PENDING'}).`,
          });
        } else {
          const subErr = await subRes.json();
          setActionMessage({
            type: 'error',
            text: `Template saved, but Meta submission failed: ${subErr.detail}`,
          });
        }
      } else {
        setActionMessage({
          type: 'success',
          text: editingTemplate ? 'Template updated successfully.' : 'Draft template created.',
        });
      }

      setIsModalOpen(false);
      fetchTemplates();
    } catch (e) {
      setActionMessage({ type: 'error', text: e.message || 'Error saving template.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitToMeta = async (tmpl) => {
    try {
      const res = await fetch(`/api/v1/communication/whatsapp-templates/${tmpl.id}/submit-to-meta`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setActionMessage({
          type: 'success',
          text: `Template "${tmpl.template_name}" submitted to Meta: Status is now ${data.approval_status || 'PENDING'}.`,
        });
        fetchTemplates();
      } else {
        const err = await res.json();
        setActionMessage({ type: 'error', text: err.detail || 'Meta submission failed.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Network error submitting to Meta.' });
    }
  };

  const handleSyncFromMeta = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/v1/communication/whatsapp-templates/sync', {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setActionMessage({ type: 'success', text: data.message || 'Templates synchronized with Meta.' });
        fetchTemplates();
      } else {
        const err = await res.json();
        setActionMessage({ type: 'error', text: err.detail || 'Failed to sync with Meta.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Network error during Meta template sync.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (tmpl) => {
    if (!window.confirm(`Are you sure you want to delete template "${tmpl.template_name}"?`)) return;
    try {
      const res = await fetch(`/api/v1/communication/whatsapp-templates/${tmpl.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        setActionMessage({ type: 'success', text: `Template "${tmpl.template_name}" deleted.` });
        fetchTemplates();
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Failed to delete template.' });
    }
  };

  // Preview formatted text with sample values
  const previewBody = useMemo(() => {
    let text = formData.body_text || '';
    detectedVariables.forEach((num) => {
      const boundField = variableMap[num] || `var_${num}`;
      text = text.replace(new RegExp(`\\{\\{${num}\\}\\}`, 'g'), `[${boundField}]`);
    });
    return text;
  }, [formData.body_text, detectedVariables, variableMap]);

  // Filtered Templates List
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (filterScope !== 'all' && t.model_scope !== filterScope) return false;
      if (filterStatus !== 'all' && t.approval_status !== filterStatus) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          t.template_name?.toLowerCase().includes(q) ||
          t.body_text?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [templates, filterScope, filterStatus, search]);

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 animate-spin" />
            Pending Review
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-slate-800 text-slate-400 border border-slate-700">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between p-3 rounded-lg text-xs font-medium border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Control Strip */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                Meta WhatsApp Message Templates
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Cloud Approval Workflow
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Create, test, and synchronize pre-approved WhatsApp Business templates with Meta Cloud API.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-40 sm:w-48 bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All Scopes</option>
              <option value="payroll.payslip">Payroll Payslips</option>
              <option value="hr.leave">HR Leaves</option>
              <option value="hr.contract">HR Contracts</option>
              <option value="general">General</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending Review</option>
              <option value="DRAFT">Draft</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <button
              onClick={handleSyncFromMeta}
              disabled={isSyncing}
              title="Sync template approval statuses from Meta"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs font-medium transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync from Meta</span>
            </button>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Template</span>
            </button>
          </div>
        </div>
      </div>

      {/* Odoo-Style High Density Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-semibold h-8">
                <th className="px-3.5 py-1.5">Template Identifier</th>
                <th className="px-3.5 py-1.5">Category</th>
                <th className="px-3.5 py-1.5">Model Scope</th>
                <th className="px-3.5 py-1.5">Language</th>
                <th className="px-3.5 py-1.5">Header Type</th>
                <th className="px-3.5 py-1.5">Meta Status</th>
                <th className="px-3.5 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500 font-sans">
                    {isLoading ? 'Loading templates...' : 'No WhatsApp message templates match your filter.'}
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-800/40 transition-colors h-[32px] text-slate-300"
                  >
                    <td className="px-3.5 py-1 font-sans text-xs font-medium text-white flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-mono text-emerald-300">{t.template_name}</span>
                    </td>
                    <td className="px-3.5 py-1 font-sans text-[11px] text-slate-300">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                        {t.category}
                      </span>
                    </td>
                    <td className="px-3.5 py-1 font-sans text-[11px] text-slate-400">
                      {t.model_scope}
                    </td>
                    <td className="px-3.5 py-1 text-slate-300 font-sans">{t.language}</td>
                    <td className="px-3.5 py-1 font-sans">
                      <span className="text-[10px] text-slate-400 uppercase">
                        {t.header_type || 'NONE'}
                      </span>
                    </td>
                    <td className="px-3.5 py-1">{renderStatusBadge(t.approval_status)}</td>
                    <td className="px-3.5 py-1 text-right font-sans">
                      <div className="flex items-center justify-end gap-1">
                        {['DRAFT', 'REJECTED'].includes(t.approval_status) && (
                          <button
                            onClick={() => handleSubmitToMeta(t)}
                            title="Submit for Meta Approval"
                            className="px-2 py-0.5 rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 transition cursor-pointer text-[10px] flex items-center gap-1"
                          >
                            <Send className="w-2.5 h-2.5" />
                            <span>Submit</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(t)}
                          title="Edit Template"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
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

      {/* Template Builder Modal with Live WhatsApp Bubble Preview */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  {editingTemplate ? `Edit Template: ${editingTemplate.template_name}` : 'WhatsApp Template Builder'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Two-Column Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
              {/* Left Column: Form Builder Controls (7 cols) */}
              <div className="lg:col-span-7 p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        setFormData({ ...formData, template_name: e.target.value.toLowerCase().replace(/\s+/g, '_') })
                      }
                      className={`w-full bg-slate-950 border rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none transition ${
                        isNameSnakeCase ? 'border-slate-800 focus:border-emerald-500' : 'border-rose-500'
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                      onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                      onChange={(e) => setFormData({ ...formData, model_scope: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                      onChange={(e) => setFormData({ ...formData, header_type: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="NONE">None</option>
                      <option value="DOCUMENT">Document (PDF attachment)</option>
                      <option value="TEXT">Text Heading</option>
                      <option value="IMAGE">Image Header</option>
                    </select>
                  </div>

                  {formData.header_type === 'TEXT' && (
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-medium text-slate-300">
                        Header Text (Max 60 chars)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        placeholder="e.g. Official Payslip Delivery Notice"
                        value={formData.header_text}
                        onChange={(e) => setFormData({ ...formData, header_text: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>

                {/* Body Text & Variable Builder */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-slate-300">
                      Message Body <span className="text-rose-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleInsertVariable}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Insert Variable Chip ({`{{${detectedVariables.length + 1}}}`})</span>
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    required
                    value={formData.body_text}
                    onChange={(e) => setFormData({ ...formData, body_text: e.target.value })}
                    placeholder="Enter message body. Use {{1}}, {{2}} for dynamic record variables..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* ERP Variable Field Mappings */}
                {detectedVariables.length > 0 && (
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                        ERP Field Bindings for Meta Placeholders
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {detectedVariables.length} variable(s) found
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {detectedVariables.map((num) => (
                        <div key={num} className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded px-2.5 py-1">
                          <span className="text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                            {`{{${num}}}`}
                          </span>
                          <span className="text-slate-500 text-[10px]">=</span>
                          <select
                            value={variableMap[num] || ''}
                            onChange={(e) =>
                              setVariableMap({ ...variableMap, [num]: e.target.value })
                            }
                            className="w-full bg-transparent text-[11px] text-white focus:outline-none cursor-pointer"
                          >
                            {(FIELD_SUGGESTIONS[formData.model_scope] || FIELD_SUGGESTIONS['general']).map((s) => (
                              <option key={s.field} value={s.field} className="bg-slate-900 text-white">
                                {s.label} ({s.field})
                              </option>
                            ))}
                            <option value="custom_value" className="bg-slate-900 text-white">
                              Custom Parameter
                            </option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer and Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">
                      Footer Text (Optional, max 60 chars)
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      placeholder="e.g. Apex Global Enterprises"
                      value={formData.footer_text}
                      onChange={(e) => setFormData({ ...formData, footer_text: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">CTA Button</label>
                    <select
                      value={buttonType}
                      onChange={(e) => setButtonType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="NONE">No Button</option>
                      <option value="CTA_URL">Call-to-Action (URL Button)</option>
                      <option value="QUICK_REPLY">Quick Reply Button</option>
                    </select>
                  </div>

                  {buttonType !== 'NONE' && (
                    <div className="space-y-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Button Label</label>
                        <input
                          type="text"
                          value={buttonText}
                          onChange={(e) => setButtonText(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      {buttonType === 'CTA_URL' && (
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Destination URL</label>
                          <input
                            type="text"
                            value={buttonUrl}
                            onChange={(e) => setButtonUrl(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Live WhatsApp Mobile Screen Mockup (5 cols) */}
              <div className="lg:col-span-5 p-4 sm:p-5 bg-slate-950/50 flex flex-col items-center justify-center">
                <div className="w-full max-w-sm rounded-2xl bg-slate-950 border-2 border-slate-800 shadow-2xl overflow-hidden flex flex-col">
                  {/* Mock WhatsApp Top Bar */}
                  <div className="bg-[#1F2C34] px-3.5 py-2.5 flex items-center justify-between border-b border-[#2A3942]">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                        A
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white leading-tight">
                          Apex Global Official
                        </div>
                        <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Official Business Account
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400">WhatsApp</span>
                  </div>

                  {/* Chat Wallpaper Canvas */}
                  <div className="p-3 bg-[#0B141A] min-h-[300px] flex flex-col justify-end space-y-2">
                    {/* Message Bubble */}
                    <div className="self-start max-w-[90%] bg-[#005C4B] text-white rounded-lg rounded-tl-none p-3 shadow-md space-y-1.5 relative text-xs">
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
                      <div className="self-start max-w-[90%] w-full bg-[#1F2C34] hover:bg-[#2A3942] transition rounded-lg text-center py-2 px-3 border border-[#2A3942] text-xs text-emerald-400 font-medium flex items-center justify-center gap-1.5 shadow-sm">
                        {buttonType === 'CTA_URL' && <ExternalLink className="w-3 h-3" />}
                        <span>{buttonText}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-center">
                  <p className="text-[11px] text-slate-400 font-mono">
                    Live Meta Cloud API message preview
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Bottom Action Strip */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {isNameSnakeCase ? 'Ready to save' : 'Please resolve naming warnings'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isSaving || !isNameSnakeCase}
                  onClick={() => handleSaveTemplate(false)}
                  className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>Save Draft</span>
                </button>

                <button
                  type="button"
                  disabled={isSaving || !isNameSnakeCase}
                  onClick={() => handleSaveTemplate(true)}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Save &amp; Submit to Meta</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
