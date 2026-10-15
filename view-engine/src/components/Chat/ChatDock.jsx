import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Minus,
  X,
  Send,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Users,
  User,
  Hash,
  ShieldAlert,
  Building2,
  Lock,
  ArrowDown,
  Loader2,
  AtSign,
  Maximize2
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';

export default function ChatDock() {
  const {
    openDocks,
    minimizedDockIds,
    activeDockId,
    setActiveDockId,
    closeDock,
    minimizeDock,
    restoreDock,
    channels
  } = useChat();

  if (!openDocks.length) return null;

  // Active dock is either activeDockId, or the last non-minimized dock
  const activeChannel =
    openDocks.find((d) => d.id === activeDockId && !minimizedDockIds.has(d.id)) ||
    openDocks.slice().reverse().find((d) => !minimizedDockIds.has(d.id));

  return (
    <div className="fixed bottom-0 right-4 z-50 flex items-end gap-2.5 pointer-events-none select-none">
      {/* Minimized Pills Tray (for minimized channels) */}
      <div className="flex items-center gap-1.5 pointer-events-auto">
        {openDocks
          .filter((ch) => minimizedDockIds.has(ch.id))
          .map((ch) => (
            <MinimizedPill
              key={ch.id}
              channel={ch}
              onRestore={() => restoreDock(ch.id)}
              onClose={() => closeDock(ch.id)}
            />
          ))}
      </div>

      {/* Floating Active Dock Window (Width: 340px, Height: 440px) */}
      {activeChannel && (
        <FloatingChatWindow
          key={activeChannel.id}
          channel={activeChannel}
          openChannels={openDocks}
          allChannels={channels}
          minimizedDockIds={minimizedDockIds}
          onSwitchTab={(chanId) => setActiveDockId(chanId)}
          onMinimize={() => minimizeDock(activeChannel.id)}
          onClose={() => closeDock(activeChannel.id)}
        />
      )}
    </div>
  );
}

// ==============================================================================
// 1. MINIMIZED PILL (Pinned to bottom dock tray)
// ==============================================================================

function MinimizedPill({ channel, onRestore, onClose }) {
  const { onlineUsers } = useChat();
  const isDirect = channel.channel_type === 'direct';
  const otherUid = channel.other_user?.id;
  const isOnline = otherUid ? onlineUsers.has(otherUid) : false;
  const hasUnread = (channel.unread_count || 0) > 0;
  const isDept = channel.channel_type === 'department_auto';

  return (
    <div
      onClick={onRestore}
      title={`Restore ${channel.name}`}
      className={`h-9 px-3 rounded-t-xl border border-b-0 flex items-center gap-2 cursor-pointer transition-all shadow-xl ${
        hasUnread
          ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200 animate-bounce'
          : 'bg-slate-900 border-slate-700/80 text-slate-200 hover:bg-slate-800'
      }`}
    >
      {isDirect ? (
        <span
          className={`w-2 h-2 rounded-full ${
            isOnline ? 'bg-emerald-500 shadow-xs shadow-emerald-500' : 'bg-slate-500'
          }`}
        />
      ) : isDept ? (
        <Building2 className="w-3.5 h-3.5 text-amber-400" />
      ) : (
        <Hash className="w-3.5 h-3.5 text-emerald-400" />
      )}

      <span className="text-xs font-medium truncate max-w-[120px]">
        {isDirect ? channel.name : `#${channel.channel_slug || channel.name}`}
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
// 2. EXPANDED FLOATING CHAT WINDOW (Width: 340px, Height: 440px)
// ==============================================================================

function FloatingChatWindow({
  channel,
  openChannels,
  allChannels,
  minimizedDockIds,
  onSwitchTab,
  onMinimize,
  onClose
}) {
  const { token, session } = useAuth();
  const {
    sendMessage,
    sendTyping,
    onlineUsers,
    typingMap,
    markChannelAsRead
  } = useChat();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [channelMembers, setChannelMembers] = useState([]);

  // Autocomplete Popover state for @ and #
  const [autocomplete, setAutocomplete] = useState({
    active: false,
    type: null, // '@' or '#'
    query: '',
    cursorIndex: 0
  });

  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const windowRef = useRef(null);

  const currentUserId = session?.id || session?.user_id;
  const isDirect = channel.channel_type === 'direct';
  const otherUid = channel.other_user?.id;
  const isOnline = otherUid ? onlineUsers.has(otherUid) : false;
  const isDept = channel.channel_type === 'department_auto';
  const isPrivate = channel.channel_type === 'private_group';
  const isAnnouncementOnly = Boolean(channel.is_announcement_only);
  const canPost = channel.can_post !== false; // defaults true unless restricted
  const currentlyTyping = typingMap[channel.id] || [];

  // Esc key minimizes or dismisses active floating window
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onMinimize();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMinimize]);

  // Load message history for active channel
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
      .catch(() => {
        if (isMounted) setIsLoadingMessages(false);
      });

    // Load channel members for @ autocomplete and member count
    fetch(`/api/v1/chat/channels/${channel.id}/members`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((data) => {
        if (isMounted && data.members) {
          setChannelMembers(data.members);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [token, channel.id, markChannelAsRead]);

  // Real-time message receiver sync
  useEffect(() => {
    const handleCustomMsg = (event) => {
      const msg = event.detail;
      if (msg && (msg.channel_id === channel.id || msg.channelId === channel.id)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };
    window.addEventListener('chat_message_received', handleCustomMsg);
    return () => window.removeEventListener('chat_message_received', handleCustomMsg);
  }, [channel.id]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentlyTyping]);

  // Handle textarea auto-grow up to 100px
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    // Auto-grow height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(100, Math.max(36, textareaRef.current.scrollHeight));
      textareaRef.current.style.height = `${newHeight}px`;
    }

    // Typing notification over WebSocket
    sendTyping(channel.id, true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTyping(channel.id, false);
    }, 2000);

    // Autocomplete detection (@ or #)
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastWordMatch = textBeforeCursor.match(/(?:^|\s)([@#])([a-zA-Z0-9_-]*)$/);

    if (lastWordMatch) {
      setAutocomplete({
        active: true,
        type: lastWordMatch[1],
        query: lastWordMatch[2].toLowerCase(),
        cursorIndex: cursor - lastWordMatch[2].length
      });
    } else {
      setAutocomplete({ active: false, type: null, query: '', cursorIndex: 0 });
    }
  };

  // Insert mention or channel slug
  const handleSelectAutocomplete = (item) => {
    if (!autocomplete.active) return;
    const text = inputText;
    const prefix = text.slice(0, autocomplete.cursorIndex);
    const suffix = text.slice(autocomplete.cursorIndex + autocomplete.query.length);

    let replacement = '';
    if (autocomplete.type === '@') {
      replacement = item.token || item.username || item.full_name;
    } else if (autocomplete.type === '#') {
      replacement = item.channel_slug || item.name;
    }

    const nextText = `${prefix}${replacement} ${suffix}`;
    setInputText(nextText);
    setAutocomplete({ active: false, type: null, query: '', cursorIndex: 0 });

    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Submit message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!canPost) return;

    const trimmed = inputText.trim();
    if (!trimmed && !attachments.length) return;

    const payloadText = trimmed;
    const payloadAttachments = attachments;

    // Reset input
    setInputText('');
    setAttachments([]);
    setAutocomplete({ active: false, type: null, query: '', cursorIndex: 0 });
    if (textareaRef.current) {
      textareaRef.current.style.height = '36px';
    }

    // Local optimistic append
    const localId = `local-${Date.now()}`;
    const optimisticMsg = {
      id: localId,
      channel_id: channel.id,
      sender_id: currentUserId,
      sender_name: session?.full_name || 'You',
      message_text: payloadText,
      attachments: payloadAttachments,
      is_system_event: false,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    // Dispatch via WebSocket or REST
    await sendMessage(channel.id, payloadText, payloadAttachments);
  };

  // Handle enter key (Enter sends, Shift+Enter newlines)
  const handleKeyDown = (e) => {
    if (autocomplete.active && (e.key === 'Tab' || e.key === 'Enter')) {
      // Handled in autocomplete list
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // File upload strictly to disk (/storage/chat_attachments/{YYYY}/{MM}/)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('File size exceeds the 25MB limit.');
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
        alert('File upload failed.');
      }
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Autocomplete suggestions filtering
  let autocompleteItems = [];
  if (autocomplete.active) {
    if (autocomplete.type === '@') {
      const mentionsSpecial = [
        { id: 'all', token: 'all', full_name: 'all (Notify everyone)', isSpecial: true },
        { id: 'channel', token: 'channel', full_name: 'channel (Channel broadcast)', isSpecial: true }
      ];
      const memberSuggestions = channelMembers.map((m) => ({
        id: m.user_id,
        token: m.username || m.full_name,
        full_name: m.full_name,
        job_title: m.job_title
      }));
      autocompleteItems = [...mentionsSpecial, ...memberSuggestions].filter((item) =>
        (item.full_name || item.token).toLowerCase().includes(autocomplete.query)
      );
    } else if (autocomplete.type === '#') {
      autocompleteItems = allChannels.filter(
        (c) =>
          c.channel_type !== 'direct' &&
          (c.name || c.channel_slug || '').toLowerCase().includes(autocomplete.query)
      );
    }
  }

  const memberCountDisplay = channel.member_count || channelMembers.length || (isDirect ? 2 : 1);

  return (
    <div
      ref={windowRef}
      className="pointer-events-auto w-[340px] h-[440px] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-150"
    >
      {/* 1. HEADER (Channel name, member count, announcement badge, controls) */}
      <div className="px-3 py-2 bg-slate-800/95 border-b border-slate-700/80 flex items-center justify-between text-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          {/* Channel Type Icon */}
          <div className="w-6 h-6 rounded-lg bg-slate-700/80 flex items-center justify-center flex-shrink-0">
            {isDirect ? (
              <User className="w-3.5 h-3.5 text-sky-400" />
            ) : isDept ? (
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
            ) : isPrivate ? (
              <Lock className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Hash className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>

          {/* Name & Details */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate max-w-[150px]">
                {isDirect ? channel.name : `#${channel.channel_slug || channel.name}`}
              </span>
              {isAnnouncementOnly && (
                <span title="Announcement Channel (Read-Only)">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              {isDirect ? (
                <span className={isOnline ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                  {isOnline ? 'Active Online' : 'Offline'}
                </span>
              ) : (
                <span title="Total Channel Members" className="flex items-center gap-0.5">
                  <Users className="w-3 h-3 text-slate-400" />
                  <span>{memberCountDisplay} members</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Window Controls: Minimize, Close */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMinimize}
            title="Minimize (Esc)"
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close channel"
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. COLLAPSIBLE BOTTOM TABS TRAY (Switch between #Operations, #General, DMs) */}
      {openChannels.length > 1 && (
        <div className="px-2 py-1 bg-slate-950/80 border-b border-slate-800/80 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {openChannels.map((oc) => {
            const isActive = oc.id === channel.id;
            const hasUnread = (oc.unread_count || 0) > 0;
            const isOcDirect = oc.channel_type === 'direct';

            return (
              <button
                key={oc.id}
                type="button"
                onClick={() => onSwitchTab(oc.id)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {isOcDirect ? (
                  <User className="w-2.5 h-2.5" />
                ) : (
                  <Hash className="w-2.5 h-2.5" />
                )}
                <span className="truncate max-w-[80px]">
                  {isOcDirect ? oc.name : oc.channel_slug || oc.name}
                </span>
                {hasUnread && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 3. MESSAGE STREAM CONTAINER */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-slate-900/60 text-xs">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full text-slate-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
            <span>Loading channel stream...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-4">
            <Hash className="w-8 h-8 text-slate-700 mb-1" />
            <p className="font-semibold text-slate-400">Stream initialized</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Welcome to #{channel.channel_slug || channel.name}. Begin the conversation below.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isSelf = m.sender_id === currentUserId;
            const isSystem = Boolean(m.is_system_event);

            // System event notices (e.g. "User X joined", "User Y transferred")
            if (isSystem) {
              return (
                <div key={m.id} className="flex justify-center my-1.5">
                  <div className="px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-[10px] text-slate-400 italic">
                    {m.message_text}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
              >
                {!isSelf && !isDirect && (
                  <span className="text-[10px] font-semibold text-slate-400 mb-0.5 ml-1">
                    {m.sender_name}
                  </span>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs shadow-sm break-words ${
                    isSelf
                      ? 'bg-emerald-600 text-white rounded-br-xs'
                      : 'bg-slate-800 border border-slate-700/70 text-slate-200 rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {renderFormattedMessage(m.message_text)}
                  </p>

                  {/* Attachments rendering */}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {m.attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 p-1 rounded bg-black/20 text-[11px]"
                        >
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate flex-1">{att.name || 'Attachment'}</span>
                          <span className="text-[9px] opacity-70">
                            {formatBytes(att.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-slate-500 mt-0.5 px-1">
                  {formatTime(m.created_at)}
                </span>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {currentlyTyping.length > 0 && (
          <div className="text-[10px] text-slate-400 italic flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{currentlyTyping.join(', ')} typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. AUTOCOMPLETE POPOVER (@mentions or #channels) */}
      {autocomplete.active && autocompleteItems.length > 0 && (
        <div className="px-2 py-1 bg-slate-950 border-t border-slate-700/80 max-h-32 overflow-y-auto divide-y divide-slate-800/80 shadow-lg">
          <p className="text-[10px] font-semibold text-slate-500 uppercase px-1 py-0.5">
            {autocomplete.type === '@' ? 'Mention colleague or channel' : 'Link channel'}
          </p>
          {autocompleteItems.map((item, idx) => (
            <div
              key={item.id || idx}
              onClick={() => handleSelectAutocomplete(item)}
              className="px-2 py-1 hover:bg-slate-800/80 cursor-pointer rounded flex items-center justify-between text-xs text-slate-200"
            >
              <div className="flex items-center gap-1.5 truncate">
                {autocomplete.type === '@' ? (
                  <AtSign className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Hash className="w-3 h-3 text-sky-400" />
                )}
                <span className="font-medium truncate">
                  {autocomplete.type === '@' ? item.token : item.channel_slug || item.name}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 ml-2">
                {item.full_name || item.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 5. ATTACHMENT CHIPS PREVIEW */}
      {attachments.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-950/70 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-md text-[11px] text-slate-300 border border-slate-700 flex-shrink-0"
            >
              <FileText className="w-3 h-3 text-emerald-400" />
              <span className="truncate max-w-[120px]">{att.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-rose-400 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 6. INPUT AREA (Auto-growing textarea, paperclip, send) */}
      {!canPost ? (
        <div className="p-3 bg-slate-950/90 border-t border-slate-800/80 text-center text-xs text-amber-400/90 flex items-center justify-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>Announcement-only channel. Only moderators can post.</span>
        </div>
      ) : (
        <form
          onSubmit={handleSendMessage}
          className="p-2.5 bg-slate-950/90 border-t border-slate-800/80 flex items-end gap-1.5"
        >
          {/* Paperclip attachment button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            id="chat-attach-button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            title="Attach file (Disk storage/chat_attachments/)"
            className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </button>

          {/* Auto-growing Textarea Input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              id="chat-message-input"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${channel.channel_slug || channel.name}... (@ to mention)`}
              className="w-full bg-slate-800/90 text-slate-200 text-xs px-3 py-2 rounded-xl border border-slate-700/80 focus:outline-none focus:border-emerald-500 placeholder:text-slate-500 resize-none max-h-[100px] leading-relaxed"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            id="chat-send-button"
            disabled={!inputText.trim() && !attachments.length}
            title="Send Message (Enter)"
            className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-colors shadow-md flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}

// ==============================================================================
// HELPERS
// ==============================================================================

function renderFormattedMessage(text) {
  if (!text) return '';
  // Highlight @channel, @all, and @mentions in emerald
  const parts = text.split(/(@[a-zA-Z0-9_\-\.]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={i}
          className="bg-emerald-500/20 text-emerald-300 font-semibold px-1 py-0.2 rounded"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
