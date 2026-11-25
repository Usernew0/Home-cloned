-- 01_prep.sql  ADDITIVE ONLY. Safe while OLD clients still run: nothing here changes what an old client can read or write. DRAFT, NOT EXECUTED.
-- pid_nonce: the strict identity needs it on every account. Added nullable, filled for existing rows, then defaulted for new rows (old client inserts keep working).
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS pid_nonce TEXT;
UPDATE public.user_accounts SET pid_nonce = replace(gen_random_uuid()::text, '-', '') WHERE pid_nonce IS NULL;
ALTER TABLE public.user_accounts ALTER COLUMN pid_nonce SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS personal_couple_id TEXT;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS membership_epoch BIGINT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_personal_couple_uq ON public.user_accounts(personal_couple_id) WHERE personal_couple_id IS NOT NULL;
ALTER TABLE public.couple_tenants ADD COLUMN IF NOT EXISTS pair_key TEXT;
ALTER TABLE public.couple_tenants ADD COLUMN IF NOT EXISTS link_status TEXT NOT NULL DEFAULT 'linked';
CREATE UNIQUE INDEX IF NOT EXISTS couple_tenants_pair_key_uq ON public.couple_tenants(pair_key) WHERE pair_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.membership_ops (
  tx_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('link','unlink')),
  account_ids TEXT[] NOT NULL,
  from_spaces JSONB NOT NULL,
  to_spaces JSONB NOT NULL,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT,
  pair_key TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT 'reserved' CHECK (step IN ('reserved','fs_frozen','aborting','db_committed','fs_active','done','aborted')),
  fence BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.membership_op_locks (
  account_id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL REFERENCES public.membership_ops(tx_id)
);
ALTER TABLE public.membership_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_op_locks ENABLE ROW LEVEL SECURITY;   -- no policies: service_role / definer functions only
REVOKE ALL ON public.membership_ops, public.membership_op_locks FROM PUBLIC, anon, authenticated;

-- personal id: first set is validated, then immutable; epoch only goes up; couple_id changes only through mem_commit
CREATE OR REPLACE FUNCTION public.guard_membership_columns() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.personal_couple_id IS NOT NULL AND NEW.personal_couple_id IS DISTINCT FROM OLD.personal_couple_id THEN
    RAISE EXCEPTION 'personal_couple_id is immutable';
  END IF;
  IF OLD.personal_couple_id IS NULL AND NEW.personal_couple_id IS NOT NULL THEN
    -- first set: must be a space nobody else uses and that is not a joint space (an existing solo tenant record is fine)
    IF NEW.personal_couple_id = '' OR NEW.personal_couple_id = 'couple_default' THEN RAISE EXCEPTION 'invalid personal space id'; END IF;
    IF EXISTS (SELECT 1 FROM user_accounts u WHERE u.id <> OLD.id AND (u.couple_id = NEW.personal_couple_id OR u.personal_couple_id = NEW.personal_couple_id)) THEN
      RAISE EXCEPTION 'that space belongs to another account'; END IF;
    IF EXISTS (SELECT 1 FROM couple_tenants t WHERE t.couple_id = NEW.personal_couple_id
               AND (t.pair_key IS NOT NULL OR coalesce(t.partner2, '') <> '')) THEN
      RAISE EXCEPTION 'that space is a joint space'; END IF;
  END IF;
  IF OLD.pid_nonce IS NOT NULL AND OLD.pid_nonce <> '' AND NEW.pid_nonce IS DISTINCT FROM OLD.pid_nonce THEN RAISE EXCEPTION 'pid_nonce is immutable once set'; END IF;
  IF NEW.membership_epoch < OLD.membership_epoch THEN RAISE EXCEPTION 'membership_epoch only increases'; END IF;
  IF NEW.couple_id IS DISTINCT FROM OLD.couple_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM membership_ops o
       WHERE o.tx_id = current_setting('app.membership_tx', true)
         AND o.step = 'db_committed' AND OLD.id = ANY(o.account_ids)
         AND o.to_spaces ->> OLD.id = NEW.couple_id AND o.from_spaces ->> OLD.id = OLD.couple_id)
    THEN RAISE EXCEPTION 'couple_id may only change through the membership functions'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.mem_reserve(p_tx TEXT, p_kind TEXT, p_a TEXT, p_b TEXT, p_couple TEXT, p_name TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ids TEXT[]; froms JSONB := '{}'::jsonb; tos JSONB := '{}'::jsonb; t couple_tenants%ROWTYPE; pk TEXT; r RECORD; joint TEXT; nm TEXT; o membership_ops%ROWTYPE;
BEGIN
  IF p_tx IS NULL OR length(p_tx) NOT BETWEEN 8 AND 80 THEN RAISE EXCEPTION 'bad tx id'; END IF;
  IF p_kind = 'link' THEN
    IF p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN RAISE EXCEPTION 'link needs two distinct accounts'; END IF;
    ids := ARRAY(SELECT x FROM unnest(ARRAY[p_a, p_b]) x ORDER BY x);
    pk := ids[1] || '|' || ids[2];
  ELSIF p_kind = 'unlink' THEN
    SELECT * INTO t FROM couple_tenants WHERE couple_id = p_couple AND pair_key IS NOT NULL AND link_status = 'linked';
    IF NOT FOUND THEN RAISE EXCEPTION 'no linked joint space with that id'; END IF;
    pk := t.pair_key; ids := string_to_array(pk, '|');
  ELSE RAISE EXCEPTION 'bad kind'; END IF;
  FOR r IN SELECT id, couple_id, personal_couple_id FROM user_accounts WHERE id = ANY(ids) ORDER BY id FOR UPDATE LOOP
    IF r.personal_couple_id IS NULL THEN RAISE EXCEPTION 'account % has no personal space id', r.id; END IF;
    froms := froms || jsonb_build_object(r.id, r.couple_id);
    IF p_kind = 'unlink' THEN
      IF r.couple_id <> t.couple_id THEN RAISE EXCEPTION 'account % is not in that joint space', r.id; END IF;
      tos := tos || jsonb_build_object(r.id, r.personal_couple_id);
    ELSE
      IF r.couple_id <> r.personal_couple_id THEN RAISE EXCEPTION 'account % is not on its personal space', r.id; END IF;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(froms)) <> 2 THEN RAISE EXCEPTION 'unknown account'; END IF;
  IF p_kind = 'link' THEN
    SELECT * INTO t FROM couple_tenants WHERE pair_key = pk;
    IF FOUND THEN
      IF t.link_status <> 'unlinked' THEN RAISE EXCEPTION 'pair already linked'; END IF;
      joint := t.couple_id; nm := t.couple_name;
    ELSE
      joint := 'joint_' || substr(md5(pk), 1, 20);
      nm := left(coalesce(nullif(btrim(p_name), ''), 'Our Home'), 80);
    END IF;
    IF EXISTS (SELECT 1 FROM user_accounts WHERE personal_couple_id = joint) THEN RAISE EXCEPTION 'target is a personal space'; END IF;
    FOREACH pk IN ARRAY ids LOOP tos := tos || jsonb_build_object(pk, joint); END LOOP;
    pk := ids[1] || '|' || ids[2];
  ELSE joint := t.couple_id; nm := t.couple_name; END IF;
  INSERT INTO membership_ops(tx_id, kind, account_ids, from_spaces, to_spaces, tenant_id, tenant_name, pair_key)
  VALUES (p_tx, p_kind, ids, froms, tos, joint, nm, pk) RETURNING * INTO o;
  FOR r IN SELECT unnest(ids) AS id LOOP INSERT INTO membership_op_locks(account_id, tx_id) VALUES (r.id, p_tx); END LOOP;
  RETURN to_jsonb(o);
END $$;

CREATE OR REPLACE FUNCTION public.mem_get_op(p_tx TEXT) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT to_jsonb(o) || jsonb_build_object('pids', (SELECT jsonb_object_agg(u.id, 'u:' || u.id || '.' || u.pid_nonce) FROM user_accounts u WHERE u.id = ANY(o.account_ids)))
  FROM membership_ops o WHERE tx_id = p_tx $$;

-- the ONLY step mover besides mem_commit. Strict machine with from-state and fence compare-and-set.
CREATE OR REPLACE FUNCTION public.mem_advance(p_tx TEXT, p_fence BIGINT, p_from TEXT, p_to TEXT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE nf BIGINT;
BEGIN
  IF NOT ((p_from, p_to) IN (('reserved','fs_frozen'),('reserved','aborting'),('fs_frozen','aborting'),('aborting','aborted'),('db_committed','fs_active'),('fs_active','done'))) THEN
    RAISE EXCEPTION 'illegal step change % -> %', p_from, p_to;
  END IF;
  UPDATE membership_ops SET step = p_to, fence = fence + 1, updated_at = now()
   WHERE tx_id = p_tx AND fence = p_fence AND step = p_from RETURNING fence INTO nf;
  IF nf IS NULL THEN RAISE EXCEPTION 'stale fence or step'; END IF;
  IF p_to IN ('done','aborted') THEN DELETE FROM membership_op_locks WHERE tx_id = p_tx; END IF;
  RETURN nf;
END $$;

-- commit: single transaction, derives everything from the stored op, CAS on each account's current space
CREATE OR REPLACE FUNCTION public.mem_commit(p_tx TEXT, p_fence BIGINT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o membership_ops%ROWTYPE; k TEXT; v TEXT; nf BIGINT; n INT;
BEGIN
  SELECT * INTO o FROM membership_ops WHERE tx_id = p_tx FOR UPDATE;
  IF NOT FOUND OR o.step <> 'fs_frozen' OR o.fence <> p_fence THEN RAISE EXCEPTION 'op not fs_frozen at this fence'; END IF;
  UPDATE membership_ops SET step = 'db_committed', fence = fence + 1, updated_at = now() WHERE tx_id = p_tx RETURNING fence INTO nf;
  PERFORM set_config('app.membership_tx', p_tx, true);
  FOR k, v IN SELECT * FROM jsonb_each_text(o.to_spaces) LOOP
    UPDATE user_accounts SET couple_id = v, membership_epoch = membership_epoch + 1, updated_at = now()
     WHERE id = k AND couple_id = o.from_spaces ->> k;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'account % moved since reserve', k; END IF;
  END LOOP;
  IF o.kind = 'link' THEN
    INSERT INTO couple_tenants(couple_id, couple_name, partner1, partner2, pair_key, link_status)
    VALUES (o.tenant_id, o.tenant_name, o.account_ids[1], o.account_ids[2], o.pair_key, 'linked')
    ON CONFLICT (couple_id) DO UPDATE SET link_status = 'linked' WHERE couple_tenants.pair_key = o.pair_key;
  ELSE
    UPDATE couple_tenants SET link_status = 'unlinked' WHERE couple_id = o.tenant_id AND pair_key = o.pair_key;
  END IF;
  PERFORM set_config('app.membership_tx', '', true);
  RETURN nf;
END $$;

-- NOTE: the legacy requesting_couple_id() that the existing policies call is NOT replaced here. The strict version is requesting_couple_id_v2(); only activation points policies at it.
-- Strict pid parse: 'u:<id>.<32hex nonce>' must match user_accounts.pid_nonce. Only 'adm:' and 'leg:' pids use their claim (existing admin/legacy authority).
-- Anything else, including a missing pid, gets no space.
CREATE OR REPLACE FUNCTION public.requesting_account_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id FROM user_accounts u
   WHERE coalesce(auth.jwt()->'app_metadata'->>'pid','') = 'u:' || u.id || '.' || u.pid_nonce $$;

CREATE OR REPLACE FUNCTION public.requesting_couple_id_v2() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN coalesce(auth.jwt()->'app_metadata'->>'pid','') LIKE 'u:%' THEN
      coalesce((SELECT u.couple_id FROM user_accounts u WHERE u.id = public.requesting_account_id()
                   AND NOT EXISTS (SELECT 1 FROM membership_op_locks l WHERE l.account_id = u.id)), '')
    WHEN coalesce(auth.jwt()->'app_metadata'->>'pid','') ~ '^(adm|leg):' THEN coalesce(auth.jwt()->'app_metadata'->>'couple_id', '')
    ELSE ''
  END $$;

-- the account's own personal space (owner private read), none while an op is open
CREATE OR REPLACE FUNCTION public.requesting_personal_couple_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT u.personal_couple_id FROM user_accounts u WHERE u.id = public.requesting_account_id()
                      AND NOT EXISTS (SELECT 1 FROM membership_op_locks l WHERE l.account_id = u.id)), '') $$;

REVOKE ALL ON FUNCTION public.requesting_account_id(), public.requesting_personal_couple_id(), public.requesting_couple_id_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requesting_account_id(), public.requesting_personal_couple_id(), public.requesting_couple_id_v2() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mem_reserve(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT), public.mem_get_op(TEXT), public.mem_advance(TEXT,BIGINT,TEXT,TEXT), public.mem_commit(TEXT,BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mem_reserve(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT), public.mem_get_op(TEXT), public.mem_advance(TEXT,BIGINT,TEXT,TEXT), public.mem_commit(TEXT,BIGINT) TO service_role;

-- Explicit cutover switch read by the server. Created DISABLED. The user flips it (a separate statement) only after the checks pass.
CREATE TABLE IF NOT EXISTS public.membership_config (id INT PRIMARY KEY CHECK (id = 1), enabled BOOLEAN NOT NULL DEFAULT FALSE, changed_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.membership_config ADD COLUMN IF NOT EXISTS fs_reconciled_at TIMESTAMPTZ;
ALTER TABLE public.membership_config ADD COLUMN IF NOT EXISTS fs_project TEXT;
ALTER TABLE public.membership_config ADD COLUMN IF NOT EXISTS fs_report_hash TEXT;
ALTER TABLE public.membership_config ADD COLUMN IF NOT EXISTS fs_data_fingerprint TEXT;
INSERT INTO public.membership_config(id, enabled) VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.membership_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_config FROM PUBLIC, anon, authenticated;
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
REVOKE ALL ON FUNCTION public.shared_item_ids(TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_item_ids(TEXT,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.share_effective(TEXT,TEXT,TEXT), public.item_shared_with_me(TEXT,TEXT,TEXT), public.share_create(TEXT,TEXT,TEXT), public.share_remove(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.item_shared_with_me(TEXT,TEXT,TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.share_effective(TEXT,TEXT,TEXT), public.share_create(TEXT,TEXT,TEXT), public.share_remove(TEXT,TEXT,TEXT) TO service_role;
-- case-insensitive username uniqueness (aborts with a message if case-duplicates exist; no automatic merge)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM user_accounts WHERE username IS NOT NULL GROUP BY lower(username) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'case-insensitive duplicate usernames exist: resolve them manually before this index (no automatic merge)';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_username_lower_key ON public.user_accounts (lower(username));
