import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  Smartphone,
  MessageCircle,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Eye,
  X,
  FileDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  CheckCheck,
  Check,
  Filter,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalEscape } from '../../hooks/useModalEscape';
import { useLocale } from '../../context/LocaleContext';

export function CommunicationLogsView() {
  const { t } = useLocale();
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(35);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMessage, setActionMessage] = useState(null);

  // Detail Modal / Slide-over State
  const [selectedLog, setSelectedLog] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useModalEscape(isDetailOpen, () => setIsDetailOpen(false));

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', limit);
      if (channelFilter) params.append('channel', channelFilter);
      if (statusFilter) params.append('status_filter', statusFilter);
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/v1/communication/logs?${params.toString()}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to load communication logs:', e);
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders, page, limit, channelFilter, statusFilter, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleDelete = async (logId) => {
    if (!window.confirm('Delete this communication log record?')) return;
    try {
      const res = await fetch(`/api/v1/communication/logs/${logId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        setActionMessage({ type: 'success', text: 'Communication log entry removed.' });
        fetchLogs();
        if (selectedLog && selectedLog.id === logId) {
          setIsDetailOpen(false);
        }
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Failed to delete communication log.' });
    }
  };

  const handleOpenDetail = (log) => {
    setSelectedLog(log);
    setIsDetailOpen(true);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'read':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCheck className="w-3 h-3 text-emerald-400" />
            Read
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30">
            <CheckCheck className="w-3 h-3 text-sky-400" />
            Delivered
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <Check className="w-3 h-3 text-blue-400" />
            Sent
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Clock className="w-3 h-3" />
            Queued
          </span>
        );
    }
  };

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

      {/* Header & Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                Communication Audit &amp; Dispatch Logs
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  {total} Total Messages
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Unified audit trail of all outgoing and incoming WhatsApp and SMS messages across the ERP.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search phone, recipient, text..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-48 sm:w-60 bg-slate-950 border border-slate-800 rounded-lg ps-8 pe-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">All Channels</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="read">Read</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
            </select>

            <button
              onClick={fetchLogs}
              disabled={isLoading}
              title="Refresh"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Odoo High-Density Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-semibold h-8">
                <th className="px-3.5 py-1.5">Timestamp</th>
                <th className="px-3.5 py-1.5">{t('channel')}</th>
                <th className="px-3.5 py-1.5">{t('recipient')}</th>
                <th className="px-3.5 py-1.5">Phone (E.164)</th>
                <th className="px-3.5 py-1.5">Message / Template Preview</th>
                <th className="px-3.5 py-1.5">Source Record</th>
                <th className="px-3.5 py-1.5">{t('status_label')}</th>
                <th className="px-3.5 py-1.5 text-end">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-slate-500 font-sans">
                    {isLoading ? 'Loading communication logs...' : 'No communication records found.'}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-800/40 transition-colors h-[32px] text-slate-300"
                  >
                    <td className="px-3.5 py-1 text-slate-400 whitespace-nowrap">
                      {log.created_at ? log.created_at.replace('T', ' ').substring(0, 19) : '—'}
                    </td>
                    <td className="px-3.5 py-1 font-sans">
                      {log.channel === 'whatsapp' ? (
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
                    <td className="px-3.5 py-1 font-sans text-white font-medium truncate max-w-[140px]">
                      {log.recipient_name || 'Staff Member'}
                    </td>
                    <td className="px-3.5 py-1 text-emerald-400 whitespace-nowrap">
                      {log.recipient_phone}
                    </td>
                    <td className="px-3.5 py-1 font-sans text-slate-300 truncate max-w-[260px]">
                      <span className="flex items-center gap-1.5 truncate">
                        {log.attachment_disk_path && (
                          <FileDown className="w-3 h-3 text-emerald-400 shrink-0" title="PDF Media Attached" />
                        )}
                        {log.template_name && (
                          <span className="text-emerald-400 font-mono text-[10px] shrink-0">
                            [{log.template_name}]
                          </span>
                        )}
                        <span className="truncate">{log.message_body || '—'}</span>
                      </span>
                    </td>
                    <td className="px-3.5 py-1 text-slate-400 whitespace-nowrap">
                      {log.record_model ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                          {log.record_model}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3.5 py-1 whitespace-nowrap">
                      {renderStatusBadge(log.status)}
                    </td>
                    <td className="px-3.5 py-1 text-end font-sans whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenDetail(log)}
                          title="View Message Audit Details"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(log.id)}
                          title="Delete Record"
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

        {/* Pagination Strip */}
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {logs.length} of {total} records (Page {page} of {totalPages})
          </div>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono">{page}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Message Audit Detail Modal */}
      {isDetailOpen && selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  Communication Dispatch Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
              {/* Top Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Channel &amp; Status
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white uppercase">
                      {selectedLog.channel}
                    </span>
                    {renderStatusBadge(selectedLog.status)}
                  </div>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Timestamp
                  </span>
                  <div className="text-xs font-mono text-slate-300">
                    {selectedLog.created_at ? selectedLog.created_at.replace('T', ' ') : '—'}
                  </div>
                </div>
              </div>

              {/* Recipient Details */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Recipient Name:</span>
                  <span className="text-white font-sans font-medium">{selectedLog.recipient_name || 'Staff Member'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Recipient Phone:</span>
                  <span className="text-emerald-400">{selectedLog.recipient_phone}</span>
                </div>
                {selectedLog.record_model && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Source ERP Record:</span>
                    <span className="text-slate-300">{selectedLog.record_model} (ID: {selectedLog.record_id || '—'})</span>
                  </div>
                )}
                {selectedLog.provider_message_id && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Provider Message ID:</span>
                    <span className="text-slate-300 break-all">{selectedLog.provider_message_id}</span>
                  </div>
                )}
                {selectedLog.attachment_disk_path && (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                    <span className="text-slate-400 flex items-center gap-1">
                      <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                      Attachment Disk Path:
                    </span>
                    <span className="text-emerald-300 text-[10px] truncate max-w-[280px]">
                      {selectedLog.attachment_disk_path}
                    </span>
                  </div>
                )}
              </div>

              {/* Message Thread View */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400">Message Thread View</label>
                <div
                  className={`flex flex-col w-full p-3 rounded-xl bg-slate-950 border border-slate-800 ${
                    selectedLog.direction === 'outgoing' || !selectedLog.direction ? 'items-end' : 'items-start'
                  }`}
                >
                  <span className="text-[10px] text-slate-400 font-semibold mb-1 px-1">
                    {selectedLog.direction === 'outgoing' || !selectedLog.direction
                      ? 'Business Outgoing Dispatch'
                      : selectedLog.recipient_name || 'Customer / Client'}
                  </span>
                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs break-words shadow-xs select-text ${
                      selectedLog.direction === 'outgoing' || !selectedLog.direction
                        ? 'bg-emerald-600 text-white rounded-br-xs'
                        : 'bg-slate-800 text-slate-100 border border-slate-700/60 rounded-bl-xs'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">
                      {selectedLog.message_body || 'No text content.'}
                    </p>
                    <div
                      className={`text-[9px] mt-1 flex items-center justify-end gap-1 font-mono ${
                        selectedLog.direction === 'outgoing' || !selectedLog.direction
                          ? 'text-emerald-200'
                          : 'text-slate-400'
                      }`}
                    >
                      <span>
                        {selectedLog.created_at
                          ? new Date(selectedLog.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : ''}
                      </span>
                      {(selectedLog.direction === 'outgoing' || !selectedLog.direction) && (
                        <span className="text-[10px]">✓✓</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Message if Failed */}
              {selectedLog.error_message && (
                <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded-lg text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>Provider Error Details</span>
                  </div>
                  <div className="text-rose-300 font-mono text-[11px] whitespace-pre-wrap">
                    {selectedLog.error_message}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDetailOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
