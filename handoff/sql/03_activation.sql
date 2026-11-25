-- 03_activation.sql  Changes old-client behavior. Run ONLY after: new server + new client deployed (MEMBERSHIP_V2 gate ready), 02 backfill verified, Firestore-only preflight clean. DRAFT, NOT EXECUTED.
BEGIN;
-- Serialize with account creation: no insert can slip between the checks and the triggers below. All-or-nothing: any failure rolls the whole file back.
LOCK TABLE public.user_accounts IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.user_accounts WHERE personal_couple_id IS NULL OR couple_id IS NULL OR pid_nonce IS NULL OR pid_nonce = '') THEN RAISE EXCEPTION 'backfill incomplete: accounts without personal_couple_id, couple_id or pid_nonce'; END IF; END $$;
DROP TRIGGER IF EXISTS trg_guard_membership ON public.user_accounts;
CREATE TRIGGER trg_guard_membership BEFORE UPDATE ON public.user_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_membership_columns();
-- New accounts always start on their OWN solo space. The id is generated here (stable, unique, never supplied by the caller) and a solo tenant row is created with it.
-- A caller-supplied couple_id or personal_couple_id on INSERT is ignored: joining a partner happens only through the validated link operation, never by creating an account inside someone's joint space.
CREATE OR REPLACE FUNCTION public.init_personal_space() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pid TEXT := 'couple_' || regexp_replace(NEW.id, '^user_', '');
BEGIN
  -- INSERT ... ON CONFLICT (id) DO UPDATE (the admin edit path) fires this BEFORE the conflict is resolved: an existing account is not a new account, leave the proposed row alone (the guard trigger still protects couple_id, personal_couple_id and pid_nonce on the update).
  IF EXISTS (SELECT 1 FROM public.user_accounts u WHERE u.id = NEW.id) THEN RETURN NEW; END IF;
  IF pid IN ('couple_', 'couple_default') OR pid !~ '^couple_[A-Za-z0-9_-]{1,100}$' THEN RAISE EXCEPTION 'invalid account id for a personal space'; END IF;
  -- an existing tenant row with this id is never adopted unless it is already this account's own empty solo tenant
  IF EXISTS (SELECT 1 FROM couple_tenants t WHERE t.couple_id = pid AND t.partner1 IS DISTINCT FROM NEW.username) THEN RAISE EXCEPTION 'personal space id belongs to another tenant'; END IF;
  IF EXISTS (SELECT 1 FROM couple_tenants t WHERE t.couple_id = pid AND (t.pair_key IS NOT NULL OR coalesce(t.partner2, '') <> ''))
     OR EXISTS (SELECT 1 FROM user_accounts u WHERE u.id <> NEW.id AND (u.couple_id = pid OR u.personal_couple_id = pid)) THEN
    RAISE EXCEPTION 'generated personal space is already in use';
  END IF;
  NEW.personal_couple_id := pid;
  NEW.couple_id := pid;
  INSERT INTO couple_tenants(couple_id, couple_name, partner1, partner2, plan) VALUES (pid, NEW.username || '''s Couple', NEW.username, '', coalesce(nullif(NEW.plan, ''), 'free')) ON CONFLICT (couple_id) DO NOTHING; -- plan: the account's own plan if set, else the column default 'free'; never an implicit upgrade
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_init_personal_space ON public.user_accounts;
CREATE TRIGGER trg_init_personal_space BEFORE INSERT ON public.user_accounts FOR EACH ROW EXECUTE FUNCTION public.init_personal_space();
CREATE OR REPLACE FUNCTION public.guard_tenant_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN IF OLD.pair_key IS NOT NULL THEN RAISE EXCEPTION 'joint spaces are retained, not deleted'; END IF; RETURN OLD; END $$;
DROP TRIGGER IF EXISTS trg_guard_tenant_delete ON public.couple_tenants;
CREATE TRIGGER trg_guard_tenant_delete BEFORE DELETE ON public.couple_tenants FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_delete();
DO $$ DECLARE t TEXT; p RECORD; unknown TEXT := ''; known TEXT[] := ARRAY[
  'Milestones access policy','Milestones couple isolation','Tenant milestones access','Date plans access policy','Date plans couple isolation','Tenant date plans access',
  'Memories access policy','Memories couple isolation','Tenant memories access','Letters access policy','Tenant letters access',
  'Couple questions access policy','Tenant couple questions access','Celebration cards access policy','Celebration cards couple isolation','Tenant celebration cards access',
  'Activity logs access policy','Authenticated activity logs access','Tenant activity logs access',
  'own personal read','shared item read','legacy joint read','service role','maintenance service role'];
BEGIN
  FOREACH t IN ARRAY ARRAY['milestones','date_plans','memories','letters','couple_questions','celebration_cards','activity_logs'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      IF NOT (p.policyname = ANY (known)) THEN unknown := unknown || t || ':' || p.policyname || '; '; END IF;
    END LOOP;
  END LOOP;
  IF unknown <> '' THEN RAISE EXCEPTION 'Unexpected policies, review before migrating: %', unknown; END IF;
  FOREACH t IN ARRAY ARRAY['milestones','date_plans','memories','letters','couple_questions','celebration_cards','activity_logs'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t); -- re-grants after a maintenance-deny recovery (REVOKE ALL)
    EXECUTE format('CREATE POLICY "own personal read" ON public.%I FOR SELECT USING (auth.role() = ''authenticated'' AND couple_id <> '''' AND couple_id = public.requesting_personal_couple_id())', t);
    IF t <> 'activity_logs' THEN
      EXECUTE format('CREATE POLICY "shared item read" ON public.%I FOR SELECT USING (auth.role() = ''authenticated'' AND public.item_shared_with_me(%L, id::text, couple_id))', t, t);
    END IF;
    EXECUTE format('CREATE POLICY "legacy joint read" ON public.%I FOR SELECT USING (auth.role() = ''authenticated'' AND couple_id <> '''' AND couple_id = public.requesting_couple_id_v2())', t);
    EXECUTE format('CREATE POLICY "service role" ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')', t);
  END LOOP;
END $$;


-- couple_tenants: browsers may only READ their own tenant rows (current or personal space). pair_key, link_status, partner ids, plan and deletes are service-only.
DO $$ DECLARE p RECORD; unknown TEXT := ''; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='couple_tenants' LOOP
    IF p.policyname NOT IN ('Couple tenants access policy','Tenant couple access','tenant own read','tenant service role','maintenance service role') THEN unknown := unknown || p.policyname || '; '; END IF;
  END LOOP;
  IF unknown <> '' THEN RAISE EXCEPTION 'Unexpected couple_tenants policies, review before migrating: %', unknown; END IF;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='couple_tenants' LOOP
    EXECUTE format('DROP POLICY %I ON public.couple_tenants', p.policyname);
  END LOOP;
  ALTER TABLE public.couple_tenants ENABLE ROW LEVEL SECURITY;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.couple_tenants FROM anon, authenticated;
  GRANT SELECT ON public.couple_tenants TO authenticated;
  CREATE POLICY "tenant own read" ON public.couple_tenants FOR SELECT USING (auth.role()='authenticated' AND couple_id <> '' AND (couple_id = public.requesting_couple_id_v2() OR couple_id = public.requesting_personal_couple_id()));
  CREATE POLICY "tenant service role" ON public.couple_tenants FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
END $$;

-- Release hardening: RLS does not cover TRUNCATE, and REFERENCES/TRIGGER are never needed by browser roles. Strip only those three privileges on every touched table.
-- Intended SELECT (and, for chat_messages and user_accounts, any other privilege not named here) is left exactly as it is.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['milestones','date_plans','memories','letters','couple_questions','celebration_cards','activity_logs','couple_tenants','chat_messages','user_accounts'] LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Verified flip readiness. The Firestore reconciliation is recorded ONLY by mem_record_reconciliation() (service role; called by the admin op fs-preflight-record after a run that returned ready:true), bound to the Firestore project and a hash of that run's report, and to a fingerprint of the six Supabase tables at that moment.
-- The flip is refused unless the record is recent, the Supabase data is unchanged since, and the activation state is complete (triggers enabled, policies, no browser write privileges, solo tenants).
-- A Firestore-side change after the record cannot be detected from SQL: the cutover requires a write freeze (no app use) from the preflight until the flip. Documented in cutover_order.md; this file does not promise cross-store atomicity.
CREATE OR REPLACE FUNCTION public.mem_data_fingerprint() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT md5(coalesce(string_agg(t || ':' || id || ':' || h, ',' ORDER BY t, id), '')) FROM (
    SELECT 'milestones' t, id::text id, md5(x::text) h FROM milestones x UNION ALL SELECT 'date_plans', id::text, md5(x::text) FROM date_plans x
    UNION ALL SELECT 'memories', id::text, md5(x::text) FROM memories x UNION ALL SELECT 'letters', id::text, md5(x::text) FROM letters x
    UNION ALL SELECT 'couple_questions', id::text, md5(x::text) FROM couple_questions x UNION ALL SELECT 'celebration_cards', id::text, md5(x::text) FROM celebration_cards x) q $$;

CREATE OR REPLACE FUNCTION public.mem_activation_problems() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t TEXT; p RECORD; probs TEXT := '';
  okpol TEXT[] := ARRAY['own personal read','shared item read','legacy joint read','service role'];
  oktpol TEXT[] := ARRAY['tenant own read','tenant service role'];
BEGIN
  FOR t IN SELECT tgname FROM unnest(ARRAY['trg_init_personal_space','trg_guard_membership']) tgname LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t AND NOT tgisinternal AND tgenabled = 'O') THEN probs := probs || 'trigger ' || t || ' missing or disabled; '; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_tenant_delete' AND NOT tgisinternal AND tgenabled = 'O') THEN probs := probs || 'trigger trg_guard_tenant_delete missing or disabled; '; END IF;
  FOREACH t IN ARRAY ARRAY['milestones','date_plans','memories','letters','couple_questions','celebration_cards','activity_logs','couple_tenants'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity) THEN probs := probs || t || ' RLS off; '; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      IF NOT (p.policyname = ANY (CASE WHEN t = 'couple_tenants' THEN oktpol ELSE okpol END)) THEN probs := probs || t || ' unexpected policy ' || p.policyname || '; '; END IF;
    END LOOP;
    IF t <> 'couple_tenants' AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'own personal read') THEN probs := probs || t || ' lacks own personal read; '; END IF;
    IF has_table_privilege('anon', 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege('authenticated', 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE') THEN probs := probs || t || ' browser write privilege present; '; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM user_accounts WHERE personal_couple_id IS NULL OR couple_id IS NULL OR pid_nonce IS NULL OR pid_nonce = '') THEN probs := probs || 'accounts without personal_couple_id/couple_id/pid_nonce; '; END IF;
  IF EXISTS (SELECT 1 FROM user_accounts u WHERE NOT EXISTS (SELECT 1 FROM couple_tenants c WHERE c.couple_id = u.personal_couple_id)) THEN probs := probs || 'account without its solo tenant; '; END IF;
  RETURN probs;
END $$;
REVOKE ALL ON FUNCTION public.mem_data_fingerprint(), public.mem_activation_problems() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mem_data_fingerprint(), public.mem_activation_problems() TO service_role;

CREATE OR REPLACE FUNCTION public.mem_record_reconciliation(p_project TEXT, p_report_hash TEXT) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE probs TEXT; ts timestamptz := now();
BEGIN
  IF coalesce(p_project, '') = '' OR coalesce(p_report_hash, '') = '' THEN RAISE EXCEPTION 'project and report hash are required'; END IF;
  probs := public.mem_activation_problems();
  IF probs <> '' THEN RAISE EXCEPTION 'not recorded: %', probs; END IF;
  PERFORM set_config('membership.rec', '1', true);
  UPDATE public.membership_config SET fs_reconciled_at = ts, fs_project = p_project, fs_report_hash = p_report_hash, fs_data_fingerprint = public.mem_data_fingerprint() WHERE id = 1;
  RETURN ts;
END $$;
REVOKE ALL ON FUNCTION public.mem_record_reconciliation(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mem_record_reconciliation(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_membership_flip() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE probs TEXT;
BEGIN
  IF (NEW.fs_reconciled_at, NEW.fs_project, NEW.fs_report_hash, NEW.fs_data_fingerprint) IS DISTINCT FROM (OLD.fs_reconciled_at, OLD.fs_project, OLD.fs_report_hash, OLD.fs_data_fingerprint)
     AND coalesce(current_setting('membership.rec', true), '') <> '1' THEN RAISE EXCEPTION 'the reconciliation record is written only by mem_record_reconciliation'; END IF;
  IF NEW.enabled AND NOT coalesce(OLD.enabled, FALSE) THEN
    probs := public.mem_activation_problems();
    IF probs <> '' THEN RAISE EXCEPTION 'flip refused: %', probs; END IF;
    IF NEW.fs_reconciled_at IS NULL OR NEW.fs_project IS NULL OR NEW.fs_report_hash IS NULL THEN RAISE EXCEPTION 'flip refused: no verified Firestore reconciliation record'; END IF;
    IF NEW.fs_reconciled_at < now() - interval '60 minutes' THEN RAISE EXCEPTION 'flip refused: the reconciliation record is older than 60 minutes; run the preflight record again'; END IF;
    IF NEW.fs_data_fingerprint IS DISTINCT FROM public.mem_data_fingerprint() THEN RAISE EXCEPTION 'flip refused: Supabase data changed since the reconciliation record'; END IF;
    NEW.changed_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_membership_flip ON public.membership_config;
CREATE TRIGGER trg_guard_membership_flip BEFORE UPDATE ON public.membership_config FOR EACH ROW EXECUTE FUNCTION public.guard_membership_flip();
CREATE OR REPLACE FUNCTION public.mem_clear_reconciliation() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('membership.rec', '1', true);
  UPDATE public.membership_config SET fs_reconciled_at = NULL, fs_project = NULL, fs_report_hash = NULL, fs_data_fingerprint = NULL WHERE id = 1;
END $$;
REVOKE ALL ON FUNCTION public.mem_clear_reconciliation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mem_clear_reconciliation() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_membership_config_rows() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'membership_config row cannot be deleted'; END IF;
  IF NEW.enabled OR NEW.fs_reconciled_at IS NOT NULL OR NEW.fs_project IS NOT NULL OR NEW.fs_report_hash IS NOT NULL OR NEW.fs_data_fingerprint IS NOT NULL THEN RAISE EXCEPTION 'membership_config insert must start disabled and unrecorded'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_membership_config_rows ON public.membership_config;
CREATE TRIGGER trg_guard_membership_config_rows BEFORE INSERT OR DELETE ON public.membership_config FOR EACH ROW EXECUTE FUNCTION public.guard_membership_config_rows();
COMMIT;
