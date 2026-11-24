import { authHeaders } from './authHeaders';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

/** Tenant/role scope from the server-verified login. Rules enforce it; the client uses it to shape queries. */
export interface FirebaseScope {
  coupleId: string;
  role: string;
  username: string;
  /** Permanent participant id from the server login. Empty for sessions that predate it (sign in again). */
  pid?: string;
}

const KEY = 'love_firebase_scope';

export function getFirebaseScope(): FirebaseScope | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s.coupleId === 'string' && typeof s.username === 'string' ? s : null;
  } catch {
    return null;
  }
}

/** Called after /api/auth/verify-login. Without a token (server not configured) Firestore stays signed out and the rules deny it. */
export async function startFirebaseSession(login: { firebaseToken?: string | null; coupleId?: string; role?: string; username?: string; pid?: string }) {
  if (login.coupleId && login.username) {
    localStorage.setItem(KEY, JSON.stringify({ coupleId: login.coupleId, role: login.role || 'user', username: login.username, pid: login.pid || '' }));
  }
  if (!login.firebaseToken) return false;
  try {
    await signInWithCustomToken(firebaseAuth, login.firebaseToken);
    ensureFirebaseRefreshTimerOnly();
    return true;
  } catch (err) {
    console.warn('Firebase sign-in failed; Firestore features stay unavailable until configured.');
    return false;
  }
}

export async function endFirebaseSession() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { await signOut(firebaseAuth); } catch { /* ignore */ }
}

/** After the lounge switch changes: re-mint the token from the server's current account row so rules start/stop allowing the global room. */
export async function refreshFirebaseSession() {
  try {
    const r = await fetch('/api/auth/refresh-firebase-token', { method: 'POST', headers: authHeaders() });
    const j = await r.json();
    if (j?.success && j.firebaseToken) await signInWithCustomToken(firebaseAuth, j.firebaseToken);
  } catch { /* the old token keeps working until it expires */ }
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;
/** Keeps the signed token's lounge switch current on every open device: refresh now and every 20 minutes (a switch change reaches other devices within that time). */
export function ensureFirebaseRefresh() {
  if (typeof window === 'undefined') return;
  void refreshFirebaseSession();
  if (!refreshTimer) refreshTimer = setInterval(() => { void refreshFirebaseSession(); }, 20 * 60 * 1000);
}

function ensureFirebaseRefreshTimerOnly() {
  if (typeof window === 'undefined' || refreshTimer) return;
  refreshTimer = setInterval(() => { void refreshFirebaseSession(); }, 20 * 60 * 1000);
}
