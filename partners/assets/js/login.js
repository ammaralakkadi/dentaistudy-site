document.addEventListener("DOMContentLoaded", async () => {
  const form = document.querySelector("[data-login-form]");
  const emailInput = document.getElementById("partner-login-email");
  const passwordInput = document.getElementById("partner-login-password");
  const message = document.querySelector("[data-login-message]");
  const title = document.querySelector("[data-login-title]");
  const copy = document.querySelector("[data-login-copy]");
  const submitLabel = document.querySelector("[data-login-submit-label]");
  const auth = window.DentAIStudyPartnerSupabase;
  const params = new URLSearchParams(window.location.search);
  const adminMode = params.get("admin") === "1";

  if (!form || !emailInput || !passwordInput || !auth?.enabled) return;

  if (adminMode) {
    document.querySelector(".header-actions-public")?.remove();
    document.querySelector("[data-mobile-toggle]")?.remove();
    document.querySelector("[data-mobile-backdrop]")?.remove();
    document.querySelector("[data-mobile-panel]")?.remove();

    if (title) title.textContent = "Partner Admin login";
    if (copy)
      copy.textContent =
        "Use your authorized DentAIstudy account to open Partner Admin.";
    if (submitLabel) submitLabel.textContent = "Open Partner Admin";
  }

  const showMessage = (text, type = "info") => {
    if (!message) return;
    message.textContent = text;
    message.dataset.type = type;
  };

  const destination = () => {
    const fallback = adminMode
      ? "/partners/admin/overview/"
      : "/partners/dashboard/";
    const next = auth.safeNext(fallback);

    if (adminMode) return next.startsWith("/partners/admin/") ? next : fallback;
    return next.startsWith("/partners/admin/") ? fallback : next;
  };

  async function redirectExistingSession() {
    try {
      const user = await auth.getCurrentUser();
      if (!user) return;

      if (adminMode) {
        if (auth.isAdmin(user)) window.location.replace(destination());
        return;
      }

      const profile = await auth.getPartnerProfile(user.id);
      if (profile) window.location.replace(destination());
    } catch (error) {
      console.error(error);
    }
  }

  if (params.get("reason") === "not-partner") {
    showMessage(
      "This DentAIstudy account is not enrolled in the Partner Program.",
      "error",
    );
  } else if (params.get("reason") === "unauthorized") {
    showMessage("This account does not have Partner Admin access.", "error");
  } else if (params.get("reason") === "unavailable") {
    showMessage(
      "Partner access could not be checked. Please try again.",
      "error",
    );
  }

  await redirectExistingSession();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const submit = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      showMessage("Enter your email and password to continue.", "error");
      return;
    }

    if (submit) submit.disabled = true;
    showMessage("Checking your access…");

    try {
      const { error } = await auth.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showMessage(
          "These details do not match a DentAIstudy account.",
          "error",
        );
        return;
      }

      const user = await auth.getCurrentUser();
      if (!user) {
        showMessage(
          "We could not verify this session. Please try again.",
          "error",
        );
        return;
      }

      if (adminMode) {
        if (!auth.isAdmin(user)) {
          showMessage(
            "This account does not have Partner Admin access.",
            "error",
          );
          return;
        }
      } else {
        const profile = await auth.getPartnerProfile(user.id);
        if (!profile) {
          showMessage(
            "This DentAIstudy account is not enrolled in the Partner Program.",
            "error",
          );
          return;
        }

        try {
          await auth.client.from("partner_activity").insert({
            creator_id: profile.id,
            actor_user_id: user.id,
            actor_kind: "partner",
            event_type: "partner_signed_in",
            details: "Partner signed in.",
            visibility: "admin",
            metadata: {},
          });
        } catch (activityError) {
          console.error(
            "Partner sign-in activity could not be recorded:",
            activityError,
          );
        }
      }

      window.location.replace(destination());
    } catch (error) {
      console.error(error);
      showMessage("Something went wrong. Please try again.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
