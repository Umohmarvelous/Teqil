// src/data/settingsIndex.ts
//
// A flat, searchable index of every setting in the app.
//
// Settings live on section screens (WhatsApp-style), which means a user who
// doesn't know which section holds a setting can't find it by browsing. This
// index is what search queries, and each entry carries the route + section it
// lives on so a result can deep-link straight there.
//
// It is deliberately DECLARATIVE and separate from the screens: the screens own
// the real controls (a Switch bound to the store), this file owns discovery.
// When you add a setting to a section screen, add it here too — the search test
// in the settings screen renders "no results" rather than silently hiding it.

export type SettingsSectionId =
  | "account"
  | "appearance"
  | "notifications"
  | "privacy"
  | "rides"
  | "ads"
  | "data"
  | "about";

export interface SettingsSection {
  id: SettingsSectionId;
  title: string;
  /** One-line summary shown under the section title on the root screen. */
  summary: string;
  symbol: string;
  /** Key on IOSPalette, resolved at render so it adapts to light/dark. */
  tint:
    | "systemBlue"
    | "systemRed"
    | "systemGreen"
    | "systemOrange"
    | "systemGray"
    | "tint";
  route: string;
}

export interface SettingsEntry {
  id: string;
  label: string;
  /** Shown as the result subtitle. */
  detail?: string;
  symbol: string;
  section: SettingsSectionId;
  /** Extra terms people might search for that aren't in the label. */
  keywords?: string[];
}

// ─── Sections ────────────────────────────────────────────────────────────────

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "account",
    title: "Account",
    summary: "Profile, password, payouts",
    symbol: "person.crop.circle",
    tint: "systemBlue",
    route: "/settings/account",
  },
  {
    id: "appearance",
    title: "Appearance",
    summary: "Theme, language, profile badge",
    symbol: "paintbrush",
    tint: "systemOrange",
    route: "/settings/appearance",
  },
  {
    id: "notifications",
    title: "Notifications",
    summary: "Trip alerts, free rides, promotions",
    symbol: "bell.badge",
    tint: "systemRed",
    route: "/settings/notifications",
  },
  {
    id: "privacy",
    title: "Privacy & Security",
    summary: "Location, Face ID, emergency contacts",
    symbol: "lock.shield",
    tint: "systemGreen",
    route: "/settings/privacy",
  },
  {
    id: "rides",
    title: "Rides & Tracking",
    summary: "GPS, voice guidance, fare display",
    symbol: "car",
    tint: "tint",
    route: "/settings/rides",
  },
  {
    id: "ads",
    title: "Ads & Rewards",
    summary: "Earnings, playback, personalisation",
    symbol: "megaphone",
    tint: "systemOrange",
    route: "/settings/ads",
  },
  {
    id: "data",
    title: "Data & Storage",
    summary: "Sync, data saver, history, cache",
    symbol: "internaldrive",
    tint: "systemGray",
    route: "/settings/data",
  },
  {
    id: "about",
    title: "About & Support",
    summary: "Referrals, feedback, rate the app",
    symbol: "info.circle",
    tint: "systemBlue",
    route: "/settings/about",
  },
];

export function sectionById(id: SettingsSectionId): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.id === id);
}

// ─── Entries ─────────────────────────────────────────────────────────────────

export const SETTINGS_ENTRIES: SettingsEntry[] = [
  // Account
  { id: "profile", label: "My Profile", detail: "Name, photo and contact details", symbol: "person.text.rectangle", section: "account", keywords: ["name", "avatar", "photo", "edit"] },
  { id: "password", label: "Change Password", detail: "Send a reset link to your email", symbol: "key", section: "account", keywords: ["reset", "login", "security"] },
  { id: "payout", label: "Payout Account", detail: "Where your earnings are sent", symbol: "banknote", section: "account", keywords: ["bank", "withdraw", "driver", "earnings", "money"] },
  { id: "payment-methods", label: "Payment Methods", detail: "Saved cards for scan-and-pay", symbol: "creditcard", section: "account", keywords: ["card", "visa", "mastercard", "pay"] },
  { id: "signout", label: "Sign Out", symbol: "rectangle.portrait.and.arrow.right", section: "account", keywords: ["logout", "log out", "exit"] },
  { id: "delete-account", label: "Delete Account", detail: "Permanently remove your account", symbol: "trash", section: "account", keywords: ["remove", "close", "erase"] },

  // Appearance
  // Ads & Rewards
  { id: "ad-rewards", label: "Rewards Centre", detail: "Your streak, goals and earnings", symbol: "fuelpump", section: "ads", keywords: ["ads", "earn", "reward", "streak", "watch", "money", "pool", "bonus"] },
  { id: "ad-sound", label: "Sound On By Default", detail: "Start ads unmuted", symbol: "speaker.wave.2", section: "ads", keywords: ["mute", "audio", "volume", "ads"] },
  { id: "ad-wifi", label: "Video On Wi-Fi Only", detail: "Stop video ads using your data", symbol: "wifi", section: "ads", keywords: ["data", "airtime", "mobile", "video", "ads", "save"] },
  { id: "ad-autoplay", label: "Autoplay The Next Ad", symbol: "forward", section: "ads", keywords: ["auto", "next", "continuous", "ads"] },
  { id: "ad-reminder", label: "Streak Reminder", detail: "A nudge on days you have not hit your goal", symbol: "bell", section: "ads", keywords: ["streak", "remind", "daily", "notification", "ads"] },
  { id: "ad-personalised", label: "Personalised Ads", detail: "Use your role and routes to pick ads", symbol: "person.crop.circle.badge.questionmark", section: "ads", keywords: ["privacy", "targeting", "tracking", "ads", "personal"] },

  { id: "theme", label: "Dark Mode", detail: "Match the system or force a theme", symbol: "moon", section: "appearance", keywords: ["light", "dark", "night", "theme", "appearance"] },
  { id: "language", label: "Language", detail: "English or Nigerian Pidgin", symbol: "globe", section: "appearance", keywords: ["pidgin", "english", "translate", "locale"] },
  { id: "tier-badge", label: "Show Credit Tier Badge", detail: "Display Bronze/Silver/Gold on your profile", symbol: "rosette", section: "appearance", keywords: ["bronze", "silver", "gold", "badge", "public"] },

  // Notifications
  { id: "push", label: "Push Notifications", detail: "Master switch for this device", symbol: "bell.badge", section: "notifications", keywords: ["alerts", "notify"] },
  { id: "notify-arrival", label: "Driver Arrival Alerts", detail: "Tell me when my driver is nearby", symbol: "car.circle", section: "notifications", keywords: ["arrive", "nearby", "pickup"] },
  { id: "notify-free-rides", label: "Free Ride Offers", detail: "New free rides on routes you use", symbol: "gift", section: "notifications", keywords: ["free", "reward", "barter"] },
  { id: "notify-fuel-pool", label: "Fuel Pool Warnings", detail: "When the pool can't cover rewards", symbol: "fuelpump", section: "notifications", keywords: ["fuel", "pool", "driver", "empty"] },
  { id: "notify-promotions", label: "Promotions", detail: "Premium offers and campaigns", symbol: "megaphone", section: "notifications", keywords: ["marketing", "offers", "deals", "ads"] },

  // Privacy & Security
  { id: "share-location", label: "Share Location During Trips", detail: "Free rides always track regardless", symbol: "location", section: "privacy", keywords: ["gps", "tracking", "location"] },
  { id: "biometric-lock", label: "Biometric App Lock", detail: "Face ID or passcode to open the app", symbol: "faceid", section: "privacy", keywords: ["face id", "touch id", "fingerprint", "lock", "passcode"] },
  { id: "biometric-payout", label: "Confirm Payout Changes", detail: "Require Face ID to change payout details", symbol: "lock.shield", section: "privacy", keywords: ["face id", "bank", "security", "payout"] },
  { id: "emergency-contact", label: "Emergency contacts", detail: "Who is told when your trips start, end, or go wrong", symbol: "phone.arrow.up.right", section: "privacy", keywords: ["sos", "safety", "help", "emergency", "contact", "next of kin", "family", "trusted"] },

  // Rides & Tracking
  { id: "auto-tracking", label: "Start Tracking Automatically", detail: "Begin GPS as soon as a ride opens", symbol: "location.fill.viewfinder", section: "rides", keywords: ["gps", "auto", "tracking"] },
  { id: "confirm-end", label: "Confirm Before Ending a Ride", symbol: "checkmark.shield", section: "rides", keywords: ["confirm", "end", "stop"] },
  { id: "voice-guidance", label: "Voice Guidance", detail: "Speak trip and arrival cues aloud", symbol: "speaker.wave.2", section: "rides", keywords: ["speech", "audio", "speak", "voice"] },
  { id: "fare-breakdown", label: "Show Fare Breakdown", detail: "See the split before you confirm a payment", symbol: "list.bullet.rectangle", section: "rides", keywords: ["fare", "split", "price", "cost"] },
  { id: "distance-unit", label: "Distance Units", detail: "Kilometres or miles", symbol: "ruler", section: "rides", keywords: ["km", "miles", "metric", "imperial"] },
  { id: "route-history", label: "Route History", detail: "GPS routes of trips you've taken", symbol: "map", section: "rides", keywords: ["gps", "routes", "history", "tracks"] },

  // Data & Storage
  { id: "data-saver", label: "Data Saver", detail: "Lower GPS accuracy, fewer updates", symbol: "antenna.radiowaves.left.and.right", section: "data", keywords: ["data", "bandwidth", "battery", "save"] },
  { id: "wifi-sync", label: "Sync on Wi-Fi Only", detail: "Hold cloud sync until you're on Wi-Fi", symbol: "wifi", section: "data", keywords: ["wifi", "sync", "cellular", "mobile data"] },
  { id: "retention", label: "Keep History For", detail: "Prune local records after this long", symbol: "clock.arrow.circlepath", section: "data", keywords: ["retention", "delete", "storage", "history"] },
  { id: "clear-cache", label: "Clear Cache", detail: "Free space; keeps your login", symbol: "trash", section: "data", keywords: ["cache", "storage", "clear", "space"] },

  // About & Support
  { id: "referral", label: "My Referral Code", detail: "Invite friends to Emilgo", symbol: "person.2", section: "about", keywords: ["invite", "refer", "friend", "code"] },
  { id: "rate", label: "Rate Emilgo", detail: "Leave a review on the App Store", symbol: "star", section: "about", keywords: ["review", "rating", "stars", "feedback"] },
  { id: "feedback", label: "Send Feedback", detail: "Tell us what's working and what isn't", symbol: "bubble.left.and.bubble.right", section: "about", keywords: ["support", "help", "contact", "bug", "report"] },
  { id: "version", label: "Version", symbol: "info.circle", section: "about", keywords: ["build", "app version", "about"] },
];

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SettingsSearchResult extends SettingsEntry {
  section_title: string;
  route: string;
  /** Lower is a better match. */
  score: number;
}

/**
 * Rank settings against a query.
 *
 * Scoring is intentionally simple and predictable: a label that STARTS WITH the
 * query beats one that merely contains it, which beats a keyword-only hit. That
 * ordering is what makes typing "da" surface "Dark Mode" above "Data Saver"
 * rather than whichever happened to be declared first.
 */
export function searchSettings(query: string): SettingsSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const out: SettingsSearchResult[] = [];

  for (const entry of SETTINGS_ENTRIES) {
    const label = entry.label.toLowerCase();
    const detail = entry.detail?.toLowerCase() ?? "";
    const keywords = entry.keywords ?? [];

    let score = -1;
    if (label.startsWith(q)) score = 0;
    else if (label.includes(q)) score = 1;
    else if (keywords.some((k) => k.toLowerCase().startsWith(q))) score = 2;
    else if (keywords.some((k) => k.toLowerCase().includes(q))) score = 3;
    else if (detail.includes(q)) score = 4;

    if (score < 0) continue;

    const section = sectionById(entry.section);
    out.push({
      ...entry,
      section_title: section?.title ?? entry.section,
      route: section?.route ?? "/settings",
      score,
    });
  }

  return out.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
}

/** Every entry belonging to a section, in declaration order. */
export function entriesForSection(id: SettingsSectionId): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter((e) => e.section === id);
}
