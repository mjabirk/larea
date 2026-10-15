import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { playNotificationSound, subscribeWebPush, unsubscribeWebPush } from '../utils/notificationSound';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { session, token } = useAuth();
  const [channels, setChannels] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [openDocks, setOpenDocks] = useState([]); // Array of channel objects open in floating dock
  const [minimizedDockIds, setMinimizedDockIds] = useState(new Set());
  const [activeDockId, setActiveDockId] = useState(null); // ID of currently focused dock channel
  const [typingMap, setTypingMap] = useState({}); // channelId -> array of names typing
  const [pushEnabled, setPushEnabled] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const currentUserId = session?.id || session?.user_id;

  // 1. Check current Push Notification status on mount
  useEffect(() => {
    if ('Notification' in window && 'serviceWorker' in navigator) {
      setPushEnabled(Notification.permission === 'granted');
    }
  }, []);

  // 2. Load channels and unread count from REST
  const refreshChannels = useCallback(async () => {
    if (!token) return;
    try {
      const [chanRes, unreadRes] = await Promise.all([
        fetch('/api/v1/chat/channels', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/v1/chat/unread-count', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (chanRes.ok) {
        const data = await chanRes.json();
        setChannels(data.channels || []);
      }
      if (unreadRes.ok) {
        const data = await unreadRes.json();
        setUnreadCount(data.total_unread || 0);
      }
    } catch (err) {
      console.error('Failed to load chat channels:', err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshChannels();
    }
  }, [token, refreshChannels]);

  // 3. Connect WebSocket for Real-time chat & presence
  useEffect(() => {
    if (!token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let isMounted = true;

    function connectWs() {
      if (!isMounted || !token) return;
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/chat?token=${token}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
          } catch (e) {
            console.error('Error parsing WebSocket message:', e);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          // Auto-reconnect with exponential backoff
          reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
        };

        ws.onerror = (err) => {
          console.warn('Chat WebSocket encounter:', err);
          ws.close();
        };
      } catch (err) {
        console.error('Failed to create chat WebSocket:', err);
        reconnectTimeoutRef.current = setTimeout(connectWs, 4000);
      }
    }

    connectWs();

    // Heartbeat ping every 25 seconds
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);

    return () => {
      isMounted = false;
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);

  // 4. Handle incoming WebSocket events
  const handleWsMessage = useCallback((data) => {
    const type = data.type;

    if (type === 'INIT_STATE') {
      const users = new Set(data.onlineUsers || []);
      setOnlineUsers(users);
    } else if (type === 'USER_PRESENCE') {
      const { userId, status } = data;
      setOnlineUsers((prev) => {
        const updated = new Set(prev);
        if (status === 'online') {
          updated.add(userId);
        } else {
          updated.delete(userId);
        }
        return updated;
      });
    } else if (type === 'NEW_MESSAGE' || type === 'CHANNEL_MESSAGE') {
      const msg = data.message || {};
      const chId = msg.channel_id || msg.channelId;
      const sId = msg.sender_id || msg.senderId;
      const sName = msg.sender_name || msg.senderName;
      const text = msg.message_text || msg.text || '';
      const isSelf = sId === currentUserId;

      // Play soft audio chime if message is incoming from another user
      if (!isSelf) {
        playNotificationSound();
      }

      // Update channels list last_message
      setChannels((prev) => {
        return prev.map((ch) => {
          if (ch.id === chId) {
            const isDockOpen = openDocks.some((d) => d.id === ch.id && !minimizedDockIds.has(ch.id));
            return {
              ...ch,
              unread_count: isDockOpen || isSelf ? ch.unread_count : (ch.unread_count || 0) + 1,
              last_message: {
                id: msg.id,
                text: text,
                sender_id: sId,
                sender_name: sName,
                created_at: msg.created_at || msg.createdAt || new Date().toISOString()
              }
            };
          }
          return ch;
        });
      });

      // Update total unread if dock not active
      if (!isSelf) {
        const isDockActive = openDocks.some((d) => d.id === chId && !minimizedDockIds.has(chId) && activeDockId === chId);
        if (!isDockActive) {
          setUnreadCount((c) => c + 1);
        }
      }

      // Clear typing indicator for sender
      setTypingMap((prev) => {
        const currentList = prev[chId] || [];
        return {
          ...prev,
          [chId]: currentList.filter((n) => n !== sName)
        };
      });
    } else if (type === 'USER_TYPING') {
      const { channelId, userName, isTyping } = data;
      setTypingMap((prev) => {
        const list = prev[channelId] || [];
        if (isTyping) {
          if (!list.includes(userName)) return { ...prev, [channelId]: [...list, userName] };
        } else {
          return { ...prev, [channelId]: list.filter((n) => n !== userName) };
        }
        return prev;
      });
    } else if (type === 'CHANNEL_READ') {
      const { channelId, userId } = data;
      if (userId === currentUserId) {
        setChannels((prev) =>
          prev.map((ch) => (ch.id === channelId ? { ...ch, unread_count: 0 } : ch))
        );
      }
    }
  }, [currentUserId, openDocks, minimizedDockIds, activeDockId]);

  // 5. Open chat dock window (supports direct user ID or existing channel object)
  const openChat = useCallback(async (channelOrUser) => {
    if (!token) return;

    let targetChannel = null;

    if (channelOrUser && channelOrUser.id && (channelOrUser.channel_type || channelOrUser.channel_slug || channelOrUser.record_model)) {
      // Existing channel object
      targetChannel = channelOrUser;
    } else {
      // User object or target user ID -> create or retrieve 1-on-1 direct channel
      const targetUserId = typeof channelOrUser === 'string' ? channelOrUser : channelOrUser?.id;
      if (!targetUserId) return;

      try {
        const res = await fetch('/api/v1/chat/channels', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            channel_type: 'direct',
            target_user_id: targetUserId
          })
        });
        if (res.ok) {
          targetChannel = await res.json();
        }
      } catch (err) {
        console.error('Failed to open direct channel:', err);
        return;
      }
    }

    if (!targetChannel) return;

    // Set as active dock
    setActiveDockId(targetChannel.id);

    // Add to open docks if not already present (limit max 4 open docks)
    setOpenDocks((prev) => {
      const exists = prev.find((d) => d.id === targetChannel.id);
      if (exists) {
        // If present, un-minimize it
        setMinimizedDockIds((minSet) => {
          const next = new Set(minSet);
          next.delete(targetChannel.id);
          return next;
        });
        return prev;
      }
      const trimmed = prev.length >= 4 ? prev.slice(1) : prev;
      return [...trimmed, targetChannel];
    });

    // Unminimize
    setMinimizedDockIds((minSet) => {
      const next = new Set(minSet);
      next.delete(targetChannel.id);
      return next;
    });

    // Mark as read
    markChannelAsRead(targetChannel.id);
  }, [token, markChannelAsRead]);

  // 6. Close a floating chat dock
  const closeDock = useCallback((channelId) => {
    setOpenDocks((prev) => prev.filter((d) => d.id !== channelId));
    setMinimizedDockIds((minSet) => {
      const next = new Set(minSet);
      next.delete(channelId);
      return next;
    });
    setActiveDockId((prev) => (prev === channelId ? null : prev));
  }, []);

  // 7. Minimize a floating chat dock to bottom pill
  const minimizeDock = useCallback((channelId) => {
    setMinimizedDockIds((minSet) => new Set([...minSet, channelId]));
  }, []);

  // 8. Restore minimized dock back to open floating box
  const restoreDock = useCallback((channelId) => {
    setMinimizedDockIds((minSet) => {
      const next = new Set(minSet);
      next.delete(channelId);
      return next;
    });
    setActiveDockId(channelId);
    markChannelAsRead(channelId);
  }, [markChannelAsRead]);

  // 9. Send message (WebSocket or REST fallback)
  const sendMessage = useCallback(async (channelId, text, attachments = [], replyToMessageId = null) => {
    if (!channelId || (!text.trim() && !attachments.length)) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SEND_MESSAGE',
        channelId,
        text: text.trim(),
        attachments
      }));
    } else {
      // Fallback via REST
      try {
        await fetch(`/api/v1/chat/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message_text: text.trim(),
            attachments_json: attachments.length ? JSON.stringify(attachments) : null,
            reply_to_message_id: replyToMessageId
          })
        });
      } catch (err) {
        console.error('Failed to send chat message:', err);
      }
    }
  }, [token]);

  // 10. Send typing indicator
  const sendTyping = useCallback((channelId, isTyping) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'TYPING',
        channelId,
        isTyping
      }));
    }
  }, []);

  // 11. Mark channel as read
  const markChannelAsRead = useCallback(async (channelId) => {
    if (!token || !channelId) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'MARK_READ',
        channelId
      }));
    }

    try {
      await fetch(`/api/v1/chat/channels/${channelId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setChannels((prev) =>
        prev.map((ch) => (ch.id === channelId ? { ...ch, unread_count: 0 } : ch))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {}
  }, [token]);

  // 12. Create custom channel
  const createChannel = useCallback(async (channelPayload) => {
    if (!token) return null;
    try {
      const res = await fetch('/api/v1/chat/channels', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(channelPayload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create channel.');
      }
      const newChan = await res.json();
      await refreshChannels();
      openChat(newChan);
      return newChan;
    } catch (err) {
      console.error('Channel creation error:', err);
      throw err;
    }
  }, [token, refreshChannels, openChat]);

  // 13. Toggle Push Notification Subscription
  const togglePushNotifications = useCallback(async () => {
    if (!token) return;

    if (pushEnabled) {
      await unsubscribeWebPush(token);
      setPushEnabled(false);
    } else {
      try {
        await subscribeWebPush(token);
        setPushEnabled(true);
      } catch (err) {
        console.error('Push notification subscription error:', err);
        alert(err.message || 'Could not enable desktop notifications.');
      }
    }
  }, [token, pushEnabled]);

  return (
    <ChatContext.Provider
      value={{
        channels,
        unreadCount,
        onlineUsers,
        openDocks,
        minimizedDockIds,
        activeDockId,
        setActiveDockId,
        typingMap,
        pushEnabled,
        wsConnected,
        refreshChannels,
        openChat,
        closeDock,
        minimizeDock,
        restoreDock,
        sendMessage,
        sendTyping,
        markChannelAsRead,
        createChannel,
        togglePushNotifications
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}
