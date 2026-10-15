import React, { useState, useEffect, useRef } from 'react';
import { Minus, X, Send, Paperclip, FileText, Image as ImageIcon, Users, User, ArrowDown } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';

export default function ChatDock() {
  const { openDocks, minimizedDockIds, closeDock, minimizeDock, restoreDock } = useChat();

  if (!openDocks.length) return null;

  return (
    <div className="fixed bottom-0 right-4 z-50 flex items-end gap-2.5 pointer-events-none select-none">
      {openDocks.map((channel) => {
        const isMinimized = minimizedDockIds.has(channel.id);
        if (isMinimized) {
          return (
            <MinimizedPill
              key={channel.id}
              channel={channel}
              onRestore={() => restoreDock(channel.id)}
              onClose={() => closeDock(channel.id)}
            />
          );
        }
        return (
          <FloatingChatWindow
            key={channel.id}
            channel={channel}
            onMinimize={() => minimizeDock(channel.id)}
            onClose={() => closeDock(channel.id)}
          />
        );
      })}
    </div>
  );
}

// ==============================================================================
// 1. MINIMIZED PILL (Pinned to bottom dock)
// ==============================================================================

function MinimizedPill({ channel, onRestore, onClose }) {
  const { onlineUsers } = useChat();
  const otherUid = channel.other_user?.id;
  const isOnline = otherUid ? onlineUsers.has(otherUid) : false;
  const hasUnread = (channel.unread_count || 0) > 0;

  return (
    <div
      onClick={onRestore}
      className={`pointer-events-auto h-9 px-3 rounded-t-lg border border-b-0 flex items-center gap-2 cursor-pointer transition-all shadow-xl ${
        hasUnread
          ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200 animate-bounce'
          : 'bg-slate-900 border-slate-700/80 text-slate-200 hover:bg-slate-800'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isOnline ? 'bg-emerald-500' : 'bg-slate-500'
        }`}
      />
      <span className="text-xs font-medium truncate max-w-[130px]">
        {channel.name}
      </span>
      {hasUnread && (
        <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
          {channel.unread_count}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close chat"
        className="text-slate-400 hover:text-rose-400 p-0.5 rounded ml-1 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ==============================================================================
// 2. EXPANDED FLOATING CHAT WINDOW (Width: 320px, Height: 420px)
// ==============================================================================

function FloatingChatWindow({ channel, onMinimize, onClose }) {
  const { token, session } = useAuth();
  const { sendMessage, sendTyping, onlineUsers, typingMap, markChannelAsRead } = useChat();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const windowRef = useRef(null);

  const currentUserId = session?.id || session?.user_id;
  const otherUid = channel.other_user?.id;
  const isOnline = otherUid ? onlineUsers.has(otherUid) : false;
  const currentlyTyping = typingMap[channel.id] || [];

  // Listen to Escape key to minimize window
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onMinimize();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMinimize]);

  // Load message history on mount
  useEffect(() => {
    if (!token || !channel.id) return;
    let isMounted = true;
    setIsLoadingMessages(true);

    fetch(`/api/v1/chat/channels/${channel.id}/messages?limit=60`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((data) => {
        if (isMounted) {
          setMessages(data.messages || []);
          setIsLoadingMessages(false);
          markChannelAsRead(channel.id);
        }
      })
      .catch((err) => {
        if (isMounted) setIsLoadingMessages(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token, channel.id, markChannelAsRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentlyTyping]);

  // Handle typing debounce
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    sendTyping(channel.id, true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTyping(channel.id, false);
    }, 1500);
  };

  // Send message
  const handleSend = () => {
    if (!inputText.trim() && !attachments.length) return;

    sendMessage(channel.id, inputText.trim(), attachments);

    // Optimistic local append
    const localMsg = {
      id: `local_${Date.now()}`,
      channel_id: channel.id,
      sender_id: currentUserId,
      sender_name: session?.full_name || 'Me',
      message_text: inputText.trim(),
      attachments: [...attachments],
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, localMsg]);

    setInputText('');
    setAttachments([]);
    sendTyping(channel.id, false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle file attachment upload
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || !files[0] || !token) return;

    const file = files[0];
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
      }
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      ref={windowRef}
      className="pointer-events-auto w-80 h-[420px] bg-slate-900 border border-slate-700/90 rounded-t-xl shadow-2xl flex flex-col overflow-hidden select-text animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      {/* Header (Compact 38px) */}
      <div className="h-10 px-3 bg-slate-800 border-b border-slate-700/80 flex items-center justify-between flex-shrink-0 cursor-default">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full ring-2 ring-slate-800 flex-shrink-0 ${
              isOnline ? 'bg-emerald-500' : 'bg-slate-500'
            }`}
          />
          <span className="text-xs font-semibold text-slate-100 truncate" title={channel.name}>
            {channel.name}
          </span>
          {channel.channel_type === 'group' && (
            <span className="text-[10px] text-sky-400 bg-sky-950/60 px-1 py-0.2 rounded border border-sky-800/40">
              Group
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onMinimize}
            title="Minimize (_ or Esc)"
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close chat"
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-slate-950/40 text-xs">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-[11px]">
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-[11px] text-center px-4">
            <span className="font-medium text-slate-400">Direct Message</span>
            <span>Messages are encrypted, real-time, and synced with desktop alerts.</span>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isSelf = m.sender_id === currentUserId;
            return (
              <div
                key={m.id || idx}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
              >
                {/* Sender Name in group */}
                {!isSelf && channel.channel_type !== 'direct' && (
                  <span className="text-[10px] text-slate-400 font-medium ml-1 mb-0.5">
                    {m.sender_name}
                  </span>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed break-words shadow-sm ${
                    isSelf
                      ? 'bg-emerald-600 text-white rounded-tr-none'
                      : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
                  }`}
                >
                  {m.message_text}

                  {/* Attachments preview */}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {m.attachments.map((att, attIdx) => (
                        <a
                          key={attIdx}
                          href={`/${att.disk_path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 p-1.5 rounded bg-black/20 hover:bg-black/40 text-[11px] underline"
                        >
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{att.name || 'Attachment'}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[9px] text-slate-500 mt-0.5 px-1">
                  {formatMessageTime(m.created_at)}
                </span>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {currentlyTyping.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium italic animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{currentlyTyping.join(', ')} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Attachments Preview before sending */}
      {attachments.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-800 border-t border-slate-700/80 flex items-center gap-2 overflow-x-auto text-xs">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1 px-2 py-0.5 bg-slate-700 rounded text-slate-200 text-[11px]"
            >
              <FileText className="w-3 h-3 text-emerald-400" />
              <span className="truncate max-w-[100px]">{att.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-slate-400 hover:text-rose-400 ml-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer / Input */}
      <div className="p-2 bg-slate-800/90 border-t border-slate-700/80 flex items-center gap-1.5">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          title="Attach file"
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
        >
          <Paperclip className={`w-4 h-4 ${isUploading ? 'animate-spin' : ''}`} />
        </button>

        <textarea
          rows={1}
          placeholder="Type a message..."
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-slate-900 text-slate-100 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500 resize-none max-h-20 transition-colors placeholder:text-slate-500"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!inputText.trim() && !attachments.length}
          title="Send (Enter)"
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
            inputText.trim() || attachments.length
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'text-slate-600 cursor-not-allowed'
          }`}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function formatMessageTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}
