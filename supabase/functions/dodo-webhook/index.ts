// supabase/functions/dodo-webhook/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "npm:standardwebhooks@1";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // Dodo webhooks are POST
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const secret = Deno.env.get("DODO_WEBHOOK_SECRET");
  if (!secret) return json(500, { error: "Missing DODO_WEBHOOK_SECRET in Supabase secrets" });

  // Standard Webhooks headers (used by Dodo)
  const webhookId = req.headers.get("webhook-id");
  const webhookTs = req.headers.get("webhook-timestamp");
  const webhookSig = req.headers.get("webhook-signature");

  if (!webhookId || !webhookTs || !webhookSig) {
    return json(400, {
      error: "Missing webhook headers",
      hasId: !!webhookId,
      hasTs: !!webhookTs,
      hasSig: !!webhookSig,
    });
  }

  const payload = await req.text();

  // Verify signature
  try {
    const wh = new Webhook(secret);
    // standardwebhooks expects these exact keys:
    wh.verify(payload, {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTs,
      "webhook-signature": webhookSig,
    });
  } catch (e) {
    console.error("Webhook verification failed:", e);
    return json(400, { error: "Invalid signature" });
  }

  // Parse event
  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  // Helpful logs (you should now see these in Supabase Logs)
  console.log("Dodo webhook received:", {
    type: event?.type,
    business_id: event?.business_id,
    payment_id: event?.data?.payment_id,
    subscription_id: event?.data?.subscription_id,
  });

  // TODO: Later we’ll map events -> your DB updates (Pro tier, etc.)
  return json(200, { ok: true });
});
