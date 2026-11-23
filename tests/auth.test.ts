import assert from "node:assert/strict";
import test from "node:test";

import { createServerSession, hashPassword, verifyPassword, verifySecret, verifyServerSession } from "../server/auth.ts";

test("verifies a legacy plaintext password", async () => {
  assert.equal(await verifyPassword("ourhome", "ourhome"), true);
  assert.equal(await verifyPassword("wrong", "ourhome"), false);
});

test("verifies a hashed password", async () => {
  const storedPassword = hashPassword("ourhome");
  assert.equal(await verifyPassword("ourhome", storedPassword), true);
  assert.equal(await verifyPassword("wrong", storedPassword), false);
});

test("rejects empty or missing stored passwords", async () => {
  assert.equal(await verifyPassword("ourhome", ""), false);
  assert.equal(await verifyPassword("ourhome", undefined as unknown as string), false);
});

test("requires the configured webhook secret only when configured", () => {
  assert.equal(verifySecret("anything", undefined), true);
  assert.equal(verifySecret("correct", "correct"), true);
  assert.equal(verifySecret("wrong", "correct"), false);
  assert.equal(verifySecret(undefined, "correct"), false);
});

test("rejects missing webhook configuration in production", () => {
  assert.equal(verifySecret("anything", undefined, true), false);
  assert.equal(verifySecret("anything", "anything", true), true);
});

test("creates and verifies a server session with tenant claims", () => {
  const token = createServerSession({
    username: "partner",
    coupleId: "couple_test",
    role: "partner",
  });
  const payload = verifyServerSession(token);
  assert.equal(payload?.username, "partner");
  assert.equal(payload?.coupleId, "couple_test");
  assert.equal(payload?.role, "partner");
  assert.equal(payload && payload.expiresAt > Date.now(), true);
});

test("rejects tampered and malformed server sessions", () => {
  const token = createServerSession({ username: "admin", coupleId: "couple_test", role: "admin" });
  assert.equal(verifyServerSession(`${token}tampered`), null);
  assert.equal(verifyServerSession("not-a-session"), null);
});
