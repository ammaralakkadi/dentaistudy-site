document.addEventListener("DOMContentLoaded", () => {
  const id = PartnersStore.activeCreator();
  const data = PartnersStore.getData();
  const c = PartnersStore.getCreator(id);
  const settings = data.settings;
  const progress = Math.min(
    100,
    Math.round(
      (Number(c.confirmed || 0) / Number(settings.minimumUsers || 10)) * 100,
    ),
  );
  const set = (sel, value) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.textContent = value;
    });
  };
  set("[data-creator-name]", c.name);
  set("[data-creator-initials]", c.initials);
  set("[data-code]", c.code);
  set("[data-confirmed]", c.confirmed);
  set("[data-minimum]", settings.minimumUsers);
  const remainingUsers = Math.max(0, settings.minimumUsers - c.confirmed);
  set(
    "[data-progress-note]",
    remainingUsers === 0
      ? "Payout qualification unlocked"
      : `${remainingUsers} more to unlock payouts`,
  );
  set("[data-pending-commission]", PartnersStore.money(c.pendingCommission));
  set("[data-approved-commission]", PartnersStore.money(c.approvedCommission));
  set("[data-paid-commission]", PartnersStore.money(c.paidCommission));
  set(
    "[data-pending-note]",
    `${c.pendingUsers} ${c.pendingUsers === 1 ? "user" : "users"} awaiting review`,
  );
  set("[data-next-payout]", c.nextPayout);
  set("[data-payout-method]", c.payoutMethod);
  set("[data-support-email]", settings.supportEmail);
  const codeBox = document.querySelector("[data-copy-code]");
  if (codeBox) codeBox.setAttribute("data-copy", c.code);
  const progressEl = document.querySelector("[data-progress-fill]");
  if (progressEl) progressEl.style.setProperty("--progress", progress + "%");
  const status = document.querySelector("[data-status-pill]");
  if (status) {
    status.textContent = c.status;
    status.className = "pill " + PartnersStore.statusClass(c.status);
  }

  const recent = data.activity.filter((a) => a.creatorId === c.id).slice(0, 3);
  const list = document.querySelector("[data-activity-list]");
  if (list) {
    list.innerHTML =
      recent
        .map(
          (a) => `
            <div class="activity-row">
              <div class="activity-date">
                <strong>${a.date.split(",")[0]}</strong>
              </div>
              <div class="activity-main-copy">
                <div class="activity-title-line">
                <div class="activity-title">${dasEscapeHtml(a.event)}</div>
                <span class="pill ${PartnersStore.statusClass(a.status)}">
                    ${dasEscapeHtml(a.status)}
                  </span>
                </div>
                <div class="activity-sub">${dasEscapeHtml(a.details)}</div>
              </div>
            </div>
          `,
        )
        .join("") || '<p class="empty-note">No activity yet.</p>';
  }
});
