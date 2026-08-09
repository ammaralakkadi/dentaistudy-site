document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
  const forms = Array.from(document.querySelectorAll("[data-settings-form]"));
  const field = (name) => document.querySelector(`[name="${name}"]`);

  if (!auth?.enabled || !forms.length) return;

  const authState = await window.DentAIStudyPartnerAuthReady;
  if (!authState?.user) return;

  const adminUser = authState.user;
  const columnByField = {
    programStatus: "program_status",
    minimumUsers: "minimum_confirmed_paid_users",
    initialProMonths: "initial_pro_months",
    qualifiedProMonths: "qualified_pro_months",
    monthlyFirstPaymentRate: "monthly_first_payment_rate",
    monthlyRenewalRate: "monthly_renewal_rate",
    monthlyRenewalCount: "monthly_renewal_count",
    annualFirstPaymentRate: "annual_first_payment_rate",
    approvalDays: "approval_days",
    minimumPayout: "minimum_payout_usd",
    payoutWindow: "payout_window",
  };
  const numericFields = new Set([
    "minimumUsers",
    "initialProMonths",
    "qualifiedProMonths",
    "monthlyFirstPaymentRate",
    "monthlyRenewalRate",
    "monthlyRenewalCount",
    "annualFirstPaymentRate",
    "approvalDays",
    "minimumPayout",
  ]);
  let settings = null;

  function formValue(name) {
    const element = field(name);
    if (!element) return null;

    if (numericFields.has(name)) {
      const value = Number(element.value);
      if (!Number.isFinite(value)) {
        throw new Error(`Enter a valid value for ${name}.`);
      }
      return value;
    }

    if (name === "programStatus") return element.value.toLowerCase();
    return element.value.trim();
  }

  function hydrate(row) {
    field("programStatus").value = auth.titleCase(row.program_status);
    field("minimumUsers").value = String(row.minimum_confirmed_paid_users);
    field("initialProMonths").value = String(row.initial_pro_months);
    field("qualifiedProMonths").value = String(row.qualified_pro_months);
    field("monthlyFirstPaymentRate").value = String(
      row.monthly_first_payment_rate,
    );
    field("monthlyRenewalRate").value = String(row.monthly_renewal_rate);
    field("monthlyRenewalCount").value = String(row.monthly_renewal_count);
    field("annualFirstPaymentRate").value = String(
      row.annual_first_payment_rate,
    );
    field("approvalDays").value = String(row.approval_days);
    field("minimumPayout").value = String(row.minimum_payout_usd);
    field("payoutWindow").value = row.payout_window || "";
  }

  async function loadSettings() {
    const { data, error } = await auth.client
      .from("partner_settings")
      .select(
        "id,program_status,minimum_confirmed_paid_users,initial_pro_months,qualified_pro_months,monthly_first_payment_rate,monthly_renewal_rate,monthly_renewal_count,annual_first_payment_rate,approval_days,minimum_payout_usd,payout_window",
      )
      .eq("id", 1)
      .single();

    if (error) throw error;
    settings = data;
    hydrate(settings);
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const update = {};
    const changedFields = [];

    Array.from(form.elements).forEach((element) => {
      const name = element.name;
      const column = columnByField[name];
      if (!column) return;

      const value = formValue(name);
      update[column] = value;
      changedFields.push(name);
    });

    if (!Object.keys(update).length) return;
    if (submitButton) submitButton.disabled = true;

    try {
      const { data, error } = await auth.client
        .from("partner_settings")
        .update(update)
        .eq("id", 1)
        .select(
          "id,program_status,minimum_confirmed_paid_users,initial_pro_months,qualified_pro_months,monthly_first_payment_rate,monthly_renewal_rate,monthly_renewal_count,annual_first_payment_rate,approval_days,minimum_payout_usd,payout_window",
        )
        .single();

      if (error) throw error;
      settings = data;
      hydrate(settings);

      const { error: activityError } = await auth.client
        .from("partner_activity")
        .insert({
          creator_id: null,
          actor_user_id: adminUser.id,
          actor_kind: "admin",
          event_type: "settings_updated",
          details: `Updated ${changedFields.length} Partner setting${changedFields.length === 1 ? "" : "s"}`,
          visibility: "admin",
          metadata: { fields: changedFields },
        });

      if (activityError) console.error(activityError);
      await adminSyncPartnerEntitlements();
      dasToast("Settings saved");
    } catch (error) {
      console.error(error);
      dasToast(error?.message || "Settings could not be saved");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  forms.forEach((form) => form.addEventListener("submit", save));

  try {
    await loadSettings();
  } catch (error) {
    console.error(error);
    dasToast("Partner settings could not be loaded");
  }
});
