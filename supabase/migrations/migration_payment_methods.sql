-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — saved payment methods (tokenized)
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent.
--
-- ⚠️ COMPLIANCE: this table has NO column for a raw card number, CVV or BVN — by
-- design. Those NEVER leave Paystack. We store only a Paystack `token`
-- (authorization_code for cards, or a direct-debit mandate reference) plus
-- display-safe metadata (brand, last4, expiry). If this table leaks, there is
-- nothing a scammer can charge. RLS = own row.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_methods (
    id          TEXT PRIMARY KEY,           -- app-generated (pm_…)
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,              -- card | google_pay | apple_pay | paypal | bank
    brand       TEXT,                       -- visa | mastercard | verve | paypal …
    last4       TEXT,                       -- display only
    exp_month   INT,
    exp_year    INT,
    holder_name TEXT,
    bank_name   TEXT,
    token       TEXT NOT NULL,              -- Paystack authorization_code / mandate ref (NOT a PAN)
    is_default  BOOLEAN DEFAULT false,
    is_mandate  BOOLEAN DEFAULT false,      -- authorized for direct debit
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_methods_user_idx ON public.payment_methods (user_id);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage their own payment methods (select)"
    ON public.payment_methods FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage their own payment methods (insert)"
    ON public.payment_methods FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage their own payment methods (update)"
    ON public.payment_methods FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage their own payment methods (delete)"
    ON public.payment_methods FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
