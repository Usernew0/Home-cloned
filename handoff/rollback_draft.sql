-- RECOVERY (draft, not executed). It is NOT a return to legacy FOR ALL policies or browser write grants: once personal data is private, restoring joint
-- open policies would expose it. This is a MAINTENANCE DENY: browsers lose all direct table access, only the server (service_role) works.
-- Effects: direct browser reads of these tables stop (the app must read through /api/proxy; stale clients get errors, no data is exposed or changed).
-- Data is untouched. To resume service, re-run shares_draft.sql (policies are re-created from the asserted allowlist) after reviewing the cause.
-- A true return to pre-migration policy text must come from the baseline policy output of inventory_readonly.sql, reviewed by hand, and is not automated here.
BEGIN;
DO $$ DECLARE t TEXT; p RECORD; BEGIN
  FOREACH t IN ARRAY ARRAY['milestones','date_plans','memories','letters','couple_questions','celebration_cards','activity_logs','couple_tenants'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE POLICY "maintenance service role" ON public.%I FOR ALL USING (auth.role()=''service_role'') WITH CHECK (auth.role()=''service_role'')', t);
  END LOOP;
END $$;
COMMIT;
-- Server side: keep MEMBERSHIP_V2=1 (never remove it to "roll back"); fix forward or redeploy the previous server build only together with a reviewed policy baseline.
