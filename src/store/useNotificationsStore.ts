// src/store/useNotificationsStore.ts
//
// The notification inbox: real, persisted records that can be read, deleted and
// counted.
//
// ── Why this isn't derived from the messages store ───────────────────────────
// The Notifications tab used to compute its list on the fly from conversations
// with `unread_count > 0`. That reads fine until you try to DELETE one: the next
// render recomputes it straight back, because the thing you deleted was never a
// record, only a projection. Swipe-to-delete is impossible against a derived
// list, and so is "mark all read" surviving a restart.
//
// So notifications are stored. `ingestConversations` folds the messages store
// into that storage idempotently — one notification per conversation, keyed by
// `msg:<conversationId>`, updated in place when newer messages arrive. A record
// the user dismissed stays dismissed: its id is remembered so re-ingesting the
// same conversation doesn't resurrect it until genuinely newer traffic arrives.
//
// ── Offline-first ────────────────────────────────────────────────────────────
// AsyncStorage is the source of truth, like every other store here. Nothing in
// this file talks to the network: push delivery hands records in through `add`,
// and sync hands them in through `ingestConversations`. That keeps the inbox
// working with no connection, which is the normal case on Nigerian mobile data.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type NotificationKind = "message" | "sync" | "system" | "social" | "trip" | "payment";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** ISO. */
  createdAt: string;
  read: boolean;
  /** Where tapping it goes. */
  route?: string;
  /** Avatar to show instead of a glyph, for people-shaped notifications. */
  photoUri?: string;
}

/** Newest first — the order every consumer wants. */
function byNewest(a: AppNotification, b: AppNotification) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

interface NotificationsState {
  items: AppNotification[];
  /**
   * Ids the user dismissed, with the timestamp they were dismissed AT.
   *
   * Keyed rather than a plain list so re-ingest can ask "is there anything
   * newer than the dismissal?" — a deleted message notification should come
   * back when the person writes again, but not before.
   */
  dismissed: Record<string, string>;

  add: (n: Omit<AppNotification, "read"> & { read?: boolean }) => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
  /** Fold the conversation list into the inbox. Idempotent. */
  ingestConversations: (conversations: any[]) => void;
  /**
   * Fold server-side social activity (likes, replies, follows) into the same
   * inbox. Idempotent, keyed `soc:<row id>`.
   *
   * These rows already carry their own read state in the database, so unlike
   * conversations the server's `read_at` wins — otherwise reading a like on one
   * device would leave it bold on the other.
   */
  ingestSocial: (rows: any[]) => void;
}

/** Human sentence for one social notification row. */
function socialLine(kind: string, actor: string, excerpt: string | null): [string, string] {
  const snippet = excerpt ? `"${excerpt.slice(0, 80)}"` : "your post";
  switch (kind) {
    case "like":
      return [`${actor} liked your post`, snippet];
    case "reply":
      return [`${actor} replied to you`, snippet];
    case "repost":
      return [`${actor} reposted you`, snippet];
    case "quote":
      return [`${actor} quoted your post`, snippet];
    case "mention":
      return [`${actor} mentioned you`, snippet];
    case "follow":
      return [`${actor} followed you`, "Tap to see their profile"];
    default:
      return [actor, snippet];
  }
}

/** Cap on stored records. Beyond this the oldest READ ones are pruned first. */
const MAX_ITEMS = 200;

function prune(items: AppNotification[]): AppNotification[] {
  if (items.length <= MAX_ITEMS) return items;
  const sorted = [...items].sort(byNewest);
  const keep = sorted.slice(0, MAX_ITEMS);
  // Never drop something unread just because it's old — an unread notification
  // is an outstanding task, and silently discarding it loses information the
  // user has not seen yet.
  const droppedUnread = sorted.slice(MAX_ITEMS).filter((n) => !n.read);
  return [...keep, ...droppedUnread];
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: [],
      dismissed: {},

      add: (n) =>
        set((state) => {
          const incoming: AppNotification = { read: false, ...n };
          const existing = state.items.find((i) => i.id === incoming.id);

          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === incoming.id ? { ...i, ...incoming, read: existing.read } : i,
              ),
            };
          }
          return { items: prune([incoming, ...state.items]) };
        }),

      markRead: (id) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
        })),

      markUnread: (id) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, read: false } : i)),
        })),

      markAllRead: () =>
        set((state) => ({ items: state.items.map((i) => ({ ...i, read: true })) })),

      remove: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
          dismissed: { ...state.dismissed, [id]: new Date().toISOString() },
        })),

      clearAll: () =>
        set((state) => {
          const now = new Date().toISOString();
          const dismissed = { ...state.dismissed };
          for (const i of state.items) dismissed[i.id] = now;
          return { items: [], dismissed };
        }),

      ingestConversations: (conversations) => {
        const { dismissed } = get();
        const next: AppNotification[] = [];

        for (const c of conversations ?? []) {
          const unread = c.unread_count ?? c.unreadCount ?? 0;
          if (unread <= 0) continue;

          const id = `msg:${c.id}`;
          const createdAt = c.last_message_at || c.lastMessageAt || c.updated_at || c.created_at;
          if (!createdAt) continue;

          // Dismissed, and nothing newer has arrived since — stay dismissed.
          const dismissedAt = dismissed[id];
          if (dismissedAt && new Date(createdAt) <= new Date(dismissedAt)) continue;

          next.push({
            id,
            kind: "message",
            title: c.participant_name || c.participantName || "New message",
            body: c.last_message || c.lastMessage || "You have a new message",
            createdAt,
            read: false,
            route: `/direct-chat/${c.id}`,
            photoUri: c.participant_photo,
          });
        }

        if (next.length === 0) return;

        set((state) => {
          const items = [...state.items];
          for (const n of next) {
            const at = items.findIndex((i) => i.id === n.id);
            // Preserve `read` on update: re-ingesting an already-seen
            // conversation must not mark it unread again.
            if (at >= 0) items[at] = { ...items[at], ...n, read: items[at].read };
            else items.push(n);
          }
          return { items: prune(items) };
        });
      },

      ingestSocial: (rows) => {
        const { dismissed } = get();
        const next: AppNotification[] = [];

        for (const r of rows ?? []) {
          if (!r?.id || !r?.created_at) continue;

          const id = `soc:${r.id}`;
          const dismissedAt = dismissed[id];
          // Unlike a conversation, a social row never gets "newer" — it is a
          // single event. Once dismissed it stays dismissed, permanently.
          if (dismissedAt) continue;

          const actor = r.actor_name || (r.actor_username ? `@${r.actor_username}` : "Someone");
          const [title, body] = socialLine(r.kind, actor, r.post_excerpt);

          next.push({
            id,
            kind: "social",
            title,
            body,
            createdAt: r.created_at,
            read: !!r.read_at,
            route: r.post_id
              ? `/post/${r.post_id}`
              : r.actor_id
                ? `/follows/${r.actor_id}`
                : undefined,
            photoUri: r.actor_photo ?? undefined,
          });
        }

        if (next.length === 0) return;

        set((state) => {
          const items = [...state.items];
          for (const n of next) {
            const at = items.findIndex((i) => i.id === n.id);
            // The server's read state is authoritative here — see the interface
            // comment. Reading on one device must clear the badge on the other.
            if (at >= 0) items[at] = { ...items[at], ...n };
            else items.push(n);
          }
          return { items: prune(items) };
        });
      },
    }),
    {
      name: "teqil-notifications",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items, dismissed: s.dismissed }),
    },
  ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────
//
// Exported as hooks so every badge in the app reads ONE number from ONE place.
// Badge counts that each compute their own total drift the moment one of them
// forgets a case.

/** Notifications, newest first. */
export function useNotifications(): AppNotification[] {
  const items = useNotificationsStore((s) => s.items);
  return [...items].sort(byNewest);
}

/** How many are unread — what the bell badge shows. */
export function useUnreadNotificationCount(): number {
  return useNotificationsStore((s) => s.items.reduce((n, i) => n + (i.read ? 0 : 1), 0));
}

/** Non-hook read, for code outside React (push handlers, sync). */
export function unreadNotificationCount(): number {
  return useNotificationsStore.getState().items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
}
