import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Search, Plus, Bell, BellOff, X, Users, User, Check, Circle } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';

export default function ChatPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('conversations'); // 'conversations' | 'directory'
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  const {
    channels,
    unreadCount,
    onlineUsers,
    pushEnabled,
    togglePushNotifications,
    openChat
  } = useChat();

  const { token, session } = useAuth();
  const dropdownRef = useRef(null);
  const currentUserId = session?.id || session?.user_id;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Load directory users when switching to directory tab or on search
  useEffect(() => {
    if (!isOpen || activeTab !== 'directory' || !token) return;

    let isMounted = true;
    setIsLoadingDirectory(true);

    const qParam = searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : '';
    fetch(`/api/v1/chat/users${qParam}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((data) => {
        if (isMounted) {
          setDirectoryUsers(data.users || []);
          setIsLoadingDirectory(false);
        }
      })
      .catch((err) => {
        if (isMounted) setIsLoadingDirectory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, searchQuery, token]);

  // Filter conversations based on search
  const filteredChannels = channels.filter((ch) => {
    if (!searchQuery.trim()) return true;
    const name = ch.name || '';
    const lastText = ch.last_message?.text || '';
    const query = searchQuery.toLowerCase();
    return name.toLowerCase().includes(query) || lastText.toLowerCase().includes(query);
  });

  const handleSelectChannel = (channel) => {
    openChat(channel);
    setIsOpen(false);
  };

  const handleSelectUser = (user) => {
    openChat(user);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Top Bar Chat Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Internal Messages & Channels"
        className={`relative p-2 rounded-lg transition-colors flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 ${
          isOpen ? 'bg-slate-800 text-emerald-400' : ''
        }`}
      >
        <MessageSquare className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Compact Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="px-3 py-2.5 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-100 uppercase tracking-wider">
                Internal Discuss
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Web Push Notification Toggle */}
              <button
                type="button"
                onClick={togglePushNotifications}
                title={pushEnabled ? 'Desktop Alerts Active' : 'Enable Desktop Alerts'}
                className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors ${
                  pushEnabled
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {pushEnabled ? <Bell className="w-3 h-3 text-emerald-400" /> : <BellOff className="w-3 h-3" />}
                {pushEnabled ? 'Alerts On' : 'Alerts Off'}
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="p-2 border-b border-slate-800 bg-slate-900/60">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder={activeTab === 'conversations' ? 'Search conversations...' : 'Search colleagues...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800/90 text-slate-200 text-xs pl-8 pr-3 py-1.5 rounded-md border border-slate-700/80 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Tab switch */}
            <div className="flex gap-1 mt-2 p-0.5 bg-slate-950/40 rounded-lg border border-slate-800/60">
              <button
                type="button"
                onClick={() => setActiveTab('conversations')}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  activeTab === 'conversations'
                    ? 'bg-slate-800 text-emerald-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Chats ({channels.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('directory')}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
                  activeTab === 'directory'
                    ? 'bg-slate-800 text-emerald-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Plus className="w-3 h-3" /> New Message
              </button>
            </div>
          </div>

          {/* Content List */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
            {activeTab === 'conversations' ? (
              filteredChannels.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  {searchQuery ? 'No matching conversations' : 'No active conversations yet.'}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('directory')}
                      className="text-emerald-400 hover:underline text-[11px]"
                    >
                      Start a chat with a colleague →
                    </button>
                  </div>
                </div>
              ) : (
                filteredChannels.map((ch) => {
                  const isDirect = ch.channel_type === 'direct';
                  const otherUid = ch.other_user?.id;
                  const isOnline = otherUid ? onlineUsers.has(otherUid) : false;
                  const hasUnread = (ch.unread_count || 0) > 0;

                  return (
                    <div
                      key={ch.id}
                      onClick={() => handleSelectChannel(ch)}
                      className="px-3 py-2.5 hover:bg-slate-800/60 cursor-pointer transition-colors flex items-center gap-2.5 group"
                    >
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-slate-700/80 border border-slate-600/60 flex items-center justify-center text-xs font-semibold text-slate-200">
                          {isDirect ? (
                            ch.name?.substring(0, 2).toUpperCase() || 'DM'
                          ) : (
                            <Users className="w-4 h-4 text-sky-400" />
                          )}
                        </div>
                        {isDirect && (
                          <span
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                            }`}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-medium truncate ${hasUnread ? 'text-white font-semibold' : 'text-slate-200'}`}>
                            {ch.name}
                          </p>
                          {ch.last_message && (
                            <span className="text-[10px] text-slate-500 flex-shrink-0 ml-1">
                              {formatShortTime(ch.last_message.created_at)}
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] truncate mt-0.5 ${hasUnread ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}>
                          {ch.last_message ? (
                            <span>
                              {ch.last_message.sender_name && isDirect ? '' : `${ch.last_message.sender_name}: `}
                              {ch.last_message.text}
                            </span>
                          ) : (
                            <span className="italic text-slate-500">No messages yet</span>
                          )}
                        </p>
                      </div>

                      {/* Unread Pill */}
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                          {ch.unread_count}
                        </span>
                      )}
                    </div>
                  );
                })
              )
            ) : (
              // Directory Tab
              isLoadingDirectory ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Loading employee directory...
                </div>
              ) : directoryUsers.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No colleagues found matching "{searchQuery}"
                </div>
              ) : (
                directoryUsers.map((u) => {
                  const isOnline = onlineUsers.has(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className="px-3 py-2 hover:bg-slate-800/60 cursor-pointer transition-colors flex items-center gap-2.5 group"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-slate-700/80 border border-slate-600/60 flex items-center justify-center text-xs font-semibold text-slate-200">
                          {u.full_name?.substring(0, 2).toUpperCase() || 'U'}
                        </div>
                        <span
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                            isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-slate-200 truncate group-hover:text-emerald-400">
                            {u.full_name}
                          </p>
                          <span className={`text-[10px] ${isOnline ? 'text-emerald-400 font-medium' : 'text-slate-500'}`}>
                            {isOnline ? 'online' : 'offline'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          {u.job_title} • {u.department}
                        </p>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatShortTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}
