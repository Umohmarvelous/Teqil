# Emilgo — Project Handoff

_Last updated: 2026-08-05. Written so a fresh Claude Code session (started from this
directory) has full context. Read this first._

---

## 1. What this project is

**Emilgo** (internal/repo name **Teqil**) is a mobile app for **Nigerian commercial
transport** — connecting **drivers**, **passengers**, and **park/station owners**. A
passenger scans a driver's QR code to pay a fare; the app runs a shared "fuel pool"
economy, a premium subscription, achievements/credit tiers, receipts & history, and
(in progress) free-ride rewards, bartering, live tracking, and ads.

- **Repo:** GitHub `Umohmarvelous/Teqil`
- **Local path:** `/Users/a0000/Projects/Emilgo Mobile App/`
- **Owner/EAS:** owner `stainles`, slug `teqil`, projectId `492934f4-8a6b-45de-9399-4d6687854411`

### Tech stack
- **Expo SDK 57.0.0** · React Native 0.86.2 · React 19.2.3 · TypeScript 6.0.3
- New Architecture + React Compiler · expo-router (typed routes) · Reanimated 4.5.1
- **Supabase** (Postgres + RLS + SECURITY DEFINER RPCs + advisory locks)
- **zustand** persisted stores (offline-first ledger pattern, `dedupe_key` idempotency)
- **Paystack** for payments (tokenized cards, direct-debit mandate, 60/40 subaccount split)
- Package manager: **bun** (npm also works)

---

## 2. The economic model (STRICT — do not change without being asked)

Split is **60 / 40** — **60% to the station**, **40% to Emilgo**. This is fixed.

**Per-trip payment rule:**
- Passenger pays **half** the fare.
- The passenger's **pool** matches the **other half + a fixed ₦100 driver bonus**, so
  the **driver nets base fare + ₦100**.
- A **₦100 company cut** (from passenger pool) and a **₦100 driver commission** (from
  driver pool) are both **OPTIONAL**.
- **If the pool can't fund half + the ₦100 bonus, the payment is BLOCKED.** No trip goes
  through underfunded.
- **No fake pool funding.** The pool stays **₦0** until it's fed by ads/premium (real
  money). Do not seed it with dummy balances.

**Fuel pool:** 60% of premium subscriptions flow into a shared fuel pool (capped, never
overdrawn — "nobody loses money"). Drivers redeem it for GPS-validated free rides.
Redemptions are capped at the *realized* balance via an advisory-locked RPC.

**Anti-fraud:** premium paywall + unique NIN/BVN + device-fingerprint cap
(`MAX_ELIGIBLE_PER_DEVICE = 1`) + GPS validation.

---

## 3. Hard rules (compliance — never violate)

- **NEVER store raw card numbers, CVV, or BVN.** Tokenize via Paystack; store **only**
  the token/authorization_code + `last4` + `brand`. The `payment_methods` table has **no
  raw-PAN column by design.**
- **No mock / dummy data in user-facing flows.** Use real values. Bank account resolution
  must return the **real** account name (Paystack NIBSS name-enquiry) or honestly report
  "unresolved" — never a fabricated name.
- **Gates:** a passenger must have a stored payment method before scan-and-pay; a driver
  must have a payout account before "get code."

---

## 4. What's DONE

### Payments & QR
- **QR fix** (`src/utils/qr.ts`): `buildDriverQRValue` / `parseDriverQR` (accepts JSON +
  legacy `TEQIL:DRV-`) / `toDriverPayload`. Fixed "Driver not found" (RLS blocked
  cross-user reads → now renders driver from the scanned QR payload).
- **Strict split** wired in `src/store/usePoolStore.ts` (`computeTripSplit`,
  `spendForTrip`, `DEFAULT_DRIVER_COMMISSION = 100`, `chargeDriverCommission`).
- `app/(passenger)/payment.tsx` + `app/(passenger)/pay-fare.tsx`: block gate enforced,
  driver paid full fare + ₦100, commission charged.

### Premium & checkout (tokenized, PCI-safe)
- `app/tiers.tsx`: "Get Premium!" — 3 plan cards (Free / Pro[Popular] / Elite) + benefits
  comparison table → routes to `/checkout`.
- `app/checkout.tsx`: order summary, method selector (card live; Google/Apple/PayPal
  "Soon"), card form (Luhn + expiry + CVV validation), saved cards, `setupMode`
  (amount 0 = save card), tokenize→save→charge, decline/insufficient handling, Receipt on
  success, credits fuel pool 60% on premium.
- `components/CreditCardVisual.tsx`: display-only gradient bank card (brand + last4).
- `src/store/usePaymentMethodsStore.ts`: **tokenized methods only.**
- `src/services/paystack.ts`: `tokenizeCard`, `createDirectDebitMandate`,
  `chargeWithToken`, `createTransferRecipient`, `detectCardBrand`, `resolveBankAccount`
  (returns `{resolved:false}` on failure in real mode — no fake name).
- `server/paystack.ts`: endpoints `/tokenize-card`, `/mandate`, `/charge-authorization`,
  `/transfer-recipient` (mock only when `SECRET` isn't `sk_...`).

### Step 7 — UI polish
- Credit tiers `src/utils/tiers.ts` (Bronze/Silver/Gold at **0 / 100 / 500**).
- Achievements: `src/data/achievements.ts` (12 defs), `src/store/useAchievementsStore.ts`,
  `components/AchievementsCard.tsx`, `app/achievements.tsx`.
- `components/CreditMeter.tsx` + `app/(main)/profile.tsx` (credit meter + "Become a
  partner" CTA + achievements + evaluate effect).

### Receipts & history
- `components/Receipt.tsx`, `src/utils/activity.ts` (`buildActivity`,
  `transactionToReceipt`), `components/ActivityFeed.tsx`, `src/hooks/useActivityFeed.ts`.
  _(Note: `useActivityFeed.ts` filters trips by `t.driver_id === user.id` — a
  deliberate user/linter edit; **do not revert.**)_

### Free rides (first increment)
- `app/(driver)/free-ride.tsx`: driver offer screen — premium gate, reward vs barter,
  duration / max passengers / requirements / barter terms, fuel-pool banner,
  compulsory-GPS notice, "your open offers" list.
- `app/free-rides.tsx`: passenger discovery/accept — mode tags, `ensureGpsOn()`,
  premium+GPS gates, Elite-gated bargaining.
- `src/store/useFreeRidesStore.ts` (`createOffer`, `fetchOpenOffers`, `acceptOffer`,
  `completeRide`, …), `src/store/useFuelPoolStore.ts`, `src/utils/fuel.ts`
  (`FUEL_REWARD_PER_RIDE = 500`).
- Sidebar "Free Rides" entry in `components/Sidedbar.tsx`.

### Platform / build
- **Upgraded SDK 54 → 57.0.0** (RN 0.86.2, React 19.2.3). Handled breaking changes:
  `StyleSheet.absoluteFillObject`→`absoluteFill`, removed `expo-av`, removed obsolete
  expo-asset patch, `_layout.tsx` theme/StatusBar fixes.
- Verified live bundle: "iOS Bundled … 8205 modules", HTTP 200, clean JS.
- EAS dev builds configured; run on iPhone simulator.

---

## 5. What's LEFT to do (in order)

Continue **without asking for approval** (per the user's standing instruction) — finish
each feature perfectly, then move to the next:

1. **GPS tracking + live map + saved route history** — compulsory during free rides;
   tracking toggle auto-on.
2. **Free-ride receipts + completion → fuel redemption** — wire `completeRide` to draw
   from the fuel pool via `redeem_fuel`.
3. **Barter bargaining + agreement / consequences** — T&C, violation penalties.
4. **More settings toggles** — keep expanding the settings page.
5. **Driver subscription.**
6. **Direct-sold local/route ads** (functional) — see `migration_revenue_ads.sql`.
7. **Sponsored feed posts.**
8. **Live-tracking enhancements.**

---

## 6. Migrations — RUN THESE (manual step for you)

The sandbox can't reach Supabase, so these were **not** applied. Run them in the
**Supabase SQL Editor** (or, once you start a session from this dir, the **Supabase MCP**
lets me apply them directly). Files in `supabase/migrations/`:

- `migration_driver_lookup.sql` — `get_driver_public` RPC
- `migration_driver_commission.sql`
- `migration_achievements.sql`
- `migration_payment_methods.sql` — tokens only, no raw PAN
- `migration_fuel_pool.sql` — `fuel_pool_history` + `fuel_pool_balance()` + `redeem_fuel()`
- `migration_free_rides.sql` — `free_ride_offers` + `free_ride_claims` + `claim_free_ride()`
- `migration_revenue_ads.sql` — ads
- _(others present: `migration_consolidated.sql`, `migration_fix_signup_trigger.sql`,
  `migration_username_login.sql` — check which are already applied before re-running.)_

**Verify** what's already live before running, so you don't double-apply.

---

## 7. Other manual steps you must do

- **Run the payment server** for real bank resolution & charges: `npm run server:dev`.
- **Swap keys** `sk_test_…` → `sk_live_…` (and matching `pk_…`) for real account lookups
  and live charges. Test keys resolve to Paystack's test data only.
- **iPhone physical device** dev build needs either the **$99 Apple Developer** account or
  a local free build (7-day provisioning). Simulator & Android APK don't need it.

---

## 8. Environment gotchas (this machine)

- **8GB Intel Mac, no GPU.** Builds are heavy — be patient, avoid parallel heavy installs.
- **Flaky network drops HTTP/2**, which has corrupted `node_modules` mid-install before
  (RN reverted to 0.81 → Metro crash). If installs fail: re-run `expo install --fix` on a
  warm cache, uninterrupted.
- **macOS has no `timeout` command** — use a bash watchdog for long scripts.
- **Typecheck baseline = ~10 pre-existing, unrelated errors** (create-trip, driver/history
  `textColor`, driver/messages overload, main/messages route, find-driver, QuickTransfer
  route, trip-service). Reaching 10 = clean; new work should not add more.
- ⚠️ **Security:** there is an **unresolved crypto-stealer LaunchAgent** flagged on this
  Mac (as of 2026-07-29). Worth cleaning up separately.

---

## 9. How to start the new session cleanly

```bash
cd "/Users/a0000/Projects/Emilgo Mobile App"
claude
```

Starting from here roots the working directory **and** memory on Emilgo, and activates
this project's **Supabase MCP** (defined in `.mcp.json`) — which is what lets migrations
be applied directly instead of pasted by hand.

Then just say: **"Read HANDOFF.md and continue with GPS tracking + live map."**
