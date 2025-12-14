import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("https://hlvkbqpesiqjxbastxux.supabase.co") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsdmticXBlc2lxanhiYXN0eHV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE2MjA0OSwiZXhwIjoyMDc5NzM4MDQ5fQ.AJybLizQmfn3ZUPJGawQ_7JmUzLcGZ5und-QwXVu_N8") ?? "";

const DODO_WEBHOOK_SECRET = Deno.env.get("whsec_larLFJIa/T/aEtfSYlGdCAv8/qAqnjEf") ?? "";

// Your Dodo product IDs (TEST mode IDs)
const DODO_PRODUCT_PRO_MONTHLY = Deno.env.get("pdt_rynZ1jQtGhV2iHFrs9hMs") ?? "";
const DODO_PRODUCT_PRO_YEARLY = Deno.env.get("pdt_eWs83c5p438JW6Go1oaub") ?? "";

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

async function hmacSha256Base64(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  // Base64 encode
  const bytes = new Uint8Array(sig);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str);
}

// Svix signature verify (Svix style: "v1,...." list)
async function verifySvix(req: Request, bodyText: string) {
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTs = req.headers.get("svix-timestamp") ?? "";
  const svixSig = req.headers.get("svix-signature") ?? "";

  const hasId = !!svixId;
  const hasTs = !!svixTs;
  const hasSig = !!svixSig;

  if (!hasId || !hasTs || !hasSig) {
    console.error("Missing Svix headers", { hasId, hasTs, hasSig });
    return false;
  }

  if (!DODO_WEBHOOK_SECRET) {
    console.error("Missing DODO_WEBHOOK_SECRET");
    return false;
  }

  // Svix signs: `${svixId}.${svixTs}.${payload}`
  const signedContent = `${svixId}.${svixTs}.${bodyText}`;
  const expected = await hmacSha256Base64(DODO_WEBHOOK_SECRET, signedContent);

  // svix-signature can contain multiple "v1,base64" entries separated by spaces
  const parts = svixSig.split(" ").map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const [version, sig] = part.split(",");
    if (version === "v1" && sig && timingSafeEqual(sig, expected)) return true;
  }

  console.error("Svix signature mismatch");
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
      return new Response(JSON.stringify({ ok: false, error: "Server env not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bodyText = await req.text();

    // 1) Verify webhook authenticity
    const ok = await verifySvix(req, bodyText);
    if (!ok) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(bodyText);

    const type = payload?.type;
    const data = payload?.data;

    console.log("Dodo webhook received", { type });

    // We only care about successful subscription activation (your payload shows subscription.active)
    if (type !== "subscription.active" && type !== "payment.succeeded") {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Identify user (you already have metadata.user_id in payload ✅)
    const userId =
      data?.metadata?.user_id ||
      data?.metadata?.userId ||
      data?.customer?.metadata?.user_id ||
      null;

    if (!userId) {
      console.error("Missing user_id in metadata");
      return new Response(JSON.stringify({ ok: false, error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Determine plan (monthly/yearly) using product_id
    const productId = data?.product_id || data?.product_cart?.[0]?.product_id || null;

    let subscription_tier: "pro" | "pro_yearly" = "pro";

    if (productId && DODO_PRODUCT_PRO_YEARLY && productId === DODO_PRODUCT_PRO_YEARLY) {
      subscription_tier = "pro_yearly";
    } else if (productId && DODO_PRODUCT_PRO_MONTHLY && productId === DODO_PRODUCT_PRO_MONTHLY) {
      subscription_tier = "pro";
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 4) Update user app_metadata (this is what your site reads)
    const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(
      userId,
      {
        app_metadata: {
          subscription_tier,
          paid_provider: "dodo",
          dodo_product_id: productId,
          dodo_event_type: type,
          dodo_updated_at: new Date().toISOString(),
        },
      },
    );

    if (updateErr) {
      console.error("updateUserById error", updateErr);
      return new Response(JSON.stringify({ ok: false, error: "Update failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("User upgraded", { userId, subscription_tier });

    return new Response(JSON.stringify({ ok: true, userId, subscription_tier }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error", err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
