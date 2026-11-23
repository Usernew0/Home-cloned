import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, orderBy, limit } from "firebase/firestore";
import fs from "node:fs";
import test from "node:test";

const env = await initializeTestEnvironment({ projectId: "demo-home", firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8089 } });
const as = (username, coupleId, role = "partner") => env.authenticatedContext("a:" + username, { username, coupleId, role }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const memory = (id, coupleId) => ({ id, title: "t", type: "image", url: "u", description: "d", date: "2026-01-01", category: "c", coupleId });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "memories/m1"), memory("m1", "c1"));
  await setDoc(doc(db, "memories/m2"), memory("m2", "c2"));
  await setDoc(doc(db, "chatGroups/group_1"), { id: "group_1", name: "g", createdBy: "alice", createdAt: "x", members: ["alice", "carl"], pendingMembers: ["dave"] });
  await setDoc(doc(db, "chatMessages/g1"), { id: "g1", sender: "carl", content: "hi", timestamp: "2026-01-01T00:00:00Z", conversationId: "group_1", receiver: "group_1", coupleId: "c3" });
  await setDoc(doc(db, "chatMessages/p1"), { id: "p1", sender: "bob", content: "private", timestamp: "2026-01-01T00:00:01Z", receiver: "bob2", coupleId: "c2" });
  await setDoc(doc(db, "chatMessages/gl"), { id: "gl", sender: "bob", content: "all", timestamp: "2026-01-01T00:00:02Z", receiver: "global", conversationId: "global", coupleId: "c2" });
  await setDoc(doc(db, "userAccounts/u1"), { id: "u1", password: "x" });
  await setDoc(doc(db, "presence/alice"), { username: "alice", lastActive: "x", coupleId: "c1" });
  await setDoc(doc(db, "presence/bob"), { username: "bob", lastActive: "x", coupleId: "c2" });
});

test("unauthenticated: everything denied", async () => {
  await assertFails(getDocs(collection(anon(), "memories")));
  await assertFails(getDocs(collection(anon(), "chatMessages")));
  await assertFails(setDoc(doc(anon(), "memories/x"), memory("x", "c1")));
});
test("couple-scoped query works; unscoped list and cross-couple read are denied", async () => {
  const db = as("alice", "c1");
  const snap = await assertSucceeds(getDocs(query(collection(db, "memories"), where("coupleId", "==", "c1"))));
  if (snap.size !== 1) throw new Error("expected 1 doc, got " + snap.size);
  await assertFails(getDocs(collection(db, "memories")));
  await assertFails(getDocs(query(collection(db, "memories"), where("coupleId", "==", "c2"))));
});
test("admin reads all", async () => {
  await assertSucceeds(getDocs(collection(as("root", "c0", "admin"), "memories")));
});
test("writes: own couple only, no tenant spoofing, guests read-only", async () => {
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "memories/new"), memory("new", "c1")));
  await assertFails(setDoc(doc(as("alice", "c1"), "memories/spoof"), memory("spoof", "c2")));
  await assertFails(setDoc(doc(as("alice", "c1"), "memories/m2"), memory("m2", "c1"))); // overwrite other couple's doc
  await assertFails(deleteDoc(doc(as("alice", "c1"), "memories/m2")));
  await assertFails(setDoc(doc(as("gus", "c1", "guest"), "memories/g"), memory("g", "c1")));
  await assertSucceeds(getDocs(query(collection(as("gus", "c1", "guest"), "memories"), where("coupleId", "==", "c1"))));
});
test("credential collections are closed to everyone including admin", async () => {
  for (const c of ["userAccounts", "adminSettings", "coupleTenants"]) {
    await assertFails(getDocs(collection(as("root", "c0", "admin"), c)));
  }
});
test("chat: own couple, sent, received, global and group queries pass; foreign DMs fail", async () => {
  const db = as("alice", "c1");
  const q = (f, v) => getDocs(query(collection(db, "chatMessages"), where(f, "==", v), orderBy("timestamp", "asc"), limit(10)));
  await assertSucceeds(q("coupleId", "c1"));
  await assertSucceeds(q("sender", "alice"));
  await assertSucceeds(q("receiver", "alice"));
  await assertSucceeds(q("conversationId", "global"));
  await assertSucceeds(q("conversationId", "group_1"));          // alice is a member
  const eve = as("eve", "c9");
  await assertFails(getDocs(query(collection(eve, "chatMessages"), where("conversationId", "==", "group_1"), orderBy("timestamp", "asc"), limit(10))));
  await assertFails(getDocs(query(collection(eve, "chatMessages"), where("receiver", "==", "bob2"), orderBy("timestamp", "asc"), limit(10))));
  await assertFails(getDocs(collection(eve, "chatMessages")));
});
test("chat: cannot send as someone else", async () => {
  const msg = (sender) => ({ id: "n1", sender, content: "x", timestamp: "2026-01-02T00:00:00Z", coupleId: "c1" });
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "chatMessages/n1"), msg("alice")));
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/n2"), { ...msg("bob"), id: "n2" }));
});
test("groups: members and invitees query; others cannot", async () => {
  await assertSucceeds(getDocs(query(collection(as("alice", "c1"), "chatGroups"), where("members", "array-contains", "alice"))));
  await assertSucceeds(getDocs(query(collection(as("dave", "c4"), "chatGroups"), where("pendingMembers", "array-contains", "dave"))));
  await assertFails(getDocs(collection(as("alice", "c1"), "chatGroups")));
  await assertFails(getDocs(query(collection(as("eve", "c9"), "chatGroups"), where("members", "array-contains", "alice"))));
});
test("presence: partner visible, own doc writable only", async () => {
  await assertSucceeds(getDocs(query(collection(as("alice", "c1"), "presence"), where("coupleId", "==", "c1"))));
  await assertFails(getDocs(collection(as("alice", "c1"), "presence")));
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "presence/alice"), { username: "alice", lastActive: "y", coupleId: "c1" }));
  await assertFails(setDoc(doc(as("alice", "c1"), "presence/bob"), { username: "bob", lastActive: "y", coupleId: "c2" }));
});
test.after(async () => { await env.cleanup(); });
