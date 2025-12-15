import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("hlvkbqpesiqjxbastxux") ?? "";
const SERVICE_ROLE = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsdmticXBlc2lxanhiYXN0eHV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE2MjA0OSwiZXhwIjoyMDc5NzM4MDQ5fQ.AJybLizQmfn3ZUPJGawQ_7JmUzLcGZ5und-QwXVu_N8") ?? "";

const DODO_WEBHOOK_SECRET = Deno.env.get("whsec_larLFJIa/T/aEtfSYlGdCAv8/qAqnjEf") ?? "";
const DODO_PRODUCT_PRO_MONTHLY = Deno.env.get("pdt_rynZ1jQtGhV2iHFrs9hMs") ?? "";
const DODO_PRODUCT_PRO_YEARLY = Deno.env.get("pdt_eWs83c5p438JW6Go1oaub") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let out = 0;
  for (let i = 0; i < aBytes.length; i++) out |= aBytes[i] ^ bBytes[i];
  return out === 0;
}

function toBase64(bytes: Uint8Array) {
  let bin = "";
  for (const c of bytes) bin += String.fromCharCode(c);
  return btoa(bin);
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
  return toBase64(new Uint8Array(sig));
}

function extractSignature(sigHeader: string) {
  // Support raw "base64", or "v1,<base64>", or "v1=<base64>"
  const s = sigHeader.trim();
  if (s.includes(",")) return s.split(",").pop()!.trim();
  if (s.includes("=")) return s.split("=").pop()!.trim();
  return s;
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return json(500, { ok: false, error: "Server misconfigured (supabase env)" });
  }
  if (!DODO_WEBHOOK_SECRET) {
    console.error("Missing DODO_WEBHOOK_SECRET");
    return json(500, { ok: false, error: "Server misconfigured (dodo secret)" });
  }

  // IMPORTANT: raw body as string (exactly what Dodo signs)
  const rawBody = await req.text();

  const webhookId = req.headers.get("webhook-id") ?? "";
  const webhookTs = req.headers.get("webhook-timestamp") ?? "";
  const webhookSig = req.headers.get("webhook-signature") ?? "";

  if (!webhookId || !webhookTs || !webhookSig) {
    console.error("Missing Dodo signature headers", {
      hasId: !!webhookId,
      hasTs: !!webhookTs,
      hasSig: !!webhookSig,
    });
    return json(400, { ok: false, error: "Missing Dodo webhook signature headers" });
  }

  const signedMessage = `${webhookId}.${webhookTs}.${rawBody}`;
  const expected = await hmacSha256Base64(DODO_WEBHOOK_SECRET, signedMessage);
  const provided = extractSignature(webhookSig);

  if (!timingSafeEqual(provided, expected)) {
    console.error("Signature mismatch");
    return json(401, { ok: false, error: "Invalid signature" });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const type = payload?.type ?? "";
  const data = payload?.data ?? {};

  // Act on subscription activation (your payload shows subscription.active)
  if (type !== "subscription.active" && type !== "payment.succeeded") {
    return json(200, { ok: true, ignored: true, type });
  }

  const userId =
    data?.metadata?.user_id ||
    data?.metadata?.userId ||
    data?.customer?.metadata?.user_id ||
    null;

  if (!userId) {
    console.error("No metadata.user_id in webhook payload");
    return json(200, { ok: true, upgraded: false, reason: "missing_user_id" });
  }

  const productId = data?.product_id || data?.product_cart?.[0]?.product_id || "";
  let tier: "pro" | "pro_yearly" = "pro";

  if (productId && DODO_PRODUCT_PRO_YEARLY && productId === DODO_PRODUCT_PRO_YEARLY) tier = "pro_yearly";
  if (productId && DODO_PRODUCT_PRO_MONTHLY && productId === DODO_PRODUCT_PRO_MONTHLY) tier = "pro";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Read existing app_metadata so we don’t wipe other flags
  const { data: userResp, error: getErr } = await supabase.auth.admin.getUserById(userId);
  if (getErr || !userResp?.user) {
    console.error("User not found", getErr);
    return json(200, { ok: false, error: "User not found" });
  }

  const prevApp = (userResp.user.app_metadata ?? {}) as Record<string, any>;

  const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...prevApp,
      subscription_tier: tier,
      paid_provider: "dodo",
      dodo_product_id: productId || prevApp.dodo_product_id,
      dodo_subscription_id: data?.subscription_id ?? prevApp.dodo_subscription_id,
      dodo_last_event: type,
      dodo_updated_at: new Date().toISOString(),
    },
  });

  if (updErr) {
    console.error("Update failed", updErr);
    return json(500, { ok: false, error: "Update failed" });
  }

  console.log("Upgraded user", { userId, tier, productId, type });
  return json(200, { ok: true, upgraded: true, userId, tier });
});
