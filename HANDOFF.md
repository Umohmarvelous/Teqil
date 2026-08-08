# Emilgo — Project Handoff

_Last updated: 2026-08-07. Written so a fresh Claude Code session (started from this
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

### Free-ride completion → fuel redemption + receipts (step 2 — DONE 2026-08-07)
- **`complete_free_ride(p_claim_id, p_route_id, p_amount)` RPC** —
  `supabase/migrations/migration_free_ride_completion.sql`, **applied**. This is the
  only path from a tracked ride to a payout, and it is server-authoritative:
  - caller must be the claim's driver or passenger (else `forbidden`);
  - the `route_history` row must exist, carry that claim's `claim_id`, and have been
    recorded by one of the two parties (else `route_mismatch`);
  - fuel is drawn **only** when `mode = 'reward'` **and** the trigger-set
    `gps_validated` is true — then via `redeem_fuel()`, so the advisory lock and the
    "never overdraw" cap still apply;
  - idempotent — a second call returns `already_completed` and pays nothing.
  - Returns JSONB `{ ok, reason, mode, gps_validated, fuel_awarded, already }`.
    `reason` ∈ paid | not_gps_validated | pool_empty | barter_no_fuel |
    already_completed | route_mismatch | forbidden | cancelled | violated.
- **Verified against the live DB** in rolled-back transactions (nothing persisted;
  all tables still at 0 rows, pool ₦0): valid ride pays ₦500 and debits the pool;
  short track → `not_gps_validated`, ₦0; orphan route → `route_mismatch`; stranger →
  `forbidden`; **valid ride against the empty pool → `pool_empty`, ₦0, pool stays 0**
  (the real current path, since the pool is only fed by real premium money).
- `useFreeRidesStore.completeRide({ claimId, routeId, distanceKm })` now calls that
  RPC and returns a `FreeRideCompletion`; `describeCompletion()` turns the reason into
  the sentence shown to the user, so the UI never claims a payout that didn't happen.
  _(The old `completeRide(claim)` signature had no callers and was replaced.)_
- `freeRideToReceipt()` in `src/utils/activity.ts` → free-ride receipt (fare "Free",
  GPS verification block, fuel actually credited) rendered by `components/Receipt.tsx`
  from the tracker's end-of-ride panel.
- ⚠️ `computeFuelReward()` still returns the flat `FUEL_REWARD_PER_RIDE = 500` —
  distance now flows into it but is deliberately **unused**, since changing the
  economics needs an explicit ask.

### GPS tracking + live map + route history (step 1 — DONE 2026-08-06)
- **`src/services/locationTracking.ts` rewritten** into a session-based engine:
  `startLocationTracking(string | TrackingSessionInit)` (old string signature still
  works), `stopLocationTracking(): Promise<TrackingSummary | null>`, `ensureGpsOn()`,
  `flushPendingRoute()`, `estimateGpsValid()`.
  - Fix filtering: rejects accuracy > 50 m and >200 km/h teleports; sub-5 m jitter
    doesn't move the anchor, so slow traffic still accumulates.
  - **One** Realtime channel per session, subscribed once, broadcast throttled to 3 s
    (previously a fresh unsubscribed channel per point — every send failed).
  - Checkpoints to AsyncStorage every 10 fixes; `flushPendingRoute()` runs on login
    from `app/_layout.tsx` so an app kill mid-ride doesn't lose the track.
  - `compulsory: true` (free rides) force-enables the `shareLocation` setting instead
    of throwing; everything else still respects the toggle.
  - On stop, uploads a Douglas–Peucker-simplified path (≤500 pts) to `route_history`.
- **`route_history` table** — `supabase/migrations/migration_route_history.sql`,
  **already applied** to `orygxuxgjmhamcisjkfu`. `gps_validated` is set by a BEFORE
  INSERT/UPDATE trigger via `route_is_gps_valid()` (≥10 fixes, ≥0.3 km, ≥60 s,
  avg 1–120 km/h) — the client cannot assert it. Step 2's fuel redemption should
  gate on this column.
- **Screens**: `app/route-history/index.tsx` (list, SVG thumbnails via
  `components/RouteThumbnail.tsx` — not N MapViews), `app/route-history/[id].tsx`
  (full map, stats, "save as route" → `saved_routes`),
  `app/free-ride-track/[claimId].tsx` (compulsory-GPS gate, live map, watchdog that
  warns if GPS is killed mid-ride, end → validated summary).
- **`src/hooks/useRouteHistory.ts`** — `useRouteHistory()`, `useRouteHistoryEntry()`,
  `regionForPath()`.
- Wired: free-rides accept → tracker; driver "Track" on claimed offers; live-trip
  records history + "View tracked route"; sidebar + Settings entries.
- ⚠️ Root-level **`migration_live_trips.sql` is stale** — its `saved_routes` schema
  predates the live table. Don't run it.

### Barter bargaining + settings toggles (steps 3 & 4 — DONE 2026-08-07)
- **`migration_barter_bargaining.sql`** — ⚠️ **written but NOT applied.**
  `free_ride_bargains` (offer/counter thread), `free_ride_agreements` (the
  consented snapshot), `free_ride_violations`. RPCs: `propose_barter`,
  `respond_barter`, `report_barter_violation`, `resolve_barter_violation`
  (admin/service-role only — not granted to `authenticated`),
  `fulfil_barter_agreement`, `user_barter_standing`.
  Tables grant **no** client INSERT/UPDATE on purpose — turn-taking and consent
  can only be changed through the SECURITY DEFINER functions.
  Upholding a violation flips the claim to `violated`, which `complete_free_ride`
  already refuses to pay on. Suspension stays a human decision.
- `src/store/useBarterStore.ts` + `app/barter/[offerId].tsx` (built on the
  `components/ios` kit). "Bargain" in free-rides now routes here, not to chat.
- **Settings toggles**, all genuinely wired — nothing decorative:
  `autoStartTracking` (tracker begins on open vs manual tap), `confirmEndTrip`,
  `dataSaver` (coarser GPS + 4× slower broadcasts in locationTracking),
  `hapticFeedback` (via new `src/utils/haptics.ts` — import that, not expo-haptics),
  `distanceUnit` (km/mi in `formatDistance`).

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

1. ~~**GPS tracking + live map + saved route history**~~ — **DONE**, see above.
2. ~~**Free-ride receipts + completion → fuel redemption**~~ — **DONE**, see above.
3. ~~**Barter bargaining + agreement / consequences**~~ — **code DONE**, see §4.
   ⚠️ `migration_barter_bargaining.sql` is **NOT YET APPLIED** (Supabase MCP was
   disconnected). Apply it before testing.
4. ~~**More settings toggles**~~ — **DONE**, see §4.
5. **Driver subscription.**
6. **Direct-sold local/route ads** (functional) — see `migration_revenue_ads.sql`.
7. **Sponsored feed posts.**
8. **Live-tracking enhancements.**

---

## 6. Migrations — RUN THESE (manual step for you)

Supabase project is **`orygxuxgjmhamcisjkfu`** ("Teq_database"), reachable via the
**Supabase MCP** when a session starts from this directory.

**Live tables as of 2026-08-07:** `users`, `parks`, `trips`, `passengers`, `ratings`,
`broadcasts`, `conversations`, `message`, `chats`, `messages`, `saved_routes`,
`credits_history`, `pool_history`, `transactions`, `program_applications`,
`route_history`, `fuel_pool_history`, `free_ride_offers`, `free_ride_claims`.

Applied:
- `migration_route_history.sql` — ✅ 2026-08-06.
- `migration_fuel_pool.sql` — ✅ 2026-08-07 (`fuel_pool_history`, `fuel_pool_balance()`,
  `redeem_fuel()`).
- `migration_free_rides.sql` — ✅ 2026-08-07 (`free_ride_offers`, `free_ride_claims`,
  `claim_free_ride()`).
- `migration_free_ride_completion.sql` — ✅ 2026-08-07 (`complete_free_ride()`).
- `saved_routes` is **already** on the extended schema (`label`, `origin_label`,
  `dest_label`, `use_count`, `last_used_at`), so `useSavedRoutes.ts` works as written.

All four new tables are at **0 rows** and the fuel pool balance is **₦0** — no seed or
dummy data was inserted, per the no-fake-funding rule.

Still **NOT** applied — run these in the SQL Editor or via MCP:
- `migration_driver_lookup.sql` — `get_driver_public` RPC
- `migration_driver_commission.sql`
- `migration_achievements.sql`
- `migration_payment_methods.sql` — tokens only, no raw PAN
- `migration_revenue_ads.sql` — ads
- _(also present: `migration_consolidated.sql`, `migration_fix_signup_trigger.sql`,
  `migration_username_login.sql` — parts of these are clearly already live; diff before
  re-running.)_

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
- **`LANG` is unset on this machine**, so Ruby defaults to US-ASCII and CocoaPods
  dies with `Unicode Normalization not appropriate for ASCII-8BIT`. Always run pod
  commands as `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`, or better, add
  `export LANG=en_US.UTF-8` to `~/.zshrc` once.
- **`cmake` is NOT installed** and Hermes' podspec requires it → `pod install`
  cannot finish → **no iOS dev build is currently possible.** `brew install cmake`
  fails on this network (see below).
- **npm is unusable on this network; bun is fine.** npm hits truncated metadata
  fetches that surface as bogus `ETARGET` errors; `bun install --dry-run` completes
  in ~0.5s. Use `bun add` / `bun install`. A project `.npmrc` (retries, `maxsockets=3`)
  is in place for the paths that force npm, but bun is the reliable route.
  Homebrew fails the same way — `formulae.brew.sh` throttles to <100 B/s and the
  git-tap fallback dies with `fatal: early EOF`.
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
