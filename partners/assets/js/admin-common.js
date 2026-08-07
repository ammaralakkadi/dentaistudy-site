function adminCreatorOptions(selected = "") {
  return PartnersStore.getData()
    .creators.map(
      (c) =>
        `<option value="${dasEscapeHtml(c.id)}" ${c.id === selected ? "selected" : ""}>${dasEscapeHtml(c.name)}</option>`,
    )
    .join("");
}
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
function adminStatTotals() {
  const data = PartnersStore.getData();
  const creators = data.creators;
  return {
    creators: creators.length,
    referrals: data.referrals.length,
    confirmed: creators.reduce(
      (sum, creator) => sum + Number(creator.confirmed || 0),
      0,
    ),
    pending: creators.reduce(
      (sum, creator) => sum + Number(creator.pendingUsers || 0),
      0,
    ),
    pendingReferrals: data.referrals.filter(
      (referral) => referral.status === "Pending",
    ).length,
    approved: creators.reduce(
      (sum, creator) => sum + Number(creator.approvedCommission || 0),
      0,
    ),
    paid: creators.reduce(
      (sum, creator) => sum + Number(creator.paidCommission || 0),
      0,
    ),
    ready: data.payouts.filter((payout) => payout.status === "Ready").length,
    paidThisMonth: data.payouts
      .filter(
        (payout) =>
          payout.status === "Paid" &&
          isCurrentMonth(payout.paidDate || payout.scheduled),
      )
      .reduce((sum, payout) => sum + Number(payout.approved || 0), 0),
  };
}
function adminHydrateStats() {
  const t = adminStatTotals();
  document.querySelectorAll("[data-stat]").forEach((el) => {
    const key = el.dataset.stat;
    const val = t[key];
    el.textContent = ["approved", "paid", "paidThisMonth"].includes(key)
      ? PartnersStore.money(val)
      : val;
  });
}
function creatorCell(id) {
  const c = PartnersStore.getCreator(id);
  return `<div class="creator-cell"><strong>${dasEscapeHtml(c.name)}</strong><span class="small-muted">${dasEscapeHtml(c.code)}</span></div>`;
}
function badge(status) {
  return `<span class="pill ${PartnersStore.statusClass(status)}">${dasEscapeHtml(status)}</span>`;
}

function adminHydrateTableLabels(root = document) {
  root.querySelectorAll(".admin-content table").forEach((table) => {
    const labels = Array.from(table.querySelectorAll("thead th")).map((th) =>
      th.textContent.trim(),
    );
    table.querySelectorAll("tbody tr").forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        if (labels[index]) cell.setAttribute("data-label", labels[index]);
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

document.addEventListener("DOMContentLoaded", () => {
  adminHydrateStats();
  adminWatchTables();
  document
    .querySelectorAll("[data-admin-creator-select]")
    .forEach((sel) => (sel.innerHTML = adminCreatorOptions(sel.value)));
});
