-- DRAFT v2, NOT EXECUTED, FOR REVIEW. Additive. Assumes user_accounts(id TEXT PK, couple_id TEXT), couple_tenants(couple_id TEXT PK, couple_name, partner1, partner2).
-- Callers pass ONLY account ids (link) or a couple id (unlink). Spaces, tenant rows and targets are derived here, never supplied.

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
DROP TRIGGER IF EXISTS trg_guard_membership ON public.user_accounts;
CREATE TRIGGER trg_guard_membership BEFORE UPDATE ON public.user_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_membership_columns();

-- New accounts always start on their OWN solo space. The id is generated here (stable, unique, never supplied by the caller) and a solo tenant row is created with it.
-- A caller-supplied couple_id or personal_couple_id on INSERT is ignored: joining a partner happens only through the validated link operation, never by creating an account inside someone's joint space.
CREATE OR REPLACE FUNCTION public.init_personal_space() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pid TEXT := 'couple_' || regexp_replace(NEW.id, '^user_', '');
BEGIN
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

-- a retained joint space is never deleted
CREATE OR REPLACE FUNCTION public.guard_tenant_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN IF OLD.pair_key IS NOT NULL THEN RAISE EXCEPTION 'joint spaces are retained, not deleted'; END IF; RETURN OLD; END $$;
DROP TRIGGER IF EXISTS trg_guard_tenant_delete ON public.couple_tenants;
CREATE TRIGGER trg_guard_tenant_delete BEFORE DELETE ON public.couple_tenants FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_delete();

-- reserve: link takes two account ids; unlink takes a couple id. Everything else is derived.
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
INSERT INTO public.membership_config(id, enabled) VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.membership_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_config FROM PUBLIC, anon, authenticated;
-- cutover (run separately, after verification):   UPDATE public.membership_config SET enabled = TRUE, changed_at = now() WHERE id = 1;

-- Case-insensitive username uniqueness, enforced by the database (the existing user_accounts_username_key is case-sensitive, so 'Ali' and 'ali' can coexist
-- and a concurrent admin create could slip past an application check). SAFE ASSERTION FIRST: this never merges or renames anything; if case-duplicates already exist it stops.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM user_accounts WHERE username IS NOT NULL GROUP BY lower(username) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'case-insensitive duplicate usernames exist: resolve them manually before this index (no automatic merge)';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_username_lower_key ON public.user_accounts (lower(username));
