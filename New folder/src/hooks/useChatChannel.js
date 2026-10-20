import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { playNotificationSound } from '../utils/notificationSound';

/**
 * Enterprise-grade real-time chat channel hook.
 * Connects to /api/v1/chat/ws/{channelId}?token={token} with:
 * - Automatic exponential backoff reconnection
 * - 3.5s HTTP polling fallback for maximum reliability
 * - Dynamic is_me evaluation & deduplication
 * - Incoming message audio chime notification
 */
export function useChatChannel(channelId, token) {
  const { currentUser, user } = useAuth();
  const myUserId = String(currentUser?.id || user?.id || '').toLowerCase();
  const myEmail = String(currentUser?.email || user?.email || '').toLowerCase();

  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  // Helper to normalize message and determine is_me
  const normalizeMessage = useCallback(
    (rawMsg) => {
      const msg = { ...rawMsg };
      const senderId = String(msg.sender_id || msg.senderId || '').toLowerCase();
      const senderEmail = String(msg.sender_email || msg.senderEmail || '').toLowerCase();

      const isMe =
        msg.is_me !== undefined
          ? Boolean(msg.is_me)
          : Boolean(
              (myUserId && senderId && senderId === myUserId) ||
              (myEmail && senderEmail && senderEmail === myEmail)
            );

      // Parse & normalize attachments
      let atts = msg.attachments;
      if (!atts && msg.attachments_json) {
        try {
          atts = JSON.parse(msg.attachments_json);
        } catch (e) {
          atts = [];
        }
      }
      if (typeof atts === 'string') {
        try {
          atts = JSON.parse(atts);
        } catch (e) {
          atts = [];
        }
      }

      const normalizedAttachments = Array.isArray(atts)
        ? atts.map((att) => {
            if (!att || typeof att !== 'object') return att;
            const diskPath = att.disk_path || att.path || '';
            const name = att.name || att.filename || att.file_name || 'Attachment';
            let fileUrl = att.file_url || att.url;
            if (!fileUrl && diskPath) {
              const cleanDisk = String(diskPath).replace(/\\/g, '/');
              fileUrl = `/api/v1/chat/attachments/${cleanDisk}`;
            }
            return {
              ...att,
              name,
              filename: name,
              file_name: name,
              disk_path: diskPath,
              file_url: fileUrl,
              url: fileUrl,
              size: att.size || att.file_size_bytes || 0,
              mime_type: att.mime_type || ''
            };
          })
        : [];

      return {
        ...msg,
        is_me: isMe,
        content: msg.content || msg.text || msg.message || msg.message_text || '',
        attachments: normalizedAttachments,
        created_at: msg.created_at || msg.createdAt || new Date().toISOString()
      };
    },
    [myUserId, myEmail]
  );

  // Fetch channel message history via REST
  const fetchMessages = useCallback(
    async (silent = false) => {
      if (!channelId || !token) return;
      if (!silent) setIsLoading(true);

      try {
        const res = await fetch(`/api/v1/chat/channels/${channelId}/messages?limit=50`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const incomingList = (data.messages || []).map(normalizeMessage);
          setHasMore(Boolean(data.has_more ?? data.hasMore));

          setMessages((prev) => {
            const incoming = incomingList;
            // Scroll protection: If message count and last message ID match, return prev untouched!
            if (
              prev.length === incoming.length &&
              prev[prev.length - 1]?.id === incoming[incoming.length - 1]?.id
            ) {
              return prev; // Keep existing reference so scroll position is untouched
            }

            // Deduplicate and merge, preserving local pending messages
            const map = new Map();
            for (const m of prev) {
              if (m.id) map.set(m.id, m);
            }
            for (const m of incoming) {
              if (m.id) map.set(m.id, m);
            }
            const merged = Array.from(map.values());
            merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            return merged;
          });
        }
      } catch (err) {
        if (!silent) console.warn('Failed to load channel messages:', err);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [channelId, token, normalizeMessage]
  );

  // Load older messages for infinite scroll
  const loadOlderMessages = useCallback(async () => {
    if (!channelId || !token || isLoadingOlder) return 0;
    let earliestId = null;
    setMessages((prev) => {
      earliestId = prev[0]?.id;
      return prev;
    });
    if (!earliestId) return 0;

    setIsLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/v1/chat/channels/${channelId}/messages?before_id=${earliestId}&limit=40`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const olderList = (data.messages || []).map(normalizeMessage);
        setHasMore(Boolean(data.has_more ?? data.hasMore));

        if (olderList.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOlder = olderList.filter((m) => !existingIds.has(m.id));
            return [...newOlder, ...prev];
          });
          return olderList.length;
        } else {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.warn('Failed to load older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
    return 0;
  }, [channelId, token, isLoadingOlder, normalizeMessage]);

  // Connect WebSocket to /api/v1/chat/ws/{channelId}?token={token}
  useEffect(() => {
    isMountedRef.current = true;
    if (!channelId || !token) {
      setIsLoading(false);
      return;
    }

    // Initial message fetch
    fetchMessages(false);

    function connectWs() {
      if (!isMountedRef.current || !channelId || !token) return;

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/v1/chat/ws/${channelId}?token=${token}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMountedRef.current) return;
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'new_message' || data.type === 'CHANNEL_MESSAGE') {
              const raw = data.message || data;
              const msg = normalizeMessage(raw);

              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                // Play notification chime for messages from others
                if (!msg.is_me) {
                  playNotificationSound();
                }
                return [...prev, msg];
              });
            }
          } catch (e) {
            console.error('Error parsing channel socket payload:', e);
          }
        };

        ws.onclose = (ev) => {
          if (!isMountedRef.current) return;
          setIsConnected(false);
          // Don't auto-reconnect if rejected for auth (code 1008 / 4001 / 403) or token missing
          if (ev.code === 1008 || ev.code === 4001 || ev.code === 4003 || ev.code === 403 || !token) return;

          // Exponential backoff up to 10s
          const delay = Math.min(10000, 1500 * Math.pow(1.5, reconnectAttemptsRef.current));
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connectWs, delay);
        };

        ws.onerror = () => {
          try {
            ws.close();
          } catch (e) {}
        };
      } catch (err) {
        console.warn('Failed to establish channel WebSocket:', err);
        const delay = Math.min(10000, 2000 * Math.pow(1.5, reconnectAttemptsRef.current));
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connectWs, delay);
      }
    }

    connectWs();

    // 3.5-second polling fallback interval
    const pollInterval = setInterval(() => {
      if (isMountedRef.current) {
        fetchMessages(true);
      }
    }, 3500);

    // Heartbeat ping every 25 seconds
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);

    return () => {
      isMountedRef.current = false;
      clearInterval(pollInterval);
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
        wsRef.current = null;
      }
    };
  }, [channelId, token, fetchMessages, normalizeMessage]);

  // Send message over WebSocket if available, or fall back to REST
  const sendWsMessage = useCallback(
    async (text, attachments = []) => {
      if (!channelId || (!text.trim() && !attachments.length)) return;

      const content = text.trim();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            content,
            attachments
          })
        );
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
              message_text: content,
              attachments_json: attachments.length ? JSON.stringify(attachments) : null
            })
          });
        } catch (err) {
          console.error('Failed to post channel message via fallback REST:', err);
        }
      }
    },
    [channelId, token]
  );

  return {
    messages,
    setMessages,
    isLoading,
    isLoadingOlder,
    hasMore,
    loadOlderMessages,
    isConnected,
    sendWsMessage,
    reloadMessages: () => fetchMessages(false)
  };
}
