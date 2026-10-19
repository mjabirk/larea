import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Plus,
  Bell,
  BellOff,
  X,
  Users,
  User,
  Hash,
  ShieldAlert,
  Lock,
  Globe,
  Check,
  Building2,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';

export default function ChatPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewDmModal, setShowNewDmModal] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  const {
    channels,
    unreadCount,
    onlineUsers,
    pushEnabled,
    togglePushNotifications,
    openChat,
    createChannel,
    refreshChannels
  } = useChat();

  const { token, session, currentUser } = useAuth();
  const dropdownRef = useRef(null);
  const currentUserId = String(currentUser?.id || session?.user?.id || session?.id || session?.user_id || '').toLowerCase();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        if (!showCreateModal && !showNewDmModal) {
          setIsOpen(false);
        }
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, showCreateModal, showNewDmModal]);

  // Load directory users for DM selection or member picker
  useEffect(() => {
    if (!token || (!isOpen && !showCreateModal && !showNewDmModal)) return;

    let isMounted = true;
    setIsLoadingDirectory(true);

    fetch('/api/v1/chat/users', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((data) => {
        if (isMounted) {
          setDirectoryUsers(data.users || []);
          setIsLoadingDirectory(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingDirectory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, showCreateModal, showNewDmModal, token]);

  const query = searchQuery.trim().toLowerCase();

  const groupChannels = channels.filter((ch) => ch.channel_type !== 'direct');
  const directChannels = channels.filter((ch) => ch.channel_type === 'direct');

  const filteredGroupChannels = groupChannels.filter((ch) => {
    if (!query) return true;
    const name = (ch.name || '').toLowerCase();
    const slug = (ch.channel_slug || '').toLowerCase();
    const lastMsg = (ch.last_message?.text || '').toLowerCase();
    return name.includes(query) || slug.includes(query) || lastMsg.includes(query);
  });

  const filteredDirectChannels = directChannels.filter((ch) => {
    if (!query) return true;
    const name = (ch.name || '').toLowerCase();
    const lastMsg = (ch.last_message?.text || '').toLowerCase();
    return name.includes(query) || lastMsg.includes(query);
  });

  const handleSelectChannel = (channel) => {
    openChat(channel);
    setIsOpen(false);
  };

  const handleSelectUser = (user) => {
    openChat(user);
    setIsOpen(false);
    setShowNewDmModal(false);
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Top Bar Chat Button */}
      <button
        type="button"
        id="discuss-topbar-button"
        onClick={() => {
          const willOpen = !isOpen;
          setIsOpen(willOpen);
          if (willOpen) {
            refreshChannels();
          }
        }}
        title="Internal Messages & Channels (Odoo Discuss)"
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

      {/* Split Two-Section Discuss Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-84 md:w-96 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-800/80">
          {/* Header */}
          <div className="px-3.5 py-2.5 bg-slate-800/90 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Discuss & Channels
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Web Push Notification Toggle */}
              <button
                type="button"
                onClick={togglePushNotifications}
                title={pushEnabled ? 'Web Push Desktop Alerts Active' : 'Enable Web Push Alerts'}
                className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors ${
                  pushEnabled
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {pushEnabled ? <Bell className="w-3 h-3 text-emerald-400" /> : <BellOff className="w-3 h-3" />}
                {pushEnabled ? 'Push On' : 'Push Off'}
              </button>
            </div>
          </div>

          {/* Real-time Search Box */}
          <div className="p-2.5 bg-slate-900/90">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter channels or colleagues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800/90 text-slate-200 text-xs pl-8 pr-7 py-1.5 rounded-lg border border-slate-700/80 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-500"
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
          </div>

          {/* Scrollable Container with Split Sections */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">
            {/* SECTION 1: CHANNELS */}
            <div className="py-1.5">
              <div className="px-3 py-1 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Channels</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded-full">
                    {groupChannels.length}
                  </span>
                </div>
                {/* Quick Action: + Create Channel */}
                <button
                  type="button"
                  id="create-channel-btn"
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Create</span>
                </button>
              </div>

              {filteredGroupChannels.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-slate-500 italic">
                  {searchQuery ? 'No channels matching filter.' : 'No channels provisioned yet.'}
                </div>
              ) : (
                filteredGroupChannels.map((ch) => {
                  const hasUnread = (ch.unread_count || 0) > 0;
                  const isDept = ch.channel_type === 'department_auto';
                  const isPrivate = ch.channel_type === 'private_group';

                  return (
                    <div
                      key={ch.id}
                      onClick={() => handleSelectChannel(ch)}
                      className={`px-3 py-2 hover:bg-slate-800/70 cursor-pointer transition-colors flex items-center gap-2.5 group ${
                        hasUnread ? 'bg-slate-800/30' : ''
                      }`}
                    >
                      {/* Channel Icon */}
                      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-300 group-hover:text-emerald-400 transition-colors flex-shrink-0">
                        {isDept ? (
                          <Building2 className="w-3.5 h-3.5 text-amber-400" />
                        ) : isPrivate ? (
                          <Lock className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Hash className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>

                      {/* Channel Name & Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-xs truncate ${hasUnread ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                              #{ch.channel_slug || ch.name}
                            </span>
                            {ch.is_announcement_only && (
                              <span title="Announcement only (Moderators post)">
                                <ShieldAlert className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              </span>
                            )}
                          </div>
                          {ch.member_count > 0 && (
                            <span className="text-[10px] text-slate-500 flex-shrink-0">
                              👥 {ch.member_count}
                            </span>
                          )}
                        </div>

                        <p className={`text-[11px] truncate mt-0.5 ${hasUnread ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}>
                          {ch.last_message ? (
                            <span>
                              {ch.last_message.sender_name}: {ch.last_message.text}
                            </span>
                          ) : (
                            <span className="italic text-slate-500">
                              {ch.description || 'Channel stream ready'}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Live Unread Count Badge */}
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0 shadow-sm animate-pulse">
                          {ch.unread_count}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* SECTION 2: DIRECT MESSAGES */}
            <div className="py-1.5">
              <div className="px-3 py-1 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-sky-400" />
                  <span>Direct Messages</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded-full">
                    {directChannels.length}
                  </span>
                </div>
                <button
                  type="button"
                  id="start-dm-btn"
                  onClick={() => setShowNewDmModal(true)}
                  className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>New DM</span>
                </button>
              </div>

              {filteredDirectChannels.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-slate-500 italic">
                  {searchQuery ? 'No 1-on-1 chats matching filter.' : 'No direct messages yet.'}
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => setShowNewDmModal(true)}
                      className="text-sky-400 hover:underline text-[11px]"
                    >
                      Start a chat with a colleague →
                    </button>
                  </div>
                </div>
              ) : (
                filteredDirectChannels.map((ch) => {
                  const otherUid = ch.other_user?.id;
                  const isOnline = otherUid ? onlineUsers.has(otherUid) : false;
                  const hasUnread = (ch.unread_count || 0) > 0;

                  return (
                    <div
                      key={ch.id}
                      onClick={() => handleSelectChannel(ch)}
                      className={`px-3 py-2 hover:bg-slate-800/70 cursor-pointer transition-colors flex items-center gap-2.5 group ${
                        hasUnread ? 'bg-slate-800/30' : ''
                      }`}
                    >
                      {/* Avatar with Presence Dot */}
                      <div className="relative flex-shrink-0">
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700/80 flex items-center justify-center text-xs font-semibold text-slate-200">
                          {ch.name?.substring(0, 2).toUpperCase() || 'DM'}
                        </div>
                        <span
                          title={isOnline ? 'Active Online' : 'Offline'}
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                            isOnline ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-500'
                          }`}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs truncate ${hasUnread ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                            {ch.name}
                          </p>
                          <span className={`text-[10px] ${isOnline ? 'text-emerald-400 font-medium' : 'text-slate-500'}`}>
                            {isOnline ? 'online' : 'offline'}
                          </span>
                        </div>
                        <p className={`text-[11px] truncate mt-0.5 ${hasUnread ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}>
                          {ch.last_message ? (
                            <span>{ch.last_message.text}</span>
                          ) : (
                            <span className="italic text-slate-500">Direct channel open</span>
                          )}
                        </p>
                      </div>

                      {/* Live Unread Count Badge */}
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0 shadow-sm animate-pulse">
                          {ch.unread_count}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE CHANNEL MODAL */}
      {showCreateModal && (
        <CreateChannelModal
          users={directoryUsers}
          onClose={() => setShowCreateModal(false)}
          onCreate={async (formData) => {
            await createChannel(formData);
            setShowCreateModal(false);
            setIsOpen(false);
          }}
        />
      )}

      {/* START NEW DM MODAL */}
      {showNewDmModal && (
        <NewDmModal
          users={directoryUsers}
          onlineUsers={onlineUsers}
          onClose={() => setShowNewDmModal(false)}
          onSelectUser={handleSelectUser}
        />
      )}
    </div>
  );
}

// ==============================================================================
// 1. CREATE CHANNEL MODAL (Name, Type, Announcement Toggle, Member Picker)
// ==============================================================================

function CreateChannelModal({ users, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [channelType, setChannelType] = useState('public_group');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [memberFilter, setMemberFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-generate slug from name
  const handleNameChange = (val) => {
    setName(val);
    const clean = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setSlug(clean);
  };

  const toggleUser = (uid) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Channel name is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        channel_slug: slug.trim() || undefined,
        channel_type: channelType,
        is_announcement_only: isAnnouncement,
        description: description.trim() || undefined,
        member_user_ids: selectedUserIds
      });
    } catch (err) {
      setError(err.message || 'Failed to create channel.');
      setIsSubmitting(false);
    }
  };

  const filteredMembers = users.filter((u) => {
    if (!memberFilter.trim()) return true;
    const q = memberFilter.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Create New Channel</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg">
              {error}
            </div>
          )}

          {/* Channel Name & Slug Preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Channel Name *
            </label>
            <input
              type="text"
              id="new-channel-name-input"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Project Alpha, Human Resources, Engineering"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
              required
            />
            {slug && (
              <p className="text-[11px] text-emerald-400 mt-1 font-mono">
                Handle: #{slug}
              </p>
            )}
          </div>

          {/* Channel Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Channel Visibility & Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`p-2.5 rounded-lg border cursor-pointer flex items-start gap-2.5 transition-colors ${
                  channelType === 'public_group'
                    ? 'bg-emerald-950/30 border-emerald-500/60 text-white'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="channelType"
                  value="public_group"
                  checked={channelType === 'public_group'}
                  onChange={() => setChannelType('public_group')}
                  className="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Public Channel</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Open to all colleagues in the organization.
                  </p>
                </div>
              </label>

              <label
                className={`p-2.5 rounded-lg border cursor-pointer flex items-start gap-2.5 transition-colors ${
                  channelType === 'private_group'
                    ? 'bg-rose-950/30 border-rose-500/60 text-white'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="channelType"
                  value="private_group"
                  checked={channelType === 'private_group'}
                  onChange={() => setChannelType('private_group')}
                  className="mt-0.5 text-rose-500 focus:ring-rose-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Lock className="w-3.5 h-3.5 text-rose-400" />
                    <span>Private Group</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Restricted strictly to invited members.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Announcement Channel Toggle */}
          <div className="p-3 bg-slate-800/50 border border-slate-700/80 rounded-lg flex items-start gap-2.5">
            <input
              type="checkbox"
              id="is_announcement_checkbox"
              checked={isAnnouncement}
              onChange={(e) => setIsAnnouncement(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700"
            />
            <label htmlFor="is_announcement_checkbox" className="text-xs text-slate-300 cursor-pointer">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                Announcement-Only Channel
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                If checked, only administrators and managers can post. Regular members have read-only access.
              </span>
            </label>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about? (e.g. Quarterly planning discussions)"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
            />
          </div>

          {/* Member Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>Invite Initial Members ({selectedUserIds.length} selected)</span>
              {selectedUserIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedUserIds([])}
                  className="text-[10px] text-emerald-400 hover:underline"
                >
                  Clear all
                </button>
              )}
            </label>

            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search colleagues to invite..."
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="max-h-36 overflow-y-auto border border-slate-700/80 rounded-lg bg-slate-950/40 divide-y divide-slate-800/80">
              {filteredMembers.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500 italic">
                  No colleagues found.
                </div>
              ) : (
                filteredMembers.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleUser(u.id)}
                      className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-950/30 text-white' : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-semibold text-slate-200">
                          {u.full_name?.substring(0, 2).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{u.full_name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{u.job_title} • {u.department}</p>
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="submit-create-channel-btn"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-900/30"
            >
              {isSubmitting ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==============================================================================
// 2. NEW DIRECT MESSAGE MODAL (Colleague Picker)
// ==============================================================================

function NewDmModal({ users, onlineUsers, onClose, onSelectUser }) {
  const [query, setQuery] = useState('');

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.job_title || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">Start 1-on-1 Direct Message</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 bg-slate-900 border-b border-slate-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              autoFocus
              placeholder="Search colleague by name or department..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70 p-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 italic">
              No colleagues found.
            </div>
          ) : (
            filtered.map((u) => {
              const isOnline = onlineUsers.has(u.id);
              return (
                <div
                  key={u.id}
                  onClick={() => onSelectUser(u)}
                  className="px-3 py-2 hover:bg-slate-800/80 cursor-pointer rounded-lg transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                        {u.full_name?.substring(0, 2).toUpperCase() || 'U'}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                          isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-sky-400 truncate">
                        {u.full_name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {u.job_title} • {u.department}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
