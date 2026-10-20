/**
 * Centralized API Client & Global 401 Interceptor
 *
 * Intercepts 401 Unauthorized responses to:
 * 1. Cleanly purge stored session cache and access tokens once (debounced).
 * 2. Dispatch a unified 'larea-auth-change' event to synchronize all active contexts.
 * 3. Redirect cleanly to /login?reason=session_expired without competing state updates or loops.
 * 4. Exclude login, 2FA, SSO, and setup endpoints where 401/403 represents user credential errors.
 */

const STORAGE_TOKEN_KEY = 'enterprise_auth_token';
const STORAGE_SESSION_CACHE_KEY = 'enterprise_session_cache';

let isHandling401 = false;
let interceptorInstalled = false;

// Endpoints where 401/403 should be handled by the caller/form, not global logout
const EXCLUDED_AUTH_ENDPOINTS = [
  '/api/v1/auth/login',
  '/api/v1/auth/2fa',
  '/api/v1/auth/sso',
  '/api/v1/system/status',
  '/api/v1/setup',
];

export function clearStoredAuth() {
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
    sessionStorage.removeItem(STORAGE_SESSION_CACHE_KEY);
  } catch (e) {
    console.error('Failed to clear stored auth tokens:', e);
  }
}

export function handleUnauthorized(reason = 'session_expired') {
  if (isHandling401) {
    return;
  }
  isHandling401 = true;

  clearStoredAuth();

  if (typeof window !== 'undefined') {
    // Dispatch auth state change event once
    window.dispatchEvent(
      new CustomEvent('larea-auth-change', {
        detail: { type: 'logout', reason },
      })
    );

    // Only redirect if not already on /login
    if (window.location.pathname !== '/login') {
      const redirectUrl = `/login?reason=${encodeURIComponent(reason)}`;
      window.history.replaceState(null, '', redirectUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  // Release lock after transition debounce window
  setTimeout(() => {
    isHandling401 = false;
  }, 1500);
}

export function installGlobalFetchInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') {
    return;
  }
  interceptorInstalled = true;

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const resource = args[0];
    const url = typeof resource === 'string'
      ? resource
      : resource instanceof Request
      ? resource.url
      : resource ? String(resource) : '';

    const response = await originalFetch.apply(this, args);

    if (response.status === 401) {
      const isExcluded = EXCLUDED_AUTH_ENDPOINTS.some((prefix) => url.includes(prefix));
      if (!isExcluded) {
        handleUnauthorized('session_expired');
      }
    }

    return response;
  };
}

// Auto-install upon module import
installGlobalFetchInterceptor();
