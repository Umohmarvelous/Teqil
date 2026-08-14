# EMILGO — Session Handoff

> **Read [PRD.md](PRD.md) first** for what the product is and how the codebase is
> organised. This file is the working state: what just got built, what is left,
> and the traps that will cost you an hour if you rediscover them the hard way.
>
> Written 2026-08-13. Branch **`sdk-54-temp`**, HEAD **`d51cc4a`**.
> Typecheck: **0 errors**. iOS bundle: **exports clean, 15.9 MB**.

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
| **6** Followers/following | **Not started.** |
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

### Phase 6 — Followers / following
Not started. Needs a Supabase migration for a social-graph table
(`follows(follower_id, followee_id, created_at)` with a unique pair index),
counts on driver profiles, a follow/unfollow toggle, and a follower list screen.

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
