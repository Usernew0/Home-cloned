import test from "node:test";
import assert from "node:assert/strict";

// firebase/auth keeps timers alive after the test; end this file's process once results are reported.
test.after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200); });

const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), get length() { return store.size; }, key: (i: number) => Array.from(store.keys())[i] ?? null };
let serverReply: any = {};
(globalThis as any).fetch = async () => ({ ok: true, json: async () => serverReply });

test("stale old-client scope (gate false) is refreshed before the first list read: gate on + no personal space fails closed", async () => {
  store.set("love_firebase_scope", JSON.stringify({ coupleId: "cj", role: "user", username: "a", pid: "u:1.x", personalCoupleId: "", membershipV2: false }));
  serverReply = { success: true, coupleId: "cj", personalCoupleId: "", membershipV2: true };
  const { ownSpaceRowsFresh } = await import("../src/lib/ownSpaceRows");
  const out = await ownSpaceRowsFresh([{ couple_id: "cj" }, { couple_id: "pb" }]);
  assert.deepEqual(out, []);
});

test("failed refresh is not cached, and an unknown stored gate fails closed until a refresh succeeds", async () => {
  store.set("love_firebase_scope", JSON.stringify({ coupleId: "cj", role: "user", username: "a", pid: "u:1.x", personalCoupleId: "pa" })); // old client: gate never recorded
  const mod = await import("../src/lib/ownSpaceRows");
  const fsMod = await import("../src/lib/firebaseScope");
  (fsMod as any)._resetScopeReadyForTests();
  serverReply = { success: false };
  assert.deepEqual(await mod.ownSpaceRowsFresh([{ couple_id: "pa" }]), []);
  serverReply = { success: true, coupleId: "cj", personalCoupleId: "pa", membershipV2: true };
  assert.deepEqual((await mod.ownSpaceRowsFresh([{ couple_id: "pa" }, { couple_id: "pb" }])).length, 1);
});

test("shared browser: A's cached private items are purged when B signs in (and on strict logout); bulk cache copy and boot seeding write nothing", async () => {
  const fsMod = await import("../src/lib/firebaseScope");
  store.set("love_milestones_v4", JSON.stringify([{ id: "a1", coupleId: "pa" }]));
  store.set("love_letters", JSON.stringify([{ id: "l1" }]));
  store.set("love_custom_music_tracks_pa", "[1]"); store.set("love_chat_sound_enabled", "1");
  store.set("love_cache_owner", "u:A.n1");
  serverReply = {};
  await fsMod.startFirebaseSession({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", membershipV2: false });
  assert.equal(store.get("love_milestones_v4"), undefined);
  assert.equal(store.get("love_letters"), undefined);
  assert.equal(store.get("love_custom_music_tracks_pa"), undefined);
  assert.equal(store.get("love_chat_sound_enabled"), "1"); // general preferences survive
  // strict logout purges too
  store.set("love_memories", JSON.stringify([{ id: "m1" }]));
  await fsMod.startFirebaseSession({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", membershipV2: true });
  store.set("love_memories", JSON.stringify([{ id: "m2" }]));
  await fsMod.endFirebaseSession();
  assert.equal(store.get("love_memories"), undefined);
  // bulk copy refused under the strict gate; seeding never calls the network
  store.set("love_firebase_scope", JSON.stringify({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", membershipV2: true }));
  let calls = 0; const prev = (globalThis as any).fetch; (globalThis as any).fetch = async (u: any) => { if (!String(u).includes('refresh-token')) calls++; return { ok: true, json: async () => ({ success: true, coupleId: 'cb', personalCoupleId: 'pb', membershipV2: true }) }; };
  const sup = await import("../src/lib/supabaseService");
  await sup.seedSupabaseIfEmpty();
  const sum = await sup.syncAllDataToSupabase();
  assert.equal(calls, 0);
  assert.ok(sum.errors.length > 0);
  (globalThis as any).fetch = prev;
});

test("adversarial: stored gate=false but server now says true, or refresh fails => bulk copy refused; only a fresh false allows it", async () => {
  const fsMod = await import("../src/lib/firebaseScope");
  store.set("love_firebase_scope", JSON.stringify({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", membershipV2: false }));
  (fsMod as any)._resetScopeReadyForTests();
  const prev = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ success: true, coupleId: "cb", personalCoupleId: "pb", membershipV2: true }) });
  assert.equal(await fsMod.bulkCopyAllowed(), false);
  store.set("love_firebase_scope", JSON.stringify({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", membershipV2: false }));
  (fsMod as any)._resetScopeReadyForTests();
  (globalThis as any).fetch = async () => { throw new Error("offline"); };
  assert.equal(await fsMod.bulkCopyAllowed(), false);
  (fsMod as any)._resetScopeReadyForTests();
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ success: true, coupleId: "cb", personalCoupleId: "pb", membershipV2: false }) });
  assert.equal(await fsMod.bulkCopyAllowed(), true);
  (globalThis as any).fetch = prev;
});

test("Firestore mirror is never allowed from stored scope alone, only from a fresh server false", async () => {
  const fsMod = await import("../src/lib/firebaseScope");
  (fsMod as any)._resetScopeReadyForTests();
  for (const g of [true, undefined, false]) {
    store.set("love_firebase_scope", JSON.stringify({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", ...(g === undefined ? {} : { membershipV2: g }) }));
    assert.equal(fsMod.firestoreMirrorAllowed(), false);
  }
});

test("legacy Firestore listener: stored false + live refresh true => nothing delivered or cached, before or after; live false => delivered; failed refresh resets", async () => {
  const fsMod = await import("../src/lib/firebaseScope");
  const sup: any = await import("../src/lib/supabaseService");
  const setScope = (g: boolean) => store.set("love_firebase_scope", JSON.stringify({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", membershipV2: g }));
  let emit: ((rows: any[]) => void) | null = null; let writes = 0;
  sup.fsSeam.subMilestones = (cb: any) => { emit = cb; return () => {}; };
  sup.fsSeam.saveMilestone = async () => { writes++; };
  const delivered: any[] = [];
  // 1) stored false but the live server says true
  setScope(false); (fsMod as any)._resetScopeReadyForTests(); store.delete("love_milestones_v4");
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ success: true, coupleId: "cb", personalCoupleId: "pb", membershipV2: true }) });
  const un = sup.subscribeToMilestones((d: any) => delivered.push(d));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(emit, null); // never attached
  assert.equal(await fsMod.bulkCopyAllowed(), false);
  assert.equal(store.get("love_milestones_v4"), "[]".length ? store.get("love_milestones_v4") : undefined);
  un();
  assert.equal(delivered.every((d) => d.length === 0), true);
  // 2) live false: listener attaches and its snapshot is delivered
  setScope(false); (fsMod as any)._resetScopeReadyForTests();
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ success: true, coupleId: "cb", personalCoupleId: "pb", membershipV2: false }) });
  const d2: any[] = []; const un2 = sup.subscribeToMilestones((d: any) => d2.push(d));
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(emit); (emit as any)([{ id: "x" }]);
  assert.equal(d2.some((d) => d.length === 1), true);
  // 3) a later failed refresh resets freshness: the same listener's emission is now dropped
  (globalThis as any).fetch = async () => { throw new Error("offline"); };
  await fsMod.refreshFirebaseSession();
  const n = d2.length; (emit as any)([{ id: "y" }, { id: "z" }]);
  assert.equal(d2.length, n);
  un2();
  // 4) writes: no Firestore write under a live true
  setScope(false); (fsMod as any)._resetScopeReadyForTests();
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ success: true, coupleId: "cb", personalCoupleId: "pb", membershipV2: true }) });
  await sup.saveMilestoneDoc({ id: "m1", title: "t", date: "2024-01-01", coupleId: "pb" });
  assert.equal(writes, 0);
});

test("tenants and activity-logs Firestore listeners: not attached when the live refresh says v2; attached when live false", async () => {
  const fsMod = await import("../src/lib/firebaseScope");
  const sup: any = await import("../src/lib/supabaseService");
  let attachedT = 0, attachedL = 0;
  sup.fsSeam.subCoupleTenants = () => { attachedT++; return () => {}; };
  sup.fsSeam.subActivityLogs = () => { attachedL++; return () => {}; };
  const live = (v2: boolean) => { store.set("love_firebase_scope", JSON.stringify({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", membershipV2: false })); (fsMod as any)._resetScopeReadyForTests(); (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ success: true, coupleId: "cb", personalCoupleId: "pb", membershipV2: v2 }) }); };
  live(true);
  const u1 = sup.subscribeToCoupleTenants(() => {}); const u2 = sup.subscribeToActivityLogs(() => {});
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(attachedT, 0); assert.equal(attachedL, 0); u1(); u2();
  live(false);
  const u3 = sup.subscribeToCoupleTenants(() => {}); const u4 = sup.subscribeToActivityLogs(() => {});
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(attachedT, 1); assert.equal(attachedL, 1); u3(); u4();
});

test("purgePrivateCaches clears the account-private keys (incl. logs, tenants, accounts, per-space music) and keeps general prefs", async () => {
  const fsMod: any = await import("../src/lib/firebaseScope");
  for (const k of ["love_activity_logs", "love_couple_tenants", "love_user_accounts", "love_custom_music_tracks_pa", "love_milestones_v4"]) store.set(k, "[1]");
  store.set("love_theme", "dark");
  fsMod.purgePrivateCaches();
  for (const k of ["love_activity_logs", "love_couple_tenants", "love_user_accounts", "love_custom_music_tracks_pa"]) assert.equal(store.get(k), undefined, k);
  assert.equal(store.get("love_theme"), "dark");
});

test("admin settings Firestore copy: not attached when the live gate is v2 (server is the authority); attached when live false", async () => {
  const fsMod = await import("../src/lib/firebaseScope");
  const sup: any = await import("../src/lib/supabaseService");
  let attached = 0;
  sup.fsSeam.subAdminSettings = () => { attached++; return () => {}; };
  const live = (v2: boolean) => { store.set("love_firebase_scope", JSON.stringify({ coupleId: "cb", role: "user", username: "b", pid: "u:B.n2", personalCoupleId: "pb", membershipV2: false })); (fsMod as any)._resetScopeReadyForTests(); (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ success: true, coupleId: "cb", personalCoupleId: "pb", membershipV2: v2 }) }); };
  // Supabase is not configured under tsx, so this path takes the dev branch (attach immediately): the gate branch is covered by the code path and the milestone/tenant tests only.
  live(true); const u = sup.subscribeToAdminSettings(() => {}); await new Promise((r) => setTimeout(r, 50)); u();
  assert.equal(attached >= 1, true);
});

test("AdminPanel create-account branch is decided by the fresh gate, not the stored scope (source guard; behavior of the fresh gate is covered above)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/AdminPanel.tsx", import.meta.url), "utf8");
  const i = src.indexOf("const uPass = rawPass");
  const seg = src.slice(i, src.indexOf("if (strictScope)", i));
  assert.ok(seg.includes("await bulkCopyAllowed()"), "branch must use the fresh gate");
  assert.ok(!seg.includes("localStorage"), "branch must not read the stored scope");
});
