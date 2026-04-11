export function generateTripCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateDriverId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DRV-${suffix}`;
}

export function generateUsername(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Teqil_user${num}`;
}

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

export function formatCoins(coins: number): string {
  return `${coins.toLocaleString()} `;
}

export function coinsToNaira(coins: number): number {
  return coins * 0.7;
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: string | Date): string {
  return `${formatDate(date)}, ${formatTime(date)}`;
}

export function calculateEarnings(distanceKm: number, durationMinutes: number): number {
  const baseRate = 5;
  const distanceRate = 2;
  const timeRate = 0.5;
  return Math.round(baseRate + distanceKm * distanceRate + durationMinutes * timeRate);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function isWithinRadius(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusMeters: number
): boolean {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance <= radiusMeters;
}


// ─── ADD to src/utils/helpers.ts ──────────────────────────────────────────────
// These are additions to the existing file — paste them at the bottom.

/**
 * Generate a Driver ID from a display name + 4 random digits.
 * "Emeka Obi" → "emeka_obi7832"
 */
export function generateDriverIdFromUsername(name: string): string {
  const digits = Math.floor(1000 + Math.random() * 9000).toString();
  const clean = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return `${clean || "driver"}${digits}`;
}

/**
 * Generate an SVG-based initials avatar as a base64 data URI.
 * Works as a React Native Image source: { uri: generateInitialsAvatar("John Doe") }
 */
export function generateInitialsAvatar(name: string): string {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const palette = [
    "#00A651", "#3B82F6", "#F5A623", "#EF4444",
    "#8B5CF6", "#EC4899", "#14B8A6", "#F97316",
  ];
  const color = palette[(name.charCodeAt(0) || 0) % palette.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="50" fill="${color}"/><text x="50" y="50" dy="0.35em" text-anchor="middle" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="bold">${initials}</text></svg>`;

  try {
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${encoded}`;
  } catch {
    // btoa may fail in some RN environments for non-ASCII — return empty string
    // and let the caller fall back to a placeholder
    return "";
  }
}

/**
 * Generate a strong random password: 12 chars, mixed case + digits + symbols.
 */
export function generateStrongPassword(): string {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower   = "abcdefghjkmnpqrstuvwxyz";
  const digits  = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;

  const pick = (src: string) => src[Math.floor(Math.random() * src.length)];

  // Guarantee at least one character from each category
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));

  // Shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}