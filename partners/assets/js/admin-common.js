function isCurrentMonth(value) {
  if (!value) return false;
  const current = new Date();
  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === current.getFullYear() &&
    date.getMonth() === current.getMonth()
  );
}

function badge(status) {
  const auth = window.DentAIStudyPartnerSupabase;
  const className = auth?.statusClass?.(status) || "gray";
  return `<span class="pill ${className}">${dasEscapeHtml(status)}</span>`;
}

async function adminStatTotals() {
  const auth = window.DentAIStudyPartnerSupabase;
  if (!auth?.enabled) return null;

  const authState = await window.DentAIStudyPartnerAuthReady;
  if (!authState?.user) return null;

  const [creatorsResult, referralsResult, payoutsResult] = await Promise.all([
    auth.client.from("partner_creators").select("id"),
    auth.client
      .from("partner_referrals")
      .select(
        "creator_id,customer_token,payment_type,status,commission_amount,payout_id",
      ),
    auth.client
      .from("partner_payouts")
      .select("id,status,amount_usd,paid_date,scheduled_date"),
  ]);

  const error =
    creatorsResult.error || referralsResult.error || payoutsResult.error;
  if (error) throw error;

  const creators = creatorsResult.data || [];
  const referrals = referralsResult.data || [];
  const payouts = payoutsResult.data || [];
  const payoutById = new Map(payouts.map((payout) => [payout.id, payout]));
  const confirmedCustomers = new Set();
  const pendingCustomers = new Set();
  let approved = 0;

  referrals.forEach((referral) => {
    const customerKey = `${referral.creator_id}:${referral.customer_token}`;

    if (
      referral.payment_type === "first_payment" &&
      referral.status === "approved"
    ) {
      confirmedCustomers.add(customerKey);
    }

    if (
      referral.payment_type === "first_payment" &&
      referral.status === "pending"
    ) {
      pendingCustomers.add(customerKey);
    }

    if (referral.status === "approved") {
      const payout = referral.payout_id
        ? payoutById.get(referral.payout_id)
        : null;
      if (!payout || payout.status !== "paid") {
        approved += Number(referral.commission_amount || 0);
      }
    }
  });

  const totals = {
    creators: creators.length,
    referrals: referrals.length,
    confirmed: confirmedCustomers.size,
    pending: pendingCustomers.size,
    pendingReferrals: referrals.filter(
      (referral) => referral.status === "pending",
    ).length,
    approved,
    paid: payouts
      .filter((payout) => payout.status === "paid")
      .reduce((sum, payout) => sum + Number(payout.amount_usd || 0), 0),
    ready: payouts.filter((payout) => payout.status === "ready").length,
    paidThisMonth: payouts
      .filter(
        (payout) =>
          payout.status === "paid" &&
          isCurrentMonth(payout.paid_date || payout.scheduled_date),
      )
      .reduce((sum, payout) => sum + Number(payout.amount_usd || 0), 0),
  };

  auth.writeCache("stats", totals);
  return totals;
}

async function adminSyncPartnerEntitlements() {
  const auth = window.DentAIStudyPartnerSupabase;
  if (!auth?.enabled) return null;

  const authState = await window.DentAIStudyPartnerAuthReady;
  if (!authState?.user) return null;

  const { data, error } = await auth.client.functions.invoke("partner-invite", {
    body: { action: "sync_entitlements" },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || null;
}

function adminRenderStats(totals) {
  const auth = window.DentAIStudyPartnerSupabase;
  if (!totals) return;

  document.querySelectorAll("[data-stat]").forEach((element) => {
    const key = element.dataset.stat;
    const value = totals[key];
    element.textContent = ["approved", "paid", "paidThisMonth"].includes(key)
      ? auth.money(value)
      : value ?? 0;
  });
}

async function adminHydrateStats() {
  const auth = window.DentAIStudyPartnerSupabase;
  if (!auth?.enabled) return;

  const authState = await window.DentAIStudyPartnerAuthReady;
  if (!authState?.user) return;

  adminRenderStats(auth.readCache("stats"));

  const totals = await adminStatTotals();
  adminRenderStats(totals);
}

function adminHydrateTableLabels(root = document) {
  root.querySelectorAll(".admin-content table").forEach((table) => {
    const labels = Array.from(table.querySelectorAll("thead th")).map((th) =>
      th.textContent.trim(),
    );
    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = Array.from(row.children);
      const isEmptyRow =
        cells.length === 1 &&
        (cells[0].classList.contains("referral-empty") || cells[0].colSpan > 1);

      row.classList.toggle("is-empty-row", isEmptyRow);
      cells.forEach((cell, index) => {
        if (isEmptyRow) {
          cell.removeAttribute("data-label");
        } else if (labels[index]) {
          cell.setAttribute("data-label", labels[index]);
        }
      });
    });
  });
}

function adminWatchTables() {
  adminHydrateTableLabels();
  document.querySelectorAll(".admin-content tbody").forEach((tbody) => {
    const observer = new MutationObserver(() => adminHydrateTableLabels());
    observer.observe(tbody, { childList: true });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  adminWatchTables();

  try {
    await adminHydrateStats();
  } catch (error) {
    console.error("Admin stats could not be loaded:", error);
  }
});
