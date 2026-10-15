import React, { useState, useEffect, useCallback } from 'react';
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
  Check
} from 'lucide-react';

export function MailServersView() {
  const [servers, setServers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null); // { id, success, message }
  const [banner, setBanner] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    server_type: 'outgoing',
    protocol: 'SMTP',
    host: '',
    port: 587,
    encryption: 'STARTTLS',
    username: '',
    password: '',
    from_email: '',
    from_name: 'Apex Global Enterprises HR',
    is_default: false,
    active: true,
    auto_purge_mode: 'days',
    auto_purge_days: 60,
  });

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

  const openCreateModal = () => {
    setEditingServer(null);
    setFormData({
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
    });
    setTestResult(null);
    setIsModalOpen(true);
  };

  const openEditModal = (srv) => {
    setEditingServer(srv);
    setFormData({
      name: srv.name,
      server_type: srv.server_type,
      protocol: srv.protocol,
      host: srv.host,
      port: srv.port,
      encryption: srv.encryption,
      username: srv.username || '',
      password: '', // Kept empty unless updating
      from_email: srv.from_email || '',
      from_name: srv.from_name || '',
      is_default: srv.is_default,
      active: srv.active,
      auto_purge_mode: srv.auto_purge_mode || 'days',
      auto_purge_days: srv.auto_purge_days || 60,
    });
    setTestResult(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const url = editingServer
      ? `/api/v1/mail/servers/${editingServer.id}`
      : '/api/v1/mail/servers';
    const method = editingServer ? 'PUT' : 'POST';

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
      setIsModalOpen(false);
      setBanner(editingServer ? 'Mail server updated.' : 'Mail server created.');
      setTimeout(() => setBanner(''), 3000);
      fetchServers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete mail server "${name}"?`)) return;
    try {
      await fetch(`/api/v1/mail/servers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setBanner('Mail server deleted.');
      setTimeout(() => setBanner(''), 3000);
      fetchServers();
    } catch (err) {
      alert('Delete failed: ' + err.message);
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

  // Keyboard shortcut: Esc closes modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const filtered = servers.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.host.toLowerCase().includes(q) ||
      s.protocol.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3 animate-fadeIn">
      {/* 1. Slim Odoo-Style Top Control Bar (44px) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between shadow-2xs gap-3">
        {/* Left: Action Buttons + Title */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Server</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
              Email Servers
            </span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {filtered.length}
            </span>
          </div>
        </div>

        {/* Center: Slim Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search host, protocol, server name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Right: Refresh button */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={fetchServers}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Refresh Server List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {banner && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      {/* 2. Odoo-Style High Density Table (32px row height) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/80 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider h-8">
                <th className="px-3 py-1 font-semibold">Server Name</th>
                <th className="px-3 py-1 font-semibold">Type</th>
                <th className="px-3 py-1 font-semibold">Protocol</th>
                <th className="px-3 py-1 font-semibold">Host & Port</th>
                <th className="px-3 py-1 font-semibold">Encryption</th>
                <th className="px-3 py-1 font-semibold">Default</th>
                <th className="px-3 py-1 font-semibold">Purge Rule</th>
                <th className="px-3 py-1 font-semibold">Connection Status</th>
                <th className="px-3 py-1 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                    No email servers configured yet. Click "+ New Server" to add an SMTP/IMAP gateway.
                  </td>
                </tr>
              ) : (
                filtered.map((srv) => {
                  const isReady = srv.last_connection_status === 'ready';
                  const isFailed = srv.last_connection_status === 'failed';
                  const isTesting = testingId === srv.id;

                  return (
                    <tr
                      key={srv.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition h-8 text-[12px]"
                    >
                      <td className="px-3 py-1 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate max-w-[180px]">{srv.name}</span>
                      </td>

                      <td className="px-3 py-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            srv.server_type === 'outgoing'
                              ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                              : 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400'
                          }`}
                        >
                          {srv.server_type}
                        </span>
                      </td>

                      <td className="px-3 py-1 font-mono font-medium text-slate-700 dark:text-slate-300">
                        {srv.protocol}
                      </td>

                      <td className="px-3 py-1 font-mono text-slate-600 dark:text-slate-400">
                        {srv.host}:{srv.port}
                      </td>

                      <td className="px-3 py-1">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                          {srv.encryption}
                        </span>
                      </td>

                      <td className="px-3 py-1">
                        {srv.is_default ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                            <Check className="w-2.5 h-2.5" />
                            <span>Default</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      <td className="px-3 py-1 text-slate-600 dark:text-slate-400">
                        {srv.auto_purge_mode === 'never'
                          ? 'Never'
                          : srv.auto_purge_mode === 'immediate'
                          ? 'Immediate'
                          : `${srv.auto_purge_days} Days`}
                      </td>

                      <td className="px-3 py-1">
                        {isReady ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Ready</span>
                          </span>
                        ) : isFailed ? (
                          <span
                            className="inline-flex items-center gap-1 text-rose-500 font-medium text-[11px]"
                            title={srv.last_connection_error || 'Connection handshake failed'}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span>Failed</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span>Untested</span>
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-1 text-right">
                        <div className="flex items-center justify-end gap-1">
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
                            onClick={() => openEditModal(srv)}
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

      {/* Test Connection Banner Display */}
      {testResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
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
            <span className="font-medium">{testResult.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setTestResult(null)}
            className="text-xs hover:opacity-75 cursor-pointer ml-3"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Create / Edit Mail Server Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-2xs">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingServer ? 'Edit Mail Server' : 'Configure New Mail Server'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Enterprise SMTP Relay & IMAP Inbox Gateway (AES-256-GCM Encrypted)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Server Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Corporate SMTP Relay (Doha HQ)"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Direction / Role *
                  </label>
                  <select
                    value={formData.server_type}
                    onChange={(e) => setFormData({ ...formData, server_type: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="outgoing">Outgoing (SMTP Dispatcher)</option>
                    <option value="incoming">Incoming (IMAP / Inquiries)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Protocol *
                  </label>
                  <select
                    value={formData.protocol}
                    onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  >
                    <option value="SMTP">SMTP (Simple Mail Transfer)</option>
                    <option value="IMAP">IMAP (Internet Message Access)</option>
                    <option value="POP3">POP3</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Server Host *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="smtp.company.local or mail.example.com"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Port & Encryption *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      required
                      placeholder="587"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 587 })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={formData.encryption}
                      onChange={(e) => setFormData({ ...formData, encryption: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-[11px]"
                    >
                      <option value="STARTTLS">STARTTLS</option>
                      <option value="SSL_TLS">SSL / TLS</option>
                      <option value="NONE">None</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Username / Login Email
                  </label>
                  <input
                    type="text"
                    placeholder="notifications@company.local"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Password {editingServer ? '(Leave blank to keep current)' : '*'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingServer ? '••••••••' : 'Enter plain password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    From Address
                  </label>
                  <input
                    type="email"
                    placeholder="payroll@company.local"
                    value={formData.from_email}
                    onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    From Display Name
                  </label>
                  <input
                    type="text"
                    placeholder="Apex Global Enterprises HR"
                    value={formData.from_name}
                    onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Auto-Purge & Retention Settings */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Sliders className="w-3.5 h-3.5 text-blue-500" />
                  <span>Retention & Auto-Purge Maintenance Rules</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
                      Purge Mode
                    </label>
                    <select
                      value={formData.auto_purge_mode}
                      onChange={(e) => setFormData({ ...formData, auto_purge_mode: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="days">Purge after X days</option>
                      <option value="immediate">Immediate (Purge upon delivery)</option>
                      <option value="never">Never (Indefinite Archive)</option>
                    </select>
                  </div>

                  {formData.auto_purge_mode === 'days' && (
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">
                        Retention Days
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={formData.auto_purge_days}
                        onChange={(e) => setFormData({ ...formData, auto_purge_days: parseInt(e.target.value) || 60 })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
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
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
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
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                    Active
                  </span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                {editingServer && (
                  <button
                    type="button"
                    onClick={() => handleTestConnection(editingServer.id)}
                    disabled={testingId === editingServer.id}
                    className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Send className={`w-3.5 h-3.5 ${testingId === editingServer.id ? 'animate-spin' : ''}`} />
                    <span>{testingId === editingServer.id ? 'Verifying Handshake...' : 'Test Connection'}</span>
                  </button>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition cursor-pointer"
                  >
                    Cancel (Esc)
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs"
                  >
                    {editingServer ? 'Save Changes' : 'Create Server'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
