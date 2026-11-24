#!/usr/bin/env node
// Applies a REVIEWED plan.json (output of plan-participant-backfill.mjs) to chat rows. DRY RUN by default: prints what it would do.
//   node scripts/apply-participant-backfill.mjs plan.json            (dry run, writes nothing)
//   node scripts/apply-participant-backfill.mjs plan.json --apply    (writes senderId/receiverId only)
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and (for Firestore) FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_EMAIL,
// FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY in the environment. Run it only from the owner's own machine.
// It only sets the two id fields on rows listed as "safe" and only when they are still empty. Message content is never read or changed.
// Ambiguous rows are never touched; they stay unreadable (not deleted) until someone decides their owners.
import fs from "node:fs";
const [file, flag] = process.argv.slice(2);
const apply = flag === "--apply";
const plan = JSON.parse(fs.readFileSync(file, "utf8"));
const safe = plan.safe || [];
console.log(`${apply ? "APPLY" : "DRY RUN"}: ${safe.length} safe rows, ${(plan.ambiguous || []).length} ambiguous rows left untouched`);
if (!apply) { for (const r of safe.slice(0, 20)) console.log(r.id, r.senderId, r.receiverId); process.exit(0); }
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let done = 0;
for (const r of safe) {
  const { error } = await sb.from("chat_messages").update({ sender_id: r.senderId, receiver_id: r.receiverId }).eq("id", r.id).is("sender_id", null).is("receiver_id", null);
  if (error) { console.error("supabase", r.id, error.message); continue; }
  done++;
}
console.log("supabase rows updated:", done);
if (process.env.FIREBASE_PROJECT_ID) {
  const admin = (await import("firebase-admin")).default;
  admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL, privateKey: (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n") }) });
  const fs2 = admin.firestore(); let fdone = 0;
  for (const r of safe) {
    const ref = fs2.collection("chatMessages").doc(r.id); const snap = await ref.get();
    if (!snap.exists) continue; const d = snap.data();
    if (d.senderId || d.receiverId) continue;
    await ref.update({ senderId: r.senderId, receiverId: r.receiverId }); fdone++;
  }
  console.log("firestore docs updated:", fdone);
}
