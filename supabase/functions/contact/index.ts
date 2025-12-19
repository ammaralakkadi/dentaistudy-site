import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { name, email, topic, message } = await req.json();

    if (!name || !email || !message) {
      return new Response("Missing fields", { status: 400 });
    }

    const smtpHost = Deno.env.get("ZOHO_SMTP_HOST");
    const smtpPort = Deno.env.get("ZOHO_SMTP_PORT");
    const smtpUser = Deno.env.get("ZOHO_SMTP_USER");
    const smtpPass = Deno.env.get("ZOHO_SMTP_PASS");

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return new Response("Email not configured", { status: 500 });
    }

    const emailBody = `
New contact message from DentAIstudy

Name: ${name}
Email: ${email}
Topic: ${topic || "N/A"}

Message:
${message}
    `.trim();

    const auth = btoa(`${smtpUser}:${smtpPass}`);

    const res = await fetch(`https://${smtpHost}:${smtpPort}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `"DentAIstudy" <${smtpUser}>`,
        to: ["info@dentaistudy.com"],
        subject: `New contact message: ${topic || "General"}`,
        text: emailBody,
      }),
    });

    if (!res.ok) {
      throw new Error("SMTP send failed");
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response("Server error", { status: 500 });
  }
});
