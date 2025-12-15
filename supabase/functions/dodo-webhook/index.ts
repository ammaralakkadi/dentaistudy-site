import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "npm:standardwebhooks@1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DODO_WEBHOOK_SECRET = Deno.env.get("DODO_WEBHOOK_SECRET") ?? "";

const DODO_PRODUCT_PRO_MONTHLY = Deno.env.get("DODO_PRODUCT_PRO_MONTHLY") ?? "";
const DODO_PRODUCT_PRO_YEARLY = Deno.env.get("DODO_PRODUCT_PRO_YEARLY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function timingSafeEqual(a: string, b: string) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let out = 0;
  for (let i = 0; i < aBytes.length; i++) out |= aBytes[i] ^ bBytes[i];
  return out === 0;
}

function getHeader(headers: Headers, name: string) {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? "";
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getUserIdFromEvent(data: any): string | null {
  // Dodo puts it here when you pass metadata_user_id in checkout URL
  return data?.metadata?.user_id ?? data?.metadata?.userId ?? null;
}

function getTierFromProductId(productId: string | null): "pro" | "pro_yearly" | null {
  if (!productId) return null;
  if (DODO_PRODUCT_PRO_MONTHLY && productId === DODO_PRODUCT_PRO_MONTHLY) return "pro";
  if (DODO_PRODUCT_PRO_YEARLY && productId === DODO_PRODUCT_PRO_YEARLY) return "pro_yearly";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return json(500, { error: "Server misconfigured (Supabase secrets missing)" });
    }
    if (!DODO_WEBHOOK_SECRET) {
      console.error("Missing DODO_WEBHOOK_SECRET");
      return json(500, { error: "Server misconfigured (Dodo secret missing)" });
    }

    const rawBody = await req.text();

    // Dodo/Svix style headers (support both webhook-* and svix-*)
    const whId = getHeader(req.headers, "webhook-id") || getHeader(req.headers, "svix-id");
    const whTs = getHeader(req.headers, "webhook-timestamp") || getHeader(req.headers, "svix-timestamp");
    const whSig = getHeader(req.headers, "webhook-signature") || getHeader(req.headers, "svix-signature");

    if (!whId || !whTs || !whSig) {
      console.error("Missing signature headers", { whId: !!whId, whTs: !!whTs, whSig: !!whSig });
      return json(401, { error: "Missing webhook signature headers" });
    }

    // Verify signature
    const signed = `${whId}.${whTs}.${rawBody}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(DODO_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
    const computed = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

    // Dodo may send hex OR base64-looking strings; accept exact match only for now (your docs say direct compare)
    if (!timingSafeEqual(computed, whSig)) {
      console.error("Invalid signature");
      return json(401, { error: "Invalid signature" });
    }

    const evt = JSON.parse(rawBody);
    const type = evt?.type;
    const data = evt?.data ?? {};

    // We upgrade on either:
    // - subscription.active (best: includes product_id)
    // - payment.succeeded (sometimes missing product id for subscriptions, but still useful for logging)
    let productId: string | null = null;

    if (type === "subscription.active" || type === "subscription.updated") {
      productId = data?.product_id ?? null;
    } else if (type === "payment.succeeded") {
      // sometimes product_cart is null; keep as fallback
      productId = data?.product_cart?.[0]?.product_id ?? null;
    } else {
      // Not an event we care about; still return 200 so Dodo doesn’t retry forever
      return json(200, { received: true, ignored: true, type });
    }

    const userId = getUserIdFromEvent(data);
    if (!userId) {
      console.error("No user_id in metadata", { type });
      return json(200, { received: true, ok: true, missing_user_id: true });
    }

    const tier = getTierFromProductId(productId);
    if (!tier) {
      console.error("Unknown product id", { productId, type });
      return json(200, { received: true, ok: true, unknown_product: true, productId, type });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Update BOTH app_metadata and user_metadata (you read tier from app_metadata)
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        subscription_tier: tier,
        subscription_source: "dodo",
        dodo_subscription_id: data?.subscription_id ?? data?.subscriptionId ?? null,
        dodo_product_id: productId,
        dodo_last_event: type,
        dodo_updated_at: new Date().toISOString(),
      },
      user_metadata: {
        subscription_tier: tier,
        subscription_source: "dodo",
        dodo_subscription_id: data?.subscription_id ?? data?.subscriptionId ?? null,
        dodo_product_id: productId,
        dodo_last_event: type,
        dodo_updated_at: new Date().toISOString(),
      },
    });

    if (error) {
      console.error("Failed to update user:", error);
      return json(500, { error: "Failed to update user" });
    }

    return json(200, { received: true, ok: true, userId, tier, type });
  } catch (err) {
    console.error("Webhook handler crashed:", err);
    return json(500, { error: "Webhook handler failed" });
  }
});
