import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Clock,
  User,
  Send,
  Sparkles,
  Tag,
  AlertCircle,
  FileText,
  Activity,
  History,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenancy } from '../../context/TenancyContext';

export function RecordChatter({ entityType, entityId, entityName }) {
  const { currentUser } = useAuth();
  const { users } = useTenancy();

  const [auditEvents, setAuditEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isNoteBoxExpanded, setIsNoteBoxExpanded] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
  }, [fetchAuditTrail]);

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

  const getInitials = (name) => {
    if (!name) return 'SYS';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <span>Record Chatter & Audit Trail</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-normal">
                {auditEvents.length} entries
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Odoo-style immutable change logs, field modifications & operational discussions
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsNoteBoxExpanded(!isNoteBoxExpanded)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold transition cursor-pointer border border-blue-200 dark:border-blue-800"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{isNoteBoxExpanded ? 'Collapse Note' : 'Log Internal Note'}</span>
        </button>
      </div>

      {/* Expandable Log Note Input */}
      {isNoteBoxExpanded && (
        <form onSubmit={handleLogNote} className="space-y-3 p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 animate-fadeIn">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Logging as {currentUser?.full_name || 'Root Superadmin'}</span>
            </span>
            <span className="text-[11px] italic">Visible to authorized staff only</span>
          </div>

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="Write internal operational note, document verification remark, or compliance follow-up..."
            className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSubmittingNote}
            autoFocus
          />

          {errorMessage && (
            <p className="text-xs text-rose-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
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
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmittingNote ? 'Saving...' : 'Post Note'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Activity Timeline Stream */}
      <div className="space-y-4 relative before:absolute before:top-2 before:bottom-2 before:left-[17px] before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
        {isLoading && auditEvents.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading activity timeline...</div>
        ) : auditEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No activity records logged for this item yet.
          </div>
        ) : (
          auditEvents.map((evt, idx) => {
            const isNote = evt.action === 'NOTE';
            const isCreate = evt.action === 'CREATE';
            const isUpdate = evt.action === 'UPDATE';
            const isDelete = evt.action === 'DELETE';

            return (
              <div key={evt.id || idx} className="relative flex items-start gap-3.5 pl-1 animate-fadeIn">
                {/* Timeline Node Badge */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-[11px] ring-4 ring-white dark:ring-slate-900 z-10 shadow-xs ${
                    isNote
                      ? 'bg-amber-500'
                      : isCreate
                      ? 'bg-emerald-600'
                      : isDelete
                      ? 'bg-rose-600'
                      : 'bg-blue-600'
                  }`}
                  title={evt.action}
                >
                  {isNote ? (
                    <MessageSquare className="w-3.5 h-3.5 text-white" />
                  ) : isCreate ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  ) : isDelete ? (
                    <AlertCircle className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Activity className="w-3.5 h-3.5 text-white" />
                  )}
                </div>

                {/* Event Content Card */}
                <div className="flex-1 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 text-xs text-slate-700 dark:text-slate-200">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {evt.changed_by_name || 'System Operator'}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                          isNote
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
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                      <span>{formatTimestamp(evt.created_at)}</span>
                      {evt.ip_address && (
                        <span className="hidden sm:inline opacity-70">• {evt.ip_address}</span>
                      )}
                    </div>
                  </div>

                  {/* Operational Note Bubble */}
                  {evt.note && (
                    <div
                      className={`mt-1 p-2.5 rounded-lg text-xs leading-relaxed ${
                        isNote
                          ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40 text-amber-900 dark:text-amber-200 font-sans'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {evt.note}
                    </div>
                  )}

                  {/* Field Modifications Diff Badges */}
                  {evt.changes && Object.keys(evt.changes).length > 0 && (
                    <div className="mt-2.5 space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/40">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Field Diffs Recorded:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(evt.changes).map(([field, diff]) => {
                          const oldVal = diff?.old ?? 'None';
                          const newVal = diff?.new ?? 'None';
                          const label = field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

                          return (
                            <span
                              key={field}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px]"
                            >
                              <strong className="text-slate-900 dark:text-slate-100">{label}:</strong>
                              <span className="line-through text-slate-400 font-mono text-[10px]">{String(oldVal)}</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono text-[10px]">{String(newVal)}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
