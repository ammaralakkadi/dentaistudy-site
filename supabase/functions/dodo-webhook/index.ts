/// <reference path="./.deno.d.ts" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DodoEvent = {
  type?: string;
  data?: {
    payload_type?: string;
    status?: string;
    payment_id?: string;
    subscription_id?: string | null;
    product_cart?: Array<{ product_id: string; quantity?: number }>;
    customer?: { email?: string };
    metadata?: Record<string, unknown>;
    // sometimes providers flatten metadata:
    metadata_user_id?: string;
    metadataUserId?: string;
  };
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("https://hlvkbqpesiqjxbastxux.supabase.co") || "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsdmticXBlc2lxanhiYXN0eHV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE2MjA0OSwiZXhwIjoyMDc5NzM4MDQ5fQ.AJybLizQmfn3ZUPJGawQ_7JmUzLcGZ5und-QwXVu_N8") || "";
  const DODO_WEBHOOK_SECRET = Deno.env.get("whsec_larLFJIa/T/aEtfSYlGdCAv8/qAqnjEf") || "";
  const PRO_MONTHLY_ID = Deno.env.get("pdt_rynZ1jQtGhV2iHFrs9hMs") || "";
  const PRO_YEARLY_ID = Deno.env.get("pdt_eWs83c5p438JW6Go1oaub") || "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Missing Supabase env vars" });
  }
  if (!DODO_WEBHOOK_SECRET) {
    return json(500, { error: "Missing DODO_WEBHOOK_SECRET" });
  }

  // ---- read raw body (needed for signature verification) ----
  const rawBody = await req.text();

  // ---- Svix headers (Dodo uses Svix) ----
  const svixId = req.headers.get("svix-id");
  const svixTs = req.headers.get("svix-timestamp");
  const svixSig = req.headers.get("svix-signature");

  const hasId = !!svixId;
  const hasTs = !!svixTs;
  const hasSig = !!svixSig;

  if (!hasId || !hasTs || !hasSig) {
    console.error("[dodo-webhook] Missing Svix headers", { hasId, hasTs, hasSig });
    return json(400, { error: "Missing Svix headers" });
  }

  // ---- Verify Svix signature ----
  // Minimal verifier: use Svix lib (reliable)
  // If this ever fails: your DODO_WEBHOOK_SECRET is not the correct "Signing Secret" from Dodo.
  try {
    const { Webhook } = await import("https://esm.sh/svix@1.45.1");
    const wh = new Webhook(DODO_WEBHOOK_SECRET);
    wh.verify(rawBody, {
      "svix-id": svixId!,
      "svix-timestamp": svixTs!,
      "svix-signature": svixSig!,
    });
  } catch (e) {
    console.error("[dodo-webhook] Signature verify failed", e);
    return json(401, { error: "Invalid signature" });
  }

  let event: DodoEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const type = event?.type || "";
  const data = event?.data || {};
  const status = data?.status || "";
  const paymentId = data?.payment_id || "";
  const customerEmail = data?.customer?.email || "";
  const productId = data?.product_cart?.[0]?.product_id || "";

  console.log("[dodo-webhook] received", {
    type,
    status,
    paymentId,
    productId,
    customerEmail,
  });

  // We only upgrade on successful payment
  if (type !== "payment.succeeded" || status !== "succeeded") {
    return json(200, { ok: true, ignored: true });
  }

  // Figure out plan by product id
  let subscriptionTier: "pro" | "pro_yearly" | null = null;
  if (productId && PRO_MONTHLY_ID && productId === PRO_MONTHLY_ID) subscriptionTier = "pro";
  if (productId && PRO_YEARLY_ID && productId === PRO_YEARLY_ID) subscriptionTier = "pro_yearly";

  if (!subscriptionTier) {
    console.error("[dodo-webhook] Unknown product id", { productId, PRO_MONTHLY_ID, PRO_YEARLY_ID });
    return json(200, { ok: true, ignored: true, reason: "unknown_product" });
  }

  // Extract user id from metadata (we support multiple shapes)
  const meta = (data.metadata || {}) as Record<string, unknown>;
  const userId =
    (meta.user_id as string) ||
    (meta.userId as string) ||
    (data.metadata_user_id as string) ||
    (data.metadataUserId as string) ||
    "";

  if (!userId) {
    // fallback path if you ever want email matching later, but for now we require user_id
    console.error("[dodo-webhook] Missing user_id in metadata", { metaKeys: Object.keys(meta), customerEmail });
    return json(200, { ok: true, ignored: true, reason: "missing_user_id" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ✅ IMPORTANT: set BOTH user_metadata + app_metadata
  const { data: updated, error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      subscription_tier: subscriptionTier,
      dodo_payment_id: paymentId,
      dodo_customer_email: customerEmail || null,
      updated_at: new Date().toISOString(),
    },
    app_metadata: {
      subscription_tier: subscriptionTier,
    },
  });

  if (error) {
    console.error("[dodo-webhook] updateUserById failed", error);
    return json(500, { error: "Failed to update user" });
  }

  console.log("[dodo-webhook] upgraded user", { userId, subscriptionTier });

  return json(200, { ok: true, userId, subscriptionTier, updated: !!updated?.user });
});
