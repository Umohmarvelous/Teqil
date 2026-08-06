// src/utils/qr.ts
//
// Single source of truth for the driver QR-code format. Historically the
// generator (qr-receive) and the scanners (home / scan-pay / pay-fare) drifted
// apart — the generator emitted a JSON payload while some scanners still
// expected the old "TEQIL:DRV-<id>:<sub>" string, so scans silently failed.
//
// A driver's QR encodes a small JSON payload so a passenger can SEE the driver
// (name / vehicle / rating / photo) the instant they scan — with no read of the
// `users` table, which Row-Level Security blocks across accounts (each user can
// only read their own row). Canonical value:
//
//   {"type":"TEQIL_DRV","driver_id":"…","name":"…","vehicle":"…","rating":5,"photo":"…"}
//
// parseDriverQR still accepts the legacy delimited string so codes printed by
// older builds keep working.

export interface DriverQR {
  driver_id: string;
  subaccount_code?: string;
  name?: string;
  vehicle?: string;
  rating?: number;
  photo?: string;
}

export const TEQIL_DRV_TYPE = "TEQIL_DRV";
const LEGACY_PREFIX = "TEQIL:DRV-";

// Fields are widened with `| null` so the app's `User` type (whose optional
// fields are `string | null`) is structurally assignable. Runtime guards below
// (`||` / `??`) handle null/undefined uniformly.
interface DriverLike {
  id?: string | null;
  driver_id?: string | null;
  full_name?: string | null;
  vehicle_details?: string | null;
  avg_rating?: number | null;
  profile_photo?: string | null;
  subaccount_code?: string | null;
}

/** Build the canonical QR string for a driver. */
export function buildDriverQRValue(user: DriverLike | null | undefined): string {
  return JSON.stringify({
    type: TEQIL_DRV_TYPE,
    driver_id: user?.driver_id || user?.id || "",
    name: user?.full_name || "Driver",
    vehicle: user?.vehicle_details || "Standard Vehicle",
    rating: user?.avg_rating ?? 5.0,
    photo: user?.profile_photo || "",
    subaccount_code: user?.subaccount_code || "",
  });
}

/**
 * Parse any driver QR — the current JSON payload OR the legacy delimited
 * string — into a normalized shape. Returns null when the data isn't a
 * recognizable Emilgo driver code.
 */
export function parseDriverQR(data: string): DriverQR | null {
  if (!data || typeof data !== "string") return null;
  const trimmed = data.trim();

  // 1. Current format: JSON payload.
  if (trimmed.startsWith("{")) {
    try {
      const p = JSON.parse(trimmed);
      if (p && p.type === TEQIL_DRV_TYPE && p.driver_id) {
        return {
          driver_id: String(p.driver_id),
          subaccount_code: p.subaccount_code ? String(p.subaccount_code) : undefined,
          name: p.name ? String(p.name) : undefined,
          vehicle: p.vehicle ? String(p.vehicle) : undefined,
          rating: typeof p.rating === "number" ? p.rating : undefined,
          photo: p.photo ? String(p.photo) : undefined,
        };
      }
    } catch {
      // not valid JSON — fall through
    }
    return null;
  }

  // 2. Legacy format: "TEQIL:DRV-<driver_id>:<subaccount_code>"
  //    (also tolerate a trailing " …" from older Share messages).
  if (trimmed.startsWith(LEGACY_PREFIX)) {
    const body = trimmed.slice(LEGACY_PREFIX.length).split(/\s/)[0];
    const colon = body.indexOf(":");
    const driver_id = colon === -1 ? body : body.slice(0, colon);
    const subaccount_code = colon === -1 ? "" : body.slice(colon + 1);
    if (!driver_id) return null;
    return { driver_id, subaccount_code: subaccount_code || undefined };
  }

  return null;
}

/**
 * Serialize a parsed driver into the `driver_payload` route param that
 * payment.tsx / verify-driver.tsx read to render a driver WITHOUT a DB fetch.
 */
export function toDriverPayload(d: DriverQR): string {
  return JSON.stringify({
    driver_id: d.driver_id,
    name: d.name,
    vehicle: d.vehicle,
    rating: d.rating,
    photo: d.photo,
  });
}
