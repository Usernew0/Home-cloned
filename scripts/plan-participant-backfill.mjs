#!/usr/bin/env node
// READ-ONLY planner. Reads a JSON export file, prints a plan, writes nothing anywhere (no database, no network).
//   node scripts/plan-participant-backfill.mjs export.json > plan.json
// export.json: { userAccounts: [{id, username, created_at?}], adminAccounts: [{id, username}], legacyCredentials?: {id, username},
//                messages: [{id, sender, receiver, conversationId|conversation_id, timestamp?}] }
// Set "auditOnly": true in the export (pre-patch, no pid_nonce yet) to get name-based counts of safe/ambiguous rows without ids.
// Output: { summary, safe: [{id, senderId, receiverId}], ambiguous: [{id, reasons[]}] }.
// "safe" means only: both names resolve to exactly ONE account in all stores, the routing is a plain 1:1 shape, and nothing hints
// that a name was reused. It is a PROPOSAL for a human to review; applying it is a separate, deliberate step that needs admin-level
// access to Firestore/Supabase and is not part of this script.
import fs from "node:fs";

const clean = (v) => (typeof v === "string" ? v.toLowerCase().trim() : "");
const pid = (kind, id) => { const s = typeof id === "string" || typeof id === "number" ? String(id).trim() : ""; return s && s.length <= 120 && !/\s/.test(s) ? `${kind}:${s}` : ""; };

export function plan(data) {
  const accounts = [];
  for (const u of data.userAccounts || []) accounts.push({ name: clean(u.username), pid: u.pid_nonce ? pid("u", `${u.id}.${u.pid_nonce}`) : "", created: u.created_at ? Date.parse(u.created_at) : NaN });
  for (const a of data.adminAccounts || []) accounts.push({ name: clean(a.username), pid: a.pidNonce ? pid("adm", `${a.id}.${a.pidNonce}`) : "", created: NaN });
  if (!(data.adminAccounts || []).length && data.legacyCredentials) accounts.push({ name: clean(data.legacyCredentials.username), pid: pid("leg", data.legacyCredentials.id), created: NaN });
  const resolve = (name) => {
    const hits = accounts.filter((a) => a.name && a.name === clean(name));
    if (hits.length === 0) return { reason: `no account named "${name}"` };
    if (hits.length > 1) return { reason: `"${name}" matches ${hits.length} accounts` };
    if (!hits[0].pid && !data.auditOnly) return { reason: `account "${name}" has no permanent id` };
    return { account: hits[0] };
  };
  const safe = [], ambiguous = [], skipped = [];
  for (const m of data.messages || []) {
    const receiver = clean(m.receiver), conv = clean(m.conversationId ?? m.conversation_id);
    const nonDirect = (!receiver && !conv) || (receiver === "global" && conv === "global") || (receiver.startsWith("group_") && conv.startsWith("group_"));
    if (nonDirect) { skipped.push(m.id); continue; }
    const reasons = [];
    const s = resolve(m.sender), r = resolve(m.receiver);
    if (s.reason) reasons.push("sender: " + s.reason);
    if (r.reason) reasons.push("receiver: " + r.reason);
    if (!receiver) reasons.push("no receiver on a 1:1 row");
    if (receiver === "global" || receiver.startsWith("group_") || conv === "global" || conv.startsWith("group_")) reasons.push("mixed or malformed routing");
    if (receiver && conv && conv !== [clean(m.sender), receiver].sort().join("_")) reasons.push("conversation id does not match the sender/receiver pair");
    if (m.sender !== m.sender?.trim?.() || m.receiver !== m.receiver?.trim?.()) reasons.push("padded name");
    const ts = Date.parse(m.timestamp || "");
    for (const x of [s, r]) if (x.account && Number.isFinite(ts) && Number.isFinite(x.account.created) && ts < x.account.created) reasons.push(`message predates the account "${x.account.name}" (name may have been reused)`);
    if (reasons.length) ambiguous.push({ id: m.id, reasons });
    else safe.push({ id: m.id, senderId: s.account.pid, receiverId: r.account.pid });
  }
  return { summary: { direct: safe.length + ambiguous.length, safe: safe.length, ambiguous: ambiguous.length, nonDirectSkipped: skipped.length }, safe, ambiguous };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node scripts/plan-participant-backfill.mjs export.json"); process.exit(2); }
  console.log(JSON.stringify(plan(JSON.parse(fs.readFileSync(file, "utf8"))), null, 2));
}
