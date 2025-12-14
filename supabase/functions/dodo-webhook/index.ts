// supabase/functions/dodo-webhook/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Webhook } from "https://esm.sh/svix@1.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  // Webhooks sometimes do preflight (rare), safe to support
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const secret = Deno.env.get("DODO_WEBHOOK_SECRET") ?? "";
  if (!secret) {
    console.error("[dodo-webhook] Missing DODO_WEBHOOK_SECRET in Supabase Secrets");
    return json(500, { ok: false, error: "Server not configured" });
  }

  // IMPORTANT: use raw body for signature verification
  const payload = await req.text();

  // Svix headers (Dodo uses Svix – your log shows Svix sender)
  const svix_id = req.headers.get("svix-id") ?? "";
  const svix_timestamp = req.headers.get("svix-timestamp") ?? "";
  const svix_signature = req.headers.get("svix-signature") ?? "";

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error("[dodo-webhook] Missing Svix headers", {
      svix_id: !!svix_id,
      svix_timestamp: !!svix_timestamp,
      svix_signature: !!svix_signature,
    });
    return json(400, { ok: false, error: "Missing webhook signature headers" });
  }

  let event: any;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("[dodo-webhook] Signature verification failed:", err);
    return json(400, { ok: false, error: "Invalid signature" });
  }

  // At this point: verified ✅
  // event.type examples: "payment.succeeded", "subscription.active", etc.
  console.info("[dodo-webhook] Verified event:", {
    type: event?.type,
    business_id: event?.data?.business_id ?? event?.business_id,
    payment_id: event?.data?.payment_id,
    subscription_id: event?.data?.subscription_id,
    customer_email: event?.data?.customer?.email,
  });

  // TODO (next step): map event → update your Supabase user (by email or metadata user_id)
  return json(200, { ok: true });
});
