// /**
//  * src/services/auth.ts
//  *
//  * Offline-aware authentication layer on top of Supabase.
//  * - signInOfflineAware: tries Supabase first; if network fails, falls back to
//  *   locally-cached credentials so drivers can log in without internet.
//  * - cacheCredentials / clearCachedCredentials: manage the local cache.
//  */
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { signUp as supabaseSignUp, signIn as supabaseSignIn } from "./supabase";
// import type { User } from "../models/types";
// // import * as LocalAuthentication from "expo-local-authentication";

// const BIOMETRIC_EMAIL_KEY = "teqil_biometric_email";
// const BIOMETRIC_PW_KEY    = "teqil_biometric_pw"; // use expo-secure-store in production


// const CACHED_USER_KEY = "teqil_cached_user";
// const CACHED_EMAIL_KEY = "teqil_cached_email";
// // We store a bcrypt-style hash in production; for this MVP we store a salted
// // hash so the plain password is never persisted.
// const CACHED_PW_HASH_KEY = "teqil_cached_pw_hash";

// // ─── Simple deterministic hash (NOT crypto-secure; sufficient for offline MVP) ─
// async function hashPassword(password: string, email: string): Promise<string> {
//   // Combine email+password so identical passwords hash differently per user
//   const raw = `${email.toLowerCase().trim()}:${password}`;
//   // Encode to bytes and produce a hex string via subtle crypto when available,
//   // falling back to a lightweight pure-JS version on older RN environments.
//   try {
//     const encoder = new TextEncoder();
//     const data = encoder.encode(raw);
//     const hashBuffer = await crypto.subtle.digest("SHA-256", data);
//     const hashArray = Array.from(new Uint8Array(hashBuffer));
//     return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
//   } catch {
//     // Fallback: djb2 hash (good enough for offline cache guard)
//     let h = 5381;
//     for (let i = 0; i < raw.length; i++) {
//       h = (h * 33) ^ raw.charCodeAt(i);
//     }
//     return (h >>> 0).toString(16);
//   }
// }

// // ─── Cache helpers ────────────────────────────────────────────────────────────

// /** Persist successful login so we can replay it offline. */
// export async function cacheCredentials(
//   user: User,
//   email: string,
//   password: string
// ): Promise<void> {
//   const hash = await hashPassword(password, email);
//   await AsyncStorage.multiSet([
//     [CACHED_USER_KEY, JSON.stringify(user)],
//     [CACHED_EMAIL_KEY, email.toLowerCase().trim()],
//     [CACHED_PW_HASH_KEY, hash],
//   ]);
// }

// /** Remove cached credentials (e.g. on logout). */
// export async function clearCachedCredentials(): Promise<void> {
//   await AsyncStorage.multiRemove([
//     CACHED_USER_KEY,
//     CACHED_EMAIL_KEY,
//     CACHED_PW_HASH_KEY,
//   ]);
// }

// /** Return the cached User if email + password match the stored hash. */
// async function tryOfflineLogin(
//   email: string,
//   password: string
// ): Promise<User | null> {
//   try {
//     const [[, cachedEmail], [, cachedHash], [, cachedUser]] =
//       await AsyncStorage.multiGet([
//         CACHED_EMAIL_KEY,
//         CACHED_PW_HASH_KEY,
//         CACHED_USER_KEY,
//       ]);

//     if (!cachedEmail || !cachedHash || !cachedUser) return null;
//     if (cachedEmail !== email.toLowerCase().trim()) return null;

//     const inputHash = await hashPassword(password, email);
//     if (inputHash !== cachedHash) return null;

//     return JSON.parse(cachedUser) as User;
//   } catch {
//     return null;
//   }
// }

// // ─── Public API ───────────────────────────────────────────────────────────────

// export interface SignInResult {
//   user: User;
//   offlineMode: boolean;
// }

// /**
//  * Attempts Supabase sign-in. If the device is offline (or Supabase throws a
//  * network error), falls back to locally-cached credentials.
//  *
//  * Throws if:
//  *  - Supabase returns an auth error (wrong password, user not found, etc.)
//  *  - Device is offline AND no cached credentials match.
//  */
// export async function signInOfflineAware(
//   email: string,
//   password: string
// ): Promise<SignInResult> {
//   // ── 1. Try Supabase ────────────────────────────────────────────────────────
//   try {
//     const data = await supabaseSignIn(email.trim().toLowerCase(), password);
//     const supaUser = data.user;

//     if (!supaUser) throw new Error("No user returned from Supabase.");

//     const meta = supaUser.user_metadata ?? {};
//     const user: User = {
//       id: supaUser.id,
//       full_name: meta.full_name ?? null,
//       phone: meta.phone ?? "",
//       email: supaUser.email ?? email,
//       age: meta.age ?? 18,
//       role: meta.role ?? "passenger",
//       driver_id: meta.driver_id,
//       profile_photo: meta.profile_photo,
//       vehicle_details: meta.vehicle_details,
//       park_location: meta.park_location,
//       park_name: meta.park_name,
//       points_balance: meta.points_balance ?? 0,
//       avg_rating: meta.avg_rating,
//       profile_complete: meta.profile_complete ?? false,
//       created_at: supaUser.created_at,
//     };

//     // Cache for future offline use
//     await cacheCredentials(user, email, password);

//     return { user, offlineMode: false };
//   } catch (err: unknown) {
//     // ── 2. Decide if this is a network failure or an auth failure ────────────
//     const message =
//       err instanceof Error ? err.message.toLowerCase() : "";

//     const isNetworkError =
//       message.includes("network") ||
//       message.includes("fetch") ||
//       message.includes("connect") ||
//       message.includes("offline") ||
//       message.includes("timeout") ||
//       message.includes("unable to resolve");

//     if (!isNetworkError) {
//       // Real auth error — surface it to the caller
//       throw err;
//     }

//     // ── 3. Offline fallback ──────────────────────────────────────────────────
//     const cachedUser = await tryOfflineLogin(email, password);
//     if (cachedUser) {
//       return { user: cachedUser, offlineMode: true };
//     }

//     throw new Error(
//       "You appear to be offline and no cached credentials were found. " +
//         "Please connect to the internet and try again."
//     );
//   }
// }


// // Add this export
// export async function signUpOfflineAware(
//   email: string,
//   password: string,
//   metadata: Record<string, unknown>
// ): Promise<{ user: User; offlineMode: boolean }> {
//   // Sign‑up always requires internet (can't create account offline)
//   try {
//     const data = await supabaseSignUp(email, password, metadata);
//     const supaUser = data.user;

//     if (!supaUser) {
//       throw new Error("No user returned from Supabase.");
//     }

//     // Build user object from metadata and Supabase response
//     const user: User = {
//       id: supaUser.id,
//       full_name: (metadata.full_name as string) ?? null,
//       phone: (metadata.phone as string) ?? "",
//       email: supaUser.email ?? email,
//       age: (metadata.age as number) ?? 18,
//       role: (metadata.role as any) ?? "passenger",
//       driver_id: metadata.driver_id as string | undefined,
//       profile_photo: metadata.profile_photo as string | undefined,
//       vehicle_details: metadata.vehicle_details as string | undefined,
//       park_location: metadata.park_location as string | undefined,
//       park_name: metadata.park_name as string | undefined,
//       points_balance: (metadata.points_balance as number) ?? 0,
//       avg_rating: metadata.avg_rating as number | undefined,
//       profile_complete: (metadata.profile_complete as boolean) ?? false,
//       created_at: supaUser.created_at,
//     };

//     // Cache credentials for offline login later
//     await cacheCredentials(user, email, password);

//     return { user, offlineMode: false };
//   } catch (error) {
//     // If network error, re‑throw with a user‑friendly message
//     const message =
//       error instanceof Error ? error.message.toLowerCase() : "";
//     const isNetworkError =
//       message.includes("network") ||
//       message.includes("fetch") ||
//       message.includes("connect") ||
//       message.includes("offline") ||
//       message.includes("timeout") ||
//       message.includes("unable to resolve");

//     if (isNetworkError) {
//       throw new Error(
//         "No internet connection. Please connect to the internet and try again."
//       );
//     }
//     // Otherwise, re‑throw the original error (e.g., duplicate email, etc.)
//     throw error;
//   }
// }








// // ─── ADD to src/services/auth.ts ─────────────────────────────────────────────
// // Paste at the bottom of the existing file.


// /**
//  * Persist credentials for biometric re-login after a successful password login.
//  * Production note: swap AsyncStorage for expo-secure-store here.
//  */
// export async function saveBiometricCredentials(
//   email: string,
//   password: string
// ): Promise<void> {
//   await AsyncStorage.multiSet([
//     [BIOMETRIC_EMAIL_KEY, email.toLowerCase().trim()],
//     [BIOMETRIC_PW_KEY, password],
//   ]);
// }

// export async function clearBiometricCredentials(): Promise<void> {
//   await AsyncStorage.multiRemove([BIOMETRIC_EMAIL_KEY, BIOMETRIC_PW_KEY]);
// }

// export async function getBiometricCredentials(): Promise<{ email: string; password: string } | null> {
//   const [[, email], [, pw]] = await AsyncStorage.multiGet([BIOMETRIC_EMAIL_KEY, BIOMETRIC_PW_KEY]);
//   if (!email || !pw) return null;
//   return { email, password: pw };
// }

// export interface BiometricLoginResult {
//   supported: boolean;
//   enrolled: boolean;
//   success: boolean;
//   user?: import("../models/types").User;
//   offlineMode?: boolean;
//   error?: string;
// }

// /**
//  * Attempt biometric authentication, then replay stored credentials if successful.
//  *
//  * Returns { success: false, error: "no_credentials" } if the user hasn't
//  * signed in with a password yet (biometric has nothing to replay).
//  */
// export async function signInWithBiometrics(): Promise<BiometricLoginResult> {
//   // Lazy import so the module isn't required on devices without it
//   let LocalAuthentication: typeof import("expo-local-authentication");
//   try {
//     LocalAuthentication = await import("expo-local-authentication");
//   } catch {
//     return { supported: false, enrolled: false, success: false };
//   }

//   const compatible = await LocalAuthentication.hasHardwareAsync();
//   if (!compatible) return { supported: false, enrolled: false, success: false };

//   const enrolled = await LocalAuthentication.isEnrolledAsync();
//   if (!enrolled) return { supported: true, enrolled: false, success: false };

//   const result = await LocalAuthentication.authenticateAsync({
//     promptMessage: "Sign in to Teqil",
//     fallbackLabel: "Use password",
//     cancelLabel: "Cancel",
//     disableDeviceFallback: false,
//   });

//   if (!result.success) {
//     return { supported: true, enrolled: true, success: false, error: result.error };
//   }

//   const creds = await getBiometricCredentials();
//   if (!creds) {
//     return { supported: true, enrolled: true, success: false, error: "no_credentials" };
//   }

//   try {
//     const { user, offlineMode } = await signInOfflineAware(creds.email, creds.password);
//     return { supported: true, enrolled: true, success: true, user, offlineMode };
//   } catch (err) {
//     return {
//       supported: true,
//       enrolled: true,
//       success: false,
//       error: err instanceof Error ? err.message : "auth_failed",
//     };
//   }
// }




/**
 * src/services/auth.ts
 *
 * Offline-aware authentication layer on top of Supabase.
 *
 * Key addition: after every successful signUp or profile update we also
 * upsert the row in public.users so driver_id is immediately searchable
 * without waiting for the Supabase trigger to fire.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signUp as supabaseSignUp, signIn as supabaseSignIn, supabase } from "./supabase";
import { secureSet, secureDelete, secureGetWithLegacyMigration } from "./secureStore";
import type { User } from "../models/types";

// Sensitive keys → encrypted SecureStore (Keychain/Keystore).
const BIOMETRIC_EMAIL_KEY = "teqil_biometric_email";
const BIOMETRIC_PW_KEY    = "teqil_biometric_pw";
const CACHED_PW_HASH_KEY  = "teqil_cached_pw_hash";
// Non-secret profile cache → regular AsyncStorage.
const CACHED_USER_KEY     = "teqil_cached_user";
const CACHED_EMAIL_KEY    = "teqil_cached_email";

// ─── Simple deterministic hash (offline cache guard only) ─────────────────────
async function hashPassword(password: string, email: string): Promise<string> {
  const raw = `${email.toLowerCase().trim()}:${password}`;
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 5381;
    for (let i = 0; i < raw.length; i++) h = (h * 33) ^ raw.charCodeAt(i);
    return (h >>> 0).toString(16);
  }
}

// ─── Resolve Username ─────────────────────────────────────────────────────────
export async function checkUsernameExists(
  username: string
): Promise<{ email: string; device_fingerprint: string | null } | null> {
  const uname = username.trim().toLowerCase();
  if (!uname) return null;

  // Primary: SECURITY DEFINER RPC — bypasses RLS without exposing the table.
  try {
    const { data, error } = await supabase.rpc('get_user_by_username', { p_username: uname });
    if (!error && Array.isArray(data) && data.length > 0) {
      return {
        email: data[0].email,
        device_fingerprint: data[0].device_fingerprint ?? null,
      };
    }
    if (error) console.warn('get_user_by_username RPC error, falling back:', error.message);
  } catch (err) {
    console.warn('get_user_by_username RPC threw, falling back:', err);
  }

  // Fallback: case-insensitive direct lookup. Covers a not-yet-applied migration
  // or usernames stored with different casing. (Needs anon SELECT on users.)
  // Escape LIKE wildcards so an underscore in a username matches literally.
  try {
    const escaped = uname.replace(/[%_\\]/g, "\\$&");
    const { data, error } = await supabase
      .from('users')
      .select('email, device_fingerprint')
      .ilike('username', escaped)
      .limit(1);
    if (!error && data && data.length > 0) {
      return {
        email: data[0].email as string,
        device_fingerprint: (data[0].device_fingerprint as string) ?? null,
      };
    }
    if (error) console.warn('users fallback lookup error:', error.message);
  } catch (err) {
    console.error('checkUsernameExists fallback failed:', err);
  }

  return null;
}

// ─── Sync a User object into public.users ─────────────────────────────────────
// Called after signup and after every profile update so that
// driver_id (and other fields) are immediately searchable via Supabase queries.
export async function syncUserToPublicTable(user: User): Promise<void> {
  try {
    await supabase.from("users").upsert(
      {
        id:               user.id,
        username:         user.username ?? null,
        first_name:       user.first_name ?? null,
        last_name:        user.last_name ?? null,
        full_name:        user.full_name,
        phone:            user.phone,
        email:            user.email,
        age:              user.age,
        role:             user.role,
        driver_id:        user.driver_id ?? null,
        profile_photo:    user.profile_photo ?? null,
        vehicle_details:  user.vehicle_details ?? null,
        park_location:    user.park_location ?? null,
        park_name:        user.park_name ?? null,
        points_balance:   user.points_balance ?? 0,
        credits_balance:  user.credits_balance ?? 0,
        device_fingerprint: user.device_fingerprint ?? null,
        avg_rating:       user.avg_rating ?? null,
        profile_complete: user.profile_complete ?? false,
        push_token:       user.push_token ?? null,
        updated_at:       new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch (err) {
    // Non-fatal: the trigger will handle it when the device is back online
    console.warn("[Auth] syncUserToPublicTable failed:", err);
  }
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

export async function cacheCredentials(
  user: User,
  email: string,
  password: string
): Promise<void> {
  const hash = await hashPassword(password, email);
  // Profile + email are not secret → AsyncStorage. The password hash is → SecureStore.
  await AsyncStorage.multiSet([
    [CACHED_USER_KEY,  JSON.stringify(user)],
    [CACHED_EMAIL_KEY, email.toLowerCase().trim()],
  ]);
  await secureSet(CACHED_PW_HASH_KEY, hash);
}

export async function clearCachedCredentials(): Promise<void> {
  await AsyncStorage.multiRemove([CACHED_USER_KEY, CACHED_EMAIL_KEY]);
  await secureDelete(CACHED_PW_HASH_KEY);
}

async function tryOfflineLogin(
  email: string,
  password: string
): Promise<User | null> {
  try {
    const [[, cachedEmail], [, cachedUser]] = await AsyncStorage.multiGet([
      CACHED_EMAIL_KEY,
      CACHED_USER_KEY,
    ]);
    const cachedHash = await secureGetWithLegacyMigration(CACHED_PW_HASH_KEY);
    if (!cachedEmail || !cachedHash || !cachedUser) return null;
    if (cachedEmail !== email.toLowerCase().trim()) return null;
    const inputHash = await hashPassword(password, email);
    if (inputHash !== cachedHash) return null;
    return JSON.parse(cachedUser) as User;
  } catch {
    return null;
  }
}

// ─── Sign in ──────────────────────────────────────────────────────────────────

export interface SignInResult {
  user: User;
  offlineMode: boolean;
}

export async function signInOfflineAware(
  email: string,
  password: string
): Promise<SignInResult> {
  try {
    const data = await supabaseSignIn(email.trim().toLowerCase(), password);
    const supaUser = data.user;
    if (!supaUser) throw new Error("No user returned from Supabase.");

    const meta = supaUser.user_metadata ?? {};
    const user: User = {
      id:               supaUser.id,
      username:         meta.username ?? null,
      first_name:       meta.first_name ?? null,
      last_name:        meta.last_name ?? null,
      full_name:        meta.full_name ?? null,
      phone:            meta.phone ?? "",
      email:            supaUser.email ?? email,
      age:              meta.age ?? 18,
      role:             meta.role ?? "passenger",
      driver_id:        meta.driver_id,
      profile_photo:    meta.profile_photo,
      vehicle_details:  meta.vehicle_details,
      park_location:    meta.park_location,
      park_name:        meta.park_name,
      points_balance:   meta.points_balance ?? 0,
      credits_balance:  meta.credits_balance ?? 0,
      device_fingerprint: meta.device_fingerprint,
      avg_rating:       meta.avg_rating,
      profile_complete: meta.profile_complete ?? false,
      created_at:       supaUser.created_at,
    };

    await cacheCredentials(user, email, password);
    // Ensure public.users is up-to-date (trigger may not have fired yet)
    syncUserToPublicTable(user).catch(() => {});

    return { user, offlineMode: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    const isNetworkError =
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("connect") ||
      message.includes("offline") ||
      message.includes("timeout") ||
      message.includes("unable to resolve");

    if (!isNetworkError) throw err;

    const cachedUser = await tryOfflineLogin(email, password);
    if (cachedUser) return { user: cachedUser, offlineMode: true };

    throw new Error(
      "You appear to be offline and no cached credentials were found. " +
        "Please connect to the internet and try again."
    );
  }
}

// ─── Sign up ──────────────────────────────────────────────────────────────────

export async function signUpOfflineAware(
  email: string,
  password: string,
  metadata: Record<string, unknown>
): Promise<{ user: User; offlineMode: boolean }> {
  try {
    const data = await supabaseSignUp(email, password, metadata);
    const supaUser = data.user;
    if (!supaUser) throw new Error("No user returned from Supabase.");

    const user: User = {
      id:               supaUser.id,
      username:         (metadata.username as string) ?? null,
      first_name:       (metadata.first_name as string) ?? null,
      last_name:        (metadata.last_name as string) ?? null,
      full_name:        (metadata.full_name as string) ?? null,
      phone:            (metadata.phone as string) ?? "",
      email:            supaUser.email ?? email,
      age:              (metadata.age as number) ?? 18,
      role:             (metadata.role as any) ?? "passenger",
      driver_id:        metadata.driver_id as string | undefined,
      profile_photo:    metadata.profile_photo as string | undefined,
      vehicle_details:  metadata.vehicle_details as string | undefined,
      park_location:    metadata.park_location as string | undefined,
      park_name:        metadata.park_name as string | undefined,
      points_balance:   (metadata.points_balance as number) ?? 0,
      credits_balance:  (metadata.credits_balance as number) ?? 10,
      device_fingerprint: metadata.device_fingerprint as string | undefined,
      avg_rating:       metadata.avg_rating as number | undefined,
      profile_complete: (metadata.profile_complete as boolean) ?? false,
      created_at:       supaUser.created_at,
    };

    await cacheCredentials(user, email, password);
    // Write to public.users immediately so driver_id is searchable right away
    await syncUserToPublicTable(user);

    return { user, offlineMode: false };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const isNetworkError =
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("connect") ||
      message.includes("offline") ||
      message.includes("timeout") ||
      message.includes("unable to resolve");

    if (isNetworkError) {
      throw new Error(
        "No internet connection. Please connect to the internet and try again."
      );
    }
    throw error;
  }
}

// ─── Biometric helpers ────────────────────────────────────────────────────────

export async function saveBiometricCredentials(
  email: string,
  password: string
): Promise<void> {
  // Both are stored in the encrypted Keychain/Keystore, never plaintext.
  await secureSet(BIOMETRIC_EMAIL_KEY, email.toLowerCase().trim());
  await secureSet(BIOMETRIC_PW_KEY, password);
}

export async function clearBiometricCredentials(): Promise<void> {
  await secureDelete(BIOMETRIC_EMAIL_KEY);
  await secureDelete(BIOMETRIC_PW_KEY);
}

export async function getBiometricCredentials(): Promise<{
  email: string;
  password: string;
} | null> {
  // Migrates any legacy plaintext-AsyncStorage credentials into SecureStore on read.
  const email = await secureGetWithLegacyMigration(BIOMETRIC_EMAIL_KEY);
  const pw = await secureGetWithLegacyMigration(BIOMETRIC_PW_KEY);
  if (!email || !pw) return null;
  return { email, password: pw };
}

export interface BiometricLoginResult {
  supported: boolean;
  enrolled: boolean;
  success: boolean;
  user?: User;
  offlineMode?: boolean;
  error?: string;
}

export async function signInWithBiometrics(): Promise<BiometricLoginResult> {
  let LocalAuthentication: typeof import("expo-local-authentication");
  try {
    LocalAuthentication = await import("expo-local-authentication");
  } catch {
    return { supported: false, enrolled: false, success: false };
  }

  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return { supported: false, enrolled: false, success: false };

  const enrolled = await LocalAuthentication.isEnrolledAsync();

  // Attempt authentication even when Face ID / Touch ID isn't enrolled — with
  // disableDeviceFallback:false the OS falls back to the device passcode.
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage:        "Sign in to Teqil",
    fallbackLabel:        "Use passcode",
    cancelLabel:          "Cancel",
    disableDeviceFallback: false,
  });

  if (!result.success) {
    return {
      supported: true,
      enrolled,
      success: false,
      error: result.error,
    };
  }

  const creds = await getBiometricCredentials();
  if (!creds) {
    return {
      supported: true,
      enrolled: true,
      success: false,
      error: "no_credentials",
    };
  }

  try {
    const { user, offlineMode } = await signInOfflineAware(
      creds.email,
      creds.password
    );
    return { supported: true, enrolled: true, success: true, user, offlineMode };
  } catch (err) {
    return {
      supported: true,
      enrolled: true,
      success: false,
      error: err instanceof Error ? err.message : "auth_failed",
    };
  }
}