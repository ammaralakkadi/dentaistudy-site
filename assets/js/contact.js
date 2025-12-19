// assets/js/contact.js
// Sends Contact form submissions to your Supabase Edge Function: `contact`
// Works for both anonymous + logged-in users (user_id included when available).

document.addEventListener("DOMContentLoaded", () => {
  const supabase = window.dasSupabase;

  const form = document.getElementById("contact-form");
  const statusEl = document.getElementById("contact-status");

  const nameEl = document.getElementById("contact-name");
  const emailEl = document.getElementById("contact-email");
  const topicEl = document.getElementById("contact-topic");
  const messageEl = document.getElementById("contact-message");

  if (!form) return;

  const setStatus = (text, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.style.display = text ? "block" : "none";
    statusEl.style.color = isError ? "#b42318" : "#067647";
  };

  const isValidEmail = (email) => {
    if (!email) return false;
    // simple, practical check (not perfect RFC)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const safeTrim = (v) => (v == null ? "" : String(v).trim());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");

    if (!supabase) {
      setStatus(
        "Something went wrong. Please try again or email us directly.",
        true
      );
      return;
    }

    const name = safeTrim(nameEl?.value);
    const email = safeTrim(emailEl?.value);
    const topic = safeTrim(topicEl?.value);
    const message = safeTrim(messageEl?.value);

    // Minimal validation (keep it simple, no surprises)
    if (!name || name.length < 2)
      return setStatus("Please enter your name.", true);
    if (!isValidEmail(email))
      return setStatus("Please enter a valid email.", true);
    if (!topic || topic.length < 2)
      return setStatus("Please enter a topic.", true);
    if (!message || message.length < 5)
      return setStatus("Please enter a message.", true);

    // Optional: disable submit button to avoid double clicks
    const submitBtn = form.querySelector(
      'button[type="submit"], input[type="submit"]'
    );
    const prevBtnText = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
    }

    try {
      // Get user_id if logged-in (don’t fail the form if auth is missing)
      let userId = null;
      try {
        const { data } = await supabase.auth.getUser();
        userId = data?.user?.id || null;
      } catch (_) {
        userId = null;
      }

      const payload = {
        user_id: userId,
        name,
        email,
        topic,
        message,
        page_url: window.location.href,
        sent_at: new Date().toISOString(),
      };

      // IMPORTANT:
      // Do NOT use fetch("/api/contact") on GitHub Pages.
      // Use the Supabase Edge Function via supabase.functions.invoke("contact", ...)
      const { data, error } = await supabase.functions.invoke("contact", {
        body: payload,
      });

      if (error) {
        // Common: 401/403 when the Edge Function is still set to require JWT.
        const status = error?.status || error?.context?.status;
        if (status === 401 || status === 403) {
          throw new Error(
            "Contact service is currently restricted. Please sign in or email us directly."
          );
        }
        throw new Error(error.message || "Contact email failed");
      }

      // If your function returns { ok: true } (recommended), honor it.
      if (data && data.ok === false) {
        throw new Error(data.message || "Contact email failed");
      }

      setStatus("Thank you! Your message has been sent.", false);

      // Clear fields (keep name/email if you want; but you asked about duplicates—this is single path)
      if (topicEl) topicEl.value = "";
      if (messageEl) messageEl.value = "";
    } catch (err) {
      console.error("Contact form error:", err);
      setStatus(
        "Something went wrong. Please try again or email us directly.",
        true
      );
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = prevBtnText || "Send message";
      }
    }
  });
});
