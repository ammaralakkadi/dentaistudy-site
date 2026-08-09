document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
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
  const commissionPreview = document.querySelector("[data-commission-preview]");
  const activityBody = document.querySelector("[data-admin-activity]");

  if (
    !auth?.enabled ||
    !tbody ||
    !search ||
    !partnerFilter ||
    !statusFilter ||
    !addButton ||
    !drawer ||
    !closeButton ||
    !form ||
    !commissionPreview ||
    !activityBody
  ) {
    return;
  }

  const authState = await window.DentAIStudyPartnerAuthReady;
  if (!authState?.user) return;

  const adminUser = authState.user;
  const fields = form.elements;
  let settings = null;
  let creators = [];
  let referrals = [];
  let sources = [];
  let activeReferral = null;

  const today = () => new Date().toISOString().slice(0, 10);
  const normalize = (value) => String(value || "").trim().toLowerCase();
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
  const addDays = (value, days) => {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  };
  const dayDifference = (start, end) => {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    return Math.round((endDate - startDate) / 86400000);
  };

  const creatorById = () =>
    new Map(creators.map((creator) => [creator.id, creator]));
  const referralById = () =>
    new Map(referrals.map((referral) => [referral.id, referral]));
  const sourceByReferral = () =>
    new Map(sources.map((source) => [source.referral_id, source]));

  function paymentLabel(referral) {
    return referral.payment_type === "renewal"
      ? `Renewal ${referral.renewal_number}`
      : "First payment";
  }

  function creatorCell(creatorId) {
    const creator = creatorById().get(creatorId);
    if (!creator) return "—";

    return `<div class="creator-cell"><strong>${dasEscapeHtml(creator.name)}</strong><span class="small-muted">${dasEscapeHtml(creator.promo_code)}</span></div>`;
  }

  function populatePartners() {
    const currentFilter = partnerFilter.value;
    const options = creators
      .map(
        (creator) =>
          `<option value="${dasEscapeHtml(creator.id)}">${dasEscapeHtml(creator.name)}</option>`,
      )
      .join("");

    fields.creatorId.innerHTML = options;
    partnerFilter.innerHTML = `<option value="">All partners</option>${options}`;
    if (creators.some((creator) => creator.id === currentFilter)) {
      partnerFilter.value = currentFilter;
    }

  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const selectedPartner = partnerFilter.value;
    const selectedStatus = statusFilter.value.toLowerCase();
    const creatorsMap = creatorById();
    const sourcesMap = sourceByReferral();
    const visible = [...referrals]
      .sort(
        (a, b) =>
          String(b.payment_date).localeCompare(String(a.payment_date)) ||
          String(b.created_at).localeCompare(String(a.created_at)),
      )
      .filter((referral) => {
        const creator = creatorsMap.get(referral.creator_id);
        const source = sourcesMap.get(referral.id);
        const searchable = [
          source?.paddle_customer_id,
          source?.paddle_transaction_id,
          creator?.name,
          creator?.promo_code,
        ]
          .join(" ")
          .toLowerCase();

        return (
          (!query || searchable.includes(query)) &&
          (!selectedPartner || referral.creator_id === selectedPartner) &&
          (!selectedStatus || referral.status === selectedStatus)
        );
      });

    if (!visible.length) {
      const emptyMessage = !creators.length
        ? "No Partners yet. Add a Partner before recording referrals."
        : !referrals.length
          ? "No referral records yet."
          : "No matching referral records.";
      tbody.innerHTML = `<tr><td class="referral-empty" colspan="8">${emptyMessage}</td></tr>`;
      return;
    }

    tbody.innerHTML = visible
      .map((referral) => {
        const source = sourcesMap.get(referral.id);
        return `
          <tr>
            <td class="cell-nowrap"><strong>${formatDate(referral.payment_date)}</strong></td>
            <td class="cell-creator">${creatorCell(referral.creator_id)}</td>
            <td class="cell-transaction">
              <strong>${dasEscapeHtml(source?.paddle_customer_id || "—")}</strong>
              <span class="small-muted">${dasEscapeHtml(source?.paddle_transaction_id || "—")}</span>
            </td>
            <td>
              <strong>${dasEscapeHtml(auth.titleCase(referral.plan))}</strong>
              <span class="small-muted">${dasEscapeHtml(paymentLabel(referral))}</span>
            </td>
            <td class="cell-amount">${auth.money(referral.paddle_total_earnings)}</td>
            <td class="cell-amount">
              <strong>${auth.money(referral.commission_amount)}</strong>
              <span class="small-muted">${dasEscapeHtml(referral.commission_rate)}%</span>
            </td>
            <td class="cell-status">${badge(auth.titleCase(referral.status))}</td>
            <td class="cell-actions">
              ${
                referral.payout_id
                  ? '<span class="small-muted">Locked</span>'
                  : `<button class="btn btn-outline btn-sm table-action" type="button" data-edit-referral="${dasEscapeHtml(referral.id)}">Edit</button>`
              }
            </td>
          </tr>
        `;
      })
      .join("");

    document.querySelectorAll("[data-edit-referral]").forEach((button) => {
      button.addEventListener("click", () =>
        openDrawer(button.dataset.editReferral),
      );
    });
  }

  function currentRate() {
    const plan = fields.plan.value.toLowerCase();
    const paymentType = fields.paymentType.value.toLowerCase().replace(" ", "_");

    if (
      activeReferral &&
      activeReferral.plan === plan &&
      activeReferral.payment_type === paymentType
    ) {
      return Number(activeReferral.commission_rate || 0);
    }

    if (paymentType === "renewal") {
      return Number(settings.monthly_renewal_rate || 0);
    }
    if (plan === "annual") {
      return Number(settings.annual_first_payment_rate || 0);
    }
    return Number(settings.monthly_first_payment_rate || 0);
  }

  function updateCommissionPreview() {
    const rate = currentRate();
    const earnings = Number(fields.paddleTotalEarnings.value || 0);
    const amount = Math.round((earnings * rate + Number.EPSILON) * 100) / 100;
    commissionPreview.textContent = `${rate}% · ${auth.money(amount)}`;
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

  function resetForm() {
    form.reset();
    activeReferral = null;
    fields.id.value = "";
    fields.creatorId.disabled = false;
    fields.paymentType.disabled = false;
    fields.paddleCustomerId.readOnly = false;
    fields.paymentDate.value = today();
    fields.renewalNumber.value = "1";
    fields.renewalNumber.max = String(settings.monthly_renewal_count || 0);

    if (creators[0]) fields.creatorId.value = creators[0].id;
    setSelect(fields.plan, "Monthly");
    setSelect(fields.paymentType, "First payment");
    setSelect(fields.status, "Pending");
    syncPaymentFields();
  }

  function openDrawer(id = "") {
    resetForm();

    if (id) {
      const referral = referrals.find((item) => item.id === id);
      const source = sources.find((item) => item.referral_id === id);
      if (!referral || !source) return;

      if (referral.payout_id) {
        dasToast("This referral is locked because it is already in a payout");
        return;
      }

      activeReferral = referral;
      fields.id.value = referral.id;
      fields.creatorId.value = referral.creator_id;
      fields.creatorId.disabled = true;
      fields.paddleCustomerId.value = source.paddle_customer_id;
      fields.paddleCustomerId.readOnly = true;
      fields.paddleTransactionId.value = source.paddle_transaction_id;
      setSelect(fields.plan, auth.titleCase(referral.plan));
      setSelect(
        fields.paymentType,
        referral.payment_type === "renewal" ? "Renewal" : "First payment",
      );
      fields.paymentType.disabled = true;
      fields.renewalNumber.value = String(referral.renewal_number || 1);
      fields.renewalNumber.max = String(
        Math.max(
          Number(settings.monthly_renewal_count || 0),
          Number(referral.renewal_number || 0),
        ),
      );
      fields.paymentDate.value = referral.payment_date;
      fields.paddleTotalEarnings.value = String(referral.paddle_total_earnings);
      setSelect(fields.status, auth.titleCase(referral.status));
      syncPaymentFields();
    }

    formTitle.textContent = id ? "Edit referral" : "Add referral";
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() =>
      (window.matchMedia("(pointer: coarse)").matches
        ? closeButton
        : fields.paddleCustomerId
      ).focus({ preventScroll: true }),
    );
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }

  function customerReferrals(creatorId, paddleCustomerId) {
    const refs = referralById();
    return sources
      .filter(
        (source) =>
          source.creator_id === creatorId &&
          normalize(source.paddle_customer_id) === normalize(paddleCustomerId),
      )
      .map((source) => refs.get(source.referral_id))
      .filter(Boolean);
  }

  function approvalDueDate(paymentDate) {
    let approvalDays = Number(settings.approval_days || 0);

    if (
      activeReferral?.payment_date &&
      activeReferral?.approval_due_date
    ) {
      approvalDays = dayDifference(
        activeReferral.payment_date,
        activeReferral.approval_due_date,
      );
    }

    return addDays(paymentDate, approvalDays);
  }

  function validateReferral(payload) {
    if (!payload.creatorId || !payload.paddleCustomerId || !payload.paddleTransactionId) {
      dasToast("Partner and both Paddle IDs are required");
      return null;
    }

    if (!payload.paddleCustomerId.startsWith("ctm_")) {
      dasToast("Paddle customer ID must start with ctm_");
      return null;
    }

    if (!payload.paddleTransactionId.startsWith("txn_")) {
      dasToast("Paddle transaction ID must start with txn_");
      return null;
    }

    if (!payload.paymentDate) {
      dasToast("Payment date is required");
      return null;
    }

    if (!Number.isFinite(payload.paddleTotalEarnings) || payload.paddleTotalEarnings < 0) {
      dasToast("Enter the Paddle Total earnings amount");
      return null;
    }

    const duplicateTransaction = sources.some(
      (source) =>
        source.referral_id !== payload.id &&
        normalize(source.paddle_transaction_id) ===
          normalize(payload.paddleTransactionId),
    );
    if (duplicateTransaction) {
      dasToast("This Paddle transaction is already recorded");
      return null;
    }

    const sameCustomer = customerReferrals(
      payload.creatorId,
      payload.paddleCustomerId,
    );
    const firstPayment = sameCustomer.find(
      (referral) => referral.payment_type === "first_payment",
    );

    if (
      payload.paymentType === "first_payment" &&
      sameCustomer.some(
        (referral) =>
          referral.id !== payload.id &&
          referral.payment_type === "first_payment",
      )
    ) {
      dasToast("This Paddle customer already has a first-payment record");
      return null;
    }

    if (payload.paymentType === "renewal") {
      if (!firstPayment) {
        dasToast("Add this Paddle customer's first payment before its renewal");
        return null;
      }

      const renewalChanged =
        !activeReferral ||
        Number(activeReferral.renewal_number) !== Number(payload.renewalNumber);
      if (
        renewalChanged &&
        payload.renewalNumber > Number(settings.monthly_renewal_count || 0)
      ) {
        dasToast("This renewal number is outside the commissioned renewal limit");
        return null;
      }

      if (
        sameCustomer.some(
          (referral) =>
            referral.id !== payload.id &&
            referral.payment_type === "renewal" &&
            Number(referral.renewal_number) === Number(payload.renewalNumber),
        )
      ) {
        dasToast("This renewal number is already recorded for this customer");
        return null;
      }
    }

    const dueDate = approvalDueDate(payload.paymentDate);
    if (payload.status === "approved" && today() < dueDate) {
      dasToast(`This referral cannot be approved before ${formatDate(dueDate)}`);
      return null;
    }

    return {
      firstPayment,
      approvalDueDate: dueDate,
    };
  }

  async function logReferralActivity(referral, previousStatus = "") {
    const statusChanged = !previousStatus || previousStatus !== referral.status;
    const eventType = statusChanged
      ? `referral_${referral.status}`
      : "referral_updated";
    const detail = `${auth.titleCase(referral.plan)} · ${paymentLabel(referral)} · ${auth.money(referral.commission_amount)} commission`;

    const { error } = await auth.client.from("partner_activity").insert({
      creator_id: referral.creator_id,
      actor_user_id: adminUser.id,
      actor_kind: "admin",
      event_type: eventType,
      details: detail,
      visibility: statusChanged ? "partner" : "admin",
      metadata: {
        status: auth.titleCase(referral.status),
        title: statusChanged
          ? `Referral ${auth.titleCase(referral.status).toLowerCase()}`
          : "Referral updated",
      },
    });

    if (error) console.error(error);
  }

  async function insertReferral(payload, validation) {
    const insert = {
      creator_id: payload.creatorId,
      payment_date: payload.paymentDate,
      plan: payload.plan,
      payment_type: payload.paymentType,
      renewal_number:
        payload.paymentType === "renewal" ? payload.renewalNumber : 0,
      paddle_total_earnings: payload.paddleTotalEarnings,
      status: payload.status,
    };

    if (payload.paymentType === "renewal") {
      insert.customer_token = validation.firstPayment.customer_token;
    }

    const { data: referral, error: referralError } = await auth.client
      .from("partner_referrals")
      .insert(insert)
      .select(
        "id,creator_id,customer_token,payment_date,plan,payment_type,renewal_number,paddle_total_earnings,status,approval_due_date,approved_at,commission_rate,commission_amount,payout_id,created_at",
      )
      .single();

    if (referralError) throw referralError;

    const { error: sourceError } = await auth.client
      .from("partner_referral_sources")
      .insert({
        referral_id: referral.id,
        creator_id: referral.creator_id,
        paddle_customer_id: payload.paddleCustomerId,
        paddle_transaction_id: payload.paddleTransactionId,
      });

    if (sourceError) {
      await auth.client.from("partner_referrals").delete().eq("id", referral.id);
      throw sourceError;
    }

    await logReferralActivity(referral);
    return referral;
  }

  async function updateReferral(payload, validation) {
    const source = sources.find((item) => item.referral_id === payload.id);
    if (!source || !activeReferral) throw new Error("Referral source not found.");
    if (activeReferral.payout_id) {
      throw new Error("This referral is locked because it is already in a payout.");
    }

    const oldSource = {
      paddle_customer_id: source.paddle_customer_id,
      paddle_transaction_id: source.paddle_transaction_id,
    };

    const { error: sourceError } = await auth.client
      .from("partner_referral_sources")
      .update({
        paddle_customer_id: payload.paddleCustomerId,
        paddle_transaction_id: payload.paddleTransactionId,
      })
      .eq("referral_id", payload.id);

    if (sourceError) throw sourceError;

    const update = {
      payment_date: payload.paymentDate,
      plan: payload.plan,
      renewal_number:
        payload.paymentType === "renewal" ? payload.renewalNumber : 0,
      paddle_total_earnings: payload.paddleTotalEarnings,
      status: payload.status,
    };

    if (payload.paymentType === "renewal") {
      update.customer_token = validation.firstPayment.customer_token;
    }

    const { data: referral, error: referralError } = await auth.client
      .from("partner_referrals")
      .update(update)
      .eq("id", payload.id)
      .select(
        "id,creator_id,customer_token,payment_date,plan,payment_type,renewal_number,paddle_total_earnings,status,approval_due_date,approved_at,commission_rate,commission_amount,payout_id,created_at",
      )
      .single();

    if (referralError) {
      await auth.client
        .from("partner_referral_sources")
        .update(oldSource)
        .eq("referral_id", payload.id);
      throw referralError;
    }

    await logReferralActivity(referral, activeReferral.status);
    return referral;
  }

  async function loadAuditLog() {
    activityBody.innerHTML =
      '<tr><td class="referral-empty" colspan="5">Loading activity…</td></tr>';

    const { data, error } = await auth.client
      .from("partner_activity")
      .select("id,creator_id,actor_kind,event_type,details,metadata,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const creatorsMap = creatorById();
    const activity = data || [];

    if (!activity.length) {
      activityBody.innerHTML =
        '<tr><td class="referral-empty" colspan="5">No Partner activity yet.</td></tr>';
      return;
    }

    activityBody.innerHTML = activity
      .map((item) => {
        const creator = item.creator_id ? creatorsMap.get(item.creator_id) : null;
        const partner = creator
          ? `${creator.name} · ${creator.promo_code}`
          : "Partner program";
        const details = String(item.details || "").trim() || "—";

        return `
          <tr>
            <td class="cell-nowrap"><strong>${dasEscapeHtml(auth.dateLabel(item.created_at))}</strong></td>
            <td>${dasEscapeHtml(partner)}</td>
            <td><strong>${dasEscapeHtml(auth.activityEventTitle(item.event_type))}</strong></td>
            <td class="cell-status">${badge(auth.titleCase(item.actor_kind))}</td>
            <td>${dasEscapeHtml(details)}</td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadLedger() {
    tbody.innerHTML =
      '<tr><td class="referral-empty" colspan="8">Loading referral records…</td></tr>';

    const [settingsResult, creatorsResult, referralsResult, sourcesResult] =
      await Promise.all([
        auth.client
          .from("partner_settings")
          .select(
            "monthly_first_payment_rate,monthly_renewal_rate,monthly_renewal_count,annual_first_payment_rate,approval_days",
          )
          .eq("id", 1)
          .single(),
        auth.client
          .from("partner_creators")
          .select("id,name,promo_code")
          .order("name", { ascending: true }),
        auth.client
          .from("partner_referrals")
          .select(
            "id,creator_id,customer_token,payment_date,plan,payment_type,renewal_number,paddle_total_earnings,status,approval_due_date,approved_at,commission_rate,commission_amount,payout_id,created_at",
          ),
        auth.client
          .from("partner_referral_sources")
          .select(
            "referral_id,creator_id,paddle_customer_id,paddle_transaction_id",
          ),
      ]);

    const error =
      settingsResult.error ||
      creatorsResult.error ||
      referralsResult.error ||
      sourcesResult.error;
    if (error) throw error;

    settings = settingsResult.data;
    creators = creatorsResult.data || [];
    referrals = referralsResult.data || [];
    sources = sourcesResult.data || [];
    populatePartners();
    render();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      id: fields.id.value,
      creatorId: fields.creatorId.value,
      paddleCustomerId: fields.paddleCustomerId.value.trim(),
      paddleTransactionId: fields.paddleTransactionId.value.trim(),
      plan: fields.plan.value.toLowerCase(),
      paymentType:
        fields.paymentType.value === "Renewal" ? "renewal" : "first_payment",
      renewalNumber: Number(fields.renewalNumber.value || 0),
      paymentDate: fields.paymentDate.value,
      paddleTotalEarnings: Number(fields.paddleTotalEarnings.value),
      status: fields.status.value.toLowerCase(),
    };
    const validation = validateReferral(payload);
    if (!validation) return;

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      if (payload.id) {
        await updateReferral(payload, validation);
        dasToast("Referral updated");
      } else {
        await insertReferral(payload, validation);
        dasToast("Referral added");
      }

      await adminSyncPartnerEntitlements();
      closeDrawer();
      await Promise.all([loadLedger(), loadAuditLog()]);
      await adminHydrateStats();
    } catch (error) {
      console.error(error);
      dasToast(error?.message || "Referral could not be saved");
    } finally {
      submitButton.disabled = false;
    }
  });

  fields.paymentType.addEventListener("change", syncPaymentFields);
  fields.plan.addEventListener("change", updateCommissionPreview);
  fields.renewalNumber.addEventListener("input", updateCommissionPreview);
  fields.paddleTotalEarnings.addEventListener("input", updateCommissionPreview);
  search.addEventListener("input", render);
  partnerFilter.addEventListener("change", render);
  statusFilter.addEventListener("change", render);
  addButton.addEventListener("click", () => {
    if (!creators.length) {
      dasToast("Add a Partner before adding a referral");
      return;
    }
    openDrawer();
  });
  closeButton.addEventListener("click", closeDrawer);
  document.addEventListener("pointerdown", (event) => {
    if (drawer.classList.contains("is-open") && !drawer.contains(event.target)) {
      closeDrawer();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) {
      closeDrawer();
    }
  });

  try {
    await loadLedger();
    await loadAuditLog();
  } catch (error) {
    console.error(error);
    tbody.innerHTML =
      '<tr><td class="referral-empty" colspan="8">Referral records could not be loaded.</td></tr>';
    activityBody.innerHTML =
      '<tr><td class="referral-empty" colspan="5">Activity could not be loaded.</td></tr>';
    dasToast("Referral records could not be loaded");
  }
});
