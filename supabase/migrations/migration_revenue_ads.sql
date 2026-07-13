-- migration_revenue_ads.sql

CREATE TABLE IF NOT EXISTS public.ad_engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    vendor_name TEXT NOT NULL,
    watch_time INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    engagement_level TEXT CHECK (engagement_level IN ('Green', 'Yellow', 'Orange', 'Red')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.ad_engagements ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own engagements
CREATE POLICY "Users can insert their own ad engagements"
ON public.ad_engagements
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to read their own engagements
CREATE POLICY "Users can view their own ad engagements"
ON public.ad_engagements
FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to update their own engagements (e.g. accumulating watch time)
CREATE POLICY "Users can update their own ad engagements"
ON public.ad_engagements
FOR UPDATE
USING (auth.uid() = user_id);
