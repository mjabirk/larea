import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Smartphone,
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalEscape } from '../../hooks/useModalEscape';

export function SMSGatewaysView() {
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [gateways, setGateways] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState(null);

  // Edit / Create Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingGateway, setEditingGateway] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    provider_type: 'generic_http',
    endpoint_url: '',
    http_method: 'POST',
    request_format: 'json',
    headers_json: '{\n  "Content-Type": "application/json"\n}',
    body_template: '{\n  "to": "{{to}}",\n  "message": "{{message}}",\n  "sender_id": "{{sender_id}}"\n}',
    sender_id: 'APEXCORP',
    is_default: false,
    active: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Test SMS Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testGateway, setTestGateway] = useState(null);
  const [testPhone, setTestPhone] = useState('+974 5599 8877');
  const [testMessage, setTestMessage] = useState('Apex Global Enterprise Test: SMS Gateway operational.');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useModalEscape(isEditModalOpen, () => setIsEditModalOpen(false));
  useModalEscape(isTestModalOpen, () => setIsTestModalOpen(false));

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  const fetchGateways = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/communication/sms-gateways', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setGateways(data.gateways || []);
      }
    } catch (e) {
      console.error('Failed to load SMS gateways:', e);
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchGateways();
  }, [fetchGateways]);

  const handleOpenCreate = () => {
    setEditingGateway(null);
    setFormData({
      name: '',
      provider_type: 'generic_http',
      endpoint_url: 'https://api.sms-provider.com/v1/send?to={{to}}&msg={{message}}',
      http_method: 'POST',
      request_format: 'json',
      headers_json: '{\n  "Content-Type": "application/json"\n}',
      body_template: '{\n  "to": "{{to}}",\n  "message": "{{message}}",\n  "sender_id": "{{sender_id}}"\n}',
      sender_id: 'APEXCORP',
      is_default: gateways.length === 0,
      active: true,
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (gw) => {
    setEditingGateway(gw);
    setFormData({
      name: gw.name || '',
      provider_type: gw.provider_type || 'generic_http',
      endpoint_url: gw.endpoint_url || '',
      http_method: gw.http_method || 'POST',
      request_format: gw.request_format || 'json',
      headers_json: gw.headers_json || '',
      body_template: gw.body_template || '',
      sender_id: gw.sender_id || '',
      is_default: Boolean(gw.is_default),
      active: Boolean(gw.active),
    });
    setIsEditModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.endpoint_url.trim()) return;

    setIsSaving(true);
    try {
      const url = editingGateway
        ? `/api/v1/communication/sms-gateways/${editingGateway.id}`
        : '/api/v1/communication/sms-gateways';
      const method = editingGateway ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsEditModalOpen(false);
        setActionMessage({
          type: 'success',
          text: `SMS Gateway '${formData.name}' successfully ${editingGateway ? 'updated' : 'created'}.`,
        });
        await fetchGateways();
      } else {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save SMS gateway.');
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (gw) => {
    if (!window.confirm(`Are you sure you want to delete SMS Gateway '${gw.name}'?`)) return;
    try {
      const res = await fetch(`/api/v1/communication/sms-gateways/${gw.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        setActionMessage({ type: 'success', text: `SMS Gateway '${gw.name}' deleted.` });
        await fetchGateways();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to delete SMS gateway.' });
    }
  };

  const handleOpenTest = (gw) => {
    setTestGateway(gw);
    setTestPhone('+974 5599 8877');
    setTestMessage(`Test message from Apex Global via ${gw.name} at ${new Date().toLocaleTimeString()}`);
    setTestResult(null);
    setIsTestModalOpen(true);
  };

  const handleRunTest = async (e) => {
    e.preventDefault();
    if (!testGateway || !testPhone.trim()) return;

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/communication/sms-gateways/${testGateway.id}/test`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          to_phone: testPhone.trim(),
          message: testMessage.trim(),
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const filteredGateways = useMemo(() => {
    if (!search.trim()) return gateways;
    const q = search.toLowerCase();
    return gateways.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.provider_type.toLowerCase().includes(q) ||
        (g.sender_id && g.sender_id.toLowerCase().includes(q)) ||
        g.endpoint_url.toLowerCase().includes(q)
    );
  }, [gateways, search]);

  return (
    <div className="space-y-4">
      {/* 1. Odoo-Style Top Control Bar (Slim 44px) */}
      <div className="h-11 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
        {/* Left: Action Button + Title */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Gateway</span>
          </button>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
          <div className="flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200 font-bold">
            <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>SMS Gateways</span>
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-normal ml-1">
              {gateways.length}
            </span>
          </div>
        </div>

        {/* Center: Search input */}
        <div className="flex-1 max-w-xs relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gateways, sender IDs..."
            className="w-full pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Right: Refresh button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchGateways}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Refresh gateways"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. High-Density Odoo-Style Table (32px row height) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="h-8 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                <th className="px-3 py-1.5">Gateway Name</th>
                <th className="px-3 py-1.5">Provider Type</th>
                <th className="px-3 py-1.5">Sender ID</th>
                <th className="px-3 py-1.5">Endpoint URL</th>
                <th className="px-3 py-1.5">Method</th>
                <th className="px-3 py-1.5">Default</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredGateways.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No SMS gateways configured yet.
                  </td>
                </tr>
              ) : (
                filteredGateways.map((gw) => (
                  <tr
                    key={gw.id}
                    className="h-8 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition select-none group"
                  >
                    <td className="px-3 py-1 font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
                      {gw.name}
                    </td>
                    <td className="px-3 py-1">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {gw.provider_type}
                      </span>
                    </td>
                    <td className="px-3 py-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      {gw.sender_id || '—'}
                    </td>
                    <td className="px-3 py-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[240px]" title={gw.endpoint_url}>
                      {gw.endpoint_url}
                    </td>
                    <td className="px-3 py-1 font-mono text-[10px] uppercase font-bold text-slate-600 dark:text-slate-300">
                      {gw.http_method}
                    </td>
                    <td className="px-3 py-1">
                      {gw.is_default && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                          <Check className="w-2.5 h-2.5" /> DEFAULT
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1">
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded-full text-[10px] font-bold uppercase ${
                          gw.active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {gw.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenTest(gw)}
                          className="px-2 py-0.5 rounded text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition cursor-pointer"
                          title="Send test SMS"
                        >
                          <Send className="w-3 h-3 inline mr-1" />
                          <span>Test</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(gw)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title="Edit Gateway"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(gw)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer"
                          title="Delete Gateway"
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

      {/* 3. MODAL: Create / Edit Gateway */}
      {isEditModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => setIsEditModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingGateway ? 'Edit SMS Gateway' : 'Configure New SMS Gateway'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Gateway Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Ooredoo Bulk SMS (Qatar)"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Provider Type
                  </label>
                  <select
                    value={formData.provider_type}
                    onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="generic_http">Generic HTTP / REST Gateway</option>
                    <option value="twilio">Twilio Cloud API</option>
                    <option value="infobip">Infobip Enterprise</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Endpoint URL *
                </label>
                <input
                  type="text"
                  required
                  value={formData.endpoint_url}
                  onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
                  placeholder="https://messaging.provider.com/api/send?to={{to}}&msg={{message}}"
                  className="w-full px-3 py-2 font-mono text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Available URL tags: <code className="text-blue-500">{'{{to}}'}</code>, <code className="text-blue-500">{'{{message}}'}</code>, <code className="text-blue-500">{'{{sender_id}}'}</code>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    HTTP Method
                  </label>
                  <select
                    value={formData.http_method}
                    onChange={(e) => setFormData({ ...formData, http_method: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Request Format
                  </label>
                  <select
                    value={formData.request_format}
                    onChange={(e) => setFormData({ ...formData, request_format: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="json">JSON Payload</option>
                    <option value="form_data">Form URL Encoded</option>
                    <option value="url_params">Query Parameters</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Default Sender ID
                  </label>
                  <input
                    type="text"
                    value={formData.sender_id}
                    onChange={(e) => setFormData({ ...formData, sender_id: e.target.value })}
                    placeholder="e.g. APEXCORP"
                    className="w-full px-3 py-2 font-mono text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Custom HTTP Headers (JSON)
                </label>
                <textarea
                  rows={2}
                  value={formData.headers_json}
                  onChange={(e) => setFormData({ ...formData, headers_json: e.target.value })}
                  placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                  className="w-full p-2.5 font-mono text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {formData.http_method === 'POST' && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    POST Body Template (JSON / Template)
                  </label>
                  <textarea
                    rows={3}
                    value={formData.body_template}
                    onChange={(e) => setFormData({ ...formData, body_template: e.target.value })}
                    placeholder='{"to": "{{to}}", "message": "{{message}}", "sender": "{{sender_id}}"}'
                    className="w-full p-2.5 font-mono text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}

              <div className="flex items-center gap-6 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Default Gateway</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Active</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs disabled:opacity-50 transition cursor-pointer"
                >
                  {isSaving ? 'Saving...' : editingGateway ? 'Update Gateway' : 'Create Gateway'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL: Live Test SMS Dispatcher */}
      {isTestModalOpen && testGateway && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => setIsTestModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Send Test SMS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRunTest} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Testing Gateway
                </label>
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-semibold">
                  {testGateway.name} ({testGateway.provider_type})
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Phone (E.164) *
                </label>
                <input
                  type="text"
                  required
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+974 5599 8877"
                  className="w-full px-3 py-2 font-mono text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Test Message
                </label>
                <textarea
                  rows={3}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full p-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs leading-relaxed ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200'
                  }`}
                >
                  <strong className="block font-bold mb-0.5">
                    {testResult.success ? 'Dispatch Succeeded!' : 'Dispatch Failed'}
                  </strong>
                  {testResult.success ? (
                    <div>
                      Message ID: <code className="font-mono">{testResult.provider_message_id}</code>
                    </div>
                  ) : (
                    <div>Error: {testResult.error}</div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isTesting || !testPhone.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs disabled:opacity-50 transition cursor-pointer"
                >
                  {isTesting ? 'Sending...' : 'Send Test SMS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SMSGatewaysView;
