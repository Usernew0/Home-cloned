-- ====================================================================
-- REVIEW-ONLY. Do not run blindly. Nothing in the app runs this file.
-- Run it in the Supabase SQL editor on a staging copy or after a backup,
-- AFTER the new server code (with /api/proxy and /api/auth/*) is deployed.
-- It changes access rules only. It does not modify or delete any row.
-- ====================================================================

-- 0. Columns the server expects (additive, safe to re-run).
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS two_factor_created_at TIMESTAMPTZ;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS admin_accounts JSONB;

-- 1. Helper functions (same as supabase_schema.sql).
CREATE OR REPLACE FUNCTION public.requesting_couple_id()
RETURNS text LANGUAGE sql STABLE
AS $$ SELECT COALESCE(auth.jwt()->'app_metadata'->>'couple_id', ''); $$;

CREATE OR REPLACE FUNCTION public.requesting_app_role()
RETURNS text LANGUAGE sql STABLE
AS $$ SELECT COALESCE(auth.jwt()->'app_metadata'->>'role', ''); $$;

-- 2. user_accounts: a signed-in partner could previously UPDATE their own row directly
--    (PostgREST + their session) and set role = 'admin', and login derives the role from this column.
--    Reads stay couple-scoped; writes become admin / service role only.
--    Own-profile edits go through /api/proxy (whitelisted columns) and /api/auth/change-password.
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant user accounts access" ON public.user_accounts;
DROP POLICY IF EXISTS "user_accounts read own couple" ON public.user_accounts;
DROP POLICY IF EXISTS "user_accounts admin write" ON public.user_accounts;
CREATE POLICY "user_accounts read own couple" ON public.user_accounts FOR SELECT
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));
CREATE POLICY "user_accounts admin write" ON public.user_accounts FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND public.requesting_app_role() = 'admin'))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND public.requesting_app_role() = 'admin'));

-- Hide secrets from browsers even for rows they may read. The server (service role) still reads them.
-- Requires the client to read user_accounts through /api/proxy (already done in this patch).
-- (A column REVOKE does nothing while a table-level SELECT grant exists, so revoke the table grant and
-- re-grant every column except the secrets.)
REVOKE SELECT ON public.user_accounts FROM anon, authenticated;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_accounts'
    AND column_name NOT IN ('password', 'two_factor_secret', 'two_factor_backup_codes');
  EXECUTE format('GRANT SELECT (%s) ON public.user_accounts TO authenticated', cols);
END $$;

-- 3. profiles: was readable and writable by every authenticated user.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated profiles access" ON public.profiles;
DROP POLICY IF EXISTS "profiles read" ON public.profiles;
DROP POLICY IF EXISTS "profiles admin write" ON public.profiles;
CREATE POLICY "profiles read" ON public.profiles FOR SELECT USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
CREATE POLICY "profiles admin write" ON public.profiles FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND public.requesting_app_role() = 'admin'))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND public.requesting_app_role() = 'admin'));

-- 4. Storage: "Authenticated Media Insert/Delete" had no authentication check, so anyone with the anon key
--    could upload to or delete from the media-uploads bucket.
DROP POLICY IF EXISTS "Authenticated Media Insert" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Media Delete" ON storage.objects;
CREATE POLICY "Authenticated Media Insert" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'media-uploads' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Media Delete" ON storage.objects FOR DELETE
USING (bucket_id = 'media-uploads' AND auth.role() = 'authenticated' AND owner = auth.uid());

-- 5. Read-only diagnostics INSTEAD of the original blanket backfill.
--    supabase_schema.sql assigns every row with a NULL couple_id to 'couple_default'. With more than one
--    couple that silently merges orphan rows into the default couple. Count them first and decide per table.
SELECT 'milestones' AS t, count(*) FROM public.milestones WHERE couple_id IS NULL OR couple_id = ''
UNION ALL SELECT 'date_plans', count(*) FROM public.date_plans WHERE couple_id IS NULL OR couple_id = ''
UNION ALL SELECT 'memories', count(*) FROM public.memories WHERE couple_id IS NULL OR couple_id = ''
UNION ALL SELECT 'letters', count(*) FROM public.letters WHERE couple_id IS NULL OR couple_id = ''
UNION ALL SELECT 'couple_questions', count(*) FROM public.couple_questions WHERE couple_id IS NULL OR couple_id = ''
UNION ALL SELECT 'activity_logs', count(*) FROM public.activity_logs WHERE couple_id IS NULL OR couple_id = ''
UNION ALL SELECT 'celebration_cards', count(*) FROM public.celebration_cards WHERE couple_id IS NULL OR couple_id = ''
UNION ALL SELECT 'user_accounts', count(*) FROM public.user_accounts WHERE couple_id IS NULL OR couple_id = '';

-- 6. Telegram dedupe table used by /api/telegram/send (the code tolerates it missing; this makes dedupe work).
CREATE TABLE IF NOT EXISTS public.telegram_sent (key TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE public.telegram_sent ENABLE ROW LEVEL SECURITY; -- no policies: service role only
