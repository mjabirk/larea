import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageCircle,
  Smartphone,
  Send,
  X,
  FileDown,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Sparkles,
  Paperclip,
  Check,
  User,
  Phone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
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
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [channel, setChannel] = useState(defaultChannel);
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');

  // WhatsApp Tab State
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variableValues, setVariableValues] = useState({});
  const [attachReport, setAttachReport] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // SMS Tab State
  const [smsText, setSmsText] = useState('');
  const [smsSegments, setSmsSegments] = useState({
    segments: 1,
    character_count: 0,
    chars_left: 160,
    encoding: 'GSM-7',
    char_limit: 160,
  });

  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useModalEscape(isOpen, onClose);

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  // Initialize recipient phone and name from recordData
  useEffect(() => {
    if (recordData) {
      const phone =
        recordData.phone ||
        recordData.mobile ||
        recordData.employee_phone ||
        recordData.contact_number ||
        recordData.mobile_phone ||
        '+974 5599 8877';
      const name =
        recordData.employee_name ||
        recordData.name ||
        recordData.full_name ||
        'Valued Colleague';

      setRecipientPhone(phone);
      setRecipientName(name);

      // Default attach report for payslips
      if (recordModel && recordModel.toLowerCase().includes('payslip')) {
        setAttachReport(true);
      }
    }
  }, [recordData, recordModel]);

  // Fetch approved WhatsApp templates for recordModel
  useEffect(() => {
    if (!isOpen) return;
    const fetchTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const scopeParam = recordModel || '';
        const url = scopeParam
          ? `/api/v1/communication/whatsapp-templates?model_scope=${scopeParam}`
          : '/api/v1/communication/whatsapp-templates';
        const res = await fetch(url, { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          // Filter to APPROVED templates only
          const approved = (data.templates || []).filter(
            (t) => t.approval_status === 'APPROVED' || t.approval_status === 'DRAFT'
          );
          setTemplates(approved);
          if (approved.length > 0) {
            setSelectedTemplateId(approved[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load WhatsApp templates for modal:', e);
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    fetchTemplates();
  }, [isOpen, recordModel, getHeaders]);

  // Selected WhatsApp template object
  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  // Parse variables and auto-bind with recordData
  useEffect(() => {
    if (!activeTemplate) return;

    let varMap = {};
    try {
      varMap = JSON.parse(activeTemplate.variable_mapping_json || '{}');
    } catch (e) {}

    const matches = activeTemplate.body_text?.match(/\{\{(\d+)\}\}/g) || [];
    const uniqueNums = Array.from(new Set(matches.map((m) => m.replace(/[\{\}]/g, ''))));

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
      } else if (fieldKey === 'status' && recordData.status) {
        initialValues[num] = recordData.status;
      } else {
        initialValues[num] = `Value ${num}`;
      }
    });

    setVariableValues(initialValues);
  }, [activeTemplate, recordData, recipientName]);

  // Initialize SMS default text
  useEffect(() => {
    if (recordModel && recordModel.toLowerCase().includes('payslip')) {
      const m = recordData.month || 'Current Month';
      const net = recordData.net_salary ? ` QAR ${recordData.net_salary}` : '';
      setSmsText(`Apex Global: Dear ${recipientName}, your payslip for ${m} is confirmed${net}. Access portal to view.`);
    } else if (recordModel && recordModel.toLowerCase().includes('leave')) {
      setSmsText(`Apex Global: Dear ${recipientName}, your ${recordData.leave_type || 'leave'} request status is now: ${recordData.status || 'Updated'}.`);
    } else {
      setSmsText(`Apex Global Notice: Dear ${recipientName}, please review your enterprise portal for updates.`);
    }
  }, [recordModel, recordData, recipientName]);

  // Recalculate SMS segments on text change
  useEffect(() => {
    const text = smsText || '';
    const hasUnicode = /[^\u0000-\u007F]/.test(text);
    const encoding = hasUnicode ? 'UCS-2' : 'GSM-7';
    const singleLimit = hasUnicode ? 70 : 160;
    const concatLimit = hasUnicode ? 67 : 153;
    const len = text.length;

    let segCount = 1;
    let charsLeft = singleLimit - len;
    if (len > singleLimit) {
      segCount = Math.ceil(len / concatLimit);
      charsLeft = segCount * concatLimit - len;
    }

    setSmsSegments({
      segments: segCount,
      character_count: len,
      chars_left: Math.max(0, charsLeft),
      encoding,
      char_limit: singleLimit,
    });
  }, [smsText]);

  // WhatsApp live preview body with replaced values
  const previewWhatsAppBody = useMemo(() => {
    if (!activeTemplate) return '';
    let body = activeTemplate.body_text || '';
    Object.entries(variableValues).forEach(([pos, val]) => {
      body = body.replace(new RegExp(`\\{\\{${pos}\\}\\}`, 'g'), val || `{{${pos}}}`);
    });
    return body;
  }, [activeTemplate, variableValues]);

  // Dispatch message
  const handleSendMessage = async () => {
    if (!recipientPhone.trim()) {
      setFeedback({ type: 'error', text: 'Recipient phone number is required.' });
      return;
    }

    if (channel === 'whatsapp' && !selectedTemplateId) {
      setFeedback({ type: 'error', text: 'Please select an approved WhatsApp template.' });
      return;
    }

    if (channel === 'sms' && !smsText.trim()) {
      setFeedback({ type: 'error', text: 'SMS message text cannot be empty.' });
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
        attach_system_report: channel === 'whatsapp' ? attachReport : false,
        record_data: recordData,
      };

      const res = await fetch('/api/v1/communication/send', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.status === 'sent') {
        setFeedback({
          type: 'success',
          text: `Message successfully dispatched via ${channel.toUpperCase()}!`,
        });
        if (onSuccess) onSuccess(data);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setFeedback({
          type: 'error',
          text: data.error || data.detail || 'Dispatch failed. Check provider configuration.',
        });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Network error dispatching message.' });
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                channel === 'whatsapp'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
              }`}
            >
              {channel === 'whatsapp' ? (
                <MessageCircle className="w-4 h-4" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Send Record Notification</h3>
              <p className="text-[11px] text-slate-400">
                Dispatches to recipient with automatic Chatter logging.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Channel Tabs */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setChannel('whatsapp')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                  channel === 'whatsapp'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setChannel('sms')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                  channel === 'sms'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>SMS</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white transition cursor-pointer ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Feedback Toast */}
          {feedback && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                )}
                <span>{feedback.text}</span>
              </div>
              <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Recipient Coordinates Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" />
                Recipient Name
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 flex items-center gap-1">
                <Phone className="w-3 h-3 text-emerald-400" />
                Recipient Phone (E.164)
              </label>
              <input
                type="text"
                required
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+974 5599 8877"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-emerald-400 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* ==================== WHATSAPP TAB CONTENT ==================== */}
          {channel === 'whatsapp' && (
            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Select Approved Meta WhatsApp Template
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                >
                  {templates.length === 0 ? (
                    <option value="">No approved templates found for this model</option>
                  ) : (
                    templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.template_name} ({t.approval_status} • {t.model_scope})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Dynamic Variables Substitution Fields */}
              {Object.keys(variableValues).length > 0 && (
                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Template Parameters &amp; Record Data</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(variableValues).map(([pos, val]) => (
                      <div key={pos} className="space-y-0.5">
                        <label className="text-[10px] text-slate-400 font-mono">
                          Placeholder {`{{${pos}}}`}
                        </label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) =>
                            setVariableValues({ ...variableValues, [pos]: e.target.value })
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attach Report Toggle (if Payslip or has report) */}
              {recordModel && recordModel.toLowerCase().includes('payslip') && (
                <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileDown className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-semibold text-white">Attach Official Payslip PDF</div>
                      <div className="text-[10px] text-slate-400">
                        Generates system report to local disk and binds as Meta media document.
                      </div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachReport}
                      onChange={(e) => setAttachReport(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              )}

              {/* Message Bubble Preview */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Live WhatsApp Message Preview
                </label>
                <div className="bg-[#0B141A] p-3 rounded-lg border border-slate-800">
                  <div className="max-w-[85%] bg-[#005C4B] text-white rounded-lg rounded-tl-none p-3 shadow-md space-y-1.5 text-xs">
                    {attachReport && (
                      <div className="bg-[#025142] rounded p-2 flex items-center gap-2 border border-[#006e5a]">
                        <FileDown className="w-4 h-4 text-emerald-300" />
                        <div>
                          <div className="font-semibold text-[11px] text-emerald-100">
                            Payslip_{recipientName.replace(/\s+/g, '_')}.pdf
                          </div>
                          <div className="text-[9px] text-emerald-300">Official ERP PDF Document</div>
                        </div>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed text-[11px] text-slate-100 font-sans">
                      {previewWhatsAppBody || 'Select an approved template above.'}
                    </div>
                    {activeTemplate?.footer_text && (
                      <div className="text-[9px] text-slate-300 pt-1 border-t border-[#006e5a]/60">
                        {activeTemplate.footer_text}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== SMS TAB CONTENT ==================== */}
          {channel === 'sms' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-slate-300">SMS Text Body</label>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-slate-400">
                      Encoding: <strong className="text-white">{smsSegments.encoding}</strong>
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">
                      Segments:{' '}
                      <strong className="text-emerald-400">{smsSegments.segments}</strong>
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">
                      Chars remaining:{' '}
                      <strong className="text-sky-400">{smsSegments.chars_left}</strong>
                    </span>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Standard GSM-7 allows 160 chars / segment; Arabic/UCS-2 uses 70 chars.</span>
                <span className="text-slate-300 font-mono">
                  {smsSegments.character_count} Total Chars
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Action Strip */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Will automatically log into record Chatter history.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSending}
              onClick={handleSendMessage}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                channel === 'whatsapp'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-sky-600 hover:bg-sky-500'
              }`}
            >
              {isSending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{isSending ? 'Dispatching...' : `Send ${channel.toUpperCase()}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
