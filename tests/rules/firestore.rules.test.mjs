import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, query, where, getDocs, getDoc, setDoc, doc, deleteDoc, orderBy, limit, updateDoc, arrayUnion, FieldPath } from "firebase/firestore";
import fs from "node:fs";
import test from "node:test";

const env = await initializeTestEnvironment({ projectId: "demo-home", firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8089 } });
const as = (username, coupleId, role = "partner", pid = "u:" + username, globalChat = true) => env.authenticatedContext("a:" + username, { username, coupleId, role, pid, globalChat }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const memory = (id, coupleId) => ({ id, title: "t", type: "image", url: "u", description: "d", date: "2026-01-01", category: "c", coupleId });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "memories/m1"), memory("m1", "c1"));
  await setDoc(doc(db, "memories/m2"), memory("m2", "c2"));
  await setDoc(doc(db, "chatGroups/group_1"), { id: "group_1", name: "g", createdBy: "alice", createdAt: "x", members: ["alice", "carl"], pendingMembers: ["dave"], inviteCode: "GRP-ABC1230000000000000F" });
  await setDoc(doc(db, "chatMessages/g1"), { id: "g1", sender: "carl", content: "hi", timestamp: "2026-01-01T00:00:00Z", conversationId: "group_1", receiver: "group_1", coupleId: "c3", authorId: "u:carl" });
  await setDoc(doc(db, "chatMessages/p1"), { id: "p1", sender: "bob", content: "private", timestamp: "2026-01-01T00:00:01Z", receiver: "bob2", coupleId: "c2", senderId: "u:bob", receiverId: "u:bob2" });
  await setDoc(doc(db, "chatMessages/leg1"), { id: "leg1", sender: "bob", content: "legacy no ids", timestamp: "2026-01-01T00:00:04Z", receiver: "bob2", conversationId: "bob_bob2", coupleId: "c2" });
  await setDoc(doc(db, "chatMessages/gl"), { id: "gl", sender: "bob", content: "all", timestamp: "2026-01-01T00:00:02Z", receiver: "global", conversationId: "global", coupleId: "c2", authorId: "u:bob" });
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
test("chat: sent, received, global and group queries pass; foreign DMs fail", async () => {
  const db = as("alice", "c1");
  const q = (f, v) => getDocs(query(collection(db, "chatMessages"), where(f, "==", v), orderBy("timestamp", "asc"), limit(10)));
  await assertFails(q("coupleId", "c1"));                         // couple-wide chat queries are not allowed
  await assertSucceeds(q("senderId", "u:alice"));
  await assertSucceeds(q("receiverId", "u:alice"));
  await assertFails(q("sender", "alice"));                        // username queries are no longer a way in
  await assertFails(q("receiver", "alice"));
  await assertSucceeds(q("conversationId", "global"));
  await assertSucceeds(q("conversationId", "group_1"));          // alice is a member
  const eve = as("eve", "c9");
  await assertFails(getDocs(query(collection(eve, "chatMessages"), where("conversationId", "==", "group_1"), orderBy("timestamp", "asc"), limit(10))));
  await assertFails(getDocs(query(collection(eve, "chatMessages"), where("receiverId", "==", "u:bob2"), orderBy("timestamp", "asc"), limit(10))));
  await assertFails(getDocs(collection(eve, "chatMessages")));
});
test("chat: cannot send as someone else or with someone else's id", async () => {
  const msg = (sender, senderId) => ({ id: "n1", sender, senderId, receiver: "bobby1", receiverId: "u:bobby1", conversationId: "alice_bobby1", content: "x", timestamp: "2026-01-02T00:00:00Z", coupleId: "c1" });
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "chatMessages/n1"), msg("alice", "u:alice")));
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/n2"), { ...msg("bob", "u:alice"), id: "n2" }));   // wrong username
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/n3"), { ...msg("alice", "u:bob"), id: "n3" }));   // wrong id
  { const { senderId, ...noId } = msg("alice", "x"); await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/n4"), { ...noId, id: "n4" })); } // no id
  await assertFails(setDoc(doc(as("alice", "c1", "partner", ""), "chatMessages/n5"), { ...msg("alice", ""), id: "n5" })); // token without pid
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
test("DM privacy: only the two participant ids can read a cross-couple DM", async () => {
  const q = (db, f, v) => getDocs(query(collection(db, "chatMessages"), where(f, "==", v), orderBy("timestamp", "asc"), limit(10)));
  const sent = await assertSucceeds(q(as("bob", "c2"), "senderId", "u:bob"));
  if (!sent.docs.some((d) => d.id === "p1")) throw new Error("sender cannot read own DM");
  const got = await assertSucceeds(q(as("bob2", "c5"), "receiverId", "u:bob2"));
  if (!got.docs.some((d) => d.id === "p1")) throw new Error("receiver cannot read DM");
  await assertFails(q(as("bobby", "c2"), "coupleId", "c2"));        // sender's partner: couple query rejected
  await assertFails(q(as("bobby", "c2"), "receiverId", "u:bob2"));  // sender's partner: cannot ask for bob2's inbox
  await assertFails(q(as("bobby", "c2"), "senderId", "u:bob"));
  await assertFails(getDocs(collection(as("bobby", "c2"), "chatMessages")));
  await assertFails(q(as("carol", "c5"), "receiverId", "u:bob2"));  // receiver's partner
  await assertFails(q(as("root", "c0", "admin"), "receiverId", "u:bob2"));
  await assertFails(q(as("root", "c0", "admin"), "senderId", "u:bob"));
  await assertFails(getDocs(collection(as("root", "c0", "admin"), "chatMessages")));
  await assertSucceeds(q(as("root", "c0", "admin"), "conversationId", "global"));
  // identity: a namesake with a DIFFERENT id (renamed/re-registered account) inherits nothing, even though the username matches
  await assertFails(q(as("bob2", "c5", "partner", "u:other-bob2"), "receiverId", "u:bob2"));
  const namesake = await assertSucceeds(q(as("bob2", "c5", "partner", "u:other-bob2"), "receiverId", "u:other-bob2"));
  if (namesake.size !== 0) throw new Error("namesake saw messages");
  // a token without a pid can read no 1:1 message at all
  await assertFails(q(as("bob", "c2", "partner", ""), "senderId", ""));
  await assertFails(q(as("bob", "c2", "partner", ""), "senderId", "u:bob"));
  // legacy 1:1 row without ids is unreadable by direct get for everyone (sender, receiver, admin), until a reviewed backfill
  for (const [u, c, r] of [["bob", "c2", "partner"], ["bob2", "c5", "partner"], ["root", "c0", "admin"], ["bobby", "c2", "partner"]]) {
    await assertFails(getDoc(doc(as(u, c, r), "chatMessages/leg1")));
  }
  // partner chat with ids works for both
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "chatMessages/pc1"), { id: "pc1", sender: "bob", content: "hi love", timestamp: "2026-01-01T00:00:03Z", receiver: "bobby", conversationId: "bob_bobby", coupleId: "c2", senderId: "u:bob", receiverId: "u:bobby" });
  });
  const bobby = await assertSucceeds(q(as("bobby", "c2"), "receiverId", "u:bobby"));
  if (!bobby.docs.some((d) => d.id === "pc1")) throw new Error("partner cannot read partner chat");
  await assertSucceeds(q(as("eve", "c9"), "conversationId", "global"));
});
test("DM privacy: admin cannot read, edit or delete a 1:1 message but can moderate global", async () => {
  const admin = as("root", "c0", "admin");
  const base = { id: "p1", sender: "bob", senderId: "u:bob", receiverId: "u:bob2", content: "private", timestamp: "2026-01-01T00:00:01Z", receiver: "bob2", coupleId: "c2" };
  await assertFails(getDocs(query(collection(admin, "chatMessages"), where("receiverId", "==", "u:bob2"))));
  await assertFails(setDoc(doc(admin, "chatMessages/p1"), { ...base, content: "admin edit" }));
  await assertFails(deleteDoc(doc(admin, "chatMessages/p1")));
  await assertSucceeds(deleteDoc(doc(admin, "chatMessages/gl")));
});
test("routing: mixed shapes rejected on create", async () => {
  const mk = (extra) => ({ id: "r1", sender: "alice", senderId: "u:alice", content: "x", timestamp: "2026-01-04T00:00:00Z", coupleId: "c1", ...extra });
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/r1"), mk({ receiver: "bob", receiverId: "u:bob", conversationId: "global" })));
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/r1"), mk({ receiver: "global", conversationId: "alice_bob" })));
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/r1"), mk({ receiver: "bob", receiverId: "u:bob", conversationId: "group_1" })));
  const { senderId, ...base } = mk({});
  const ng = (extra) => ({ ...base, authorId: "u:alice", ...extra });
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "chatMessages/r1"), ng({ receiver: "global", conversationId: "global" })));
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "chatMessages/r2"), { ...ng({ receiver: "group_1", conversationId: "group_1" }), id: "r2" }));
  // global/group rows must not carry person ids (that keeps them out of every 1:1 query), and the author id must be mine
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/r3"), { ...ng({ receiver: "global", conversationId: "global", senderId: "u:alice" }), id: "r3" }));
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/r3"), { ...ng({ receiver: "global", conversationId: "global", authorId: "u:bob" }), id: "r3" }));
});
test("DM privacy: updates, deletes, routing and receiver validation", async () => {
  const base = { id: "p1", sender: "bob", senderId: "u:bob", receiverId: "u:bob2", content: "private", timestamp: "2026-01-01T00:00:01Z", receiver: "bob2", coupleId: "c2" };
  await assertSucceeds(setDoc(doc(as("bob2", "c5"), "chatMessages/p1"), { ...base, seen: true, reaction: "like" }));
  await assertFails(setDoc(doc(as("bob2", "c5"), "chatMessages/p1"), { ...base, content: "edited" }));
  await assertFails(setDoc(doc(as("bob2", "c5"), "chatMessages/p1"), { ...base, seen: true, couple_id: "c5" })); // couple_id is not a receipt field
  await assertFails(setDoc(doc(as("bobby", "c2"), "chatMessages/p1"), { ...base, seen: true }));
  await assertFails(deleteDoc(doc(as("bobby", "c2"), "chatMessages/p1")));
  // the namesake of the sender (same username, different id) cannot edit or delete
  await assertFails(setDoc(doc(as("bob", "c2", "partner", "u:other-bob"), "chatMessages/p1"), { ...base, content: "hijack" }));
  await assertFails(deleteDoc(doc(as("bob", "c2", "partner", "u:other-bob"), "chatMessages/p1")));
  // routing and ids are immutable
  await assertFails(setDoc(doc(as("bob", "c2"), "chatMessages/p1"), { ...base, receiver: "mallory" }));
  await assertFails(setDoc(doc(as("bob", "c2"), "chatMessages/p1"), { ...base, receiverId: "u:mallory" }));
  await assertFails(setDoc(doc(as("bob", "c2"), "chatMessages/p1"), { ...base, conversationId: "global" }));
  await assertFails(deleteDoc(doc(as("bob2", "c5"), "chatMessages/p1")));
  await assertSucceeds(setDoc(doc(as("bob", "c2"), "chatMessages/p1"), { ...base, content: "edited by sender" }));
  // create: direct messages need a well-formed recipient id
  const mk = (extra) => ({ id: "p2", sender: "bob", senderId: "u:bob", content: "yo", timestamp: "2026-01-03T00:00:00Z", receiver: "bob2", conversationId: "bob_bob2", coupleId: "c2", ...extra });
  await assertFails(setDoc(doc(as("bob", "c2"), "chatMessages/p2"), mk({})));                      // no receiverId
  await assertFails(setDoc(doc(as("bob", "c2"), "chatMessages/p2"), mk({ receiverId: "bob2" }))); // a username is not an id
  await assertSucceeds(setDoc(doc(as("bob", "c2"), "chatMessages/p2"), mk({ receiverId: "u:bob2" })));
  await assertSucceeds(deleteDoc(doc(as("bob", "c2"), "chatMessages/p2")));
});
const asG = (username, coupleId, globalChat) => as(username, coupleId, 'partner', 'u:' + username, globalChat);

const grp = (extra) => ({ id: "group_1", name: "g", createdBy: "alice", createdAt: "x", members: ["alice", "carl"], pendingMembers: ["dave"], inviteCode: "GRP-ABC1230000000000000F", ...extra });
const GID = "group_" + "a".repeat(24);
test("groups: read only for members/invitees; admin has no group access", async () => {
  await assertSucceeds(getDoc(doc(as("alice", "c1"), "chatGroups/group_1")));
  await assertSucceeds(getDoc(doc(as("dave", "c4"), "chatGroups/group_1")));
  await assertFails(getDoc(doc(as("eve", "c9"), "chatGroups/group_1")));
  await assertFails(getDoc(doc(as("root", "c0", "admin"), "chatGroups/group_1")));
  await assertFails(getDocs(collection(as("root", "c0", "admin"), "chatGroups")));
});
test("groups: create needs a random id, only the creator, no force-added members", async () => {
  const g = { id: GID, name: "n", createdBy: "alice", createdAt: "x", members: ["alice"], pendingMembers: ["carl"] };
  await assertFails(setDoc(doc(as("alice", "c1"), "chatGroups/group_17000"), { ...g, id: "group_17000" })); // guessable id
  await assertFails(setDoc(doc(as("alice", "c1"), "chatGroups/" + GID), { ...g, members: ["alice", "carl"] })); // force-add
  await assertFails(setDoc(doc(as("eve", "c9"), "chatGroups/" + GID), g)); // createdBy mismatch
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "chatGroups/" + GID), g));
  await assertFails(deleteDoc(doc(as("root", "c0", "admin"), "chatGroups/" + GID)));  // app admin cannot delete+recreate
  await assertFails(deleteDoc(doc(as("carl", "c3"), "chatGroups/" + GID)));
  await assertFails(deleteDoc(doc(as("alice", "c1"), "chatGroups/" + GID))); // hard delete is never allowed
});
test("groups: no hard delete; creator soft-delete keeps the id reserved", async () => {
  const id = "group_" + "a".repeat(24);
  const base = { id, name: "g", createdBy: "alice", createdAt: "x", members: ["alice"], pendingMembers: [], admins: [] };
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "chatGroups/" + id), base));
  await assertFails(deleteDoc(doc(as("alice", "c1"), "chatGroups/" + id)));
  await assertFails(deleteDoc(doc(as("root", "c0", "admin"), "chatGroups/" + id)));
  // only the creator can tombstone
  await assertFails(updateDoc(doc(as("carl", "c3"), "chatGroups/" + id), { members: [], deletedAt: "now" }));
  await assertSucceeds(updateDoc(doc(as("alice", "c1"), "chatGroups/" + id), { members: [], pendingMembers: [], admins: [], deletedAt: new Date().toISOString() }));
  // the known id cannot be recreated (by the creator or anyone else, including an app admin)
  await assertFails(setDoc(doc(as("alice", "c1"), "chatGroups/" + id), base));
  await assertFails(setDoc(doc(as("root", "c0", "admin"), "chatGroups/" + id), { ...base, createdBy: "root", members: ["root"] }));
  // and nobody can read it any more
  await assertFails(getDoc(doc(as("alice", "c1"), "chatGroups/" + id)));
});
test("groups: member powers are limited to themselves", async () => {
  await assertFails(setDoc(doc(as("eve", "c9"), "chatGroups/group_1"), grp({ members: ["alice", "carl", "eve"] })));
  await assertFails(setDoc(doc(as("dave", "c4"), "chatGroups/group_1"), grp({ members: ["alice", "carl", "dave", "eve"], pendingMembers: [] })));
  await assertFails(setDoc(doc(as("dave", "c4"), "chatGroups/group_1"), grp({ members: ["alice", "carl", "dave"], pendingMembers: [], admins: ["dave"] })));
  await assertFails(setDoc(doc(as("carl", "c3"), "chatGroups/group_1"), grp({ members: ["carl"] })));            // cannot remove others
  await assertFails(setDoc(doc(as("carl", "c3"), "chatGroups/group_1"), grp({ name: "hijack" })));
  await assertFails(setDoc(doc(as("carl", "c3"), "chatGroups/group_1"), grp({ mutedBy: ["alice"] })));            // someone else's mute entry
  await assertFails(setDoc(doc(as("carl", "c3"), "chatGroups/group_1"), grp({ memberJoinedAt: { alice: "x" } }))); // someone else's map entry
  await assertSucceeds(setDoc(doc(as("carl", "c3"), "chatGroups/group_1"), grp({ mutedBy: ["carl"], memberJoinedAt: { carl: "x" } })));
  await assertSucceeds(setDoc(doc(as("dave", "c4"), "chatGroups/group_1"), grp({ mutedBy: ["carl"], members: ["alice", "carl", "dave"], pendingMembers: [], memberJoinedAt: { carl: "x", dave: "y" } })));
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "chatGroups/group_1"), grp({ name: "renamed", members: ["alice", "carl", "dave"], pendingMembers: [], mutedBy: ["carl"], memberJoinedAt: { carl: "x", dave: "y" } })));
  await assertFails(setDoc(doc(as("alice", "c1"), "chatGroups/group_1"), grp({ members: ["alice", "carl", "dave", "eve"], pendingMembers: [] }))); // even the admin cannot force-add
});
test("groups: invite-code join works with the right code only", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "chatGroups/group_inv"), grp({ id: "group_inv", members: ["alice"], pendingMembers: [], inviteCode: "GRP-1111111111111111111A" }));
    await setDoc(doc(ctx.firestore(), "chatGroups/group_off"), grp({ id: "group_off", members: ["alice"], pendingMembers: [], inviteCode: "GRP-2222222222222222222B", isInviteLinkEnabled: false }));
  });
  // only a group admin registers a code, and only for its own current code
  await assertFails(setDoc(doc(as("eve", "c9"), "groupInvites/GRP-1111111111111111111A"), { groupId: "group_inv", historyVisible: true }));
  await assertFails(setDoc(doc(as("alice", "c1"), "groupInvites/GRP-4444444444444444444D"), { groupId: "group_inv", historyVisible: true }));
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "groupInvites/GRP-1111111111111111111A"), { groupId: "group_inv", historyVisible: true }));
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "groupInvites/GRP-2222222222222222222B"), { groupId: "group_off", historyVisible: true }));
  await assertFails(getDocs(collection(as("eve", "c9"), "groupInvites")));          // codes cannot be listed
  await assertSucceeds(getDoc(doc(as("eve", "c9"), "groupInvites/GRP-1111111111111111111A")));    // looked up by code only
  const join = (db, id, code, extra = {}) => updateDoc(doc(db, "chatGroups/" + id), "members", arrayUnion("eve"), "joinedVia", code, new FieldPath("memberJoinedAt", "eve"), "now", ...(extra.more || []));
  await assertFails(join(as("eve", "c9"), "group_inv", "GRP-2222222222222222222B"));              // code of another group
  await assertFails(join(as("eve", "c9"), "group_inv", "GRP-3333333333333333333C"));              // unknown code
  await assertFails(join(as("eve", "c9"), "group_off", "GRP-2222222222222222222B"));              // invite links disabled
  await assertFails(updateDoc(doc(as("eve", "c9"), "chatGroups/group_inv"), "members", arrayUnion("eve", "mallory"), "joinedVia", "GRP-1111111111111111111A"));  // cannot add others
  await assertFails(updateDoc(doc(as("eve", "c9"), "chatGroups/group_inv"), "members", arrayUnion("eve"), "joinedVia", "GRP-1111111111111111111A", "admins", ["eve"]));
  await assertFails(updateDoc(doc(as("eve", "c9"), "chatGroups/group_inv"), "members", arrayUnion("eve"), "joinedVia", "GRP-1111111111111111111A", new FieldPath("memberJoinedAt", "alice"), "x"));
  await assertSucceeds(join(as("eve", "c9"), "group_inv", "GRP-1111111111111111111A"));
  await assertSucceeds(getDoc(doc(as("eve", "c9"), "chatGroups/group_inv")));        // now a member
});
test("group messages: members only; receipts and reactions work for members", async () => {
  const m = (id, who, extra) => ({ id, sender: who, authorId: "u:" + who, content: "x", timestamp: "2026-01-05T00:00:00Z", conversationId: "group_1", receiver: "group_1", coupleId: "c9", ...extra });
  await assertFails(setDoc(doc(as("eve", "c9"), "chatMessages/ge"), m("ge", "eve")));
  await assertSucceeds(setDoc(doc(as("carl", "c3"), "chatMessages/gc"), m("gc", "carl", { coupleId: "c3" })));
  // another member may only touch receipt fields on carl's message
  await assertSucceeds(setDoc(doc(as("alice", "c1"), "chatMessages/gc"), { ...m("gc", "carl", { coupleId: "c3" }), reaction: "like", seen: true }));
  await assertFails(setDoc(doc(as("alice", "c1"), "chatMessages/gc"), { ...m("gc", "carl", { coupleId: "c3" }), content: "tampered" }));
  await assertFails(setDoc(doc(as("eve", "c9"), "chatMessages/gc"), { ...m("gc", "carl", { coupleId: "c3" }), reaction: "like" }));
  await assertSucceeds(setDoc(doc(as("carl", "c3"), "chatMessages/gc"), { ...m("gc", "carl", { coupleId: "c3" }), content: "edited by author" }));
  await assertSucceeds(deleteDoc(doc(as("carl", "c3"), "chatMessages/gc")));
  // a group-message listener works for members and fails for outsiders
  await assertSucceeds(getDocs(query(collection(as("alice", "c1"), "chatMessages"), where("conversationId", "==", "group_1"), orderBy("timestamp", "asc"), limit(10))));
  await assertFails(getDocs(query(collection(as("eve", "c9"), "chatMessages"), where("conversationId", "==", "group_1"), orderBy("timestamp", "asc"), limit(10))));
});
test("global lounge: closed or missing claim denies read, send, edit and receipts", async () => {
  const gm = (id, who) => ({ id, sender: who, authorId: "u:" + who, content: "x", timestamp: "2026-01-05T00:00:00Z", conversationId: "global", receiver: "global", coupleId: "c2" });
  const gq = (db) => getDocs(query(collection(db, "chatMessages"), where("conversationId", "==", "global"), orderBy("timestamp", "asc"), limit(10)));
  await assertSucceeds(setDoc(doc(as("bob", "c2"), "chatMessages/gx"), gm("gx", "bob")));
  await assertSucceeds(gq(as("carl", "c3")));
  await assertFails(setDoc(doc(as("bob", "c2", "partner", "u:bob", false), "chatMessages/gy"), gm("gy", "bob")));
  await assertFails(gq(as("carl", "c3", "partner", "u:carl", false)));
  await assertFails(gq(as("bob", "c2", "partner", "u:bob", false)));                                      // not even the author
  await assertFails(getDoc(doc(as("bob", "c2", "partner", "u:bob", false), "chatMessages/gx")));
  await assertFails(setDoc(doc(as("bob", "c2", "partner", "u:bob", false), "chatMessages/gx"), { ...gm("gx", "bob"), content: "edit" }));
  await assertFails(deleteDoc(doc(as("bob", "c2", "partner", "u:bob", false), "chatMessages/gx")));
  // a token with NO globalChat claim counts as closed (fail closed)
  const noClaim = env.authenticatedContext("a:old", { username: "old", coupleId: "c2", role: "partner", pid: "u:old" }).firestore();
  await assertFails(gq(noClaim));
  await assertFails(setDoc(doc(noClaim, "chatMessages/gz"), gm("gz", "old")));
  // closing the lounge never touches private DMs
  const sent = await assertSucceeds(getDocs(query(collection(as("bob", "c2", "partner", "u:bob", false), "chatMessages"), where("senderId", "==", "u:bob"), orderBy("timestamp", "asc"), limit(10))));
  if (!sent.docs.some((d) => d.id === "p1")) throw new Error("DMs must stay readable with the lounge closed");
  await assertSucceeds(setDoc(doc(as("bob", "c2"), "chatMessages/gx"), { ...gm("gx", "bob"), reaction: "like" }));
  await assertSucceeds(deleteDoc(doc(as("bob", "c2"), "chatMessages/gx")));
});
test.after(async () => { await env.cleanup(); });
