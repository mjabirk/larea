import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  RefreshCw,
  Send,
  Trash2,
  Eye,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  ExternalLink,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Server,
  Sparkles,
  Inbox
} from 'lucide-react';

export function MailLogsView() {
  const [messages, setMessages] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(40);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected message for detail modal
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [resendingId, setResendingId] = useState(null);
  const [banner, setBanner] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      if (searchQuery) params.append('search', searchQuery);
      if (directionFilter) params.append('direction', directionFilter);
      if (statusFilter) params.append('status_filter', statusFilter);

      const res = await fetch(`/api/v1/mail/messages?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTotalCount(data.total || 0);
      }
    } catch (err) {
      console.warn('Failed to fetch mail messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, directionFilter, statusFilter]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const openMessageDetail = async (id) => {
    setDetailLoading(true);
    setIsDetailModalOpen(true);
    try {
      const res = await fetch(`/api/v1/mail/messages/${id}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedMessage(data);
      }
    } catch (err) {
      console.warn('Failed to load message detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResend = async (id, e) => {
    if (e) e.stopPropagation();
    setResendingId(id);
    try {
      const res = await fetch(`/api/v1/mail/messages/${id}/resend`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.status === 'sent') {
        setBanner('Email successfully re-dispatched!');
      } else {
        alert('Resend attempt failed: ' + (data.error || 'Unknown error'));
      }
      setTimeout(() => setBanner(''), 3000);
      fetchMessages();
      if (selectedMessage && selectedMessage.id === id) {
        openMessageDetail(id);
      }
    } catch (err) {
      alert('Resend request error: ' + err.message);
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this mail log and physically remove its physical attachments from disk?')) return;
    try {
      await fetch(`/api/v1/mail/messages/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setBanner('Mail log and disk files removed.');
      setTimeout(() => setBanner(''), 3000);
      if (isDetailModalOpen && selectedMessage?.id === id) {
        setIsDetailModalOpen(false);
      }
      fetchMessages();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleTriggerPurge = async () => {
    setPurgeLoading(true);
    try {
      const res = await fetch('/api/v1/mail/retention/cleanup', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setBanner(`Retention Purge Complete: Purged ${data.purged_messages} message(s), ${data.purged_files} disk file(s).`);
      setTimeout(() => setBanner(''), 4000);
      fetchMessages();
    } catch (err) {
      alert('Retention purge failed: ' + err.message);
    } finally {
      setPurgeLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isDetailModalOpen) {
        setIsDetailModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDetailModalOpen]);

  const startRecord = (currentPage - 1) * pageSize + (totalCount > 0 ? 1 : 0);
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-3 animate-fadeIn">
      {/* 1. Slim Top Control Bar (44px) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between shadow-2xs gap-3">
        {/* Left: Purge Action + Title */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTriggerPurge}
            disabled={purgeLoading}
            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Execute Retention Maintenance Cleanup Worker"
          >
            <Clock className={`w-3.5 h-3.5 text-blue-500 ${purgeLoading ? 'animate-spin' : ''}`} />
            <span>{purgeLoading ? 'Cleaning...' : 'Run Auto-Purge'}</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
              Outgoing & Incoming Mail Logs
            </span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {totalCount}
            </span>
          </div>
        </div>

        {/* Center: Search & Filter Chips */}
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search subject or email address..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={directionFilter}
            onChange={(e) => {
              setDirectionFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
          >
            <option value="">All Directions</option>
            <option value="outgoing">Outgoing</option>
            <option value="incoming">Incoming</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
          >
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
          </select>
        </div>

        {/* Right: Odoo Pager & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>
              [ {startRecord}-{endRecord} / {totalCount} ]
            </span>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={endRecord >= totalCount}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={fetchMessages}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Refresh Logs"
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

      {/* 2. Odoo-Style High Density Log Table (32px row height) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/80 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider h-8">
                <th className="px-3 py-1 font-semibold">Date / Time</th>
                <th className="px-3 py-1 font-semibold">Direction</th>
                <th className="px-3 py-1 font-semibold">Recipients (To / From)</th>
                <th className="px-3 py-1 font-semibold">Subject</th>
                <th className="px-3 py-1 font-semibold">Status</th>
                <th className="px-3 py-1 font-semibold">Files</th>
                <th className="px-3 py-1 font-semibold">Linked Record</th>
                <th className="px-3 py-1 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    No mail log entries match the selected criteria.
                  </td>
                </tr>
              ) : (
                messages.map((m) => {
                  const isSent = m.status === 'sent';
                  const isFailed = m.status === 'failed';
                  const isResending = resendingId === m.id;

                  const dateStr = m.sent_at || m.created_at;
                  const displayDate = dateStr
                    ? new Date(dateStr).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Pending';

                  return (
                    <tr
                      key={m.id}
                      onClick={() => openMessageDetail(m.id)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition h-8 text-[12px] cursor-pointer"
                    >
                      <td className="px-3 py-1 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {displayDate}
                      </td>

                      <td className="px-3 py-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            m.direction === 'outgoing'
                              ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                              : 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400'
                          }`}
                        >
                          {m.direction}
                        </span>
                      </td>

                      <td className="px-3 py-1 text-slate-800 dark:text-slate-200 font-mono text-[11px] truncate max-w-[200px]">
                        {m.to_addresses}
                      </td>

                      <td className="px-3 py-1 font-semibold text-slate-900 dark:text-white truncate max-w-[280px]">
                        {m.subject}
                      </td>

                      <td className="px-3 py-1">
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Sent</span>
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1 text-rose-500 font-semibold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span>Failed</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-500 font-semibold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>Queued</span>
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-1">
                        {m.attachments_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-mono">
                            <Paperclip className="w-2.5 h-2.5" />
                            <span>{m.attachments_count}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      <td className="px-3 py-1 text-slate-500 font-mono text-[11px]">
                        {m.record_model ? `${m.record_model.split('.')[1] || m.record_model}` : '—'}
                      </td>

                      <td className="px-3 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleResend(m.id, e)}
                            disabled={isResending}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                            title="Resend email"
                          >
                            <Send className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openMessageDetail(m.id)}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            title="View Payload & Attachments"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleDelete(m.id, e)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="Delete log"
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

      {/* 3. Detailed Email Payload & Attachment Drawer Modal */}
      {isDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-2xs">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {selectedMessage?.subject || 'Email Summary'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Full Outgoing SMTP Payload & Physical Disk Attachments
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            {detailLoading || !selectedMessage ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Loading email details...
              </div>
            ) : (
              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                {/* Meta Summary Grid */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">To:</span>
                    <span className="font-mono text-slate-900 dark:text-white font-medium">{selectedMessage.to_addresses}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">From Server:</span>
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {selectedMessage.server_name} ({selectedMessage.from_email})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Status:</span>
                    <span
                      className={`font-semibold ${
                        selectedMessage.status === 'sent'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : selectedMessage.status === 'failed'
                          ? 'text-rose-500'
                          : 'text-amber-500'
                      }`}
                    >
                      {selectedMessage.status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Sent At:</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">
                      {selectedMessage.sent_at || selectedMessage.created_at}
                    </span>
                  </div>
                  {selectedMessage.purge_after && (
                    <div className="col-span-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] uppercase font-semibold mr-1">Scheduled Retention Purge:</span>
                      <span className="font-mono text-amber-600 dark:text-amber-400">{selectedMessage.purge_after}</span>
                    </div>
                  )}
                </div>

                {/* Error Log Banner if failed */}
                {selectedMessage.error_log && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                      <span>SMTP Handshake / Delivery Failure Log:</span>
                    </div>
                    <pre className="font-mono text-[11px] whitespace-pre-wrap leading-tight bg-rose-950/20 p-2 rounded">
                      {selectedMessage.error_log}
                    </pre>
                  </div>
                )}

                {/* Physical Disk Attachments Section */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                      <span>Physical Disk Attachments ({selectedMessage.attachments?.length || 0})</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">storage/mail_attachments/...</span>
                  </div>

                  {selectedMessage.attachments?.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No attachments attached to this transmission.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedMessage.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white text-xs truncate">
                              {att.filename}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {formatFileSize(att.file_size_bytes)} • {att.mime_type.split('/')[1] || 'doc'}
                            </div>
                          </div>
                          <a
                            href={`/api/v1/mail/attachments/${att.id}/download`}
                            download={att.filename}
                            className="px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-blue-400 font-semibold text-[11px] flex items-center gap-1 shrink-0 transition"
                            title="Download physical attachment from disk"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* HTML Body Render */}
                <div className="space-y-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                    Rendered Email Body:
                  </span>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 max-h-72 overflow-y-auto">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: selectedMessage.body_html || '<p class="text-slate-400 italic">No HTML payload content.</p>',
                      }}
                    />
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => handleDelete(selectedMessage.id, e)}
                    className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Record & Disk Files</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleResend(selectedMessage.id)}
                      disabled={resendingId === selectedMessage.id}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <Send className={`w-3.5 h-3.5 ${resendingId === selectedMessage.id ? 'animate-spin' : ''}`} />
                      <span>{resendingId === selectedMessage.id ? 'Resending...' : 'Resend Email'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDetailModalOpen(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition cursor-pointer"
                    >
                      Close (Esc)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
