import { authHeaders } from "./authHeaders";

const cache = new Map<string, string>();

/** Resolve a username to its permanent participant id through the server. Returns null when the name is unknown, ambiguous
 *  (more than one account answers to it) or has no permanent id: the caller must NOT send a private message then. */
export async function resolveParticipantPid(username: string): Promise<string | null> {
  const key = username.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  try {
    const res = await fetch("/api/proxy?op=resolve-participant", { method: "POST", headers: authHeaders(), body: JSON.stringify({ usernames: [username.trim()] }) });
    const data = await res.json();
    const entry = data?.participants?.[username.trim()];
    if (data?.success && entry && typeof entry.pid === "string" && entry.pid) {
      cache.set(key, entry.pid);
      return entry.pid;
    }
  } catch {
    /* fall through */
  }
  return null;
}
