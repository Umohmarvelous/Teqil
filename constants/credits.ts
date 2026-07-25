/**
 * constants/credits.ts
 *
 * Single source of truth for engagement credit values. These are earned SILENTLY
 * in the feed (the 🪙 amounts are hidden from users there) and are REVEALED only
 * on the Program Page (`app/(main)/program.tsx`) as the eligibility requirements.
 *
 * The user tunes these numbers later — keep them here so the feed and the Program
 * Page never disagree.
 */

export const CREDIT_SIGNUP = 10;
export const CREDIT_LIKE = 10;
export const CREDIT_COMMENT = 30;
export const CREDIT_SHARE = 50;
export const CREDIT_REPLY = 5;      // legacy; ad-watch replaces this in a later step
export const CREDIT_AD_WATCH = 20;  // placeholder until the ads system (Step 4)

/** Minimum lifetime credits before a user may apply to the loyalty program. Placeholder. */
export const MIN_CREDITS_TO_APPLY = 500;

/** An earning rule as shown on the Program Page (the only place amounts are visible). */
export interface EarnRule {
  key: string;
  label: string;
  amount: number;
}

export const EARN_RULES: EarnRule[] = [
  { key: "signup", label: "Sign-up bonus", amount: CREDIT_SIGNUP },
  { key: "like", label: "Like a post", amount: CREDIT_LIKE },
  { key: "comment", label: "Comment on a post", amount: CREDIT_COMMENT },
  { key: "share", label: "Share a post", amount: CREDIT_SHARE },
  { key: "ad_watch", label: "Watch an ad", amount: CREDIT_AD_WATCH },
];
