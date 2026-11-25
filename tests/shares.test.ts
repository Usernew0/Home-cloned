// SYNTHETIC: fake db. Owner derivation, strict pid, read filtering.
process.env.MEMBERSHIP_V2 = "1";
import test from "node:test";
import assert from "node:assert/strict";
import { readSharedItems, makeShareHandlers } from "../server/shares.ts";
import { createServerSession } from "../server/auth.ts";

process.env.SESSION_SECRET ||= "x".repeat(40); process.env.SERVER_SESSION_SECRET ||= process.env.SESSION_SECRET;
const N = "a".repeat(32);
function db(over: any = {}) {
  const calls: any[] = [];
  const d: any = {
    calls,
    from: (t: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => t === "membership_config" ? { data: { enabled: true }, error: null } : t === "user_accounts" ? { data: { id: "A", couple_id: "joint", personal_couple_id: "pa", pid_nonce: N }, error: null } : { data: null, error: null } }),
        in: async () => ({ data: over.rows ?? [], error: null }),
      }),
    }),
    rpc: async (fn: string, args: any) => { calls.push({ fn, args }); return fn === "shared_item_ids" ? { data: over.ids ?? [], error: null } : { data: 1, error: over.rpcErr ?? null }; },
  };
  return d;
}
const mockRes = () => { const r: any = { code: 200, body: null, status(c: number) { r.code = c; return r; }, json(b: any) { r.body = b; return r; } }; return r; };
const req = (body: any, pid = `u:A.${N}`) => ({ method: "POST", body, headers: { "x-server-session": createServerSession({ username: "a", coupleId: "joint", role: "user", pid }) }, query: {} }) as any;

test("shared read: read-only, shareable tables only, only rows still in the owner's personal space", async () => {
  assert.equal((await readSharedItems(db(), "B", "memories", "insert", false)).status, 403);
  assert.equal((await readSharedItems(db(), "B", "chat_messages", "select", false)).status, 400);
  assert.equal((await readSharedItems(db(), "B", "memories", "select", true)).status, 409);
  const d = db({ ids: [{ item_id: "m1", owner_space: "pa" }], rows: [{ id: "m1", couple_id: "pa" }, { id: "m1", couple_id: "pOther" }] });
  const r = await readSharedItems(d, "B", "memories", "select", false);
  assert.deepEqual(r.body.data, [{ id: "m1", couple_id: "pa" }]);
});

test("share: owner comes from the session pid; request owner fields are ignored; bad table or id refused", async () => {
  const d = db(); const h = makeShareHandlers(() => d);
  const res = mockRes(); await h.share(req({ table: "memories", itemId: "m1", owner: "SOMEONE_ELSE", p_owner: "X" }), res);
  assert.equal(res.code, 200);
  assert.deepEqual(d.calls[0], { fn: "share_create", args: { p_owner: "A", p_table: "memories", p_item: "m1" } });
  const bad = mockRes(); await h.share(req({ table: "chat_messages", itemId: "m1" }), bad); assert.equal(bad.code, 400);
  const bad2 = mockRes(); await h.share(req({ table: "memories", itemId: "a b;drop" }), bad2); assert.equal(bad2.code, 400);
});

test("share: wrong nonce is refused and nothing is called", async () => {
  const d = db(); const h = makeShareHandlers(() => d);
  const res = mockRes(); await h.share(req({ table: "memories", itemId: "m1" }, `u:A.${"b".repeat(32)}`), res);
  assert.equal(res.code, 409); assert.equal(d.calls.length, 0);
});
