// assets/js/billing-success.js
document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.dasSupabase; // comes from auth-client.js
  const statusEl = document.getElementById("billingStatusText");
  const planEl = document.getElementById("billingPlanText");
  const refEl = document.getElementById("billingRefText");

  const params = new URLSearchParams(window.location.search);
  const plan = (params.get("plan") || "").trim(); // "pro" | "pro_yearly" | etc.

  // 1) Show plan text
  const planLabel =
    plan === "pro"
      ? "Pro Monthly"
      : plan === "pro_yearly"
      ? "Pro Yearly"
      : plan
      ? plan.replace(/_/g, " ")
      : "Subscription";

  if (planEl) planEl.textContent = planLabel;

  // Optional reference (if you add these later)
  const ref = params.get("ref") || params.get("sub") || params.get("pay") || "";
  if (refEl) refEl.textContent = ref ? `Reference: ${ref}` : "";

  // 2) If no Supabase client, stop (but page still shows success UI)
  if (!supabase) {
    if (statusEl)
      statusEl.textContent =
        "Payment received. Please open Profile to confirm activation.";
    return;
  }

  // 3) Refresh session a few times to pull updated app_metadata from Supabase
  // (your webhook updates app_metadata.subscription_tier)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let isActivated = false;
  for (let i = 0; i < 6; i++) {
    // Reduced attempts
    try {
      // CRITICAL: Force a token refresh and get a fresh user object
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      const tier = user?.app_metadata?.subscription_tier; // Check app_metadata directly

      if (tier === "pro" || tier === "pro_yearly") {
        if (statusEl) statusEl.textContent = `✅ Activated: ${tier} plan`;
        isActivated = true;
        await sleep(1200);
        window.location.href = "profile.html";
        break; // Exit loop on success
      }
    } catch (e) {
      console.warn(`[billing] Poll attempt ${i + 1} failed:`, e);
    }
    await sleep(2500); // Slightly longer delay between attempts
  }

  // If loop finishes without activation
  if (!isActivated && statusEl) {
    statusEl.textContent =
      "Payment confirmed. Your Pro access is being activated (usually within 2 minutes).";
  }
});