// supabase/functions/username-reset/index.ts
//
// Sends a password-reset email to the address behind a username, without
// telling the caller what that address is — or whether it exists.
//
// The forgot-password form used to call `get_user_by_username`, read the email
// out of the response and pass it to `resetPasswordForEmail`. That handed the
// email to anyone who typed a handle. Here the address never leaves the server.
//
// This ALWAYS returns { ok: true }. An unknown username and a real one are
// indistinguishable from outside, which is the only way a reset form is not
// also an account-existence checker.
//
// Deployed with verify_jwt = false: a user who has lost their password has no
// session by definition.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// `redirectTo` arrives from the client, so it is attacker-controlled: an
// unchecked value turns the reset email into an open redirect that carries a
// recovery token to a domain of the attacker's choosing. Allowlist only.
const ALLOWED_REDIRECTS = [
  "teqil://reset-password",
  "https://teqil.app/reset-password",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let username = "";
  let redirectTo = ALLOWED_REDIRECTS[0];
  try {
    const body = await req.json();
    username = String(body?.username ?? "").trim().replace(/^@/, "").toLowerCase();
    const asked = String(body?.redirectTo ?? "");
    if (ALLOWED_REDIRECTS.includes(asked)) redirectTo = asked;
  } catch {
    return json({ ok: true });
  }

  if (!username) return json({ ok: true });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: rows } = await admin.rpc("get_user_by_username", { p_username: username });
  const email: string | undefined = Array.isArray(rows) ? rows[0]?.email : undefined;

  if (email) {
    const pub = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });
    const { error } = await pub.auth.resetPasswordForEmail(email, { redirectTo });
    // Logged, not returned: a mail failure is ours to see, not the caller's.
    if (error) console.error("[username-reset] send:", error.message);
  }

  return json({ ok: true });
});
