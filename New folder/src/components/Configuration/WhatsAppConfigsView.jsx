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
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalEscape } from '../../hooks/useModalEscape';
import { useLocale } from '../../context/LocaleContext';

const DEFAULT_NEW_FORM = {
  name: '',
  waba_id: '',
  phone_number_id: '',
  business_phone_number: '+974 4400 0000',
  access_token: '',
  webhook_verify_token: 'apex_enterprise_webhook_token_2026',
  api_version: 'v20.0',
  is_default: false,
  active: true,
};

export function WhatsAppConfigsView() {
  const { t } = useLocale();
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

  // Standard in-place view mode
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'form'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_NEW_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Test Connection Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testConfig, setTestConfig] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

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

  const filtered = useMemo(() => {
    return configs.filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.waba_id?.toLowerCase().includes(q) ||
        c.phone_number_id?.toLowerCase().includes(q) ||
        c.business_phone_number?.toLowerCase().includes(q)
      );
    });
  }, [configs, search]);

  // Record Pager resolution
  const currentRecordIndex = useMemo(() => {
    if (!selectedRecord) return -1;
    return filtered.findIndex((c) => c.id === selectedRecord.id);
  }, [selectedRecord, filtered]);

  const loadRecordIntoForm = useCallback((cfg) => {
    setSelectedRecord(cfg);
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
    setShowToken(false);
    setFormData({
      ...DEFAULT_NEW_FORM,
      is_default: configs.length === 0,
    });
    setIsDirty(false);
    setViewMode('form');
  };

  const handleOpenEdit = (cfg) => {
    loadRecordIntoForm(cfg);
    setViewMode('form');
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name.trim() || !formData.waba_id.trim() || !formData.phone_number_id.trim()) {
      setActionMessage({ type: 'error', text: 'Name, WABA ID, and Phone Number ID are required.' });
      return;
    }

    setIsSaving(true);
    try {
      const url = selectedRecord
        ? `/api/v1/communication/whatsapp-configs/${selectedRecord.id}`
        : '/api/v1/communication/whatsapp-configs';
      const method = selectedRecord ? 'PUT' : 'POST';

      const payload = { ...formData };
      if (selectedRecord && !payload.access_token) {
        delete payload.access_token;
      }

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save configuration');
      }

      const resData = await res.json();
      const updated = resData.config || { ...formData, id: selectedRecord?.id || Date.now() };
      setSelectedRecord(updated);
      setIsDirty(false);
      setActionMessage({
        type: 'success',
        text: selectedRecord ? 'WhatsApp Cloud API account updated.' : 'New WhatsApp Cloud API account created.',
      });
      fetchConfigs();
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

  const handleDeleteConfig = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/v1/communication/whatsapp-configs/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete configuration');
      }
      setActionMessage({ type: 'success', text: `Configuration "${name}" deleted.` });
      fetchConfigs();
      if (selectedRecord?.id === id) {
        setViewMode('list');
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
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
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Network error communicating with backend test gateway',
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
                title="Back to Accounts list"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Accounts</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">System Configuration</span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="text-slate-400">WhatsApp Cloud API</span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {formData.name || 'New Account'}
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

            {/* Right: Test Connection, Discard & Save */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {selectedRecord && (
                <button
                  type="button"
                  onClick={() => handleOpenTest(selectedRecord)}
                  className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Test Meta Handshake</span>
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
                onClick={handleSaveConfig}
                disabled={isSaving || (selectedRecord && !isDirty)}
                className={`px-4 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs ${
                  isSaving || (selectedRecord && !isDirty)
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-300 dark:border-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                <span>{selectedRecord ? 'Save Changes' : 'Create Account'}</span>
              </button>
            </div>
          </div>

          {/* Form Body Canvas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xs">
            <form onSubmit={handleSaveConfig} className="space-y-5 text-xs max-w-4xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-300">
                    Account Name / Label <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Corporate Meta Cloud Account"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
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
                    onChange={(e) => handleFieldChange('waba_id', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
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
                    onChange={(e) => handleFieldChange('phone_number_id', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
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
                    onChange={(e) => handleFieldChange('business_phone_number', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
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
                    onChange={(e) => handleFieldChange('api_version', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-slate-300">
                      System User Permanent Access Token {selectedRecord && <span className="text-slate-500">(Leave blank to keep existing)</span>}
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
                    placeholder={selectedRecord ? '••••••••••••••••••••••••••••' : 'EAAG... Permanent System User Token'}
                    value={formData.access_token}
                    onChange={(e) => handleFieldChange('access_token', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
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
                    onChange={(e) => handleFieldChange('webhook_verify_token', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Configured in Meta Developer App &gt; Webhooks &gt; WhatsApp Business Account.
                  </p>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="pt-3 flex items-center gap-6 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => handleFieldChange('is_default', e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Set as Default WhatsApp Channel</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => handleFieldChange('active', e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Active</span>
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
                <span>{t('add_account')}</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-100 text-xs">
                  {t('whatsapp_configs')}
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {filtered.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search accounts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full ps-8 pe-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={fetchConfigs}
              disabled={isLoading}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Refresh configurations"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Accounts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading && configs.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                Loading WhatsApp Cloud API accounts...
              </div>
            ) : filtered.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                No WhatsApp configurations found. Click "New WhatsApp Account" to register.
              </div>
            ) : (
              filtered.map((cfg) => (
                <div
                  key={cfg.id}
                  onClick={() => handleOpenEdit(cfg)}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3 transition group cursor-pointer shadow-xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                          {cfg.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {cfg.business_phone_number || 'No phone set'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {cfg.is_default && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                          Default
                        </span>
                      )}
                      <span
                        className={`w-2 h-2 rounded-full ${
                          cfg.active ? 'bg-emerald-500' : 'bg-slate-600'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-950 p-2 rounded-lg space-y-1 font-mono text-[10px] text-slate-400">
                    <div className="flex justify-between">
                      <span>WABA ID:</span>
                      <span className="text-slate-200">{cfg.waba_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Phone ID:</span>
                      <span className="text-slate-200">{cfg.phone_number_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>API Version:</span>
                      <span className="text-slate-200">{cfg.api_version || 'v20.0'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenTest(cfg)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>Test Handshake</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(cfg)}
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
                        title="Edit Account"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteConfig(cfg.id, cfg.name)}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition cursor-pointer"
                        title="Delete Account"
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

      {/* Test Connection Modal (Quick action tester dialog) */}
      {isTestModalOpen && testConfig && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white">
                  Meta Graph API Handshake Test
                </h3>
              </div>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2 text-slate-300">
              <p>
                Testing live authentication and phone registration with Meta Graph API for:{' '}
                <strong className="text-white">{testConfig.name}</strong>.
              </p>
              <div className="bg-slate-950 p-2.5 rounded-lg font-mono text-[11px] space-y-1">
                <div>WABA: {testConfig.waba_id}</div>
                <div>Phone ID: {testConfig.phone_number_id}</div>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                <div className="font-semibold mb-1 flex items-center gap-1.5">
                  {testResult.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                {testResult.meta_response && (
                  <pre className="mt-1 text-[10px] font-mono bg-black/40 p-2 rounded overflow-x-auto text-slate-300">
                    {JSON.stringify(testResult.meta_response, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleRunTest}
                disabled={isTesting}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-xs"
              >
                <Send className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Verifying...' : 'Execute Test'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
