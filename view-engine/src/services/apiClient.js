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
  '/api/v1/system/countries',
  '/api/v1/system/currencies',
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
    let [resource, config] = args;
    config = config ? { ...config } : {};

    const url = typeof resource === 'string'
      ? resource
      : resource instanceof Request
      ? resource.url
      : resource ? String(resource) : '';

    if (typeof resource === 'string' && resource.startsWith('/api/')) {
      const activeOrg = typeof window !== 'undefined' ? localStorage.getItem('enterprise_active_org_id') : null;
      const activeBranch = typeof window !== 'undefined' ? localStorage.getItem('enterprise_active_branch_id') : null;
      let activeBranchIds = null;
      if (typeof window !== 'undefined') {
        try {
          const rawBranchIds = localStorage.getItem('enterprise_selected_branch_ids');
          if (rawBranchIds) {
            const parsed = JSON.parse(rawBranchIds);
            if (Array.isArray(parsed) && parsed.length > 0) {
              activeBranchIds = parsed.join(',');
            }
          }
        } catch (e) {}
      }

      if (activeOrg || activeBranch || activeBranchIds) {
        if (!config.headers) {
          config.headers = {};
        }
        if (config.headers instanceof Headers) {
          if (activeOrg && !config.headers.has('X-Organization-Id')) {
            config.headers.set('X-Organization-Id', activeOrg);
          }
          if (activeBranch && !config.headers.has('X-Branch-Id')) {
            config.headers.set('X-Branch-Id', activeBranch);
          }
          if (activeBranchIds && !config.headers.has('X-Branch-Ids')) {
            config.headers.set('X-Branch-Ids', activeBranchIds);
          }
        } else if (Array.isArray(config.headers)) {
          const hasOrg = config.headers.some(([k]) => k.toLowerCase() === 'x-organization-id');
          if (activeOrg && !hasOrg) config.headers.push(['X-Organization-Id', activeOrg]);
          const hasBranch = config.headers.some(([k]) => k.toLowerCase() === 'x-branch-id');
          if (activeBranch && !hasBranch) config.headers.push(['X-Branch-Id', activeBranch]);
          const hasBranchIds = config.headers.some(([k]) => k.toLowerCase() === 'x-branch-ids');
          if (activeBranchIds && !hasBranchIds) config.headers.push(['X-Branch-Ids', activeBranchIds]);
        } else {
          config.headers = { ...config.headers };
          if (activeOrg && !config.headers['X-Organization-Id'] && !config.headers['x-organization-id']) {
            config.headers['X-Organization-Id'] = activeOrg;
          }
          if (activeBranch && !config.headers['X-Branch-Id'] && !config.headers['x-branch-id']) {
            config.headers['X-Branch-Id'] = activeBranch;
          }
          if (activeBranchIds && !config.headers['X-Branch-Ids'] && !config.headers['x-branch-ids']) {
            config.headers['X-Branch-Ids'] = activeBranchIds;
          }
        }
        args[1] = config;
      }
    }

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
