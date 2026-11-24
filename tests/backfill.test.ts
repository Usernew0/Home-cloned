import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore plain .mjs script
import { plan } from "../scripts/plan-participant-backfill.mjs";

test("backfill plan: only unambiguous 1:1 rows get ids; everything else is listed, nothing is applied", () => {
  const data = {
    userAccounts: [{ id: "user_1", pid_nonce: "n1", username: "Ahmed" }, { id: "user_2", pid_nonce: "n2", username: "Omar", created_at: "2026-03-01T00:00:00Z" }, { id: "user_3", pid_nonce: "n3", username: "Mai" }, { id: "user_4", pid_nonce: "n4", username: "dup" }],
    adminAccounts: [{ id: "admin_1", pidNonce: "a1", username: "DUP" }],
    messages: [
      { id: "ok", sender: "Ahmed", receiver: "Omar", conversationId: "ahmed_omar", timestamp: "2026-04-01T00:00:00Z" },
      { id: "global", sender: "Ahmed", receiver: "global", conversationId: "global" },
      { id: "dupname", sender: "Ahmed", receiver: "dup", conversationId: "ahmed_dup" },
      { id: "missing", sender: "Ahmed", receiver: "ghost", conversationId: "ahmed_ghost" },
      { id: "mixed", sender: "Ahmed", receiver: "Omar", conversationId: "global" },
      { id: "wrongconv", sender: "Ahmed", receiver: "Omar", conversationId: "x_y" },
      { id: "old", sender: "Ahmed", receiver: "Omar", conversationId: "ahmed_omar", timestamp: "2026-01-01T00:00:00Z" },
      { id: "norecv", sender: "Ahmed", receiver: "", conversationId: "ahmed_" },
    ],
  };
  const p = plan(data);
  assert.deepEqual(p.safe, [{ id: "ok", senderId: "u:user_1.n1", receiverId: "u:user_2.n2" }]);
  const amb = Object.fromEntries(p.ambiguous.map((a: any) => [a.id, a.reasons.join("|")]));
  assert.ok(/matches 2 accounts/.test(amb.dupname));
  assert.ok(/no account named/.test(amb.missing));
  assert.ok(/mixed or malformed/.test(amb.mixed));
  assert.ok(/does not match/.test(amb.wrongconv));
  assert.ok(/predates the account/.test(amb.old));
  assert.ok(amb.norecv);
  assert.equal(p.summary.nonDirectSkipped, 1);
  assert.equal(p.summary.direct, 7);
});
