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
