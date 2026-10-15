// ==============================================================================
// Apex Global ERP - Web Audio Synthesized Chime & W3C Web Push Manager
// ==============================================================================

/**
 * Play a crisp, subtle 2-tone melodic chime via Web Audio API.
 * Works 100% reliably in all modern browsers without external asset dependencies.
 */
export function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.25);

    // Tone 2: 880.00 Hz (A5 - harmonious fifth above)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.1);

    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.1);
    osc2.stop(now + 0.45);

    // Clean up audio context
    setTimeout(() => {
      try {
        ctx.close();
      } catch (e) {}
    }, 600);
  } catch (err) {
    // Audio context may be restricted by autoplay policy before user interaction
  }
}

/**
 * Convert VAPID base64url string to Uint8Array for PushManager subscription.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Register Service Worker and subscribe to W3C Web Push using server VAPID key.
 */
export async function subscribeWebPush(token) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Web Push is not supported in this browser.');
  }

  // 1. Request desktop notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted by user.');
  }

  // 2. Register Service Worker
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // 3. Fetch server VAPID public key
  const keyRes = await fetch('/api/v1/push/vapid-public-key', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!keyRes.ok) {
    throw new Error('Failed to retrieve VAPID public key from ERP server.');
  }
  const { public_key } = await keyRes.json();
  const convertedVapidKey = urlBase64ToUint8Array(public_key);

  // 4. Subscribe with PushManager
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: convertedVapidKey
  });

  const subJson = subscription.toJSON();
  const p256dh = subJson.keys?.p256dh;
  const auth = subJson.keys?.auth;

  if (!p256dh || !auth) {
    throw new Error('Invalid push subscription keys returned by browser.');
  }

  // 5. Send subscription endpoint to ERP backend
  const postRes = await fetch('/api/v1/push/subscribe', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh_key: p256dh,
      auth_key: auth,
      user_agent: navigator.userAgent
    })
  });

  if (!postRes.ok) {
    throw new Error('Failed to register push subscription on server.');
  }

  return { status: 'subscribed', subscription };
}

/**
 * Unsubscribe client from Web Push notifications.
 */
export async function unsubscribeWebPush(token) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  if (token) {
    try {
      await fetch('/api/v1/push/unsubscribe', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ endpoint })
      });
    } catch (e) {}
  }
}
