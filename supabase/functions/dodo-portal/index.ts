import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function dodoBaseUrl() {
  const env = (Deno.env.get("DODO_ENVIRONMENT") ?? "test_mode").trim();
  return env === "live_mode"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com";
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    // ---- ENV ----
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // IMPORTANT: use DODO_API_KEY (with underscore) to match your Supabase secret name
    const DODO_API_KEY = Deno.env.get("DODO_API_KEY") ?? "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing Supabase env" });
    }
    if (!DODO_API_KEY) {
      return json(500, { error: "Missing DODO_API_KEY" });
    }

    // ---- AUTH USER (from Authorization header) ----
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json(401, { error: "Missing Authorization bearer token" });

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user)
      return json(401, { error: "Invalid session" });

    const userId = userData.user.id;

    // ---- DB (service role) ----
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Read customer id from profiles
    const { data: profile, error: profErr } = await db
      .from("profiles")
      .select("dodo_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (profErr)
      return json(500, { error: "DB error", details: profErr.message });

    const customerId = (profile?.dodo_customer_id || "").trim();
    if (!customerId) {
      // This is your new “400 No billing account found” situation
      return json(400, { error: "No billing account found" });
    }

    // ---- Create portal session in Dodo ----
    const url = `${dodoBaseUrl()}/customers/${customerId}/customer-portal/session`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DODO_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const out = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return json(resp.status, {
        error: "Dodo portal session failed",
        status: resp.status,
        details: out,
      });
    }

    // Dodo usually returns { link: "..." }
    const link = out?.link || out?.url;
    if (!link)
      return json(500, { error: "No link returned from Dodo", details: out });

    return json(200, { link });
  } catch (e) {
    return json(500, { error: "Unexpected error", details: String(e) });
  }
});
