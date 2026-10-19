import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useIdleTimer } from '../hooks/useIdleTimer';
import { SessionExpiringModal } from '../components/Auth/SessionExpiringModal';

const AuthContext = createContext(null);

const STORAGE_TOKEN_KEY = 'enterprise_auth_token';
const STORAGE_SESSION_CACHE_KEY = 'enterprise_session_cache';

export function AuthProvider({ children, users = [], onSystemInitComplete, onUserLogin }) {
  // Centralized DB-backed system initialization status
  const [isSystemInitialized, setIsSystemInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Authentication session state
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem(STORAGE_SESSION_CACHE_KEY) || sessionStorage.getItem(STORAGE_SESSION_CACHE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error('Failed to parse cached session:', e);
      }
    }
    return null;
  });

  const currentUser = session?.user || null;
  const isAuthenticated = Boolean(session?.user);

  // Synchronize route based on DB-backed initialization and session status
  const syncRoute = useCallback((isInit = isSystemInitialized, isAuth = isAuthenticated) => {
    const currentPath = window.location.pathname;

    if (!isInit) {
      // System not yet initialized: force setup wizard
      if (currentPath !== '/setup') {
        window.history.replaceState(null, '', '/setup');
      }
    } else if (!isAuth) {
      // System initialized but unauthenticated: redirect to login
      if (currentPath === '/setup' || currentPath === '/' || currentPath === '/apps') {
        window.history.replaceState(null, '', '/login');
      }
    } else {
      // System initialized and authenticated
      if (currentPath === '/setup' || currentPath === '/login') {
        const query = window.location.search;
        window.history.replaceState(null, '', query ? `/${query}` : '/?view=launcher');
      }
    }
  }, [isSystemInitialized, isAuthenticated]);

  // Boot check: Query GET /api/v1/system/status and /api/v1/auth/me directly from PostgreSQL
  useEffect(() => {
    let isMounted = true;

    async function checkBootStatus() {
      setIsLoading(true);
      try {
        const statusRes = await fetch('/api/v1/system/status');
        if (!statusRes.ok) {
          throw new Error(`System status HTTP error: ${statusRes.status}`);
        }
        const statusData = await statusRes.json();
        const dbIsInit = Boolean(statusData?.is_initialized);

        if (!isMounted) return;
        setIsSystemInitialized(dbIsInit);

        if (!dbIsInit) {
          // If system is uninitialized, clear any stale session
          localStorage.removeItem(STORAGE_TOKEN_KEY);
          sessionStorage.removeItem(STORAGE_TOKEN_KEY);
          localStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
          sessionStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
          setSession(null);
          syncRoute(false, false);
          return;
        }

        // System is initialized: verify bearer token from storage
        const token =
          localStorage.getItem(STORAGE_TOKEN_KEY) ||
          sessionStorage.getItem(STORAGE_TOKEN_KEY);

        if (token) {
          try {
            const meRes = await fetch('/api/v1/auth/me', {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (meRes.ok) {
              const userProfile = await meRes.json();
              if (isMounted) {
                const verifiedSession = {
                  user: userProfile,
                  token,
                  loginTime: new Date().toISOString(),
                };
                setSession(verifiedSession);
                localStorage.setItem(STORAGE_SESSION_CACHE_KEY, JSON.stringify(verifiedSession));
                if (onUserLogin && userProfile?.id) {
                  onUserLogin(userProfile.id);
                }
                syncRoute(true, true);
              }
              return;
            } else {
              // Token expired or invalid: clear session
              localStorage.removeItem(STORAGE_TOKEN_KEY);
              sessionStorage.removeItem(STORAGE_TOKEN_KEY);
              localStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
              sessionStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
              if (isMounted) {
                setSession(null);
                syncRoute(true, false);
              }
            }
          } catch (tokenErr) {
            console.error('Failed to verify session token against /auth/me:', tokenErr);
          }
        } else {
          // No token found: prompt login
          if (isMounted) {
            setSession(null);
            syncRoute(true, false);
          }
        }
      } catch (err) {
        console.error('Failed to fetch system boot status from backend:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    checkBootStatus();

    const handlePopState = () => syncRoute();
    window.addEventListener('popstate', handlePopState);
    return () => {
      isMounted = false;
      window.removeEventListener('popstate', handlePopState);
    };
  }, [syncRoute]);

  // Login handler: Authenticates via POST /api/v1/auth/login against PostgreSQL
  const login = useCallback(
    async ({ email, password, rememberMe = false }) => {
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanPassword = (password || '').trim();

      if (!cleanEmail) {
        return { success: false, error: 'Please enter your work email address or username.' };
      }
      if (!cleanPassword) {
        return { success: false, error: 'Please enter your account password.' };
      }

      try {
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: cleanEmail,
            password: cleanPassword,
            remember_me: Boolean(rememberMe),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            error: data.detail || 'Authentication failed. Please verify your credentials.',
          };
        }

        const token = data.access_token;
        const user = data.user;

        const newSession = {
          user,
          token,
          loginTime: new Date().toISOString(),
          rememberMe: Boolean(rememberMe),
        };

        if (rememberMe) {
          localStorage.setItem(STORAGE_TOKEN_KEY, token);
          localStorage.setItem(STORAGE_SESSION_CACHE_KEY, JSON.stringify(newSession));
          sessionStorage.removeItem(STORAGE_TOKEN_KEY);
          sessionStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
        } else {
          sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
          sessionStorage.setItem(STORAGE_SESSION_CACHE_KEY, JSON.stringify(newSession));
          localStorage.removeItem(STORAGE_TOKEN_KEY);
          localStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
        }

        setSession(newSession);

        if (onUserLogin) {
          onUserLogin(user.id);
        }

        window.history.replaceState(null, '', '/?view=launcher');
        return { success: true, user };
      } catch (err) {
        console.error('Login request failed:', err);
        return {
          success: false,
          error: 'Unable to connect to authentication service. Please ensure the backend is running.',
        };
      }
    },
    [onUserLogin]
  );

  // Logout handler
  const logout = useCallback((reason = null) => {
    const token = session?.token;
    if (token) {
      fetch('/api/v1/auth/sessions/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      }).catch((e) => console.warn('Failed to revoke session remotely:', e));
    }

    localStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
    sessionStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
    setSession(null);
    const redirectUrl = reason ? `/login?reason=${encodeURIComponent(reason)}` : '/login';
    window.history.replaceState(null, '', redirectUrl);
  }, [session]);

  // Complete setup and activate system via POST /api/v1/setup/init directly in PostgreSQL
  const activateSystem = useCallback(
    async ({ orgData, adminData, prefData }) => {
      try {
        const response = await fetch('/api/v1/setup/init', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            org_data: orgData,
            admin_data: adminData,
            pref_data: prefData,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            error: data.detail || 'Initialization failed. Please check server logs.',
          };
        }

        const token = data.access_token;
        const user = data.user;

        const newSession = {
          user,
          token,
          loginTime: new Date().toISOString(),
          rememberMe: true,
        };

        localStorage.setItem(STORAGE_TOKEN_KEY, token);
        localStorage.setItem(STORAGE_SESSION_CACHE_KEY, JSON.stringify(newSession));
        setIsSystemInitialized(true);
        setSession(newSession);

        if (onSystemInitComplete) {
          onSystemInitComplete({ newUser: user, orgData, adminData, prefData });
        }

        window.history.replaceState(null, '', '/?view=launcher');
        return { success: true, user };
      } catch (err) {
        console.error('Setup initialization request failed:', err);
        return {
          success: false,
          error: 'Failed to communicate with setup engine. Please verify the backend is running.',
        };
      }
    },
    [onSystemInitComplete]
  );

  const sessionToken =
    session?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_TOKEN_KEY) || sessionStorage.getItem(STORAGE_TOKEN_KEY)
      : '') ||
    '';

  const getAuthHeaders = useCallback(
    (additionalHeaders = {}) => {
      const headers = { ...additionalHeaders };
      if (!headers['Content-Type'] && !(additionalHeaders instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
      return headers;
    },
    [sessionToken]
  );

  const effectiveTimeoutMinutes = currentUser?.effective_idle_timeout_minutes || 15;
  const handleIdleTimeout = useCallback(() => {
    logout('idle_timeout');
  }, [logout]);

  const { isWarningVisible, secondsRemaining, stayLoggedIn } = useIdleTimer({
    effectiveTimeoutMinutes,
    isAuthenticated,
    onTimeout: handleIdleTimeout,
    getAuthHeaders,
  });

  const value = {
    isSystemInitialized,
    isLoading,
    isAuthenticated,
    currentUser,
    user: currentUser,
    session,
    sessionToken,
    token: sessionToken,
    getAuthHeaders,
    login,
    logout,
    activateSystem,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionExpiringModal
        isOpen={isWarningVisible}
        secondsRemaining={secondsRemaining}
        onStayLoggedIn={stayLoggedIn}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
