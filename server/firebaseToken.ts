import crypto from "node:crypto";

/**
 * Mints a Firebase custom token (RS256 JWT) so the browser can sign in to Firebase Auth with the same
 * identity as the server session. Needs FIREBASE_SERVICE_ACCOUNT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
 * (set through the host's secret store only). Returns null when not configured: Firestore then stays closed.
 */
const b64u = (v: Buffer | string) => Buffer.from(v).toString("base64url");

export function isFirebaseTokenConfigured(): boolean {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL && process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export function mintFirebaseToken(claims: { username: string; coupleId: string; role: string; accountId?: string }, now = Math.floor(Date.now() / 1000)): string | null {
  const email = process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key || !claims.username) return null;
  // Fail closed on missing identity or tenancy. The shared legacy tenant is only allowed by explicit opt-in.
  if (!claims.accountId) return null;
  if (claims.role !== "admin" && (!claims.coupleId || (claims.coupleId === "couple_default" && process.env.FIREBASE_ALLOW_DEFAULT_TENANT !== "true"))) return null;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    sub: email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    // uid is the stable account id (user_accounts.id / admin account id), not the username.
    uid: `a:${claims.accountId.slice(0, 120)}`,
    claims: { coupleId: claims.coupleId, role: claims.role, username: claims.username },
  };
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = crypto.createSign("RSA-SHA256").update(data).sign(key);
  return `${data}.${b64u(sig)}`;
}
