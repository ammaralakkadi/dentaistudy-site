(function () {
  const STORAGE_KEY = "dentai_partners_manual_v4";
  const LOGIN_KEY = "dentai_partner_active_creator";
  const money = (n) =>
    Number(n || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  const roundMoney = (n) =>
    Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  const nowStamp = () =>
    new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const seed = {
    settings: {
      programStatus: "Active",
      inviteOnly: true,
      minimumUsers: 10,
      initialProMonths: 3,
      qualifiedProMonths: 12,
      studentDiscount: 25,
      discountScope: "First subscription payment only",
      monthlyFirstPaymentRate: 50,
      monthlyRenewalRate: 20,
      monthlyRenewalCount: 5,
      annualFirstPaymentRate: 30,
      commissionBase:
        "Paddle total earnings for each valid transaction, after tax and Paddle fees.",
      attributionRule:
        "A referral counts when the partner code is entered at checkout.",
      approvalDays: 30,
      minimumPayout: 50,
      payoutWindow: "1–5 of each month",
      payoutMethod: "Wise or bank transfer where available",
      disclosureRule:
        "Partners must clearly disclose that they may receive compensation from DentAIstudy.",
      supportEmail: "info@dentaistudy.com",
      publicUrl: "dentaistudy.com/partners/",
      loginUrl: "dentaistudy.com/partners/login/",
    },
    creators: [
      {
        id: "sarah",
        name: "Dr. Sarah",
        initials: "DS",
        email: "sarah@dentaistudy.com",
        code: "DENTSARAH25",
        accountStatus: "Active",
        payoutMethod: "Wise (USD)",
        lastUpdated: "Jul 28, 2026",
        notes: "Early partner. OSCE and study routine creator.",
      },
      {
        id: "maya",
        name: "Dr. Maya",
        initials: "DM",
        email: "maya@dentaistudy.com",
        code: "DENTMAYA25",
        accountStatus: "Active",
        payoutMethod: "Wise (USD)",
        lastUpdated: "Jul 27, 2026",
        notes: "High engagement and close to qualification.",
      },
      {
        id: "ali",
        name: "Dr. Ali",
        initials: "DA",
        email: "ali@dentaistudy.com",
        code: "DENTALI25",
        accountStatus: "Active",
        payoutMethod: "Not added",
        lastUpdated: "Jul 26, 2026",
        notes: "Qualification phase.",
      },
      {
        id: "omar",
        name: "Dr. Omar",
        initials: "DO",
        email: "omar@dentaistudy.com",
        code: "DENTOMAR25",
        accountStatus: "Paused",
        payoutMethod: "Wise (USD)",
        lastUpdated: "Jul 25, 2026",
        notes: "Promotion temporarily paused.",
      },
      {
        id: "lina",
        name: "Dr. Lina",
        initials: "DL",
        email: "lina@dentaistudy.com",
        code: "DENTLINA25",
        accountStatus: "Active",
        payoutMethod: "Not added",
        lastUpdated: "Jul 24, 2026",
        notes: "New partner.",
      },
    ],
    referrals: [
      {
        id: "REF-SAR-001",
        creatorId: "sarah",
        customerRef: "CUS-SAR-001",
        paddleId: "txn_sar_001",
        paymentDate: "2026-05-03",
        plan: "Annual",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 54.72,
        status: "Approved",
        approvalDate: "2026-06-02",
        commissionRate: 30,
        commissionAmount: 16.42,
        commissionPaid: true,
        paidDate: "2026-07-03",
      },
      {
        id: "REF-SAR-002",
        creatorId: "sarah",
        customerRef: "CUS-SAR-002",
        paddleId: "txn_sar_002",
        paymentDate: "2026-05-07",
        plan: "Annual",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 52.18,
        status: "Approved",
        approvalDate: "2026-06-06",
        commissionRate: 30,
        commissionAmount: 15.65,
        commissionPaid: true,
        paidDate: "2026-07-03",
      },
      {
        id: "REF-SAR-003",
        creatorId: "sarah",
        customerRef: "CUS-SAR-003",
        paddleId: "txn_sar_003",
        paymentDate: "2026-06-02",
        plan: "Annual",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 54.65,
        status: "Approved",
        approvalDate: "2026-07-02",
        commissionRate: 30,
        commissionAmount: 16.4,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-004",
        creatorId: "sarah",
        customerRef: "CUS-SAR-004",
        paddleId: "txn_sar_004",
        paymentDate: "2026-06-06",
        plan: "Annual",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 53.87,
        status: "Approved",
        approvalDate: "2026-07-06",
        commissionRate: 30,
        commissionAmount: 16.16,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-005",
        creatorId: "sarah",
        customerRef: "CUS-SAR-005",
        paddleId: "txn_sar_005",
        paymentDate: "2026-06-08",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 6.04,
        status: "Approved",
        approvalDate: "2026-07-08",
        commissionRate: 50,
        commissionAmount: 3.02,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-006",
        creatorId: "sarah",
        customerRef: "CUS-SAR-006",
        paddleId: "txn_sar_006",
        paymentDate: "2026-06-10",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 6.17,
        status: "Approved",
        approvalDate: "2026-07-10",
        commissionRate: 50,
        commissionAmount: 3.09,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-007",
        creatorId: "sarah",
        customerRef: "CUS-SAR-007",
        paddleId: "txn_sar_007",
        paymentDate: "2026-06-12",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 5.88,
        status: "Approved",
        approvalDate: "2026-07-12",
        commissionRate: 50,
        commissionAmount: 2.94,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-008",
        creatorId: "sarah",
        customerRef: "CUS-SAR-008",
        paddleId: "txn_sar_008",
        paymentDate: "2026-06-14",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 6.21,
        status: "Approved",
        approvalDate: "2026-07-14",
        commissionRate: 50,
        commissionAmount: 3.11,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-009",
        creatorId: "sarah",
        customerRef: "CUS-SAR-009",
        paddleId: "txn_sar_009",
        paymentDate: "2026-06-16",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 6.02,
        status: "Approved",
        approvalDate: "2026-07-16",
        commissionRate: 50,
        commissionAmount: 3.01,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-010",
        creatorId: "sarah",
        customerRef: "CUS-SAR-010",
        paddleId: "txn_sar_010",
        paymentDate: "2026-06-18",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 5.95,
        status: "Approved",
        approvalDate: "2026-07-18",
        commissionRate: 50,
        commissionAmount: 2.98,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-011",
        creatorId: "sarah",
        customerRef: "CUS-SAR-011",
        paddleId: "txn_sar_011",
        paymentDate: "2026-07-22",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 5.82,
        status: "Pending",
        approvalDate: "2026-08-21",
        commissionRate: 50,
        commissionAmount: 2.91,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-R01",
        creatorId: "sarah",
        customerRef: "CUS-SAR-005",
        paddleId: "txn_sar_r01",
        paymentDate: "2026-07-08",
        plan: "Monthly",
        paymentType: "Renewal",
        renewalNumber: 1,
        paddleTotalEarnings: 7.33,
        status: "Pending",
        approvalDate: "2026-08-07",
        commissionRate: 20,
        commissionAmount: 1.47,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-SAR-R02",
        creatorId: "sarah",
        customerRef: "CUS-SAR-006",
        paddleId: "txn_sar_r02",
        paymentDate: "2026-07-10",
        plan: "Monthly",
        paymentType: "Renewal",
        renewalNumber: 1,
        paddleTotalEarnings: 8.49,
        status: "Pending",
        approvalDate: "2026-08-09",
        commissionRate: 20,
        commissionAmount: 1.7,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-MAY-001",
        creatorId: "maya",
        customerRef: "CUS-MAY-001",
        paddleId: "txn_may_001",
        paymentDate: "2026-06-04",
        plan: "Annual",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 51.26,
        status: "Approved",
        approvalDate: "2026-07-04",
        commissionRate: 30,
        commissionAmount: 15.38,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-MAY-002",
        creatorId: "maya",
        customerRef: "CUS-MAY-002",
        paddleId: "txn_may_002",
        paymentDate: "2026-06-09",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 5.76,
        status: "Approved",
        approvalDate: "2026-07-09",
        commissionRate: 50,
        commissionAmount: 2.88,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-MAY-003",
        creatorId: "maya",
        customerRef: "CUS-MAY-003",
        paddleId: "txn_may_003",
        paymentDate: "2026-07-23",
        plan: "Annual",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 54.19,
        status: "Pending",
        approvalDate: "2026-08-22",
        commissionRate: 30,
        commissionAmount: 16.26,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-ALI-001",
        creatorId: "ali",
        customerRef: "CUS-ALI-001",
        paddleId: "txn_ali_001",
        paymentDate: "2026-06-11",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 6.14,
        status: "Approved",
        approvalDate: "2026-07-11",
        commissionRate: 50,
        commissionAmount: 3.07,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-OMA-001",
        creatorId: "omar",
        customerRef: "CUS-OMA-001",
        paddleId: "txn_oma_001",
        paymentDate: "2026-07-14",
        plan: "Annual",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 53.28,
        status: "Disputed",
        approvalDate: "",
        commissionRate: 30,
        commissionAmount: 15.98,
        commissionPaid: false,
        paidDate: "",
      },
      {
        id: "REF-LIN-001",
        creatorId: "lina",
        customerRef: "CUS-LIN-001",
        paddleId: "txn_lin_001",
        paymentDate: "2026-07-01",
        plan: "Monthly",
        paymentType: "First payment",
        renewalNumber: 0,
        paddleTotalEarnings: 5.67,
        status: "Refunded",
        approvalDate: "",
        commissionRate: 50,
        commissionAmount: 2.84,
        commissionPaid: false,
        paidDate: "",
      },
    ],
    activity: [
      {
        id: "a1",
        date: "Jul 28, 2026",
        time: "11:42 AM",
        event: "Referral approved",
        creatorId: "sarah",
        details: "txn_sar_010 · Commission: $2.98",
        admin: "Ammar",
        status: "Approved",
      },
      {
        id: "a2",
        date: "Jul 27, 2026",
        time: "03:18 PM",
        event: "Referral added",
        creatorId: "maya",
        details: "txn_may_003 · Annual first payment",
        admin: "Ammar",
        status: "Pending",
      },
      {
        id: "a3",
        date: "Jul 26, 2026",
        time: "01:08 PM",
        event: "Payout recorded",
        creatorId: "sarah",
        details: "PAY-2026-07-001 · $32.07",
        admin: "Ammar",
        status: "Paid",
      },
      {
        id: "a4",
        date: "Jul 25, 2026",
        time: "10:32 AM",
        event: "Partner account paused",
        creatorId: "omar",
        details: "Promotion temporarily paused",
        admin: "Ammar",
        status: "Updated",
      },
    ],
    payouts: [
      {
        id: "PAY-2026-08-001",
        creatorId: "sarah",
        approved: 50.71,
        eligibleUsers: 10,
        method: "Wise (USD)",
        scheduled: "Aug 1–5, 2026",
        status: "Ready",
        ref: "—",
        paidDate: "",
        notes: "Approved unpaid referral commission",
      },
      {
        id: "PAY-2026-07-001",
        creatorId: "sarah",
        approved: 32.07,
        eligibleUsers: 2,
        method: "Wise (USD)",
        scheduled: "Jul 3, 2026",
        status: "Paid",
        ref: "WISE-SAR-JUL26",
        paidDate: "2026-07-03",
        notes: "Completed payout",
      },
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    let data;

    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      data = clone(seed);
    } else {
      try {
        data = JSON.parse(raw);
      } catch (error) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        data = clone(seed);
      }
    }

    if (data.settings?.supportEmail === "partners@dentaistudy.com") {
      data.settings.supportEmail = seed.settings.supportEmail;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    return {
      ...data,
      creators: data.creators.map((creator) => ({
        ...creator,
        status: creator.accountStatus,
        ...getCreatorSummary(creator.id, data),
      })),
    };
  }

  function saveData(data) {
    const clean = clone(data);
    const calculatedFields = [
      "status",
      "confirmed",
      "pendingUsers",
      "refunded",
      "disputed",
      "pendingCommission",
      "approvedCommission",
      "paidCommission",
      "qualified",
      "remainingUsers",
      "qualificationStatus",
      "payoutStatus",
      "nextPayout",
    ];

    clean.creators.forEach((creator) => {
      calculatedFields.forEach((field) => delete creator[field]);
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  }

  function calculateReferralCommission(referral, settings) {
    let rate = 0;

    if (
      referral.plan === "Annual" &&
      referral.paymentType === "First payment"
    ) {
      rate = Number(settings.annualFirstPaymentRate || 0);
    } else if (
      referral.plan === "Monthly" &&
      referral.paymentType === "First payment"
    ) {
      rate = Number(settings.monthlyFirstPaymentRate || 0);
    } else if (
      referral.plan === "Monthly" &&
      referral.paymentType === "Renewal" &&
      Number(referral.renewalNumber || 0) >= 1 &&
      Number(referral.renewalNumber || 0) <=
        Number(settings.monthlyRenewalCount || 0)
    ) {
      rate = Number(settings.monthlyRenewalRate || 0);
    }

    return {
      rate,
      amount: roundMoney(
        Number(referral.paddleTotalEarnings || 0) * (rate / 100),
      ),
    };
  }

  function getCreatorSummary(id, data = getData()) {
    const settings = data.settings;
    const referrals = data.referrals.filter(
      (referral) => referral.creatorId === id,
    );
    const firstPayments = referrals.filter(
      (referral) => referral.paymentType === "First payment",
    );
    const uniqueCount = (records) =>
      new Set(records.map((record) => record.customerRef)).size;
    const commissionAmount = (referral) =>
      Number(
        referral.commissionAmount ??
          calculateReferralCommission(referral, settings).amount,
      );

    const confirmed = uniqueCount(
      firstPayments.filter((referral) => referral.status === "Approved"),
    );
    const pendingUsers = uniqueCount(
      firstPayments.filter((referral) => referral.status === "Pending"),
    );
    const refunded = uniqueCount(
      firstPayments.filter((referral) => referral.status === "Refunded"),
    );
    const disputed = uniqueCount(
      firstPayments.filter((referral) => referral.status === "Disputed"),
    );

    const pendingCommission = roundMoney(
      referrals
        .filter((referral) => referral.status === "Pending")
        .reduce((sum, referral) => sum + commissionAmount(referral), 0),
    );
    const approvedCommission = roundMoney(
      referrals
        .filter(
          (referral) =>
            referral.status === "Approved" && !referral.commissionPaid,
        )
        .reduce((sum, referral) => sum + commissionAmount(referral), 0),
    );
    const paidCommission = roundMoney(
      referrals
        .filter(
          (referral) =>
            referral.status === "Approved" && referral.commissionPaid,
        )
        .reduce((sum, referral) => sum + commissionAmount(referral), 0),
    );

    const qualified = confirmed >= Number(settings.minimumUsers || 10);
    const remainingUsers = Math.max(
      0,
      Number(settings.minimumUsers || 10) - confirmed,
    );

    let payoutStatus = "Locked";
    if (
      qualified &&
      approvedCommission >= Number(settings.minimumPayout || 0)
    ) {
      payoutStatus = "Ready";
    } else if (qualified && approvedCommission > 0) {
      payoutStatus = "Below minimum";
    } else if (qualified && paidCommission > 0) {
      payoutStatus = "Paid";
    }

    return {
      confirmed,
      pendingUsers,
      refunded,
      disputed,
      pendingCommission,
      approvedCommission,
      paidCommission,
      qualified,
      remainingUsers,
      qualificationStatus: qualified
        ? "Qualified"
        : `${confirmed} / ${settings.minimumUsers}`,
      payoutStatus,
      nextPayout:
        payoutStatus === "Ready"
          ? settings.payoutWindow
          : qualified
            ? `Below ${money(settings.minimumPayout)} minimum`
            : `${remainingUsers} users to qualify`,
    };
  }

  function getCreator(id) {
    const data = getData();
    const creator =
      data.creators.find((item) => item.id === id) || data.creators[0];

    return {
      ...creator,
      status: creator.accountStatus,
      ...getCreatorSummary(creator.id, data),
    };
  }

  function creatorName(id) {
    return getData().creators.find((creator) => creator.id === id)?.name || "—";
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();

    if (["qualified", "ready", "paid", "approved"].includes(value)) {
      return "green";
    }

    if (
      ["active", "in progress", "updated", "logged"].includes(value)
    ) {
      return "blue";
    }

    if (["pending", "below minimum", "paused"].includes(value)) {
      return "amber";
    }

    if (["refunded", "disputed", "ended"].includes(value)) {
      return "red";
    }

    return "gray";
  }

  function setActiveCreator(id) {
    localStorage.setItem(LOGIN_KEY, id);
  }

  function activeCreator() {
    return localStorage.getItem(LOGIN_KEY) || "sarah";
  }

  function addActivity({
    event,
    creatorId = "sarah",
    details = "",
    status = "Logged",
    admin = "Ammar",
  }) {
    const data = getData();
    const date = new Date();

    data.activity.unshift({
      id: `a${Date.now()}`,
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      event,
      creatorId,
      details,
      admin,
      status,
    });

    saveData(data);
  }

  function updateCreator(id, patch) {
    const data = getData();
    const index = data.creators.findIndex((creator) => creator.id === id);

    if (index < 0) return;

    const allowedPatch = {
      name: patch.name,
      initials: patch.initials,
      email: patch.email,
      code: patch.code,
      accountStatus: patch.accountStatus || patch.status,
      payoutMethod: patch.payoutMethod,
      notes: patch.notes,
    };

    Object.keys(allowedPatch).forEach((key) => {
      if (allowedPatch[key] === undefined) {
        delete allowedPatch[key];
      }
    });

    data.creators[index] = {
      ...data.creators[index],
      ...allowedPatch,
      lastUpdated: nowStamp(),
    };

    saveData(data);
    addActivity({
      event: "Updated partner profile",
      creatorId: id,
      details: "Account details updated",
      status: "Updated",
    });
  }

  function saveReferral(payload) {
    const data = getData();
    const existingIndex = data.referrals.findIndex(
      (referral) => referral.id === payload.id,
    );
    const referral = {
      id: payload.id || `REF-${Date.now()}`,
      creatorId: payload.creatorId,
      customerRef: payload.customerRef.trim(),
      paddleId: payload.paddleId.trim(),
      paymentDate: payload.paymentDate,
      plan: payload.plan,
      paymentType: payload.paymentType,
      renewalNumber:
        payload.paymentType === "Renewal"
          ? Number(payload.renewalNumber || 1)
          : 0,
      paddleTotalEarnings: roundMoney(payload.paddleTotalEarnings),
      status: payload.status,
      approvalDate: payload.status === "Approved" ? payload.approvalDate : "",
      commissionPaid:
        payload.status === "Approved" && Boolean(payload.commissionPaid),
      paidDate:
        payload.status === "Approved" && Boolean(payload.commissionPaid)
          ? payload.paidDate || new Date().toISOString().slice(0, 10)
          : "",
    };

    const commission = calculateReferralCommission(referral, data.settings);
    referral.commissionRate = commission.rate;
    referral.commissionAmount = commission.amount;

    if (existingIndex >= 0) {
      data.referrals[existingIndex] = referral;
    } else {
      data.referrals.unshift(referral);
    }

    saveData(data);
    addActivity({
      event: existingIndex >= 0 ? "Referral updated" : "Referral added",
      creatorId: referral.creatorId,
      details: `${referral.paddleId} · Commission: ${money(
        referral.commissionAmount,
      )}`,
      status: referral.status,
    });
  }

  function markPayoutPaid(payoutId) {
    const data = getData();
    const payout = data.payouts.find((item) => item.id === payoutId);

    if (!payout || payout.status === "Paid") return;

    payout.status = "Paid";
    payout.paidDate = new Date().toISOString().slice(0, 10);
    payout.ref =
      payout.ref === "—"
        ? `WISE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
        : payout.ref;

    let remaining = Number(payout.approved || 0);
    data.referrals
      .filter(
        (referral) =>
          referral.creatorId === payout.creatorId &&
          referral.status === "Approved" &&
          !referral.commissionPaid,
      )
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
      .forEach((referral) => {
        if (remaining <= 0) return;

        const amount = Number(referral.commissionAmount || 0);
        if (amount <= remaining + 0.001) {
          referral.commissionPaid = true;
          referral.paidDate = new Date().toISOString().slice(0, 10);
          remaining = roundMoney(remaining - amount);
        }
      });

    saveData(data);
    addActivity({
      event: "Payout recorded",
      creatorId: payout.creatorId,
      details: `${payout.id} · ${money(payout.approved)}`,
      status: "Paid",
    });
  }

  window.PartnersStore = {
    getData,
    saveData,
    getCreator,
    getCreatorSummary,
    creatorName,
    statusClass,
    setActiveCreator,
    activeCreator,
    addActivity,
    updateCreator,
    saveReferral,
    calculateReferralCommission,
    markPayoutPaid,
    money,
    roundMoney,
    nowStamp,
  };
})();
