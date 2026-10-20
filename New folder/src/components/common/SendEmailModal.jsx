import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  Send,
  Paperclip,
  X,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Server,
  Trash2,
  FileSpreadsheet
} from 'lucide-react';

export function SendEmailModal({
  isOpen,
  onClose,
  recordModel, // e.g. "payroll.payslip", "hr.employee", "hr.leave"
  recordId,
  recordData = {},
  defaultRecipient = '',
  defaultRecipientName = '',
  onSuccess,
}) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mailServers, setMailServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState('');

  const [toAddresses, setToAddresses] = useState(defaultRecipient);
  const [ccAddresses, setCcAddresses] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [attachSystemReport, setAttachSystemReport] = useState(recordModel === 'payroll.payslip');

  const [customAttachments, setCustomAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef(null);

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // 1. Fetch templates and servers on modal open
  useEffect(() => {
    if (!isOpen) return;

    setToAddresses(defaultRecipient || recordData.work_email || '');
    setErrorMsg('');
    setSuccessMsg('');
    setCustomAttachments([]);

    const loadConfig = async () => {
      try {
        const [tmplRes, srvRes] = await Promise.all([
          fetch(`/api/v1/mail/templates?model_scope=${encodeURIComponent(recordModel || 'custom')}`, {
            headers: getAuthHeaders(),
          }),
          fetch('/api/v1/mail/servers', { headers: getAuthHeaders() }),
        ]);

        if (tmplRes.ok) {
          const tData = await tmplRes.json();
          const tmpls = tData.templates || [];
          setTemplates(tmpls);

          if (tmpls.length > 0) {
            const first = tmpls[0];
            setSelectedTemplateId(first.id);
            setSubject(interpolatePreview(first.subject, recordData));
            setBodyHtml(interpolatePreview(first.body_html, recordData));
            setAttachSystemReport(Boolean(first.attach_system_report));
          } else {
            setSelectedTemplateId('');
            setSubject(`Notification from Apex Global — ${defaultRecipientName || 'Workforce'}`);
            setBodyHtml('<p>Please find enclosed your requested corporate documentation.</p>');
          }
        }

        if (srvRes.ok) {
          const sData = await srvRes.json();
          const outServers = (sData.servers || []).filter((s) => s.server_type === 'outgoing');
          setMailServers(outServers);
          const defServer = outServers.find((s) => s.is_default) || outServers[0];
          if (defServer) setSelectedServerId(defServer.id);
        }
      } catch (err) {
        console.warn('Failed to load email configurations:', err);
      }
    };

    loadConfig();
  }, [isOpen, recordModel, defaultRecipient, defaultRecipientName]);

  const interpolatePreview = (str, data) => {
    if (!str) return '';
    return str
      .replace(/\{\{\s*employee_name\s*\}\}/gi, data.employee_name || data.full_name || defaultRecipientName || 'Employee')
      .replace(/\{\{\s*employee_number\s*\}\}/gi, data.employee_number || 'EMP')
      .replace(/\{\{\s*month\s*\}\}/gi, data.month || data.batch_month || 'October 2026')
      .replace(/\{\{\s*net_salary\s*\}\}/gi, data.net_salary ? Number(data.net_salary).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '28,500.00')
      .replace(/\{\{\s*base_salary\s*\}\}/gi, data.base_salary ? Number(data.base_salary).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '28,500.00')
      .replace(/\{\{\s*deductions\s*\}\}/gi, data.deductions ? Number(data.deductions).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00')
      .replace(/\{\{\s*bank_name\s*\}\}/gi, data.bank_name || 'Qatar National Bank (QNB)')
      .replace(/\{\{\s*bank_iban\s*\}\}/gi, data.bank_iban || 'QA55QNBA••••••••••••')
      .replace(/\{\{\s*job_title\s*\}\}/gi, data.job_title || 'Staff Specialist')
      .replace(/\{\{\s*department\s*\}\}/gi, data.department || 'Operations')
      .replace(/\{\{\s*company_name\s*\}\}/gi, 'Apex Global Enterprises Q.P.S.C.');
  };

  const handleTemplateChange = (tmplId) => {
    setSelectedTemplateId(tmplId);
    const tmpl = templates.find((t) => t.id === tmplId);
    if (tmpl) {
      setSubject(interpolatePreview(tmpl.subject, recordData));
      setBodyHtml(interpolatePreview(tmpl.body_html, recordData));
      setAttachSystemReport(Boolean(tmpl.attach_system_report));
    }
  };

  // Keyboard shortcut Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // File Upload to storage/mail_attachments
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
          throw new Error('Upload error for ' + file.name);
        }
      } catch (err) {
        setErrorMsg('Failed to upload file: ' + err.message);
      }
    }
    setIsUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!toAddresses.trim()) {
      setErrorMsg('Please specify at least one recipient email address.');
      return;
    }

    setIsSending(true);
    setErrorMsg('');
    setSuccessMsg('');

    const toList = toAddresses.split(',').map((s) => s.trim()).filter(Boolean);
    const ccList = ccAddresses ? ccAddresses.split(',').map((s) => s.trim()).filter(Boolean) : null;

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
        attach_system_report: attachSystemReport,
        custom_attachments: customAttachments,
      };

      const res = await fetch('/api/v1/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Email delivery failed.');
      }

      setSuccessMsg(`Email dispatched successfully! [${data.status.toUpperCase()}]`);

      // Trigger global event for Chatter refresh
      window.dispatchEvent(
        new CustomEvent('larea-record-chatter-updated', {
          detail: { recordModel, recordId },
        })
      );

      if (onSuccess) onSuccess(data);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setErrorMsg(err.message || 'SMTP delivery failure.');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-2xs">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Send by Email
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Dispatches record via enterprise SMTP with physical attachments & Chatter log sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSend} className="p-5 overflow-y-auto space-y-3.5 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Template & Server Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Select Email Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Outgoing Mail Server
              </label>
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-[11px]"
              >
                {mailServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.host}:{s.port})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Recipients */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                To Recipient(s) *
              </label>
              <input
                type="text"
                required
                placeholder="employee@company.local"
                value={toAddresses}
                onChange={(e) => setToAddresses(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cc (Optional)
              </label>
              <input
                type="text"
                placeholder="payroll@company.local, hr@company.local"
                value={ccAddresses}
                onChange={(e) => setCcAddresses(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Subject *
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Message Content (HTML)
            </label>
            <textarea
              rows={5}
              required
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Attachments Section */}
          <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
              <div className="flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                <span>Physical Disk Attachments</span>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
                <input
                  type="checkbox"
                  checked={attachSystemReport}
                  onChange={(e) => setAttachSystemReport(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Attach WPS Payslip PDF</span>
              </label>
            </div>

            {/* Generated PDF Report Badge Preview */}
            {attachSystemReport && (
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded bg-emerald-600 text-white font-bold text-[9px]">PDF</span>
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-xs">
                    Payslip_{recordData.month || recordData.batch_month || '2026-10'}_{recordData.employee_number || 'EMP'}.pdf
                  </span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Auto-Generated via ReportLab
                </span>
              </div>
            )}

            {/* Uploaded custom attachments */}
            {customAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {customAttachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs"
                  >
                    <span className="truncate max-w-[140px] text-slate-800 dark:text-slate-200">
                      {att.filename}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <Upload className="w-4 h-4 mx-auto text-slate-400 mb-1" />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isUploading ? 'Uploading to storage disk...' : 'Drag & drop additional files, or click to browse'}
              </p>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Dispatched event will be logged in this record's Activity Log.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition cursor-pointer"
              >
                Cancel (Esc)
              </button>
              <button
                type="submit"
                disabled={isSending || isUploading}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
                <span>{isSending ? 'Sending via SMTP...' : 'Send Email'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
