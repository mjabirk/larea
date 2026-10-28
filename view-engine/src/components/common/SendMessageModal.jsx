import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MessageCircle,
  Smartphone,
  Send,
  X,
  FileDown,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenancy } from '../../context/TenancyContext';
import { useModalEscape } from '../../hooks/useModalEscape';

export function SendMessageModal({
  isOpen,
  onClose,
  recordModel,
  recordId,
  recordData = {},
  defaultChannel = 'whatsapp',
  onSuccess,
}) {
  const auth = useAuth();
  const { currentOrganization } = useTenancy();
  const companyName =
    currentOrganization?.name ||
    currentOrganization?.legal_name ||
    'Company';

  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') ||
        sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [channel, setChannel] = useState(defaultChannel);
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variableValues, setVariableValues] = useState({});
  const [attachReport, setAttachReport] = useState(false);

  const [smsText, setSmsText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const modalRef = useRef(null);
  useModalEscape(onClose, isOpen, modalRef);

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  const isPayslip = Boolean(
    recordModel && recordModel.toLowerCase().includes('payslip')
  );

  useEffect(() => {
    if (recordData) {
      const phone =
        recordData.phone ||
        recordData.mobile ||
        recordData.employee_phone ||
        recordData.contact_number ||
        recordData.mobile_phone ||
        '';
      const name =
        recordData.employee_name ||
        recordData.name ||
        recordData.full_name ||
        'Team Member';

      setRecipientPhone(phone);
      setRecipientName(name);
      setAttachReport(isPayslip);
    }
  }, [recordData, isPayslip]);

  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    const fetchTemplates = async () => {
      try {
        const scopeParam = recordModel || '';
        const url = scopeParam
          ? `/api/v1/communication/whatsapp-templates?model_scope=${scopeParam}`
          : '/api/v1/communication/whatsapp-templates';
        const res = await fetch(url, { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          const approved = (data.templates || []).filter(
            (t) => t.approval_status === 'APPROVED' || t.approval_status === 'DRAFT'
          );
          setTemplates(approved);
          if (approved.length > 0) {
            setSelectedTemplateId(approved[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load WhatsApp templates:', e);
      }
    };

    fetchTemplates();
  }, [isOpen, recordModel, getHeaders]);

  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (!activeTemplate) return;

    let varMap = {};
    try {
      varMap = JSON.parse(activeTemplate.variable_mapping_json || '{}');
    } catch (e) {}

    const matches = activeTemplate.body_text?.match(/\{\{(\d+)\}\}/g) || [];
    const uniqueNums = Array.from(
      new Set(matches.map((m) => m.replace(/[\{\}]/g, '')))
    );

    const initialValues = {};
    uniqueNums.forEach((num) => {
      const fieldKey = varMap[num];
      if (fieldKey && recordData[fieldKey] !== undefined) {
        initialValues[num] = String(recordData[fieldKey]);
      } else if (fieldKey === 'employee_name' && recipientName) {
        initialValues[num] = recipientName;
      } else if (fieldKey === 'salary_month' && recordData.month) {
        initialValues[num] = recordData.month;
      } else if (fieldKey === 'net_salary_qar' && recordData.net_salary !== undefined) {
        initialValues[num] = String(recordData.net_salary);
      } else if (fieldKey === 'leave_type' && recordData.leave_type) {
        initialValues[num] = recordData.leave_type;
      } else if (fieldKey === 'start_date' && recordData.start_date) {
        initialValues[num] = recordData.start_date;
      } else if (fieldKey === 'status' && (recordData.status || recordData.approval_status)) {
        initialValues[num] = recordData.status || recordData.approval_status;
      } else {
        initialValues[num] = '';
      }
    });

    setVariableValues(initialValues);
  }, [activeTemplate, recordData, recipientName]);

  useEffect(() => {
    if (isPayslip) {
      const m = recordData.month || 'Current Period';
      const net = recordData.net_salary ? ` (${recordData.net_salary})` : '';
      setSmsText(
        `${companyName}: Hello ${recipientName}, your payslip for ${m} is ready${net}.`
      );
    } else if (recordModel && recordModel.toLowerCase().includes('leave')) {
      setSmsText(
        `${companyName}: Hello ${recipientName}, your ${
          recordData.leave_type || 'leave'
        } request status is ${recordData.status || recordData.approval_status || 'updated'}.`
      );
    } else {
      setSmsText(`${companyName}: Hello ${recipientName}, you have a new update.`);
    }
  }, [recordModel, recordData, recipientName, companyName, isPayslip]);

  const previewWhatsAppBody = useMemo(() => {
    if (!activeTemplate) return '';
    let body = activeTemplate.body_text || '';
    Object.entries(variableValues).forEach(([pos, val]) => {
      body = body.replace(new RegExp(`\\{\\{${pos}\\}\\}`, 'g'), val || `{{${pos}}}`);
    });
    return body;
  }, [activeTemplate, variableValues]);

  const handleSendMessage = async () => {
    if (!recipientPhone.trim()) {
      setFeedback({ type: 'error', text: 'Please enter a phone number.' });
      return;
    }

    if (channel === 'whatsapp' && !selectedTemplateId) {
      setFeedback({ type: 'error', text: 'Please select a template.' });
      return;
    }

    if (channel === 'sms' && !smsText.trim()) {
      setFeedback({ type: 'error', text: 'Message cannot be empty.' });
      return;
    }

    setIsSending(true);
    setFeedback(null);

    try {
      const payload = {
        channel,
        recipient_phone: recipientPhone.trim(),
        recipient_name: recipientName,
        record_model: recordModel,
        record_id: String(recordId || ''),
        template_id: channel === 'whatsapp' ? selectedTemplateId : null,
        variable_values: channel === 'whatsapp' ? variableValues : null,
        message_text: channel === 'sms' ? smsText : null,
        attach_system_report: channel === 'whatsapp' && isPayslip ? attachReport : false,
        record_data: recordData,
      };

      const res = await fetch('/api/v1/communication/send', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.status === 'sent') {
        setFeedback({ type: 'success', text: 'Message sent.' });
        window.dispatchEvent(
          new CustomEvent('larea-record-chatter-updated', {
            detail: { recordModel, recordId },
          })
        );
        if (onSuccess) onSuccess(data);
        setTimeout(() => {
          onClose();
        }, 900);
      } else {
        setFeedback({
          type: 'error',
          text: data.error || data.detail || 'Could not send message.',
        });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error while sending message.' });
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-message-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Clean Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg text-white ${
                channel === 'whatsapp' ? 'bg-emerald-600' : 'bg-sky-600'
              }`}
            >
              {channel === 'whatsapp' ? (
                <MessageCircle className="w-4 h-4" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
            </div>
            <h3
              id="send-message-title"
              className="text-sm font-semibold text-slate-900 dark:text-white"
            >
              Send Message
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setChannel('whatsapp')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                  channel === 'whatsapp'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setChannel('sms')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                  channel === 'sms'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                SMS
              </button>
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
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 text-xs">
          {feedback && (
            <div
              role="status"
              aria-live="polite"
              className={`p-2.5 rounded-lg border flex items-center justify-between ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Recipient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                Recipient Name
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                required
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+974 5500 0000"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {channel === 'whatsapp' && (
            <div className="space-y-3.5">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Template
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {templates.length === 0 ? (
                    <option value="">No templates available</option>
                  ) : (
                    templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.template_name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {Object.keys(variableValues).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Object.entries(variableValues).map(([pos, val]) => (
                    <div key={pos}>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Field {pos}
                      </label>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) =>
                          setVariableValues({
                            ...variableValues,
                            [pos]: e.target.value,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-600 dark:text-slate-300">
                    Preview
                  </label>
                  {isPayslip && (
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300 font-medium">
                      <input
                        type="checkbox"
                        checked={attachReport}
                        onChange={(e) => setAttachReport(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Attach Payslip PDF</span>
                    </label>
                  )}
                </div>

                <div className="bg-slate-100 dark:bg-[#0B141A] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="max-w-[90%] bg-[#005C4B] text-white rounded-xl rounded-tl-none p-3 space-y-1.5 text-xs">
                    {isPayslip && attachReport && (
                      <div className="bg-[#025142] rounded-lg p-2 flex items-center gap-2 border border-[#006e5a]">
                        <FileDown className="w-4 h-4 text-emerald-300 shrink-0" />
                        <span className="font-medium text-[11px] text-emerald-100 truncate">
                          Payslip_{recipientName.replace(/\s+/g, '_')}.pdf
                        </span>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed text-xs text-slate-100">
                      {previewWhatsAppBody || 'Select a template above.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {channel === 'sms' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-slate-600 dark:text-slate-300">
                  Message
                </label>
                <span className="text-[11px] text-slate-400">
                  {(smsText || '').length} chars
                </span>
              </div>
              <textarea
                rows={4}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          )}
        </div>

        {/* Clean Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSending}
            onClick={handleSendMessage}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              channel === 'whatsapp'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {isSending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{isSending ? 'Sending...' : 'Send Message'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
