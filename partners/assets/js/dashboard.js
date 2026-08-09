document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
  if (!auth?.enabled) return;

  const set = (selector, value) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const list = document.querySelector("[data-activity-list]");

  try {
    const authState = await window.DentAIStudyPartnerAuthReady;
    if (!authState?.profile) return;

    const { profile } = authState;
    const [summary, recentActivity] = await Promise.all([
      auth.loadPartnerSummary(profile),
      auth.getPartnerActivity(profile.id, 3),
    ]);
    const progress = Math.min(
      100,
      Math.round((summary.confirmed / summary.minimumUsers) * 100),
    );
    const remainingUsers = Math.max(
      0,
      summary.minimumUsers - summary.confirmed,
    );

    set("[data-creator-name]", profile.name);
    set("[data-code]", profile.promo_code);
    set("[data-confirmed]", summary.confirmed);
    set("[data-minimum]", summary.minimumUsers);
    set(
      "[data-progress-note]",
      remainingUsers === 0
        ? "Payout qualification unlocked"
        : `${remainingUsers} more to unlock payouts`,
    );
    set("[data-pending-commission]", auth.money(summary.pendingCommission));
    set("[data-approved-commission]", auth.money(summary.approvedCommission));
    set("[data-paid-commission]", auth.money(summary.paidCommission));
    set(
      "[data-pending-note]",
      `${summary.pendingUsers} ${summary.pendingUsers === 1 ? "user" : "users"} awaiting review`,
    );
    set("[data-next-payout]", summary.nextPayout);
    set("[data-payout-method]", profile.payout_method || "Not added");

    const codeBox = document.querySelector("[data-copy-code]");
    if (codeBox) codeBox.setAttribute("data-copy", profile.promo_code);

    const progressElement = document.querySelector("[data-progress-fill]");
    if (progressElement) {
      progressElement.style.setProperty("--progress", progress + "%");
    }

    const status = document.querySelector("[data-status-pill]");
    if (status) {
      const accountStatus = auth.titleCase(profile.account_status);
      status.textContent = accountStatus;
      status.className = `pill ${auth.statusClass(accountStatus)}`;
    }

    if (list) {
      list.innerHTML =
        recentActivity
          .map((activity) => {
            const item = auth.activityPresentation(activity);
            return `
              <div class="activity-row">
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
    }
  } catch (error) {
    console.error("Partner dashboard could not load:", error);
    if (list) {
      list.innerHTML =
        '<p class="empty-note">Partner data could not be loaded.</p>';
    }
  }
});
