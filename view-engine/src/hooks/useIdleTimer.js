import { useState, useEffect, useRef, useCallback } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

/**
 * Custom hook managing tiered inactivity timeout.
 * Displays warning 60 seconds before expiration, pings backend to extend Redis TTL on interaction,
 * and terminates session when countdown reaches zero.
 */
export function useIdleTimer({
  effectiveTimeoutMinutes = 15,
  isAuthenticated = false,
  onTimeout,
  getAuthHeaders,
}) {
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const lastActivityRef = useRef(Date.now());
  const lastPingRef = useRef(Date.now());
  const isPingingRef = useRef(false);

  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const getAuthHeadersRef = useRef(getAuthHeaders);
  useEffect(() => {
    getAuthHeadersRef.current = getAuthHeaders;
  }, [getAuthHeaders]);

  const totalTimeoutSeconds = Math.max(60, (effectiveTimeoutMinutes || 15) * 60);

  // Ping /api/v1/auth/me to refresh Redis TTL on demand or during active interaction
  const refreshSession = useCallback(async () => {
    if (isPingingRef.current) return;
    isPingingRef.current = true;
    try {
      const headers = getAuthHeadersRef.current ? getAuthHeadersRef.current() : {};
      await fetch('/api/v1/auth/me', { headers });
      lastPingRef.current = Date.now();
      lastActivityRef.current = Date.now();
      setIsWarningVisible(false);
    } catch (err) {
      console.warn('Failed to refresh Redis session TTL:', err);
    } finally {
      isPingingRef.current = false;
    }
  }, []);

  const stayLoggedIn = useCallback(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsWarningVisible(false);
      return;
    }

    lastActivityRef.current = Date.now();
    lastPingRef.current = Date.now();

    const handleUserActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;

      // If warning modal is open, user interaction dismisses warning and refreshes session
      if (isWarningVisible) {
        refreshSession();
        return;
      }

      // If more than 2 minutes have elapsed since last Redis keepalive ping, refresh TTL
      if (now - lastPingRef.current > 2 * 60 * 1000) {
        refreshSession();
      }
    };

    // Attach listeners
    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    // 1-second interval ticking timer
    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastActivityRef.current) / 1000);
      const remaining = totalTimeoutSeconds - elapsedSeconds;

      if (remaining <= 0) {
        setIsWarningVisible(false);
        if (onTimeoutRef.current) {
          onTimeoutRef.current();
        }
      } else if (remaining <= 60) {
        setSecondsRemaining(remaining);
        setIsWarningVisible(true);
      } else {
        if (isWarningVisible) {
          setIsWarningVisible(false);
        }
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
    };
  }, [isAuthenticated, totalTimeoutSeconds, isWarningVisible, refreshSession]);

  return {
    isWarningVisible,
    secondsRemaining,
    stayLoggedIn,
  };
}
