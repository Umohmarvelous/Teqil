# EMILGO — session status, 20 August 2026

Branch `sdk-54-temp`. Everything below is committed. Nothing is pushed —
see "Blocked on you" first.

---

## 🔴 Blocked on you (do these before the next session)

### 1. Push access

`git push` fails with **403**. Your machine has two GitHub accounts logged
into `gh`:

| account | write access to `Umohmarvelous/Teqil` |
|---|---|
| **MarvisDG** (active now, restored as you asked) | ❌ no |
| Umohmarvelous | ✅ yes (owner) |

Your git identity is already `Umohmarvelous <umohmarvelous@gmail.com>` — the
commits are attributed correctly. It is only the *push credential* that is
MarvisDG.

Pick one:
- Add **MarvisDG** as a collaborator with write access on
  `github.com/Umohmarvelous/Teqil/settings/access`, or
- Run `gh auth switch -u Umohmarvelous` yourself when you want to push.

**3 commits are waiting**: `0e37942`, `98b0e85`, plus this file.

### 2. AdMob — unchanged, still yours to do

`SETUP-KEYS.md §4.7`. Ads cannot show in Expo Go at all — the SDK is a
native module and is not in Expo Go. A dev build is not optional.

### 3. Meta / Facebook ads — a gate you cannot skip

I was wrong earlier when I said Meta Audience Network doesn't accept new
publishers. It does — ~37,000 publishers, open. The real blocker is
different: **Meta requires the app to be live in the App Store or Play
Store**, plus app-ownership verification and a Business account. EMILGO
isn't published, so Meta is unreachable today no matter what you integrate.
Correct sequence: ship to the stores → then add Meta / AppLovin / Unity as
bidders through AdMob Mediation, not as second SDKs.

Realistic Nigerian rewarded eCPM is **$0.50–$2.00**. US is **$15–$30**.
Country mix matters far more than which network you pick.

---

## ✅ Done and verified this session

### Security — a live, unauthenticated PII dump, closed
`migration_user_privacy.sql`, commit `ca33289`.

`public.users` carried a policy `FOR SELECT USING (true)` with no role
restriction, so it applied to `anon` — and the anon key ships inside the app
bundle. `GET /rest/v1/users?select=*` returned **every row**: email, phone,
kyc_status, is_admin, and (once a driver filled them in) payout_bank_code,
payout_account_number, nin_hash, bvn_hash.

Verified against the live database before and after: 9 rows / 9 emails /
9 phone numbers readable before; `permission denied for table users` now.

Every legitimate cross-user read became a SECURITY DEFINER function whose
select list *is* the access control: `get_public_profiles`,
`get_driver_public`, `get_park_owner_id`, `username_available`.

### Username login no longer leaks emails
`get_user_by_username` returned an email for any handle, to anyone, before a
session existed. It now runs only inside two edge functions
(`username-login`, `username-reset`) with the service-role key. Deployed and
tested: an unknown username and a wrong password return the *same* status and
the *same* sentence, so neither endpoint is an account-existence oracle.

### Search is username-only
Badge IDs and full names removed from every typed search path. A badge ID is
printed on a QR sticker in a guessable pattern — a searchable ID field is an
index of every driver on the platform. A legal name is worse: nobody chooses
it and nobody can change it to stop being found. QR *scanning* still resolves
an ID, because a scan means you are standing in front of them.

`search_drivers` dropped. Live suggestions added to `driver-search.tsx` and
`(passenger)/find-driver.tsx`.

### Feed crash + vanishing posts
Commit `0e37942`.

- **The crash you pasted.** `list_posts` builds a poll as
  `{options, ends_at, my_choice, tallies}`; the TypeScript interface claimed
  `{options, votes, total, closed}` — a shape nothing ever produced. So
  `Math.max(...poll.votes)` spread `undefined`. Added the missing translation
  and made the component defensive.
- **Voting wiped the poll.** `vote_poll` returns only tallies; the store
  assigned that straight onto the post, erasing `options`. Merges now.
- **Posts disappearing.** *Not* the feed query — verified `feed_for_you`
  returns the right rows, own posts included, and the two "missing" ones are
  replies which For You correctly excludes. Two client bugs: every feed RPC
  returns an **empty set, not an error**, when `auth.uid()` is NULL, so a
  fetch that outran session restore looked exactly like "no posts" and got
  cached as truth; and the store persisted only the composer draft, so every
  cold start began at zero. `load()` waits for a session now, and posts +
  both main timelines persist (capped 250). Ads deliberately not persisted —
  a replayed impression bills an advertiser for a view that never happened.

### Referral system ("WhatsApp Status ads")
Commit `98b0e85`. **16/16** in `supabase/tests/test_referrals.sql`.

Meta sells Status ads; there is no publisher programme, so EMILGO earning
revenue *inside* WhatsApp is not buildable. The inverse is: the user's Status
carries a referral link, and EMILGO pays for attributable installs.

Built and verified: `referral_config`, `referral_codes`, `referral_shares`,
`referrals`; `my_referral`, `record_referral_share`, `claim_referral`,
`try_qualify_referral`, `list_my_referrals`. Client service
`src/services/referrals.ts`, deep-link capture in `app/_layout.tsx`
(`getInitialURL` covers the fresh-install case that actually matters for
attribution), and `applyPendingReferral()` on signup.

Reward pays on **qualification**, never signup. `referred_id` is UNIQUE.
Self-referral blocked. Device-fingerprint guard. Idempotent by `dedupe_key`.
Daily cap per referrer.

---

## ❌ Not done — build these first, in this order

### 1. ~~The chat tab~~ — DONE, commit `24acca1`

**What was actually wrong:** the app had two chat screens and nobody knew.

`app/direct-chat/[conversationId].tsx` is the route nine screens push to —
it opens every time you tap a conversation. It imported nothing from
`messages.tsx`, and had its own standalone copy built on a MessageBubble
last touched **28 May**. Meanwhile `messages.tsx` exported `ChatScreen`
and `MessageBubble` with a comment at the top of the file saying
direct-chat imports them to avoid duplication. It never did.

So every improvement went into the screen almost nobody opened. That is the
whole explanation for the missing wallpaper and the apparent second chat
screen — the wrong one was being edited.

Fixed:
- `components/chat/ChatScreen.tsx` holds the single implementation.
- `messages.tsx` renders it and is **577 lines lighter** — conversation
  list and new-message sheet only.
- `direct-chat/[conversationId].tsx` is a route: store first, fetch if
  cold, params as a last resort so the header name is right on frame one.
- Swipe in from the left edge to close, with `activeOffsetX` /
  `failOffsetY` so it never steals a vertical scroll from the list.
- New-message sheet is an `IOSSheet` — drags between detents, flicks away.
  Search docked at the **bottom**, results at the **top**.
- Deleted `components/MessageBubble.tsx`, `src/hooks/useChatManager.ts`
  and `src/types/chat.ts` — a second chat data layer, provably
  unreferenced. Leaving a spare one is how this happens twice.

**Still to verify on device:** the "all red" contact card. It is almost
certainly the banner stack at `app/(main)/messages.tsx` — `Colors.error`
is literally `firebrick` on the recording banner, and the gold "⚠ Invalid
driver_id" banner fires whenever a lookup fails. `ContactCard.tsx`'s only
red is `t.systemRed` on the Block row, which is correct iOS convention.
Open a chat and look before changing anything.

**Still not done:** the extra chat features (starred messages, media
gallery, mute, wallpaper picker, forward, edit/delete-for-everyone, etc).
The foundation is now one screen, so they land once instead of twice.

### 2. Referral UI
The data layer is done and tested. Still needed: the invite screen (code,
stats, share buttons, invite list) and the rendered share card. A card image
needs `react-native-view-shot` + `expo-sharing` — **verify both work in
Expo Go on SDK 54 before designing around them.** Text-only share works today
with zero new dependencies.

### 3. Cross-app polish
- HugeIcons on the message tab and the For You tab.
- Pull-to-refresh on every scrollable screen, spinner **below** the header,
  never behind it. `useCollapsibleScroll().scrollProps` and
  `HEADER_CONTENT_GAP` already exist for this — audit which screens skipped
  them rather than adding a fourth mechanism.
- Header ↔ content spacing audit.

### 4. Still open from earlier
- `constants/devFlags.ts` — `ALLOW_UNVERIFIED_PAYOUT_ACCOUNT` is `true`.
  **Must be `false` before release.**
- `v_active_park_trips` is still a SECURITY DEFINER view (advisor ERROR).
- `auth_leaked_password_protection` is off — one toggle in the dashboard.
- Chat and feed have never been tested between two real accounts on real
  hardware. The databases are proven; the React layer is not.

---

## How to start the next session

> Read `STATUS.md`, then `HANDOFF.md`. Rebuild the chat screen at
> `app/direct-chat/[conversationId].tsx` in place — it is the live route,
> nine screens push to it, and it never received the ChatDoodle / ChatBubble
> / ContactCard work that went into `messages.tsx` by mistake. Do not delete
> it and do not replace it with the messages.tsx screen.
