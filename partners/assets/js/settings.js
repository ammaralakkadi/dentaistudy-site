document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
  if (!auth?.enabled) return;

  const set = (selector, value) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const setStatus = (selector, value, type = "") => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.textContent = value;
    if (type) element.dataset.type = type;
    else delete element.dataset.type;
  };

  const nameInput = document.querySelector("[data-name-input]");
  const emailInput = document.querySelector("[data-email-input]");
  const profileForm = document.querySelector("[data-profile-form]");
  const passwordForm = document.querySelector("[data-password-form]");
  const deleteRequestButton = document.querySelector("[data-delete-request]");
  const deleteModal = document.querySelector("[data-delete-modal]");
  const deleteCancelButton = document.querySelector("[data-delete-cancel]");
  const deleteConfirmButton = document.querySelector("[data-delete-confirm]");

  let authState = null;

  async function invokeAccount(action, payload = {}) {
    const { data, error } = await auth.client.functions.invoke(
      "partner-account",
      {
        body: { action, ...payload },
      },
    );

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  async function loadDeletionRequestState(profile) {
    const { data, error } = await auth.client
      .from("partner_deletion_requests")
      .select("id,status,requested_at")
      .eq("creator_id", profile.id)
      .eq("status", "pending")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      if (deleteRequestButton) deleteRequestButton.disabled = true;
      setStatus("[data-delete-status]", "Deletion request pending.", "info");
    }
  }

  try {
    authState = await window.DentAIStudyPartnerAuthReady;
    if (!authState?.profile) return;

    const { profile } = authState;
    if (nameInput) nameInput.value = profile.name || "";
    if (emailInput) emailInput.value = profile.email || "";
    set("[data-payout-method]", profile.payout_method || "Not added");

    const cachedSummary = auth.getCachedPartnerSummary(profile.id);
    if (cachedSummary) set("[data-next-payout]", cachedSummary.nextPayout);

    const [summary] = await Promise.all([
      auth.loadPartnerSummary(profile),
      loadDeletionRequestState(profile),
    ]);

    set("[data-next-payout]", summary.nextPayout);
  } catch (error) {
    console.error("Partner settings could not load:", error);
  }

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authState?.profile || !nameInput) return;

    const name = nameInput.value.trim();
    const submit = profileForm.querySelector('button[type="submit"]');

    if (name.length < 2) {
      setStatus("[data-profile-status]", "Enter your display name.", "error");
      return;
    }

    if (submit) submit.disabled = true;
    setStatus("[data-profile-status]", "Saving…", "info");

    try {
      const result = await invokeAccount("update_profile", { name });
      authState.profile = result.partner || {
        ...authState.profile,
        name,
      };
      nameInput.value = authState.profile.name || name;
      setStatus("[data-profile-status]", "Profile saved.", "success");
    } catch (error) {
      console.error(error);
      setStatus(
        "[data-profile-status]",
        error?.message || "Profile could not be saved.",
        "error",
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.closest(".password-field")?.querySelector("input");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      button.innerHTML =
        window.DASIcons?.[show ? "eyeOff" : "eye"] || button.innerHTML;
    });
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const oldPassword = document.getElementById("old-password")?.value || "";
    const newPassword = document.getElementById("new-password")?.value || "";
    const confirmPassword =
      document.getElementById("confirm-password")?.value || "";
    const submit = passwordForm.querySelector('button[type="submit"]');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setStatus("[data-password-status]", "Complete all password fields.", "error");
      return;
    }

    if (newPassword.length < 8) {
      setStatus(
        "[data-password-status]",
        "New password must be at least 8 characters.",
        "error",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus(
        "[data-password-status]",
        "New passwords do not match.",
        "error",
      );
      return;
    }

    if (oldPassword === newPassword) {
      setStatus(
        "[data-password-status]",
        "Choose a different new password.",
        "error",
      );
      return;
    }

    if (submit) submit.disabled = true;
    setStatus("[data-password-status]", "Updating…", "info");

    try {
      const { error } = await auth.client.auth.updateUser({
        password: newPassword,
        currentPassword: oldPassword,
      });

      if (error) throw error;

      passwordForm.reset();
      setStatus("[data-password-status]", "Password updated.", "success");

      try {
        await invokeAccount("record_password_changed");
      } catch (activityError) {
        console.error("Password activity could not be recorded:", activityError);
      }
    } catch (error) {
      console.error(error);
      setStatus(
        "[data-password-status]",
        error?.message || "Password could not be updated.",
        "error",
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  if (
    deleteRequestButton &&
    deleteModal &&
    deleteCancelButton &&
    deleteConfirmButton
  ) {
    let previousFocus = null;

    const closeDeleteModal = () => {
      deleteModal.hidden = true;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };

    deleteRequestButton.addEventListener("click", () => {
      if (deleteRequestButton.disabled) return;
      previousFocus = document.activeElement;
      deleteModal.hidden = false;
      requestAnimationFrame(() => deleteConfirmButton.focus());
    });

    deleteCancelButton.addEventListener("click", closeDeleteModal);

    deleteModal.addEventListener("click", (event) => {
      if (event.target === deleteModal) closeDeleteModal();
    });

    document.addEventListener("keydown", (event) => {
      if (!deleteModal.hidden && event.key === "Escape") closeDeleteModal();
    });

    deleteConfirmButton.addEventListener("click", async () => {
      deleteConfirmButton.disabled = true;
      setStatus("[data-delete-status]", "Sending request…", "info");

      try {
        const result = await invokeAccount("request_deletion");
        deleteRequestButton.disabled = true;
        setStatus(
          "[data-delete-status]",
          result.already_pending
            ? "Deletion request already pending."
            : "Deletion request sent.",
          "success",
        );
        closeDeleteModal();
      } catch (error) {
        console.error(error);
        setStatus(
          "[data-delete-status]",
          error?.message || "Deletion request could not be sent.",
          "error",
        );
      } finally {
        deleteConfirmButton.disabled = false;
      }
    });
  }
});
