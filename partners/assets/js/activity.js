document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
  if (!auth?.enabled) return;

  const set = (selector, value) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  };
  const list = document.querySelector("[data-activity-page-list]");

  function renderSummary(summary) {
    set("[data-confirmed]", summary.confirmed);
    set("[data-pending-users]", summary.pendingUsers);
    set("[data-approved-commission]", auth.money(summary.approvedCommission));
  }

  try {
    const authState = await window.DentAIStudyPartnerAuthReady;
    if (!authState?.profile) return;

    const { profile } = authState;
    const cachedSummary = auth.getCachedPartnerSummary(profile.id);
    if (cachedSummary) renderSummary(cachedSummary);

    const [summary, rows] = await Promise.all([
      auth.loadPartnerSummary(profile),
      auth.getPartnerActivity(profile.id),
    ]);

    renderSummary(summary);

    if (!list) return;

    list.innerHTML =
      rows
        .map((activity) => {
          const item = auth.activityPresentation(activity);
          return `
            <div class="activity-page-row">
              <div class="activity-date">
                <strong>${dasEscapeHtml(item.date)}</strong>
              </div>
              <div class="activity-main-copy">
                <div class="activity-title-line">
                  <div class="activity-title">${dasEscapeHtml(item.title)}</div>
                  <span class="pill ${auth.statusClass(item.status)}">
                    ${dasEscapeHtml(item.status)}
                  </span>
                </div>
                <div class="activity-sub">${dasEscapeHtml(item.details)}</div>
              </div>
            </div>
          `;
        })
        .join("") || '<p class="empty-note">No activity yet.</p>';
  } catch (error) {
    console.error("Partner activity could not load:", error);
    if (list) {
      list.innerHTML =
        '<p class="empty-note">Partner activity could not be loaded.</p>';
    }
  } finally {
    auth.revealProtectedPage();
  }
});
