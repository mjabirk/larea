import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Send,
  Paperclip,
  X,
  CheckCircle2,
  AlertCircle,
  Code2,
  Eye,
} from 'lucide-react';
import { useModalEscape } from '../../hooks/useModalEscape';
import { useTenancy } from '../../context/TenancyContext';

export function SendEmailModal({
  isOpen,
  onClose,
  recordModel, // e.g. "payroll.payslip", "hr.employee", "hr.leave"
  recordId,
  recordData = {},
  defaultRecipient = '',
  defaultToEmail = '',
  defaultRecipientName = '',
  defaultSubject = '',
  onSuccess,
  onSent,
}) {
  const { currentOrganization } = useTenancy();
  const companyName =
    currentOrganization?.name ||
    currentOrganization?.legal_name ||
    'Company';

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mailServers, setMailServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState('');

  const initialTo = defaultRecipient || defaultToEmail || recordData.work_email || '';
  const [toAddresses, setToAddresses] = useState(initialTo);
  const [ccAddresses, setCcAddresses] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject || '');
  const [bodyHtml, setBodyHtml] = useState('');
  const [showHtmlSource, setShowHtmlSource] = useState(false);

  const isPayslip = recordModel === 'payroll.payslip';
  const [attachSystemReport, setAttachSystemReport] = useState(isPayslip);

  const [customAttachments, setCustomAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);

  useModalEscape(onClose, isOpen, modalRef);

  const getAuthHeaders = () => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('enterprise_auth_token') ||
          sessionStorage.getItem('enterprise_auth_token')
        : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const interpolatePreview = (str, data = {}) => {
    if (!str) return '';
    const statusLabel = String(
      data.status || data.approval_status || 'Updated'
    ).replace(/_/g, ' ');
    const remarksLabel =
      data.remarks || data.rejection_reason || data.reason || '—';
    const todayStr = new Date().toISOString().slice(0, 10);

    const replacements = {
      employee_name:
        data.employee_name ||
        data.full_name ||
        defaultRecipientName ||
        'Team Member',
      employee_number: data.employee_number || '—',
      month: data.month || data.batch_month || 'Current Period',
      net_salary:
        data.net_salary !== undefined && data.net_salary !== null
          ? Number(data.net_salary).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })
          : '0.00',
      base_salary:
        data.base_salary !== undefined && data.base_salary !== null
          ? Number(data.base_salary).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })
          : '0.00',
      deductions:
        data.deductions !== undefined && data.deductions !== null
          ? Number(data.deductions).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })
          : '0.00',
      overtime_pay:
        data.overtime_pay !== undefined && data.overtime_pay !== null
          ? Number(data.overtime_pay).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })
          : '0.00',
      bank_name: data.bank_name || 'Bank Transfer',
      bank_iban: data.bank_iban || '—',
      job_title: data.job_title || 'Staff',
      department: data.department || 'General',
      company_name: companyName,
      leave_type: data.leave_type || data.leave_type_name || 'Leave',
      start_date: data.start_date || todayStr,
      end_date: data.end_date || data.start_date || todayStr,
      total_days:
        data.total_days !== undefined && data.total_days !== null
          ? String(data.total_days)
          : '1',
      status: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
      remarks: remarksLabel,
      hire_date: data.hire_date || todayStr,
      today: todayStr,
    };

    return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      const lower = key.toLowerCase();
      if (replacements[lower] !== undefined) return replacements[lower];
      if (data[key] !== undefined && data[key] !== null) return String(data[key]);
      return '';
    });
  };

  const syncEditorDom = (html) => {
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html || '';
    }
  };

  // Load templates and mail servers when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setToAddresses(defaultRecipient || defaultToEmail || recordData.work_email || '');
    setCcAddresses('');
    setShowCc(false);
    setShowHtmlSource(false);
    setErrorMsg('');
    setSuccessMsg('');
    setCustomAttachments([]);
    setAttachSystemReport(recordModel === 'payroll.payslip');

    const loadConfig = async () => {
      try {
        const [tmplRes, srvRes] = await Promise.all([
          fetch(
            `/api/v1/mail/templates?model_scope=${encodeURIComponent(
              recordModel || 'custom'
            )}`,
            { headers: getAuthHeaders() }
          ),
          fetch('/api/v1/mail/servers', { headers: getAuthHeaders() }),
        ]);

        if (tmplRes.ok) {
          const tData = await tmplRes.json();
          const tmpls = tData.templates || [];
          setTemplates(tmpls);

          if (tmpls.length > 0) {
            const first = tmpls[0];
            const nextSubject = interpolatePreview(first.subject, recordData);
            const nextBody = interpolatePreview(first.body_html, recordData);
            setSelectedTemplateId(first.id);
            setSubject(nextSubject);
            setBodyHtml(nextBody);
            syncEditorDom(nextBody);
            setAttachSystemReport(
              recordModel === 'payroll.payslip' && Boolean(first.attach_system_report)
            );
          } else {
            const fallbackBody = `<p>Hello ${
              recordData.employee_name || defaultRecipientName || 'there'
            },</p><p>Please find the details below.</p>`;
            setSelectedTemplateId('');
            setSubject(
              defaultSubject ||
                `${companyName} — ${defaultRecipientName || 'Notification'}`
            );
            setBodyHtml(fallbackBody);
            syncEditorDom(fallbackBody);
          }
        }

        if (srvRes.ok) {
          const sData = await srvRes.json();
          const outServers = (sData.servers || []).filter(
            (s) => s.server_type === 'outgoing'
          );
          setMailServers(outServers);
          const defServer = outServers.find((s) => s.is_default) || outServers[0];
          if (defServer) setSelectedServerId(defServer.id);
        }
      } catch (err) {
        console.warn('Failed to load email configurations:', err);
      }
    };

    loadConfig();
  }, [isOpen, recordModel, defaultRecipient, defaultToEmail, defaultRecipientName]);

  // Sync visual editor when toggling from HTML source back to visual preview
  useEffect(() => {
    if (!showHtmlSource && editorRef.current) {
      editorRef.current.innerHTML = bodyHtml || '';
    }
  }, [showHtmlSource]);

  const handleTemplateChange = (tmplId) => {
    setSelectedTemplateId(tmplId);
    const tmpl = templates.find((t) => t.id === tmplId);
    if (tmpl) {
      const nextSubject = interpolatePreview(tmpl.subject, recordData);
      const nextBody = interpolatePreview(tmpl.body_html, recordData);
      setSubject(nextSubject);
      setBodyHtml(nextBody);
      syncEditorDom(nextBody);
      if (isPayslip) {
        setAttachSystemReport(Boolean(tmpl.attach_system_report));
      }
    }
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setErrorMsg('');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/v1/mail/attachments/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setCustomAttachments((prev) => [
            ...prev,
            {
              filename: data.filename,
              disk_path: data.disk_path,
              file_size_bytes: data.file_size_bytes,
              mime_type: data.mime_type,
            },
          ]);
        } else {
          throw new Error('Could not upload ' + file.name);
        }
      } catch (err) {
        setErrorMsg(err.message || 'Failed to upload attachment.');
      }
    }
    setIsUploading(false);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!toAddresses.trim()) {
      setErrorMsg('Please enter at least one recipient email address.');
      return;
    }

    setIsSending(true);
    setErrorMsg('');
    setSuccessMsg('');

    const toList = toAddresses
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ccList = ccAddresses
      ? ccAddresses
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    try {
      const payload = {
        mail_server_id: selectedServerId || null,
        template_id: selectedTemplateId || null,
        record_model: recordModel,
        record_id: recordId ? String(recordId) : null,
        to_addresses: toList,
        cc_addresses: ccList,
        subject,
        body_html: bodyHtml,
        attach_system_report: isPayslip ? attachSystemReport : false,
        custom_attachments: customAttachments,
      };

      const res = await fetch('/api/v1/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Could not send email.');
      }

      setSuccessMsg('Email sent.');

      window.dispatchEvent(
        new CustomEvent('larea-record-chatter-updated', {
          detail: { recordModel, recordId },
        })
      );

      if (onSuccess) onSuccess(data);
      if (onSent) onSent(data);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setErrorMsg(err.message || 'Could not send email.');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-email-modal-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Clean Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-600 text-white">
              <Mail className="w-4 h-4" />
            </div>
            <h3
              id="send-email-modal-title"
              className="font-semibold text-slate-900 dark:text-white text-sm"
            >
              Send Email
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSend} className="p-5 overflow-y-auto space-y-3.5 text-xs">
          {errorMsg && (
            <div
              role="status"
              aria-live="polite"
              className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-medium flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              aria-live="polite"
              className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Template (and From Server only when multiple exist) */}
          {(templates.length > 0 || mailServers.length > 1) && (
            <div
              className={`grid grid-cols-1 ${
                templates.length > 0 && mailServers.length > 1
                  ? 'sm:grid-cols-2'
                  : ''
              } gap-3`}
            >
              {templates.length > 0 && (
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Template
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mailServers.length > 1 && (
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Send From
                  </label>
                  <select
                    value={selectedServerId}
                    onChange={(e) => setSelectedServerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {mailServers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* To & Optional Cc */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-600 dark:text-slate-300">
                To
              </label>
              {!showCc && !ccAddresses && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  + Add Cc
                </button>
              )}
            </div>
            <input
              type="text"
              required
              placeholder="name@company.com"
              value={toAddresses}
              onChange={(e) => setToAddresses(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {(showCc || Boolean(ccAddresses)) && (
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                Cc
              </label>
              <input
                type="text"
                placeholder="colleague@company.com"
                value={ccAddresses}
                onChange={(e) => setCcAddresses(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              Subject
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Message Editor (Clean Visual Mode by default, optional HTML toggle) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-600 dark:text-slate-300">
                Message
              </label>
              <button
                type="button"
                onClick={() => setShowHtmlSource((prev) => !prev)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                {showHtmlSource ? (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Visual preview</span>
                  </>
                ) : (
                  <>
                    <Code2 className="w-3 h-3" />
                    <span>Edit HTML</span>
                  </>
                )}
              </button>
            </div>

            {showHtmlSource ? (
              <textarea
                rows={7}
                required
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setBodyHtml(e.currentTarget.innerHTML)}
                className="w-full min-h-[160px] max-h-[260px] overflow-y-auto p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white text-slate-800 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Compact Attachments Bar */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition cursor-pointer"
                >
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                  <span>{isUploading ? 'Uploading...' : 'Attach file'}</span>
                </button>
              </div>

              {isPayslip && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300 font-medium">
                  <input
                    type="checkbox"
                    checked={attachSystemReport}
                    onChange={(e) => setAttachSystemReport(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Attach Payslip PDF</span>
                </label>
              )}
            </div>

            {customAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customAttachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-xs"
                  >
                    <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate max-w-[180px] text-slate-700 dark:text-slate-200">
                      {att.filename}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomAttachments((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      aria-label={`Remove ${att.filename}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clean Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || isUploading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'Sending...' : 'Send Email'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
