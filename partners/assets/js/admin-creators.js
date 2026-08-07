document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.querySelector("[data-partners-table]");
  const search = document.querySelector("[data-search-partners]");
  const accountFilter = document.querySelector("[data-filter-account]");
  const addButton = document.querySelector("[data-add-partner]");
  const drawer = document.querySelector("[data-partner-drawer]");
  const closeButton = document.querySelector("[data-partner-drawer-close]");
  const form = document.querySelector("[data-partner-form]");
  const formTitle = document.querySelector("[data-partner-form-title]");
  const submitButton = document.querySelector("[data-partner-submit]");
  const summary = document.querySelector("[data-partner-summary]");
  const summaryAccount = document.querySelector("[data-summary-account]");
  const summaryQualification = document.querySelector(
    "[data-summary-qualification]",
  );
  const summaryPayout = document.querySelector("[data-summary-payout]");
  const fields = form.elements;
  let activeId = "";

  const escapeHtml = (value) => {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  };
  const setSelect = (select, value) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const qualificationLabel = (partner) =>
    partner.qualified ? "Qualified" : "In progress";
  const partnerInitials = (name) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.replace(/[^a-z0-9]/gi, "").charAt(0))
      .join("")
      .toUpperCase() || "DP";

  function renderStats(partners) {
    const totals = {
      total: partners.length,
      active: partners.filter((partner) => partner.accountStatus === "Active")
        .length,
      qualified: partners.filter((partner) => partner.qualified).length,
      ready: partners.filter((partner) => partner.payoutStatus === "Ready")
        .length,
    };

    document.querySelectorAll("[data-partner-stat]").forEach((element) => {
      element.textContent = totals[element.dataset.partnerStat];
    });
  }

  function render() {
    const data = PartnersStore.getData();
    const query = search.value.trim().toLowerCase();
    const accountStatus = accountFilter.value;
    const partners = data.creators.filter((partner) => {
      const searchable = [partner.name, partner.email, partner.code]
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (!accountStatus || partner.accountStatus === accountStatus)
      );
    });

    renderStats(data.creators);

    if (!partners.length) {
      tbody.innerHTML =
        '<tr><td class="referral-empty" colspan="7">No matching partner accounts.</td></tr>';
      return;
    }

    tbody.innerHTML = partners
      .map(
        (partner) => `
          <tr>
            <td class="cell-creator">
              <div class="creator-cell">
                <strong>${escapeHtml(partner.name)}</strong>
                <span class="small-muted">${escapeHtml(partner.email)}</span>
              </div>
            </td>
            <td class="cell-code">${escapeHtml(partner.code)}</td>
            <td class="cell-status">
              <div class="partner-cell-stack">
                ${badge(partner.accountStatus)}
              </div>
            </td>
            <td class="cell-status">
              <div class="partner-cell-stack">
                ${badge(qualificationLabel(partner))}
                <span class="small-muted">${partner.confirmed} / ${data.settings.minimumUsers} confirmed</span>
              </div>
            </td>
            <td class="cell-status">
              <div class="partner-cell-stack">
                ${badge(partner.payoutStatus)}
                <span class="small-muted">${PartnersStore.money(partner.approvedCommission)} approved</span>
              </div>
            </td>
            <td class="cell-nowrap">${escapeHtml(partner.lastUpdated)}</td>
            <td class="cell-actions">
              <button class="btn btn-outline btn-sm table-action" type="button" data-edit-partner="${partner.id}">Edit</button>
            </td>
          </tr>
        `,
      )
      .join("");

    document.querySelectorAll("[data-edit-partner]").forEach((button) => {
      button.addEventListener("click", () =>
        openDrawer(button.dataset.editPartner),
      );
    });
  }

  function renderSummary(partner, minimumUsers) {
    summaryAccount.innerHTML = badge(partner.accountStatus);
    summaryQualification.innerHTML = `${badge(
      qualificationLabel(partner),
    )}<br><span class="small-muted">${partner.confirmed} / ${minimumUsers} confirmed users</span>`;
    summaryPayout.innerHTML = `${badge(
      partner.payoutStatus,
    )}<br><span class="small-muted">${PartnersStore.money(
      partner.approvedCommission,
    )} approved</span>`;
  }

  function resetForm() {
    form.reset();
    activeId = "";
    fields.id.value = "";
    setSelect(fields.accountStatus, "Active");
    setSelect(fields.payoutMethod, "Not added");
    summary.hidden = true;
  }

  function openDrawer(id = "") {
    resetForm();

    if (id) {
      const data = PartnersStore.getData();
      const partner = data.creators.find((item) => item.id === id);
      if (!partner) return;

      activeId = id;
      fields.id.value = id;
      fields.name.value = partner.name;
      fields.email.value = partner.email;
      fields.code.value = partner.code;
      fields.notes.value = partner.notes || "";
      setSelect(fields.accountStatus, partner.accountStatus);
      setSelect(fields.payoutMethod, partner.payoutMethod || "Not added");
      renderSummary(partner, data.settings.minimumUsers);
      summary.hidden = false;
    }

    formTitle.textContent = id ? "Edit partner" : "Add partner";
    submitButton.textContent = id ? "Save changes" : "Add partner";
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    setTimeout(() => fields.name.focus(), 0);
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }

  function validatePartner(payload) {
    const partners = PartnersStore.getData().creators.filter(
      (partner) => partner.id !== activeId,
    );
    const normalize = (value) => value.trim().toLowerCase();

    if (
      partners.some(
        (partner) => normalize(partner.code) === normalize(payload.code),
      )
    ) {
      dasToast("This promo code is already assigned");
      return false;
    }

    if (
      partners.some(
        (partner) => normalize(partner.email) === normalize(payload.email),
      )
    ) {
      dasToast("This email is already assigned");
      return false;
    }

    return true;
  }

  function addPartner(payload) {
    const data = PartnersStore.getData();
    const id = `partner-${Date.now()}`;

    data.creators.unshift({
      id,
      name: payload.name,
      initials: partnerInitials(payload.name),
      email: payload.email,
      code: payload.code,
      accountStatus: payload.accountStatus,
      payoutMethod: payload.payoutMethod,
      lastUpdated: PartnersStore.nowStamp(),
      notes: payload.notes,
    });

    PartnersStore.saveData(data);
    PartnersStore.addActivity({
      event: "Partner account added",
      creatorId: id,
      details: `${payload.code} · ${payload.accountStatus}`,
      status: "Updated",
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim().toLowerCase(),
      code: fields.code.value.trim().toUpperCase(),
      accountStatus: fields.accountStatus.value,
      payoutMethod: fields.payoutMethod.value,
      notes: fields.notes.value.trim(),
    };

    if (!validatePartner(payload)) return;

    if (activeId) {
      PartnersStore.updateCreator(activeId, {
        ...payload,
        initials: partnerInitials(payload.name),
      });
    } else {
      addPartner(payload);
    }

    closeDrawer();
    render();
    dasToast(activeId ? "Partner saved" : "Partner added");
  });

  search.addEventListener("input", render);
  accountFilter.addEventListener("change", render);
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
