/// <reference path="./.supabase/functions.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "npm:svix@1.43.0";

type DodoEvent = {
  type: string;
  business_id?: string;
  data?: any;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const DODO_WEBHOOK_SECRET = Deno.env.get("DODO_WEBHOOK_SECRET") ?? "";

  // Your Dodo product IDs (TEST or LIVE — must match the mode you’re using)
  const DODO_PRO_PRODUCT_ID = Deno.env.get("DODO_PRO_PRODUCT_ID") ?? "";
  const DODO_PRO_YEARLY_PRODUCT_ID = Deno.env.get("DODO_PRO_YEARLY_PRODUCT_ID") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json(500, { error: "Server misconfigured" });
  }
  if (!DODO_WEBHOOK_SECRET) {
    console.error("Missing DODO_WEBHOOK_SECRET");
    return json(500, { error: "Webhook secret not set" });
  }

  // 1) Read raw body (Svix verification needs the exact raw payload)
  const rawBody = await req.text();

  // 2) Verify Svix headers
  const svix_id = req.headers.get("svix-id");
  const svix_ts = req.headers.get("svix-timestamp");
  const svix_sig = req.headers.get("svix-signature");

  if (!svix_id || !svix_ts || !svix_sig) {
    console.error("Missing Svix headers", {
      hasId: !!svix_id,
      hasTs: !!svix_ts,
      hasSig: !!svix_sig,
    });
    return json(400, { error: "Missing webhook signature headers" });
  }

  let event: DodoEvent;
  try {
    const wh = new Webhook(DODO_WEBHOOK_SECRET);
    event = wh.verify(rawBody, {
      "svix-id": svix_id,
      "svix-timestamp": svix_ts,
      "svix-signature": svix_sig,
    }) as DodoEvent;
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return json(401, { error: "Invalid signature" });
  }

  const type = event?.type;
  const data = event?.data ?? {};

  console.log("Dodo webhook received:", {
    type,
    payment_id: data?.payment_id,
    subscription_id: data?.subscription_id,
    product_cart: data?.product_cart,
    metadata: data?.metadata,
    customer_email: data?.customer?.email,
  });

  // We only act on success events
  const isSuccess =
    type === "payment.succeeded" ||
    type === "subscription.active" ||
    type === "subscription.created";

  if (!isSuccess) {
    return json(200, { ok: true, ignored: true });
  }

  // 3) Identify user (REQUIRE user_id in metadata)
  const meta = data?.metadata ?? {};
  const userId: string | undefined =
    meta.user_id ?? meta.userId ?? meta.supabase_user_id ?? meta.supabaseUserId;

  if (!userId) {
    console.error("Missing metadata user_id. Cannot upgrade safely.");
    return json(200, { ok: true, upgraded: false, reason: "missing_user_id" });
  }

  // 4) Decide plan (monthly vs yearly) by product_id
  const productId = data?.product_cart?.[0]?.product_id as string | undefined;

  let tier: "free" | "pro" | "pro_yearly" = "pro"; // default to pro
  if (productId && DODO_PRO_YEARLY_PRODUCT_ID && productId === DODO_PRO_YEARLY_PRODUCT_ID) {
    tier = "pro_yearly";
  } else if (productId && DODO_PRO_PRODUCT_ID && productId === DODO_PRO_PRODUCT_ID) {
    tier = "pro";
  }

  // 5) Upgrade user in Supabase Auth metadata
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      subscription_tier: tier,
      // optional flags (keep if you use them elsewhere)
      is_pro: tier === "pro" || tier === "pro_yearly",
      updated_from: "dodo_webhook",
    },
  });

  if (error) {
    console.error("Failed to update user:", error);
    return json(500, { ok: false, error: error.message });
  }

  return json(200, { ok: true, upgraded: true, userId, tier });
});
