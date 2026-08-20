// supabase/functions/username-login/index.ts
//
// Signs a user in by USERNAME without ever telling the device their email.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// GoTrue can only authenticate an email or a phone — there is no username
// grant. So something has to turn "danieloky" into an email address, and until
// now that something was `get_user_by_username`, an anon-executable RPC. The
// anon key ships inside the app bundle, so anybody could walk a username list
// and collect the email address behind each one. A login screen has to work
// before a session exists, which is exactly why the resolution cannot live on
// the client: this function does it with the service-role key, server-side, and
// returns a SESSION rather than an email.
//
// ── Enumeration ─────────────────────────────────────────────────────────────
// "No such username" and "wrong password" return the same status and the same
// sentence, deliberately. Distinguishing them turns this endpoint back into the
// membership oracle it was written to remove.
//
// Deployed with verify_jwt = false — there is no JWT yet; that is the point.
// Brute force is bounded by GoTrue's own rate limit on the token endpoint,
// which this calls through rather than around.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** One sentence for every failure mode a stranger could probe. */
const GENERIC = "Wrong username or password.";

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
  let password = "";
  try {
    const body = await req.json();
    username = String(body?.username ?? "").trim().replace(/^@/, "").toLowerCase();
    password = String(body?.password ?? "");
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  if (!username || !password) return json({ error: GENERIC }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Service role: the only context allowed to see the email behind a handle.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: rows, error: lookupErr } = await admin.rpc("get_user_by_username", {
    p_username: username,
  });
  if (lookupErr) {
    console.error("[username-login] lookup:", lookupErr.message);
    return json({ error: "Sign in is unavailable right now. Please try again." }, 503);
  }

  const email: string | undefined = Array.isArray(rows) ? rows[0]?.email : undefined;
  if (!email) return json({ error: GENERIC }, 400);

  // Anon client: authenticate exactly as the app would with an email, so
  // GoTrue's rate limiting, lockouts and audit log all still apply.
  const pub = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await pub.auth.signInWithPassword({ email, password });

  if (error || !data?.session) return json({ error: GENERIC }, 400);

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: data.user,
  });
});
