document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  if (!form || !window.dasSupabase) return;

  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const messageEl = document.getElementById("login-message");

  function showMessage(text, type = "info") {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.style.color =
      type === "error" ? "#b91c1c" : type === "success" ? "#15803d" : "#4b5563";
  }

  function mapLoginError(error) {
    if (!error || !error.message) {
      return "We couldn't log you in. Please check your email and password.";
    }

    const msg = String(error.message).toLowerCase();

    if (msg.includes("invalid login credentials")) {
      // We intentionally keep this generic (real SaaS behavior) so we don't reveal
      // whether the email exists or not.
      return "These details don't match any DentAIstudy account.";
    }

    if (msg.includes("email not confirmed")) {
      return "Please confirm your email first, then try logging in again.";
    }

    return "We couldn't log you in. Please check your email and password.";
  }

  const forgotPasswordButton = document.getElementById("login-forgot-link");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Enter your email and password to continue.", "error");
      return;
    }

    showMessage("Checking your details...", "info");

    try {
      const { data, error } = await window.dasSupabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error(error);
        const friendly = mapLoginError(error);
        showMessage(friendly, "error");
        return;
      }

      showMessage("Logged in. Redirecting to your workspace...", "success");
      // go to Study builder after login
      window.location.href = "study.html";
    } catch (err) {
      console.error(err);
      showMessage("Something went wrong. Please try again.", "error");
    }
  });

  if (forgotPasswordButton) {
    forgotPasswordButton.addEventListener("click", async (event) => {
      event.preventDefault();

      const email = emailInput.value.trim();

      if (!email) {
        showMessage(
          "Enter your email first and we'll send you a reset link.",
          "error"
        );
        emailInput.focus();
        return;
      }

      showMessage("Sending you a secure reset link...", "info");

      try {
        const redirectTo = `${window.location.origin}/settings.html`;

        const { error } = await window.dasSupabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo,
          }
        );

        if (error) {
          console.error("resetPasswordForEmail error:", error);
          showMessage(
            "We couldn't send a reset email. Please try again in a moment.",
            "error"
          );
          return;
        }

        showMessage(
          "Check your inbox for a DentAIstudy password reset link.",
          "success"
        );
      } catch (err) {
        console.error("resetPasswordForEmail failed:", err);
        showMessage(
          "We couldn't send a reset email. Please try again in a moment.",
          "error"
        );
      }
    });
  }
});
