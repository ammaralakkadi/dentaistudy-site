import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.111.0/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ADMIN_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const PARTNER_ACTIVATION_URL =
  "https://dentaistudy.com/partners/activate/";

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function initials(name: string) {
  const value = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.replace(/[^a-z0-9]/gi, "").charAt(0))
    .join("")
    .toUpperCase();

  return value || "DP";
}

function addMonthsClamped(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetStart = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(
    Date.UTC(
      targetStart.getUTCFullYear(),
      targetStart.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetStart.getUTCFullYear(),
      targetStart.getUTCMonth(),
      Math.min(day, lastDay),
    ),
  );
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
) {
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find(
      (user) => normalizeEmail(user.email) === email,
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
  }

  throw new Error("Could not finish the DentAIstudy account lookup.");
}

async function syncPartnerAuthEntitlement(
  admin: ReturnType<typeof createClient>,
  userId: string,
  proUntil: string | null,
) {
  if (!userId || !proUntil) return;

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw error ?? new Error("Could not load the Partner Auth user.");
  }

  const appMetadata = data.user.app_metadata ?? {};
  if (
    appMetadata.partner_program === true &&
    appMetadata.partner_pro_until === proUntil
  ) {
    return;
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...appMetadata,
      partner_program: true,
      partner_pro_until: proUntil,
    },
  });

  if (updateError) throw updateError;
}

async function syncAllPartnerEntitlements(
  admin: ReturnType<typeof createClient>,
) {
  const [
    { data: settings, error: settingsError },
    { data: creators, error: creatorsError },
    { data: referrals, error: referralsError },
  ] = await Promise.all([
    admin
      .from("partner_settings")
      .select(
        "minimum_confirmed_paid_users,qualified_pro_months",
      )
      .eq("id", 1)
      .single(),
    admin
      .from("partner_creators")
      .select("id,user_id,pro_access_until,qualified_at"),
    admin
      .from("partner_referrals")
      .select("creator_id,customer_token")
      .eq("payment_type", "first_payment")
      .eq("status", "approved"),
  ]);

  if (settingsError) throw settingsError;
  if (creatorsError) throw creatorsError;
  if (referralsError) throw referralsError;

  const confirmedByCreator = new Map<string, Set<string>>();
  for (const referral of referrals ?? []) {
    if (!confirmedByCreator.has(referral.creator_id)) {
      confirmedByCreator.set(referral.creator_id, new Set());
    }
    confirmedByCreator
      .get(referral.creator_id)
      ?.add(String(referral.customer_token));
  }

  const minimumUsers = Number(settings.minimum_confirmed_paid_users || 10);
  const qualifiedMonths = Number(settings.qualified_pro_months || 12);
  let synced = 0;
  let newlyQualified = 0;

  for (const creator of creators ?? []) {
    const confirmed = confirmedByCreator.get(creator.id)?.size ?? 0;
    let qualifiedAt = creator.qualified_at
      ? new Date(creator.qualified_at)
      : null;
    let proUntil = creator.pro_access_until
      ? String(creator.pro_access_until)
      : null;

    if (confirmed >= minimumUsers && !qualifiedAt) {
      qualifiedAt = new Date();
      proUntil = addMonthsClamped(qualifiedAt, qualifiedMonths)
        .toISOString()
        .slice(0, 10);

      const { error: qualificationError } = await admin
        .from("partner_creators")
        .update({
          qualified_at: qualifiedAt.toISOString(),
          pro_access_until: proUntil,
        })
        .eq("id", creator.id);

      if (qualificationError) throw qualificationError;
      newlyQualified += 1;
    }

    if (creator.user_id && proUntil) {
      await syncPartnerAuthEntitlement(admin, creator.user_id, proUntil);
      synced += 1;
    }
  }

  return { synced, newlyQualified };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    return json({ error: "Partner onboarding is not configured." }, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Admin authentication is required." }, 401);
  }

  const jwt = authorization.slice(7).trim();
  const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { data: callerData, error: callerError } =
      await admin.auth.getUser(jwt);
    const caller = callerData?.user;

    if (callerError || !caller) {
      return json({ error: "Could not verify the Admin session." }, 401);
    }

    if (caller.app_metadata?.partner_admin !== true) {
      return json({ error: "Partner Admin access is required." }, 403);
    }

    const body = await req.json();
    const action = String(body?.action ?? "invite").trim();

    if (action === "sync_entitlements") {
      const result = await syncAllPartnerEntitlements(admin);
      return json({ ok: true, ...result });
    }

    const name = String(body?.name ?? "").trim();
    const email = normalizeEmail(body?.email);
    const promoCode = normalizeCode(body?.promoCode);
    const accountStatus = String(body?.accountStatus ?? "active").toLowerCase();
    const payoutMethod = String(body?.payoutMethod ?? "Not added").trim();
    const notes = String(body?.notes ?? "").trim();

    if (!name || !email || !promoCode) {
      return json({ error: "Name, email, and promo code are required." }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    if (!/^[A-Z0-9_-]{3,32}$/.test(promoCode)) {
      return json(
        {
          error:
            "Promo code must be 3–32 characters using letters, numbers, hyphens, or underscores.",
        },
        400,
      );
    }

    if (!["active", "paused", "ended"].includes(accountStatus)) {
      return json({ error: "Invalid account status." }, 400);
    }

    const [{ data: emailMatch, error: emailError }, { data: codeMatch, error: codeError }] =
      await Promise.all([
        admin
          .from("partner_creators")
          .select("id")
          .ilike("email", email)
          .maybeSingle(),
        admin
          .from("partner_creators")
          .select("id")
          .ilike("promo_code", promoCode)
          .maybeSingle(),
      ]);

    if (emailError) throw emailError;
    if (codeError) throw codeError;
    if (emailMatch) {
      return json({ error: "This email is already a Partner." }, 409);
    }
    if (codeMatch) {
      return json({ error: "This promo code is already assigned." }, 409);
    }

    const { data: settings, error: settingsError } = await admin
      .from("partner_settings")
      .select("initial_pro_months")
      .eq("id", 1)
      .single();
    if (settingsError) throw settingsError;

    const proUntil = addMonthsClamped(
      new Date(),
      Number(settings.initial_pro_months || 3),
    )
      .toISOString()
      .slice(0, 10);

    let authUser = await findAuthUserByEmail(admin, email);
    let mode = "linked";
    let invitedUserId = "";

    if (!authUser) {
      const { data: inviteData, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: name },
          redirectTo: PARTNER_ACTIVATION_URL,
        });

      if (inviteError || !inviteData?.user) {
        throw inviteError ?? new Error("Supabase did not create the invited user.");
      }

      authUser = inviteData.user;
      invitedUserId = authUser.id;
      mode = "invited";
    }

    const { data: partner, error: partnerError } = await admin
      .from("partner_creators")
      .insert({
        user_id: authUser.id,
        name,
        initials: initials(name),
        email,
        promo_code: promoCode,
        account_status: accountStatus,
        payout_method: payoutMethod || "Not added",
        pro_access_until: proUntil,
        notes: notes || null,
      })
      .select(
        "id,user_id,name,email,promo_code,account_status,payout_method,pro_access_until,created_at,updated_at",
      )
      .single();

    if (partnerError) {
      if (invitedUserId) {
        await admin.auth.admin.deleteUser(invitedUserId).catch(() => null);
      }
      throw partnerError;
    }

    try {
      await syncPartnerAuthEntitlement(admin, authUser.id, proUntil);
    } catch (entitlementError) {
      await admin.from("partner_creators").delete().eq("id", partner.id);
      if (invitedUserId) {
        await admin.auth.admin.deleteUser(invitedUserId).catch(() => null);
      }
      throw entitlementError;
    }

    const eventType = mode === "invited" ? "partner_invited" : "partner_linked";
    const details =
      mode === "invited"
        ? `Invitation sent to ${email}`
        : `Existing DentAIstudy account linked: ${email}`;

    const { error: activityError } = await admin.from("partner_activity").insert({
      creator_id: partner.id,
      actor_user_id: caller.id,
      actor_kind: "admin",
      event_type: eventType,
      details,
      visibility: "admin",
      metadata: { email, promo_code: promoCode },
    });

    if (activityError) {
      console.error("[partner-invite] activity insert failed", activityError);
    }

    return json({ ok: true, mode, partner });
  } catch (error) {
    console.error("[partner-invite]", error);
    const message =
      error instanceof Error ? error.message : "Could not add this Partner.";
    return json({ error: message }, 500);
  }
});
