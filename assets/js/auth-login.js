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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Please enter your email and password.", "error");
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
        showMessage(error.message || "Could not log you in.", "error");
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
});
