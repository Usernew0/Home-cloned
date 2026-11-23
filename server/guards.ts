import { verifyServerSession, type ServerSessionPayload } from "./auth.js";

export type Role = ServerSessionPayload["role"];

export function sessionFromRequest(req: any): ServerSessionPayload | null {
  const header = req.headers?.["x-server-session"] || req.headers?.["authorization"]?.toString().replace(/^Bearer /, "");
  return verifyServerSession(header);
}

/** Returns the session, or sends 401/403 and returns null. */
export function requireRole(req: any, res: any, allowed: Role[]): ServerSessionPayload | null {
  const session = sessionFromRequest(req);
  if (!session) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return null;
  }
  if (!allowed.includes(session.role)) {
    res.status(403).json({ success: false, error: "Not permitted for this account" });
    return null;
  }
  return session;
}

/** Wrap a Vercel/Express handler so it needs a session with one of the roles. */
export function withRole(allowed: Role[], handler: (req: any, res: any) => any) {
  return async (req: any, res: any) => {
    if (!requireRole(req, res, allowed)) return;
    return handler(req, res);
  };
}
export const ADMIN: Role[] = ["admin"];
export const MEMBERS: Role[] = ["admin", "partner", "user"];
export const ANY_SESSION: Role[] = ["admin", "partner", "user", "guest"];

/** Role policy for every Express route not handled by a handler that checks the session itself.
 *  null = public (must authenticate by other means, e.g. the Telegram webhook secret). */
export function rolesForPath(method: string, path: string): Role[] | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/health" && method === "GET") return null;
  if (p === "/auth/verify-login") return null;
  if (p === "/auth/change-password") return ANY_SESSION; // handler re-checks role
  if (p === "/auth/two-factor") return ANY_SESSION; // handler re-checks role + password
  if (p === "/telegram/webhook" && method === "POST") return null;
  if (p === "/proxy" || p === "/admin-settings") return ANY_SESSION; // handlers re-check role/scope
  if (p === "/telegram/send") return MEMBERS;
  if (p === "/upload-audio" || p === "/generate-date" || p === "/stripe/checkout") return MEMBERS;
  if (p.startsWith("/telegram/")) return ADMIN; // test, diagnose, updates, senders*, webhook/set|info|delete
  return ADMIN; // default deny for anything new
}
