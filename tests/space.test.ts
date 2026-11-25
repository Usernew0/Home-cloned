import test from "node:test";
import assert from "node:assert/strict";
import { stampSpaceId, classifySpace, isInMySpaces } from "../server/../src/lib/space.ts";

test("new items are stamped with the personal space when known, else the current one", () => {
  assert.equal(stampSpaceId("joint1", "pa"), "pa");
  assert.equal(stampSpaceId("joint1", ""), "joint1");
  assert.equal(stampSpaceId("joint1", undefined), "joint1");
  assert.equal(stampSpaceId("joint1", "  pa "), "pa");
});
test("classification: mine, together (legacy joint), other; empty ids are never mine", () => {
  assert.equal(classifySpace("pa", "joint1", "pa"), "mine");
  assert.equal(classifySpace("joint1", "joint1", "pa"), "together");
  assert.equal(classifySpace("pb", "joint1", "pa"), "other");
  assert.equal(classifySpace("", "joint1", "pa"), "other");
  assert.equal(classifySpace("pa", "pa", "pa"), "mine");
  assert.equal(classifySpace("c1", "c1", ""), "together");
  assert.equal(isInMySpaces("pb", "joint1", "pa"), false);
  assert.equal(isInMySpaces("pa", "joint1", "pa"), true);
});
