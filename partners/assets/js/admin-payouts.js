document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
  const tbody = document.querySelector("[data-payouts-table]");
  const preview = document.querySelector("[data-payout-preview]");
  const addButton = document.querySelector("[data-add-payout]");
  const drawer = document.querySelector("[data-payout-drawer]");
  const closeButton = document.querySelector("[data-payout-drawer-close]");
  const form = document.querySelector("[data-payout-form]");

  if (
    !auth?.enabled ||
    !tbody ||
    !preview ||
    !addButton ||
    !drawer ||
    !closeButton ||
    !form
  ) {
    return;
  }

  const authState = await window.DentAIStudyPartnerAuthReady;
  if (!authState?.user) return;

  const fields = form.elements;
  const amountPreview = document.querySelector("[data-payout-amount]");
  const methodPreview = document.querySelector("[data-payout-method-preview]");
  const methodDetailsPreview = document.querySelector(
    "[data-payout-method-details]",
  );
  const methodStatus = document.querySelector("[data-payout-method-status]");
  const createSubmit = document.querySelector("[data-payout-submit]");

  let settings = null;
  let creators = [];
  let referrals = [];
  let payouts = [];
  let candidates = [];
  let activeId = "";

  const today = () => new Date().toISOString().slice(0, 10);
  const creatorById = () =>
    new Map(creators.map((creator) => [creator.id, creator]));

  function payoutStatusLabel(status) {
    return auth.titleCase(status);
  }

  function confirmedCount(creatorId) {
    return new Set(
      referrals
        .filter(
          (referral) =>
            referral.creator_id === creatorId &&
            referral.payment_type === "first_payment" &&
            referral.status === "approved",
        )
        .map((referral) => referral.customer_token),
    ).size;
  }

  function availableApproved(creatorId) {
    return referrals
      .filter(
        (referral) =>
          referral.creator_id === creatorId &&
          referral.status === "approved" &&
          !referral.payout_id,
      )
      .reduce(
        (sum, referral) => sum + Number(referral.commission_amount || 0),
        0,
      );
  }

  function hasPayoutDetails(creator) {
    return Boolean(
      creator?.payout_method &&
        creator.payout_method !== "Not added" &&
        creator?.payout_details &&
        Object.keys(creator.payout_details).length > 0,
    );
  }

  function payoutDetailPairs(method, details = {}) {
    if (method === "Wise") {
      return [
        ["Account holder", details.account_name || "—"],
        ["Wise email", details.email || "—"],
      ];
    }

    if (method === "Bank transfer") {
      return [
        ["Account holder", details.account_name || "—"],
        ["Bank", details.bank_name || "—"],
        ["Account / IBAN", details.account_number || "—"],
        ["SWIFT / BIC", details.swift_bic || "—"],
        ["Country", details.country || "—"],
      ];
    }

    return [];
  }

  function payoutDetailRows(method, details) {
    return payoutDetailPairs(method, details)
      .map(
        ([label, value]) => `
          <div class="rule-line">
            <span>${dasEscapeHtml(label)}</span>
            <strong>${dasEscapeHtml(value)}</strong>
          </div>
        `,
      )
      .join("");
  }

  function buildCandidates() {
    const minimumUsers = Number(settings.minimum_confirmed_paid_users || 10);
    const minimumPayout = Number(settings.minimum_payout_usd || 50);
    const readyCreators = new Set(
      payouts
        .filter((payout) => payout.status === "ready")
        .map((payout) => payout.creator_id),
    );

    candidates = creators
      .map((creator) => ({
        creator,
        confirmed: confirmedCount(creator.id),
        amount: availableApproved(creator.id),
        payoutConfigured: hasPayoutDetails(creator),
      }))
      .filter(
        (item) =>
          item.confirmed >= minimumUsers &&
          item.amount >= minimumPayout &&
          !readyCreators.has(item.creator.id),
      )
      .sort((a, b) => b.amount - a.amount);
  }

  function syncCreatePreview() {
    const candidate = candidates.find(
      (item) => item.creator.id === fields.creatorId.value,
    );

    if (amountPreview) {
      amountPreview.textContent = candidate
        ? auth.money(candidate.amount)
        : auth.money(0);
    }

    const method = candidate?.creator.payout_method || "Not added";
    const details = candidate?.creator.payout_details || {};

    if (methodPreview) methodPreview.textContent = method;

    if (methodDetailsPreview) {
      methodDetailsPreview.innerHTML = payoutDetailRows(method, details);
    }

    if (methodStatus) {
      methodStatus.textContent =
        candidate && !candidate.payoutConfigured
          ? "Waiting for the Partner to add payout details."
          : "";
    }

    if (createSubmit) {
      createSubmit.disabled = !candidate || !candidate.payoutConfigured;
    }
  }

  function populateCreateForm() {
    fields.creatorId.innerHTML = candidates
      .map(
        (item) =>
          `<option value="${dasEscapeHtml(item.creator.id)}">${dasEscapeHtml(item.creator.name)} · ${dasEscapeHtml(item.creator.promo_code)}</option>`,
      )
      .join("");

    fields.scheduledDate.value = today();
    fields.notes.value = "";
    syncCreatePreview();
  }

  function openDrawer() {
    if (!candidates.length) {
      dasToast("No Partner is eligible for a new payout");
      return;
    }

    populateCreateForm();
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() =>
      (window.matchMedia("(pointer: coarse)").matches
        ? closeButton
        : fields.creatorId
      ).focus({ preventScroll: true }),
    );
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    form.reset();
  }

  function paidDetails(payout) {
    if (payout.status !== "paid") return "";

    return `
      <div class="rule-line">
        <span>Transfer reference</span>
        <strong>${dasEscapeHtml(payout.transfer_reference || "—")}</strong>
      </div>
      <div class="rule-line">
        <span>Paid date</span>
        <strong>${dasEscapeHtml(auth.dateLabel(payout.paid_date))}</strong>
      </div>
    `;
  }

  function readyAction(payout) {
    if (payout.status !== "ready") {
      return '<span class="pill green">Payment recorded</span>';
    }

    return `
      <form data-mark-paid-form class="payout-record-form" autocomplete="off">
        <div class="payout-record-fields">
          <div class="form-row">
            <label class="label" for="payout-transfer-reference">Transfer reference</label>
            <input
              class="input"
              id="payout-transfer-reference"
              name="transferReference"
              required
              autocomplete="off"
            />
          </div>
          <div class="form-row">
            <label class="label" for="payout-paid-date">Paid date</label>
            <input
              class="input"
              id="payout-paid-date"
              name="paidDate"
              type="date"
              max="${today()}"
              value="${today()}"
              required
            />
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Record payment</button>
      </form>
    `;
  }

  function renderPreview(payout) {
    if (!payout) {
      activeId = "";
      preview.innerHTML =
        '<p class="empty-note">No payout to preview yet.</p>';
      return;
    }

    activeId = payout.id;
    const creator = creatorById().get(payout.creator_id);

    preview.innerHTML = `
      <div class="preview-grid clean-preview">
        <div class="preview-profile">
          <div class="avatar soft">${dasEscapeHtml(creator?.initials || "DP")}</div>
          <h3>${dasEscapeHtml(creator?.name || "Partner")}</h3>
          <p class="small-muted">${dasEscapeHtml(creator?.promo_code || "—")}</p>
          ${badge(payoutStatusLabel(payout.status))}
        </div>
        <div class="preview-detail">
          <div class="preview-metrics cols-3">
            <div class="preview-metric">
              <span>Payout ID</span>
              <strong>${dasEscapeHtml(payout.id)}</strong>
            </div>
            <div class="preview-metric">
              <span>Approved commission</span>
              <strong>${auth.money(payout.amount_usd)}</strong>
            </div>
            <div class="preview-metric">
              <span>Payout method</span>
              <strong>${dasEscapeHtml(payout.payment_method)}</strong>
            </div>
          </div>
          <div class="preview-rows">
            ${payoutDetailRows(
              payout.payment_method,
              payout.payment_details &&
                Object.keys(payout.payment_details).length > 0
                ? payout.payment_details
                : creator?.payout_details || {},
            )}
            <div class="rule-line">
              <span>Scheduled date</span>
              <strong>${dasEscapeHtml(auth.dateLabel(payout.scheduled_date))}</strong>
            </div>
            ${paidDetails(payout)}
            <div class="rule-line">
              <span>Notes</span>
              <strong>${dasEscapeHtml(payout.notes || "—")}</strong>
            </div>
          </div>
          <div class="preview-actions">${readyAction(payout)}</div>
        </div>
      </div>
    `;

    const paidForm = preview.querySelector("[data-mark-paid-form]");
    paidForm?.addEventListener("submit", async (event) => {
      event.preventDefault();

      const transferReference =
        paidForm.elements.transferReference.value.trim();
      const paidDate = paidForm.elements.paidDate.value;
      const submit = paidForm.querySelector('button[type="submit"]');

      if (!transferReference || !paidDate) {
        dasToast("Enter the real transfer reference and paid date");
        return;
      }

      submit.disabled = true;

      try {
        const { data, error } = await auth.client.rpc(
          "partner_mark_payout_paid",
          {
            p_payout_id: payout.id,
            p_transfer_reference: transferReference,
            p_paid_date: paidDate,
          },
        );

        if (error) throw error;
        if (!data) throw new Error("Payout payment was not recorded.");

        dasToast("Payout payment recorded");
        await load();
        await adminHydrateStats();
      } catch (error) {
        console.error(error);
        dasToast(error?.message || "Payout could not be marked as paid");
      } finally {
        submit.disabled = false;
      }
    });
  }

  function renderTable() {
    const creatorsMap = creatorById();

    if (!payouts.length) {
      tbody.innerHTML =
        '<tr><td class="referral-empty" colspan="5">No payouts yet.</td></tr>';
      renderPreview(null);
      return;
    }

    tbody.innerHTML = payouts
      .map((payout) => {
        const creator = creatorsMap.get(payout.creator_id);

        return `
          <tr>
            <td class="cell-creator" data-label="Partner">
              <div class="creator-cell payout-partner-cell">
                <strong>${dasEscapeHtml(creator?.name || "Partner")}</strong>
                <span class="small-muted payout-partner-email">${dasEscapeHtml(creator?.email || "—")}</span>
                <span class="small-muted">${dasEscapeHtml(creator?.promo_code || "—")}</span>
              </div>
            </td>
            <td class="cell-amount" data-label="Commission">
              <strong>${auth.money(payout.amount_usd)}</strong>
              <span class="small-muted">${confirmedCount(payout.creator_id)} confirmed paid customers</span>
            </td>
            <td data-label="Payment">
              <strong>${dasEscapeHtml(payout.payment_method)}</strong>
              <span class="small-muted">${dasEscapeHtml(auth.dateLabel(payout.scheduled_date))}</span>
            </td>
            <td class="cell-status" data-label="Status">${badge(payoutStatusLabel(payout.status))}</td>
            <td class="cell-actions" data-label="Actions">
              <button class="btn btn-outline btn-sm table-action" type="button" data-view-payout="${dasEscapeHtml(payout.id)}">View</button>
            </td>
          </tr>
        `;
      })
      .join("");

    document.querySelectorAll("[data-view-payout]").forEach((button) => {
      button.addEventListener("click", () => {
        renderPreview(
          payouts.find((payout) => payout.id === button.dataset.viewPayout),
        );
      });
    });

    renderPreview(
      payouts.find((payout) => payout.id === activeId) || payouts[0],
    );
  }

  async function load() {
    tbody.innerHTML =
      '<tr><td class="referral-empty" colspan="5">Loading payouts…</td></tr>';

    const [settingsResult, creatorsResult, referralsResult, payoutsResult] =
      await Promise.all([
        auth.client
          .from("partner_settings")
          .select(
            "minimum_confirmed_paid_users,minimum_payout_usd,payout_window",
          )
          .eq("id", 1)
          .single(),
        auth.client
          .from("partner_creators")
          .select(
            "id,name,initials,email,promo_code,payout_method,payout_details,account_status",
          )
          .order("name", { ascending: true }),
        auth.client
          .from("partner_referrals")
          .select(
            "id,creator_id,customer_token,payment_type,status,commission_amount,payout_id",
          ),
        auth.client
          .from("partner_payouts")
          .select(
            "id,creator_id,amount_usd,payment_method,payment_details,scheduled_date,status,transfer_reference,paid_date,notes,created_at,updated_at",
          )
          .order("created_at", { ascending: false }),
      ]);

    const error =
      settingsResult.error ||
      creatorsResult.error ||
      referralsResult.error ||
      payoutsResult.error;
    if (error) throw error;

    settings = settingsResult.data;
    creators = creatorsResult.data || [];
    referrals = referralsResult.data || [];
    payouts = payoutsResult.data || [];

    buildCandidates();
    addButton.disabled = false;
    renderTable();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const creatorId = fields.creatorId.value;
    const scheduledDate = fields.scheduledDate.value;
    const notes = fields.notes.value.trim();
    const submit = form.querySelector('button[type="submit"]');
    const candidate = candidates.find(
      (item) => item.creator.id === creatorId,
    );

    if (!creatorId || !scheduledDate) {
      dasToast("Choose an eligible Partner and scheduled date");
      return;
    }

    if (!candidate?.payoutConfigured) {
      dasToast("Waiting for the Partner to add payout details");
      return;
    }

    submit.disabled = true;

    try {
      const { data, error } = await auth.client.rpc("partner_create_payout", {
        p_creator_id: creatorId,
        p_scheduled_date: scheduledDate,
        p_notes: notes || null,
      });

      if (error) throw error;
      if (!data) throw new Error("Payout was not created.");

      activeId = data.id;
      closeDrawer();
      dasToast("Payout created");
      await load();
      await adminHydrateStats();
    } catch (error) {
      console.error(error);
      dasToast(error?.message || "Payout could not be created");
    } finally {
      submit.disabled = false;
    }
  });

  fields.creatorId.addEventListener("change", syncCreatePreview);
  addButton.addEventListener("click", openDrawer);
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
    await load();
  } catch (error) {
    console.error(error);
    tbody.innerHTML =
      '<tr><td class="referral-empty" colspan="5">Payouts could not be loaded.</td></tr>';
    preview.innerHTML =
      '<p class="empty-note">Payouts could not be loaded.</p>';
    dasToast("Payouts could not be loaded");
  }
});
