import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

// --- Env (DO NOT paste keys in code) ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DODO_WEBHOOK_SECRET = Deno.env.get("DODO_WEBHOOK_SECRET") ?? "";

const DODO_PRODUCT_PRO_MONTHLY = Deno.env.get("DODO_PRODUCT_PRO_MONTHLY") ?? "";
const DODO_PRODUCT_PRO_YEARLY = Deno.env.get("DODO_PRODUCT_PRO_YEARLY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature, svix-id, svix-timestamp, svix-signature",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function pickHeader(req: Request, a: string, b: string) {
  return (req.headers.get(a) || req.headers.get(b) || "").trim();
}

function extractProductId(evt: any): string | null {
  const data = evt?.data;

  // Subscription payload (best)
  if (data?.payload_type === "Subscription" && typeof data?.product_id === "string") {
    return data.product_id;
  }

  // Payment payload with product_cart
  const cart = data?.product_cart;
  if (Array.isArray(cart) && cart[0]?.product_id) return cart[0].product_id;

  // Some payment events might not include cart
  return null;
}

function extractUserId(evt: any): string | null {
  const meta = evt?.data?.metadata;
  const userId = meta?.user_id;
  return typeof userId === "string" && userId.length > 10 ? userId : null;
}

function tierFromProductId(productId: string): "pro" | "pro_yearly" | null {
  if (productId === DODO_PRODUCT_PRO_MONTHLY) return "pro";
  if (productId === DODO_PRODUCT_PRO_YEARLY) return "pro_yearly";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }
    if (!DODO_WEBHOOK_SECRET) {
      return json(500, { error: "Missing DODO_WEBHOOK_SECRET" });
    }

    // IMPORTANT: verify against RAW BODY
    const rawBody = await req.text();

    // Accept BOTH header styles:
    // - Dodo docs: webhook-id / webhook-timestamp / webhook-signature
    // - Svix sender: svix-id / svix-timestamp / svix-signature
    const whId = pickHeader(req, "webhook-id", "svix-id");
    const whTs = pickHeader(req, "webhook-timestamp", "svix-timestamp");
    const whSig = pickHeader(req, "webhook-signature", "svix-signature");

    if (!whId || !whTs || !whSig) {
      return json(400, {
        error: "Missing signature headers",
        have: {
          "webhook-id": !!req.headers.get("webhook-id"),
          "webhook-timestamp": !!req.headers.get("webhook-timestamp"),
          "webhook-signature": !!req.headers.get("webhook-signature"),
          "svix-id": !!req.headers.get("svix-id"),
          "svix-timestamp": !!req.headers.get("svix-timestamp"),
          "svix-signature": !!req.headers.get("svix-signature"),
        },
      });
    }

    // Verify signature
    const webhook = new Webhook(DODO_WEBHOOK_SECRET);

    // standardwebhooks expects these exact keys:
    const verifiedEvent = webhook.verify(rawBody, {
      "webhook-id": whId,
      "webhook-timestamp": whTs,
      "webhook-signature": whSig,
    }) as any;

    const eventType = verifiedEvent?.type || verifiedEvent?.event_type || null;

    const userId = extractUserId(verifiedEvent);
    const productId = extractProductId(verifiedEvent);
    const tier = productId ? tierFromProductId(productId) : null;

    // If we can't identify the user or tier, still return 200 so Dodo doesn't spam retries
    if (!userId || !tier) {
      return json(200, {
        received: true,
        note: "No user_id or unknown product_id; not upgrading",
        eventType,
        userIdFound: !!userId,
        productId,
      });
    }

    // Update Supabase user app_metadata (what your auth-guard reads)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { subscription_tier: tier },
      user_metadata: { subscription_tier: tier },
    });    

    if (error) {
      return json(500, { error: "Supabase update failed", details: error.message });
    }

    return json(200, {
      received: true,
      upgraded: true,
      tier,
      eventType,
      userId,
      productId,
    });
  } catch (e) {
    return json(401, {
      error: "Webhook verification failed",
      details: e?.message ?? String(e),
    });
  }
});
