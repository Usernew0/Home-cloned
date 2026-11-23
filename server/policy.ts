import type { ServerSessionPayload } from "./auth.js";

/** Tables holding per-couple data. Rows carry couple_id and are scoped to the session's couple. */
export const COUPLE_TABLES = ["milestones", "date_plans", "memories", "letters", "couple_questions", "activity_logs", "celebration_cards", "chat_messages"] as const;
/** Tables that only admins may write; non-admins may read only the scoped/sanitized subset below. */
export const ADMIN_TABLES = ["user_accounts", "admin_settings", "couple_tenants", "profiles"] as const;

const SENSITIVE_COLUMNS = ["password", "two_factor_secret", "two_factor_backup_codes", "username", "adminAccounts", "admin_accounts", "credentials"];
const SENSITIVE_USER_COLUMNS = ["password", "two_factor_secret", "two_factor_backup_codes"];

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SELECT_LIST = /^[A-Za-z0-9_,\s*:().!]*$/;
const MAX_LIMIT = 1000;
const MAX_ROWS = 200;
const MAX_FILTERS = 10;
const MAX_IN_VALUES = 200;

export type ProxyBody = {
  table?: unknown;
  action?: unknown;
  select?: unknown;
  filters?: unknown;
  order?: unknown;
  data?: unknown;
  options?: any;
  single?: unknown;
  count?: unknown;
  head?: unknown;
};

export type Filter = { column: string; operator: "eq" | "neq" | "ilike" | "in"; value: any };

/** Columns a non-admin may change on their own user_accounts row. Role, couple, password and 2FA are never client-writable. */
export const SELF_EDITABLE_USER_COLUMNS = ["gender", "enable_global_chat", "telegram_username", "display_name"];
export const SELF_EDITABLE_PROFILE_COLUMNS = ["display_name", "username"];

export type Authorized = {
  /** Row ids to exclude on select (privileged settings rows). */
  notIn?: string[];
  /** Set for non-admin own-profile writes: the handler must run an update restricted to the session's own username. */
  selfProfile?: boolean;
  ok: true;
  table: string;
  action: "select" | "insert" | "upsert" | "update" | "delete";
  select: string;
  filters: Filter[];
  order?: { column: string; ascending: boolean };
  data: any;
  onConflict?: string;
  limit?: number;
  single: boolean;
  count?: "exact" | "planned" | "estimated";
  head: boolean;
  /** Non-admin upserts must be checked against existing rows for cross-couple overwrite. */
  ownershipCheckIds: string[];
  /** Column names to strip from returned rows. */
  stripColumns: string[];
};
export type Denied = { ok: false; status: number; error: string };

const deny = (status: number, error: string): Denied => ({ ok: false, status, error });

export function isCoupleTable(t: string) {
  return (COUPLE_TABLES as readonly string[]).includes(t);
}
export function isAdminTable(t: string) {
  return (ADMIN_TABLES as readonly string[]).includes(t);
}

export function authorizeProxy(session: ServerSessionPayload, body: ProxyBody): Authorized | Denied {
  const { table, action } = body || {};
  if (typeof table !== "string" || typeof action !== "string") return deny(400, "Missing table or action");
  if (!isCoupleTable(table) && !isAdminTable(table)) return deny(403, "Table not allowed");
  if (!["select", "insert", "upsert", "update", "delete"].includes(action)) return deny(400, "Invalid action");

  const isAdmin = session.role === "admin";
  const write = action !== "select";

  if (write && session.role === "guest") return deny(403, "Read-only account");
  const selfProfileTable = table === "user_accounts" || table === "profiles";
  if (write && isAdminTable(table) && !isAdmin && !selfProfileTable) return deny(403, "Administrator access required");
  if (write && !isAdmin && selfProfileTable && action === "delete") return deny(403, "Administrator access required");
  if (!isAdmin && table === "admin_settings" && write) return deny(403, "Administrator access required");

  // Filters: strict. Unknown operators are rejected, never ignored (an ignored filter turns a targeted write into a mass write).
  const rawFilters = body.filters === undefined ? [] : body.filters;
  if (!Array.isArray(rawFilters) || rawFilters.length > MAX_FILTERS) return deny(400, "Invalid filters");
  const filters: Filter[] = [];
  for (const f of rawFilters as any[]) {
    if (!f || typeof f.column !== "string" || !IDENT.test(f.column)) return deny(400, "Invalid filter column");
    if (!["eq", "neq", "ilike", "in"].includes(f.operator)) return deny(400, "Unsupported filter operator");
    if (f.operator === "in" && (!Array.isArray(f.value) || f.value.length > MAX_IN_VALUES)) return deny(400, "Invalid in-filter value");
    if (f.operator !== "in" && (typeof f.value === "object" && f.value !== null)) return deny(400, "Invalid filter value");
    if ((action === "update" || action === "delete") && f.operator !== "eq") return deny(400, "Only eq filters are allowed for writes");
    filters.push({ column: f.column, operator: f.operator, value: f.value });
  }

  // Mass-write safeguard.
  if ((action === "update" || action === "delete") && !filters.some((f) => f.operator === "eq" && f.value !== undefined && f.value !== null && f.value !== "")) {
    return deny(400, "update/delete require at least one eq filter");
  }

  // Tenant scoping for non-admins.
  const scoped = !isAdmin && (isCoupleTable(table) || table === "couple_tenants" || table === "user_accounts");
  const scopeColumn = "couple_id";
  let scopedFilters = filters;
  if (scoped) {
    scopedFilters = filters.filter((f) => f.column !== scopeColumn);
    scopedFilters.push({ column: scopeColumn, operator: "eq", value: session.coupleId });
  }
  if (!isAdmin && table === "profiles" && action === "select") scopedFilters = [...filters, { column: "username", operator: "eq", value: session.username }];

  // Select shape.
  let select = "*";
  if (body.select !== undefined) {
    if (typeof body.select !== "string" || body.select.length > 500 || !SELECT_LIST.test(body.select)) return deny(400, "Invalid select");
    select = body.select || "*";
  }
  let order: Authorized["order"];
  if (body.order !== undefined) {
    const o: any = body.order;
    if (!o || typeof o.column !== "string" || !IDENT.test(o.column)) return deny(400, "Invalid order");
    order = { column: o.column, ascending: o.ascending ?? true };
  }
  let limit: number | undefined;
  if (action === "select") {
    const requested = Number(body.options?.limit);
    limit = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_LIMIT) : MAX_LIMIT;
  }
  let count: Authorized["count"];
  if (body.count !== undefined && body.count !== null && body.count !== false) {
    if (!["exact", "planned", "estimated"].includes(body.count as string)) return deny(400, "Invalid count");
    count = body.count as any;
  }

  // Payload.
  let data: any = body.data;
  let onConflict: string | undefined;
  const ownershipCheckIds: string[] = [];
  let selfProfile = false;
  let notIn: string[] | undefined;
  if (!isAdmin && write && selfProfileTable && action !== "delete") {
    // Own-row edits only: reduce to a whitelisted update on the caller's own username.
    if (action === "insert") return deny(403, "Administrator access required");
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object" || Array.isArray(data) && data.length !== 1) return deny(400, "Invalid payload");
    if (typeof row.username === "string" && row.username.toLowerCase() !== session.username.toLowerCase()) return deny(403, "You can only edit your own profile");
    const allowed = table === "user_accounts" ? SELF_EDITABLE_USER_COLUMNS : SELF_EDITABLE_PROFILE_COLUMNS;
    const clean: any = {};
    for (const k of Object.keys(row)) if (allowed.includes(k)) clean[k] = row[k];
    if (Object.keys(clean).length === 0) return deny(400, "No editable profile fields supplied");
    for (const k of Object.keys(clean)) if (!IDENT.test(k)) return deny(400, "Invalid column name");
    data = clean;
    selfProfile = true;
    scopedFilters = [{ column: "username", operator: "eq", value: session.username }];
  }
  if (!selfProfile && (action === "insert" || action === "upsert" || action === "update")) {
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0 || rows.length > MAX_ROWS) return deny(400, "Invalid payload size");
    if (action === "update" && Array.isArray(data)) return deny(400, "Invalid update payload");
    for (const r of rows) {
      if (!r || typeof r !== "object" || Array.isArray(r)) return deny(400, "Invalid payload");
      for (const k of Object.keys(r)) if (!IDENT.test(k)) return deny(400, "Invalid column name");
    }
    if (!isAdmin) {
      // Stamp tenant on every row; never trust a client-supplied couple_id.
      for (const r of rows) {
        if (isCoupleTable(table)) r.couple_id = session.coupleId;
        else if (table === "user_accounts" || table === "couple_tenants") return deny(403, "Administrator access required");
        if (action === "update") delete r.couple_id;
        if (action === "upsert" && typeof r.id === "string") ownershipCheckIds.push(r.id);
      }
    }
    if (action === "upsert" || action === "insert") {
      const oc = body.options?.onConflict;
      if (oc !== undefined) {
        if (oc !== "id" && oc !== "couple_id") return deny(400, "Invalid onConflict");
        onConflict = oc;
      }
    }
  }
  if (action === "delete" && !isAdmin && !isCoupleTable(table)) return deny(403, "Administrator access required");

  // Password hashes and 2FA secrets never leave the server, not even for admins.
  let stripColumns: string[] = [];
  if (table === "user_accounts") stripColumns = SENSITIVE_USER_COLUMNS;
  if (!isAdmin && table === "admin_settings") stripColumns = SENSITIVE_COLUMNS;
  if (isAdmin && table === "admin_settings") stripColumns = ["two_factor_secret", "two_factor_backup_codes"];

  // Admin writes to user_accounts cannot set 2FA material; that goes through the re-authenticating endpoint.
  if (isAdmin && write && table === "user_accounts" && data && typeof data === "object") {
    for (const r of Array.isArray(data) ? data : [data]) for (const k of ["two_factor_secret", "two_factor_backup_codes", "two_factor_enabled", "two_factor_created_at"]) delete r[k];
  }

  // Non-admins never see the rows that hold admin credentials.
  if (!isAdmin && table === "admin_settings" && action === "select") {
    notIn = ["adminAccounts", "credentials"];
  }

  return {
    ok: true,
    notIn,
    table,
    action: (selfProfile ? "update" : action) as Authorized["action"],
    selfProfile,
    select,
    filters: scopedFilters,
    order,
    data,
    onConflict,
    limit,
    single: !!body.single,
    count,
    head: !!body.head,
    ownershipCheckIds,
    stripColumns,
  };
}

export function stripColumns<T>(data: T, columns: string[]): T {
  if (!columns.length || data === null || data === undefined) return data;
  const clean = (row: any) => {
    if (!row || typeof row !== "object") return row;
    const copy = { ...row };
    for (const c of columns) delete copy[c];
    return copy;
  };
  return (Array.isArray(data) ? data.map(clean) : clean(data)) as T;
}
