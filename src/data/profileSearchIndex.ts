// src/data/profileSearchIndex.ts
//
// Everything on the Profile screen, as one searchable list.
//
// The Profile screen is now three panes deep — a dashboard, every settings
// section, and the full activity history — which is more than anyone can
// browse. Search is the way out of that, but only if it covers the WHOLE
// screen rather than one pane: typing "phone" should find the phone number in
// Personal Information, typing "dark" should find the theme setting two screens
// away, and typing "lagos" should find the trip you took there.
//
// So the index is built from four sources and tagged by which it came from:
//
//   settings — the declarative settings index (sections + every entry)
//   profile  — the user's own fields, with their CURRENT VALUES as subtitles
//   activity — recent trips and history entries
//   actions  — the things the screen can do, plus where they live
//
// ── Why it's built per-render rather than declared ───────────────────────────
// Half of it is live data. A static list could name "Phone" but not the number,
// and could never contain the trip you finished this morning. `buildProfileIndex`
// takes the same state the screen renders and returns the searchable view of it,
// so the two can't drift.
//
// ── Ranking ──────────────────────────────────────────────────────────────────
// Same rule as `settingsIndex`, for the same reason: a title that STARTS WITH
// the query beats one that merely contains it, which beats a keyword, which
// beats a subtitle. Predictable ordering matters more than clever ordering —
// people retype a query when the top hit moves around.

import type { Trip, User } from "@/src/models/types";
import type { Activity } from "@/src/utils/activity";
import {
  SETTINGS_SECTIONS,
  SETTINGS_ENTRIES,
  sectionById,
} from "@/src/data/settingsIndex";

/** Which pane of the Profile screen an item belongs to. */
export type ProfilePane = "profile" | "settings" | "activity";

export type ProfileSearchCategory = "settings" | "profile" | "activity" | "actions";

/** What tapping a result should do. */
export type ProfileSearchTarget =
  /** Push a route. */
  | { kind: "route"; route: string }
  /** Switch to one of the three panes and stay here. */
  | { kind: "pane"; pane: ProfilePane }
  /** Run something the screen owns — open the editor, show the QR, sign out. */
  | { kind: "action"; action: ProfileAction; field?: string; value?: string };

export type ProfileAction =
  | "edit-field"
  | "change-photo"
  | "show-qr"
  | "sign-out"
  | "copy-username";

export interface ProfileSearchItem {
  id: string;
  title: string;
  subtitle?: string;
  symbol: string;
  category: ProfileSearchCategory;
  /** Heading the result is listed under. */
  group: string;
  /** Extra terms people search for that aren't in the title. */
  keywords?: string[];
  target: ProfileSearchTarget;
}

export interface ProfileIndexContext {
  user: User | null | undefined;
  trips?: Trip[];
  activities?: Activity[];
  credits?: number;
  achievementsEarned?: number;
  isPartner?: boolean;
}

const CATEGORY_LABEL: Record<ProfileSearchCategory, string> = {
  settings: "Settings",
  profile: "Your details",
  activity: "Activity",
  actions: "Actions",
};

export function categoryLabel(c: ProfileSearchCategory): string {
  return CATEGORY_LABEL[c];
}

// ─── Build ───────────────────────────────────────────────────────────────────

export function buildProfileIndex(ctx: ProfileIndexContext): ProfileSearchItem[] {
  const { user, trips = [], activities = [], credits, achievementsEarned, isPartner } = ctx;
  const items: ProfileSearchItem[] = [];

  // ── Your details ───────────────────────────────────────────────────────────
  //
  // Subtitles carry the CURRENT value, so a result answers the question as
  // often as it navigates: searching "email" usually means "what is my email",
  // not "take me to a screen where I could read it".

  const field = (
    id: string,
    title: string,
    value: string | null | undefined,
    symbol: string,
    editable: boolean,
    keywords?: string[],
  ): ProfileSearchItem => ({
    id: `profile-${id}`,
    title,
    subtitle: value || "Not set",
    symbol,
    category: "profile",
    group: CATEGORY_LABEL.profile,
    keywords,
    target: editable
      ? { kind: "action", action: "edit-field", field: id, value: value ?? "" }
      : { kind: "pane", pane: "settings" },
  });

  if (user) {
    items.push(
      field("full_name", "Full Name", user.full_name, "person", false, ["name", "who"]),
      field("username", "Username", user.username ? `@${user.username}` : undefined, "at", false, [
        "handle",
        "tag",
        "@",
      ]),
      field("email", "Email", user.email, "envelope", false, ["mail", "address"]),
      field("phone", "Phone", user.phone, "phone", true, ["number", "mobile", "call"]),
    );

    if (user.role === "driver") {
      items.push(
        field("vehicle_details", "Vehicle", user.vehicle_details, "car", true, [
          "car",
          "bus",
          "plate",
          "keke",
        ]),
        field("driver_id", "Driver ID", user.driver_id, "person.text.rectangle", false, [
          "id",
          "code",
          "driver",
        ]),
      );
    }

    if (user.role === "driver" || user.role === "park_owner") {
      items.push(
        field("park_name", "Park Name", user.park_name, "building.2", true, ["garage", "motor park"]),
        field("park_location", "Park Location", user.park_location, "mappin.and.ellipse", true, [
          "address",
          "where",
          "location",
        ]),
      );
    }

    if (user.avg_rating !== undefined && user.avg_rating !== null) {
      items.push({
        id: "profile-rating",
        title: "Rating",
        subtitle: `${Number(user.avg_rating).toFixed(1)} average`,
        symbol: "star",
        category: "profile",
        group: CATEGORY_LABEL.profile,
        keywords: ["stars", "score", "review"],
        target: { kind: "pane", pane: "profile" },
      });
    }
  }

  if (credits !== undefined) {
    items.push({
      id: "profile-credits",
      title: "Credit Balance",
      subtitle: `${credits} credits`,
      symbol: "bolt.circle",
      category: "profile",
      group: CATEGORY_LABEL.profile,
      keywords: ["coins", "fuel", "balance", "tier", "points"],
      target: { kind: "pane", pane: "profile" },
    });
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  for (const section of SETTINGS_SECTIONS) {
    items.push({
      id: `section-${section.id}`,
      title: section.title,
      subtitle: section.summary,
      symbol: section.symbol,
      category: "settings",
      group: CATEGORY_LABEL.settings,
      target: { kind: "route", route: section.route },
    });
  }

  for (const entry of SETTINGS_ENTRIES) {
    const section = sectionById(entry.section);
    items.push({
      id: `setting-${entry.id}`,
      title: entry.label,
      subtitle: entry.detail ?? section?.title,
      symbol: entry.symbol,
      category: "settings",
      group: CATEGORY_LABEL.settings,
      keywords: [...(entry.keywords ?? []), section?.title.toLowerCase() ?? ""],
      target: { kind: "route", route: section?.route ?? "/settings" },
    });
  }

  // ── Activity ───────────────────────────────────────────────────────────────

  for (const trip of trips.slice(0, 20)) {
    items.push({
      id: `trip-${trip.id}`,
      title: `${trip.origin} → ${trip.destination}`,
      subtitle: `${trip.status === "completed" ? "Completed" : "Active"} · ${formatDay(trip.start_time)}`,
      symbol: "car.circle",
      category: "activity",
      group: CATEGORY_LABEL.activity,
      keywords: [trip.trip_code, trip.origin, trip.destination, "trip", "ride", "journey"],
      target: { kind: "pane", pane: "activity" },
    });
  }

  for (const a of activities.slice(0, 30)) {
    items.push({
      id: `activity-${a.id}`,
      title: a.title,
      subtitle: `${a.subtitle}${a.amount ? ` · ${a.amount}` : ""}`,
      symbol: ACTIVITY_SYMBOL[a.icon] ?? "clock",
      category: "activity",
      group: CATEGORY_LABEL.activity,
      keywords: [a.kind, "history", "receipt", "payment"],
      target: { kind: "pane", pane: "activity" },
    });
  }

  if (achievementsEarned !== undefined) {
    items.push({
      id: "activity-achievements",
      title: "Achievements",
      subtitle: `${achievementsEarned} unlocked`,
      symbol: "trophy",
      category: "activity",
      group: CATEGORY_LABEL.activity,
      keywords: ["badges", "trophy", "unlocked", "rewards"],
      target: { kind: "route", route: "/achievements" },
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const action = (
    id: string,
    title: string,
    subtitle: string,
    symbol: string,
    target: ProfileSearchTarget,
    keywords?: string[],
  ): ProfileSearchItem => ({
    id: `action-${id}`,
    title,
    subtitle,
    symbol,
    category: "actions",
    group: CATEGORY_LABEL.actions,
    keywords,
    target,
  });

  items.push(
    action("photo", "Change Profile Photo", "Pick a new picture", "camera", {
      kind: "action",
      action: "change-photo",
    }, ["avatar", "picture", "image", "photo"]),
    action("copy-username", "Copy Username", "Copy your @handle", "doc.on.doc", {
      kind: "action",
      action: "copy-username",
    }, ["copy", "handle", "share"]),
    action("tiers", "Loyalty Tiers", "Free, Pro and Elite", "rosette", {
      kind: "route",
      route: "/tiers",
    }, ["pro", "elite", "plan", "upgrade", "premium"]),
    action("free-rides", "Free Rides", "Rides you've earned", "gift", {
      kind: "route",
      route: "/free-rides",
    }, ["free", "reward", "barter"]),
    action("history", "Trip History", "Every trip you've taken", "clock.arrow.circlepath", {
      kind: "route",
      route: user?.role === "driver" ? "/(driver)/history" : "/(passenger)/history",
    }, ["past", "trips", "receipts"]),
    action("saved-routes", "Saved Routes", "Routes you travel often", "bookmark", {
      kind: "route",
      route: "/(passenger)/saved-routes",
    }, ["favourite", "bookmark", "routes"]),
    action("sign-out", "Sign Out", "Leave this account", "rectangle.portrait.and.arrow.right", {
      kind: "action",
      action: "sign-out",
    }, ["logout", "log out", "exit", "leave"]),
  );

  if (user?.role === "driver") {
    items.push(
      action("qr", "My QR Code", "Let a passenger scan to pay", "qrcode", {
        kind: "action",
        action: "show-qr",
      }, ["qr", "scan", "receive", "code"]),
      action("payout", "Payout Account", "Where earnings are sent", "banknote", {
        kind: "route",
        route: "/(driver)/payout-bank",
      }, ["bank", "withdraw", "account", "money"]),
    );
  }

  if (!isPartner) {
    items.push(
      action("partner", "Become a Partner", "Join the partner programme", "checkmark.seal", {
        kind: "route",
        route: "/program",
      }, ["partner", "programme", "program", "join", "verify"]),
    );
  }

  return items;
}

const ACTIVITY_SYMBOL: Record<Activity["icon"], string> = {
  receipt: "doc.text",
  crown: "crown",
  trophy: "trophy",
  play: "play.rectangle",
  car: "car.circle",
};

function formatDay(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "—";
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface ProfileSearchHit extends ProfileSearchItem {
  /** Lower is a better match. */
  score: number;
}

/**
 * Rank the index against a query, optionally within one category.
 *
 * Ties break on title so the order is stable between keystrokes — a list that
 * reshuffles under the finger is worse than one that ranks imperfectly.
 */
export function searchProfileIndex(
  items: ProfileSearchItem[],
  query: string,
  category: ProfileSearchCategory | "all" = "all",
): ProfileSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: ProfileSearchHit[] = [];

  for (const item of items) {
    if (category !== "all" && item.category !== category) continue;

    const title = item.title.toLowerCase();
    const subtitle = item.subtitle?.toLowerCase() ?? "";
    const keywords = item.keywords ?? [];

    let score = -1;
    if (title.startsWith(q)) score = 0;
    else if (title.includes(q)) score = 1;
    else if (keywords.some((k) => k && k.toLowerCase().startsWith(q))) score = 2;
    else if (keywords.some((k) => k && k.toLowerCase().includes(q))) score = 3;
    else if (subtitle.includes(q)) score = 4;

    if (score < 0) continue;
    hits.push({ ...item, score });
  }

  return hits.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
}

/** Per-category counts for the filter chips, for the current query. */
export function countByCategory(
  items: ProfileSearchItem[],
  query: string,
): Record<ProfileSearchCategory | "all", number> {
  const all = searchProfileIndex(items, query, "all");
  return {
    all: all.length,
    settings: all.filter((h) => h.category === "settings").length,
    profile: all.filter((h) => h.category === "profile").length,
    activity: all.filter((h) => h.category === "activity").length,
    actions: all.filter((h) => h.category === "actions").length,
  };
}
