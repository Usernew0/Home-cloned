import { signInWithCustomToken, signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

/** Tenant/role scope from the server-verified login. Rules enforce it; the client uses it to shape queries. */
export interface FirebaseScope {
  coupleId: string;
  role: string;
  username: string;
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
export async function startFirebaseSession(login: { firebaseToken?: string | null; coupleId?: string; role?: string; username?: string }) {
  if (login.coupleId && login.username) {
    localStorage.setItem(KEY, JSON.stringify({ coupleId: login.coupleId, role: login.role || 'user', username: login.username }));
  }
  if (!login.firebaseToken) return false;
  try {
    await signInWithCustomToken(firebaseAuth, login.firebaseToken);
    return true;
  } catch (err) {
    console.warn('Firebase sign-in failed; Firestore features stay unavailable until configured.');
    return false;
  }
}

export async function endFirebaseSession() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { await signOut(firebaseAuth); } catch { /* ignore */ }
}
