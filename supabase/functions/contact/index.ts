// supabase/functions/contact/index.ts
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.14";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const { name, email, topic, message } = await req.json();

    const cleanName = String(name ?? "").trim();
    const cleanEmail = String(email ?? "").trim();
    const cleanTopic = String(topic ?? "").trim();
    const cleanMessage = String(message ?? "").trim();

    if (!cleanName || !cleanEmail || !cleanMessage) {
      return json(400, {
        error: "Missing required fields",
        required: ["name", "email", "message"],
      });
    }

    // Secrets (must exist)
    const smtpHost = Deno.env.get("ZOHO_SMTP_HOST") ?? "";
    const smtpPortRaw = Deno.env.get("ZOHO_SMTP_PORT") ?? "";
    const smtpUser = Deno.env.get("ZOHO_SMTP_USER") ?? "";
    const smtpPass = Deno.env.get("ZOHO_SMTP_PASS") ?? "";
    const toEmail = Deno.env.get("CONTACT_TO_EMAIL") ?? "";

    const smtpPort = Number(smtpPortRaw);

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !toEmail) {
      console.error("Email not configured: missing secrets", {
        smtpHost: !!smtpHost,
        smtpPort: !!smtpPort,
        smtpUser: !!smtpUser,
        smtpPass: !!smtpPass,
        toEmail: !!toEmail,
      });
      return json(500, { error: "Email not configured (missing secrets)" });
    }

    // Zoho recommended: 587 + STARTTLS (secure: false)
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true only for 465
      auth: { user: smtpUser, pass: smtpPass },
    });

    const subject = cleanTopic
      ? `DentAIstudy Contact: ${cleanTopic}`
      : "DentAIstudy Contact Form";

    const text = [
      "New contact form submission:",
      "",
      `Name: ${cleanName}`,
      `Email: ${cleanEmail}`,
      cleanTopic ? `Topic: ${cleanTopic}` : "",
      "",
      "Message:",
      cleanMessage,
      "",
      "— Sent from DentAIstudy contact form",
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2 style="margin:0 0 12px">New contact form submission</h2>
        <p style="margin:0 0 6px"><strong>Name:</strong> ${escapeHtml(
          cleanName
        )}</p>
        <p style="margin:0 0 6px"><strong>Email:</strong> ${escapeHtml(
          cleanEmail
        )}</p>
        ${
          cleanTopic
            ? `<p style="margin:0 0 6px"><strong>Topic:</strong> ${escapeHtml(
                cleanTopic
              )}</p>`
            : ""
        }
        <hr style="margin:14px 0;border:none;border-top:1px solid #ddd" />
        <p style="margin:0 0 6px"><strong>Message:</strong></p>
        <pre style="white-space:pre-wrap;margin:0;background:#f7f7f7;padding:12px;border-radius:8px">${escapeHtml(
          cleanMessage
        )}</pre>
        <p style="margin:12px 0 0;color:#666;font-size:12px">— Sent from DentAIstudy contact form</p>
      </div>
    `;

    // Send email
    const info = await transporter.sendMail({
      from: `DentAIstudy <${smtpUser}>`,
      to: toEmail,
      replyTo: cleanEmail, // so you can hit "Reply" and respond to the user
      subject,
      text,
      html,
    });

    console.log("Email sent:", { messageId: info.messageId });

    return json(200, { ok: true });
  } catch (err) {
    console.error("Contact function error:", err);
    return json(500, { error: "Failed to send email" });
  }
});

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
