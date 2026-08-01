/**
 * src/services/api.ts
 *
 * Base URL + helper for calling the Emilgo server (server/). The server holds the
 * provider SECRET keys (Paystack, Smile Identity); the app never does.
 *
 * If EXPO_PUBLIC_API_URL is set, the payment/KYC services route through the server
 * (which is itself mock-until-you-add-keys). If it's NOT set, those services fall
 * back to their in-app mocks — so the app keeps working with zero backend running.
 */

/** Normalize a host/URL to a scheme-qualified base with no trailing slash. */
function normalize(value: string): string {
  let v = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(v)) {
    // No scheme: localhost stays http; everything else (tunnels, Replit) is https.
    const secure = !/^(localhost|127\.0\.0\.1)/i.test(v);
    v = `${secure ? "https" : "http"}://${v}`;
  }
  return v;
}

/**
 * Base URL of the Emilgo server. Resolution order:
 *   1. EXPO_PUBLIC_API_URL — explicit override.
 *   2. EXPO_PUBLIC_DOMAIN  — set automatically by `expo:dev` / `expo:remote`
 *      (the Cloudflare API tunnel host), so the remote workflow wires this for free.
 *   3. null → services use their in-app mock.
 */
export function getApiBaseUrl(): string | null {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return normalize(explicit);
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (domain) return normalize(domain);
  return null;
}

/** True when a server base URL is configured (so we should prefer it over mocks). */
export function isServerConfigured(): boolean {
  return getApiBaseUrl() !== null;
}

/**
 * Fetch JSON from a server API path (e.g. "/api/paystack/initialize"). Throws if no
 * base URL is configured or the response is not ok — callers catch and fall back to
 * their mock so a server hiccup never blocks the user.
 */
export async function apiFetch<T = any>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) throw new Error("No EXPO_PUBLIC_API_URL configured");
  const resp = await fetch(`${base}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error((json && (json.error || json.message)) || `Request failed: ${resp.status}`);
  }
  return json as T;
}
