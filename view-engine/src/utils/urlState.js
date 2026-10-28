/**
 * Shared URL Query State & Instant Record Chatter Synchronization Helpers
 * Keeps form/detail views, active record IDs, and selected tabs persistent across
 * browser reloads (F5) without clobbering parent workspace/menu URL parameters.
 */

export function getUrlSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function getUrlParam(key) {
  return getUrlSearchParams().get(key);
}

/**
 * Updates specific query parameters in window.location.search using replaceState
 * while preserving app, menu, and any other unrelated parameters.
 * Pass null, undefined, or '' to delete a parameter.
 */
export function syncViewUrlParams(updates = {}) {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    // Never sync child view params when the launcher overlay is open
    if (params.get('launcher') === '1') return;

    let changed = false;
    Object.entries(updates).forEach(([key, val]) => {
      const current = params.get(key);
      if (val === null || val === undefined || val === '') {
        if (current !== null) {
          params.delete(key);
          changed = true;
        }
      } else {
        const nextStr = String(val);
        if (current !== nextStr) {
          params.set(key, nextStr);
          changed = true;
        }
      }
    });

    if (changed) {
      const qs = params.toString();
      const targetUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(window.history.state, '', targetUrl);
    }
  } catch (err) {
    console.warn('Failed to sync view URL parameters:', err);
  }
}

/**
 * Clears child detail/form query parameters when switching top-level modules or menus.
 */
export function clearChildViewUrlParams(params) {
  ['view', 'id', 'tab', 'batchId', 'userId', 'roleId'].forEach((k) => params.delete(k));
  return params;
}

/**
 * Broadcasts an immediate refresh signal to any mounted <RecordChatter /> component
 * for the given record so audit trail & activity logs appear instantly without reload.
 */
export function notifyRecordChatterUpdated(recordId, entityType = null) {
  if (typeof window === 'undefined' || !recordId) return;
  window.dispatchEvent(
    new CustomEvent('larea-record-chatter-updated', {
      detail: {
        recordId: String(recordId),
        entityId: String(recordId),
        entityType,
      },
    })
  );
}

