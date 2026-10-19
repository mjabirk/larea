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
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalEscape } from '../../hooks/useModalEscape';

const DEFAULT_NEW_FORM = {
  name: '',
  provider_type: 'generic_http',
  endpoint_url: 'https://api.sms-provider.com/v1/send?to={{to}}&msg={{message}}',
  http_method: 'POST',
  request_format: 'json',
  headers_json: '{\n  "Content-Type": "application/json"\n}',
  body_template: '{\n  "to": "{{to}}",\n  "message": "{{message}}",\n  "sender_id": "{{sender_id}}"\n}',
  sender_id: 'APEXCORP',
  is_default: false,
  active: true,
};

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

  // Standard in-place view mode
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'form'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_NEW_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Test SMS Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testGateway, setTestGateway] = useState(null);
  const [testPhone, setTestPhone] = useState('+974 5599 8877');
  const [testMessage, setTestMessage] = useState('Apex Global Enterprise Test: SMS Gateway operational.');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

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

  const filtered = useMemo(() => {
    return gateways.filter((gw) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        gw.name?.toLowerCase().includes(q) ||
        gw.provider_type?.toLowerCase().includes(q) ||
        gw.endpoint_url?.toLowerCase().includes(q) ||
        gw.sender_id?.toLowerCase().includes(q)
      );
    });
  }, [gateways, search]);

  // Record Pager resolution
  const currentRecordIndex = useMemo(() => {
    if (!selectedRecord) return -1;
    return filtered.findIndex((gw) => gw.id === selectedRecord.id);
  }, [selectedRecord, filtered]);

  const loadRecordIntoForm = useCallback((gw) => {
    setSelectedRecord(gw);
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
      is_default: gateways.length === 0,
    });
    setIsDirty(false);
    setViewMode('form');
  };

  const handleOpenEdit = (gw) => {
    loadRecordIntoForm(gw);
    setViewMode('form');
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name.trim() || !formData.endpoint_url.trim()) return;

    setIsSaving(true);
    try {
      const url = selectedRecord
        ? `/api/v1/communication/sms-gateways/${selectedRecord.id}`
        : '/api/v1/communication/sms-gateways';
      const method = selectedRecord ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save SMS gateway');
      }

      const resData = await res.json();
      const updated = resData.gateway || { ...formData, id: selectedRecord?.id || Date.now() };
      setSelectedRecord(updated);
      setIsDirty(false);
      setActionMessage({
        type: 'success',
        text: selectedRecord ? 'SMS gateway configuration updated.' : 'New SMS gateway created.',
      });
      fetchGateways();
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

  const handleDelete = async (gw) => {
    if (!window.confirm(`Delete SMS Gateway "${gw.name}"?`)) return;
    try {
      const res = await fetch(`/api/v1/communication/sms-gateways/${gw.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete gateway');
      }
      setActionMessage({ type: 'success', text: `SMS Gateway "${gw.name}" removed.` });
      fetchGateways();
      if (selectedRecord?.id === gw.id) {
        setViewMode('list');
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleOpenTest = (gw) => {
    setTestGateway(gw);
    setTestResult(null);
    setIsTestModalOpen(true);
  };

  const handleExecuteTest = async () => {
    if (!testGateway || !testPhone.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/communication/sms-gateways/${testGateway.id}/test`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          phone_number: testPhone,
          message: testMessage,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Network failure during test request.',
        error_details: err.message,
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Toast Feedback */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-semibold shadow-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer ml-3"
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
                title="Back to Gateways list"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Gateways</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">System Configuration</span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="text-slate-400">SMS Gateways</span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {formData.name || 'New Gateway'}
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

            {/* Right: Test Gateway, Discard & Save */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {selectedRecord && (
                <button
                  type="button"
                  onClick={() => handleOpenTest(selectedRecord)}
                  className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Test SMS</span>
                </button>
              )}
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
                <span>{selectedRecord ? 'Save Changes' : 'Create Gateway'}</span>
              </button>
            </div>
          </div>

          {/* Form Body Canvas */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <form onSubmit={handleSave} className="space-y-5 text-xs max-w-4xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Gateway Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="e.g. Ooredoo Qatar SMS Direct Relay"
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Provider Type
                  </label>
                  <select
                    value={formData.provider_type}
                    onChange={(e) => handleFieldChange('provider_type', e.target.value)}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                  onChange={(e) => handleFieldChange('endpoint_url', e.target.value)}
                  placeholder="https://messaging.provider.com/api/send?to={{to}}&msg={{message}}"
                  className="w-full px-3.5 py-2 font-mono text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Available URL tags: <code className="text-blue-500">{'{{to}}'}</code>, <code className="text-blue-500">{'{{message}}'}</code>, <code className="text-blue-500">{'{{sender_id}}'}</code>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    HTTP Method
                  </label>
                  <select
                    value={formData.http_method}
                    onChange={(e) => handleFieldChange('http_method', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                    onChange={(e) => handleFieldChange('request_format', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                    onChange={(e) => handleFieldChange('sender_id', e.target.value)}
                    placeholder="e.g. APEXCORP"
                    className="w-full px-3 py-2 font-mono text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                  onChange={(e) => handleFieldChange('headers_json', e.target.value)}
                  placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                  className="w-full p-3 font-mono text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                    onChange={(e) => handleFieldChange('body_template', e.target.value)}
                    placeholder='{"to": "{{to}}", "message": "{{message}}", "sender": "{{sender_id}}"}'
                    className="w-full p-3 font-mono text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}

              <div className="flex items-center gap-6 pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => handleFieldChange('is_default', e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                    Default Gateway
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => handleFieldChange('active', e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                    Active
                  </span>
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between shadow-2xs gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New SMS Gateway</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                  SMS Gateways
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {filtered.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search SMS gateways..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={fetchGateways}
              disabled={isLoading}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Refresh gateways"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Gateways Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading && gateways.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                Loading SMS gateways...
              </div>
            ) : filtered.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                No SMS gateways configured. Click "New SMS Gateway" to register one.
              </div>
            ) : (
              filtered.map((gw) => (
                <div
                  key={gw.id}
                  onClick={() => handleOpenEdit(gw)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-4 space-y-3 transition group cursor-pointer shadow-xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                          {gw.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Sender ID: {gw.sender_id || 'DEFAULT'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {gw.is_default && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">
                          Default
                        </span>
                      )}
                      <span
                        className={`w-2 h-2 rounded-full ${
                          gw.active ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg space-y-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800">
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span className="text-slate-800 dark:text-slate-200 uppercase">{gw.provider_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Method:</span>
                      <span className="text-slate-800 dark:text-slate-200">{gw.http_method}</span>
                    </div>
                    <div className="truncate text-slate-400">
                      {gw.endpoint_url}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenTest(gw)}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>Test Gateway</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(gw)}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="Edit Gateway"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(gw)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="Delete Gateway"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Test SMS Modal (Quick action tester dialog) */}
      {isTestModalOpen && testGateway && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Execute Live Test SMS ({testGateway.name})
                </h3>
              </div>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Recipient Phone Number (E.164)
                </label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+974 5599 8877"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Message Payload
                </label>
                <textarea
                  rows={2}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    testResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  <div className="font-semibold mb-1 flex items-center gap-1.5">
                    {testResult.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.http_status && (
                    <div className="font-mono text-[10px] text-slate-500">
                      HTTP Status Code: {testResult.http_status}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExecuteTest}
                disabled={isTesting}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Send className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Dispatching...' : 'Dispatch Test SMS'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
