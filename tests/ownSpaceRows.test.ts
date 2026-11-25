import test from "node:test";
import assert from "node:assert/strict";

// firebase/auth (pulled in by the module) keeps timers alive after the tests; end this file's process once results are reported.
test.after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200); });
import { filterOwnSpaceRows } from "../src/lib/ownSpaceRows";

const rows = [{ id: "mine", couple_id: "pa" }, { id: "joint", couple_id: "cj" }, { id: "partner-shared", couple_id: "pb" }, { id: "stranger", couple_id: "px" }, { id: "legacy-null", couple_id: null }];
test("partner-shared and foreign rows never reach the cache or callback", () => {
  assert.deepEqual(filterOwnSpaceRows(rows, "cj", "pa").map((r) => r.id), ["mine", "joint", "legacy-null"]);
});
test("session without a personal space (legacy or admin) is unchanged", () => {
  assert.equal(filterOwnSpaceRows(rows, "cj", "").length, rows.length);
});
test("after unlink the former partner's shared row is not kept", () => {
  assert.deepEqual(filterOwnSpaceRows(rows, "pa", "pa").map((r) => r.id), ["mine", "legacy-null"]);
});
test("strict user session with unknown personal space fails closed", () => {
  assert.deepEqual(filterOwnSpaceRows(rows, "cj", "", true), []);
});
test("gate off (membershipV2 not reported): old behavior, nothing filtered", () => {
  assert.equal(filterOwnSpaceRows(rows, "cj", "", false).length, rows.length);
});
