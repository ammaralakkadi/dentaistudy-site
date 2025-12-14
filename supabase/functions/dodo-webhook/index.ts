// supabase/functions/dodo-webhook/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:standardwebhooks@1";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getHeader(req: Request, name: string) {
  return req.headers.get(name) ?? req.headers.get(name.toLowerCase());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const secret = Deno.env.get("DODO_WEBHOOK_SECRET");
  if (!secret) return json(500, { error: "Missing DODO_WEBHOOK_SECRET" });

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Dodo is sent by Svix (often uses svix-* headers)
  const svixId = getHeader(req, "svix-id");
  const svixTs = getHeader(req, "svix-timestamp");
  const svixSig = getHeader(req, "svix-signature");

  // Some libraries expect webhook-* headers; map svix-* -> webhook-*
  const webhookId = getHeader(req, "webhook-id") ?? svixId;
  const webhookTs = getHeader(req, "webhook-timestamp") ?? svixTs;
  const webhookSig = getHeader(req, "webhook-signature") ?? svixSig;

  if (!webhookId || !webhookTs || !webhookSig) {
    console.error("Missing signature headers", {
      hasId: !!webhookId,
      hasTs: !!webhookTs,
      hasSig: !!webhookSig,
    });
    return json(400, { error: "Missing webhook signature headers" });
  }

  // Verify signature
  let event: any;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTs,
      "webhook-signature": webhookSig,
    });
  } catch (err) {
    console.error("Signature verification failed:", String(err));
    return json(401, { error: "Invalid signature" });
  }

  const type = event?.type;
  const data = event?.data ?? {};
  const metadata = data?.metadata ?? {};

  console.log("Dodo webhook received", {
    type,
    payment_id: data?.payment_id,
    status: data?.status,
    product_id: data?.product_cart?.[0]?.product_id,
    has_user_id: !!(metadata?.user_id || metadata?.userId || metadata?.metadata_user_id),
  });

  // We only care about successful payments
  if (type !== "payment.succeeded") {
    return json(200, { ok: true, ignored: true });
  }

  // Your checkout link should send: &metadata_user_id=<supabase user id>
  const userId =
    metadata?.user_id ??
    metadata?.metadata_user_id ??
    metadata?.userId;

  if (!userId || typeof userId !== "string") {
    // Don’t fail the webhook; just log so you can fix URL param
    console.error("Missing metadata user id. Add &metadata_user_id=... to checkout URL.", {
      metadata,
    });
    return json(200, { ok: true, missing_user_id: true });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Map product -> tier
  const paidProductId = data?.product_cart?.[0]?.product_id;
  const proMonthly = Deno.env.get("DODO_PRO_MONTHLY_PRODUCT_ID");
  const proYearly = Deno.env.get("DODO_PRO_YEARLY_PRODUCT_ID");

  let tier: "pro" | "pro_yearly" | null = null;
  if (paidProductId && proMonthly && paidProductId === proMonthly) tier = "pro";
  if (paidProductId && proYearly && paidProductId === proYearly) tier = "pro_yearly";

  if (!tier) {
    console.error("Unknown product id, set env vars DODO_PRO_MONTHLY_PRODUCT_ID / DODO_PRO_YEARLY_PRODUCT_ID", {
      paidProductId,
    });
    return json(200, { ok: true, unknown_product: true });
  }

  // Update Auth user metadata
  const { data: updated, error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      subscription_tier: tier,
      subscription_source: "dodo",
      dodo_payment_id: data?.payment_id ?? null,
      dodo_last_event: type,
      dodo_updated_at: new Date().toISOString(),
    },
  });

  if (error) {
    console.error("Failed to update user:", error);
    return json(500, { error: "Failed to update user" });
  }

  return json(200, { ok: true, tier, user: updated?.user?.id });
});
