# EMILGO — Product Requirements Document

> **Purpose of this file.** Anyone (human or Claude) should be able to read this
> once and understand what EMILGO is, how it is built, what works today, and
> what is still outstanding. Keep it current: when you ship something, move it
> from "Planned" to "Built" and note the date. When you learn something
> non-obvious about the domain or the constraints, write it down here.
>
> Last updated: 2026-08-11

---

## 1. What we are building

EMILGO (repo name **Teqil**, bundle id `com.teqil.app`) is a mobile app for
**Nigerian commercial road transport** — the danfo/bus/keke economy. It connects
three parties who today coordinate by shouting, cash and phone calls:

| Role | What they need |
|---|---|
| **Driver** | Fill seats, get paid without handling cash, prove they're legitimate, earn rewards for good service |
| **Passenger** | Find a trip going their way, know the fare up front, pay without cash, feel safe about who is driving |
| **Park owner** | See which of their drivers are working, respond to emergencies, verify driver identity |

The product thesis: **trust and payment are the bottleneck, not matching.** Nigerian
commercial transport already has abundant supply and demand meeting physically at
parks. What's missing is a way to (a) verify the driver is who they claim, (b) move
money without cash, and (c) create a reason for drivers to behave well repeatedly.
Everything in the app serves one of those three.

### Currency, language, market

- All money is **Naira (₦)**. `formatNaira` in `src/utils/helpers`.
- Two languages: **English** and **Nigerian Pidgin** (`src/i18n/`). Pidgin is a
  first-class locale, not a novelty — a large share of the target users read it
  more comfortably than English.
- Brand green `#009A43` (`Colors.primary`), gold `#F5A623` (`Colors.gold`) for
  earnings and coin UI. Font is **Poppins** throughout.

---

## 2. Core domain concepts

Read this section before touching business logic — several of these are
non-obvious and easy to get wrong.

### Trips and trip codes
A driver creates a trip; the system issues a short **trip code**. Passengers join
by scanning the driver's QR or entering the code. `live-trip-code/[code].tsx`
renders a live-tracked trip. Trip state lives in `useTripStore` (not persisted —
it is reset per trip by design).

### Fuel coins
The driver reward currency. Earned by completing trips, convertible to Naira
(`coinsToNaira`). Displayed in gold. This is the retention mechanic — it is why a
driver keeps using the app rather than reverting to cash.

### The QR money model
**Non-obvious and previously got this wrong.** On a QR fare payment
(`app/(passenger)/payment.tsx`): the passenger pays **half** the fare, the driver
receives **that half plus a ₦100 bonus**. The bonus is subsidised from the pool.
Home-screen scan routes to `payment.tsx`, not to the generic pay-fare flow.

### Barter / bargaining
Nigerian transport fares are negotiated, not fixed. A passenger can counter-offer
a driver's price; the driver accepts, rejects or counters. Backed by
`supabase/migrations/migration_barter_bargaining.sql`. Route: `app/barter/[offerId].tsx`.

### Free rides
A promotional mechanic where a rider's fare is covered. Completion is tracked
server-side (`migration_free_ride_completion.sql`) so it can't be spoofed
client-side. **Free rides always track location**, regardless of the user's
share-location setting — that's the deal for a subsidised ride, and it is stated
in the settings copy.

### Loyalty tiers
Free / Pro / Elite (`app/tiers.tsx`). Gates premium features.
**Revenue persistence for tiers is still outstanding.**

### Credit tiers (distinct from loyalty tiers)
Bronze / Silver / Gold, derived from completed trips. Shown as a profile badge.
A user can hide the badge; hiding it does not change the tier.

---

## 3. Architecture

### Offline-first is the defining constraint
Nigerian mobile data is intermittent. **AsyncStorage is the source of truth for
reads; Supabase is the sync target.** Never write a screen that assumes the
network is up.

`src/services/sync.ts` implements this explicitly:
- **Push** — local records with `synced = false` are upserted to Supabase, then marked synced.
- **Pull** — remote records for the current user merge into local storage,
  last-write-wins on `updated_at`, remote wins ties.
- Triggered from `app/_layout.tsx`: on user change, on connectivity change, and
  manually. The sync layer is plain functions with no React dependency — it is
  wired to the lifecycle only at the call site. Keep it that way.

### Two backends exist; only one is wired up

- **`server/` — ACTIVE.** Small Express app, port 5001 (`PORT` to override).
  Serves the Expo web build and exposes exactly two routes today
  (`server/routes.ts`): `/api/health` and `/api/webhooks/scan-success`
  (Expo push). This is the only HTTP backend the app reaches.
- **`services/` + `gateway/` + `docker-compose.yml` — NOT INTEGRATED.**
  A DDD-style microservice split (auth, trip, payment, engagement, ad-analytics,
  notification, credits) behind an nginx gateway. Buildable, but the app does not
  call it. Treat as in-progress backend work, not the live API surface.

The mobile app talks **directly to Supabase** for auth and data via
`src/services/supabase.ts`.

### State
Zustand, in `src/store/`:
- `useStore.ts` — `useAuthStore` (user/session/role/language, persisted) and
  `useTripStore` (live trip: location, earnings, elapsed, route coords; not persisted)
- `useSettingsStore.ts` — theme and all user preferences; `ThemeSync` in the root layout keeps it in step with the OS
- `useMessagesStore.ts`, `useCreditsStore.ts`

TanStack Query (`lib/query-client.ts`) exists but most domain state still flows
through Zustand + the sync layer.

### Routing (expo-router, file-based)
- `(auth)/` — welcome/role-select, login, register, driver-profile
- `(main)/` — shared tab shell: home, discover, feed, messages, profile, settings
- `(driver)/`, `(passenger)/`, `(park-owner)/` — role-specific
- Top-level dynamic/modal routes: `live-trip-code/[code]`, `direct-chat/[conversationId]`, `barter/[offerId]`, `rating`

`app/_layout.tsx` is the composition root: fonts, Supabase auth subscription,
i18n, push tokens, connectivity-triggered sync, and the animated splash gating
first paint.

### Directory split
- `app/` — routes only
- `components/` — shared UI across route groups
  - `components/ios/` — **the iOS design-system kit** (see §4)
  - `components/Sidedbar.tsx` — filename typo, kept deliberately. Don't "fix" it without checking every import.
- `src/` — everything non-route: `services/`, `store/`, `models/types.ts`, `i18n/`, `hooks/`, `data/`, `utils/`

`@/*` maps to the repo root. Existing code mixes `@/` and relative imports —
follow whatever the file you're editing already does.

---

## 4. The iOS design system (`components/ios/`)

The app targets **iOS 26 Liquid Glass**. This is the most opinionated part of the
codebase and the easiest to break.

### The rendering ladder
`Glass` (`components/ios/Glass.tsx`) resolves to one of four paths:

1. **iOS 26 + native module** → real `UIGlassEffect` via `expo-glass-effect`
2. **iOS 25 and below, or Expo Go** → `expo-blur` + the caller's material tint
3. **Android / web** → `expo-blur` (weaker) + a heavier veil
4. **Reduce Transparency on** → flat opaque surface, no blur

Every caller passes `fallbackTint` — the exact colour the design used before
glass existed. That is why paths 2–4 are not visible downgrades.

### Rules that will bite you

**Never animate opacity on a `GlassView` or any of its ancestors.** It renders
the effect incorrectly (expo/expo#41024; Apple says the same about
`UIVisualEffectView.alpha`). This has been fixed across the kit nine times and
will keep recurring. The pattern:
- containers animate **motion only** (scale, translate)
- glass materialises via the `present` prop, which animates the *effect*
- content drawn **on top of** glass may fade freely

**Glass clips its children**, so a clipped view can't cast a shadow. Cards with
shadows put the shadow on a wrapper and the glass inside.

**Translucent chrome needs content behind it.** If a scroll view's *frame* is
padded away from the header/tab bar, the glass has nothing to sample and renders
as a flat panel. Use **content insets**, never frame padding — `useCollapsibleScroll`
returns `scrollProps` that does this correctly.

**`isInteractive` only applies on mount.** Remount with a new `key` to change it.

**Capability detection is defensive.** `isLiquidGlassAvailable()` throws when the
native module is absent (Expo Go), and some iOS 26 betas report the new design but
crash on the API — hence the `isGlassEffectAPIAvailable()` second check.

### Two type ramps
- `IOSFont` — San Francisco, for **system chrome** (alerts, menus, nav bars) where matching iOS exactly is the point
- `IOSAppFont` — **Poppins**, for app UI (settings rows, cards, buttons)

### Kit inventory
`Glass`, `GlassGroup`, `GlassScrim`, `IOSButton`, `IOSToggle`, `IOSSheet`,
`IOSModalCard`, `IOSAlert`, `IOSMenu`, `IOSSearchBar`, `IOSList`, `IOSScreen`,
`IOSTabBar`, `CollapsibleHeader`, `RatingModal`, `FeedbackModal`, `AlertHost`.

**`/ui-kit`** is a live gallery of every component, with a banner reporting which
rendering path the device is on. Not linked from navigation — open it directly.

---

## 5. Current state — what is built

### Working
- Auth (Supabase), role selection, registration, driver profile completion
- Offline-first sync with conflict resolution
- Trip creation, trip codes, QR generate/scan, live GPS tracking with a real map
- GPS route history (`migration_route_history.sql`), Douglas–Peucker simplification
- Fare payment (Paystack), the QR half-fare + ₦100 bonus model
- Barter/bargaining
- Free rides with server-side completion
- Fuel coins, credit tiers, loyalty tiers page
- Biometric app lock, session timeout
- i18n (English + Pidgin)
- Push notifications
- Discover feed with comments, replies and a composer
- iOS kit with Liquid Glass across the control layer
- **41 of 56 screens migrated to the kit**

### Known gaps and debt
- **`direct-chat`** now works, but message state is screen-local. If chat needs to
  drive unread badges elsewhere, it needs a store.
- **`services/` microservices** are unintegrated.
- **`src/db/`** is empty/unused.
- **Loyalty tier revenue persistence** is not implemented.
- **Park-owner alerts use `MOCK_ALERTS`** — not wired to Supabase realtime yet.
- **`driver-search` filter/sort chips don't filter.** The lookup is an exact
  badge-ID match returning at most one driver. Commented in the code.
- Pre-existing unused-variable warnings in `(driver)/history.tsx` and `(main)/messages.tsx`.
- No test suite.

---

## 6. Roadmap — the 8 phases

Requested 2026-08-11. Strict phase order.

| Phase | Scope | Status |
|---|---|---|
| **1** | Collapsible headers on every scrollable screen (title left/large → centred/small, glass on scroll). WhatsApp-style profile header: picture shrinks to top-left, username becomes the centred title, buttons stay sticky. | **In progress** — kit support done; `driver/messages` and `park-owner/alerts` converted as reference. ~35 screens remain. Profile header not started. |
| **2** | Translucent tab bar with content scrolling behind it, correct safe-area insets, no clipping. | **In progress** — `useCollapsibleScroll({ tabBar: true })` supplies both insets; Home fixed. Remaining screens follow with Phase 1. |
| **3** | Replace the full-width network banner with a centred header status: red "connection is weak" + disconnected icon; green "connecting…" + bars icon; logo returns when normal. Driven by NetInfo. | Not started |
| **4** | Profile restructure: swipeable **Profile** / **Activity** tabs; Account Settings under Profile absorbing **all** settings, organised WhatsApp-style; pull-to-refresh on both; tab bar pins on scroll with blur, stays swipeable. | Not started |
| **5** | New **Notification** tab replaces the Settings tab. Notifications screen shows app notifications, driver/passenger messages, sync alerts, grouped iOS-style. Trip and transaction notifications move to History. | Not started |
| **6** | Followers/following. Passengers follow drivers; driver profiles show follower and following counts; follow/unfollow toggle; follower list. Scalable social-graph schema. | Not started |
| **7** | Proximity: **Fastest Finger** (driver offers an immediate discounted ride, nearby passengers accept instantly); **Find driver/passenger near you** wired into bargaining and ride requests; **Find nearest filling station**. | Not started |
| **8** | Persistent watermark overlay so screenshots carry the logo; shareable profile deep link; rating/feedback modal. | Partly done — `RatingModal` (Twitter-style alert, 4–5★ → store, 1–3★ → feedback form) already ships. |

### Decisions taken on the roadmap (2026-08-11)

- **Settings are being flattened into Profile → Account Settings.** The user chose
  the literal reading: inline all 30+ settings as one grouped list under Profile,
  and remove the standalone Settings tab. `app/settings/*` and the settings root
  are to be retired. The settings **search bar moves to the Profile screen header**.
  A new **Notification** tab takes the old Settings tab's slot.
  *This supersedes the settings-root + 7-sub-screen structure built earlier the
  same day.* `src/data/settingsIndex.ts` (flat searchable index of every setting)
  should be reused as the data source for the flattened list.
- **Filling stations use the Google Places API in-app**, rendered on
  `react-native-maps`. Requires a Places key with billing, **kept server-side** —
  which means a new endpoint on the Express server, not a client-side key.
- **Screenshot watermarking:** iOS cannot modify the image the system saves to
  Photos, so the approach is a **persistent faint logo overlay** rendered in a
  corner of every screen; any screenshot naturally includes it.

---

## 7. Environment and build

### Commands
```bash
npx expo start          # Metro
npm run expo:dev        # Metro wired for Replit's proxy domain
npm run expo:remote     # Cloudflare-tunnelled Metro + API for remote testers
npm run server:dev      # Express API alone, port 5001
npm run server:build    # esbuild → server_dist/
npm run lint
```
No test suite is configured.

### SDK situation — read this before debugging a build
`main` is on **Expo SDK 57**. Branch **`sdk-54-temp`** is a deliberate, temporary
downgrade to SDK 54 so the app runs in Expo Go on a real iPhone while the dev
build is blocked on Apple provisioning.

On SDK 54, two things differ and are already handled on that branch:
- `expo-status-bar` has no config plugin before SDK 57 — it must not appear in
  `app.json` `plugins`.
- `babel-preset-expo` installs nested rather than hoisted, so it's declared
  explicitly in `devDependencies`.

`expo-glass-effect` 0.1.10 (SDK 54) and 57.0.1 have **identical APIs**, so the
whole kit compiles on both.

To return to 57: `git checkout main && npm install`.

**You will not see real Liquid Glass in Expo Go** — it needs iOS 26 *and* the
native module in the binary. Expo Go shows the blur fallback. That is correct
behaviour, not a bug.

### npm gotcha
`ETARGET / no matching version` on an Expo package here almost always means a
**stale npm cache**, not a real conflict — verify with `npm view <pkg> versions`
first. Fix: `npm cache clean --force && npm install`. `--prefer-online` is not
enough; it refreshes the top-level packument but still serves stale ones for
transitive deps.

### Secrets
`EXPO_PUBLIC_*` is inlined into the bundle at build time — **never put a secret
there**. Paystack/Smile/ads and the forthcoming Google Places key are
server-side only. Test keys work now; live keys need provider verification.

### Premium kill-switch
`src/config/devFlags.ts`. `DEV_OVERRIDES_ENABLED = __DEV__`, so it is dead-code
eliminated in production. **It deliberately has no UI** — a user-facing toggle
would let anyone switch premium on.

---

## 8. Working agreements

- Nigerian transport reality beats generic ride-hailing assumptions. Fares are
  negotiated; connectivity is intermittent; cash is what we're replacing.
- **Never fund the pool with fake data.** Verify Supabase RPCs in rolled-back
  transactions.
- When migrating a screen to the kit: **swap components, preserve layout**. The
  original design is deliberate.
- Commit and push each meaningful unit of work.
