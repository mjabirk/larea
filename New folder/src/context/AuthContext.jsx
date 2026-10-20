import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useIdleTimer } from '../hooks/useIdleTimer';
import { SessionExpiringModal } from '../components/auth/SessionExpiringModal';

const AuthContext = createContext(null);

const STORAGE_TOKEN_KEY = 'enterprise_auth_token';
const STORAGE_SESSION_CACHE_KEY = 'enterprise_session_cache';
const STORAGE_AUTO_SSO_KEY = 'enterprise_auto_sso';
const SESSION_MANUAL_LOGOUT_KEY = 'enterprise_manual_logout';

export function AuthProvider({ children, users = [], onSystemInitComplete, onUserLogin }) {
  const onUserLoginRef = useRef(onUserLogin);
  useEffect(() => {
    onUserLoginRef.current = onUserLogin;
  }, [onUserLogin]);

  const onSystemInitCompleteRef = useRef(onSystemInitComplete);
  useEffect(() => {
    onSystemInitCompleteRef.current = onSystemInitComplete;
  }, [onSystemInitComplete]);

  const hasBootCheckedRef = useRef(false);

  // Centralized DB-backed system initialization status
  const [isSystemInitialized, setIsSystemInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [ssoConfig, setSsoConfig] = useState({
    entra_enabled: false,
    kerberos_enabled: false,
    ldap_enabled: false,
    ldap_domain: 'COMPANY',
    auto_login_default: false,
    sso_available: false,
  });
  const [ssoError, setSsoError] = useState('');

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

  const commitAuthenticatedSession = useCallback(
    (user, token, rememberMe = false) => {
      const newSession = {
        user,
        token,
        loginTime: new Date().toISOString(),
        rememberMe: Boolean(rememberMe),
      };

      sessionStorage.removeItem(SESSION_MANUAL_LOGOUT_KEY);
      if (user?.auto_sso_enabled !== undefined) {
        if (user.auto_sso_enabled) {
          localStorage.setItem(STORAGE_AUTO_SSO_KEY, 'true');
        } else {
          localStorage.removeItem(STORAGE_AUTO_SSO_KEY);
        }
      }

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

      if (onUserLoginRef.current && user?.id) {
        onUserLoginRef.current(user.id, token);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('larea-auth-change', {
            detail: { type: 'login', user, token },
          })
        );
      }

      window.history.replaceState(null, '', '/?view=launcher');
    },
    []
  );

  const refreshSSOConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/sso/config');
      if (res.ok) {
        const data = await res.json();
        setSsoConfig(data);
        return data;
      }
    } catch (e) {
      // Non-fatal if SSO config endpoint is unreachable
    }
    return null;
  }, []);

  // Synchronize route based on DB-backed initialization and session status
  const syncRoute = useCallback((isInit = isSystemInitialized, isAuth = isAuthenticated) => {
    if (isLoading) return;
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
  }, [isLoading, isSystemInitialized, isAuthenticated]);

  // Boot check: Query GET /api/v1/system/status, SSO config, OAuth2 callback, and /api/v1/auth/me
  useEffect(() => {
    if (hasBootCheckedRef.current) return;
    hasBootCheckedRef.current = true;
    let isMounted = true;

    async function checkBootStatus() {
      setIsLoading(true);
      try {
        const [statusRes, ssoData] = await Promise.all([
          fetch('/api/v1/system/status'),
          refreshSSOConfig(),
        ]);

        if (!statusRes.ok) {
          throw new Error(`System status HTTP error: ${statusRes.status}`);
        }
        const statusData = await statusRes.json();
        const dbIsInit = Boolean(statusData?.is_initialized);

        if (!isMounted) return;
        setIsSystemInitialized(dbIsInit);

        if (!dbIsInit) {
          localStorage.removeItem(STORAGE_TOKEN_KEY);
          sessionStorage.removeItem(STORAGE_TOKEN_KEY);
          localStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
          sessionStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
          setSession(null);
          syncRoute(false, false);
          return;
        }

        // 1. Check if returning from Microsoft Entra ID OAuth2 / OIDC Callback (?code=...&state=...)
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const oauthCode = params.get('code');
          const oauthState = params.get('state');
          const oauthError = params.get('error_description') || params.get('error');

          if (oauthError) {
            setSsoError(oauthError);
            window.history.replaceState(null, '', '/login');
          } else if (oauthCode && oauthState) {
            try {
              const redirectUri = `${window.location.origin}${window.location.pathname}`;
              const cbRes = await fetch('/api/v1/auth/sso/entra/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  code: oauthCode,
                  state: oauthState,
                  redirect_uri: redirectUri,
                }),
              });
              const cbData = await cbRes.json();
              if (cbRes.ok && cbData.access_token && cbData.user) {
                if (isMounted) {
                  commitAuthenticatedSession(cbData.user, cbData.access_token, true);
                }
                return;
              } else {
                if (isMounted) {
                  setSsoError(cbData.detail || 'Microsoft Entra ID SSO sign-in failed.');
                  window.history.replaceState(null, '', '/login');
                }
              }
            } catch (cbErr) {
              console.error('Entra OIDC callback error:', cbErr);
              if (isMounted) {
                setSsoError('Failed to complete Microsoft Entra ID SSO callback.');
                window.history.replaceState(null, '', '/login');
              }
            }
          }
        }

        // 2. Verify existing bearer token from localStorage or sessionStorage
        const localToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        const sessionTokenVal = sessionStorage.getItem(STORAGE_TOKEN_KEY);
        const token = localToken || sessionTokenVal;
        const isPersistent = Boolean(localToken);

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
                  rememberMe: isPersistent,
                };
                setSession(verifiedSession);
                if (isPersistent) {
                  localStorage.setItem(STORAGE_SESSION_CACHE_KEY, JSON.stringify(verifiedSession));
                } else {
                  sessionStorage.setItem(STORAGE_SESSION_CACHE_KEY, JSON.stringify(verifiedSession));
                }
                if (onUserLoginRef.current && userProfile?.id) {
                  onUserLoginRef.current(userProfile.id, token);
                }
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('larea-auth-change', {
                      detail: { type: 'session_restored', user: userProfile, token },
                    })
                  );
                }
                syncRoute(true, true);
              }
              return;
            } else {
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
          // 3. Optional Silent Auto-Login via Windows SSO if enabled and not manually logged out
          const manualLogout = sessionStorage.getItem(SESSION_MANUAL_LOGOUT_KEY) === 'true';
          const autoSsoPref =
            localStorage.getItem(STORAGE_AUTO_SSO_KEY) === 'true' ||
            Boolean(ssoData?.auto_login_default);

          if (!manualLogout && autoSsoPref && ssoData?.kerberos_enabled) {
            try {
              const negRes = await fetch('/api/v1/auth/sso/negotiate', {
                method: 'GET',
                credentials: 'include',
              });
              if (negRes.ok) {
                const negData = await negRes.json();
                if (negData.access_token && negData.user && isMounted) {
                  commitAuthenticatedSession(negData.user, negData.access_token, true);
                  return;
                }
              }
            } catch (autoErr) {
              // Silent fallback to login screen
            }
          }

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

    return () => {
      isMounted = false;
    };
  }, []);

  // Synchronize route once boot check completes or auth status updates
  useEffect(() => {
    if (!isLoading) {
      syncRoute();
    }
  }, [isLoading, syncRoute]);

  // Synchronize route when back/forward navigation occurs
  useEffect(() => {
    const handlePopState = () => {
      if (!isLoading) syncRoute();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isLoading, syncRoute]);

  // Listen for unified auth changes (such as 401 interceptor logout)
  useEffect(() => {
    const handleAuthChange = (e) => {
      const detail = e?.detail;
      if (detail?.type === 'logout') {
        setSession(null);
      }
    };
    window.addEventListener('larea-auth-change', handleAuthChange);
    return () => window.removeEventListener('larea-auth-change', handleAuthChange);
  }, []);

  // Login handler: Authenticates via POST /api/v1/auth/login (PostgreSQL or Active Directory LDAP)
  const login = useCallback(
    async ({ email, password, rememberMe = false }) => {
      const cleanUser = (email || '').trim();
      const cleanPassword = (password || '').trim();

      if (!cleanUser) {
        return { success: false, error: 'Please enter your work email, username, or DOMAIN\\username.' };
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
          credentials: 'include',
          body: JSON.stringify({
            username: cleanUser,
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

        if (data.requires_2fa || data.status === '2fa_required') {
          return {
            success: false,
            requires2FA: true,
            pendingToken: data.pending_token,
            userId: data.user_id,
          };
        }

        commitAuthenticatedSession(data.user, data.access_token, rememberMe);
        return { success: true, user: data.user };
      } catch (err) {
        console.error('Login request failed:', err);
        return {
          success: false,
          error: 'Unable to connect to authentication service. Please ensure the backend is running.',
        };
      }
    },
    [commitAuthenticatedSession]
  );

  // Two-Factor Authentication Stage-2 Verification handler
  const verify2FA = useCallback(
    async ({ pendingToken, totpCode, rememberMe = false }) => {
      const cleanCode = (totpCode || '').trim();
      if (!cleanCode || cleanCode.length !== 6) {
        return { success: false, error: 'Please enter a valid 6-digit authenticator code.' };
      }
      try {
        const response = await fetch('/api/v1/auth/2fa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            pending_token: pendingToken,
            totp_code: cleanCode,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          return {
            success: false,
            error: data.detail || 'Invalid or expired 2FA code.',
          };
        }
        commitAuthenticatedSession(data.user, data.access_token, rememberMe);
        return { success: true, user: data.user };
      } catch (err) {
        console.error('2FA verification failed:', err);
        return {
          success: false,
          error: 'Unable to verify 2FA code. Please check your connection.',
        };
      }
    },
    [commitAuthenticatedSession]
  );

  // Web-Based Windows Single Sign-On (Microsoft Entra ID OIDC/PKCE or HTTP SPNEGO/Kerberos)
  const loginWithWindowsSSO = useCallback(
    async ({ mode = 'auto', loginHint = '', rememberMe = true } = {}) => {
      setSsoError('');
      try {
        const latestCfg = (await refreshSSOConfig()) || ssoConfig;

        // 1. Microsoft Entra ID (Azure AD) OAuth2 / OIDC Redirect Flow
        if (mode === 'entra' || (mode === 'auto' && latestCfg?.entra_enabled)) {
          const redirectUri = `${window.location.origin}/login`;
          const params = new URLSearchParams({ redirect_uri: redirectUri });
          if (loginHint) params.set('login_hint', loginHint);

          const res = await fetch(`/api/v1/auth/sso/entra/authorize?${params.toString()}`);
          const data = await res.json();
          if (!res.ok || !data.authorize_url) {
            return {
              success: false,
              error: data.detail || 'Could not initialize Microsoft Entra ID SSO.',
            };
          }
          window.location.assign(data.authorize_url);
          return { success: true, redirecting: true };
        }

        // 2. HTTP SPNEGO / Kerberos Integrated Windows Authentication
        if (mode === 'kerberos' || (mode === 'auto' && latestCfg?.kerberos_enabled)) {
          const res = await fetch('/api/v1/auth/sso/negotiate', {
            method: 'GET',
            credentials: 'include',
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return {
              success: false,
              error:
                data.detail ||
                'Windows Integrated Authentication (SPNEGO/Kerberos) handshake could not be completed by this browser.',
            };
          }
          commitAuthenticatedSession(data.user, data.access_token, rememberMe);
          return { success: true, user: data.user };
        }

        // 3. Active Directory LDAP Hint if LDAP is enabled
        if (latestCfg?.ldap_enabled) {
          return {
            success: false,
            requiresDomainCredentials: true,
            domain: latestCfg.ldap_domain || 'COMPANY',
            error: `Active Directory LDAP is enabled. Enter your Windows domain credentials (${latestCfg.ldap_domain || 'DOMAIN'}\\username) below to sign in.`,
          };
        }

        return {
          success: false,
          error:
            'Windows SSO federation (Microsoft Entra ID OIDC or Kerberos SPNEGO) is not yet configured by your administrator. Sign in with your administrator account and open Configuration → Windows SSO & Identity Federation to enable it.',
        };
      } catch (err) {
        console.error('Windows SSO error:', err);
        return {
          success: false,
          error: 'Unable to reach Windows SSO service. Please verify the backend is running.',
        };
      }
    },
    [ssoConfig, refreshSSOConfig, commitAuthenticatedSession]
  );

  const refreshCurrentUser = useCallback(async () => {
    const token =
      session?.token ||
      localStorage.getItem(STORAGE_TOKEN_KEY) ||
      sessionStorage.getItem(STORAGE_TOKEN_KEY);
    if (!token) return null;
    try {
      const meRes = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const updatedUser = await meRes.json();
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, user: updatedUser };
          if (localStorage.getItem(STORAGE_TOKEN_KEY)) {
            localStorage.setItem(STORAGE_SESSION_CACHE_KEY, JSON.stringify(next));
          } else {
            sessionStorage.setItem(STORAGE_SESSION_CACHE_KEY, JSON.stringify(next));
          }
          return next;
        });
        return updatedUser;
      }
    } catch (e) {
      console.error('Failed to refresh current user:', e);
    }
    return null;
  }, [session?.token]);

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

    sessionStorage.setItem(SESSION_MANUAL_LOGOUT_KEY, 'true');
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
    sessionStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
    setSession(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('larea-auth-change', {
          detail: { type: 'logout' },
        })
      );
    }
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

  const sessionToken = isAuthenticated && session?.token ? session.token : '';

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

  const value = useMemo(
    () => ({
      isSystemInitialized,
      isLoading,
      isAuthenticated,
      currentUser,
      user: currentUser,
      session,
      sessionToken,
      token: sessionToken,
      ssoConfig,
      ssoError,
      setSsoError,
      refreshSSOConfig,
      refreshCurrentUser,
      getAuthHeaders,
      login,
      verify2FA,
      loginWithWindowsSSO,
      logout,
      activateSystem,
    }),
    [
      isSystemInitialized,
      isLoading,
      isAuthenticated,
      currentUser,
      session,
      sessionToken,
      ssoConfig,
      ssoError,
      refreshSSOConfig,
      refreshCurrentUser,
      getAuthHeaders,
      login,
      verify2FA,
      loginWithWindowsSSO,
      logout,
      activateSystem,
    ]
  );

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

