/**
 * server/loadenv.ts
 *
 * Loads .env into process.env for the Node server. Must be imported FIRST in
 * index.ts — before ./routes (and its Paystack/KYC modules), which read their
 * secret keys at module load. Expo only injects EXPO_PUBLIC_* into the app bundle;
 * the server needs the non-public secrets (PAYSTACK_SECRET_KEY, SMILE_*) loaded here.
 */

try {
  // Node ≥20.12 built-in; loads ./.env relative to cwd. No dependency needed.
  (process as any).loadEnvFile?.();
} catch {
  // No .env file present — fall back to the real process environment.
}
