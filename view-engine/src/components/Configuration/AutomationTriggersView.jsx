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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalEscape } from '../../hooks/useModalEscape';

const EVENT_TYPE_LABELS = {
  leave_approved: 'Leave Request Approved',
  leave_rejected: 'Leave Request Rejected',
  payslip_confirmed: 'Payslip Confirmed (Individual)',
  payroll_batch_locked: 'Payroll Batch Finalized & Locked',
  document_expiry: 'QID / Visa / Passport Expiry Alert',
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

  // Edit / Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    event_type: 'leave_approved',
    channel: 'whatsapp',
    whatsapp_template_id: '',
    sms_gateway_id: '',
    sms_body_template: '',
    active: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  useModalEscape(isModalOpen, () => setIsModalOpen(false));

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

  const handleOpenCreate = () => {
    setEditingTrigger(null);
    setFormData({
      name: '',
      event_type: 'leave_approved',
      channel: 'whatsapp',
      whatsapp_template_id: whatsappTemplates[0]?.id || '',
      sms_gateway_id: smsGateways[0]?.id || '',
      sms_body_template: 'Apex Global: Dear {{employee_name}}, your request has been updated to {{status}}.',
      active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTrigger(t);
    setFormData({
      name: t.name || '',
      event_type: t.event_type || 'leave_approved',
      channel: t.channel || 'whatsapp',
      whatsapp_template_id: t.whatsapp_template_id || '',
      sms_gateway_id: t.sms_gateway_id || '',
      sms_body_template: t.sms_body_template || '',
      active: t.active !== false,
    });
    setIsModalOpen(true);
  };

  const handleSaveTrigger = async (e) => {
    e.preventDefault();
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
      const url = editingTrigger
        ? `/api/v1/communication/automation-triggers/${editingTrigger.id}`
        : '/api/v1/communication/automation-triggers';
      const method = editingTrigger ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: editingTrigger ? 'Automation trigger updated.' : 'Automation trigger created.',
        });
        setIsModalOpen(false);
        fetchAllData();
      } else {
        const err = await res.json();
        setActionMessage({ type: 'error', text: err.detail || 'Failed to save trigger.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Network error saving trigger.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete automation trigger "${t.name}"?`)) return;
    try {
      const res = await fetch(`/api/v1/communication/automation-triggers/${t.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        setActionMessage({ type: 'success', text: `Trigger "${t.name}" deleted.` });
        fetchAllData();
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Failed to delete trigger.' });
    }
  };

  const filteredTriggers = useMemo(() => {
    if (!search.trim()) return triggers;
    const q = search.toLowerCase();
    return triggers.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.event_type?.toLowerCase().includes(q) ||
        t.whatsapp_template_name?.toLowerCase().includes(q)
    );
  }, [triggers, search]);

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
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

      {/* Header & Control Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                Automated Event Notification Triggers
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  ERP Lifecycle Hooks
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Automatically dispatch approved WhatsApp templates or SMS when payroll is locked or leaves are approved.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search triggers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 sm:w-60 bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <button
              onClick={fetchAllData}
              disabled={isLoading}
              title="Refresh"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Trigger Rule</span>
            </button>
          </div>
        </div>
      </div>

      {/* Odoo Compact High-Density Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-semibold h-8">
                <th className="px-3.5 py-1.5">Rule Name</th>
                <th className="px-3.5 py-1.5">ERP Event Hook</th>
                <th className="px-3.5 py-1.5">Dispatch Channel</th>
                <th className="px-3.5 py-1.5">Bound Template / Gateway</th>
                <th className="px-3.5 py-1.5">Status</th>
                <th className="px-3.5 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {filteredTriggers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-500 font-sans">
                    {isLoading ? 'Loading triggers...' : 'No automated notification triggers configured.'}
                  </td>
                </tr>
              ) : (
                filteredTriggers.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-800/40 transition-colors h-[32px] text-slate-300"
                  >
                    <td className="px-3.5 py-1 font-sans text-xs font-medium text-white flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{t.name}</span>
                    </td>
                    <td className="px-3.5 py-1 font-sans">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px]">
                        {EVENT_TYPE_LABELS[t.event_type] || t.event_type}
                      </span>
                    </td>
                    <td className="px-3.5 py-1 font-sans">
                      {t.channel === 'whatsapp' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                          <MessageCircle className="w-3 h-3" />
                          WhatsApp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-semibold">
                          <Smartphone className="w-3 h-3" />
                          SMS
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-1 text-slate-300">
                      {t.channel === 'whatsapp' ? (
                        <span className="text-emerald-400 font-mono">
                          {t.whatsapp_template_name || 'Template Bound'}
                        </span>
                      ) : (
                        <span className="text-sky-400 font-sans">
                          {t.sms_gateway_name || 'Default SMS Gateway'}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-1 font-sans">
                      {t.active ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400">
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-1 text-right font-sans">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(t)}
                          title="Edit Trigger"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
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

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  {editingTrigger ? 'Edit Notification Trigger' : 'New Automated Notification Trigger'}
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

            <form onSubmit={handleSaveTrigger} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Trigger Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Leave Approval WhatsApp Alert"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">ERP Event Hook</label>
                  <select
                    value={formData.event_type}
                    onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                    onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="whatsapp">WhatsApp (Meta Cloud API)</option>
                    <option value="sms">SMS Gateway</option>
                  </select>
                </div>
              </div>

              {formData.channel === 'whatsapp' ? (
                <div className="space-y-1 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <label className="text-[11px] font-medium text-slate-300">
                    Approved WhatsApp Template <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formData.whatsapp_template_id}
                    onChange={(e) => setFormData({ ...formData, whatsapp_template_id: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
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
                <div className="space-y-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">SMS Gateway</label>
                    <select
                      value={formData.sms_gateway_id}
                      onChange={(e) => setFormData({ ...formData, sms_gateway_id: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                      onChange={(e) => setFormData({ ...formData, sms_body_template: e.target.value })}
                      placeholder="Use {{employee_name}}, {{status}}, {{month}}, {{net_salary}}..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>Active (Trigger fires automatically on lifecycle events)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Trigger</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
