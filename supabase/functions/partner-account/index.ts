import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import nodemailer from "npm:nodemailer@6.9.14";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ADMIN_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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

async function sendDeletionRequestEmail(
  partner: {
    id: string;
    name: string;
    email: string;
    promo_code: string;
  },
  requestedAt: string,
) {
  const smtpHost = Deno.env.get("ZOHO_SMTP_HOST") ?? "smtp.zoho.com";
  const smtpPort = Number(Deno.env.get("ZOHO_SMTP_PORT") ?? "465");
  const smtpUser = Deno.env.get("ZOHO_SMTP_USER");
  const smtpPass = Deno.env.get("ZOHO_SMTP_PASS");

  if (!smtpUser || !smtpPass) {
    throw new Error("Partner deletion email configuration is missing.");
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

  await transporter.sendMail({
    from: `DentAIstudy <${smtpUser}>`,
    to: "dentaistudy@outlook.com",
    subject: `Partner deletion request: ${partner.name}`,
    text: [
      "DentAIstudy Partner deletion request",
      "",
      `Partner: ${partner.name}`,
      `Email: ${partner.email}`,
      `Partner code: ${partner.promo_code}`,
      `Partner ID: ${partner.id}`,
      `Requested at: ${requestedAt}`,
      "",
      "Review this request in Partner Admin before ending or deleting the account.",
    ].join("\n"),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    return json({ error: "Partner account service is not configured." }, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Authentication is required." }, 401);
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
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    const user = userData?.user;

    if (userError || !user) {
      return json({ error: "Could not verify this Partner session." }, 401);
    }

    const { data: partner, error: partnerError } = await admin
      .from("partner_creators")
      .select(
        "id,user_id,name,initials,email,promo_code,account_status,payout_method,payout_details,accepted_at,pro_access_until,created_at,updated_at",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (partnerError) throw partnerError;
    if (!partner) {
      return json({ error: "This account is not a Partner record." }, 403);
    }

    if (partner.account_status !== "active") {
      return json({ error: "Partner access is not active for this account." }, 403);
    }

    const body = await req.json();
    const action = String(body?.action ?? "").trim();

    if (action === "update_profile") {
      const name = String(body?.name ?? "").trim();

      if (name.length < 2 || name.length > 80) {
        return json({ error: "Display name must be 2–80 characters." }, 400);
      }

      const { data: updatedPartner, error: updateError } = await admin
        .from("partner_creators")
        .update({
          name,
          initials: initials(name),
        })
        .eq("id", partner.id)
        .select(
          "id,user_id,name,initials,email,promo_code,account_status,payout_method,payout_details,accepted_at,pro_access_until,created_at,updated_at",
        )
        .single();

      if (updateError) throw updateError;

      const { error: activityError } = await admin
        .from("partner_activity")
        .insert({
          creator_id: partner.id,
          actor_user_id: user.id,
          actor_kind: "partner",
          event_type: "profile_updated",
          details: `Display name updated to ${name}.`,
          visibility: "partner",
          metadata: {
            status: "Updated",
            title: "Profile updated",
          },
        });

      if (activityError) {
        console.error("[partner-account] profile activity failed", activityError);
      }

      return json({ ok: true, partner: updatedPartner });
    }

    if (action === "update_payout_method") {
      const method = String(body?.method ?? "").trim();
      const rawDetails =
        body?.details && typeof body.details === "object" ? body.details : {};

      if (method !== "Wise") {
        return json({ error: "Wise is the supported Partner payout method." }, 400);
      }

      const accountName = String(rawDetails.account_name ?? "").trim();
      const email = String(rawDetails.email ?? "").trim().toLowerCase();

      if (accountName.length < 2 || accountName.length > 120) {
        return json({ error: "Enter the Wise account holder name." }, 400);
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "Enter the email used for the Wise account." }, 400);
      }

      const payoutDetails: Record<string, string> = {
        account_name: accountName,
        email,
      };

      const wasAdded =
        !partner.payout_method ||
        partner.payout_method === "Not added" ||
        !partner.payout_details ||
        Object.keys(partner.payout_details).length === 0;

      const { data: updatedPartner, error: updateError } = await admin
        .from("partner_creators")
        .update({
          payout_method: method,
          payout_details: payoutDetails,
        })
        .eq("id", partner.id)
        .select(
          "id,user_id,name,initials,email,promo_code,account_status,payout_method,payout_details,accepted_at,pro_access_until,created_at,updated_at",
        )
        .single();

      if (updateError) throw updateError;

      const { error: readyPayoutError } = await admin
        .from("partner_payouts")
        .update({
          payment_method: method,
          payment_details: payoutDetails,
        })
        .eq("creator_id", partner.id)
        .eq("status", "ready");

      if (readyPayoutError) throw readyPayoutError;

      const eventType = wasAdded
        ? "payout_method_added"
        : "payout_method_updated";
      const title = wasAdded ? "Payout method added" : "Payout method updated";

      const { error: activityError } = await admin
        .from("partner_activity")
        .insert({
          creator_id: partner.id,
          actor_user_id: user.id,
          actor_kind: "partner",
          event_type: eventType,
          details: `${method} payout details ${wasAdded ? "added" : "updated"}.`,
          visibility: "partner",
          metadata: {
            status: "Updated",
            title,
            payout_method: method,
          },
        });

      if (activityError) {
        console.error("[partner-account] payout method activity failed", activityError);
      }

      return json({ ok: true, partner: updatedPartner });
    }

    if (action === "request_deletion") {
      const { data: existing, error: existingError } = await admin
        .from("partner_deletion_requests")
        .select("id,status,requested_at")
        .eq("creator_id", partner.id)
        .eq("status", "pending")
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        return json({
          ok: true,
          already_pending: true,
          request: existing,
        });
      }

      const { data: request, error: requestError } = await admin
        .from("partner_deletion_requests")
        .insert({
          creator_id: partner.id,
          requested_by: user.id,
          status: "pending",
        })
        .select("id,status,requested_at")
        .single();

      if (requestError) throw requestError;

      const { error: activityError } = await admin
        .from("partner_activity")
        .insert({
          creator_id: partner.id,
          actor_user_id: user.id,
          actor_kind: "partner",
          event_type: "deletion_requested",
          details: "Partner requested account deletion.",
          visibility: "partner",
          metadata: {
            status: "Pending",
            title: "Deletion requested",
          },
        });

      if (activityError) {
        console.error("[partner-account] deletion activity failed", activityError);
      }

      let notificationSent = false;
      try {
        await sendDeletionRequestEmail(partner, request.requested_at);
        notificationSent = true;
      } catch (notificationError) {
        console.error(
          "[partner-account] deletion notification failed",
          notificationError,
        );
      }

      return json({
        ok: true,
        already_pending: false,
        notification_sent: notificationSent,
        request,
      });
    }

    if (action === "record_password_changed") {
      const { error: activityError } = await admin
        .from("partner_activity")
        .insert({
          creator_id: partner.id,
          actor_user_id: user.id,
          actor_kind: "partner",
          event_type: "password_changed",
          details: "Partner password changed.",
          visibility: "partner",
          metadata: {
            status: "Updated",
            title: "Password changed",
          },
        });

      if (activityError) throw activityError;
      return json({ ok: true });
    }

    return json({ error: "Unsupported Partner account action." }, 400);
  } catch (error) {
    console.error("[partner-account]", error);
    const message =
      error instanceof Error
        ? error.message
        : "Partner account action could not be completed.";
    return json({ error: message }, 500);
  }
});
