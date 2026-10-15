import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  ExternalLink,
  ShieldAlert,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  X,
  Sparkles
} from 'lucide-react';

export function NotificationBell({ onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread'
  const popoverRef = useRef(null);

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications?limit=30', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.warn('Failed to fetch notifications:', err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 25000); // Polling every 25s
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Handle outside click & Esc key to close popover
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`/api/v1/notifications/${id}/read`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/v1/notifications/mark-all-read', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('Failed to mark all read:', err);
    }
  };

  const handleDeleteNotification = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`/api/v1/notifications/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const target = notifications.find((n) => n.id === id);
      if (target && !target.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.warn('Failed to delete notification:', err);
    }
  };

  const handleNotificationClick = (item) => {
    if (!item.is_read) {
      handleMarkAsRead(item.id);
    }
    if (item.link_url && onNavigate) {
      onNavigate(item.link_url);
      setIsOpen(false);
    }
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return '';
    try {
      const now = new Date();
      const past = new Date(isoString);
      const diffMs = now - past;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 45) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const getCategoryIcon = (type) => {
    switch (type) {
      case 'payroll':
        return <Banknote className="w-3.5 h-3.5 text-emerald-500" />;
      case 'compliance':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />;
      case 'approval':
        return <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <Info className="w-3.5 h-3.5 text-indigo-500" />;
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'unread') return !n.is_read;
    return true;
  });

  return (
    <div className="relative" ref={popoverRef}>
      {/* 1. Dynamic Notification Bell Trigger */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={`p-2 rounded-lg transition cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
          isOpen
            ? 'bg-slate-800 text-white'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
        title={`Notifications (${unreadCount} unread)`}
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center shadow-sm animate-pulse"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 2. Accessible Popover Drawer */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Feed"
          className="absolute right-0 rtl:left-0 rtl:right-auto mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-0 z-50 overflow-hidden animate-fadeIn text-xs"
        >
          {/* Header */}
          <div className="p-3 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                Notifications
              </span>
              {unreadCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold text-[10px]">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium text-[10px]">
                  All read
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="px-2 py-1 rounded-md text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition cursor-pointer flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                aria-label="Close notifications popover"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-3 py-1.5 bg-slate-100/60 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-0.5 rounded-full font-medium transition cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('unread')}
              className={`px-2.5 py-0.5 rounded-full font-medium transition cursor-pointer ${
                activeFilter === 'unread'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Scrollable Feed */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto flex items-center justify-center text-slate-400 mb-2">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {activeFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  You are completely caught up with your operational tasks.
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isUnread = !notif.is_read;
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3 transition cursor-pointer flex items-start gap-2.5 group ${
                      isUnread
                        ? 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/40 border-l-3 border-blue-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Category Icon Badge */}
                    <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 shadow-2xs mt-0.5">
                      {getCategoryIcon(notif.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`truncate font-semibold text-xs ${
                            isUnread
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                        {notif.message}
                      </p>

                      {notif.link_url && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                          <span>View record</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>

                    {/* Quick action buttons on hover */}
                    <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isUnread && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(notif.id, e)}
                          title="Mark as read"
                          className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteNotification(notif.id, e)}
                        title="Delete notification"
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
