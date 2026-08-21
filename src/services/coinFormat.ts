// src/services/coinFormat.ts
//
// How a `cs` amount is written. Nothing else.
//
// ── Why this is its own file ───────────────────────────────────────────────
// `src/utils/helpers.ts` is imported by almost everything, including the store
// layer, and it needs to render coins. `src/services/coins.ts` also renders
// coins — but it imports the Supabase client, so having helpers import IT would
// drag a network client into every module that wanted a number formatted, and
// risk the same import cycle the `require()` in `formatDistance` exists to
// avoid.
//
// So the formatter lives here, with no imports at all, and both sides use it.
// The alternative — two copies of the same two lines — is how "1,240 cs" and
// "1240cs" end up on adjacent screens.

/** The unit. One string, so a rename is one edit and not a search-and-replace. */
export const COIN_UNIT = "cs";

/**
 * `1,240 cs`.
 *
 * The trailing unit rather than a leading glyph is deliberate: a leading symbol
 * is how currencies are written, and the whole point of `cs` is that it is not
 * one. See COMPLIANCE.md §0.
 */
export function formatCs(amount: number | null | undefined): string {
  const n = Math.round(Number(amount ?? 0));
  return `${n.toLocaleString()} ${COIN_UNIT}`;
}

/** `+40 cs` / `-200 cs`, for a ledger row. */
export function formatCsSigned(amount: number): string {
  const n = Math.round(amount);
  return `${n > 0 ? "+" : ""}${formatCs(n)}`;
}
