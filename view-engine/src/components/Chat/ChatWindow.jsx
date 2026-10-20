import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Paperclip,
  Loader2,
  FileText,
  CheckCheck,
  Download,
  ExternalLink,
  Eye,
  X,
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChatChannel } from '../../hooks/useChatChannel';
import { useLocale } from '../../context/LocaleContext';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Enterprise ChatWindow Component
 * Features:
 * - Dual-alignment bubble rendering (is_me: emerald-600 right, incoming: slate-800 left)
 * - Real-time WebSocket connection with automatic backoff reconnection & 3.5s polling
 * - Rich Attachment preview & Lightbox viewer with download & open tab actions
 * - Smooth auto-scroll and audio chime on incoming messages
 */
export function ChatWindow({ channelId, channelTitle = 'Chat Channel' }) {
  const { t } = useLocale();
  const { currentUser, user, session, token } = useAuth();
  const currentUserId = String(currentUser?.id || session?.user?.id || session?.id || session?.user_id || user?.id || '').toLowerCase();
  const myEmail = String(currentUser?.email || session?.user?.email || session?.email || user?.email || '').toLowerCase();

  const {
    messages,
    isLoading,
    isConnected,
    sendWsMessage
  } = useChatChannel(channelId, token);

  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Attachment URL resolver with authentication token
  const getAttachmentUrl = useCallback(
    (att, download = false) => {
      if (!att) return '#';
      let url = att.file_url || att.url;
      if (!url && att.disk_path) {
        const cleanPath = String(att.disk_path).replace(/\\/g, '/').replace(/^\/?storage\/chat_attachments\//, '');
        url = `/api/v1/chat/attachments/${cleanPath}`;
      }
      if (!url) return '#';
      const params = [];
      if (token && !url.includes('token=')) {
        params.push(`token=${encodeURIComponent(token)}`);
      }
      if (download && !url.includes('download=')) {
        params.push('download=1');
      }
      if (params.length > 0) {
        url += (url.includes('?') ? '&' : '?') + params.join('&');
      }
      return url;
    },
    [token]
  );

  const isImageAttachment = useCallback((att) => {
    if (!att) return false;
    if (att.mime_type && att.mime_type.startsWith('image/')) return true;
    const name = (att.name || att.filename || att.disk_path || '').toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (file.size > 25 * 1024 * 1024) {
      setUploadError('File size exceeds the 25MB limit.');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/chat/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setAttachments((prev) => [...prev, data.attachment]);
      } else {
        setUploadError('File upload failed. Please try again.');
        setTimeout(() => setUploadError(null), 4000);
      }
    } catch (err) {
      console.error('File upload error:', err);
      setUploadError('File upload error: ' + (err.message || 'Network error'));
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() && !attachments.length) return;
    const text = inputText.trim();
    const payloadAttachments = attachments;

    setInputText('');
    setAttachments([]);
    await sendWsMessage(text, payloadAttachments);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-slate-100 relative">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-white">{channelTitle}</span>
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            }`}
            title={isConnected ? 'Live WebSocket Connected' : 'Connecting WebSocket...'}
          />
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs bg-slate-900/60">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
            <span>Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 italic">
            No messages yet. Send a message to begin the conversation.
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe =
              Boolean(msg.is_me) ||
              Boolean(
                (currentUserId && String(msg.sender_id || msg.senderId || '').toLowerCase() === currentUserId) ||
                (myEmail && String(msg.sender_email || msg.senderEmail || '').toLowerCase() === myEmail)
              );

            return (
              <div
                key={msg.id || idx}
                className={`flex flex-col w-full mb-3 ${isMe ? 'items-end' : 'items-start'}`}
              >
                {/* Display sender name ONLY for incoming messages from others */}
                {!isMe && (
                  <span className="text-[10px] text-slate-400 font-semibold mb-1 px-1">
                    {msg.sender_name || 'Team Member'}
                  </span>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-xs break-words shadow-xs select-text ${
                    isMe
                      ? 'bg-emerald-600 dark:bg-emerald-600 text-white rounded-br-xs'
                      : 'bg-slate-800 text-slate-100 border border-slate-700/60 rounded-bl-xs'
                  }`}
                >
                  {msg.content || msg.text || msg.message ? (
                    <p className="leading-relaxed whitespace-pre-wrap">
                      {msg.content || msg.text || msg.message}
                    </p>
                  ) : null}

                  {/* Attachments rendering */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.attachments.map((att, attIdx) => {
                        const isImg = isImageAttachment(att);
                        const viewUrl = getAttachmentUrl(att, false);
                        const dlUrl = getAttachmentUrl(att, true);
                        const fileName = att.name || att.filename || att.file_name || 'Attachment';

                        if (isImg) {
                          return (
                            <div
                              key={attIdx}
                              className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/30 shadow-md max-w-xs transition-all hover:border-emerald-500/50"
                            >
                              <div
                                onClick={() => setPreviewImage({ url: viewUrl, name: fileName, size: att.size, dlUrl })}
                                className="cursor-pointer relative overflow-hidden flex items-center justify-center bg-slate-950/60 min-h-[90px] max-h-52"
                                title="Click to open image preview"
                              >
                                <img
                                  src={viewUrl}
                                  alt={fileName}
                                  className="w-full h-full object-cover max-h-52 hover:scale-[1.02] transition-transform duration-200"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
                                  <span className="text-[10px] text-white font-medium truncate max-w-[140px] drop-shadow">
                                    {fileName}
                                  </span>
                                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <a
                                      href={viewUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 rounded-md bg-black/60 hover:bg-black/90 text-white transition-colors"
                                      title="Open in new tab"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                    <a
                                      href={dlUrl}
                                      download={fileName}
                                      className="p-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                      title="Download image"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                </div>
                              </div>
                              <div className="px-2 py-1 bg-black/40 flex items-center justify-between text-[10px] text-slate-300">
                                <span className="truncate flex-1 pe-2 font-mono">{formatBytes(att.size)}</span>
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage({ url: viewUrl, name: fileName, size: att.size, dlUrl })}
                                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-[10px] cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>{t('preview_file')}</span>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={attIdx}
                            className="flex items-center gap-2 p-2 rounded-xl bg-black/30 border border-white/10 hover:border-emerald-500/40 transition-all text-[11px] group"
                          >
                            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="truncate flex-1 min-w-0">
                              <a
                                href={viewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium hover:underline text-slate-100 truncate block"
                                title={`Open ${fileName}`}
                              >
                                {fileName}
                              </a>
                              <span className="text-[9px] opacity-70 font-mono block">
                                {formatBytes(att.size)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <a
                                href={viewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded bg-black/40 hover:bg-black/70 text-slate-300 hover:text-white transition-colors"
                                title="Open in new tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <a
                                href={dlUrl}
                                download={fileName}
                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                title="Download file"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div
                    className={`text-[9px] mt-1 flex items-center justify-end gap-1 font-mono ${
                      isMe ? 'text-emerald-200' : 'text-slate-400'
                    }`}
                  >
                    <span>
                      {msg.created_at
                        ? new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : ''}
                    </span>
                    {isMe && <span className="text-[10px]">✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending Attachments preview chips */}
      {attachments.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-950/70 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-md text-[11px] text-slate-300 border border-slate-700 flex-shrink-0"
            >
              {isImageAttachment(att) ? (
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className="truncate max-w-[120px]">{att.name || att.filename || 'Attachment'}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-rose-400 ms-0.5 cursor-pointer"
                title={t('cancel')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Error Accessible Toast */}
      {uploadError && (
        <div
          role="status"
          aria-live="polite"
          className="mx-3 mb-1 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between shadow-xs animate-fadeIn"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
            aria-label="Dismiss upload error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSend}
        className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center gap-2 relative"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          title={t('attach_file')}
          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0 cursor-pointer"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={t('type_message')}
          className="flex-1 bg-slate-800 text-slate-200 text-xs px-3 py-2 pe-10 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim() && !attachments.length}
          title={t('send')}
          className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-colors shadow-md cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Image Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-4">
              <div className="truncate min-w-0">
                <p className="text-xs font-semibold text-white truncate">{previewImage.name}</p>
                <p className="text-[10px] text-slate-400 font-mono">{formatBytes(previewImage.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition-colors"
                  title="Open in full browser window"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Tab</span>
                </a>
                <a
                  href={previewImage.dlUrl || previewImage.url}
                  download={previewImage.name}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                  title="Download original file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors cursor-pointer"
                  title="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Preview Body */}
            <div className="p-2 flex items-center justify-center overflow-auto max-h-[calc(90vh-60px)] bg-slate-950/40">
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-h-[calc(90vh-80px)] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
