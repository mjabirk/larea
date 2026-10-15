import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit2,
  Send,
  X,
  Server,
  Radio,
  Sliders,
  Check,
  Globe,
  ExternalLink,
  Eye,
  EyeOff,
  ShieldCheck,
  Smartphone,
  PhoneCall,
  Key,
  Hash,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalEscape } from '../../hooks/useModalEscape';

export function WhatsAppConfigsView() {
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [configs, setConfigs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState(null);

  // Edit / Create Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    waba_id: '',
    phone_number_id: '',
    business_phone_number: '',
    access_token: '',
    webhook_verify_token: 'apex_enterprise_webhook_token_2026',
    api_version: 'v20.0',
    is_default: false,
    active: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Test Connection Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testConfig, setTestConfig] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useModalEscape(isEditModalOpen, () => setIsEditModalOpen(false));
  useModalEscape(isTestModalOpen, () => setIsTestModalOpen(false));

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  const fetchConfigs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/communication/whatsapp-configs', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } catch (e) {
      console.error('Failed to load WhatsApp configurations:', e);
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleOpenCreate = () => {
    setEditingConfig(null);
    setShowToken(false);
    setFormData({
      name: '',
      waba_id: '',
      phone_number_id: '',
      business_phone_number: '+974 4400 0000',
      access_token: '',
      webhook_verify_token: 'apex_enterprise_webhook_token_2026',
      api_version: 'v20.0',
      is_default: configs.length === 0,
      active: true,
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (cfg) => {
    setEditingConfig(cfg);
    setShowToken(false);
    setFormData({
      name: cfg.name || '',
      waba_id: cfg.waba_id || '',
      phone_number_id: cfg.phone_number_id || '',
      business_phone_number: cfg.business_phone_number || '',
      access_token: '', // Kept empty unless changed
      webhook_verify_token: cfg.webhook_verify_token || 'apex_enterprise_webhook_token_2026',
      api_version: cfg.api_version || 'v20.0',
      is_default: !!cfg.is_default,
      active: cfg.active !== false,
    });
    setIsEditModalOpen(true);
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.waba_id.trim() || !formData.phone_number_id.trim()) {
      setActionMessage({ type: 'error', text: 'Name, WABA ID, and Phone Number ID are required.' });
      return;
    }

    setIsSaving(true);
    try {
      const url = editingConfig
        ? `/api/v1/communication/whatsapp-configs/${editingConfig.id}`
        : '/api/v1/communication/whatsapp-configs';
      const method = editingConfig ? 'PUT' : 'POST';

      const payload = { ...formData };
      if (editingConfig && !payload.access_token) {
        delete payload.access_token;
      }

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: editingConfig ? 'WhatsApp configuration updated.' : 'WhatsApp configuration created.',
        });
        setIsEditModalOpen(false);
        fetchConfigs();
      } else {
        const err = await res.json();
        setActionMessage({ type: 'error', text: err.detail || 'Failed to save configuration.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Network error saving configuration.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (cfgId, name) => {
    if (!window.confirm(`Are you sure you want to delete WhatsApp Account "${name}"? Templates bound to this account may be affected.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/communication/whatsapp-configs/${cfgId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        setActionMessage({ type: 'success', text: `Account "${name}" deleted.` });
        fetchConfigs();
      } else {
        const err = await res.json();
        setActionMessage({ type: 'error', text: err.detail || 'Failed to delete configuration.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Error deleting configuration.' });
    }
  };

  const handleOpenTest = (cfg) => {
    setTestConfig(cfg);
    setTestResult(null);
    setIsTestModalOpen(true);
  };

  const handleRunTest = async () => {
    if (!testConfig) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/communication/whatsapp-configs/${testConfig.id}/test`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({
        success: false,
        status: 'error',
        message: 'Network error executing Meta handshake test.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const filteredConfigs = useMemo(() => {
    if (!search.trim()) return configs;
    const q = search.toLowerCase();
    return configs.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.waba_id?.toLowerCase().includes(q) ||
        c.phone_number_id?.toLowerCase().includes(q) ||
        c.business_phone_number?.toLowerCase().includes(q)
    );
  }, [configs, search]);

  return (
    <div className="space-y-4">
      {/* Action Notification Toast */}
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

      {/* Header and Control Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                WhatsApp Business Accounts (Meta Cloud API)
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Cloud API v20.0
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Manage Meta WhatsApp Business Account (WABA) credentials, phone numbers, and webhook tokens.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search accounts or WABA..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 sm:w-64 bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <button
              onClick={fetchConfigs}
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
              <span>Add WhatsApp Account</span>
            </button>
          </div>
        </div>
      </div>

      {/* Compact High-Density Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-semibold h-8">
                <th className="px-3.5 py-1.5">Account / Display Name</th>
                <th className="px-3.5 py-1.5">Business Phone Number</th>
                <th className="px-3.5 py-1.5">Phone Number ID</th>
                <th className="px-3.5 py-1.5">WABA ID</th>
                <th className="px-3.5 py-1.5">Graph API</th>
                <th className="px-3.5 py-1.5">Status</th>
                <th className="px-3.5 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {filteredConfigs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500 font-sans">
                    {isLoading ? 'Loading WhatsApp accounts...' : 'No WhatsApp Business accounts configured.'}
                  </td>
                </tr>
              ) : (
                filteredConfigs.map((cfg) => (
                  <tr
                    key={cfg.id}
                    className="hover:bg-slate-800/40 transition-colors h-[32px] text-slate-300"
                  >
                    <td className="px-3.5 py-1 font-sans text-xs font-medium text-white flex items-center gap-2">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{cfg.name}</span>
                      {cfg.is_default && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] uppercase font-mono font-bold tracking-tight">
                          DEFAULT
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-1 text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <PhoneCall className="w-3 h-3 text-slate-500" />
                        {cfg.business_phone_number || '—'}
                      </span>
                    </td>
                    <td className="px-3.5 py-1 text-slate-400">{cfg.phone_number_id}</td>
                    <td className="px-3.5 py-1 text-slate-400">{cfg.waba_id}</td>
                    <td className="px-3.5 py-1 text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                        {cfg.api_version || 'v20.0'}
                      </span>
                    </td>
                    <td className="px-3.5 py-1">
                      {cfg.active ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-sans">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-1 text-right font-sans">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenTest(cfg)}
                          title="Test Meta Handshake"
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-900/40 text-emerald-300 hover:text-emerald-200 border border-slate-700 hover:border-emerald-700/60 transition cursor-pointer text-[10px] flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>Test Meta</span>
                        </button>
                        <button
                          onClick={() => handleOpenEdit(cfg)}
                          title="Edit Account"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(cfg.id, cfg.name)}
                          title="Delete Account"
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
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">
                  {editingConfig ? 'Edit WhatsApp Business Account' : 'New WhatsApp Business Account'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveConfig} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-300">
                    Configuration Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Corporate Meta Cloud Account"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">
                    WABA ID (WhatsApp Business Account) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 109283746501928"
                    value={formData.waba_id}
                    onChange={(e) => setFormData({ ...formData, waba_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">
                    Phone Number ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 108392019283746"
                    value={formData.phone_number_id}
                    onChange={(e) => setFormData({ ...formData, phone_number_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">
                    Display Phone Number (E.164)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +974 4400 0000"
                    value={formData.business_phone_number}
                    onChange={(e) => setFormData({ ...formData, business_phone_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">
                    Graph API Version
                  </label>
                  <input
                    type="text"
                    placeholder="v20.0"
                    value={formData.api_version}
                    onChange={(e) => setFormData({ ...formData, api_version: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-slate-300">
                      System User Permanent Access Token {editingConfig && <span className="text-slate-500">(Leave blank to keep existing)</span>}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showToken ? 'Hide' : 'Reveal'}</span>
                    </button>
                  </div>
                  <input
                    type={showToken ? 'text' : 'password'}
                    placeholder={editingConfig ? '••••••••••••••••••••••••••••' : 'EAAG... Permanent System User Token'}
                    value={formData.access_token}
                    onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Stored AES-256 encrypted. Tokens starting with <code className="text-emerald-400">EAAGmock</code> activate internal test simulation.
                  </p>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-300">
                    Webhook Verification Token
                  </label>
                  <input
                    type="text"
                    value={formData.webhook_verify_token}
                    onChange={(e) => setFormData({ ...formData, webhook_verify_token: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Configured in Meta Developer App &gt; Webhooks &gt; WhatsApp Business Account.
                  </p>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="pt-2 flex items-center gap-6 border-t border-slate-800/80">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>Set as Default WhatsApp Channel</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>Active</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
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
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Meta Connection Modal */}
      {isTestModalOpen && testConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  Test Meta Cloud API Handshake
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Target Account:</span>
                  <span className="text-white font-sans font-medium">{testConfig.name}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Phone Number ID:</span>
                  <span className="text-emerald-400">{testConfig.phone_number_id}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>WABA ID:</span>
                  <span className="text-slate-300">{testConfig.waba_id}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Graph API Endpoint:</span>
                  <span className="text-slate-300">https://graph.facebook.com/{testConfig.api_version || 'v20.0'}/</span>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                    testResult.success
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.details && (
                    <div className="bg-slate-950/80 p-2.5 rounded font-mono text-[11px] text-slate-300 space-y-1">
                      {testResult.details.display_phone_number && (
                        <div>Display Number: {testResult.details.display_phone_number}</div>
                      )}
                      {testResult.details.quality_rating && (
                        <div>Quality Rating: {testResult.details.quality_rating}</div>
                      )}
                      {testResult.details.name_status && (
                        <div>Verified Name Status: {testResult.details.name_status}</div>
                      )}
                      {testResult.details.waba_id && (
                        <div>WABA ID: {testResult.details.waba_id}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleRunTest}
                  disabled={isTesting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isTesting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>{isTesting ? 'Pinging Meta...' : 'Execute Handshake'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
