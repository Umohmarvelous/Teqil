# EMILGO — Keys, accounts and manual setup

Everything in this app that needs **you**, not code, before the feature is fully
effective. Grouped by whether it blocks going live, degrades a feature, or is
optional.

Read alongside [HANDOFF.md](HANDOFF.md) (working state + remaining tasks) and
[PRD.md](PRD.md) (what the product is).

Last verified against the codebase: **2026-08-15**.

---

## 0. How to read this

Every row names the exact env var the code reads, the file that reads it, and
**what actually happens when it is missing** — because in this codebase, missing
almost never means "crash". Most of these degrade to a mock or a fallback, which
is convenient in development and dangerous at launch: the feature looks like it
works.

| Status | Meaning |
| --- | --- |
| 🔴 **Blocks launch** | Real money, real identity, or the app is unusable without it |
| 🟠 **Degrades** | Feature runs on a mock or a fallback path; looks fine, isn't real |
| 🟢 **Optional** | Genuinely fine to leave unset |

---

## 1. 🔴 Blocks launch

### 1.1 Paystack — currently on TEST keys

| Var | Where | Now |
| --- | --- | --- |
| `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` | `src/services/paystack.ts` | `pk_test_…` |
| `PAYSTACK_SECRET_KEY` | `server/` | `sk_test_…` |

**Both keys in `.env` are test keys.** Every payment in the app today is a
sandbox transaction: cards are fake, no money moves, and settlements never
arrive. The QR half-fare flow, the ₦100 driver bonus and fuel-coin accrual all
run end to end against test money, so they will look correct in QA and move
nothing in production.

**What you must do**

1. Complete Paystack business verification (CAC document, bank account, BVN of a
   director). This is a review process, not instant — start it before you need it.
2. Once approved, take the **live** keys from Paystack → Settings → API Keys.
3. Put `sk_live_…` **server-side only**. It must never reach the bundle: anything
   prefixed `EXPO_PUBLIC_` is compiled into the app and readable by anyone who
   downloads it.
4. Set up the Paystack webhook to your server so payment confirmation does not
   depend on the phone staying online.

> **Security note.** `PAYSTACK_SECRET_KEY` currently sits in the same `.env` the
> Expo app loads. It is only read by `server/`, so it is not bundled today, but
> the moment someone adds `EXPO_PUBLIC_` to it by accident it ships to every
> device. Consider splitting into `.env` (app) and `.env.server` (server).

#### Payout accounts are blocked until Paystack is live

A driver cannot receive a fare until they have added a payout bank account, and
adding one calls Paystack's account-resolution endpoint to name-check the NUBAN.
That needs a live secret key on the server. So **until Paystack verification
completes, no driver can add a payout account, and scan-to-pay cannot be tested
end to end.**

Two things used to hide this. `resolveBankAccount` invented an account name from
a list of five made-up Nigerians whenever no server was configured, so the screen
looked like it worked; that is deleted. It now returns unresolved with a reason.

To test the flow before Paystack is live, set the flag in
**`constants/devFlags.ts`**:

```ts
export const ALLOW_UNVERIFIED_PAYOUT_ACCOUNT = true;   // testing
export const ALLOW_UNVERIFIED_PAYOUT_ACCOUNT = false;  // production  ← default
```

Reload the app afterwards (`r` in the Metro terminal). With it on, the driver
types the account name themselves, the Verify step disappears, and the screen
carries a permanent orange **TEST MODE** banner so an unverified account is never
mistaken for a verified one. It does **not** move money — Paystack still rejects
an account number that does not exist.

`assertProductionFlags()` throws at startup in a production build if any flag is
left on, so this cannot ship by accident.

### 1.2 Smile Identity (KYC) — currently MOCK

| Var | Where | Now |
| --- | --- | --- |
| `SMILE_PARTNER_ID` | `server/kyc.ts` | unset |
| `SMILE_API_KEY` | `server/kyc.ts` | unset |

`server/kyc.ts` logs *"No SMILE_PARTNER_ID/SMILE_API_KEY set — running in MOCK
mode"* and approves identities without checking anything. The OTP in mock mode is
the fixed string `123456` (`src/services/kyc.ts`, `DEV_OTP_CODE`).

This gates the loyalty/partner programme and payout eligibility, so in mock mode
**anyone can become a verified partner and attach a payout account.**

**What you must do**

1. Register at Smile Identity, get a partner ID and API key for the Nigeria
   NIN/BVN products.
2. Set both **server-side**.
3. Replace the mock bodies in `server/kyc.ts` (interfaces already match the live
   provider, so no UI changes are needed).
4. Move `IDENTITY_SALT` in `src/services/kyc.ts` out of the source file and into
   a server secret. It is currently a committed constant, which weakens the
   "one identity per account" hash it exists to protect.

### 1.3 Expo push notifications — needs a project ID and credentials

`src/services/notifications.ts:59` calls `getExpoPushTokenAsync()` **without a
`projectId`**. In Expo Go that resolves; in a dev or production build it can fail
to obtain a token, so push silently never arrives.

`app.json` already carries `extra.eas.projectId =
492934f4-8a6b-45de-9399-4d6687854411`, owner `stainles`.

**What you must do**

1. Pass the project ID explicitly:
   `getExpoPushTokenAsync({ projectId })`, read from
   `Constants.expoConfig.extra.eas.projectId`.
2. **iOS:** an Apple Developer account (99 USD/yr) and an APNs key uploaded to
   EAS. This is the same blocker as the dev build (see §4).
3. **Android:** an FCM server key in the Expo/EAS dashboard.

Until then push is dead in any build that is not Expo Go, and the
`/api/webhooks/scan-success` route that sends "your fare was paid" pushes has
nothing to deliver to.

---

## 2. 🟠 Degrades — feature runs, but on a fallback

### 2.1 Google Maps — route drawing

| Var | Where |
| --- | --- |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | `app/live-trip-code/[code].tsx:86` |

Unset. The screen already says so at line 1196: *"Add
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable route drawing."* Live trips still
track and show position; they just cannot draw the road-following polyline
between origin and destination.

**What you must do:** Google Cloud project → enable **Directions API** →
create an API key → **restrict it** by bundle ID (`com.teqil.app`) and to the
Directions API only. Billing must be enabled; there is a free monthly tier.

> **Not needed for finding nearby drivers or fuel.** Phase 7 shipped without any
> key: proximity search runs against your own `user_presence` rows exactly as
> Bolt does, and filling stations come from **Overpass** (OpenStreetMap), which
> is free, keyless and needs no billing account. Verified against Lagos — 17
> stations within 5 km. Directions is the *only* thing this key buys.

### 2.2 Feedback — no channel configured

| Var | Where |
| --- | --- |
| `EXPO_PUBLIC_FEEDBACK_ENDPOINT` | `src/services/feedback.ts:18` |
| `EXPO_PUBLIC_FEEDBACK_EMAIL` | `src/services/feedback.ts:19` |

Neither is set, so "Send Feedback" returns the error *"No feedback channel is
configured"* (line 108). Set **either**: an endpoint you own that accepts the
JSON payload, or an address, which falls back to the device mail composer.

### 2.3 Rate the app — store links dead

| Var | Where |
| --- | --- |
| `EXPO_PUBLIC_APP_STORE_ID` | `components/ios/RatingModal.tsx:55` |
| `EXPO_PUBLIC_ANDROID_PACKAGE` | `components/ios/RatingModal.tsx:56` |

Unset until the apps exist in the stores. `EXPO_PUBLIC_ANDROID_PACKAGE` you can
set today — it is `com.teqil.app`. `EXPO_PUBLIC_APP_STORE_ID` is the numeric ID
App Store Connect assigns after you create the app record.

### 2.4 Scan-success webhook

| Var | Where |
| --- | --- |
| `EXPO_PUBLIC_WEBHOOK_URL` | `app/(passenger)/verify-driver.tsx:137` |

Falls back to `http://localhost:5001/api/webhooks/scan-success`, which only
resolves on the machine running the server. On a real phone the call fails and
the driver never gets the "you were scanned" push. Point it at your deployed
server before any real-device testing.

### 2.5 `EXPO_PUBLIC_DOMAIN` — remote testers

Set, but note the constraint already in CLAUDE.md: a LAN-only value works only on
the local network. For remote testers use `npm run expo:remote`, which opens
Cloudflare tunnels for both Metro and the API (`brew install cloudflared`).

---

## 3. 🟢 Optional / development-only

| Var | Effect |
| --- | --- |
| `EXPO_PUBLIC_DEV_PREMIUM_TIER` | Forces a premium tier locally. **Remove before release** — it lets a build grant itself paid status. |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | Read by `services/*` (the microservices split). Not needed while the app talks to Supabase directly. If you ever set the service-role key, it is **full admin, bypasses all RLS** — server-side only, never in `EXPO_PUBLIC_`. |
| `EXPO_PUBLIC_API_URL`, `PORT`, `REPLIT_*` | Already set / infrastructure. |

---

## 4. Not a key — but it blocks the same things

### 4.1 Apple provisioning → the dev build

The app is on branch `sdk-54-temp`, a deliberate downgrade from SDK 57 so it runs
in **Expo Go** on a real iPhone while Apple provisioning is outstanding.

**Consequences today**

- No iOS 26 Liquid Glass. `expo-glass-effect` needs a dev build, so every glass
  surface renders on the `expo-blur` fallback path. The design is correct; it is
  simply not the real material.
- Push notifications cannot be fully tested (§1.3).

**What you must do:** enrol in the Apple Developer Program, then `eas build`.
Return to SDK 57 with `git checkout main && npm install`.

### 4.2 WhatsApp linking + two-way sync — cannot be done in app code alone

Requested, and worth being explicit about: **there is no way to read or send a
user's personal WhatsApp messages from an app.** WhatsApp has no client API, and
messages are end-to-end encrypted. What is achievable is the **WhatsApp Business
Platform (Cloud API)**, which is a different thing:

- You register a **business phone number** — messages come from EMILGO, not from
  the driver's own WhatsApp.
- Business-initiated messages must use **pre-approved templates**; free-form
  replies are only allowed inside a 24-hour customer service window.
- It is **metered per conversation**, so it is a running cost, not a one-off key.
- Sync requires a **public webhook endpoint** on your server to receive inbound
  messages — it cannot work phone-to-phone.

**What you must do if you want it**

1. Meta Business account + verified business.
2. WhatsApp Business Platform app → phone number → permanent access token.
3. Submit message templates for approval.
4. Host a webhook (`server/`) for inbound messages and wire it into
   `useMessagesStore`.

A far cheaper 80% of the value, with **no keys and no approval**: a "Continue on
WhatsApp" button using the `whatsapp://send?phone=…` deep link. It hands the
conversation off to WhatsApp; it does not sync back. Recommended first step.

### 4.3 Duplicate `DATABASE_URL`

`.env` defines `DATABASE_URL` **twice** (lines 5 and 11). The later one wins,
silently. Delete whichever is stale before it causes a confusing incident.

---

### 4.4 Ad inventory — the feature is built, the shelf is empty

`serve_feed_ads` and `next_ad` run a real auction over `public.ad_creatives`:
role targeting, weighting, per-creative frequency caps, partner budgets,
cooldowns and impression/click/dismiss events in `ad_events`. It is finished,
applied and covered by 27 passing tests.

It returns **nothing**, because that table has no rows. The feed shows no
promoted units and "Watch & earn" says there are no ads right now. Both are
correct.

Nothing was seeded on purpose: a fake advertiser in a production feed is
indistinguishable from a real one to a user, and the click-through would go
somewhere nobody agreed to.

**Two ways to fill it, and most apps run both:**

**a) Direct partners.** You sell a slot; you keep all of it. Needs a sales
motion. Enter them in-app: Settings → Ads → **Ad console**. Admin only, and the
flag can only be granted server-side —

```sql
UPDATE public.users SET is_admin = true WHERE username = '<you>';
```

Add a partner (name, CPM in naira per 1,000 impressions, budget), then an ad
against it. Serving stops automatically once spend reaches the budget.

**b) An ad network** — Google AdMob or Meta Audience Network. Inventory fills
instantly with no sales effort, but the network takes a cut, chooses the
creative, and needs an approved account plus native SDK configuration (a config
plugin and a rebuild — it will not work in Expo Go). This is the realistic
answer at scale, and it is additive: a network ad is just another row whose
media comes from an SDK.

**⚠️ Whichever you choose, read §4.6 first.** The reward defaults pay out more
than an ad currently earns.

### 4.5 Phone numbers — consented disclosure now, masking later

`get_contact_phone` hands over one number at a time, only between two people who
already share a conversation, only while the owner allows it, and never across a
block. That is the honest interim and it needs no key.

**Number masking** — a proxy that connects both parties without either seeing the
other's number — is the better answer and is what Bolt and Uber use. It needs a
telco account, a provisioned pool of numbers and per-minute billing, so it is a
business decision rather than a code one. Until then a driver's real number is
disclosed to passengers they are chatting with, which they consent to via the
switch in Account Settings → Phone number.

### 4.6 ⚠️ Rewarded-ad payouts are a growth subsidy, not a revenue share

**Read this before launching the rewards feature.** Rewarded-video eCPM in
Nigeria runs about **$0.50–$2.00 per 1,000 impressions** — at ₦1,500/$ that is
**₦0.75–₦3.00 of gross revenue per ad watched.**

The seeded defaults pay **₦8.00 per rewarded ad** plus a daily ladder worth
₦110 for a full clear. At those numbers every ad watched **costs ₦5–7 more than
it earns**, and 10,000 daily active users clearing the quota burns roughly
**₦2–3.5 million per month**.

That may well be the right call for launch — paying users to form a habit is a
normal acquisition cost, and it is cheaper than most referral schemes. But it
must be a decision, not an accident.

Nothing in the app hard-codes a reward. Every value is one row:

```sql
SELECT * FROM public.ad_reward_config;

UPDATE public.ad_reward_config
   SET rewarded_credits = 2.00,          -- at/below real eCPM
       daily_milestones = '[{"at":1,"naira":2,"label":"First watch"},
                            {"at":5,"naira":10,"label":"Daily goal"}]'::JSONB,
       max_ads_per_day  = 12;
```

Changes take effect on the next screen load — no deploy, no app update. Watch
`ad_sessions` and `ad_events` for the real completion and click rates before
settling on numbers.

### 4.7 🔴 AdMob — WHAT YOU MUST DO FOR ADS TO SHOW

The SDK is integrated, initialised at launch, preloaded, and wired into the
rewards player. It is currently pointed at **Google's official TEST ad units**,
which serve real test ads so the whole flow can be exercised before any account
exists. Test ads earn **nothing**.

Everything below is on you. None of it can be done from code.

**Step 1 — Create an AdMob account** (~10 min, needs a Google account)
  1. Go to https://admob.google.com and sign up.
  2. Add your payment profile and your Nigerian bank details. Google pays by
     wire once you pass the $100 threshold, and will not serve paid ads until a
     payment profile exists.

**Step 2 — Register the app** (~5 min)
  3. Apps → Add app. Choose "No, it is not on a store yet" for now; register it
     properly once it is live on the App Store and Play, because the store
     listing is what unlocks better fill.
  4. Do this TWICE — iOS and Android are separate apps in AdMob with separate
     IDs. Copy both **App IDs**; they look like `ca-app-pub-1234…~5678…` (note
     the tilde).

**Step 3 — Create ad units** (~5 min)
  5. For each app: Ad units → Add ad unit → **Rewarded**. Name it
     `emilgo-rewarded`. Copy the **Ad unit ID** — `ca-app-pub-1234…/9876…`
     (a slash, not a tilde). These are different from App IDs; mixing them up
     is the single most common cause of "ads never load".
  6. Optionally add an **Interstitial** unit the same way.

**Step 4 — Put them in the app**
  7. `app.json` → `plugins` → `react-native-google-mobile-ads`: replace
     `androidAppId` and `iosAppId` with your two App IDs.
  8. `.env` — these are public identifiers, so `EXPO_PUBLIC_` is correct here in
     a way it is never correct for a secret:

     ```
     EXPO_PUBLIC_ADMOB_IOS_REWARDED=ca-app-pub-…/…
     EXPO_PUBLIC_ADMOB_ANDROID_REWARDED=ca-app-pub-…/…
     EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL=ca-app-pub-…/…
     EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL=ca-app-pub-…/…
     ```

**Step 5 — Build a dev client. THIS IS NOT OPTIONAL.**
  9. AdMob is a native module. **It does not exist in Expo Go**, and the app is
     written to detect that and skip the network rather than crash — so in Expo
     Go you will see "no ads right now" forever, no matter what you configure.

     ```bash
     npx expo prebuild --clean
     npx eas build --profile development --platform ios
     ```

     This needs the Apple Developer Program membership already tracked in §4.1.

**Step 6 — `app-ads.txt`** (skippable at first, costs you money if skipped)
  10. AdMob → Apps → app-ads.txt. Publish the line it gives you at
      `https://<your-domain>/app-ads.txt`. Without it many buyers will not bid,
      and your eCPM is materially lower. It needs the domain listed on your
      store page.

**Step 7 — Wait for review.** New AdMob accounts sit in review, typically a few
days. Until then real units return no-fill and the app falls back to the empty
state, which is correct.

**⚠️ Never tap your own live ads.** Google treats it as click fraud and bans the
account, and there is effectively no appeal. This is why the code defaults to
test units — see `isUsingTestUnits()` in `src/services/admob.ts`.

#### What about Meta, and the others?

Meta Audience Network is not usable unaided: it requires an approved Business
account and has not accepted new publishers in many markets since 2022. The
right way to add it — and AppLovin, Unity, and the rest — is **AdMob
Mediation**, configured in the AdMob dashboard. It needs no second SDK and no
code change here. Do that once AdMob itself is filling.

### 4.8 Reddit in the feed (optional, free)

RSS needs nothing and is already live — four Nigerian newsrooms are seeded and
verified. Reddit is the one extra source that can be switched on for free:

  1. https://www.reddit.com/prefs/apps → "create another app…"
  2. Type: **script**. Redirect URI: `http://localhost` (unused by this flow).
  3. Copy the client ID (under the app name) and the secret into `.env`:

     ```
     EXPO_PUBLIC_REDDIT_CLIENT_ID=…
     EXPO_PUBLIC_REDDIT_CLIENT_SECRET=…
     ```

  4. Add subreddits as sources (admin, in SQL for now):

     ```sql
     INSERT INTO public.feed_sources (kind, name, url, category, weight)
     VALUES ('reddit', 'r/Nigeria', 'Nigeria', 'community', 2);
     ```

The old keyless `reddit.com/r/x.json` endpoint now returns 403 to datacenter
traffic, which is why the OAuth app is required. Without both variables the
Reddit source is skipped silently — never faked.

**Twitter/X, Instagram and Facebook cannot be added.** X has had no free read
tier since 2023 (~$100/month minimum). Instagram and Facebook Graph return only
media on accounts you own and have connected — there is no "posts from
Instagram" endpoint for anyone. Scraping breaches their terms and gets the app's
IP ranges blocked. This is a platform limitation, not missing work.

---

## 5. Quick checklist

Copy into an issue and work down it.

- [ ] **Apply `supabase/migrations/migration_contact_phone.sql`** — nothing about
      calling a contact works until it lands
- [ ] **`constants/devFlags.ts` — every flag `false` before release**
- [ ] Paystack business verification → live keys, secret server-side only
- [ ] Paystack webhook endpoint deployed
- [ ] Smile Identity partner ID + API key; replace mock bodies in `server/kyc.ts`
- [ ] Move `IDENTITY_SALT` to a server secret
- [ ] Apple Developer Program → APNs key → EAS dev build
- [ ] FCM server key for Android push
- [ ] Pass `projectId` to `getExpoPushTokenAsync`
- [ ] Google Directions API key, restricted to `com.teqil.app`
- [ ] `EXPO_PUBLIC_WEBHOOK_URL` → deployed server
- [ ] Feedback endpoint **or** email
- [ ] `EXPO_PUBLIC_ANDROID_PACKAGE=com.teqil.app` (can do now)
- [ ] `EXPO_PUBLIC_APP_STORE_ID` after the App Store record exists
- [ ] Remove `EXPO_PUBLIC_DEV_PREMIUM_TIER` before release
- [ ] De-duplicate `DATABASE_URL`
- [ ] Decide on WhatsApp: deep link (free) vs Business Platform (metered)
- [ ] Turn on **leaked-password protection** in Supabase → Auth (one toggle)
- [ ] Insert real `ad_creatives` rows, or accept a feed and rewards screen with
      no ads (§4.4)
- [ ] **Decide the rewarded-ad payout rate before launch** — the defaults lose
      ₦5–7 per ad on purpose (§4.6)
- [ ] Apply `supabase/migrations/migration_ad_rewards.sql`
- [ ] Decide on number masking vs consented disclosure (§4.5)
- [ ] Harden the ~20 pre-existing functions with a mutable `search_path`, and the
      `SECURITY DEFINER` view `v_active_park_trips` — run Supabase's advisor and
      work the list (the Phase 6/7 functions are already done, see
      `migration_harden_definer.sql`)
