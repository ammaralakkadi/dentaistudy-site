// assets/js/contact.js
// Handles contact form submission and stores messages in Supabase

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("contact-form");
  if (!form || !window.dasSupabase) return;

  const nameInput = document.getElementById("contact-name");
  const emailInput = document.getElementById("contact-email");
  const topicInput = document.getElementById("contact-topic");
  const messageInput = document.getElementById("contact-message");
  const statusEl = document.getElementById("contact-status");
  // If coming from Settings → "Delete account", pre-fill the form
  try {
    const params = new URLSearchParams(window.location.search || "");
    const reason = params.get("reason");

    if (reason === "delete-account") {
      if (topicInput && !topicInput.value) {
        topicInput.value = "Delete my DentAIstudy account";
      }

      if (messageInput && !messageInput.value) {
        messageInput.value =
          "Hi DentAIstudy team,\n\nI'd like to permanently delete my DentAIstudy account and all related study activity. Please confirm once this is completed.\n\nThank you.";
      }
    }
  } catch (err) {
    console.warn("[contact] Could not read URL params", err);
  }

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b91c1c" : "#6b7280";
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const name = nameInput ? nameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const topic = topicInput ? topicInput.value.trim() : "";
    const message = messageInput ? messageInput.value.trim() : "";

    if (!name || !email || !message) {
      setStatus("Please fill in your name, email, and message.", true);
      return;
    }

    setStatus("Sending your message...", false);

    // Try to attach user_id if logged in
    let userId = null;
    try {
      const { data, error } = await window.dasSupabase.auth.getUser();
      if (!error && data && data.user) {
        userId = data.user.id;
      }
    } catch (err) {
      console.error("getUser failed in contact form:", err);
    }

    try {
      const { error: insertError } = await window.dasSupabase
        .from("contact_messages")
        .insert({
          user_id: userId,
          name,
          email,
          topic,
          message,
        });

      if (insertError) {
        console.error("Error inserting contact message:", insertError);
        setStatus(
          "Something went wrong. Please try again or email us directly.",
          true
        );
        return;
      }

      // Success
      setStatus("Thank you! Your message has been sent.", false);
      if (nameInput) nameInput.value = "";
      if (emailInput) emailInput.value = "";
      if (topicInput) topicInput.value = "";
      if (messageInput) messageInput.value = "";
    } catch (err) {
      console.error("Contact form error:", err);
      setStatus(
        "Something went wrong. Please try again or email us directly.",
        true
      );
    }
  });
});
