(function () {
  const SUPABASE_URL = "https://hlvkbqpesiqjxbastxux.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_Ua-32KrYhA63EESjA0RxsQ_fytQcdE4";

  if (!window.supabase?.createClient) {
    console.error("Supabase client library failed to load.");
    return;
  }

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    },
  );

  const isAdmin = (user) => user?.app_metadata?.partner_admin === true;

  const money = (value) =>
    `$${Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const titleCase = (value) => {
    const text = String(value || "")
      .replaceAll("_", " ")
      .trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
  };

  const statusClass = (status) => {
    const value = String(status || "").toLowerCase();

    if (["qualified", "ready", "paid", "approved"].includes(value)) {
      return "green";
    }

    if (["active", "in progress", "updated", "logged"].includes(value)) {
      return "blue";
    }

    if (["pending", "below minimum", "paused"].includes(value)) {
      return "amber";
    }

    if (["refunded", "disputed", "ended"].includes(value)) {
      return "red";
    }

    return "gray";
  };

  const dateLabel = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const activityEventTitle = (eventType) => {
    const titles = {
      partner_invited: "Partner invited",
      partner_linked: "Partner linked",
      partner_updated: "Partner updated",
      partner_signed_in: "Partner signed in",
      settings_updated: "Partner settings updated",
      referral_pending: "Referral added",
      referral_approved: "Referral approved",
      referral_refunded: "Referral refunded",
      referral_disputed: "Referral disputed",
      referral_updated: "Referral updated",
      payout_ready: "Payout ready",
      payout_paid: "Payout paid",
      deletion_requested: "Deletion requested",
      profile_updated: "Profile updated",
      password_changed: "Password changed",
    };

    return titles[String(eventType || "")] || titleCase(eventType);
  };

  async function getCurrentUser() {
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (error.name !== "AuthSessionMissingError") console.error(error);
      return null;
    }
    return data?.user || null;
  }

  async function getPartnerProfile(userId) {
    if (!userId) return null;

    const { data, error } = await client
      .from("partner_creators")
      .select(
        "id,user_id,name,initials,email,promo_code,account_status,payout_method,accepted_at,pro_access_until,created_at,updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function getPartnerSettings() {
    const { data, error } = await client
      .from("partner_settings")
      .select(
        "minimum_confirmed_paid_users,initial_pro_months,qualified_pro_months,approval_days,minimum_payout_usd,payout_window",
      )
      .eq("id", 1)
      .single();

    if (error) throw error;
    return data;
  }

  async function getPartnerReferrals(creatorId) {
    const { data, error } = await client
      .from("partner_referrals")
      .select(
        "id,creator_id,customer_token,payment_date,plan,payment_type,renewal_number,status,approval_due_date,approved_at,commission_rate,commission_amount,payout_id,created_at",
      )
      .eq("creator_id", creatorId)
      .order("payment_date", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function getPartnerPayouts(creatorId) {
    const { data, error } = await client
      .from("partner_payouts")
      .select(
        "id,creator_id,amount_usd,payment_method,scheduled_date,status,paid_date,created_at",
      )
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function getPartnerActivity(creatorId, limit = null) {
    let query = client
      .from("partner_activity")
      .select("id,event_type,details,metadata,created_at")
      .eq("creator_id", creatorId)
      .eq("visibility", "partner")
      .order("created_at", { ascending: false });

    if (Number.isInteger(limit) && limit > 0) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  function activityPresentation(activity) {
    const eventType = String(activity?.event_type || "");
    const metadataStatus = String(activity?.metadata?.status || "").trim();
    const statusByEvent = {
      referral_pending: "Pending",
      referral_approved: "Approved",
      referral_refunded: "Refunded",
      referral_disputed: "Disputed",
      payout_ready: "Ready",
      payout_paid: "Paid",
      profile_updated: "Updated",
      password_changed: "Updated",
      deletion_requested: "Pending",
    };

    return {
      title:
        String(activity?.metadata?.title || "").trim() ||
        activityEventTitle(eventType),
      status: metadataStatus || statusByEvent[eventType] || "Logged",
      details: String(activity?.details || "").trim(),
      date: dateLabel(activity?.created_at),
    };
  }

  function derivePartnerSummary(profile, settings, referrals, payouts) {
    const payoutById = new Map(payouts.map((payout) => [payout.id, payout]));
    const confirmedCustomers = new Set();
    const pendingCustomers = new Set();
    let pendingCommission = 0;
    let approvedCommission = 0;

    referrals.forEach((referral) => {
      if (
        referral.payment_type === "first_payment" &&
        referral.status === "approved"
      ) {
        confirmedCustomers.add(referral.customer_token);
      }

      if (
        referral.payment_type === "first_payment" &&
        referral.status === "pending"
      ) {
        pendingCustomers.add(referral.customer_token);
      }

      if (referral.status === "pending") {
        pendingCommission += Number(referral.commission_amount || 0);
      }

      if (referral.status === "approved") {
        const payout = referral.payout_id
          ? payoutById.get(referral.payout_id)
          : null;
        if (!payout || payout.status !== "paid") {
          approvedCommission += Number(referral.commission_amount || 0);
        }
      }
    });

    const paidCommission = payouts
      .filter((payout) => payout.status === "paid")
      .reduce((sum, payout) => sum + Number(payout.amount_usd || 0), 0);
    const confirmed = confirmedCustomers.size;
    const pendingUsers = pendingCustomers.size;
    const minimumUsers = Number(settings.minimum_confirmed_paid_users || 10);
    const minimumPayout = Number(settings.minimum_payout_usd || 50);
    const qualified = confirmed >= minimumUsers;
    const readyPayout = payouts.some((payout) => payout.status === "ready");
    const payoutStatus = readyPayout
      ? "Ready"
      : qualified && approvedCommission >= minimumPayout
        ? "Ready"
        : "Below minimum";

    return {
      profile,
      settings,
      referrals,
      payouts,
      confirmed,
      pendingUsers,
      pendingCommission,
      approvedCommission,
      paidCommission,
      minimumUsers,
      minimumPayout,
      qualified,
      payoutStatus,
      nextPayout: qualified ? settings.payout_window : "Not unlocked",
    };
  }

  async function loadPartnerSummary(profile) {
    const [settings, referrals, payouts] = await Promise.all([
      getPartnerSettings(),
      getPartnerReferrals(profile.id),
      getPartnerPayouts(profile.id),
    ]);

    return derivePartnerSummary(profile, settings, referrals, payouts);
  }

  function safeNext(defaultPath) {
    const value = new URLSearchParams(window.location.search).get("next");
    if (!value || !value.startsWith("/partners/")) return defaultPath;
    if (value.startsWith("//")) return defaultPath;
    return value;
  }

  function loginUrl({ admin = false } = {}) {
    const params = new URLSearchParams();
    params.set("next", window.location.pathname);
    if (admin) params.set("admin", "1");
    return `/partners/login/?${params.toString()}`;
  }

  async function requirePartner() {
    const user = await getCurrentUser();
    if (!user) {
      window.location.replace(loginUrl());
      return null;
    }

    const profile = await getPartnerProfile(user.id);
    if (!profile) {
      window.location.replace("/partners/login/?reason=not-partner");
      return null;
    }

    return { user, profile };
  }

  async function requireAdmin() {
    const user = await getCurrentUser();
    if (!user) {
      window.location.replace(loginUrl({ admin: true }));
      return null;
    }

    if (!isAdmin(user)) {
      window.location.replace("/partners/login/?admin=1&reason=unauthorized");
      return null;
    }

    return { user };
  }

  function revealProtectedPage() {
    document.documentElement.classList.remove("partner-auth-pending");
  }

  async function guardCurrentRoute() {
    const scope = document.documentElement.dataset.partnerAuth;
    if (!scope) return null;

    try {
      const authState =
        scope === "admin" ? await requireAdmin() : await requirePartner();
      if (!authState) return null;

      const successTarget =
        document.documentElement.dataset.partnerAuthSuccess || "";
      if (successTarget) {
        window.location.replace(successTarget);
        return authState;
      }

      revealProtectedPage();
      return authState;
    } catch (error) {
      console.error("Partner access check failed:", error);
      window.location.replace(
        scope === "admin"
          ? "/partners/login/?admin=1&reason=unavailable"
          : "/partners/login/?reason=unavailable",
      );
      return null;
    }
  }

  window.DentAIStudyPartnerSupabase = {
    enabled: true,
    client,
    getCurrentUser,
    getPartnerProfile,
    getPartnerSettings,
    getPartnerReferrals,
    getPartnerPayouts,
    getPartnerActivity,
    loadPartnerSummary,
    activityPresentation,
    money,
    titleCase,
    statusClass,
    dateLabel,
    activityEventTitle,
    isAdmin,
    safeNext,
    requirePartner,
    requireAdmin,
  };

  window.DentAIStudyPartnerAuthReady = guardCurrentRoute();
})();
