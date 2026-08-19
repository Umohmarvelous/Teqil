// src/services/adAdmin.ts
//
// The ad-partner console's server surface. Admin only.
//
// ── Why this is separate from src/services/ads.ts ──────────────────────────
// `ads.ts` is what every user's device calls: serve me an ad, I watched it, pay
// me. This is what one or two people call to decide WHICH ads exist. Different
// audience, different permissions, and keeping them apart means a reader of
// either file can tell at a glance which side they are on.
//
// Every function here is refused by the database for a non-admin — the check is
// `public.is_admin()` inside each RPC, not an `if` in this file. A client that
// lies about being an admin gets the same "admin only" as one that does not.

import { supabase } from "./supabase";

export interface AdPartner {
  id: string;
  name: string;
  handle: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  budget_naira: number;
  cpm_naira: number;
  active: boolean;
  notes: string | null;
  creatives: number;
  impressions: number;
  spend_naira: number;
}

export interface AdCreativeRow {
  id: string;
  partner_id: string | null;
  partner_name: string | null;
  advertiser_name: string;
  headline: string;
  body: string;
  media_url: string | null;
  media_type: "image" | "video" | null;
  cta_label: string;
  cta_url: string;
  format: "feed" | "banner" | "interstitial" | "rewarded";
  category: string;
  duration_seconds: number;
  skip_after_seconds: number | null;
  target_roles: string[];
  weight: number;
  daily_cap: number | null;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  app_name: string | null;
  app_icon: string | null;
  app_rating: number | null;
  app_installs: string | null;
  app_store_url: string | null;
  play_store_url: string | null;
  impressions: number;
  clicks: number;
  completions: number;
  spend_naira: number;
}

export interface CreativeInput {
  id?: string | null;
  partnerId?: string | null;
  advertiserName?: string | null;
  headline: string;
  body?: string;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | null;
  ctaLabel?: string;
  ctaUrl: string;
  format?: "feed" | "banner" | "interstitial" | "rewarded";
  durationSeconds?: number;
  skipAfterSeconds?: number | null;
  category?: string;
  targetRoles?: string[];
  weight?: number;
  dailyCap?: number | null;
  active?: boolean;
  endsAt?: string | null;
  appName?: string | null;
  appIcon?: string | null;
  appRating?: number | null;
  appInstalls?: string | null;
  appStoreUrl?: string | null;
  playStoreUrl?: string | null;
}

/** Whether the signed-in user may see the console at all. */
export async function amIAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    // A missing function means the migration has not run; not an admin either way.
    console.warn("[adAdmin] is_admin:", error.message);
    return false;
  }
  return data === true;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

export async function listPartners(): Promise<AdPartner[]> {
  const { data, error } = await supabase.rpc("list_ad_partners");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    ...r,
    // Postgres NUMERIC arrives as a string through PostgREST; formatting it as
    // currency without this gives "₦2000.00.00"-shaped nonsense.
    budget_naira: num(r.budget_naira),
    cpm_naira: num(r.cpm_naira),
    creatives: num(r.creatives),
    impressions: num(r.impressions),
    spend_naira: num(r.spend_naira),
  }));
}

export async function savePartner(p: {
  id?: string | null;
  name: string;
  handle?: string | null;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  budget?: number;
  cpm?: number;
  active?: boolean;
  notes?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("upsert_ad_partner", {
    p_id: p.id ?? null,
    p_name: p.name,
    p_handle: p.handle ?? null,
    p_logo: p.logoUrl ?? null,
    p_email: p.email ?? null,
    p_phone: p.phone ?? null,
    p_budget: p.budget ?? 0,
    p_cpm: p.cpm ?? 0,
    p_active: p.active ?? true,
    p_notes: p.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listCreatives(includeInactive = true): Promise<AdCreativeRow[]> {
  const { data, error } = await supabase.rpc("list_ad_creatives", {
    p_include_inactive: includeInactive,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    ...r,
    target_roles: Array.isArray(r.target_roles) ? r.target_roles : [],
    app_rating: r.app_rating == null ? null : num(r.app_rating),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    completions: num(r.completions),
    spend_naira: num(r.spend_naira),
  }));
}

export async function saveCreative(c: CreativeInput): Promise<string> {
  const { data, error } = await supabase.rpc("upsert_ad_creative", {
    p_id: c.id ?? null,
    p_partner: c.partnerId ?? null,
    p_advertiser_name: c.advertiserName ?? null,
    p_headline: c.headline,
    p_body: c.body ?? "",
    p_media_url: c.mediaUrl ?? null,
    p_media_type: c.mediaType ?? null,
    p_cta_label: c.ctaLabel ?? "Learn more",
    p_cta_url: c.ctaUrl,
    p_format: c.format ?? "rewarded",
    p_duration_seconds: c.durationSeconds ?? 15,
    p_skip_after: c.skipAfterSeconds ?? null,
    p_category: c.category ?? "general",
    p_target_roles: c.targetRoles ?? [],
    p_weight: c.weight ?? 1,
    p_daily_cap: c.dailyCap ?? null,
    p_active: c.active ?? true,
    p_ends_at: c.endsAt ?? null,
    p_app_name: c.appName ?? null,
    p_app_icon: c.appIcon ?? null,
    p_app_rating: c.appRating ?? null,
    p_app_installs: c.appInstalls ?? null,
    p_app_store_url: c.appStoreUrl ?? null,
    p_play_store_url: c.playStoreUrl ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Pause or resume one creative without editing it. */
export async function setCreativeActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_ad_creative_active", {
    p_id: id,
    p_active: active,
  });
  if (error) throw new Error(error.message);
}
