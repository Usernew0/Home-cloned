-- DRAFT, NOT EXECUTED. Needs membership_draft.sql first. Item sharing as live grants (no copies).
-- Ownership: an item belongs to the account whose personal_couple_id equals the item's couple_id (created_by is not reliable in this schema).
CREATE TABLE IF NOT EXISTS public.item_shares (
  id BIGSERIAL PRIMARY KEY,
  owner_account TEXT NOT NULL,
  grantee_account TEXT NOT NULL,
  pair_key TEXT NOT NULL,
  item_table TEXT NOT NULL CHECK (item_table IN ('milestones','date_plans','memories','letters','couple_questions','celebration_cards')),
  item_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_account, grantee_account, item_table, item_id),
  CHECK (owner_account <> grantee_account)
);
ALTER TABLE public.item_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_shares FROM PUBLIC, anon, authenticated;

-- immutable once created
CREATE OR REPLACE FUNCTION public.guard_item_shares() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'item_shares rows are immutable; delete and recreate'; END $$;
DROP TRIGGER IF EXISTS trg_item_shares_immutable ON public.item_shares;
CREATE TRIGGER trg_item_shares_immutable BEFORE UPDATE ON public.item_shares FOR EACH ROW EXECUTE FUNCTION public.guard_item_shares();

-- A grant is effective only while the exact pair is linked, both accounts currently sit in that joint space, and neither has an open membership op.
CREATE OR REPLACE FUNCTION public.share_effective(p_owner TEXT, p_grantee TEXT, p_pair TEXT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM couple_tenants t
      JOIN user_accounts o ON o.id = p_owner AND o.couple_id = t.couple_id
      JOIN user_accounts g ON g.id = p_grantee AND g.couple_id = t.couple_id
     WHERE t.pair_key = p_pair AND t.link_status = 'linked'
       AND p_pair = (SELECT string_agg(x, '|' ORDER BY x) FROM unnest(ARRAY[p_owner, p_grantee]) x)
       AND NOT EXISTS (SELECT 1 FROM membership_op_locks l WHERE l.account_id IN (p_owner, p_grantee)));
$$;

DROP FUNCTION IF EXISTS public.item_shared_with_me(TEXT, TEXT);
-- The row's own couple_id must equal the granting owner's immutable personal space: an id match alone is not enough (ids are client generated and a deleted item's id could be reused).
CREATE OR REPLACE FUNCTION public.item_shared_with_me(p_table TEXT, p_item TEXT, p_couple TEXT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM item_shares s JOIN user_accounts o ON o.id = s.owner_account
    WHERE s.item_table = p_table AND s.item_id = p_item AND s.grantee_account = public.requesting_account_id()
      AND o.personal_couple_id IS NOT NULL AND o.personal_couple_id = p_couple
      AND public.share_effective(s.owner_account, s.grantee_account, s.pair_key)) $$;

-- Owner's CURRENT effective grants only (current linked partner, no open op). Dormant grants of a former partner stay stored for a same-pair reunion but are not reported as shared.
CREATE OR REPLACE FUNCTION public.my_effective_shares(p_owner TEXT) RETURNS TABLE(item_table TEXT, item_id TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.item_table, s.item_id FROM item_shares s
   WHERE s.owner_account = p_owner AND public.share_effective(s.owner_account, s.grantee_account, s.pair_key) $$;
REVOKE ALL ON FUNCTION public.my_effective_shares(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_effective_shares(TEXT) TO service_role;

-- A deleted item must not leave a grant behind (a reused id would otherwise inherit it).
CREATE OR REPLACE FUNCTION public.drop_item_shares() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN DELETE FROM item_shares WHERE item_table = TG_TABLE_NAME AND item_id = OLD.id::text; RETURN OLD; END $$;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['milestones','date_plans','memories','letters','couple_questions','celebration_cards'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS drop_item_shares_trg ON public.%I', t);
    EXECUTE format('CREATE TRIGGER drop_item_shares_trg AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.drop_item_shares()', t);
  END LOOP;
END $$;


-- create: owner comes from the server session, the item must sit in the owner's personal space, grantee must be the CURRENT linked partner
CREATE OR REPLACE FUNCTION public.share_create(p_owner TEXT, p_table TEXT, p_item TEXT) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o user_accounts%ROWTYPE; t couple_tenants%ROWTYPE; grantee TEXT; n INT; sid BIGINT;
BEGIN
  SELECT * INTO o FROM user_accounts WHERE id = p_owner; IF NOT FOUND OR o.personal_couple_id IS NULL THEN RAISE EXCEPTION 'unknown owner'; END IF;
  SELECT * INTO t FROM couple_tenants WHERE couple_id = o.couple_id AND pair_key IS NOT NULL AND link_status = 'linked';
  IF NOT FOUND THEN RAISE EXCEPTION 'owner is not linked'; END IF;
  IF EXISTS (SELECT 1 FROM membership_op_locks WHERE account_id = ANY(string_to_array(t.pair_key,'|'))) THEN RAISE EXCEPTION 'membership change in progress'; END IF;
  grantee := (SELECT x FROM unnest(string_to_array(t.pair_key,'|')) x WHERE x <> p_owner);
  IF grantee IS NULL OR NOT EXISTS (SELECT 1 FROM user_accounts WHERE id = grantee AND couple_id = t.couple_id) THEN RAISE EXCEPTION 'partner not in the joint space'; END IF;
  IF p_table NOT IN ('milestones','date_plans','memories','letters','couple_questions','celebration_cards') THEN RAISE EXCEPTION 'bad table'; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE id::text = $1 AND couple_id = $2', p_table) INTO n USING p_item, o.personal_couple_id;
  IF n <> 1 THEN RAISE EXCEPTION 'item is not in the owner personal space'; END IF;
  INSERT INTO item_shares(owner_account, grantee_account, pair_key, item_table, item_id) VALUES (p_owner, grantee, t.pair_key, p_table, p_item)
    ON CONFLICT (owner_account, grantee_account, item_table, item_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM item_shares WHERE owner_account = p_owner AND grantee_account = grantee AND item_table = p_table AND item_id = p_item; END IF;
  RETURN sid;
END $$;

-- owner explicitly stops sharing (permanent, unlike unlink which only makes grants dormant)
CREATE OR REPLACE FUNCTION public.share_remove(p_owner TEXT, p_table TEXT, p_item TEXT) RETURNS INT
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH d AS (DELETE FROM item_shares WHERE owner_account = p_owner AND item_table = p_table AND item_id = p_item RETURNING 1) SELECT count(*)::int FROM d $$;

-- ids of items shared with an account that are effective right now (server proxy uses this; owner space is derived, not supplied)
CREATE OR REPLACE FUNCTION public.shared_item_ids(p_account TEXT, p_table TEXT) RETURNS TABLE(item_id TEXT, owner_account TEXT, owner_space TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.item_id, s.owner_account, o.personal_couple_id FROM item_shares s JOIN user_accounts o ON o.id = s.owner_account
   WHERE s.grantee_account = p_account AND s.item_table = p_table AND public.share_effective(s.owner_account, s.grantee_account, s.pair_key) $$;

-- RLS on the six shareable tables plus activity_logs (not shareable). This is an ASSERTED rewrite, not a blind drop: only policies from the known allowlist
-- (names found in the repo's base/hardened schemas plus this migration's own) are dropped. Any other policy on these tables aborts the whole migration
-- with its name, so the user's real inventory (inventory_readonly.sql, section policies) must be reviewed first. Run inside one transaction.
-- After: browsers can only SELECT (own personal space, items shared with me, legacy joint read-only; activity_logs: own personal + legacy joint only).
-- All writes go through the server (service_role) into the writer's personal space.
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

REVOKE ALL ON FUNCTION public.shared_item_ids(TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_item_ids(TEXT,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.share_effective(TEXT,TEXT,TEXT), public.item_shared_with_me(TEXT,TEXT,TEXT), public.share_create(TEXT,TEXT,TEXT), public.share_remove(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.item_shared_with_me(TEXT,TEXT,TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.share_effective(TEXT,TEXT,TEXT), public.share_create(TEXT,TEXT,TEXT), public.share_remove(TEXT,TEXT,TEXT) TO service_role;

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
