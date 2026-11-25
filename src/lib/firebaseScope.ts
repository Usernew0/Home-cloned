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
  /** The account's own space (immutable once set). Empty before the membership release. */
  personalCoupleId?: string;
  /** Server-reported: the strict membership release is active on this deployment (env-owned latch). Off means the old behavior stays exactly as it was. */
  membershipV2?: boolean;
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
const PRIVATE_CACHE_KEYS = ['love_milestones_v4', 'love_date_plans', 'love_memories', 'love_letters', 'love_chat_messages', 'love_couple_questions', 'love_celebration_cards', 'love_gallery_albums', 'love_custom_music_tracks', 'love_activity_logs', 'love_couple_tenants', 'love_user_accounts'];
/** Drops this browser's cached private items. A different account on the same browser (or any strict-gate sign-in/out) never sees or re-uploads the previous account's rows. */
export function purgePrivateCaches() {
  try { for (const k of PRIVATE_CACHE_KEYS) localStorage.removeItem(k); localStorage.removeItem('love_cache_owner'); for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('love_custom_music_tracks_')) localStorage.removeItem(k); } } catch { /* ignore */ }
}

export async function startFirebaseSession(login: { firebaseToken?: string | null; coupleId?: string; role?: string; username?: string; pid?: string; personalCoupleId?: string; membershipV2?: boolean }) {
  try { sessionStorage.removeItem('membership_relogin_done'); } catch { /* ignore */ }
  try {
    const owner = login.pid || login.username || '';
    if (login.membershipV2 === true || (localStorage.getItem('love_cache_owner') || '') !== owner) purgePrivateCaches();
    if (owner) localStorage.setItem('love_cache_owner', owner);
  } catch { /* ignore */ }
  if (login.coupleId && login.username) {
    localStorage.setItem(KEY, JSON.stringify({ coupleId: login.coupleId, role: login.role || 'user', username: login.username, pid: login.pid || '', personalCoupleId: login.personalCoupleId || '', membershipV2: login.membershipV2 === true }));
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

let scopeReady: Promise<boolean> | null = null;
/** Once per page load, before the first list read or cache write: re-read the scope and the gate from the server, so a stale stored scope (old client, gate flipped, space changed) can never drive a fail-open read. Never throws. */
export function ensureFreshScope(): Promise<boolean> {
  if (!scopeReady) scopeReady = refreshFirebaseSession().catch(() => false).then((ok) => { if (!ok) scopeReady = null; return ok; }); // a failed refresh is never cached: the next read retries
  return scopeReady;
}

/** Test hook: forget the cached refresh so the next read refreshes again. */
export function _resetScopeReadyForTests() { scopeReady = null; freshGate = undefined; }

export async function endFirebaseSession() {
  scopeReady = null; freshGate = undefined;
  try { if (getFirebaseScope()?.membershipV2 === true) purgePrivateCaches(); } catch { /* ignore */ }
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { await signOut(firebaseAuth); } catch { /* ignore */ }
}

/** After the lounge switch changes: re-mint the token from the server's current account row so rules start/stop allowing the global room. */
export async function refreshFirebaseSession(): Promise<boolean> {
  try {
    const r = await fetch('/api/proxy?op=refresh-token', { method: 'POST', headers: authHeaders() });
    const j = await r.json();
    if (j?.success) {
      // Keep the stored scope in step with the live account row and the server's gate (space changes after a link or unlink; the gate may have flipped since this browser stored its scope).
      const cur = getFirebaseScope();
      if (cur && typeof j.coupleId === 'string' && j.coupleId) {
        try { localStorage.setItem(KEY, JSON.stringify({ ...cur, coupleId: j.coupleId, personalCoupleId: typeof j.personalCoupleId === 'string' ? j.personalCoupleId : (cur.personalCoupleId || ''), membershipV2: j.membershipV2 === true })); } catch { /* ignore */ }
      }
      freshGate = typeof j.membershipV2 === 'boolean' ? j.membershipV2 : undefined;
      if (j.firebaseToken) await signInWithCustomToken(firebaseAuth, j.firebaseToken);
      return true;
    }
    freshGate = undefined;
    return false;
  } catch { /* the old token keeps working until it expires */ freshGate = undefined; return false; }
}

/** The gate as the server last said it, on THIS page, after a successful refresh. Reset (unknown) on any failure and at sign-out; never read back from storage. */
let freshGate: boolean | undefined;

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

/** True when the server reported the strict membership gate. Bulk copy tools that push this browser's cache into a database are refused in that mode. */
export function isStrictMembership(): boolean { try { return getFirebaseScope()?.membershipV2 === true; } catch { return false; } }

/** Bulk cache-copy tools may run only when a FRESH server answer says the strict gate is off. A stored false from an older session, an unknown gate, or a failed refresh all refuse. */
export async function bulkCopyAllowed(): Promise<boolean> {
  const fresh = await ensureFreshScope();
  return fresh === true && freshGate === false;
}

/** Firestore may feed a private-item list only when the server last said the strict gate is OFF. Under strict (or unknown) Supabase is the single source, so a stale Firestore mirror row can never overwrite or resurrect a deleted or unshared item. */
export function firestoreMirrorAllowed(): boolean { return freshGate === false; }
