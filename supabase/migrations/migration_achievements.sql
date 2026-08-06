-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — user achievements (Step 7)
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent.
--
-- Mirror of the locally-unlocked achievements (useAchievementsStore). One row per
-- (user, achievement); the UNIQUE index makes the app's
-- `upsert(..., onConflict: "user_id,achievement_id", ignoreDuplicates: true)`
-- a safe "unlock once". RLS = own row, like every other per-user table.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_achievements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    unlocked_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_achievements_uidx
  ON public.user_achievements (user_id, achievement_id);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own achievements"
    ON public.user_achievements FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own achievements"
    ON public.user_achievements FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
