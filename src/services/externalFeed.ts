// src/services/externalFeed.ts
//
// Fetching real outside content into the For You feed.
//
// ── What ships working, and what does not ──────────────────────────────────
//   RSS       ✅  No credentials. Four Nigerian newsrooms are seeded.
//   Reddit    ⚠️  Free, but needs a registered OAuth app — the old `.json`
//                 endpoint now returns 403 to datacenter traffic. Wire the
//                 credentials in `.env` and it turns on; see SETUP-KEYS.
//   Twitter/X ❌  No free read tier since 2023. ~$100/month minimum.
//   Instagram ❌  Graph API returns only media on a business account you own.
//   Facebook  ❌  Same — your own Pages only.
//
// The three crosses are not missing work. There is no endpoint to call.
//
// ── Why the RSS parser is hand-rolled ──────────────────────────────────────
// `react-native-rss-parser` and friends pull in `react-native-xml2js` or a DOM
// shim, which is a lot of bundle for a format this regular. RSS 2.0 and Atom
// both have a flat item shape, and a few well-anchored regexes read them
// correctly. It is deliberately tolerant: a feed with one malformed item should
// yield the other nineteen, not throw.

import { supabase } from "./supabase";

export interface FeedSource {
  id: string;
  kind: "rss" | "reddit";
  name: string;
  url: string;
  icon_url: string | null;
  category: string;
  weight: number;
  last_fetched: string | null;
}

export interface ExternalPost {
  id: string;
  url: string;
  title: string;
  summary: string;
  image_url: string | null;
  author: string | null;
  published_at: string;
  source_name: string;
  source_icon: string | null;
  source_kind: string;
  category: string;
  bookmark_count: number;
  viewer_bookmarked: boolean;
}

interface ParsedItem {
  url: string;
  title: string;
  summary: string;
  image?: string;
  author?: string;
  published?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// PARSING
// ═════════════════════════════════════════════════════════════════════════════

/** Undo the five XML entities plus numeric escapes, which feeds use freely. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // Ampersand LAST, or "&amp;lt;" would decode twice into "<".
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** First capture of `<tag>…</tag>`, CDATA unwrapped. */
function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  if (!m) return undefined;
  const inner = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeEntities(inner).trim();
}

/**
 * Pull an image out of an item.
 *
 * Feeds carry it in at least four different places and none of them is
 * guaranteed, so each is tried in descending order of how likely it is to be a
 * real lead image rather than a tracking pixel or an author avatar.
 */
function extractImage(item: string): string | undefined {
  const media =
    /<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i.exec(item) ??
    /<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image/i.exec(item) ??
    /<enclosure[^>]*type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i.exec(item);
  if (media?.[1]) return media[1];

  // Otherwise the first <img> inside the encoded body.
  const body = tag(item, "content:encoded") ?? tag(item, "description") ?? "";
  const img = /<img[^>]*src=["']([^"']+)["']/i.exec(body);
  if (img?.[1]) return img[1];

  return undefined;
}

/** Parse RSS 2.0 or Atom. Returns whatever it could read. */
export function parseFeed(xml: string): ParsedItem[] {
  const blocks =
    xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ??
    xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ??
    [];

  const out: ParsedItem[] = [];
  for (const block of blocks) {
    try {
      const title = tag(block, "title");
      // Atom puts the URL in an attribute rather than in element text.
      const link =
        tag(block, "link") ??
        /<link[^>]*href=["']([^"']+)["']/i.exec(block)?.[1] ??
        tag(block, "guid");
      if (!title || !link || !/^https?:\/\//i.test(link)) continue;

      const rawSummary =
        tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content") ?? "";
      const date =
        tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated");

      out.push({
        url: link,
        title: stripTags(title).slice(0, 300),
        summary: stripTags(rawSummary).slice(0, 500),
        image: extractImage(block),
        author: tag(block, "dc:creator") ?? tag(block, "author"),
        published: date ? new Date(date).toISOString() : undefined,
      });
    } catch {
      // One bad item must not lose the rest of the feed.
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// FETCHING
// ═════════════════════════════════════════════════════════════════════════════

const FETCH_TIMEOUT_MS = 15_000;

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Newsrooms rate-limit anonymous clients hard; identifying the app is
        // both polite and what keeps it from being blocked.
        "User-Agent": "EMILGO/1.0 (+https://emilgo.app)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      console.warn(`[externalFeed] ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e: any) {
    console.warn(`[externalFeed] ${url}:`, e?.message ?? e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reddit, when credentials exist.
 *
 * Uses the client-credentials grant, which is the free "application-only" tier
 * and needs no user to log in. Without both variables set this returns null and
 * the source is skipped — never a fabricated post.
 */
async function fetchReddit(subreddit: string): Promise<ParsedItem[] | null> {
  const id = process.env.EXPO_PUBLIC_REDDIT_CLIENT_ID;
  const secret = process.env.EXPO_PUBLIC_REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  try {
    const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "EMILGO/1.0",
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json();
    if (!access_token) return null;

    const res = await fetch(
      `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/hot?limit=25`,
      { headers: { Authorization: `Bearer ${access_token}`, "User-Agent": "EMILGO/1.0" } },
    );
    if (!res.ok) return null;

    const json = await res.json();
    return (json?.data?.children ?? [])
      .map((c: any) => c?.data)
      .filter((d: any) => d && !d.over_18 && !d.stickied)
      .map((d: any) => ({
        url: `https://reddit.com${d.permalink}`,
        title: String(d.title ?? "").slice(0, 300),
        summary: String(d.selftext ?? "").slice(0, 500),
        image:
          d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&") ??
          (typeof d.thumbnail === "string" && d.thumbnail.startsWith("http")
            ? d.thumbnail
            : undefined),
        author: d.author ? `u/${d.author}` : undefined,
        published: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined,
      }));
  } catch (e: any) {
    console.warn("[externalFeed] reddit:", e?.message ?? e);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

export async function listSources(): Promise<FeedSource[]> {
  const { data, error } = await supabase
    .from("feed_sources")
    .select("*")
    .eq("active", true)
    .order("weight", { ascending: false });
  if (error) {
    console.warn("[externalFeed] listSources:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Refresh every source and store what is new. Returns how many rows were added.
 *
 * ── Why this runs on the device ───────────────────────────────────────────
 * There is no cron and no worker. Pull-to-refresh is the trigger. That is safe
 * because `ingest_external_posts` only accepts a source already in the
 * admin-managed allowlist, and the UNIQUE url makes it idempotent — a hundred
 * phones refreshing at once produce one row per article, not a hundred.
 *
 * Sources are fetched in PARALLEL and one failing never blocks the others: a
 * newsroom being down should cost that outlet's items, not the whole refresh.
 *
 * Moving this to a scheduled Edge Function later changes nothing above the RPC.
 */
export async function refreshExternalFeed(): Promise<number> {
  const sources = await listSources();
  if (!sources.length) return 0;

  const results = await Promise.allSettled(
    sources.map(async (src) => {
      let items: ParsedItem[] | null = null;

      if (src.kind === "reddit") {
        items = await fetchReddit(src.url);
      } else {
        const xml = await fetchText(src.url);
        items = xml ? parseFeed(xml) : null;
      }

      if (!items?.length) return 0;

      const { data, error } = await supabase.rpc("ingest_external_posts", {
        p_source: src.id,
        p_items: items.slice(0, 30),
      });
      if (error) {
        console.warn(`[externalFeed] ingest ${src.name}:`, error.message);
        return 0;
      }
      return typeof data === "number" ? data : 0;
    }),
  );

  return results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value : 0), 0);
}

export async function listExternalPosts(limit = 20, offset = 0): Promise<ExternalPost[]> {
  const { data, error } = await supabase.rpc("list_external_posts", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.warn("[externalFeed] list:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    ...r,
    bookmark_count: Number(r.bookmark_count ?? 0),
    viewer_bookmarked: !!r.viewer_bookmarked,
  }));
}

export async function toggleExternalBookmark(
  id: string,
): Promise<{ on: boolean; n: number }> {
  const { data, error } = await supabase.rpc("toggle_external_bookmark", { p_id: id });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { on: !!row?.bookmarked, n: Number(row?.n ?? 0) };
}
