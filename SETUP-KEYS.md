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

> **Not needed for finding nearby drivers.** Proximity search (Phase 7) runs
> against your own Supabase rows, exactly as Bolt does — no third-party key.
> Filling-station lookup uses **Overpass**, which is free and keyless.

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

## 5. Quick checklist

Copy into an issue and work down it.

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
