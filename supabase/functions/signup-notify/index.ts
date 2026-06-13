import nodemailer from "npm:nodemailer@6.9.14";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("SIGNUP_NOTIFY_SECRET");
  const receivedSecret = req.headers.get("x-signup-notify-secret");

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const payload = await req.json();
  const email = String(payload.email ?? "Unknown email");
  const userId = String(payload.user_id ?? "Unknown user id");
  const provider = String(payload.provider ?? "email");
  const createdAt = String(payload.created_at ?? new Date().toISOString());

  const smtpHost = Deno.env.get("ZOHO_SMTP_HOST") ?? "smtp.zoho.com";
  const smtpPort = Number(Deno.env.get("ZOHO_SMTP_PORT") ?? "465");
  const smtpUser = Deno.env.get("ZOHO_SMTP_USER");
  const smtpPass = Deno.env.get("ZOHO_SMTP_PASS");
  const notifyTo =
    Deno.env.get("SIGNUP_NOTIFY_TO") ?? Deno.env.get("CONTACT_TO_EMAIL");

  if (!smtpUser || !smtpPass || !notifyTo) {
    return json({ error: "Missing email configuration" }, 500);
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
    to: notifyTo,
    subject: `New DentAIstudy signup: ${email}`,
    text: [
      "New DentAIstudy signup",
      "",
      `Email: ${email}`,
      `User ID: ${userId}`,
      `Provider: ${provider}`,
      `Created at: ${createdAt}`,
    ].join("\n"),
  });

  return json({ ok: true });
});
