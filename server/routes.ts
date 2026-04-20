// import type { Express } from "express";
// import { createServer, type Server } from "node:http";

// export async function registerRoutes(app: Express): Promise<Server> {
//   // put application routes here
//   // prefix all routes with /api

//   const httpServer = createServer(app);

//   return httpServer;
// }




import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  title: string;
  summary: string;
  imageUrl: string;
  source: string;
  category: string;
  readTime: number;
  publishedAt: string;
  url: string;
}

interface FeedResponse {
  items: FeedItem[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
}

// ─── Mock content generator ───────────────────────────────────────────────────
// Replace with a real CMS / RSS aggregator (e.g. Contentful, RSS-to-JSON)

const CATEGORIES = ["News", "Safety", "Earnings", "Routes", "Weather"] as const;
const SOURCES = ["Teqil Daily", "Road Watch NG", "Driver Hub", "Park News"] as const;

const ARTICLES = [
  {
    title: "Lagos–Ibadan Expressway: New Speed Limits in Effect",
    summary:
      "Federal Road Safety Corps announces reduced speed limits on the expressway following recent accidents.",
  },
  {
    title: "How Teqil Drivers Earned ₦50k in One Weekend",
    summary:
      "Three drivers share their strategies for maximising coin earnings during peak travel periods.",
  },
  {
    title: "Weather Alert: Heavy Rain Expected Across South-West",
    summary:
      "NiMet forecasts persistent rain through Thursday. Drivers advised to check routes before departure.",
  },
  {
    title: "Park Owners: New Broadcast Feature Now Available",
    summary:
      "Send messages to all your registered drivers instantly from the park owner dashboard.",
  },
  {
    title: "Top 5 Safety Tips for Night Driving in Nigeria",
    summary:
      "From proper lighting checks to emergency contacts, here is what every driver should know.",
  },
  {
    title: "Fuel Price Update: Latest NNPC Station Rates",
    summary: "Current nationwide average is ₦650/litre. Prices vary by state and station.",
  },
  {
    title: "Passenger Safety: What Drivers Need to Know",
    summary:
      "Understand your responsibilities as a Teqil driver and how the SOS system protects everyone.",
  },
  {
    title: "Teqil Coin System Explained – Earn More Every Trip",
    summary:
      "A detailed breakdown of how coins accumulate, what affects your earnings, and how to withdraw.",
  },
  {
    title: "New Route: Owerri–Port Harcourt Now Supported",
    summary:
      "Drivers on this route can now create trips and receive passengers through the Teqil platform.",
  },
  {
    title: "Emergency Contacts Feature: Everything You Need to Know",
    summary:
      "Passengers can now add up to 5 emergency contacts who receive real-time trip updates.",
  },
];

function generateFeedItems(page: number, limit: number): FeedItem[] {
  const total = ARTICLES.length * 10; // simulate large dataset
  const offset = (page - 1) * limit;

  return Array.from({ length: limit }, (_, i) => {
    const idx = (offset + i) % ARTICLES.length;
    const article = ARTICLES[idx];
    const globalIdx = offset + i;

    return {
      id: `article-${globalIdx}`,
      title: article.title,
      summary: article.summary,
      imageUrl: `https://picsum.photos/seed/${globalIdx + 100}/800/450`,
      source: SOURCES[globalIdx % SOURCES.length],
      category: CATEGORIES[globalIdx % CATEGORIES.length],
      readTime: 2 + (globalIdx % 5),
      publishedAt: new Date(Date.now() - globalIdx * 3_600_000).toISOString(),
      url: `https://teqil.app/news/${globalIdx}`,
    };
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerRoutes(app: Express): Promise<Server> {
  /**
   * GET /api/feed
   * Query params: page (default 1), limit (default 15)
   *
   * Returns paginated feed items. No auth required — unauthenticated users
   * can browse the feed; they just can't interact.
   */
  app.get("/api/feed", (req: Request, res: Response) => {
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(30, Math.max(1, parseInt((req.query.limit as string) ?? "15", 10)));

    const items = generateFeedItems(page, limit);
    const totalPages = 20; // mock: 20 pages available

    const response: FeedResponse = {
      items,
      page,
      limit,
      hasMore: page < totalPages,
      total: totalPages * limit,
    };

    res.json(response);
  });

  /**
   * POST /api/points/credit
   * Body: { userId: string, points: number, reason: string }
   *
   * Credits points to a user after they watch a rewarded ad.
   * Requires the user to be authenticated (check Supabase JWT).
   *
   * Points system: 1 point = $0.005 USD
   * Points are stored in `users.points_balance` in Supabase.
   */
  app.post("/api/points/credit", async (req: Request, res: Response) => {
    const { userId, points, reason } = req.body as {
      userId?: string;
      points?: number;
      reason?: string;
    };

    if (!userId || typeof points !== "number" || points <= 0) {
      return res.status(400).json({ error: "userId and a positive points value are required." });
    }

    if (points > 100) {
      // Sanity cap — no single ad watch should credit more than 100 points
      return res.status(400).json({ error: "Points value exceeds maximum per-action limit." });
    }

    try {
      // In production, verify the Supabase JWT from Authorization header here:
      // const token = req.headers.authorization?.split("Bearer ")[1];
      // const { data: { user }, error } = await supabase.auth.getUser(token);
      // if (!user || user.id !== userId) return res.status(401).json({ error: "Unauthorized" });

      // For now, trust the userId from the body (add JWT verification before going to prod).
      // We use Supabase RPC or a direct update. Since we don't import the Supabase admin
      // client here, return a success stub and implement the DB update when you wire up
      // the Supabase admin SDK on the server.
      console.log(`[Points] Crediting ${points} points to user ${userId} for: ${reason}`);

      // TODO: Replace stub with real Supabase admin call:
      // const { error } = await supabaseAdmin
      //   .from("users")
      //   .rpc("increment_points", { user_id: userId, amount: points });
      // if (error) throw error;

      res.json({
        success: true,
        userId,
        pointsCredited: points,
        reason: reason ?? "ad_watch",
        usdValue: (points * 0.005).toFixed(4),
      });
    } catch (err) {
      console.error("[Points] credit error:", err);
      res.status(500).json({ error: "Failed to credit points." });
    }
  });

  /**
   * GET /api/points/:userId
   * Returns the current points balance for a user.
   */
  app.get("/api/points/:userId", async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required." });
    }

    try {
      // TODO: fetch from Supabase:
      // const { data, error } = await supabaseAdmin
      //   .from("users")
      //   .select("points_balance")
      //   .eq("id", userId)
      //   .single();

      // Stub response
      res.json({ userId, points: 0, usdValue: "0.0000" });
    } catch (err) {
      console.error("[Points] balance error:", err);
      res.status(500).json({ error: "Failed to fetch balance." });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}