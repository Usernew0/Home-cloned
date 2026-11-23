-- ====================================================================
-- OUR HOME - SUPABASE HYBRID BACKEND DATABASE SCHEMA & RLS POLICIES
-- Strategy A: Functional Data Partitioning (Firebase + Supabase)
--
-- Features:
-- - `profiles` table for user profiles and partner relationships
-- - `memories` & `date_plans` with explicit foreign keys to `profiles`
-- - Media storage bucket configuration (`media-uploads`)
-- - Row Level Security (RLS) policies tailored for couple access
-- ====================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Media Storage Bucket & Storage RLS Policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-uploads', 'media-uploads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Media Select" ON storage.objects;
CREATE POLICY "Public Media Select" ON storage.objects
FOR SELECT USING (bucket_id = 'media-uploads');

DROP POLICY IF EXISTS "Authenticated Media Insert" ON storage.objects;
CREATE POLICY "Authenticated Media Insert" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'media-uploads');

DROP POLICY IF EXISTS "Authenticated Media Delete" ON storage.objects;
CREATE POLICY "Authenticated Media Delete" ON storage.objects
FOR DELETE USING (bucket_id = 'media-uploads');


-- 2. User Accounts & Profiles Tables (`user_accounts` & `profiles`)
CREATE TABLE IF NOT EXISTS public.user_accounts (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'user',
  visible_tabs JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User accounts access policy" ON public.user_accounts;
DROP POLICY IF EXISTS "Authenticated user accounts access" ON public.user_accounts;
CREATE POLICY "Authenticated user accounts access" ON public.user_accounts
FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,                       -- e.g. "ebrahim", "mariem" or Supabase Auth UUID
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  partner_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles access policy" ON public.profiles;
CREATE POLICY "Profiles access policy" ON public.profiles
FOR ALL USING (true) WITH CHECK (true);


-- 3. Shared Memories Vault (`memories`)
CREATE TABLE IF NOT EXISTS public.memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'image',       -- 'image' | 'video' | 'audio'
  url TEXT NOT NULL,                        -- Storage path or public URL
  description TEXT,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Memories access policy" ON public.memories;
CREATE POLICY "Memories access policy" ON public.memories
FOR ALL USING (true) WITH CHECK (true);


-- 4. Date Planner (`date_plans`)
CREATE TABLE IF NOT EXISTS public.date_plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  occasion TEXT,
  theme TEXT,
  date_time TEXT NOT NULL,
  location TEXT,
  description TEXT,
  checklist JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  status TEXT DEFAULT 'planned',            -- 'planned' | 'completed' | 'cancelled'
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.date_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Date plans access policy" ON public.date_plans;
CREATE POLICY "Date plans access policy" ON public.date_plans
FOR ALL USING (true) WITH CHECK (true);


-- 5. Relationship Milestones & Timeline (`milestones`)
CREATE TABLE IF NOT EXISTS public.milestones (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  sweet_message TEXT,
  photos JSONB DEFAULT '[]'::jsonb,         -- Array of Supabase Storage URLs
  video_url TEXT,
  love_notes JSONB DEFAULT '[]'::jsonb,
  theme_color TEXT,
  password TEXT,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Milestones access policy" ON public.milestones;
CREATE POLICY "Milestones access policy" ON public.milestones
FOR ALL USING (true) WITH CHECK (true);


-- 6. Love Letters (`letters`)
CREATE TABLE IF NOT EXISTS public.letters (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  template TEXT DEFAULT 'classic',
  is_opened BOOLEAN DEFAULT FALSE,
  date TEXT NOT NULL,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Letters access policy" ON public.letters;
CREATE POLICY "Letters access policy" ON public.letters
FOR ALL USING (true) WITH CHECK (true);


-- 7. Couple Q&A / Questions (`couple_questions`)
CREATE TABLE IF NOT EXISTS public.couple_questions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  answers JSONB DEFAULT '[]'::jsonb
);

ALTER TABLE public.couple_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Couple questions access policy" ON public.couple_questions;
CREATE POLICY "Couple questions access policy" ON public.couple_questions
FOR ALL USING (true) WITH CHECK (true);


-- 8. Admin Settings (`admin_settings`)
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id TEXT PRIMARY KEY,
  password TEXT,
  username TEXT,
  visible_tabs JSONB,
  favicon TEXT,
  auto_logout_minutes INT DEFAULT 15,
  auto_logout_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin settings access policy" ON public.admin_settings;
DROP POLICY IF EXISTS "Authenticated admin settings access" ON public.admin_settings;
CREATE POLICY "Authenticated admin settings access" ON public.admin_settings
FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');


-- 9. Activity Logs (`activity_logs`)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity logs access policy" ON public.activity_logs;
CREATE POLICY "Activity logs access policy" ON public.activity_logs
FOR ALL USING (true) WITH CHECK (true);


-- 10. Multi-Tenant Couple Tenants Table (`couple_tenants`)
CREATE TABLE IF NOT EXISTS public.couple_tenants (
  couple_id TEXT PRIMARY KEY,
  couple_name TEXT NOT NULL,
  partner1 TEXT NOT NULL,
  partner2 TEXT NOT NULL,
  plan TEXT DEFAULT 'free',                  -- 'free' | 'pro'
  stripe_subscription_id TEXT,
  subscription_end_date TIMESTAMPTZ,
  sms_enabled BOOLEAN DEFAULT FALSE,
  phone_number1 TEXT,
  phone_number2 TEXT,
  sms_daily_time TEXT DEFAULT '20:00',
  sms_anniversaries BOOLEAN DEFAULT TRUE,
  push_notifications_enabled BOOLEAN DEFAULT TRUE,
  animation_song_title TEXT DEFAULT '',
  animation_song_link TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.couple_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Couple tenants access policy" ON public.couple_tenants;
CREATE POLICY "Couple tenants access policy" ON public.couple_tenants FOR ALL USING (true) WITH CHECK (true);

-- 11. Celebration Cards Table (`celebration_cards` for Choose Card feature)
CREATE TABLE IF NOT EXISTS public.celebration_cards (
  id TEXT PRIMARY KEY,
  couple_id TEXT DEFAULT 'couple_default',
  user_id TEXT,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'birthday',     -- 'birthday' | 'engagement' | 'fireworks' | 'anniversary' | 'custom'
  title TEXT NOT NULL,
  partner_name TEXT,
  target_date TEXT NOT NULL,                -- 'YYYY-MM-DD'
  original_date TEXT,
  age INT,
  photos JSONB DEFAULT '[]'::jsonb,         -- Array of CelebrationCardPhoto { id, src, caption, sourceItemTitle }
  letter TEXT,
  password TEXT,
  music_url TEXT,
  theme_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.celebration_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Celebration cards access policy" ON public.celebration_cards;
CREATE POLICY "Celebration cards access policy" ON public.celebration_cards FOR ALL USING (true) WITH CHECK (true);

-- 12. Telegram bot linking (chat ID saved automatically by /id and /confirm)
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS telegram_username TEXT;

CREATE INDEX IF NOT EXISTS idx_user_accounts_telegram_chat_id
  ON public.user_accounts (telegram_chat_id);

-- ADD COUPLE_ID ISOLATION COLUMNS TO ALL TABLES
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';
ALTER TABLE public.date_plans ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';
ALTER TABLE public.letters ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';
ALTER TABLE public.couple_questions ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';
ALTER TABLE public.celebration_cards ADD COLUMN IF NOT EXISTS couple_id TEXT DEFAULT 'couple_default';

-- RLS TENANT ISOLATION POLICIES (Row Level Security filtering by couple_id)
DROP POLICY IF EXISTS "Milestones couple isolation" ON public.milestones;
CREATE POLICY "Milestones couple isolation" ON public.milestones FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Memories couple isolation" ON public.memories;
CREATE POLICY "Memories couple isolation" ON public.memories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Date plans couple isolation" ON public.date_plans;
CREATE POLICY "Date plans couple isolation" ON public.date_plans FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Celebration cards couple isolation" ON public.celebration_cards;
CREATE POLICY "Celebration cards couple isolation" ON public.celebration_cards FOR ALL USING (true) WITH CHECK (true);

-- Backfill existing records created before couple_id was added
UPDATE public.milestones SET couple_id = 'couple_default' WHERE couple_id IS NULL OR couple_id = '';
UPDATE public.date_plans SET couple_id = 'couple_default' WHERE couple_id IS NULL OR couple_id = '';
UPDATE public.memories SET couple_id = 'couple_default' WHERE couple_id IS NULL OR couple_id = '';
UPDATE public.letters SET couple_id = 'couple_default' WHERE couple_id IS NULL OR couple_id = '';
UPDATE public.couple_questions SET couple_id = 'couple_default' WHERE couple_id IS NULL OR couple_id = '';
UPDATE public.activity_logs SET couple_id = 'couple_default' WHERE couple_id IS NULL OR couple_id = '';
UPDATE public.celebration_cards SET couple_id = 'couple_default' WHERE couple_id IS NULL OR couple_id = '';

-- ====================================================================
-- ZERO-TRUST RLS POLICIES: AUTHENTICATED USERS + COUPLE CLAIM ISOLATION
-- ====================================================================
CREATE OR REPLACE FUNCTION public.requesting_couple_id()
RETURNS text LANGUAGE sql STABLE
AS $$ SELECT COALESCE(auth.jwt()->'app_metadata'->>'couple_id', ''); $$;

CREATE OR REPLACE FUNCTION public.requesting_app_role()
RETURNS text LANGUAGE sql STABLE
AS $$ SELECT COALESCE(auth.jwt()->'app_metadata'->>'role', ''); $$;

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User accounts access policy" ON public.user_accounts;
DROP POLICY IF EXISTS "Authenticated user accounts access" ON public.user_accounts;
CREATE POLICY "Tenant user accounts access" ON public.user_accounts FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin settings access policy" ON public.admin_settings;
DROP POLICY IF EXISTS "Authenticated admin settings access" ON public.admin_settings;
CREATE POLICY "Admin-only settings access" ON public.admin_settings FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND public.requesting_app_role() = 'admin'))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND public.requesting_app_role() = 'admin'));

ALTER TABLE public.couple_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Couple tenants access policy" ON public.couple_tenants;
DROP POLICY IF EXISTS "Authenticated couple tenants access" ON public.couple_tenants;
CREATE POLICY "Tenant couple access" ON public.couple_tenants FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['milestones','date_plans','memories','letters','couple_questions','activity_logs','celebration_cards']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Milestones access policy" ON public.milestones;
DROP POLICY IF EXISTS "Milestones couple isolation" ON public.milestones;
DROP POLICY IF EXISTS "Authenticated milestones access" ON public.milestones;
DROP POLICY IF EXISTS "Date plans access policy" ON public.date_plans;
DROP POLICY IF EXISTS "Date plans couple isolation" ON public.date_plans;
DROP POLICY IF EXISTS "Authenticated date plans access" ON public.date_plans;
DROP POLICY IF EXISTS "Memories access policy" ON public.memories;
DROP POLICY IF EXISTS "Memories couple isolation" ON public.memories;
DROP POLICY IF EXISTS "Authenticated memories access" ON public.memories;
DROP POLICY IF EXISTS "Letters access policy" ON public.letters;
DROP POLICY IF EXISTS "Authenticated letters access" ON public.letters;
DROP POLICY IF EXISTS "Couple questions access policy" ON public.couple_questions;
DROP POLICY IF EXISTS "Authenticated couple questions access" ON public.couple_questions;
DROP POLICY IF EXISTS "Activity logs access policy" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated activity logs access" ON public.activity_logs;
DROP POLICY IF EXISTS "Celebration cards access policy" ON public.celebration_cards;
DROP POLICY IF EXISTS "Celebration cards couple isolation" ON public.celebration_cards;
DROP POLICY IF EXISTS "Authenticated celebration cards access" ON public.celebration_cards;

CREATE POLICY "Tenant milestones access" ON public.milestones FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

CREATE POLICY "Tenant date plans access" ON public.date_plans FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

CREATE POLICY "Tenant memories access" ON public.memories FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

CREATE POLICY "Tenant letters access" ON public.letters FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

CREATE POLICY "Tenant couple questions access" ON public.couple_questions FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

CREATE POLICY "Tenant activity logs access" ON public.activity_logs FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

CREATE POLICY "Tenant celebration cards access" ON public.celebration_cards FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles access policy" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated profiles access" ON public.profiles;
CREATE POLICY "Authenticated profiles access" ON public.profiles FOR ALL
USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Chat messages access policy" ON public.chat_messages;
CREATE POLICY "Tenant chat messages access" ON public.chat_messages FOR ALL
USING (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())))
WITH CHECK (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND (public.requesting_app_role() = 'admin' OR couple_id = public.requesting_couple_id())));

