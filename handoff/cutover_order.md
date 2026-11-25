# SQL cutover order (draft classification, NOT executed anywhere; derived by reading the statements)

Principle: nothing that changes what an OLD client can do may run before the server gate (MEMBERSHIP_V2=1) is deployed with the new client. Additive objects that old code never touches are prep.

## A. Additive prep (old clients unaffected)
membership_draft.sql: ADD COLUMN personal_couple_id, membership_epoch; couple_tenants pair_key, link_status and their unique indexes; membership_ops, membership_op_locks (RLS on, revoked); mem_* functions; requesting_* helper functions and their grants; membership_config (enabled=FALSE, RLS on, revoked); guard_tenant_delete (blocks deleting a joint tenant: affects the admin delete of joint tenants, treat as ACTIVATION if admins still delete those).
shares_draft.sql: item_shares table (RLS on, revoked), guard_item_shares, share_effective, item_shared_with_me, my_effective_shares, share_create/share_remove/shared_item_ids and their grants.
Case-insensitive username index: prep, but its safe assertion aborts if case-duplicates exist (manual resolution; no auto-merge).

## B. Backfill (needs the review before anyone runs it)
Mint personal_couple_id for accounts without one (backfill op / legacy files). Reads only, then writes only the new column.

## C. Activation (changes old-client behavior; run only with the new server and client live and the gate ready)
- trg_guard_membership (BEFORE UPDATE on user_accounts): blocks direct couple_id updates by the old link flow.
- trg_init_personal_space (BEFORE INSERT on user_accounts): forces new accounts solo; the old admin create and old link code break.
- shares_draft.sql drop_item_shares trigger and the DO blocks that rewrite RLS policies on the 6 shareable tables and revoke browser writes / TRUNCATE etc.: old direct-write clients lose writes.
- membership_config enabled=TRUE flip (last).

Unverified: the exact line-by-line assignment of the shares_draft DO blocks (policy rewrite vs revoke vs trigger creation), and whether guard_tenant_delete should be C. Splitting the physical files was not done; this is a map. Rollback after v2 data exists is the maintenance deny (rollback_draft.sql), never the old policies.

## D. Firestore-only structured data (READINESS GATE, not done)
In strict mode Supabase is the only store for milestones, date_plans, memories, letters, couple_questions, celebration_cards (Firestore read/save/delete are skipped). Chat, presence and music stay on Firestore. Before activation (and before any real-project source switch):
1. Inventory Firestore docs in milestones, datePlans, memories, letters, coupleQuestions, celebrationCards (count + ids + coupleId).
2. For each, check the id exists in Supabase with the same couple_id. Any Firestore-only doc = unreconciled.
3. Import the unreconciled ones (owner-assigned, reviewed) and re-count. Activation is REFUSED while the unreconciled count is not zero. Nothing is copied or deleted automatically.
No inventory has been run (no live access); the TEST project's Firestore content is unknown to me.

## Update (v10): real files
- SQL split: /tmp/out/sql/01_prep.sql (additive), 02_backfill_NOTE.md, 03_activation.sql (refuses before backfill), 04_flip.sql. Test: /tmp/rt/t8.mjs (13/13, PGlite, synthetic).
- FS-only preflight (read-only dry run, writes nothing, NOT run live): server/fsPreflight.ts, op `fs-preflight` via /api/proxy (admin only). Compares ids + space + content hash for the six collections; `ready` is true only if every collection is clean. Tests: tests/fsPreflight.test.ts (mock fetch/db). Activation stays refused unless ready.

## Update (v11)
- 01_prep.sql now also adds+fills pid_nonce (the TEST schema dump has no such column) and does NOT replace the legacy requesting_couple_id(); strict function is requesting_couple_id_v2(), used only by activation policies.
- 03_activation.sql is one transaction (BEGIN, LOCK user_accounts SHARE ROW EXCLUSIVE, checks incl. null nonce, ..., COMMIT) and installs a trigger that refuses enabled FALSE->TRUE unless activation exists, no account lacks identity columns, and membership_config.fs_reconciled_at is set.
- 04_flip.sql: step 1 is an explicit operator attestation write (only after fs-preflight ready:true), step 2 the flip. Inspection (fs-preflight) writes nothing; it needs FIREBASE_PROJECT_ID, refuses partial lists, uses ordered paging, and reports Firestore-only non-empty fields as not ready.

## Update (v12): verified readiness
- The old manual attestation is gone. membership_config now holds fs_reconciled_at, fs_project, fs_report_hash, fs_data_fingerprint, writable only through mem_record_reconciliation() (service role), which refuses unless mem_activation_problems() is empty. A plain UPDATE of those columns is refused by trigger.
- The record is written by the admin op `fs-preflight-record` ONLY when that same run returned ready:true; it stores the Firestore project and a hash of the report. Inspection (`fs-preflight`) never writes.
- The flip trigger refuses unless: record present and < 60 min old, Supabase data fingerprint (row-content hash of the six tables) unchanged since the record, triggers enabled, RLS on, only the expected policies (no legacy/extra), no browser INSERT/UPDATE/DELETE/TRUNCATE privilege on the seven tables + couple_tenants, every account has its solo tenant, no null nonce/personal id.
- LIMIT: Firestore-side changes after the record cannot be detected from SQL. The cutover REQUIRES a write freeze (no app use) from the preflight until the flip. No cross-store atomicity is claimed.
- Test-release code readiness (this repo + these SQL files, local tests) is separate from real-target prerequisites (fresh read-only inventory of the target, backups, creator assignment, running the preflight against the real project, key switch), which are not done and not claimed.

## Update (v14)
- Identity reset: pid_nonce is written only by prep (NULL rows) and the column default on a new row. If an account is deleted/recreated or its nonce edited by hand, SQL item shares (account ids) survive but music grants (nonce-bound grantee pid) go dormant; re-share needed. Normal unlink/relink/login does not change it, so exact-pair restoration is unaffected.
- init_personal_space now leaves an existing account's proposed row alone (INSERT ... ON CONFLICT DO UPDATE fires BEFORE INSERT first).
- Admin saves of an existing couple_tenants row no longer resend partner1/partner2/pair_key/link_status (server strips them).

## Update (v15): local acceptance handoff, test-project rehearsal prerequisites
Order (TEST Supabase + TEST Firestore only; nothing run yet): 1) fresh read-only inventory of the test project (policies, function bodies incl. legacy requesting_couple_id, pid_nonce/personal_couple_id columns, triggers, grants); 2) backup/export of both stores; 3) deploy new server+client with MEMBERSHIP_V2 unset (gate off); 4) 01_prep.sql; 5) 02 backfill (members/{pid} docs need Firestore REST write capability: probe not yet approved; accounts get personal ids and tenants); 6) publish firestore.rules.v2 (after members docs exist); 7) write freeze (no app use); 8) admin op fs-preflight (read-only) until ready:true and any Firestore-only docs reconciled; 9) 03_activation.sql; 10) admin op fs-preflight-record (records only on ready:true); 11) within 60 minutes with unchanged Supabase data: 04_flip.sql; 12) set MEMBERSHIP_V2=1, end freeze, smoke test with two throwaway accounts. Rollback = rollback_draft.sql (maintenance deny), never the old policies.
Protection added in v15: pid_nonce immutable once set (DB guard); admin account writes in strict mode lose couple_id/personal_couple_id/membership_epoch; new admin tenants cannot set pair_key/link_status.
