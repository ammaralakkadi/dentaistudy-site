document.addEventListener("DOMContentLoaded", () => {
  const forms = Array.from(document.querySelectorAll("[data-settings-form]"));
  const data = PartnersStore.getData();
  const settings = data.settings;
  const field = (name) => document.querySelector(`[name="${name}"]`);

  Object.entries(settings).forEach(([name, value]) => {
    const element = field(name);
    if (element) element.value = String(value);
  });

  const read = (name, fallback = "") => {
    const element = field(name);
    return element ? element.value : fallback;
  };

  const readNumber = (name, fallback = 0) => Number(read(name, fallback));

  function save(event) {
    event.preventDefault();
    const current = PartnersStore.getData();

    current.settings = {
      ...current.settings,
      programStatus: read("programStatus", current.settings.programStatus),
      inviteOnly:
        read("inviteOnly", String(current.settings.inviteOnly)) === "true",
      minimumUsers: readNumber("minimumUsers", current.settings.minimumUsers),
      initialProMonths: readNumber(
        "initialProMonths",
        current.settings.initialProMonths,
      ),
      qualifiedProMonths: readNumber(
        "qualifiedProMonths",
        current.settings.qualifiedProMonths,
      ),
      studentDiscount: readNumber(
        "studentDiscount",
        current.settings.studentDiscount,
      ),
      discountScope: read("discountScope", current.settings.discountScope),
      monthlyFirstPaymentRate: readNumber(
        "monthlyFirstPaymentRate",
        current.settings.monthlyFirstPaymentRate,
      ),
      monthlyRenewalRate: readNumber(
        "monthlyRenewalRate",
        current.settings.monthlyRenewalRate,
      ),
      monthlyRenewalCount: readNumber(
        "monthlyRenewalCount",
        current.settings.monthlyRenewalCount,
      ),
      annualFirstPaymentRate: readNumber(
        "annualFirstPaymentRate",
        current.settings.annualFirstPaymentRate,
      ),
      commissionBase: read("commissionBase", current.settings.commissionBase),
      attributionRule: read(
        "attributionRule",
        current.settings.attributionRule,
      ),
      approvalDays: readNumber("approvalDays", current.settings.approvalDays),
      minimumPayout: readNumber(
        "minimumPayout",
        current.settings.minimumPayout,
      ),
      payoutWindow: read("payoutWindow", current.settings.payoutWindow),
      payoutMethod: read("payoutMethod", current.settings.payoutMethod),
      disclosureRule: read("disclosureRule", current.settings.disclosureRule),
      supportEmail: read("supportEmail", current.settings.supportEmail),
      publicUrl: read("publicUrl", current.settings.publicUrl),
      loginUrl: read("loginUrl", current.settings.loginUrl),
    };

    PartnersStore.saveData(current);
    PartnersStore.addActivity({
      event: "Updated partner settings",
      details: "Program rules and payout settings updated",
      status: "Updated",
    });
    dasToast("Settings saved");
  }

  forms.forEach((form) => form.addEventListener("submit", save));
});
