// SYNTHETIC: policy-level checks only (no database). 1:1 history follows participants, never the current space.
import test from "node:test";
import assert from "node:assert/strict";
import { authorizeProxy, chatVisibilityOr, visibleChatRow } from "../server/policy.ts";

const sess = (pid: string, coupleId: string) => ({ username: "x", coupleId, role: "user", pid, expiresAt: Date.now() + 1e6 }) as any;
const old = { id: "m1", couple_id: "joint_old", sender: "a", receiver: "b", conversation_id: "a_b", sender_id: "u:A", receiver_id: "u:B" };

test("chat select is not narrowed by the current couple id; non-1:1 rows still are", () => {
  const d: any = authorizeProxy(sess("u:A", "pa"), { table: "chat_messages", action: "select" } as any);
  assert.equal(d.ok, true);
  assert.equal(d.filters.some((f: any) => f.column === "couple_id"), false);
  assert.equal(d.chatCoupleId, "pa");
  const expr = chatVisibilityOr("u:A", true, "pa");
  assert.match(expr, /sender_id\.eq\."u:A"/);
  assert.match(expr, /and\(couple_id\.eq\."pa",receiver\.eq\.global/);
  assert.doesNotMatch(expr.split(",").slice(0, 2).join(","), /couple_id/); // the pid terms carry no couple condition
});

test("old pair keeps the thread after unlink or a new link; a new partner never matches", () => {
  assert.equal(visibleChatRow(old, "u:A"), true);
  assert.equal(visibleChatRow(old, "u:B"), true);
  assert.equal(visibleChatRow(old, "u:C"), false); // A's new partner
  assert.equal(visibleChatRow(old, ""), false);
});

test("other tables are still scoped to the current couple", () => {
  const d: any = authorizeProxy(sess("u:A", "pa"), { table: "memories", action: "select" } as any);
  assert.equal(d.filters.find((f: any) => f.column === "couple_id").value, "pa");
});

test("edit and delete of own chat rows depend on the sender pid, not on the space", () => {
  const d: any = authorizeProxy(sess("u:A", "pa"), { table: "chat_messages", action: "delete", filters: [{ column: "id", operator: "eq", value: "m1" }] } as any);
  assert.equal(d.ok, true);
  assert.ok(d.filters.some((f: any) => f.column === "sender_id" && f.value === "u:A"));
  assert.equal(d.filters.some((f: any) => f.column === "couple_id"), false);
});
