document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.querySelector("[data-referrals-table]");
  const search = document.querySelector("[data-search-referrals]");
  const partnerFilter = document.querySelector("[data-filter-partner]");
  const statusFilter = document.querySelector("[data-filter-status]");
  const addButton = document.querySelector("[data-add-referral]");
  const drawer = document.querySelector("[data-referral-drawer]");
  const closeButton = document.querySelector("[data-referral-drawer-close]");
  const form = document.querySelector("[data-referral-form]");
  const formTitle = document.querySelector("[data-referral-form-title]");
  const renewalRow = document.querySelector("[data-renewal-row]");
  const approvalRow = document.querySelector("[data-approval-row]");
  const paidDateRow = document.querySelector("[data-paid-date-row]");
  const commissionPreview = document.querySelector("[data-commission-preview]");
  const fields = form.elements;

  const today = () => new Date().toISOString().slice(0, 10);
  const setSelect = (select, value) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const formatDate = (value) => {
    if (!value) return "—";
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  function populatePartners() {
    const creators = PartnersStore.getData().creators;
    fields.creatorId.innerHTML = creators
      .map(
        (creator) =>
          `<option value="${dasEscapeHtml(creator.id)}">${dasEscapeHtml(creator.name)}</option>`,
      )
      .join("");
    partnerFilter.innerHTML = [
      '<option value="">All partners</option>',
      ...creators.map(
        (creator) =>
          `<option value="${dasEscapeHtml(creator.id)}">${dasEscapeHtml(creator.name)}</option>`,
      ),
    ].join("");
  }

  function paymentLabel(referral) {
    if (referral.paymentType === "Renewal") {
      return `Renewal ${referral.renewalNumber}`;
    }
    return "First payment";
  }

  function render() {
    const data = PartnersStore.getData();
    const query = search.value.trim().toLowerCase();
    const partnerId = partnerFilter.value;
    const status = statusFilter.value;
    const creators = new Map(
      data.creators.map((creator) => [creator.id, creator]),
    );
    const referrals = [...data.referrals]
      .sort(
        (a, b) =>
          b.paymentDate.localeCompare(a.paymentDate) ||
          b.id.localeCompare(a.id),
      )
      .filter((referral) => {
        const creator = creators.get(referral.creatorId);
        const searchable = [
          referral.customerRef,
          referral.paddleId,
          creator?.name,
          creator?.code,
        ]
          .join(" ")
          .toLowerCase();

        return (
          (!query || searchable.includes(query)) &&
          (!partnerId || referral.creatorId === partnerId) &&
          (!status || referral.status === status)
        );
      });

    if (!referrals.length) {
      tbody.innerHTML =
        '<tr><td class="referral-empty" colspan="8">No matching referral records.</td></tr>';
      return;
    }

    tbody.innerHTML = referrals
      .map(
        (referral) => `
          <tr>
            <td class="cell-nowrap"><strong>${formatDate(referral.paymentDate)}</strong></td>
            <td class="cell-creator">${creatorCell(referral.creatorId)}</td>
            <td class="cell-transaction">
              <strong>${dasEscapeHtml(referral.customerRef)}</strong>
              <span class="small-muted">${dasEscapeHtml(referral.paddleId)}</span>
            </td>
            <td>
              <strong>${dasEscapeHtml(referral.plan)}</strong>
              <span class="small-muted">${dasEscapeHtml(paymentLabel(referral))}</span>
            </td>
            <td class="cell-amount">${PartnersStore.money(referral.paddleTotalEarnings)}</td>
            <td class="cell-amount">
              <strong>${PartnersStore.money(referral.commissionAmount)}</strong>
              <span class="small-muted">${dasEscapeHtml(referral.commissionRate)}%${referral.commissionPaid ? " · Paid" : ""}</span>
            </td>
            <td class="cell-status">${badge(referral.status)}</td>
            <td class="cell-actions">
              <button class="btn btn-outline btn-sm table-action" type="button" data-edit-referral="${dasEscapeHtml(referral.id)}">Edit</button>
            </td>
          </tr>
        `,
      )
      .join("");

    document.querySelectorAll("[data-edit-referral]").forEach((button) => {
      button.addEventListener("click", () =>
        openDrawer(button.dataset.editReferral),
      );
    });
  }

  function updateCommissionPreview() {
    const data = PartnersStore.getData();
    const referral = {
      plan: fields.plan.value,
      paymentType: fields.paymentType.value,
      renewalNumber: Number(fields.renewalNumber.value || 0),
      paddleTotalEarnings: Number(fields.paddleTotalEarnings.value || 0),
    };
    const commission = PartnersStore.calculateReferralCommission(
      referral,
      data.settings,
    );
    commissionPreview.textContent = `${commission.rate}% · ${PartnersStore.money(
      commission.amount,
    )}`;
  }

  function syncPaymentFields() {
    const isRenewal = fields.paymentType.value === "Renewal";
    renewalRow.hidden = !isRenewal;
    fields.renewalNumber.required = isRenewal;

    if (isRenewal && fields.plan.value !== "Monthly") {
      setSelect(fields.plan, "Monthly");
    }

    updateCommissionPreview();
  }

  function syncStatusFields() {
    const isApproved = fields.status.value === "Approved";
    approvalRow.hidden = !isApproved;
    fields.approvalDate.required = isApproved;
    fields.commissionPaid.disabled = !isApproved;

    if (isApproved && !fields.approvalDate.value) {
      fields.approvalDate.value = today();
    }

    if (!isApproved) {
      fields.approvalDate.value = "";
      fields.commissionPaid.checked = false;
      fields.paidDate.value = "";
    }

    paidDateRow.hidden = !isApproved || !fields.commissionPaid.checked;
    fields.paidDate.required = isApproved && fields.commissionPaid.checked;

    if (!paidDateRow.hidden && !fields.paidDate.value) {
      fields.paidDate.value = today();
    }
  }

  function resetForm() {
    const data = PartnersStore.getData();
    form.reset();
    fields.id.value = "";
    fields.paymentDate.value = today();
    fields.renewalNumber.value = "1";
    fields.renewalNumber.max = String(data.settings.monthlyRenewalCount);
    setSelect(fields.creatorId, data.creators[0].id);
    setSelect(fields.plan, "Monthly");
    setSelect(fields.paymentType, "First payment");
    setSelect(fields.status, "Pending");
    syncPaymentFields();
    syncStatusFields();
  }

  function openDrawer(id = "") {
    resetForm();

    if (id) {
      const referral = PartnersStore.getData().referrals.find(
        (item) => item.id === id,
      );
      if (!referral) return;

      fields.id.value = referral.id;
      setSelect(fields.creatorId, referral.creatorId);
      fields.customerRef.value = referral.customerRef;
      fields.paddleId.value = referral.paddleId;
      setSelect(fields.plan, referral.plan);
      setSelect(fields.paymentType, referral.paymentType);
      fields.renewalNumber.value = String(referral.renewalNumber || 1);
      fields.paymentDate.value = referral.paymentDate;
      fields.paddleTotalEarnings.value = String(referral.paddleTotalEarnings);
      setSelect(fields.status, referral.status);
      fields.approvalDate.value = referral.approvalDate || "";
      fields.commissionPaid.checked = Boolean(referral.commissionPaid);
      fields.paidDate.value = referral.paidDate || "";
      syncPaymentFields();
      syncStatusFields();
    }

    formTitle.textContent = id ? "Edit referral" : "Add referral";
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    setTimeout(() => fields.customerRef.focus(), 0);
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }

  function validateReferral(payload) {
    const referrals = PartnersStore.getData().referrals;
    const normalize = (value) => value.trim().toLowerCase();
    const otherRecords = referrals.filter(
      (referral) => referral.id !== payload.id,
    );

    if (
      otherRecords.some(
        (referral) =>
          normalize(referral.paddleId) === normalize(payload.paddleId),
      )
    ) {
      dasToast("This Paddle transaction is already recorded");
      return false;
    }

    const sameCustomer = (referral) =>
      referral.creatorId === payload.creatorId &&
      normalize(referral.customerRef) === normalize(payload.customerRef);

    if (
      payload.paymentType === "First payment" &&
      otherRecords.some(
        (referral) =>
          sameCustomer(referral) && referral.paymentType === "First payment",
      )
    ) {
      dasToast("This customer already has a first-payment record");
      return false;
    }

    if (
      payload.paymentType === "Renewal" &&
      !referrals.some(
        (referral) =>
          sameCustomer(referral) && referral.paymentType === "First payment",
      )
    ) {
      dasToast("Add this customer's first payment before its renewal");
      return false;
    }

    if (
      payload.paymentType === "Renewal" &&
      otherRecords.some(
        (referral) =>
          sameCustomer(referral) &&
          referral.paymentType === "Renewal" &&
          Number(referral.renewalNumber) === Number(payload.renewalNumber),
      )
    ) {
      dasToast("This renewal number is already recorded");
      return false;
    }

    return true;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const payload = {
      id: fields.id.value,
      creatorId: fields.creatorId.value,
      customerRef: fields.customerRef.value,
      paddleId: fields.paddleId.value,
      plan: fields.plan.value,
      paymentType: fields.paymentType.value,
      renewalNumber: Number(fields.renewalNumber.value || 0),
      paymentDate: fields.paymentDate.value,
      paddleTotalEarnings: Number(fields.paddleTotalEarnings.value),
      status: fields.status.value,
      approvalDate: fields.approvalDate.value,
      commissionPaid: fields.commissionPaid.checked,
      paidDate: fields.paidDate.value,
    };

    if (!validateReferral(payload)) return;

    PartnersStore.saveReferral(payload);
    closeDrawer();
    render();
    adminHydrateStats();
    dasToast(payload.id ? "Referral updated" : "Referral added");
  });

  populatePartners();
  fields.paymentType.addEventListener("change", syncPaymentFields);
  fields.plan.addEventListener("change", updateCommissionPreview);
  fields.renewalNumber.addEventListener("input", updateCommissionPreview);
  fields.paddleTotalEarnings.addEventListener("input", updateCommissionPreview);
  fields.status.addEventListener("change", syncStatusFields);
  fields.commissionPaid.addEventListener("change", syncStatusFields);
  search.addEventListener("input", render);
  partnerFilter.addEventListener("change", render);
  statusFilter.addEventListener("change", render);
  addButton.addEventListener("click", () => openDrawer());
  closeButton.addEventListener("click", closeDrawer);
  document.addEventListener("pointerdown", (event) => {
    if (
      drawer.classList.contains("is-open") &&
      !drawer.contains(event.target)
    ) {
      closeDrawer();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) {
      closeDrawer();
    }
  });

  render();
});
