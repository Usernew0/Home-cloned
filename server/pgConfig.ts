/** The ONLY place a database client config is built. Pure, so tests can assert the final options: verified TLS against Supabase's CA, no URL query parameters (sslmode etc.) are ever passed through, project id must match the selected source. */
export function buildPgConfig(raw: string, expectedRef: string, ca: string): any {
  let u: URL; try { u = new URL(String(raw || "").trim()); } catch { throw Object.assign(new Error("the database address is not a valid URL"), { code: "BAD_URL" }); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw Object.assign(new Error("the database address is not a postgres URL"), { code: "BAD_URL" });
  const ref = dbProjectRef(u);
  if (!ref || !expectedRef || ref !== expectedRef) throw Object.assign(new Error("the database address does not belong to the selected Supabase project (or its project id could not be read from it)"), { code: "WRONG_PROJECT" });
  return { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.replace(/^\//, "") || "postgres"), ssl: { ca, rejectUnauthorized: true, servername: u.hostname }, statement_timeout: 20000, query_timeout: 30000, connectionTimeoutMillis: 10000, idle_in_transaction_session_timeout: 60000, application_name: "backup-readonly" };
}
export const dbProjectRef = (u: URL): string | null => { const m = /^postgres\.([a-z0-9]{10,30})$/.exec(decodeURIComponent(u.username)); if (m) return m[1]; const h = /^db\.([a-z0-9]{10,30})\.supabase\.co$/.exec(u.hostname); return h ? h[1] : null; };
