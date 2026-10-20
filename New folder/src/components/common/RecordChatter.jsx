import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Clock,
  User,
  Send,
  AlertCircle,
  Activity,
  History,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Mail,
  MessageCircle,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function RecordChatter({ entityType, entityId, entityName }) {
  const { currentUser } = useAuth();

  const [auditEvents, setAuditEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isNoteBoxExpanded, setIsNoteBoxExpanded] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());
  const [showJsonMap, setShowJsonMap] = useState({});

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchAuditTrail = useCallback(async () => {
    if (!entityType || !entityId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/audit-logs/${entityType}/${entityId}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAuditEvents(data.audit_trail || []);
      }
    } catch (e) {
      console.error('Failed to load audit trail:', e);
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchAuditTrail();

    const handleChatterUpdated = (e) => {
      if (!e?.detail?.recordId || String(e.detail.recordId) === String(entityId)) {
        fetchAuditTrail();
      }
    };

    window.addEventListener('larea-record-chatter-updated', handleChatterUpdated);
    return () => {
      window.removeEventListener('larea-record-chatter-updated', handleChatterUpdated);
    };
  }, [fetchAuditTrail, entityId]);

  const handleLogNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    setIsSubmittingNote(true);
    setErrorMessage('');
    try {
      const author = currentUser?.full_name || currentUser?.username || 'Authorized User';
      const res = await fetch(`/api/v1/audit-logs/${entityType}/${entityId}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          note: noteText.trim(),
          author_name: author,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to submit internal note.');
      }

      setNoteText('');
      setIsNoteBoxExpanded(false);
      await fetchAuditTrail();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const toggleRowExpansion = (id) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleJsonView = (id, e) => {
    e.stopPropagation();
    setShowJsonMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'Just now';
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
      {/* 1. Header with accessible "Log Internal Note" button */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Activity Log</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-normal">
                {auditEvents.length} {auditEvents.length === 1 ? 'entry' : 'entries'}
              </span>
            </h3>
            <p className="ui-microcopy text-[12px] text-slate-500 dark:text-slate-400">
              History of updates and internal notes
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsNoteBoxExpanded(!isNoteBoxExpanded)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold transition cursor-pointer border border-blue-200 dark:border-blue-800 shadow-2xs"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{isNoteBoxExpanded ? 'Collapse Note' : 'Log Internal Note'}</span>
        </button>
      </div>

      {/* 2. Expandable Internal Note Composer */}
      {isNoteBoxExpanded && (
        <form onSubmit={handleLogNote} className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 animate-fadeIn">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-0">
              <User className="w-3.5 h-3.5 text-blue-500" />
              <span>Logging note as {currentUser?.full_name || 'Root Superadmin'}</span>
            </span>
            <span className="ui-microcopy text-[12px] italic text-slate-400">Internal authorized staff only</span>
          </div>

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            placeholder="Write internal operational note, document verification remark, or compliance follow-up..."
            className="w-full text-[14px] p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            disabled={isSubmittingNote}
            autoFocus
          />

          {errorMessage && (
            <p className="text-xs text-rose-500 flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsNoteBoxExpanded(false);
                setNoteText('');
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingNote || !noteText.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmittingNote ? 'Saving...' : 'Post Note'}</span>
            </button>
          </div>
        </form>
      )}

      {/* 3. Dense Scannable Timeline Feed: 36px - 44px row height */}
      <div className="space-y-1.5">
        {isLoading && auditEvents.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading activity timeline...</div>
        ) : auditEvents.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No activity records logged for this item yet.
          </div>
        ) : (
          auditEvents.map((evt, idx) => {
            const eventKey = evt.id || `event-${idx}`;
            const isExpanded = expandedRowIds.has(eventKey);
            const isJsonView = Boolean(showJsonMap[eventKey]);

            const isNote = evt.action === 'NOTE';
            const isEmail = evt.action === 'EMAIL';
            const isWhatsApp = evt.action === 'WHATSAPP';
            const isSMS = evt.action === 'SMS';
            const isCreate = evt.action === 'CREATE';
            const isUpdate = evt.action === 'UPDATE';
            const isDelete = evt.action === 'DELETE';

            const changesEntries = evt.changes ? Object.entries(evt.changes) : [];
            const hasMultipleChanges = changesEntries.length > 1;
            const hasDiffs = changesEntries.length > 0;
            const isExpandable = hasDiffs || isEmail || isWhatsApp || isSMS || Boolean(evt.note && evt.note.length > 70);

            // Single line preview diff
            const firstDiff = changesEntries[0];
            const firstDiffLabel = firstDiff
              ? firstDiff[0].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
              : null;
            const firstOldVal = firstDiff ? String(firstDiff[1]?.old ?? 'None') : '';
            const firstNewVal = firstDiff ? String(firstDiff[1]?.new ?? 'None') : '';

            return (
              <div
                key={eventKey}
                className="border border-slate-100 dark:border-slate-800/80 rounded-lg bg-slate-50/60 dark:bg-slate-800/30 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition overflow-hidden"
              >
                {/* Single-line row: [Avatar/Icon] [User Name] [Action badge] [Field Changed: Old -> New] [Timestamp] */}
                <div
                  className={`h-10 min-h-[40px] px-3 flex items-center gap-2.5 text-xs ${
                    isExpandable ? 'cursor-pointer select-none' : ''
                  }`}
                  onClick={() => isExpandable && toggleRowExpansion(eventKey)}
                  title={isExpandable ? (isExpanded ? 'Click to collapse details' : 'Click to expand full diff details') : undefined}
                >
                  {/* [Avatar/Icon] */}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white shadow-2xs ${
                      isWhatsApp
                        ? 'bg-emerald-600'
                        : isSMS
                        ? 'bg-sky-600'
                        : isEmail
                        ? 'bg-indigo-600'
                        : isNote
                        ? 'bg-amber-500'
                        : isCreate
                        ? 'bg-emerald-600'
                        : isDelete
                        ? 'bg-rose-600'
                        : 'bg-blue-600'
                    }`}
                  >
                    {isWhatsApp ? (
                      <MessageCircle className="w-3 h-3 text-white" />
                    ) : isSMS ? (
                      <Smartphone className="w-3 h-3 text-white" />
                    ) : isEmail ? (
                      <Mail className="w-3 h-3 text-white" />
                    ) : isNote ? (
                      <MessageSquare className="w-3 h-3 text-white" />
                    ) : isCreate ? (
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    ) : isDelete ? (
                      <AlertCircle className="w-3 h-3 text-white" />
                    ) : (
                      <Activity className="w-3 h-3 text-white" />
                    )}
                  </div>

                  {/* [User Name] */}
                  <span className="font-semibold text-slate-900 dark:text-slate-100 text-[13px] shrink-0 truncate max-w-[120px] sm:max-w-[160px]">
                    {evt.changed_by_name || 'System Operator'}
                  </span>

                  {/* [Action badge] */}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase shrink-0 ${
                      isWhatsApp
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : isSMS
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-400'
                        : isEmail
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400'
                        : isNote
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                        : isCreate
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : isDelete
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400'
                    }`}
                  >
                    {evt.action}
                  </span>

                  {/* [Field Changed: Old -> New] OR Note preview */}
                  <div className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-300">
                    {isWhatsApp ? (
                      <span className="text-[12px] text-emerald-700 dark:text-emerald-300 font-medium truncate block">
                        {evt.note}
                      </span>
                    ) : isSMS ? (
                      <span className="text-[12px] text-sky-700 dark:text-sky-300 font-medium truncate block">
                        {evt.note}
                      </span>
                    ) : isEmail ? (
                      <span className="text-[12px] text-indigo-700 dark:text-indigo-300 font-medium truncate block">
                        {evt.note}
                      </span>
                    ) : isNote ? (
                      <span className="italic text-[13px] text-slate-700 dark:text-slate-300 truncate block">
                        "{evt.note}"
                      </span>
                    ) : hasDiffs ? (
                      <span className="flex items-center gap-1.5 truncate text-[12px]">
                        <strong className="text-slate-800 dark:text-slate-200 font-medium shrink-0">
                          {firstDiffLabel}:
                        </strong>
                        <span className="line-through text-slate-400 font-mono text-[11px] truncate max-w-[90px] sm:max-w-none">
                          {firstOldVal}
                        </span>
                        <span className="text-slate-400 text-xs">→</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono text-[11px] truncate max-w-[90px] sm:max-w-none">
                          {firstNewVal}
                        </span>
                        {hasMultipleChanges && (
                          <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded shrink-0">
                            +{changesEntries.length - 1} more
                          </span>
                        )}
                      </span>
                    ) : isCreate ? (
                      <span className="text-[12px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
                        Initial record created
                      </span>
                    ) : (
                      <span className="text-[12px] text-slate-500 truncate">
                        Record state transitioned
                      </span>
                    )}
                  </div>

                  {/* [Timestamp] */}
                  <span className="ui-microcopy text-[12px] text-slate-500 dark:text-slate-400 font-mono shrink-0 ml-auto whitespace-nowrap">
                    {formatTimestamp(evt.created_at)}
                  </span>

                  {/* [Expand / Drawer Toggle] */}
                  {isExpandable && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowExpansion(eventKey);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer shrink-0"
                      title={isExpanded ? 'Collapse' : 'Expand full details'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {/* 4. Expandable Drawer for Multi-Line Details & Full JSON Diffs */}
                {isExpanded && (
                  <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs space-y-2.5 animate-fadeIn">
                    {/* Full note if present */}
                    {evt.note && (
                      <div className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                        isWhatsApp
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                          : isSMS
                          ? 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-200/60 dark:border-sky-800/40 text-sky-900 dark:text-sky-200'
                          : isEmail
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200/60 dark:border-indigo-800/40 text-indigo-900 dark:text-indigo-200'
                          : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40 text-amber-900 dark:text-amber-200'
                      }`}>
                        <strong className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                          isWhatsApp ? 'text-emerald-700 dark:text-emerald-400' : isSMS ? 'text-sky-700 dark:text-sky-400' : isEmail ? 'text-indigo-700 dark:text-indigo-400' : 'text-amber-700 dark:text-amber-400'
                        }`}>
                          {isWhatsApp ? 'WhatsApp Notice Dispatched:' : isSMS ? 'SMS Alert Dispatched:' : isEmail ? 'Email Notice Dispatched:' : 'Operational Note:'}
                        </strong>
                        {evt.note}
                      </div>
                    )}

                    {/* All Field Diffs */}
                    {hasDiffs && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            All Recorded Field Changes ({changesEntries.length}):
                          </span>
                          <button
                            type="button"
                            onClick={(e) => toggleJsonView(eventKey, e)}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-mono"
                          >
                            <Code2 className="w-3 h-3" />
                            <span>{isJsonView ? 'Visual View' : 'Raw JSON Diff'}</span>
                          </button>
                        </div>

                        {isJsonView ? (
                          <pre className="p-2.5 rounded-lg bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto leading-tight border border-slate-800">
                            {JSON.stringify(evt.changes, null, 2)}
                          </pre>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {changesEntries.map(([fName, diff]) => {
                              const label = fName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                              return (
                                <div
                                  key={fName}
                                  className="flex items-center justify-between p-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-[11px]"
                                >
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate mr-2">
                                    {label}:
                                  </span>
                                  <div className="flex items-center gap-1.5 font-mono shrink-0">
                                    <span className="line-through text-slate-400">
                                      {String(diff?.old ?? 'None')}
                                    </span>
                                    <span className="text-slate-400">→</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                      {String(diff?.new ?? 'None')}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default RecordChatter;
