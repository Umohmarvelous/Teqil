-- migration_barter_bargaining.sql
--
-- Barter bargaining, agreements, and consequences (step 3).
--
-- A 'reward' free ride is accept-only and Emilgo funds the driver's fuel. A
-- 'barter' ride is different: the driver wants something else in exchange
-- (money, goods, a service), Emilgo funds nothing, and the two sides negotiate.
-- Today that negotiation happens in unstructured chat, so there is no record of
-- what was agreed and no way to act when someone doesn't honour it.
--
-- This adds the three things that make barter accountable:
--   1. free_ride_bargains    — the offer/counter-offer thread, one row per turn
--   2. free_ride_agreements  — what both sides finally consented to
--   3. free_ride_violations  — a report that someone didn't honour it
--
-- Consequences are deliberately conservative: an upheld violation flips the
-- claim to 'violated', which complete_free_ride() already refuses to pay out on
-- (see migration_free_ride_completion.sql). Repeat offenders are surfaced via
-- user_barter_standing() rather than auto-banned — suspension stays a human
-- decision.
--
-- Depends on: migration_free_rides.sql.

-- ── 1. The bargaining thread ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.free_ride_bargains (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id      UUID NOT NULL REFERENCES public.free_ride_offers(id) ON DELETE CASCADE,
    claim_id      UUID REFERENCES public.free_ride_claims(id) ON DELETE CASCADE,

    driver_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    passenger_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Who made THIS proposal. Must be one of the two parties above.
    proposed_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- What is being offered in exchange, in the proposer's own words.
    terms         TEXT NOT NULL CHECK (length(btrim(terms)) BETWEEN 3 AND 500),
    -- Optional cash component, for the common "₦X plus a favour" case.
    cash_amount   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),

    -- The proposal this one counters, forming the chain.
    parent_id     UUID REFERENCES public.free_ride_bargains(id) ON DELETE SET NULL,

    status        TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'countered', 'accepted', 'declined', 'withdrawn')),

    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    responded_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS free_ride_bargains_offer_idx
    ON public.free_ride_bargains (offer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS free_ride_bargains_parties_idx
    ON public.free_ride_bargains (driver_id, passenger_id);

-- ── 2. The agreement ─────────────────────────────────────────────────────────
-- One per driver+passenger+offer. Created only when a proposal is accepted, and
-- it snapshots the terms so later edits to the thread can't rewrite history.

CREATE TABLE IF NOT EXISTS public.free_ride_agreements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id            UUID NOT NULL REFERENCES public.free_ride_offers(id) ON DELETE CASCADE,
    claim_id            UUID REFERENCES public.free_ride_claims(id) ON DELETE CASCADE,
    bargain_id          UUID REFERENCES public.free_ride_bargains(id) ON DELETE SET NULL,

    driver_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    passenger_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    agreed_terms        TEXT NOT NULL,
    cash_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Consent is recorded per side; the proposer consents by proposing, the
    -- other by accepting.
    driver_accepted_at    TIMESTAMPTZ,
    passenger_accepted_at TIMESTAMPTZ,

    status              TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'fulfilled', 'disputed', 'violated', 'cancelled')),

    agreed_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    closed_at           TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS free_ride_agreements_unique
    ON public.free_ride_agreements (offer_id, passenger_id);

-- ── 3. Violations ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.free_ride_violations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id   UUID NOT NULL REFERENCES public.free_ride_agreements(id) ON DELETE CASCADE,
    claim_id       UUID REFERENCES public.free_ride_claims(id) ON DELETE SET NULL,

    reported_by    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    against_user   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    reason         TEXT NOT NULL
                     CHECK (reason IN ('not_delivered', 'partial', 'no_show', 'unsafe', 'other')),
    details        TEXT CHECK (details IS NULL OR length(details) <= 1000),

    -- 'open' until a human reviews it. Only 'upheld' carries consequences.
    status         TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'upheld', 'dismissed')),

    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    resolved_at    TIMESTAMPTZ
);

-- One report per reporter per agreement — no piling on.
CREATE UNIQUE INDEX IF NOT EXISTS free_ride_violations_unique
    ON public.free_ride_violations (agreement_id, reported_by);
CREATE INDEX IF NOT EXISTS free_ride_violations_against_idx
    ON public.free_ride_violations (against_user, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.free_ride_bargains   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_ride_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_ride_violations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parties read their bargains" ON public.free_ride_bargains
    FOR SELECT USING (auth.uid() IN (driver_id, passenger_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Parties read their agreements" ON public.free_ride_agreements
    FOR SELECT USING (auth.uid() IN (driver_id, passenger_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Parties read their violations" ON public.free_ride_violations
    FOR SELECT USING (auth.uid() IN (reported_by, against_user));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Writes go exclusively through the SECURITY DEFINER functions below, so that
-- turn-taking, consent and status transitions can't be bypassed by a direct
-- table write. No INSERT/UPDATE policies are granted on purpose.

-- ── Propose / counter ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.propose_barter(
    p_offer_id    UUID,
    p_terms       TEXT,
    p_cash_amount NUMERIC DEFAULT 0,
    p_parent_id   UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offer    public.free_ride_offers%ROWTYPE;
    v_parent   public.free_ride_bargains%ROWTYPE;
    v_caller   UUID := auth.uid();
    v_driver   UUID;
    v_passenger UUID;
    v_claim    UUID;
    v_id       UUID;
BEGIN
    IF v_caller IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;

    SELECT * INTO v_offer FROM public.free_ride_offers WHERE id = p_offer_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'offer_not_found');
    END IF;

    IF v_offer.mode <> 'barter' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_barter');
    END IF;

    IF v_offer.status = 'closed' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'offer_closed');
    END IF;

    v_driver := v_offer.driver_id;

    IF p_parent_id IS NOT NULL THEN
        SELECT * INTO v_parent FROM public.free_ride_bargains
         WHERE id = p_parent_id FOR UPDATE;

        IF NOT FOUND OR v_parent.offer_id <> p_offer_id THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'parent_not_found');
        END IF;
        IF v_parent.status <> 'pending' THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'parent_already_' || v_parent.status);
        END IF;
        -- You can't counter your own proposal; it's the other side's turn.
        IF v_parent.proposed_by = v_caller THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'not_your_turn');
        END IF;
        IF v_caller NOT IN (v_parent.driver_id, v_parent.passenger_id) THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
        END IF;

        v_passenger := v_parent.passenger_id;

        UPDATE public.free_ride_bargains
           SET status = 'countered', responded_at = timezone('utc', now())
         WHERE id = p_parent_id;
    ELSE
        -- Opening a thread: the passenger is whoever isn't the driver.
        IF v_caller = v_driver THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'driver_cannot_open');
        END IF;
        v_passenger := v_caller;
    END IF;

    SELECT id INTO v_claim FROM public.free_ride_claims
     WHERE offer_id = p_offer_id AND passenger_id = v_passenger;

    INSERT INTO public.free_ride_bargains
        (offer_id, claim_id, driver_id, passenger_id, proposed_by, terms, cash_amount, parent_id)
    VALUES
        (p_offer_id, v_claim, v_driver, v_passenger, v_caller,
         btrim(p_terms), COALESCE(p_cash_amount, 0), p_parent_id)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'reason', 'proposed', 'bargain_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.propose_barter(UUID, TEXT, NUMERIC, UUID) TO authenticated;

-- ── Respond: accept or decline ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.respond_barter(
    p_bargain_id UUID,
    p_accept     BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_b        public.free_ride_bargains%ROWTYPE;
    v_caller   UUID := auth.uid();
    v_agreement UUID;
BEGIN
    SELECT * INTO v_b FROM public.free_ride_bargains
     WHERE id = p_bargain_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_caller IS NULL OR v_caller NOT IN (v_b.driver_id, v_b.passenger_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;
    -- Only the side that DIDN'T propose can respond.
    IF v_caller = v_b.proposed_by THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'cannot_accept_own');
    END IF;
    IF v_b.status <> 'pending' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_' || v_b.status);
    END IF;

    UPDATE public.free_ride_bargains
       SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
           responded_at = timezone('utc', now())
     WHERE id = p_bargain_id;

    IF NOT p_accept THEN
        RETURN jsonb_build_object('ok', true, 'reason', 'declined');
    END IF;

    -- Accepted → snapshot the terms into a binding agreement. Both sides'
    -- consent is timestamped: the proposer's at proposal, the accepter's now.
    INSERT INTO public.free_ride_agreements
        (offer_id, claim_id, bargain_id, driver_id, passenger_id,
         agreed_terms, cash_amount,
         driver_accepted_at, passenger_accepted_at)
    VALUES
        (v_b.offer_id, v_b.claim_id, v_b.id, v_b.driver_id, v_b.passenger_id,
         v_b.terms, v_b.cash_amount,
         CASE WHEN v_b.proposed_by = v_b.driver_id THEN v_b.created_at ELSE timezone('utc', now()) END,
         CASE WHEN v_b.proposed_by = v_b.passenger_id THEN v_b.created_at ELSE timezone('utc', now()) END)
    ON CONFLICT (offer_id, passenger_id) DO UPDATE
        SET agreed_terms = EXCLUDED.agreed_terms,
            cash_amount  = EXCLUDED.cash_amount,
            bargain_id   = EXCLUDED.bargain_id,
            status       = 'active',
            agreed_at    = timezone('utc', now())
    RETURNING id INTO v_agreement;

    RETURN jsonb_build_object(
        'ok', true, 'reason', 'agreed', 'agreement_id', v_agreement
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_barter(UUID, BOOLEAN) TO authenticated;

-- ── Report a violation ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.report_barter_violation(
    p_agreement_id UUID,
    p_reason       TEXT,
    p_details      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_a       public.free_ride_agreements%ROWTYPE;
    v_caller  UUID := auth.uid();
    v_against UUID;
    v_id      UUID;
BEGIN
    SELECT * INTO v_a FROM public.free_ride_agreements
     WHERE id = p_agreement_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_caller IS NULL OR v_caller NOT IN (v_a.driver_id, v_a.passenger_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;

    v_against := CASE WHEN v_caller = v_a.driver_id THEN v_a.passenger_id ELSE v_a.driver_id END;

    INSERT INTO public.free_ride_violations
        (agreement_id, claim_id, reported_by, against_user, reason, details)
    VALUES
        (p_agreement_id, v_a.claim_id, v_caller, v_against, p_reason, p_details)
    ON CONFLICT (agreement_id, reported_by) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_reported');
    END IF;

    -- Reporting opens a dispute; it does NOT itself convict anyone.
    UPDATE public.free_ride_agreements
       SET status = 'disputed'
     WHERE id = p_agreement_id AND status = 'active';

    RETURN jsonb_build_object('ok', true, 'reason', 'reported', 'violation_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_barter_violation(UUID, TEXT, TEXT) TO authenticated;

-- ── Resolve a violation (moderation) ─────────────────────────────────────────
-- Upholding is what carries the consequence: the agreement and the underlying
-- claim both flip to 'violated', and complete_free_ride() will then refuse to
-- pay any fuel for that ride.
--
-- Not granted to `authenticated` — this is a service-role/admin operation.

CREATE OR REPLACE FUNCTION public.resolve_barter_violation(
    p_violation_id UUID,
    p_uphold       BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_v public.free_ride_violations%ROWTYPE;
BEGIN
    SELECT * INTO v_v FROM public.free_ride_violations
     WHERE id = p_violation_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_v.status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_' || v_v.status);
    END IF;

    UPDATE public.free_ride_violations
       SET status = CASE WHEN p_uphold THEN 'upheld' ELSE 'dismissed' END,
           resolved_at = timezone('utc', now())
     WHERE id = p_violation_id;

    IF p_uphold THEN
        UPDATE public.free_ride_agreements
           SET status = 'violated', closed_at = timezone('utc', now())
         WHERE id = v_v.agreement_id;

        IF v_v.claim_id IS NOT NULL THEN
            UPDATE public.free_ride_claims
               SET status = 'violated'
             WHERE id = v_v.claim_id AND status <> 'completed';
        END IF;
    ELSE
        UPDATE public.free_ride_agreements
           SET status = 'active'
         WHERE id = v_v.agreement_id AND status = 'disputed';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'reason', CASE WHEN p_uphold THEN 'upheld' ELSE 'dismissed' END
    );
END;
$$;

-- ── Standing: a trust signal, not an automatic ban ───────────────────────────

CREATE OR REPLACE FUNCTION public.user_barter_standing(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT jsonb_build_object(
        'agreements',  (SELECT count(*) FROM public.free_ride_agreements
                         WHERE driver_id = p_user_id OR passenger_id = p_user_id),
        'fulfilled',   (SELECT count(*) FROM public.free_ride_agreements
                         WHERE (driver_id = p_user_id OR passenger_id = p_user_id)
                           AND status = 'fulfilled'),
        'upheld',      (SELECT count(*) FROM public.free_ride_violations
                         WHERE against_user = p_user_id AND status = 'upheld'),
        'open_reports',(SELECT count(*) FROM public.free_ride_violations
                         WHERE against_user = p_user_id AND status = 'open')
    );
$$;

GRANT EXECUTE ON FUNCTION public.user_barter_standing(UUID) TO authenticated;

-- ── Mark an agreement fulfilled (both sides happy) ───────────────────────────

CREATE OR REPLACE FUNCTION public.fulfil_barter_agreement(p_agreement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_a      public.free_ride_agreements%ROWTYPE;
    v_caller UUID := auth.uid();
BEGIN
    SELECT * INTO v_a FROM public.free_ride_agreements
     WHERE id = p_agreement_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_caller IS NULL OR v_caller NOT IN (v_a.driver_id, v_a.passenger_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;
    IF v_a.status = 'violated' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'violated');
    END IF;

    UPDATE public.free_ride_agreements
       SET status = 'fulfilled', closed_at = timezone('utc', now())
     WHERE id = p_agreement_id;

    RETURN jsonb_build_object('ok', true, 'reason', 'fulfilled');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fulfil_barter_agreement(UUID) TO authenticated;
