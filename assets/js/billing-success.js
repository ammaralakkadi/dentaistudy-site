// assets/js/billing-success.js
document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.dasSupabase; // from auth-client.js

  const statusEl = document.getElementById("billingStatusText");
  const planEl = document.getElementById("billingPlanText");
  const refEl = document.getElementById("billingRefText");

  const params = new URLSearchParams(window.location.search);
  const plan = (params.get("plan") || "").trim(); // "pro" | "pro_yearly" | etc.

  // 1) Show plan label (friendly text)
  const planLabel =
    plan === "pro"
      ? "Pro Monthly"
      : plan === "pro_yearly"
      ? "Pro Yearly"
      : plan
      ? plan.replace(/_/g, " ")
      : "Subscription";

  if (planEl) planEl.textContent = planLabel;

  // Optional reference (provider or your backend can add this later)
  const ref = params.get("ref") || params.get("sub") || params.get("pay") || "";
  if (refEl) refEl.textContent = ref ? `Reference: ${ref}` : "—";

  // 2) If no Supabase client, stop (page still shows success UI)
  if (!supabase || !supabase.auth) {
    if (statusEl) {
      statusEl.textContent =
        "Payment received. Please open Profile to confirm activation.";
    }
    return;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 3) Poll for subscription activation
  //    Activation is done by your backend (Payoneer webhook + your logic).
  let isActivated = false;

  // (6 tries ~ up to ~15–20 seconds; keeps page fast)
  for (let i = 0; i < 6; i++) {
    try {
      // Refresh tokens to pull newest metadata
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const user = data?.user || null;
      const tier =
        user?.app_metadata?.subscription_tier ||
        user?.user_metadata?.subscription_tier ||
        "free";

      if (tier === "pro" || tier === "pro_yearly") {
        if (statusEl) statusEl.textContent = `✅ Activated: ${tier} plan`;
        isActivated = true;

        // Small pause so user sees the “Activated” state
        await sleep(900);
        window.location.href = "profile.html";
        return;
      }
    } catch (e) {
      console.warn(`[billing-success] Poll attempt ${i + 1} failed:`, e);
    }

    await sleep(2500);
  }

  // 4) If activation didn't appear yet, show a calm message
  if (!isActivated && statusEl) {
    statusEl.textContent =
      "Payment confirmed. Your Pro access is being activated (usually within 2 minutes).";
  }
});
