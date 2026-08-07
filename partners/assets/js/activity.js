document.addEventListener("DOMContentLoaded", () => {
  const id = PartnersStore.activeCreator();
  const data = PartnersStore.getData();
  const c = PartnersStore.getCreator(id);
  const set = (sel, value) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.textContent = value;
    });
  };

  set("[data-creator-name]", c.name);
  set("[data-creator-initials]", c.initials);
  set("[data-code]", c.code);
  set("[data-confirmed]", c.confirmed);
  set("[data-pending-users]", c.pendingUsers);
  set("[data-approved-commission]", PartnersStore.money(c.approvedCommission));

  const rows = data.activity.filter((a) => a.creatorId === c.id);
  const list = document.querySelector("[data-activity-page-list]");
  if (!list) return;

  list.innerHTML =
    rows
      .map(
        (a) => `
        <div class="activity-page-row">
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
});
