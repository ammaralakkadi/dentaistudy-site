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

  for (let i = 0; i < 8; i++) {
    try {
      await supabase.auth.refreshSession();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const tier = user?.app_metadata?.subscription_tier;

      if (tier === "pro" || tier === "pro_yearly") {
        if (statusEl) statusEl.textContent = `Activated: ${tier}`;
        await sleep(800);
        window.location.href = "profile.html";
        return;
      }
    } catch (e) {
      // ignore and retry
    }

    await sleep(2000);
  }

  // Still not updated (webhook might be delayed) — don’t block user here
  if (statusEl)
    statusEl.textContent =
      "Payment received. Activation can take a moment — open Profile to check.";
});
