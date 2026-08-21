// src/services/password.ts
//
// Password rules, scored against the password the USER typed.
//
// ── Why the generator is gone ──────────────────────────────────────────────
// Registration used to open a modal on focus offering a generated password,
// and iOS offered its own on top of that. Both are removed, per the brief: the
// user types their own. That is a product decision, not a security one — the
// argument for generated passwords is real — so the compensating control is
// that the rules below are stricter than they were (8 characters and nothing
// else) and the meter shows why in words rather than as a coloured bar nobody
// can act on.
//
// ── What "strong" means here ───────────────────────────────────────────────
// Length does most of the work — an 8-character password with every character
// class is weaker than a 14-character phrase — so length is weighted heaviest
// and the classes are a floor rather than the score. The three rejections that
// matter more than any of it:
//
//   1. a password that CONTAINS the user's own email, username or name;
//   2. a password on the short list of the ones attackers try first;
//   3. a keyboard run or a single repeated character.
//
// Those three cover the overwhelming majority of real credential stuffing, and
// none of them are caught by "must contain a number".

export const MIN_LENGTH = 10;
export const MAX_LENGTH = 72; // bcrypt truncates past 72 bytes; refuse rather than silently cut

/**
 * The passwords tried first in a credential-stuffing run, plus the ones this
 * app will attract specifically. Deliberately short: a real breach-corpus
 * check belongs server-side against k-anonymised hashes, and shipping a
 * megabyte of hashes in the bundle would be worse than useless.
 */
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "p@ssword", "p@ssw0rd",
  "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "iloveyou", "sunshine", "princess", "football", "baseball", "welcome1",
  "abc12345", "letmein1", "monkey123", "dragon123", "admin123", "trustno1",
  "emilgo", "emilgo123", "teqil", "teqil123", "nigeria", "nigeria123",
  "danfo123", "lagos123", "naija123",
]);

const KEYBOARD_RUNS = [
  "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "1234567890", "0987654321", "abcdefghijklmnopqrstuvwxyz",
];

export interface PasswordCheck {
  /** Every rule, so the UI can show what is left rather than one error. */
  rules: { key: string; label: string; met: boolean }[];
  /** 0–4. Only reaches 3+ once every rule is met. */
  score: number;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  /** True when the password may be submitted at all. */
  acceptable: boolean;
  /** The single most useful thing to fix next, or null when there is nothing. */
  advice: string | null;
}

/** Anything personal that must not appear inside the password. */
export interface PasswordContext {
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

function personalTokens(ctx: PasswordContext): string[] {
  const out: string[] = [];
  if (ctx.email) {
    const local = ctx.email.split("@")[0];
    if (local.length >= 3) out.push(local);
    const domain = ctx.email.split("@")[1]?.split(".")[0];
    if (domain && domain.length >= 3) out.push(domain);
  }
  for (const v of [ctx.username, ctx.firstName, ctx.lastName]) {
    if (v && v.trim().length >= 3) out.push(v.trim());
  }
  return out.map((s) => s.toLowerCase());
}

function hasKeyboardRun(lower: string): boolean {
  // Four in a row is enough to catch "qwer" and "3456" without flagging a
  // legitimate word that happens to contain "abcd".
  for (const run of KEYBOARD_RUNS) {
    for (let i = 0; i + 4 <= run.length; i++) {
      const seg = run.slice(i, i + 4);
      if (lower.includes(seg)) return true;
      if (lower.includes([...seg].reverse().join(""))) return true;
    }
  }
  return false;
}

export function checkPassword(pw: string, ctx: PasswordContext = {}): PasswordCheck {
  const lower = pw.toLowerCase();
  const tokens = personalTokens(ctx);

  const longEnough = pw.length >= MIN_LENGTH;
  const notTooLong = pw.length <= MAX_LENGTH;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const notPersonal = pw.length > 0 && !tokens.some((tk) => lower.includes(tk));
  const notCommon =
    pw.length > 0 && !COMMON.has(lower) && ![...COMMON].some((c) => lower.includes(c) && c.length >= 6);
  const notRepeated = !/(.)\1{3,}/.test(pw);
  const notRun = pw.length > 0 && !hasKeyboardRun(lower);

  const rules = [
    { key: "length",   label: `At least ${MIN_LENGTH} characters`, met: longEnough && notTooLong },
    { key: "case",     label: "Upper and lower case",              met: hasLower && hasUpper },
    { key: "digit",    label: "A number",                          met: hasDigit },
    { key: "symbol",   label: "A symbol",                          met: hasSymbol },
    { key: "personal", label: "Not your name, email or username",  met: notPersonal },
    { key: "guess",    label: "Not a commonly guessed password",   met: notCommon && notRepeated && notRun },
  ];

  const acceptable = rules.every((r) => r.met);

  // Length carries the score, because it is what actually costs an attacker
  // time. The classes are a floor, not a ladder.
  let score = 0;
  if (pw.length >= 8) score = 1;
  if (pw.length >= MIN_LENGTH) score = 2;
  if (acceptable && pw.length >= 12) score = 3;
  if (acceptable && pw.length >= 16) score = 4;
  if (!acceptable && score > 2) score = 2;

  const label: PasswordCheck["label"] =
    pw.length === 0 ? "Too short"
    : pw.length < MIN_LENGTH ? "Too short"
    : score >= 4 ? "Strong"
    : score === 3 ? "Good"
    : acceptable ? "Fair"
    : "Weak";

  // ONE thing to fix, chosen in the order that matters most. A list of six
  // failures is a wall; the next step is actionable.
  const advice =
    !notTooLong ? `Passwords can be at most ${MAX_LENGTH} characters.`
    : !notPersonal ? "Don't put your name, email or username in your password."
    : !notCommon ? "That is one of the first passwords an attacker tries."
    : !notRepeated ? "Avoid repeating the same character."
    : !notRun ? "Avoid runs like \"qwer\" or \"3456\"."
    : !longEnough ? `${MIN_LENGTH - pw.length} more character${MIN_LENGTH - pw.length === 1 ? "" : "s"} needed.`
    : !(hasLower && hasUpper) ? "Mix upper and lower case."
    : !hasDigit ? "Add a number."
    : !hasSymbol ? "Add a symbol."
    : pw.length < 16 ? "Longer is stronger — a short phrase beats a short password."
    : null;

  return { rules, score, label, acceptable, advice };
}

/**
 * Props that switch off every password manager, autofill and suggestion path.
 *
 * There is no single flag for this. iOS decides to offer a strong password from
 * `textContentType="newPassword"` plus a form it recognises, and the reliable
 * way to opt out is to claim a content type it never autofills — hence
 * `oneTimeCode`, which is the documented workaround. `passwordRules=""` stops
 * the generator having anything to generate against, and Android needs
 * `importantForAutofill` rather than `autoComplete`.
 *
 * Spread onto every password field:  <TextInput {...NO_AUTOFILL} />
 */
export const NO_AUTOFILL = {
  autoComplete: "off" as const,
  autoCorrect: false,
  spellCheck: false,
  autoCapitalize: "none" as const,
  textContentType: "oneTimeCode" as const,
  passwordRules: "",
  importantForAutofill: "no" as const,
  // Suppresses the iOS QuickType bar, which is where the suggestion appears.
  keyboardType: "default" as const,
};
