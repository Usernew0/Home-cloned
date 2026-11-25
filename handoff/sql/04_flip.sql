-- 04_flip.sql  LAST step, with MEMBERSHIP_V2=1 already set in the deployment. Rollback is the maintenance deny (rollback_draft.sql), never the old policies.
-- WRITE FREEZE: from the moment the preflight is run until this flip, nobody may use the app (Firestore changes cannot be detected from SQL).
-- Step 1 (no SQL): an admin calls the op fs-preflight-record. It runs the read-only comparison and ONLY IF it returns ready:true it records the reconciliation (project + report hash + Supabase data fingerprint) through mem_record_reconciliation().
-- Step 2: the flip. The trigger refuses it unless the record is < 60 minutes old, the Supabase data is unchanged since, and activation is complete (triggers enabled, policies, no browser write privileges, solo tenants).
UPDATE public.membership_config SET enabled = TRUE WHERE id = 1;
