// src/data/achievements.ts
//
// The catalogue of unlockable achievements (Reddit-style badges shown on the
// profile + Achievements screen). Each is a pure predicate over a snapshot of
// app state (engagement credits, program status, trips, savings) so unlocking is
// deterministic and re-evaluable — see useAchievementsStore.evaluate().
//
// Icons are references from @hugeicons/core-free-icons already used elsewhere in
// the app (so we know they resolve).

import {
  CheckmarkBadge01Icon,
  Message02Icon,
  Star,
  Share01Icon,
  GiftIcon,
  Navigation01Icon,
  Trophy,
  Wallet,
  IdentityCardFreeIcons,
  ShieldCheck,
  CrownIcon,
} from "@hugeicons/core-free-icons";

/** Snapshot the achievement predicates run against. */
export interface AchievementContext {
  credits: number; // engagement-credit balance
  creditsByType: Record<string, number>; // count of credit entries per type
  programStatus: string; // none | applied | eligible | enrolled
  tripCount: number; // completed trip payments
  savings: number; // ₦ total the pool subsidised for this passenger
  maxFare: number; // largest single base fare paid
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: any;
  check: (ctx: AchievementContext) => boolean;
}

const n = (v: number | undefined) => v ?? 0;

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "early_bird",
    title: "Early Bird",
    description: "Created your Emilgo account.",
    icon: CheckmarkBadge01Icon,
    check: (c) => n(c.creditsByType.signup) > 0,
  },
  {
    id: "first_comment",
    title: "First Comment",
    description: "Left your first comment on the feed.",
    icon: Message02Icon,
    check: (c) => n(c.creditsByType.comment) > 0,
  },
  {
    id: "ad_watcher",
    title: "Ad Watcher",
    description: "Watched 5 ads to fund your rides.",
    icon: Star,
    check: (c) => n(c.creditsByType.ad_watch) >= 5,
  },
  {
    id: "social_butterfly",
    title: "Social Butterfly",
    description: "Racked up 10 likes, comments or shares.",
    icon: Share01Icon,
    check: (c) =>
      n(c.creditsByType.like) + n(c.creditsByType.comment) + n(c.creditsByType.share) >= 10,
  },
  {
    id: "spread_word",
    title: "Spread the Word",
    description: "Shared a post or invited a friend.",
    icon: GiftIcon,
    check: (c) => n(c.creditsByType.share) > 0,
  },
  {
    id: "first_ride",
    title: "First Ride",
    description: "Completed your first paid ride.",
    icon: Navigation01Icon,
    check: (c) => c.tripCount >= 1,
  },
  {
    id: "road_warrior",
    title: "Road Warrior",
    description: "Completed 10 rides.",
    icon: Trophy,
    check: (c) => c.tripCount >= 10,
  },
  {
    id: "savings_master",
    title: "Savings Master",
    description: "Saved ₦2,000 with pool subsidies.",
    icon: Wallet,
    check: (c) => c.savings >= 2000,
  },
  {
    id: "big_spender",
    title: "Big Spender",
    description: "Paid a fare of ₦5,000 or more.",
    icon: Wallet,
    check: (c) => c.maxFare >= 5000,
  },
  {
    id: "program_member",
    title: "Program Member",
    description: "Joined the Emilgo loyalty program.",
    icon: IdentityCardFreeIcons,
    check: (c) => ["applied", "eligible", "enrolled"].includes(c.programStatus),
  },
  {
    id: "silver_status",
    title: "Silver Status",
    description: "Reached 100 credits.",
    icon: ShieldCheck,
    check: (c) => c.credits >= 100,
  },
  {
    id: "gold_status",
    title: "Gold Status",
    description: "Reached 500 credits — top tier.",
    icon: CrownIcon,
    check: (c) => c.credits >= 500,
  },
];

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
