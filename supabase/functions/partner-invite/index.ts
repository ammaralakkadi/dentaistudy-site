import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.111.0/cors";
import nodemailer from "npm:nodemailer@6.9.14";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ADMIN_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const PARTNER_ACTIVATION_URL =
  "https://dentaistudy.com/partners/activate/";
const PARTNER_DASHBOARD_URL =
  "https://dentaistudy.com/partners/dashboard/";
const PARTNER_FROM_EMAIL = "partners@dentaistudy.com";

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

async function clearPartnerAuthEntitlement(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  if (!userId) return;

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw error ?? new Error("Could not load the Partner Auth user.");
  }

  const appMetadata = { ...(data.user.app_metadata ?? {}) };
  delete appMetadata.partner_program;
  delete appMetadata.partner_pro_until;

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: appMetadata,
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

async function sendPartnerInvitationEmail(
  email: string,
  actionUrl: string,
  existingAccount: boolean,
) {
  const smtpHost = Deno.env.get("ZOHO_SMTP_HOST") ?? "smtp.zoho.com";
  const smtpPort = Number(Deno.env.get("ZOHO_SMTP_PORT") ?? "465");
  const smtpUser = Deno.env.get("ZOHO_SMTP_USER");
  const smtpPass = Deno.env.get("ZOHO_SMTP_PASS");

  if (!smtpUser || !smtpPass) {
    throw new Error("Partner invitation email configuration is missing.");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const heading = existingAccount
    ? "We’d be delighted to have you as a DentAIstudy Partner"
    : "We’d be delighted to have you as a DentAIstudy Partner";
  const message = existingAccount
    ? "We’re pleased to invite you to join the DentAIstudy Partner Program, a private collaboration for selected dental creators and professionals. Your existing DentAIstudy account is now connected to the Partner Program, so there’s nothing new to create. Sign in with your current DentAIstudy email and password to open your Partner dashboard."
    : "We’re pleased to invite you to join the DentAIstudy Partner Program, a private collaboration for selected dental creators and professionals. Accept your invitation to set up your Partner account and receive your unique code for sharing DentAIstudy with your audience.";
  const buttonLabel = existingAccount
    ? "Open Partner dashboard"
    : "Accept Partner invitation";
  const fallbackLabel = existingAccount
    ? "Open the Partner dashboard"
    : "Open the secure invitation link";

  await transporter.sendMail({
    from: `DentAIstudy Partners <${PARTNER_FROM_EMAIL}>`,
    to: email,
    subject: "You've been invited to the DentAIstudy Partner Program",
    html: `
<div
  style="
    margin: 0;
    padding: 32px 10px;
    background: #f7f8fa;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
      sans-serif;
  "
>
  <div
    style="
      max-width: 680px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      overflow: hidden;
    "
  >
    <div style="padding: 34px 30px 30px 30px">
      <div
        style="
          font-size: 25px;
          line-height: 1.2;
          font-weight: 750;
          letter-spacing: -0.7px;
          color: #111827;
          margin: 0 0 32px 0;
        "
      >
        DentAIstudy
      </div>

      <div
        style="
          font-size: 12px;
          line-height: 1.4;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #075fb0;
          margin: 0 0 12px 0;
        "
      >
        Partner invitation
      </div>

      <h1
        style="
          font-size: 25px;
          line-height: 1.3;
          letter-spacing: -0.6px;
          font-weight: 750;
          color: #111827;
          margin: 0 0 14px 0;
        "
      >
        ${heading}
      </h1>

      <p
        style="
          font-size: 15px;
          line-height: 1.7;
          color: #4b5563;
          margin: 0 0 24px 0;
        "
      >
        ${message}
      </p>

      <div style="margin: 0 0 26px 0">
        <a
          href="${actionUrl}"
          style="
            display: inline-block;
            background: #111827;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 18px;
            border-radius: 10px;
            font-size: 14px;
            line-height: 1.4;
            font-weight: 700;
          "
        >
          ${buttonLabel}
        </a>
      </div>

      <p
        style="
          font-size: 13px;
          line-height: 1.65;
          color: #6b7280;
          margin: 0;
        "
      >
        If you weren’t expecting this invitation, you can safely ignore this
        email.
      </p>

      <div
        style="
          border-top: 1px solid #eef0f3;
          margin: 28px 0 0 0;
          padding: 22px 0 0 0;
        "
      >
        <p
          style="
            font-size: 12px;
            line-height: 1.65;
            color: #6b7280;
            margin: 0;
          "
        >
          Button not opening?
          <a
            href="${actionUrl}"
            style="color: #075fb0; text-decoration: none; font-weight: 600"
          >
            ${fallbackLabel}
          </a>
        </p>
      </div>
    </div>
  </div>

  <div
    style="
      max-width: 680px;
      margin: 18px auto 0 auto;
      text-align: center;
      padding: 0 10px;
    "
  >
    <p
      style="
        font-size: 12px;
        line-height: 1.6;
        color: #6b7280;
        margin: 0 0 6px 0;
      "
    >
      Need help?
      <a
        href="mailto:partners@dentaistudy.com"
        style="color: #111827; text-decoration: none; font-weight: 600"
      >
        partners@dentaistudy.com
      </a>
    </p>

    <p
      style="
        font-size: 11px;
        line-height: 1.6;
        color: #9ca3af;
        margin: 0;
      "
    >
      © 2026 DentAIstudy. All rights reserved.
    </p>
  </div>
</div>`,
  });
}

async function deletePartner(
  admin: ReturnType<typeof createClient>,
  callerId: string,
  partnerId: string,
) {
  const { data: partner, error: partnerError } = await admin
    .from("partner_creators")
    .select("id,user_id,name,email,promo_code,pro_access_until")
    .eq("id", partnerId)
    .maybeSingle();

  if (partnerError) throw partnerError;
  if (!partner) {
    return json({ error: "This Partner no longer exists." }, 404);
  }

  const [referralResult, payoutResult] = await Promise.all([
    admin
      .from("partner_referrals")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", partner.id),
    admin
      .from("partner_payouts")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", partner.id),
  ]);

  if (referralResult.error) throw referralResult.error;
  if (payoutResult.error) throw payoutResult.error;

  if ((referralResult.count ?? 0) > 0 || (payoutResult.count ?? 0) > 0) {
    return json(
      {
        error:
          "This Partner has referral or payout history. Set the account to Ended instead so financial records remain intact.",
      },
      409,
    );
  }

  await clearPartnerAuthEntitlement(admin, partner.user_id);

  try {
    const { error: requestError } = await admin
      .from("partner_deletion_requests")
      .delete()
      .eq("creator_id", partner.id);
    if (requestError) throw requestError;

    const { error: deleteError } = await admin
      .from("partner_creators")
      .delete()
      .eq("id", partner.id);
    if (deleteError) throw deleteError;
  } catch (error) {
    await syncPartnerAuthEntitlement(
      admin,
      partner.user_id,
      partner.pro_access_until ? String(partner.pro_access_until) : null,
    ).catch(() => null);
    throw error;
  }

  const { error: activityError } = await admin.from("partner_activity").insert({
    creator_id: null,
    actor_user_id: callerId,
    actor_kind: "admin",
    event_type: "partner_deleted",
    details: `Deleted Partner ${partner.name} (${partner.email}).`,
    visibility: "admin",
    metadata: {
      partner_id: partner.id,
      email: partner.email,
      promo_code: partner.promo_code,
    },
  });

  if (activityError) {
    console.error("[partner-invite] deletion activity insert failed", activityError);
  }

  return json({ ok: true });
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

    if (action === "delete_partner") {
      const partnerId = String(body?.partnerId ?? "").trim();
      if (!partnerId) {
        return json({ error: "Partner ID is required." }, 400);
      }
      return await deletePartner(admin, caller.id, partnerId);
    }

    const name = String(body?.name ?? "").trim();
    const email = normalizeEmail(body?.email);
    const promoCode = normalizeCode(body?.promoCode);
    const accountStatus = String(body?.accountStatus ?? "active").toLowerCase();
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
    let actionUrl = PARTNER_DASHBOARD_URL;

    if (!authUser) {
      const { data: linkData, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            data: { full_name: name },
            redirectTo: PARTNER_ACTIVATION_URL,
          },
        });

      if (linkError || !linkData?.user || !linkData?.properties?.hashed_token) {
        throw linkError ?? new Error("Supabase did not create the invited user.");
      }

      authUser = linkData.user;
      invitedUserId = authUser.id;
      actionUrl =
        `${PARTNER_ACTIVATION_URL}?token_hash=` +
        `${encodeURIComponent(linkData.properties.hashed_token)}&type=invite`;
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
        payout_method: "Not added",
        payout_details: {},
        pro_access_until: proUntil,
        notes: notes || null,
      })
      .select(
        "id,user_id,name,email,promo_code,account_status,payout_method,payout_details,pro_access_until,created_at,updated_at",
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
      await sendPartnerInvitationEmail(email, actionUrl, mode === "linked");
    } catch (setupError) {
      await admin.from("partner_creators").delete().eq("id", partner.id);
      if (mode === "linked") {
        await clearPartnerAuthEntitlement(admin, authUser.id).catch(() => null);
      }
      if (invitedUserId) {
        await admin.auth.admin.deleteUser(invitedUserId).catch(() => null);
      }
      throw setupError;
    }

    const eventType = mode === "invited" ? "partner_invited" : "partner_linked";
    const details =
      mode === "invited"
        ? `Invitation sent to ${email}`
        : `Existing DentAIstudy account linked and notified: ${email}`;

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
