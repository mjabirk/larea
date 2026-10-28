import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Server,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Shield,
  Trash2,
  Edit2,
  Send,
  Lock,
  ArrowUpDown,
  Search,
  Key,
  X,
  Radio,
  Sliders,
  Check,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';

const DEFAULT_NEW_FORM = {
  name: '',
  server_type: 'outgoing',
  protocol: 'SMTP',
  host: 'smtp.company.local',
  port: 587,
  encryption: 'STARTTLS',
  username: 'notifications@company.local',
  password: '',
  from_email: 'notifications@company.local',
  from_name: 'Apex Global Enterprises HR',
  is_default: false,
  active: true,
  auto_purge_mode: 'days',
  auto_purge_days: 60,
};

export function MailServersView() {
  const { t } = useLocale();
  const [servers, setServers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null); // { id, success, message }
  const [banner, setBanner] = useState('');

  // Form state
  const [formData, setFormData] = useState(DEFAULT_NEW_FORM);

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/mail/servers', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers || []);
      }
    } catch (err) {
      console.warn('Failed to load mail servers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    if (!pendingId) return;
    if (pendingId === 'new') {
      setPendingId(null);
      return;
    }
    if (servers.length > 0) {
      const found = servers.find((s) => String(s.id) === String(pendingId));
      if (found) loadRecordIntoForm(found);
      setPendingId(null);
    }
  }, [pendingId, servers]);

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
    return servers.filter((s) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.name?.toLowerCase().includes(q) ||
        s.host?.toLowerCase().includes(q) ||
        s.from_email?.toLowerCase().includes(q) ||
        s.username?.toLowerCase().includes(q)
      );
    });
  }, [servers, searchQuery]);

  // Record Pager resolution
  const currentRecordIndex = useMemo(() => {
    if (!selectedRecord) return -1;
    return filtered.findIndex((s) => s.id === selectedRecord.id);
  }, [selectedRecord, filtered]);

  const loadRecordIntoForm = useCallback((srv) => {
    setSelectedRecord(srv);
    setFormData({
      name: srv.name || '',
      server_type: srv.server_type || 'outgoing',
      protocol: srv.protocol || 'SMTP',
      host: srv.host || '',
      port: srv.port || 587,
      encryption: srv.encryption || 'STARTTLS',
      username: srv.username || '',
      password: '', // Kept empty unless updating
      from_email: srv.from_email || '',
      from_name: srv.from_name || '',
      is_default: Boolean(srv.is_default),
      active: srv.active !== false,
      auto_purge_mode: srv.auto_purge_mode || 'days',
      auto_purge_days: srv.auto_purge_days || 60,
    });
    setIsDirty(false);
    setTestResult(null);
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
    setTestResult(null);
    setViewMode('form');
  };

  const openEditForm = (srv) => {
    loadRecordIntoForm(srv);
    setViewMode('form');
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    const url = selectedRecord
      ? `/api/v1/mail/servers/${selectedRecord.id}`
      : '/api/v1/mail/servers';
    const method = selectedRecord ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save mail server.');
      }
      const data = await res.json();
      const updated = data.server || { ...formData, id: selectedRecord?.id || Date.now() };
      setSelectedRecord(updated);
      setIsDirty(false);
      setBanner({ text: selectedRecord ? 'Mail server updated successfully.' : 'Mail server created successfully.', type: 'success' });
      setTimeout(() => setBanner(null), 3000);
      fetchServers();
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
    if (!window.confirm(`Are you sure you want to delete mail server "${name}"?`)) return;
    try {
      await fetch(`/api/v1/mail/servers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setBanner({ text: 'Mail server deleted.', type: 'success' });
      setTimeout(() => setBanner(null), 3000);
      fetchServers();
      if (selectedRecord?.id === id) {
        setViewMode('list');
      }
    } catch (err) {
      setBanner({ text: 'Delete failed: ' + err.message, type: 'error' });
      setTimeout(() => setBanner(null), 4000);
    }
  };

  const handleTestConnection = async (id) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/mail/servers/${id}/test`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setTestResult({
        id,
        success: data.success,
        message: data.message,
      });
      fetchServers();
    } catch (err) {
      setTestResult({
        id,
        success: false,
        message: 'Connection test request failed.',
      });
    } finally {
      setTestingId(null);
    }
  };

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

      {/* Connection Test Result Banner */}
      {testResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between shadow-xs ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            )}
            <span className="font-semibold">{testResult.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setTestResult(null)}
            className="text-xs hover:opacity-75 cursor-pointer ms-3"
          >
            <X className="w-3.5 h-3.5" />
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
                title="Back to Mail Servers list"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Servers</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">System Configuration</span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="text-slate-400">Email Servers</span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {formData.name || 'New Server'}
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
                  onClick={() => handleTestConnection(selectedRecord.id)}
                  disabled={testingId === selectedRecord.id}
                  className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Send className={`w-3.5 h-3.5 ${testingId === selectedRecord.id ? 'animate-spin' : ''}`} />
                  <span>{testingId === selectedRecord.id ? 'Testing...' : 'Test Connection'}</span>
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
                <span>{selectedRecord ? 'Save Changes' : 'Create Server'}</span>
              </button>
            </div>
          </div>

          {/* Form Body Canvas */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <form onSubmit={handleSave} className="space-y-5 text-xs max-w-4xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Server Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Primary Corporate SMTP Relay"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Direction
                  </label>
                  <select
                    value={formData.server_type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      handleFieldChange('server_type', newType);
                      handleFieldChange('protocol', newType === 'incoming' ? 'IMAP' : 'SMTP');
                      handleFieldChange('port', newType === 'incoming' ? 993 : 587);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="outgoing">Outgoing (SMTP Relay)</option>
                    <option value="incoming">Incoming (IMAP Inbox Gateway)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Protocol & Encryption
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      readOnly
                      value={formData.protocol}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-mono"
                    />
                    <select
                      value={formData.encryption}
                      onChange={(e) => handleFieldChange('encryption', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="STARTTLS">STARTTLS</option>
                      <option value="SSL_TLS">SSL / TLS</option>
                      <option value="NONE">None (Plaintext)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Host Address (FQDN / IP) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="mail.domain.com"
                    value={formData.host}
                    onChange={(e) => handleFieldChange('host', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Port *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.port}
                    onChange={(e) => handleFieldChange('port', parseInt(e.target.value) || 587)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Authentication Credentials */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-3">
                <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold text-xs">
                  <Lock className="w-3.5 h-3.5 text-blue-500" />
                  <span>Authentication Credentials (AES-256 Protected)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
                      Username / Email
                    </label>
                    <input
                      type="text"
                      placeholder="notifications@domain.com"
                      value={formData.username}
                      onChange={(e) => handleFieldChange('username', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
                      Password / App Secret {selectedRecord ? '(Leave blank to retain)' : '*'}
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={formData.password}
                      onChange={(e) => handleFieldChange('password', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Sender Details (Only for outgoing) */}
              {formData.server_type === 'outgoing' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      From Email Header
                    </label>
                    <input
                      type="email"
                      placeholder="noreply@domain.com"
                      value={formData.from_email}
                      onChange={(e) => handleFieldChange('from_email', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Sender Display Name
                    </label>
                    <input
                      type="text"
                      placeholder="Apex Global Enterprises HR"
                      value={formData.from_name}
                      onChange={(e) => handleFieldChange('from_name', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Retention & Purge Configuration */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-3">
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                  Storage & Message Log Retention
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
                      Auto-Purge Strategy
                    </label>
                    <select
                      value={formData.auto_purge_mode}
                      onChange={(e) => handleFieldChange('auto_purge_mode', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="days">Retain for Fixed Days</option>
                      <option value="never">Retain Indefinitely</option>
                      <option value="immediate">Immediate Purge (Zero Log Disk)</option>
                    </select>
                  </div>

                  {formData.auto_purge_mode === 'days' && (
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">
                        Retention Window (Days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={formData.auto_purge_days}
                        onChange={(e) => handleFieldChange('auto_purge_days', parseInt(e.target.value) || 60)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => handleFieldChange('is_default', e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                    Set as Default {formData.server_type} Server
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => handleFieldChange('active', e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
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
          {/* Top 44px Control Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between shadow-2xs gap-3">
            {/* Left: Action Button + Title */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openCreateForm}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('add_server')}</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                  {t('mail_servers')}
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {filtered.length}
                </span>
              </div>
            </div>

            {/* Center: Search Filter */}
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search servers by host, name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ps-8 pe-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Right: Refresh */}
            <button
              type="button"
              onClick={fetchServers}
              disabled={isLoading}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Refresh servers"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Servers Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 font-semibold">
                    <th className="px-3 py-2">{t('server_name')}</th>
                    <th className="px-3 py-2">{t('channel')}</th>
                    <th className="px-3 py-2">{t('smtp_host')}</th>
                    <th className="px-3 py-2">{t('encryption')}</th>
                    <th className="px-3 py-2">{t('status_label')}</th>
                    <th className="px-3 py-2 text-end">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading && servers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-blue-500" />
                        Loading mail servers...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No mail servers configured. Click "New Mail Server" to set up SMTP/IMAP.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((srv) => {
                      const isTesting = testingId === srv.id;

                      return (
                        <tr
                          key={srv.id}
                          onClick={() => openEditForm(srv)}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                        >
                          <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <Server className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="group-hover:text-blue-600 transition-colors">
                                {srv.name}
                              </span>
                              {srv.is_default && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold">
                                  Default
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                                srv.server_type === 'outgoing'
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900'
                              }`}
                            >
                              {srv.server_type}
                            </span>
                          </td>

                          <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {srv.host}:{srv.port}
                          </td>

                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                              <Shield className="w-3 h-3 text-emerald-500" />
                              <span>{srv.encryption}</span>
                            </div>
                          </td>

                          <td className="px-3 py-2">
                            {srv.active ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                Inactive
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2 text-end">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleTestConnection(srv.id)}
                                disabled={isTesting}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition cursor-pointer flex items-center gap-1 border border-blue-200 dark:border-blue-900"
                                title="Test connection credentials"
                              >
                                <Send className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                                <span>{isTesting ? 'Testing...' : 'Test'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openEditForm(srv)}
                                className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                title="Edit Server"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDelete(srv.id, srv.name)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                title="Delete Server"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
