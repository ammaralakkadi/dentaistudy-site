import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

// --- Env (DO NOT paste keys in code) ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DODO_WEBHOOK_SECRET = Deno.env.get("DODO_WEBHOOK_SECRET") ?? "";

const DODO_PRODUCT_PRO_MONTHLY =
  Deno.env.get("DODO_PRODUCT_PRO_MONTHLY") ??
  Deno.env.get("DODO_PRO_MONTHLY_PRODUCT_ID") ??
  "";

  const DODO_PRODUCT_PRO_YEARLY =
    Deno.env.get("DODO_PRODUCT_PRO_YEARLY") ??
    Deno.env.get("DODO_PRO_YEARLY_PRODUCT_ID") ??
    "";

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
  return (req.headers.get(a) ?? req.headers.get(b) ?? "").trim();
}

function extractProductId(evt: any): string | null {
  const data = evt?.data;

  // For subscriptions, Dodo’s canonical product identifier is data.product_id
  if (typeof data?.product_id === "string" && data.product_id.trim()) {
    return data.product_id.trim();
  }

  // Fallback only for one-time payments that may include a cart
  const cart = data?.product_cart;
  if (Array.isArray(cart) && typeof cart?.[0]?.product_id === "string") {
    return cart[0].product_id.trim();
  }

  return null;
}

function extractUserId(evt: any): string | null {
  const meta = evt?.data?.metadata;
  const userId = meta?.user_id;
  return typeof userId === "string" && userId.length > 10 ? userId : null;
}

function tierFromProductId(
  productId: string | null
): "pro" | "pro_yearly" | null {
  const pid = (productId ?? "").trim();
  const monthly = (DODO_PRODUCT_PRO_MONTHLY ?? "").trim();
  const yearly = (DODO_PRODUCT_PRO_YEARLY ?? "").trim();

  if (!pid) return null;
  if (monthly && pid === monthly) return "pro";
  if (yearly && pid === yearly) return "pro_yearly";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, {
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
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

    const eventType = (
      verifiedEvent?.type ??
      verifiedEvent?.event_type ??
      ""
    ).toString();

    // 🔒 We do NOT trust eventType names for entitlements (forwarders/adapters may rename).
    // ✅ We decide entitlement strictly by payload_type + status.
    const payloadType = verifiedEvent?.data?.payload_type;
    if (payloadType !== "Subscription") {
      return json(200, { received: true, ignored: eventType, payloadType });
    }

    const subStatus = verifiedEvent?.data?.status;
    if (subStatus !== "active") {
      return json(200, {
        received: true,
        ignored: true,
        reason: "subscription_not_active",
        eventType,
        payloadType,
        subStatus,
      });
    }

    const userId = extractUserId(verifiedEvent);
    const productId = extractProductId(verifiedEvent);
    const tier = tierFromProductId(productId);

    // ✅ Always log the entitlement decision (for Supabase Logs)
    console.log("[dodo-webhook] entitlement decision", {
      eventType,
      payloadType,
      subStatus,
      userId,
      productId,
      tier,
      envMonthly: (DODO_PRODUCT_PRO_MONTHLY ?? "").trim(),
      envYearly: (DODO_PRODUCT_PRO_YEARLY ?? "").trim(),
      subscription_id: verifiedEvent?.data?.subscription_id ?? null,
    });

    // If we can't identify the user or tier, still return 200 so Dodo doesn't spam retries
    if (!userId || !tier) {
      return json(200, {
        received: true,
        note: "No user_id or tier (debug)",
        eventType,
        payloadType,
        subStatus,
        userId,
        productId,
        envMonthly: (DODO_PRODUCT_PRO_MONTHLY ?? "").trim(),
        envYearly: (DODO_PRODUCT_PRO_YEARLY ?? "").trim(),
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch existing metadata so we MERGE (never overwrite provider fields)
    const { data: userRes, error: getErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (getErr || !userRes?.user) {
      return json(500, {
        error: "Supabase getUserById failed",
        details: getErr?.message ?? "No user",
      });
    }

    // Only update app_metadata; do not touch user_metadata
    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { app_metadata: { subscription_tier: tier } }
    );

    if (upErr) {
      return json(500, {
        error: "Supabase update failed",
        details: upErr.message,
      });
    }

    console.log("[dodo-webhook] upgraded", { userId, tier, productId });

    return json(200, {
      received: true,
      upgraded: true,
      tier,
      eventType,
      userId,
      productId,
      subscription_id: verifiedEvent?.data?.subscription_id ?? null,
    });
  } catch (e) {
    return json(401, {
      error: "Webhook verification failed",
      details: e?.message ?? String(e),
    });
  }
});
