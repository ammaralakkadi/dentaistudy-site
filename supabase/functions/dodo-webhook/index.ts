// supabase/functions/dodo-webhook/index.ts

export const config = { verify_jwt: false };

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/svix@1.81.0";

type DodoEvent = {
  type: string; // e.g. "payment.succeeded"
  timestamp?: string;
  business_id?: string;
  data?: unknown;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // Dodo/Svix will POST
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const secret = Deno.env.get("DODO_WEBHOOK_SECRET");
  if (!secret) {
    // If this happens, the webhook can never verify.
    console.error("Missing env: DODO_WEBHOOK_SECRET");
    return json(500, { error: "Server misconfigured" });
  }

  // IMPORTANT: must read raw body as text BEFORE json parsing
  const rawBody = await req.text();

  // Svix signature headers
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("Missing Svix headers", {
      hasId: !!svixId,
      hasTs: !!svixTimestamp,
      hasSig: !!svixSignature,
    });
    return json(400, { error: "Missing webhook signature headers" });
  }

  // Verify signature
  let event: DodoEvent;
  try {
    const wh = new Webhook(secret);

    // Svix expects a plain object of headers
    const verified = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as unknown;

    event = verified as DodoEvent;
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return json(400, { error: "Invalid signature" });
  }

  // At this point: request is authenticated by signature ✅
  console.log("dodo-webhook hit:", {
    type: event?.type,
    timestamp: event?.timestamp,
    business_id: event?.business_id,
  });

  // TODO: handle your business logic here (update user tier, mark paid, etc.)
  // Common patterns:
  // - payment.succeeded: grant access
  // - subscription.active/renewed/updated/cancelled/expired: sync subscription state

  switch (event.type) {
    case "payment.succeeded":
      // Example: just log for now
      console.log("payment.succeeded received");
      break;

    case "subscription.active":
    case "subscription.renewed":
    case "subscription.updated":
    case "subscription.cancelled":
    case "subscription.expired":
      console.log(`subscription event received: ${event.type}`);
      break;

    default:
      console.log("Unhandled event type:", event.type);
      break;
  }

  // Return 200 quickly so Dodo marks delivery as success
  return json(200, { ok: true });
});
