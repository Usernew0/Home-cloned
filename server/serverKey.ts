/** The key the SERVER uses for the database. It must be a privileged key (the service_role JWT or an sb_secret_ key) in SUPABASE_SERVICE_ROLE_KEY.
 *  There is no fallback to the public anon key: with row-level security and revoked credential columns an anon connection can never serve the
 *  server, it only produces confusing "permission denied" errors at login. A browser-grade key in this variable is refused too.
 *  Returns "" (server treated as not configured) and logs only the variable NAME, never a value. */
export function isBrowserGradeKey(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return payload?.role === "anon" || payload?.role === "authenticated";
  } catch {
    return false;
  }
}

export function resolveServerSupabaseKey(env: Record<string, string | undefined> = process.env): string {
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) {
    console.error("Supabase server key missing: set SUPABASE_SERVICE_ROLE_KEY (the service_role secret, not the anon/public key)");
    return "";
  }
  if (isBrowserGradeKey(key)) {
    console.error("SUPABASE_SERVICE_ROLE_KEY holds a public (anon/publishable) key; the server needs the service_role secret key");
    return "";
  }
  return key;
}
