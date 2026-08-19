# EMILGO — Session Handoff

> **Read [PRD.md](PRD.md) first** for what the product is and how the codebase is
> organised. This file is the working state: what just got built, what is left,
> and the traps that will cost you an hour if you rediscover them the hard way.
>
> **Anything that needs a key, an account or a business verification before it
> genuinely works is in [SETUP-KEYS.md](SETUP-KEYS.md).** Most of those features
> degrade to a mock rather than failing, so they look finished and are not —
> payments and KYC especially.
>
> Updated 2026-08-19. Branch **`sdk-54-temp`**, HEAD **`35c0b3d`**, tree clean.
> Typecheck: **0 errors**. Metro serves the real bundle: **HTTP 200, 30.3 MB dev**.
> App **boots on simulator and device**.
>
> ⚠️ **TWO migrations are written but NOT applied** — `migration_contact_phone.sql`
> and `migration_ad_rewards.sql`. The database has been unreachable
> (`ETIMEDOUT` on every attempt) across two sessions. Until they are applied the
> Call button, the phone row in Account Settings and the whole Rewards feature
> degrade to empty states rather than crashing — see §6b.
>
> ⚠️ **Before launching rewards, read SETUP-KEYS §4.6.** The seeded payouts lose
> ₦5–7 per ad watched on purpose. It is a growth subsidy, and it is one
> `UPDATE` away from being anything else.

---

## 0. Task ledger

Everything asked for, and where it stands. Ordered by area, not by date.

**Start here after a compaction:** §0 is the whole picture; §7 is the exact next
actions in priority order.

### Done

| # | Task | Notes |
| --- | --- | --- |
| 1 | Liquid Glass kit across all iOS kit components, with blur fallback | 4 rendering paths; `/ui-kit` shows which one the device is on |
| 2 | Settings redesigned to the app's original look; no coloured icon tiles | Glass tiles + tinted glyphs only |
| 3 | SDK 57 → 54 temporary downgrade | Branch `sdk-54-temp`; zero app-code changes needed |
| 4 | `animated-opacity-over-GlassView` defect fixed in 6 kit components | Was 5 by the original count; RatingModal found while auditing |
| 5 | npm `ETARGET` diagnosed — stale cache, not a dep conflict | `npm cache clean --force`; `--prefer-online` is insufficient |
| 6 | Dead commented-out code deleted; `direct-chat` rebuilt | 84 lines there, later 929 more in `useMessagesStore` |
| 7 | **Phase 1a/b/c** — every eligible screen on collapsible headers | ~21 converted, ~15 deliberately excluded (§3) |
| 8 | Phase 1c — profile picture *travels* into the bar | Continuous transform, not a cross-fade |
| 9 | **Phase 2** — content scrolls behind the translucent tab bar | Content insets, never frame padding |
| 10 | **Phase 3** — network indicator replaced the full-width banner | Centred in the header on every screen |
| 11 | **Phase 4** — profile: three swipeable tabs *inside* `profile.tsx` | Profile / Account Settings / Activity |
| 12 | **Phase 5** — Notification tab took the Settings tab slot | |
| 13 | Profile redesign: capsule segmented control, pinned bar, full-screen search | Search indexes all three panes at once |
| 14 | Profile header copy icon fixed | Had `hitSlop={912}` — a target larger than the screen — and copied the wrong field |
| 15 | **Phase 6** — followers/following, migration applied and verified | Table, indexes, trigger, counters, RLS + 3 policies, 5 `SECURITY DEFINER` RPCs |
| 16 | **Dark Mode switch fixed** | `ThemeSync` was overwriting the user's choice every render — see §5 |
| 17 | Notifications are persisted records, not a projection | Makes delete, mark-all-read and dismissal survive restarts |
| 18 | `SwipeableRow` — WhatsApp/Mail swipe-to-delete in the kit | Spring back / rest open / full-swipe commit |
| 19 | Home header bell + avatar are real controls | Bell → Notifications with badge; avatar → glass account menu |
| 20 | Multi-account: add and switch, Keychain-backed | `switchAccount` replaces the Supabase session |
| 21 | `IOSBadge` — one badge component, one unread source | Tab bar + bell agree by construction |
| 22 | **Phase 7** — proximity: nearby people, Fastest Finger, filling stations | Migration applied + verified; **no API key needed** |
| 23 | SECURITY: pinned `search_path` and revoked `anon` EXECUTE on all Phase 6/7 RPCs | Found by Supabase's advisor — both were real |
| 24 | **App boots again** — `createScreenFactory is not a function` fixed | Two `@react-navigation/native` copies; see §5 |
| 25 | Startup dep errors — missing `expo-asset` peer, duplicated native module | `expo-doctor` found both; fixed with bun |
| 26 | **Voice notes work** — migrated off the dead expo-av stub to `expo-audio` | Record, send, and a real player with play/pause + progress |
| 27 | **Messaging works between two accounts** — verified e2e under RLS | Three DB faults fixed; see §8 |
| 28 | Chat by `@username` or `DRV-A1B2C3`, with debounced type-ahead | `find_user_for_chat` / `search_users_for_chat` RPCs |
| 29 | Home top tabs use the glass capsule control | Same `IOSSegmentedTabs variant="capsule"` as Profile |
| 30 | Bottom tab bar hidden inside a chat | `MessagesTab` reports `onChatOpenChange` up to the layout |
| 31 | Profile shows the username under the name, for every role | Its own chip; driver ID is a separate chip |
| 32 | **Metro "cannot resolve empty-module.js" boot failure** | Stale `$TMPDIR/metro-cache` pointing at a nested `metro-runtime` that no longer exists. See Trap 0d |
| 33 | **Social feed — full schema** | `migration_social_feed.sql`, 39 functions, applied + 28/29 e2e checks under RLS |
| 34 | Feed service + normalised store | `src/services/feed.ts`, `src/store/useFeedStore.ts` |
| 35 | Feed UI kit | `PostCard`, `PostMedia`, `PostPoll`, `PostText`, `PromotedPost`, `FeedList` |
| 36 | For You screen rebuilt as a real social feed | Was a news reader hitting `/api/feed` |
| 37 | Twitter-style thread screen | `app/post/[id].tsx` |
| 38 | Composer — media, poll, place, reply, quote, edit | `app/compose.tsx`; draft persisted, timelines are not |
| 39 | `/search`, `/hashtag/[tag]`, `/bookmarks`, `/u/[handle]` | Handle route redirects to the id-keyed profile |
| 40 | Reusable `HeaderActions` (bell + badge, overflow menu) | Wired into the shell and every feed route |
| 41 | Reusable `ScreenSearch` + real search on Notifications | Searches what the screen holds, not the server |
| 42 | Follow buttons on cards, thread, search and suggestions | `applyFollow` keeps every cached post in step |
| 43 | Phone capture + on-demand Call in chat | `PhoneNumberSheet`, `get_contact_phone`. **Needs the migration** |
| 44 | Payout bypass flag for scan-to-pay testing | `constants/devFlags.ts`; fake bank names deleted |
| 45 | Realtime delivers the FIRST message of a new chat | It used to drop it, so a new chat needed a refresh |
| 46 | Driver inbox shows real conversations | It listed only park broadcasts while promising chats |
| 47 | **Post-registration provisioning screen** | `app/(auth)/provisioning.tsx`. Five REAL steps that can each fail, not a fake bar; register.tsx forwards here |
| 48 | **Rewarded-ads system — schema** | `migration_ad_rewards.sql`. Daily milestone ladder, streak w/ monthly freezes, per-creative frequency caps, server-clock anti-fraud |
| 49 | Ads service + store | `src/services/ads.ts`, `src/store/useAdsStore.ts`. Credits the fuel pool via the long-stubbed `addAdRevenue`, deduped on session id |
| 50 | Rewards hub | `app/rewards/index.tsx` — streak, ladder, 7-day chart, full history incl. watches that earned nothing and why |
| 51 | Ad player | `app/rewards/watch.tsx` — countdown, forfeit warning naming the amount, reaction/report, reward breakdown, install post-roll |
| 52 | Ad components | `AdMilestoneTrack`, `AdTrackerSheet`, `AdInstallCard` — modelled on the TeraBox / OKash references |
| 53 | Animated floating ad button | `AdFloatingButton` on Home. Idle float + periodic attention beat; goes quiet at the daily cap. Transform-only (glass) |
| 54 | Ads settings | `app/settings/ads.tsx` + a new `ads` section in the settings index and search |
| 55 | Chat screen on the glass kit | Header floats so messages scroll under it; composer glassed; unread rows read as unread; misleading "online" dot removed |

### Not started

| # | Task | Blocked by |
| --- | --- | --- |
| 56 | **Apply BOTH outstanding migrations** (`contact_phone`, `ad_rewards`) | The database has been unreachable for two sessions. Highest priority — see §7 |
| 57 | **Verify chat on device between two real accounts** | Nothing. DB is proven, the React layer is not |
| 58 | **Verify the feed on device with two real accounts** | Nothing. Same gap: 28/29 DB checks pass, the UI is untested against real traffic |
| 59 | Per-contact conversation records in Activity | Depends on the chat list settling |
| 60 | Messages — WhatsApp linking + two-way sync | **Meta Business API + hosted webhook.** Not possible in app code alone — SETUP-KEYS §4.2 |
| 61 | Same header controls in `messages.tsx` and `profile.tsx` | Nothing; `AccountMenu` is ready to drop in |
| 62 | Auth gating — no feature usable unless authenticated | Nothing |
| 63 | Offline-first audit across every feature | Nothing |
| 64 | Error-control components (boundaries, retry, failure states) | Nothing |
| 65 | **Phase 8** — watermark overlay + shareable profile deep link | Rating modal already ships |
| 66 | Verify account switching against two real accounts | Needs two test accounts on one device |
| 67 | Ad creatives — there are none | An advertiser and a creative. `serve_feed_ads` returns nothing until `ad_creatives` has rows; the feed simply shows no promoted units, which is correct |
| 68 | **Verify the rewards flow end to end on device** | Needs the migration applied AND at least one `format='rewarded'` creative in `ad_creatives` |
| 69 | Streak reminder notifications are a preference with no sender | `reminder_enabled`/`reminder_hour` are stored and honoured by nothing yet — needs a scheduled job or a local notification on app open |
| 70 | `wifi_only_video` is stored but not enforced in the player | The player does not yet check connection type before starting a video ad |
| 71 | `autoplay_next` is stored but not wired | The player's "Watch another" is manual only |
| 72 | Ad mediation (AdMob / AppLovin / Meta) instead of a hand-filled table | An account and app review per network — SETUP-KEYS §4.4 |
| 73 | Number masking instead of raw phone disclosure | A telco account + per-minute billing. SETUP-KEYS |

### Carrying debt

- **`app/(main)/messages.tsx` is 1,400+ lines** and holds the chat list, the chat
  screen, the new-chat modal and the contact sheet. `ChatScreen` and
  `MessageBubble` are exported from it because `direct-chat/[conversationId].tsx`
  reuses them. Splitting it is worthwhile but touches both routes.
- **Three legacy messaging tables remain**, renamed not dropped:
  `messages_legacy_chats`, `chats`, and `message` (singular, its blocking FK
  dropped). All empty. Drop them once the new schema has run in production for a
  while — dropping a table is not reversible.
- `src/services/auth.ts` still has a ~330-line commented-out block at the top.
- `src/services/ai.ts` is a keyword-matching mock, not a model.
- `src/services/kyc.ts` `IDENTITY_SALT` is a committed constant — should be a
  server secret (SETUP-KEYS §1.2).
- `.env` defines `DATABASE_URL` twice.
- **~20 pre-existing functions still have a mutable `search_path`**, and
  `v_active_park_trips` is a `SECURITY DEFINER` view (advisor ERROR). Only the
  Phase 6/7 functions were hardened — the rest predate this session and were left
  alone rather than touched blind. Run `get_advisors` before launch.
- `auth_leaked_password_protection` is off in Supabase Auth settings — one
  toggle, worth turning on.

---

## 6b. Migration status

Applied to the live project (`orygxuxgjmhamcisjkfu`, "Teq_database") **this
session**, each verified afterwards:

| Migration | Applied | What it did |
| --- | --- | --- |
| `migration_follows.sql` | ✅ 2026-08-15 | Phase 6 social graph |
| `migration_proximity.sql` | ✅ 2026-08-15 | Phase 7 presence + Fastest Finger |
| `migration_harden_definer.sql` | ✅ 2026-08-15 | Pinned `search_path`, revoked `anon` on Phase 6/7 RPCs |
| `migration_chat_handles.sql` | ✅ 2026-08-16 | `find_user_for_chat`, `search_users_for_chat` |
| `migration_messaging.sql` | ✅ 2026-08-16 | Conversation/message RLS + the correct schema |
| `migration_social_feed.sql` | ✅ 2026-08-17 | The whole feed: 12 tables, 39 functions, `post-media` bucket + policies |
| `migration_contact_phone.sql` | ❌ **NOT APPLIED** | `share_phone` column, `get_contact_phone`, `set_my_phone`, `get_my_phone`, E.164 normalisation |
| `migration_ad_rewards.sql` | ❌ **NOT APPLIED** | `ad_reward_config`, `ad_sessions`, `ad_daily_progress`, `ad_streaks`, `ad_preferences`, `ad_suppressions`, `ad_reports`; extends `ad_creatives` with format/duration/app-install columns |

All are **idempotent** — re-running is safe. The older migrations in that folder
predate this session; their status is unknown, so verify rather than assume.

To apply one by hand, the Supabase MCP (`apply_migration`) works, or connect
directly: `DATABASE_URL` on **port 5432** (session mode). Port 6543 is the
transaction pooler and is a poor fit for multi-statement DDL.

**Two are outstanding.** Apply them in this order — the ads migration ALTERs
`ad_creatives`, which `migration_social_feed.sql` created:

```bash
node ./.dbq.mjs -f supabase/migrations/migration_contact_phone.sql
node ./.dbq.mjs -f supabase/migrations/migration_ad_rewards.sql
```

Neither has ever run, so neither is verified. Both are idempotent and both
should be followed by an e2e check under RLS (see §8 for the harness shape).

Until it lands, `get_contact_phone` does not exist, so `getContactPhone()`
logs a warning and returns null; the Call button says the number is not
available and the Account Settings phone row shows the placeholder. Nothing
crashes — but nobody can call anybody.

---

## 7. Next actions, in order

Do these top-down. Each is independent unless stated.

1. **Apply the two outstanding migrations** (§6b), contact_phone first, then
   ad_rewards. Everything about calling a contact AND the entire rewards feature
   is written and typechecked and does nothing until they land. They were not
   applied only because the database has been unreachable — `ETIMEDOUT` on every
   attempt across two sessions. Neither has ever run, so verify rather than
   assume once they do.

1b. **Seed at least one rewarded creative**, or the Rewards screen correctly but
   unhelpfully shows "No ads right now":

   ```sql
   INSERT INTO public.ad_creatives
     (advertiser_name, headline, body, cta_url, format, duration_seconds,
      media_url, media_type, category, skip_after_seconds)
   VALUES
     ('<real advertiser>', '<headline>', '<body>', '<destination>',
      'rewarded', 15, '<video or image url>', 'video', 'finance', 5);
   ```

   Nothing was seeded automatically — see the note in SETUP-KEYS §4.4 on why a
   fake advertiser must never ship.
2. **Verify chat on a device between two real accounts.** The database and RLS
   are proven (§8), the React layer is not. Sign in as a passenger on one
   device, a driver on another, search the driver by `@username`, send both
   ways, send a voice note, then tap Call. This is the highest-value 15 minutes
   available.
3. **Verify the feed on a device with two real accounts.** Post with an image,
   reply from the other account, check the reply count moves on the first
   device without a refresh, like from the thread and confirm the timeline row
   agrees. 28 of 29 database checks pass; none of them exercise React.
4. **Re-create the feed e2e harness.** It lived in a scratchpad and did not
   survive the session. Worth rebuilding under `supabase/tests/` so it is not
   lost a third time — it is the only thing that proves RLS is right, and a
   test run as `postgres` proves nothing because superuser bypasses RLS.
5. **Per-contact conversation records in Activity** — one entry per person
   chatted with, not per message.
6. **Auth gating**, then the **offline/error-control audit**.
7. **Phase 8** — watermark overlay + shareable profile deep link.

### Before any release

- `constants/devFlags.ts` — **every flag must be `false`**.
  `assertProductionFlags()` throws in a production build if one is left on, but
  check it rather than relying on the crash.
- Run `get_advisors` — ~20 pre-existing functions still have a mutable
  `search_path` (see Carrying debt).

---

## 8. Messaging — what was wrong, and how it was proven

Chat had **never** worked between two accounts. It looked fine because the app
is offline-first: every write landed in AsyncStorage and every cloud write
failed silently.

### The three database faults

1. **`conversations` had RLS enabled and ZERO policies.** That denies everything.
   No account could read or write it, ever.
2. **`messages` was a different table than the app writes.** It had
   `(chat_id, sender_id, text, status)` with an FK to `chats`, against an app
   writing `conversation_id, sender_name, sender_role, audio_uri, read`. There
   was **no `audio_uri` column at all**, so voice notes could never have synced.
   The database held **three** overlapping messaging designs, all empty, none
   reachable: `chats`+`messages`, `message` (singular), and `conversations`.
3. **Conversation ids were typed `uuid`.** The app derives
   `direct_<uuid>_<uuid>` so both devices compute the same id with no
   coordination — deliberate and worth keeping — but that is not a UUID, so
   every insert would have been rejected as malformed even once policies
   existed. `generateId()` (`Date.now()+random`) has the same shape problem for
   message ids. Both columns are `TEXT` now.

### The symmetry bug — why drivers saw nothing

A conversation row described only `participant_*` plus a bare `passenger_id`,
and the client **always** rendered `participant_*` as "the other person". So the
recipient opened their inbox and saw a chat **with themselves** — their own name
and photo.

Rows now describe both sides (`passenger_name`, `passenger_username`,
`passenger_photo`, `participant_username`), and `conversationForViewer(row,
viewerId)` picks whichever side is not the viewer. **Anywhere you turn a stored
row into a `Conversation`, use that helper** — there were two such places and
only fixing one leaves the bug half-present.

### How it was verified

`migration_messaging.sql` is applied. Verification ran as **two distinct
authenticated users with RLS enforced** — not as admin, which would bypass the
thing being tested — using
`set_config('request.jwt.claims', …)` + `SET LOCAL ROLE authenticated`, inside a
transaction that was rolled back:

```
1. A created the conversation                 OK
2. A sent a text message                      OK
3. B sees the conversation                    OK
4. B can read A's message                     OK
5. From B's view the other person is A        OK
6. B replied                                  OK
7. B sent a VOICE NOTE (audio_uri)            OK
8. A sees the full thread (3 msgs)            OK
9. Outsider sees 0 messages, 0 conversations  OK
10. Outsider cannot forge a message           OK
```

To re-run it after a schema change, that harness is worth rebuilding — a test
run as `postgres` proves nothing, because the superuser bypasses RLS.

### Handle lookup

`find_user_for_chat(handle)` resolves `@username` or `DRV-A1B2C3`;
`search_users_for_chat(q)` powers the type-ahead. Both are `SECURITY DEFINER`
with a pinned `search_path` and `anon` revoked, and they return **display-safe
columns only** — no phone, email, or payout data. That select list IS the access
control.

Search is **prefix-matched, not substring**. Substring search over a user table
lets two characters enumerate the userbase; prefix matching is what a handle
lookup actually needs.

---

## Phase 7 — how proximity works

Three features, two data sources, **no API key** (this is the part that is easy
to get wrong and expensive to get wrong).

- **Nearby people is not a maps question.** Drivers are rows in our own
  `user_presence` table with a lat/lng, so it is a radius query against our own
  database — the same way Bolt queries its own fleet. A maps provider is only
  needed to *draw a route*, which is separate and optional.
- **Filling stations** come from OpenStreetMap's Overpass API: free, keyless, no
  billing account. Verified against Lagos — 17 stations within 5 km.
  **14 of those 17 are `way` elements, not `node`s**, so a query that asks only
  for nodes silently misses ~80% of stations. That is why the query asks for both
  and uses `out center`.
- **No PostGIS.** A bounding-box prefilter on a btree index followed by an exact
  haversine gives the same answer at this scale without an extension to enable or
  a geography column to maintain. The prefilter is what makes it fast; the
  trigonometry then runs over tens of rows. Migration path if the fleet outgrows
  it is additive.
- **The Fastest Finger race is resolved in SQL**, by a single `UPDATE` with the
  seat guard in its `WHERE`. Read-compare-write would lose updates, and this
  feature is *designed* to make people tap simultaneously, so it would happen
  constantly rather than rarely.
- **Presence piggybacks on the location tracker's existing throttle** rather than
  running its own timer: the tracker already has a fresh fix and already honours
  `shareLocation` and `dataSaver`. A second GPS consumer would double the battery
  cost and could publish a position the user had just opted out of.

---

## 1. Where things stand right now

### Branch situation — READ THIS FIRST
Working branch is **`sdk-54-temp`**, a deliberate temporary downgrade from SDK 57
to SDK 54 so the app runs in Expo Go on a real iPhone while the dev build is
blocked on Apple provisioning. `main` is still on SDK 57.

- Return with `git checkout main && npm install`.
- On SDK 54: `expo-status-bar` must NOT be in `app.json` `plugins` (no config
  plugin before 57), and `babel-preset-expo` must be declared explicitly in
  devDependencies (it installs nested, not hoisted).
- `expo-glass-effect` 0.1.10 (SDK 54) and 57.0.1 have **identical APIs**, so the
  whole iOS kit compiles on both. Nothing had to change.
- **You will NOT see real Liquid Glass in Expo Go.** It needs iOS 26 *and* the
  native module in the binary. Expo Go shows the `expo-blur` fallback. That is
  correct behaviour, not a bug. Seeing real glass requires a dev build.

### Uncommitted work in the tree
These are the user's own edits plus in-flight kit changes. Check before assuming
they're yours:

```
app/(driver)/create-trip.tsx      app/(main)/messages.tsx
app/(driver)/payout-bank.tsx      app/(main)/notifications.tsx
app/(driver)/qr-receive.tsx       app/(passenger)/scan-pay.tsx
app/(main)/_layout.tsx            components/ActionTile.tsx
app/(main)/home.tsx               components/Sidedbar.tsx
app/(main)/index.tsx              components/ios/CollapsibleHeader.tsx
                                  components/ios/IOSTabBar.tsx
                                  components/ios/NetworkStatus.tsx
                                  components/ios/theme.ts
```

The user has been hand-editing `NetworkStatus.tsx` (copy and colours) and
`IOSTabBar.tsx`. **Do not revert their edits.**

---

## 2. Completed this session

### Fixes
- **Homescreen glass rendered flat.** Root cause: the home page was wrapped in a
  `View` with `paddingTop: HEADER_HEIGHT` / `paddingBottom: BOTTOM_HEIGHT`, so
  the scroll view's *frame* started below the header and ended above the tab bar.
  Content never travelled underneath, so the frosted glass had nothing to sample.
  Fixed by moving those onto `contentContainerStyle` as **content insets**.
  *This is the single most repeatable Liquid Glass mistake in this codebase.*
- **`direct-chat/[conversationId].tsx` rebuilt.** Deleted 84 lines of
  commented-out dead implementation. `useChatManager` hooks ended in TODOs — the
  subscription received rows and dropped them, the send path never reported what
  it wrote. Added `fetchMessages`, `markThreadRead`, handler callbacks held in a
  ref (so re-render doesn't tear down the channel), and optimistic sends where a
  failure leaves the message visible as `queued`.
- **npm `ETARGET` was a stale cache**, not a dependency conflict. Fixed with
  `npm cache clean --force && npm install`. `--prefer-online` is NOT enough.

### The Liquid Glass opacity defect (6 components)
Expo documents it: *"Avoid opacity values less than 1 on GlassView or its parent
views"* (expo/expo#41024). Six components animated a container's opacity while
that container held the GlassView. Invisible on the blur fallback; wrong on real
iOS 26. Fixed in `IOSAlert`, `IOSMenu`, `IOSModalCard`, `RatingModal`,
`IOSToggle`, `CollapsibleHeader` by splitting:
- containers animate **motion only** (scale, translate)
- glass materialises via the new `present` prop, which animates the **effect**
- content drawn **on top of** glass keeps its opacity animation (always safe)

### Phases
| Phase | State |
|---|---|
| **1** Collapsible headers | **Done.** 16 screens converted; 5 of the original 12 turned out to be genuine exclusions. See §3. |
| **2** Tab bar overlap | **Done.** `useCollapsibleScroll({ tabBar: true })` returns both insets in one `scrollProps` bundle so a screen can't apply top and forget bottom. |
| **3** Network indicator | **Done.** `components/ios/NetworkStatus.tsx`, in `CollapsibleHeader`'s centre slot so **every** kit screen gets it. `useConnectionQuality` exported separately for the sync layer. |
| **4** Profile restructure | **Done, then redesigned.** Three panes inside `app/(main)/profile.tsx`, capsule tab strip, pinned bar, full-screen search. See §2. |
| **5** Notification tab | **Done.** `app/(main)/notifications.tsx` took the Settings tab slot. |
| **6** Followers/following | **Done.** `supabase/migrations/migration_follows.sql` was applied and verified on 2026-08-15. |
| **7** Proximity | **Not started.** |
| **8** Watermark + deep link | **Not started.** RatingModal already ships. |

### New kit components built this session
- `components/ios/IOSSegmentedTabs.tsx` — two variants.
  `variant="underline"` (default): segments read as ONE control — only the outer
  corners round (first segment leading, last trailing), inner edges square.
  `rounded="top"` for a strip at the head of a card.
  `variant="capsule"`: the iOS 26 segmented control — a glass TRACK with a
  smaller glass THUMB that springs between segments. The thumb is a real second
  glass surface, not a tinted View, so on iOS 26 it refracts what is behind the
  track like the system control. It moves on `transform` only.
  Segments flex to equal shares in both variants, so the strip is responsive with
  no measurement; the capsule thumb needs the track's measured width and waits
  for one `onLayout`, placing itself without animating that first frame.
- `components/ios/SwipeableTabs.tsx` — hero header scrolls away, a bar stays
  pinned at the very top, the tab strip travels with the content until it meets
  that bar, panes swipe horizontally.
  **Deliberately NOT a PagerView** — a pager has no intrinsic height and these
  panes differ enormously; a fixed height clips the tall one or leaves dead space
  under the short one. Only the active pane mounts and sizes itself.
  **Deliberately NOT `stickyHeaderIndices`** — sticky headers pin at the top of
  the scroll VIEWPORT, which is behind the pinned bar, so the strip would slide
  under it and vanish. There is no cross-platform way to move that stop (iOS
  honours `contentInset`, Android does not). The strip is an overlay driven by
  scroll position: `translateY = max(barHeight, stripRestY − scrollY)`.
- `components/ios/IOSSearchOverlay.tsx` — full-screen search presented over the
  page that asked for it. `animationType="slide"`, never `"fade"`: a fade
  animates the modal's alpha and this surface is full of glass.
- `components/ios/IOSFilterChips.tsx` — glass filter chips with counts. The
  active chip takes the tint as a FILL, because a tinted label alone is too weak
  to survive over glass.
- `IOSSearchBar` gained `asButton` — the resting bar on a page that opens a
  search overlay must be a TARGET, not an input; two live fields fight over focus
  and flicker the keyboard.
- `components/ios/NetworkStatus.tsx` — see Phase 3 above.
- `components/ios/IOSToggle.tsx` — glass switch. RN's `<Switch>` renders
  `UISwitch`, which fills its track with a flat colour and **cannot** be made
  translucent, so it had to be drawn.

### Profile screen (Phase 4) — how it's built
Three tabs **inside one file**, `app/(main)/profile.tsx`:
- **Profile** — role dashboards / `BalanceCard`, earnings stats strip, `CreditMeter`
- **Account Settings** — every settings section, then Personal Information, Driver Details
- **Activity** — `AchievementsCard`, Recent activity

Content was **moved, not rewritten**. The settings screens under `app/settings/`
are **untouched** — each row still pushes to the route it always did. The gear
icon was removed (settings are a tab now). Full-width search sits in the header.
Pull-to-refresh on all three tabs.

**Gotcha:** the component is already named `ProfileTab`, so the pane type had to
be `ProfilePane` — the collision made TypeScript resolve the type to the function.
It now lives in `src/data/profileSearchIndex.ts` and is imported.

**The redesign on top of that:**
- The tab strip is `variant="capsule"` — glass track, sliding glass thumb.
- A bar stays pinned above everything carrying the actions people open this
  screen for (search, QR, sign out), materialising its glass through `present`
  once the hero has scrolled away. Its centre slot is `NetworkStatus`.
- **Search covers all three panes.** `src/data/profileSearchIndex.ts` assembles
  settings sections and entries, the user's own fields WITH their current values
  as subtitles, recent trips and activity, and the screen's actions into one
  ranked list. Half of it is live data, which is why it is built per render
  rather than declared — a static list could name "Phone" but not the number,
  and could never contain the trip finished this morning.
  Results carry a typed `target`: push a route, switch pane, or run an action.
  **Anything that presents must wait ~320ms for the overlay to dismiss** — iOS
  drops a second modal presented over one still animating away, silently.
- The header copy button carried `hitSlop={912}` — a touch target larger than
  the screen, swallowing every tap around it — and copied `driver_id` while the
  chip beside it showed `@username`. Both fixed.

---

## 3. Phase 1 — exact remaining work

### Converted (16)
`(driver)/messages`, `(park-owner)/alerts`, `(park-owner)/drivers`,
`(passenger)/history`, `(passenger)/saved-routes`, `achievements`, `free-rides`,
`tiers`, `route-history/index` — then `(driver)/history`, `(driver)/free-ride`,
`barter/[offerId]`, `find-driver`, `(passenger)/find-trip`,
`(passenger)/payment`, and `(park-owner)/index`.
(Plus `(main)/profile`, `(main)/notifications`, `account-settings` and the seven
`app/settings/*` screens, which were already on the kit.)

`(park-owner)/index` took a **different shape on purpose**: its gradient hero IS
its header, so a large title above it would be a second one. It got the other
half of the behaviour instead — a compact glass bar that takes over once the hero
has scrolled past.

### The five that turned out to be exclusions, not work
Each was on the "still to convert" list until reading it showed why it isn't a
candidate. Do not reopen these without a reason:
- **`(passenger)/find-driver`** — not a screen. `components/FindDriverModal.tsx`
  imports and renders it as bottom-sheet content. A large-title nav bar inside a
  sheet is wrong.
- **`route-history/[id]`** — map screen. The floating glass back button over the
  map is the correct chrome; a title bar would cover the route.
- **`(passenger)/pay-fare`** — full-bleed branded green gradient. Its white-on-
  green header is part of the artwork, not chrome to be replaced.
- **`driver-search`** — already kit-native: a Spotlight-style expanding search
  field, no title at all. Nothing to collapse.
- **`program`** — multi-step wizard. The progress bar under the header must never
  scroll away, or the user loses their place in the flow.

### DELIBERATELY EXCLUDED — do not "fix" these
A collapsing large title is for scrolling **lists**. These are not:
- **Keyboard forms with sticky footers** — `(driver)/payout-bank`, `checkout`,
  `(auth)/register`, `(auth)/driver-profile`, `(driver)/create-trip`. The title
  collapses while the keyboard shoves content around.
- **`(main)` tab screens** — `home`, `discover`, `feed`, `messages`. The tab
  shell in `app/(main)/_layout.tsx` already draws their header; adding IOSScreen
  gives them two.
- **Chat / maps / carousels / modals** — `direct-chat/[conversationId]`,
  `live-trip-code/[code]`, `(auth)/welcome`, `rating`, `ui-kit`.
- `app/(main)/settings.tsx` is the **old** settings root, superseded by the
  Account Settings profile tab. Left in place, not converted.

### Also outstanding in Phase 1
**The WhatsApp-style profile header** — profile picture shrinking and moving to
top-left on scroll, username vanishing and reappearing as the centred header
title. **Partly done:** the profile bar now pins, fades in a mini avatar and the
name, and keeps its action buttons reachable throughout. What is left is the
*continuous* version — the large avatar physically travelling into the bar rather
than one fading out as the other fades in.

### The conversion recipe (works every time)
```tsx
// before: a hand-rolled static header + a FlatList
// after:
const scroll = useCollapsibleScroll();          // add { tabBar: true } inside (main)

<IOSScreen title="…" subtitle="…" back scrollable={false} scroll={scroll}>
  <Animated.FlatList
    showsVerticalScrollIndicator={false}
    {...scroll.scrollProps}
    contentContainerStyle={[styles.list, scroll.scrollProps.contentContainerStyle]}
    refreshControl={<RefreshControl progressViewOffset={scroll.contentInset} … />}
  />
</IOSScreen>
```
For a plain ScrollView screen, omit `scrollable={false}` and pass
`contentContainerStyle` directly to `IOSScreen`.

**Every conversion produces the same cleanup**, so expect it:
1. Delete the manual bottom spacer (`<View style={{height: 100}} />`) —
   `scroll.scrollProps` already pads for the floating tab bar *and* pads the
   scroll indicator to match, which hand-rolled versions never did.
2. Delete the screen's own `bg` / `cardBg` / `textColor` / `topPadding` /
   `insets` — IOSScreen owns the background and header.
3. Delete now-unused imports: `FlatList`, `ScrollView`, `Pressable`, `Platform`,
   `router`, `StatusBar`, `Ionicons`, `useSafeAreaInsets`.
4. Delete orphaned styles: `root`/`container`, `header`, `headerTitle`,
   `headerSubtitle`, `backBtn`/`sideElement`.
5. Run `npx tsc --noEmit --noUnusedLocals` to find all of the above at once.

**Sticky footers** (e.g. `tiers`) must be a *sibling* of `IOSScreen` inside a
flex wrapper — they're `position: absolute` and must float over the scroll, not
inside it. A footer that must ride above the KEYBOARD (`payment`, `barter`) is
different: it stays inside the `KeyboardAvoidingView` as a sibling of the scroll
view, and the KAV goes inside `IOSScreen`.

**`IOSScreen` no longer pads the frame when you pass `scroll`.** It used to do
both — frame padding *and* the content inset your scrollable applies from
`scroll.scrollProps` — so content started a whole header-height too low and, far
worse, nothing passed under the bar, leaving the glass with nothing to sample and
rendering it flat. Frame padding now applies only when there is no external
`scroll`, i.e. a genuinely static screen. If you convert a screen and the content
sits too low, check you are not re-adding a `paddingTop` of your own.

---

## 4. Phases 6, 7, 8 — what they need

### Phase 6 — Followers / following — **DONE, migration applied**
`supabase/migrations/migration_follows.sql` was applied on 2026-08-15 and
verified in the database: table + composite PK, both indexes, the `follows_counts`
trigger, `users.follower_count` / `users.following_count`, RLS enabled with three
policies, and all five RPCs present as `SECURITY DEFINER`. It is idempotent, so
re-running it is safe.

- `follows(follower_id, followee_id, created_at)`, composite PK — the pair is the
  identity, so that one index gives uniqueness *and* the "does A follow B" lookup.
- `users.follower_count` / `users.following_count`, kept by a trigger. Counts are
  denormalised because every profile view needs both and `count(*)` is
  O(followers) exactly where the traffic is.
- Reads are `SECURITY DEFINER` RPCs (`get_follow_stats`, `list_followers`,
  `list_following`) because `users` is not cross-readable — same reason
  `get_driver_public` exists. **The select list in those functions IS the access
  control**: SECURITY DEFINER bypasses RLS, so adding a column there exposes it.
- Writes (`follow_user` / `unfollow_user`) take the follower from `auth.uid()`,
  never a parameter.
- `src/store/useFollowsStore.ts` is **deliberately not offline-first** — a follow
  is a statement about another account and the server owns whether it took.
  Optimistic UI, rollback on failure.
- UI: counts in the profile hero, `app/follows/[userId].tsx` (two paged tabs),
  `components/FollowButton.tsx`, and a follow button on `verify-driver`.

### Phase 7 — Proximity — **NOT blocked on any API key**
This was clarified with the user and is important:
- **Finding nearby drivers/passengers needs NO third-party API.** They are rows
  in our own Supabase table — a lat/lng radius query. This is exactly how Bolt
  works: they query their own fleet, not a maps provider.
- **Filling stations** are the only part needing external POI data. The user
  offered a Google Places key, but **OpenStreetMap's Overpass API is free,
  keyless and unbilled** with usable Nigerian fuel-station coverage — try that
  first. If Places is used, the key must be **server-side** (a new Express
  endpoint), never `EXPO_PUBLIC_*`, which is inlined into the bundle.
- Also in scope: **Fastest Finger** — a driver offers an immediate discounted
  ride, nearby passengers accept instantly.

### Phase 8
- **Screenshot watermark:** iOS cannot modify the image the system saves to
  Photos. The approach is a **persistent faint logo overlay** in a corner of
  every screen, so any screenshot naturally includes it.
- **Shareable profile deep link.**
- Rating modal already ships (`components/ios/RatingModal.tsx`, Twitter-style
  alert: 4–5★ → store review, 1–3★ → private feedback form).

---

## 5. Traps that will cost you time

0d. **`Unable to resolve .../metro-config/node_modules/metro-runtime/src/modules/empty-module.js`
   at bundle time.** The path in the error does not exist and never will —
   `metro-config` has no nested `metro-runtime`. It is a **stale Metro cache**
   holding a resolution from an older install. Nothing in `package.json` or
   `metro.config.js` needs touching. Fix:

   ```bash
   rm -rf "$TMPDIR"metro-cache "$TMPDIR"metro-file-map-* .expo/cache
   npx expo start -c
   ```

   Generalise it: when an error names an absolute path inside `node_modules`
   that is not on disk, suspect the cache before the dependency tree. Check
   with `ls` on the exact path in the message first — it takes five seconds and
   rules out an hour of dependency archaeology.

0. **`createScreenFactory is not a function` at boot.** Two copies of
   `@react-navigation/native` in the tree — expo-router resolved one, a nested
   dependency dragged in another, and the newer API was missing from the copy
   that won. Fix: pin ONE version (a `resolutions`/`overrides` entry) and
   reinstall with **bun**. Diagnose with
   `find node_modules -path "*@react-navigation/native/package.json"`. Any
   `X is not a function (it is undefined)` from a library that clearly exports
   `X` is this shape of problem: duplicate copies, not a missing export.
0b. **This project uses `bun`** (`bun.lock`). Running `npm install` here
   restructures `node_modules` and produces duplicate-native-module warnings from
   `expo-doctor`. There is also a **tracked `package-lock.json`** — having both
   lock files makes EAS Build guess the package manager. Worth deleting one.
0c. **`npx expo-doctor` is the fastest first move for any boot failure.** It
   found the missing `expo-asset` peer and the duplicated native module in
   seconds, both of which were real device-path breakage.
1. **Never animate opacity on a `GlassView` or any ancestor.** Fixed nine times
   already; it keeps coming back. Use `present` + motion-only containers.
2. **Glass clips**, so a glassed card can't cast a shadow. Shadow goes on a
   wrapper outside it.
3. **Translucent chrome needs content behind it.** Content insets, never frame
   padding. This is what made the homescreen glass look flat.
4. **`isInteractive` only applies on mount.** Remount with a new `key` to change.
5. **`ETARGET` on an Expo package = stale npm cache.** Verify with
   `npm view <pkg> versions` before touching package.json.
6. **Two type ramps:** `IOSFont` (San Francisco) for system chrome — alerts,
   menus, nav bars. `IOSAppFont` (Poppins) for app UI — rows, cards, buttons.
7. **`components/Sidedbar.tsx`** is a deliberate typo. Don't rename it.
8. Reanimated re-exports `FlatList`/`ScrollView` but **not** `SectionList` —
   create the animated variant locally (see `notifications.tsx`).
9. **Verify with a real bundle**, not just typecheck:
   `CI=1 npx expo export --platform ios --output-dir /tmp/x --no-minify`.
   Typecheck passes on JSX that fails to bundle.
10. **A second modal presented over one still dismissing is dropped silently** by
    iOS — not queued, not errored. Anything a search result or sheet triggers
    (`router.push`, another modal, an alert) needs ~320ms after the close.
11. **Components declared inside a component are a new type every render**, so
    React remounts their subtree — text inputs lose focus and the keyboard
    dismisses on every keystroke. `free-ride` had this. Declare at module scope.
12. **`stickyHeaderIndices` pins at the scroll viewport's top**, which is behind
    any pinned bar of your own. There is no cross-platform way to move that stop.
    Drive an overlay off the scroll offset instead — see `SwipeableTabs`.

---

## 6. Known gaps / debt

- `(park-owner)/alerts` still uses `MOCK_ALERTS` — not wired to Supabase realtime.
- `driver-search` filter/sort chips don't filter; the lookup is an exact badge-ID
  match returning at most one driver. Commented in code.
- `notifications.tsx` sources only unread conversations. Sync and system notices
  need the push/sync layers to report into a store.
- `direct-chat` message state is screen-local. If chat must drive unread badges
  elsewhere, it needs a store.
- Loyalty tier revenue persistence not implemented.
- `services/` microservices unintegrated; `src/db/` empty.
- No test suite.
- The profile bar's collapse is a cross-fade, not the continuous WhatsApp
  travelling avatar. See §3.
- `profileSearchIndex` rebuilds on every render of the profile screen. It's
  memoised on its inputs, and the list is small (~80 entries), but if activity
  history grows large this is the first place to look.
