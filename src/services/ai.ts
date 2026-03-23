/**
 * src/services/ai.ts
 *
 * Mock AI journey assistant service.
 * Returns context-aware canned responses based on keywords.
 * Ready to swap in a real n8n/OpenAI webhook later.
 */

export interface AIContext {
  role: "driver" | "passenger";
  origin?: string;
  destination?: string;
  passengerDestination?: string; // passenger's personal stop
  elapsedSeconds?: number;
  passengerCount?: number;
  tripCode?: string;
}

export interface AIResponse {
  text: string;
  icon?: string; // Ionicons name
}

// ─── Keyword → response map ───────────────────────────────────────────────────

function matchKeyword(q: string): string | null {
  const lower = q.toLowerCase();

  if (/where.*we|current.*location|where.*now|location/.test(lower))
    return "location";
  if (/time.*destination|eta|arrive|how long|when.*get there|how far/.test(lower))
    return "eta";
  if (/fuel|petrol|filling station|diesel|gas station/.test(lower))
    return "fuel";
  if (/traffic|jam|road|congestion|slow/.test(lower)) return "traffic";
  if (/weather|rain|sun|temperature|forecast/.test(lower)) return "weather";
  if (/earn|coin|money|payment|how much/.test(lower)) return "earnings";
  if (/passenger|aboard|seat|capacity/.test(lower)) return "passengers";
  if (/safe|danger|alert|emergency/.test(lower)) return "safety";
  if (/speed|fast|slow down/.test(lower)) return "speed";
  if (/route|road|direction|turn/.test(lower)) return "route";
  if (/hello|hi|hey|morning|good/.test(lower)) return "greeting";
  if (/help|what can you|feature|command/.test(lower)) return "help";

  return null;
}

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Response builders ────────────────────────────────────────────────────────

const RESPONSES: Record<string, (ctx: AIContext) => AIResponse> = {
  greeting: (ctx) => ({
    icon: "happy-outline",
    text: ctx.role === "driver"
      ? `Hey boss! Your trip from ${ctx.origin ?? "origin"} to ${ctx.destination ?? "destination"} is running well. How can I help?`
      : `Hello! You're on your way to ${ctx.passengerDestination ?? ctx.destination ?? "your destination"}. Ask me anything about the trip.`,
  }),

  location: (ctx) => {
    const spots = [
      "along the expressway near a filling station",
      "approaching a major junction",
      "about 3 km from the next town",
      "near the market area",
      "on the highway, clear road ahead",
    ];
    return {
      icon: "location-outline",
      text: `You are currently ${randomFrom(spots)}. ${
        ctx.origin && ctx.destination
          ? `Route: ${ctx.origin} → ${ctx.destination}.`
          : ""
      } Live GPS map is active.`,
    };
  },

  eta: (ctx) => {
    const dest = ctx.role === "passenger" && ctx.passengerDestination
      ? ctx.passengerDestination
      : ctx.destination ?? "your destination";
    const elapsed = ctx.elapsedSeconds ?? 0;
    const estTotal = 45 * 60; // assume 45-min trip
    const remaining = Math.max(estTotal - elapsed, 5 * 60);
    return {
      icon: "time-outline",
      text: `Estimated time to ${dest}: about ${fmtTime(remaining)}. ${
        elapsed > 0 ? `You've been on this trip for ${fmtTime(elapsed)}.` : ""
      } Traffic conditions look normal.`,
    };
  },

  fuel: () => ({
    icon: "car-outline",
    text: randomFrom([
      "There's an NNPC filling station about 2 km ahead on your right.",
      "Total filling station is 4 km ahead. Mobil has a branch at the next junction too.",
      "Conoil station is coming up in about 1.5 km. Petrol price is around ₦650/litre today.",
    ]),
  }),

  traffic: () => ({
    icon: "navigate-outline",
    text: randomFrom([
      "Road ahead looks clear. No reported incidents on your route.",
      "Mild slow-down about 5 km ahead near the tollgate. Expect a 5–10 minute delay.",
      "Traffic is heavy near the market area. Consider the bypass route to save 8 minutes.",
      "Clear roads all the way to destination. Smooth trip expected!",
    ]),
  }),

  weather: () => ({
    icon: "partly-sunny-outline",
    text: randomFrom([
      "Weather is clear and sunny. Great day for travel — no rain expected.",
      "Partly cloudy with a chance of light rain in the afternoon. Drive carefully if it starts.",
      "Warm and dry today, around 32°C. Visibility is good.",
      "Overcast skies but no rain forecast. Road conditions are normal.",
    ]),
   }),
  
  weathers: () => ({
    icon: "partly-sunny-outline",
    text: randomFrom([
      "Weather is clear and sunny. Great day for travel — no rain expected.",
      "Partly cloudy with a chance of light rain in the afternoon. Drive carefully if it starts.",
      "Warm and dry today, around 32°C. Visibility is good.",
      "Overcast skies but no rain forecast. Road conditions are normal.",
    ]),
  }),

  earnings: (ctx) => {
    if (ctx.role !== "driver") {
      return {
        icon: "star-outline",
        text: "Coin earnings are tracked for drivers. As a passenger, you can earn referral coins by sharing your trip link with friends!",
      };
    }
    const elapsed = ctx.elapsedSeconds ?? 0;
    const estimatedCoins = Math.round(5 + Math.floor(elapsed / 60) * 0.5);
    return {
      icon: "star-outline",
      text: `You've earned approximately ${estimatedCoins} coins so far this trip. Coins accumulate every 30 seconds. Complete the trip to lock in your earnings. 70% of ad revenue goes directly to you!`,
    };
  },

  passengers: (ctx) => {
    if (ctx.role !== "driver") {
      return {
        icon: "people-outline",
        text: "You're currently a passenger on this trip. Your driver can see your drop-off destination.",
      };
    }
    const count = ctx.passengerCount ?? 0;
    return {
      icon: "people-outline",
      text:
        count === 0
          ? "No passengers have joined yet. Share the trip code with passengers so they can join."
          : `You have ${count} passenger${count > 1 ? "s" : ""} aboard. You'll get a notification when approaching each passenger's stop.`,
    };
  },

  safety: () => ({
    icon: "shield-checkmark-outline",
    text: "All safety features are active. SOS button is available — press it in an emergency to alert your emergency contacts and park owner. Stay alert and obey traffic rules.",
  }),

  speed: () => ({
    icon: "speedometer-outline",
    text: randomFrom([
      "You're travelling at a safe speed. Keep it up!",
      "Speed looks good. Remember to reduce speed near school zones and markets.",
      "Maintain a safe following distance, especially on the highway.",
    ]),
  }),

  route: (ctx) => ({
    icon: "map-outline",
    text: ctx.origin && ctx.destination
      ? `Your active route is from ${ctx.origin} to ${ctx.destination}. The map is tracking your live position. For turn-by-turn navigation, consider using Google Maps alongside Teqil.`
      : "Your route is active on the map. Live location tracking is running.",
  }),

  help: () => ({
    icon: "help-circle-outline",
    text: 'I can help with: 📍 Current location · ⏱ Time to destination · ⛽ Fuel stations · 🚦 Traffic updates · 🌤 Weather · 💰 Earnings · 👥 Passengers · 🛡 Safety tips · 🗺 Route info. Just ask!',
  }),
};

const FALLBACKS: AIResponse[] = [
  {
    icon: "chatbubble-outline",
    text: "I didn't quite catch that. Try asking about location, ETA, fuel stations, traffic, weather, or earnings.",
  },
  {
    icon: "chatbubble-outline",
    text: "Hmm, I'm not sure about that one. Ask me about the trip — like 'Where are we?' or 'How long to my destination?'",
  },
  {
    icon: "chatbubble-outline",
    text: "That's outside what I know right now. Try: 'traffic ahead', 'nearest fuel station', or 'time to destination'.",
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/** Simulate a slight network delay for realism */
function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function askAI(
  question: string,
  ctx: AIContext
): Promise<AIResponse> {
  await delay(600 + Math.random() * 600);

  const key = matchKeyword(question);
  if (key && RESPONSES[key]) {
    return RESPONSES[key](ctx);
  }
  return randomFrom(FALLBACKS);
}

/** Quick actions — keyed by button label */
export const QUICK_ACTIONS: { label: string; question: string; icon: string }[] = [
  { label: "Where are we?", question: "Where are we now?", icon: "location-outline" },
  { label: "Time to destination", question: "How long to my destination?", icon: "time-outline" },
  { label: "Fuel station", question: "Where is the next fuel station?", icon: "car-outline" },
  { label: "Traffic ahead?", question: "Is there traffic ahead?", icon: "navigate-outline" },
  { label: "Weather update", question: "What is the weather like?", icon: "partly-sunny-outline" },
];