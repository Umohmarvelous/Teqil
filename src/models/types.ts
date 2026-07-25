export type UserRole = "driver" | "passenger" | "park_owner";

export interface User {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name: string | null;
  phone: string;
  email: string;
  age: number;
  role: UserRole;
  driver_id?: string;
  profile_photo?: string;
  vehicle_details?: string;
  park_location?: string;
  park_name?: string;
  points_balance: number;
  credits_balance?: number;
  device_fingerprint?: string;
  avg_rating?: number;
  profile_complete?: boolean;
  push_token?: string;
  created_at: string;
}

// ─── Syncable base ────────────────────────────────────────────────────────────
// Every entity that participates in cloud sync carries these two extra fields.
// `synced`     – false until the record has been confirmed written to Supabase.
// `updated_at` – ISO timestamp updated on every local write; used for last-write-wins.
export interface Syncable {
  synced: boolean;
  updated_at: string;
}

export interface Trip extends Syncable {
  id: string;
  driver_id: string;
  trip_code: string;
  origin: string;
  destination: string;
  start_time: string;
  end_time?: string;
  distance?: number;
  distance_km?: number;
  current_fare?: number;
  route_path?: any;
  capacity: number;
  status: "active" | "completed";
  created_at: string;
  driver?: User;
}

export interface Passenger extends Syncable {
  id: string;
  trip_id: string;
  user_id: string;
  destination?: string;
  dropoff_time?: string;
  status: "active" | "completed";
  emergency_contacts?: EmergencyContact[];
  created_at: string;
  user?: User;
}

export interface Rating extends Syncable {
  id: string;
  trip_id: string;
  rater_id: string;
  rated_id: string;
  stars: number;
  tags?: string[];
  review?: string;
  created_at: string;
}

export interface Broadcast extends Syncable {
  id: string;
  park_id: string;
  message: string;
  created_at: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface Park {
  id: string;
  name: string;
  location: string;
  owner_id: string;
  access_code?: string;
  created_at: string;
}

export interface TripEarnings {
  coins: number;
  naira_value: number;
}

export interface LiveLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export type AuthState = "unauthenticated" | "authenticated" | "loading";

export type CreditType = "signup" | "ad_watch" | "comment" | "like" | "share" | "reply";

export interface CreditHistory extends Syncable {
  id: string;
  user_id: string;
  type: CreditType;
  amount: number;
  post_id?: string;
  comment_id?: string;
  // Deterministic "earn once" key (e.g. "<uid>:like:<postId>"). NULL/undefined
  // for events that may repeat (ad_watch). Mirrors credits_history.dedupe_key.
  dedupe_key?: string;
  created_at: string;
}

// ─── Pool ledger (real ₦, distinct from engagement credits) ──────────────────
// IMPORTANT: this is NOT the same thing as `credits`.
//   • `CreditHistory` above = engagement points (likes/comments/…). A hidden
//     "meter" used only for Program-Page eligibility. NOT spendable money.
//   • `PoolEntry` below = real Naira in a passenger's pool. It grows ONLY when
//     realised ad revenue lands (`ad_revenue`) and shrinks when a trip spends it
//     (`trip_spend`). This is the money that actually funds the fare discount,
//     the driver bonus and the company cut — so the balance must never be set
//     directly; it is always the SUM of these entries (append-only ledger).
export type PoolEntryKind =
  | "ad_revenue"   // realised ad money credited in (positive) — added in Step 4
  | "trip_spend"   // money drawn to fund a trip (negative)
  | "adjustment";  // manual correction / admin-funded top-up (either sign)

export interface PoolEntry extends Syncable {
  id: string;
  user_id: string;
  amount: number;            // ₦; positive = credit in, negative = spend
  kind: PoolEntryKind;
  trip_id?: string;          // set for trip_spend rows
  // Deterministic "apply once" key (e.g. "<uid>:trip:<tripId>"). Mirrors
  // pool_history.dedupe_key UNIQUE so a retried/duplicated write can never
  // double-spend or double-credit the same event. NULL for entries allowed to repeat.
  dedupe_key?: string;
  created_at: string;
}

// The three amounts a single trip pulls out of a passenger's pool, plus what
// the passenger still pays from their bank. Returned by computeTripSplit().
export interface TripSplit {
  baseFare: number;          // the real fare entered
  passengerBankPays: number; // charged to the passenger's real bank account
  fareSubsidy: number;       // pool's contribution toward the fare (the "discount")
  driverBonus: number;       // fuel bonus paid to the driver from the pool
  companyCut: number;        // Emilgo's revenue from the pool
  driverReceives: number;    // = baseFare + driverBonus (driver is always made whole)
  poolDraw: number;          // = fareSubsidy + driverBonus + companyCut
}

// ─── Premium tiers ───────────────────────────────────────────────────────────
// Price tracks fuel: Pro = 4× current litre price, Elite = 8× (see useTierStore).
export type PremiumTier = "free" | "pro" | "elite";

// ─── Revenue transaction record (audit trail of every money movement) ────────
export type TransactionKind = "trip_payment" | "premium_subscription";

export interface RevenueTransaction extends Syncable {
  id: string;
  user_id: string;
  kind: TransactionKind;
  // Trip payment fields (null for premium rows)
  base_fare?: number;
  passenger_bank_paid?: number;
  pool_draw?: number;
  driver_bonus?: number;
  company_cut?: number;
  driver_total?: number;
  // Premium payment fields (null for trip rows)
  premium_amount?: number;
  station_share?: number;     // 60% → partner station subaccount
  company_share?: number;     // 40% → Emilgo
  station_subaccount?: string;
  status: "recorded" | "success" | "failed";
  // Idempotency: mirrors transactions.dedupe_key UNIQUE.
  dedupe_key?: string;
  created_at: string;
}

// ─── Ad Engagement ───────────────────────────────────────────────────────────
export type EngagementLevel = 'Green' | 'Yellow' | 'Orange' | 'Red';

export interface AdEngagement extends Syncable {
  id: string;
  user_id: string;
  vendor_name: string;
  watch_time: number;      // seconds
  views: number;
  clicks: number;
  engagement_level: EngagementLevel;
  created_at: string;
}

export function getEngagementLevel(watchTime: number, clicked: boolean): EngagementLevel {
  if (watchTime >= 30 && clicked) return 'Green';
  if (watchTime >= 10 && watchTime <= 29) return 'Yellow';
  if (watchTime >= 3 && watchTime <= 9) return 'Orange';
  return 'Red';
}