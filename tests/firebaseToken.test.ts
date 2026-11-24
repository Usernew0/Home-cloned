import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { isFirebaseTokenConfigured, mintFirebaseToken } from "../server/firebaseToken.ts";

test("firebase token: not configured -> null (Firestore stays closed)", () => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY;
  assert.equal(isFirebaseTokenConfigured(), false);
  assert.equal(mintFirebaseToken({ username: "a", coupleId: "c", role: "user" }), null);
});

test("firebase token: RS256 signature verifies and carries coupleId/role claims", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL = "sa@test-project.iam.gserviceaccount.com";
  process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n");
  const t = mintFirebaseToken({ username: "Alice", coupleId: "c1", role: "partner", accountId: "user_alice", pid: "u:user_alice" }, 1000)!;
  const [h, p, s] = t.split(".");
  assert.ok(crypto.createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url")));
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.deepEqual(payload.claims, { coupleId: "c1", role: "partner", username: "Alice", pid: "u:user_alice", globalChat: true });
  assert.equal(payload.exp, 4600);
  assert.equal(payload.uid, "a:user_alice");
  // fail closed: no account id, or the shared default tenant without opt-in, mints nothing
  assert.equal(mintFirebaseToken({ username: "A", coupleId: "c1", role: "user" }), null);
  assert.equal(mintFirebaseToken({ username: "A", coupleId: "couple_default", role: "user", accountId: "x" }), null);
  assert.equal(mintFirebaseToken({ username: "A", coupleId: "", role: "user", accountId: "x" }), null);
  assert.equal(payload.iss, "sa@test-project.iam.gserviceaccount.com");
  delete process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY;
});
