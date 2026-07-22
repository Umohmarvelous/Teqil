# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EMILGO (internally "Teqil") — a React Native / Expo app for Nigerian commercial transport, connecting drivers, passengers, and park owners for live-tracked trips, fare payment, and driver earnings ("fuel coins"). GitHub remote: `https://github.com/Umohmarvelous/Teqil.git`.

## Commands

```bash
npx expo start                 # start Metro (dev client / Expo Go)
npm run expo:dev                # start Metro wired for Replit's proxy domain
npm run expo:remote             # tunnel Metro + API via Cloudflare for remote testers (see below)
npm run server:dev              # run the Express API alone (tsx server/index.ts), port 5000
npm run server:build            # bundle server for prod (esbuild -> server_dist/)
npm run server:prod             # run the built server
npm run lint                    # npx expo lint
npm run lint:fix
```

There is no test suite configured in this repo currently.

### Remote testing workflow

Expo's `--tunnel` (ngrok) is unreliable on this machine. Use `npm run expo:remote` instead — it starts the Express API, opens Cloudflare quick tunnels for both Metro and the API, and launches Expo pointed at the tunnel domain. Remote testers should use Expo Go with the printed QR code, not a LAN-only dev URL. Requires `cloudflared` (`brew install cloudflared`).

`EXPO_PUBLIC_DOMAIN` must point to a host reachable by the tester — LAN-only values only work on the local network.

## Architecture

### Two backends exist; only one is wired up

- **`server/` (active, port 5000)** — a small Express app that serves the Expo static web build / manifest and exposes just two routes today (`server/routes.ts`): `/api/health` and `/api/webhooks/scan-success` (Expo push notifications). This is the only server the mobile app currently reaches over HTTP.
- **`services/` + `gateway/` + `docker-compose.yml` (not yet integrated)** — a microservices split (`auth-service`, `trip-service`, `payment-service`, `engagement-service`, `ad-analytics-service`, `notification-service`, `credits-service`), each written in a DDD-ish layered style (`domain/`, `application/`, `infrastructure/`, `interfaces/`) and fronted by an nginx gateway (`gateway/nginx.conf`) that proxies `/api/<service>/` paths. This stack is defined and buildable via Docker Compose but the Expo app does not call it — the app talks to Supabase directly instead. Treat this as in-progress backend work, not the live API surface.

The mobile app itself does **not** go through either backend for auth/data — it talks straight to Supabase via `src/services/supabase.ts` (`@supabase/supabase-js`), using `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

### Offline-first data flow

Local persistence is AsyncStorage-backed (`src/services/storage.ts`); Supabase is the cloud sync target, not the source of truth for reads. `src/services/sync.ts` implements the sync strategy explicitly:
- **Push**: local records with `synced = false` are upserted to Supabase, then marked synced.
- **Pull**: remote records relevant to the current user are merged into local storage using last-write-wins on `updated_at` (remote wins ties).
- Sync is triggered from `app/_layout.tsx` (initial sync on user change, connectivity-change listener, manual retry from `NetworkBanner`) — it's plain functions with no React dependency, wired to the React lifecycle only at the call site.

### Routing (expo-router, file-based)

Route groups under `app/` map to the three user roles plus shared/auth flows:
- `(auth)/` — welcome/role-select, login, register, driver-profile completion (modal presentation, slide-from-bottom)
- `(main)/` — shared tab shell (home, discover, feed, messages, profile, settings)
- `(driver)/` — driver dashboard, create-trip, history, messages, qr-receive
- `(passenger)/` — find-trip, live-trip, pay-fare/payment/scan-pay, verify-driver, saved-routes, history
- `(park-owner)/` — dashboard, driver management, alerts
- `live-trip-code/[code].tsx`, `direct-chat/[conversationId].tsx`, `rating.tsx` — top-level dynamic/modal routes outside the tab groups

`app/_layout.tsx` is the composition root: fonts (Poppins), Supabase auth-state subscription (drives `useAuthStore`), i18n language sync, push-token registration, connectivity-triggered sync, and the custom animated splash (`EmilgoSplash`) gating first paint.

### State

Zustand stores in `src/store/` (persisted to AsyncStorage where noted):
- `useStore.ts` — `useAuthStore` (user/session/role/language, persisted) and `useTripStore` (live trip tracking: location, earnings, elapsed time, route coordinates — not persisted, reset per trip)
- `useSettingsStore.ts` — theme, synced against system color scheme via a `ThemeSync` component in the root layout
- `useMessagesStore.ts`, `useCreditsStore.ts`

Server data fetching uses TanStack Query (`lib/query-client.ts`); most domain state still flows through Zustand + the offline sync layer above rather than React Query.

### Directory split: `app/`, `components/`, `src/`

- `app/` — routes only (expo-router convention).
- `components/` — shared UI components used across route groups (note: `components/Sidedbar.tsx` is a typo'd filename, kept as-is — don't "fix" it without checking all imports).
- `src/` — everything else non-route: `services/` (Supabase, auth, sync, storage, paystack, notifications, AI, location tracking), `store/` (Zustand), `models/types.ts` (domain types shared across stores/services), `i18n/` (English + Nigerian Pidgin via i18next/react-i18next), `hooks/`, `navigation/`, `db/` (currently unused/empty), `components/` (layout-level components like `SessionTimeout`, `FloatingCreditAnimation` used only from `app/_layout.tsx`).

Path alias `@/*` maps to the repo root (`tsconfig.json`), so both `@/components/...` and `@/src/...` style imports are valid; existing code mixes `@/` and relative `../src/...` imports — follow whatever the file you're editing already uses.

### Design system

Colors live in `constants/colors.ts` (`Colors.primary` = Nigerian green `#009A43`, `Colors.gold` = `#F5A623` for earnings/coin UI). Font is Poppins (400/500/600/700, loaded in root layout). Currency is Naira (₦).

## Notes from prior sessions

- When fixing errors, patch the files named in the request first, then only closely related files in the same navigation/sidebar flow — not unrelated repo-wide TypeScript errors, unless asked to continue.
- The Discover tab should show skeleton placeholders while loading via `FeedSkeletonList` from `components/ShimmerSkeleton.tsx`.
