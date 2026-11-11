// @ts-nocheck — runs on Supabase (Deno), not in this project, so VS Code can't check it
// Our Room — "notify" Edge Function.
//
// The site calls this (signed in) when one of you leaves something for the
// other: a bottle note, a letter, a time capsule. It sends a push notification
// to every device the other person turned notifications on for.
//
// Secrets it needs (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// The project's URL and keys are provided to every Edge Function by Supabase
// (the new sb_publishable_/sb_secret_ keys, or the older anon/service_role).
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:andreiventura04@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// the project's own keys: new-style first, the older names as a fallback
function projectKey(plural: string, legacy: string): string {
  try {
    const all = JSON.parse(Deno.env.get(plural) ?? "{}");
    if (all.default) return all.default;
    const first = Object.values(all)[0];
    if (typeof first === "string") return first;
  } catch { /* not set */ }
  return Deno.env.get(legacy) ?? "";
}
const PUBLIC_KEY = projectKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SECRET_KEY = projectKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // who is calling: must be one of the two of you
  const url = Deno.env.get("SUPABASE_URL")!;
  const asCaller = createClient(url, PUBLIC_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: me } = await asCaller.rpc("who_am_i");
  if (me !== "andrei" && me !== "cherryl") return json({ error: "not allowed" }, 403);

  let input: { to?: string; title?: string; body?: string; tag?: string };
  try { input = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const to = input.to;
  if ((to !== "andrei" && to !== "cherryl") || to === me) return json({ error: "bad recipient" }, 400);

  const payload = JSON.stringify({
    title: String(input.title ?? "Our Room").slice(0, 120),
    body: String(input.body ?? "").slice(0, 240),
    tag: String(input.tag ?? "ourroom").slice(0, 40),
    url: "/",
  });

  // their devices (read with the service key: they're not the caller's rows)
  const admin = createClient(url, SECRET_KEY);
  const { data: subs, error } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("who", to);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 * 3 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // the device turned notifications off or the browser was reset: forget it
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", code, (e as Error).message);
    }
  }
  return json({ sent });
});