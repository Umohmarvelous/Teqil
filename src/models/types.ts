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