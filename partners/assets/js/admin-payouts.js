document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.querySelector("[data-payouts-table]");
  const preview = document.querySelector("[data-payout-preview]");
  let activeId = "";

  function renderPreview(payout) {
    if (!payout) {
      activeId = "";
      preview.innerHTML = '<p class="empty-note">No payouts recorded.</p>';
      return;
    }

    activeId = payout.id;
    const creator = PartnersStore.getCreator(payout.creatorId);
    const action =
      payout.status === "Paid"
        ? '<span class="pill green">Payment recorded</span>'
        : '<button class="btn btn-primary" type="button" data-mark-paid>Mark as paid</button>';

    preview.innerHTML = `
      <div class="preview-grid clean-preview">
        <div class="preview-profile">
          <div class="avatar soft">${dasEscapeHtml(creator.initials)}</div>
          <h3>${dasEscapeHtml(creator.name)}</h3>
          <p class="small-muted">${dasEscapeHtml(creator.code)}</p>
          ${badge(payout.status)}
        </div>
        <div class="preview-detail">
          <div class="preview-metrics cols-3">
            <div class="preview-metric">
              <span>Payout ID</span>
              <strong>${dasEscapeHtml(payout.id)}</strong>
            </div>
            <div class="preview-metric">
              <span>Approved commission</span>
              <strong>${PartnersStore.money(payout.approved)}</strong>
            </div>
            <div class="preview-metric">
              <span>Payment method</span>
              <strong>${dasEscapeHtml(payout.method)}</strong>
            </div>
          </div>
          <div class="preview-rows">
            <div class="rule-line">
              <span>Scheduled date</span>
              <strong>${dasEscapeHtml(payout.scheduled)}</strong>
            </div>
            <div class="rule-line">
              <span>Wise reference</span>
              <strong>${dasEscapeHtml(payout.ref)}</strong>
            </div>
            <div class="rule-line">
              <span>Notes</span>
              <strong>${dasEscapeHtml(payout.notes)}</strong>
            </div>
          </div>
          <div class="preview-actions">${action}</div>
        </div>
      </div>
    `;

    preview.querySelector("[data-mark-paid]")?.addEventListener("click", () => {
      PartnersStore.markPayoutPaid(activeId);
      render(activeId);
      adminHydrateStats();
      dasToast("Payout marked as paid");
    });
  }

  function render(selectedId = activeId) {
    const data = PartnersStore.getData();
    tbody.innerHTML = data.payouts
      .map(
        (payout, index) => {
          const creator = PartnersStore.getCreator(payout.creatorId);

          return `
            <tr>
              <td class="cell-creator" data-label="Partner">
                <div class="creator-cell payout-partner-cell">
                  <strong>${dasEscapeHtml(creator.name)}</strong>
                  <span class="small-muted payout-partner-email">${dasEscapeHtml(creator.email)}</span>
                  <span class="small-muted">${dasEscapeHtml(creator.code)}</span>
                </div>
              </td>
              <td class="cell-amount" data-label="Commission">
                <strong>${PartnersStore.money(payout.approved)}</strong>
                <span class="small-muted">${dasEscapeHtml(payout.eligibleUsers)} eligible users</span>
              </td>
              <td data-label="Payment">
                <strong>${dasEscapeHtml(payout.method)}</strong>
                <span class="small-muted">${dasEscapeHtml(payout.scheduled)}</span>
              </td>
              <td class="cell-status" data-label="Status">${badge(payout.status)}</td>
              <td class="cell-actions" data-label="Actions">
                <button class="btn btn-outline btn-sm table-action" type="button" data-view-payout="${index}">View</button>
              </td>
            </tr>
          `;
        },
      )
      .join("");

    document.querySelectorAll("[data-view-payout]").forEach((button) => {
      button.addEventListener("click", () => {
        renderPreview(
          PartnersStore.getData().payouts[Number(button.dataset.viewPayout)],
        );
      });
    });

    renderPreview(
      data.payouts.find((payout) => payout.id === selectedId) ||
        data.payouts[0],
    );
  }

  document.querySelectorAll("[data-payout-placeholder]").forEach((button) => {
    button.addEventListener("click", () => {
      dasToast(button.dataset.payoutPlaceholder);
    });
  });

  render();
});
