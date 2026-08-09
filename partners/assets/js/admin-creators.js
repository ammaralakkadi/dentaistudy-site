document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
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
  const summaryPro = document.querySelector("[data-summary-pro]");
  const emailNote = document.querySelector("[data-partner-email-note]");

  if (
    !auth?.enabled ||
    !tbody ||
    !search ||
    !accountFilter ||
    !addButton ||
    !drawer ||
    !closeButton ||
    !form
  )
    return;

  const authState = await window.DentAIStudyPartnerAuthReady;
  if (!authState?.user) return;

  const fields = form.elements;
  const adminUser = authState.user;
  let activeId = "";
  let settings = null;
  let partners = [];

  const escapeHtml = (value) => {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  };

  const titleCase = (value) => {
    const text = String(value ?? "").replaceAll("_", " ");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  };

  const partnerInitials = (name) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.replace(/[^a-z0-9]/gi, "").charAt(0))
      .join("")
      .toUpperCase() || "DP";

  const dateLabel = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  };

  function setSelect(select, value) {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function renderStats(allPartners) {
    const totals = {
      total: allPartners.length,
      active: allPartners.filter((partner) => partner.accountStatus === "Active")
        .length,
      qualified: allPartners.filter((partner) => partner.qualified).length,
      ready: allPartners.filter((partner) => partner.payoutStatus === "Ready")
        .length,
    };

    document.querySelectorAll("[data-partner-stat]").forEach((element) => {
      element.textContent = totals[element.dataset.partnerStat] ?? 0;
    });
  }

  function derivePartners(creators, referrals, payouts) {
    const minimumUsers = Number(settings.minimum_confirmed_paid_users || 10);
    const minimumPayout = Number(settings.minimum_payout_usd || 50);

    return creators.map((creator) => {
      const creatorReferrals = referrals.filter(
        (referral) => referral.creator_id === creator.id,
      );
      const confirmedCustomers = new Set(
        creatorReferrals
          .filter(
            (referral) =>
              referral.status === "approved" &&
              referral.payment_type === "first_payment",
          )
          .map((referral) => referral.customer_token),
      );
      const creatorPayouts = payouts.filter(
        (payout) => payout.creator_id === creator.id,
      );
      const payoutById = new Map(
        creatorPayouts.map((payout) => [payout.id, payout]),
      );
      const approvedCommission = creatorReferrals
        .filter((referral) => {
          if (referral.status !== "approved") return false;
          const payout = referral.payout_id
            ? payoutById.get(referral.payout_id)
            : null;
          return !payout || payout.status !== "paid";
        })
        .reduce(
          (sum, referral) => sum + Number(referral.commission_amount || 0),
          0,
        );
      const qualified = confirmedCustomers.size >= minimumUsers;
      const hasReadyPayout = creatorPayouts.some(
        (payout) => payout.status === "ready",
      );
      const hasPaidPayout = creatorPayouts.some(
        (payout) => payout.status === "paid",
      );

      let payoutStatus = "Locked";
      if (qualified) {
        if (hasReadyPayout || approvedCommission >= minimumPayout) {
          payoutStatus = "Ready";
        } else if (hasPaidPayout && approvedCommission === 0) {
          payoutStatus = "Paid";
        } else {
          payoutStatus = "Below minimum";
        }
      }

      return {
        id: creator.id,
        userId: creator.user_id,
        name: creator.name,
        initials: creator.initials || partnerInitials(creator.name),
        email: creator.email,
        code: creator.promo_code,
        accountStatus: titleCase(creator.account_status),
        payoutMethod: creator.payout_method || "Not added",
        notes: creator.notes || "",
        proAccessUntil: creator.pro_access_until,
        lastUpdated: creator.updated_at,
        confirmed: confirmedCustomers.size,
        approvedCommission,
        qualified,
        payoutStatus,
      };
    });
  }

  async function loadPartners() {
    tbody.innerHTML =
      '<tr><td class="referral-empty" colspan="7">Loading Partner accounts…</td></tr>';

    const [settingsResult, creatorsResult, referralsResult, payoutsResult] =
      await Promise.all([
        auth.client
          .from("partner_settings")
          .select("minimum_confirmed_paid_users,minimum_payout_usd")
          .eq("id", 1)
          .single(),
        auth.client
          .from("partner_creators")
          .select(
            "id,user_id,name,initials,email,promo_code,account_status,payout_method,pro_access_until,notes,updated_at",
          )
          .order("created_at", { ascending: false }),
        auth.client
          .from("partner_referrals")
          .select(
            "creator_id,customer_token,payment_type,status,commission_amount,payout_id",
          ),
        auth.client
          .from("partner_payouts")
          .select("id,creator_id,status"),
      ]);

    const error =
      settingsResult.error ||
      creatorsResult.error ||
      referralsResult.error ||
      payoutsResult.error;
    if (error) throw error;

    settings = settingsResult.data;
    partners = derivePartners(
      creatorsResult.data || [],
      referralsResult.data || [],
      payoutsResult.data || [],
    );
    render();
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const accountStatus = accountFilter.value;
    const visiblePartners = partners.filter((partner) => {
      const searchable = [partner.name, partner.email, partner.code]
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (!accountStatus || partner.accountStatus === accountStatus)
      );
    });

    renderStats(partners);

    if (!visiblePartners.length) {
      const emptyMessage = partners.length
        ? "No matching Partner accounts."
        : "No Partner accounts yet. Use Add partner to create the first one.";
      tbody.innerHTML = `<tr><td class="referral-empty" colspan="7">${emptyMessage}</td></tr>`;
      return;
    }

    tbody.innerHTML = visiblePartners
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
                ${badge(partner.qualified ? "Qualified" : "In progress")}
                <span class="small-muted">${partner.confirmed} / ${settings.minimum_confirmed_paid_users} confirmed</span>
              </div>
            </td>
            <td class="cell-status">
              <div class="partner-cell-stack">
                ${badge(partner.payoutStatus)}
                <span class="small-muted">${auth.money(partner.approvedCommission)} approved</span>
              </div>
            </td>
            <td class="cell-nowrap">${escapeHtml(dateLabel(partner.lastUpdated))}</td>
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

  function renderSummary(partner) {
    summaryAccount.innerHTML = badge(partner.accountStatus);
    summaryQualification.innerHTML = `${badge(
      partner.qualified ? "Qualified" : "In progress",
    )}<br><span class="small-muted">${partner.confirmed} / ${settings.minimum_confirmed_paid_users} confirmed users</span>`;
    summaryPayout.innerHTML = `${badge(
      partner.payoutStatus,
    )}<br><span class="small-muted">${auth.money(
      partner.approvedCommission,
    )} approved</span>`;
    summaryPro.textContent = partner.proAccessUntil
      ? `Through ${dateLabel(partner.proAccessUntil)}`
      : "Not set";
  }

  function resetForm() {
    form.reset();
    activeId = "";
    fields.id.value = "";
    fields.email.readOnly = false;
    if (emailNote) emailNote.hidden = true;
    setSelect(fields.accountStatus, "Active");
    setSelect(fields.payoutMethod, "Not added");
    summary.hidden = true;
  }

  function openDrawer(id = "") {
    resetForm();

    if (id) {
      const partner = partners.find((item) => item.id === id);
      if (!partner) return;

      activeId = id;
      fields.id.value = id;
      fields.name.value = partner.name;
      fields.email.value = partner.email;
      fields.email.readOnly = true;
      fields.code.value = partner.code;
      fields.notes.value = partner.notes;
      setSelect(fields.accountStatus, partner.accountStatus);
      setSelect(fields.payoutMethod, partner.payoutMethod);
      renderSummary(partner);
      summary.hidden = false;
      if (emailNote) emailNote.hidden = false;
    }

    formTitle.textContent = id ? "Edit partner" : "Add partner";
    submitButton.textContent = id ? "Save changes" : "Add partner";
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() =>
      (window.matchMedia("(pointer: coarse)").matches
        ? closeButton
        : fields.name
      ).focus({ preventScroll: true }),
    );
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }

  async function addPartner(payload) {
    const { data, error } = await auth.client.functions.invoke("partner-invite", {
      body: {
        name: payload.name,
        email: payload.email,
        promoCode: payload.code,
        accountStatus: payload.accountStatus,
        payoutMethod: payload.payoutMethod,
        notes: payload.notes,
      },
    });

    if (error) {
      let message = error.message || "Could not add this Partner.";
      try {
        const body = await error.context?.json();
        if (body?.error) message = body.error;
      } catch (_) {
        // Keep the Supabase error message when no JSON body is available.
      }
      throw new Error(message);
    }
    if (!data?.ok) throw new Error(data?.error || "Could not add this Partner.");

    return data;
  }

  async function updatePartner(payload) {
    const { error } = await auth.client
      .from("partner_creators")
      .update({
        name: payload.name,
        initials: partnerInitials(payload.name),
        promo_code: payload.code,
        account_status: payload.accountStatus.toLowerCase(),
        payout_method: payload.payoutMethod,
        notes: payload.notes || null,
      })
      .eq("id", activeId);

    if (error) throw error;

    const { error: activityError } = await auth.client
      .from("partner_activity")
      .insert({
        creator_id: activeId,
        actor_user_id: adminUser.id,
        actor_kind: "admin",
        event_type: "partner_updated",
        details: `${payload.code} · ${payload.accountStatus}`,
        visibility: "admin",
      });

    if (activityError) console.error(activityError);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim().toLowerCase(),
      code: fields.code.value.trim().toUpperCase(),
      accountStatus: fields.accountStatus.value,
      payoutMethod: fields.payoutMethod.value,
      notes: fields.notes.value.trim(),
    };

    if (!payload.name || !payload.email || !payload.code) {
      dasToast("Name, email, and promo code are required");
      return;
    }

    submitButton.disabled = true;

    try {
      if (activeId) {
        await updatePartner(payload);
        dasToast("Partner saved");
      } else {
        const result = await addPartner(payload);
        dasToast(
          result.mode === "invited"
            ? "Partner invitation sent"
            : "Existing DentAIstudy account linked",
        );
      }

      closeDrawer();
      await loadPartners();
    } catch (error) {
      console.error(error);
      dasToast(error?.message || "Partner could not be saved");
    } finally {
      submitButton.disabled = false;
    }
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

  try {
    await adminSyncPartnerEntitlements();
    await loadPartners();
  } catch (error) {
    console.error(error);
    tbody.innerHTML =
      '<tr><td class="referral-empty" colspan="7">Partner accounts could not be loaded.</td></tr>';
    dasToast("Partner accounts could not be loaded");
  }
});
