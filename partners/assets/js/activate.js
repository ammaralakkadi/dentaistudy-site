document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
  const form = document.querySelector("[data-activate-form]");
  const message = document.querySelector("[data-activate-message]");
  const password = document.getElementById("partner-activate-password");
  const confirmPassword = document.getElementById("partner-activate-confirm");
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash") || "";
  const tokenType = params.get("type") || "";

  if (!auth?.enabled || !form || !message || !password || !confirmPassword)
    return;

  const showMessage = (text, type = "info") => {
    message.textContent = text;
    message.dataset.type = type;
  };

  async function getPartnerUser() {
    const { data: sessionData, error: sessionError } =
      await auth.client.auth.getSession();
    if (sessionError) throw sessionError;

    const user = sessionData?.session?.user || (await auth.getCurrentUser());
    if (!user) return null;

    const profile = await auth.getPartnerProfile(user.id);
    return profile ? user : null;
  }

  const hasInviteToken = Boolean(tokenHash && tokenType === "invite");

  try {
    const user = hasInviteToken ? null : await getPartnerUser();

    if (!user && !hasInviteToken) {
      showMessage(
        "This setup link is no longer active. If you already created your password, use Partner login. Otherwise contact partners@dentaistudy.com.",
        "error",
      );
      return;
    }

    form.hidden = false;
    showMessage("");
  } catch (error) {
    console.error(error);
    showMessage("Partner access could not be verified. Please try again.", "error");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nextPassword = password.value;
    const confirmation = confirmPassword.value;
    const submit = form.querySelector('button[type="submit"]');

    if (nextPassword.length < 8) {
      showMessage("Use at least 8 characters for your password.", "error");
      return;
    }

    if (nextPassword !== confirmation) {
      showMessage("The passwords do not match.", "error");
      return;
    }

    if (submit) submit.disabled = true;
    showMessage("Setting up your Partner access…");

    try {
      let user = null;

      if (hasInviteToken) {
        const { data, error } = await auth.client.auth.verifyOtp({
          token_hash: tokenHash,
          type: "invite",
        });
        if (error) throw error;

        user = data?.user || data?.session?.user || (await auth.getCurrentUser());
      } else {
        user = await getPartnerUser();
      }

      if (!user) {
        throw new Error(
          "This setup link is no longer active. Contact partners@dentaistudy.com for a new link.",
        );
      }

      const profile = await auth.getPartnerProfile(user.id);
      if (!profile) {
        throw new Error(
          "This DentAIstudy account is not linked to the Partner Program.",
        );
      }

      const { error } = await auth.client.auth.updateUser({
        password: nextPassword,
      });
      if (error) throw error;

      window.location.replace("/partners/dashboard/");
    } catch (error) {
      console.error(error);
      const raw = String(error?.message || "").toLowerCase();
      const linkError =
        raw.includes("expired") ||
        raw.includes("token") ||
        raw.includes("otp") ||
        raw.includes("invalid");

      showMessage(
        linkError
          ? "This setup link is no longer active. Contact partners@dentaistudy.com for a new link."
          : error?.message ||
              "Your Partner access could not be completed. Please try again.",
        "error",
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
