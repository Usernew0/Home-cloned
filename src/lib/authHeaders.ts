/** Headers for calls to our own /api routes. Adds the signed server session when present. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  let token = "";
  try {
    token = localStorage.getItem("love_server_session_token") || "";
  } catch {
    /* storage unavailable */
  }
  return { "Content-Type": "application/json", ...(token ? { "x-server-session": token } : {}), ...extra };
}
