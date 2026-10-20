import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Zap,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit2,
  X,
  MessageCircle,
  Smartphone,
  Sliders,
  Check,
  Power,
  Play,
  Layers,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const EVENT_TYPE_LABELS = {
  leave_approved: 'Leave Request Approved',
  leave_rejected: 'Leave Request Rejected',
  payslip_confirmed: 'Payslip Confirmed (Individual)',
  payroll_batch_locked: 'Payroll Batch Finalized & Locked',
  document_expiry: 'QID / Visa / Passport Expiry Alert',
};

const DEFAULT_NEW_FORM = {
  name: '',
  event_type: 'leave_approved',
  channel: 'whatsapp',
  whatsapp_template_id: '',
  sms_gateway_id: '',
  sms_body_template: 'Apex Global: Dear {{employee_name}}, your request has been updated to {{status}}.',
  active: true,
};

export function AutomationTriggersView() {
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [triggers, setTriggers] = useState([]);
  const [whatsappTemplates, setWhatsappTemplates] = useState([]);
  const [smsGateways, setSmsGateways] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState(null);

  // Standard in-place view mode
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'form'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_NEW_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [trRes, wtRes, sgRes] = await Promise.all([
        fetch('/api/v1/communication/automation-triggers', { headers: getHeaders() }),
        fetch('/api/v1/communication/whatsapp-templates', { headers: getHeaders() }),
        fetch('/api/v1/communication/sms-gateways', { headers: getHeaders() }),
      ]);
      if (trRes.ok) {
        const d = await trRes.json();
        setTriggers(d.triggers || []);
      }
      if (wtRes.ok) {
        const d = await wtRes.json();
        setWhatsappTemplates(d.templates || []);
      }
      if (sgRes.ok) {
        const d = await sgRes.json();
        setSmsGateways(d.gateways || []);
      }
    } catch (e) {
      console.error('Failed to load automation trigger data:', e);
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const filtered = useMemo(() => {
    return triggers.filter((t) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        t.name?.toLowerCase().includes(q) ||
        t.event_type?.toLowerCase().includes(q) ||
        t.channel?.toLowerCase().includes(q)
      );
    });
  }, [triggers, search]);

  // Record Pager resolution
  const currentRecordIndex = useMemo(() => {
    if (!selectedRecord) return -1;
    return filtered.findIndex((t) => t.id === selectedRecord.id);
  }, [selectedRecord, filtered]);

  const loadRecordIntoForm = useCallback((t) => {
    setSelectedRecord(t);
    setFormData({
      name: t.name || '',
      event_type: t.event_type || 'leave_approved',
      channel: t.channel || 'whatsapp',
      whatsapp_template_id: t.whatsapp_template_id || '',
      sms_gateway_id: t.sms_gateway_id || '',
      sms_body_template: t.sms_body_template || '',
      active: t.active !== false,
    });
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
      whatsapp_template_id: whatsappTemplates[0]?.id || '',
      sms_gateway_id: smsGateways[0]?.id || '',
    });
    setIsDirty(false);
    setViewMode('form');
  };

  const handleOpenEdit = (t) => {
    loadRecordIntoForm(t);
    setViewMode('form');
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSaveTrigger = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) {
      setActionMessage({ type: 'error', text: 'Trigger Name is required.' });
      return;
    }
    if (formData.channel === 'whatsapp' && !formData.whatsapp_template_id) {
      setActionMessage({ type: 'error', text: 'Please select a WhatsApp Template.' });
      return;
    }

    setIsSaving(true);
    try {
      const url = selectedRecord
        ? `/api/v1/communication/automation-triggers/${selectedRecord.id}`
        : '/api/v1/communication/automation-triggers';
      const method = selectedRecord ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save automation trigger');
      }

      const resData = await res.json();
      const updated = resData.trigger || { ...formData, id: selectedRecord?.id || Date.now() };
      setSelectedRecord(updated);
      setIsDirty(false);
      setActionMessage({
        type: 'success',
        text: selectedRecord ? 'Automation trigger updated.' : 'New automation trigger registered.',
      });
      fetchAllData();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
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

  const handleToggleActive = async (trigger) => {
    try {
      const res = await fetch(`/api/v1/communication/automation-triggers/${trigger.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          active: !trigger.active,
        }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      setActionMessage({
        type: 'success',
        text: `Trigger "${trigger.name}" ${!trigger.active ? 'activated' : 'deactivated'}.`,
      });
      fetchAllData();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async (trigger) => {
    if (!window.confirm(`Delete trigger "${trigger.name}"?`)) return;
    try {
      const res = await fetch(`/api/v1/communication/automation-triggers/${trigger.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Delete failed');
      setActionMessage({ type: 'success', text: `Trigger "${trigger.name}" deleted.` });
      fetchAllData();
      if (selectedRecord?.id === trigger.id) {
        setViewMode('list');
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
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
            className="text-slate-400 hover:text-white cursor-pointer ml-3"
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
          <div className="sticky top-14 z-10 bg-slate-900/95 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            {/* Left: Back Button & Breadcrumbs */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDiscard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition cursor-pointer text-xs font-semibold"
                title="Back to Triggers list"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Triggers</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">System Configuration</span>
                <span className="text-slate-700">/</span>
                <span className="text-slate-400">Automation Triggers</span>
                <span className="text-slate-700">/</span>
                <span className="font-bold text-white truncate max-w-[200px]">
                  {formData.name || 'New Trigger'}
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

            {/* Right: Discard & Save */}
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
                onClick={handleSaveTrigger}
                disabled={isSaving || (selectedRecord && !isDirty)}
                className={`px-4 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs ${
                  isSaving || (selectedRecord && !isDirty)
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                <span>{selectedRecord ? 'Save Changes' : 'Create Trigger'}</span>
              </button>
            </div>
          </div>

          {/* Form Body Canvas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xs">
            <form onSubmit={handleSaveTrigger} className="space-y-5 text-xs max-w-3xl mx-auto">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Trigger Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Leave Approval WhatsApp Alert"
                  value={formData.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">ERP Event Hook</label>
                  <select
                    value={formData.event_type}
                    onChange={(e) => handleFieldChange('event_type', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="leave_approved">Leave Request Approved</option>
                    <option value="leave_rejected">Leave Request Rejected</option>
                    <option value="payslip_confirmed">Payslip Confirmed</option>
                    <option value="payroll_batch_locked">Payroll Batch Locked (Batch PDF)</option>
                    <option value="document_expiry">Document Expiry Alert</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Dispatch Channel</label>
                  <select
                    value={formData.channel}
                    onChange={(e) => handleFieldChange('channel', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="whatsapp">WhatsApp (Meta Cloud API)</option>
                    <option value="sms">SMS Gateway</option>
                  </select>
                </div>
              </div>

              {formData.channel === 'whatsapp' ? (
                <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <label className="text-[11px] font-medium text-slate-300">
                    Approved WhatsApp Template <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formData.whatsapp_template_id}
                    onChange={(e) => handleFieldChange('whatsapp_template_id', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  >
                    <option value="">-- Select Template --</option>
                    {whatsappTemplates.map((wt) => (
                      <option key={wt.id} value={wt.id}>
                        {wt.template_name} ({wt.approval_status} • {wt.model_scope})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500">
                    Only Meta-approved templates can be dispatched automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">SMS Gateway</label>
                    <select
                      value={formData.sms_gateway_id}
                      onChange={(e) => handleFieldChange('sms_gateway_id', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Use Default SMS Gateway --</option>
                      {smsGateways.map((gw) => (
                        <option key={gw.id} value={gw.id}>
                          {gw.name} ({gw.provider_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">
                      SMS Body Template
                    </label>
                    <textarea
                      rows={3}
                      value={formData.sms_body_template}
                      onChange={(e) => handleFieldChange('sms_body_template', e.target.value)}
                      placeholder="Use {{employee_name}}, {{status}}, {{month}}, {{net_salary}}..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => handleFieldChange('active', e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Active (Trigger fires automatically on lifecycle events)</span>
                </label>
              </div>
            </form>
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
                <span>New Automation Trigger</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-100 text-xs">
                  Automation Triggers
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {filtered.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search triggers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={fetchAllData}
              disabled={isLoading}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Refresh triggers"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Triggers Table List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold">
                    <th className="px-3.5 py-2">Trigger Name</th>
                    <th className="px-3.5 py-2">Lifecycle Event</th>
                    <th className="px-3.5 py-2">Channel</th>
                    <th className="px-3.5 py-2">Configured Payload</th>
                    <th className="px-3.5 py-2">Status</th>
                    <th className="px-3.5 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                  {isLoading && triggers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400 font-sans">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-500" />
                        Loading automation triggers...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400 font-sans">
                        No automation triggers found. Click "New Automation Trigger" to register an alert rule.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => handleOpenEdit(t)}
                        className="hover:bg-slate-800/40 transition group cursor-pointer"
                      >
                        <td className="px-3.5 py-2 text-white font-semibold flex items-center gap-1.5 font-sans">
                          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="group-hover:text-amber-400 transition-colors">
                            {t.name}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-slate-300 font-sans text-xs">
                          {EVENT_TYPE_LABELS[t.event_type] || t.event_type}
                        </td>
                        <td className="px-3.5 py-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                              t.channel === 'whatsapp'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}
                          >
                            {t.channel === 'whatsapp' ? (
                              <MessageCircle className="w-3 h-3" />
                            ) : (
                              <Smartphone className="w-3 h-3" />
                            )}
                            <span className="uppercase">{t.channel}</span>
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-slate-400 truncate max-w-xs">
                          {t.channel === 'whatsapp'
                            ? `Template: ${t.whatsapp_template_name || t.whatsapp_template_id || '—'}`
                            : `SMS Template: ${t.sms_body_template || '—'}`}
                        </td>
                        <td className="px-3.5 py-2 font-sans">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleActive(t);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                              t.active
                                ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                            }`}
                          >
                            <Power className="w-2.5 h-2.5" />
                            <span>{t.active ? 'Active' : 'Disabled'}</span>
                          </button>
                        </td>
                        <td className="px-3.5 py-2 text-right font-sans">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(t)}
                              title="Edit Trigger"
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(t)}
                              title="Delete Trigger"
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
