document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
  const form = document.querySelector("[data-activate-form]");
  const email = document.querySelector("[data-activate-email]");
  const message = document.querySelector("[data-activate-message]");
  const password = document.getElementById("partner-activate-password");
  const confirmPassword = document.getElementById("partner-activate-confirm");

  if (!auth?.enabled || !form || !email || !message) return;

  const showMessage = (text, type = "info") => {
    message.textContent = text;
    message.dataset.type = type;
  };

  try {
    const { data: sessionData, error: sessionError } =
      await auth.client.auth.getSession();
    if (sessionError) throw sessionError;

    const user = sessionData?.session?.user || (await auth.getCurrentUser());
    if (!user) {
      showMessage(
        "This invitation is invalid or has expired. Ask DentAIstudy to send a new invitation.",
        "error",
      );
      return;
    }

    const profile = await auth.getPartnerProfile(user.id);
    if (!profile) {
      showMessage(
        "This DentAIstudy account is not linked to the Partner Program.",
        "error",
      );
      return;
    }

    email.value = user.email || profile.email || "";
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
    showMessage("Saving your password…");

    try {
      const { error } = await auth.client.auth.updateUser({
        password: nextPassword,
      });
      if (error) throw error;

      window.location.replace("/partners/dashboard/");
    } catch (error) {
      console.error(error);
      showMessage(
        error?.message || "Your password could not be saved. Please try again.",
        "error",
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
