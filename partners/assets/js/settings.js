document.addEventListener("DOMContentLoaded", () => {
  const id = PartnersStore.activeCreator();
  const c = PartnersStore.getCreator(id);
  const set = (sel, value) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.textContent = value;
    });
  };

  set("[data-creator-name]", c.name);
  set("[data-creator-initials]", c.initials);
  set("[data-code]", c.code);
  set("[data-payout-method]", c.payoutMethod || "Wise (USD)");
  set("[data-next-payout]", c.nextPayout || "Not unlocked");

  const nameInput = document.querySelector("[data-name-input]");
  const emailInput = document.querySelector("[data-email-input]");
  if (nameInput) nameInput.value = c.name || "";
  if (emailInput) emailInput.value = c.email || "";

  document
    .querySelector("[data-profile-form]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      PartnersStore.updateCreator(id, {
        name: nameInput.value.trim() || c.name,
        email: emailInput.value.trim() || c.email,
      });
      const fresh = PartnersStore.getCreator(id);
      set("[data-creator-name]", fresh.name);
      const status = document.querySelector("[data-profile-status]");
      if (status) status.textContent = "Saved";
      dasToast("Profile saved");
    });

  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.closest(".password-field")?.querySelector("input");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.innerHTML =
        window.DASIcons?.[show ? "eyeOff" : "eye"] || btn.innerHTML;
    });
  });

  document
    .querySelector("[data-password-form]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const newPassword = document.querySelector("#new-password")?.value || "";
      const confirmPassword =
        document.querySelector("#confirm-password")?.value || "";
      const status = document.querySelector("[data-password-status]");
      if (newPassword.length < 8) {
        if (status) status.textContent = "Use at least 8 characters.";
        return;
      }
      if (newPassword !== confirmPassword) {
        if (status) status.textContent = "Passwords do not match.";
        return;
      }
      event.currentTarget.reset();
      if (status) status.textContent = "Password update placeholder saved.";
      dasToast("Password update saved");
    });

  const deleteRequestButton = document.querySelector("[data-delete-request]");
  const deleteModal = document.querySelector("[data-delete-modal]");
  const deleteCancelButton = document.querySelector("[data-delete-cancel]");
  const deleteConfirmButton = document.querySelector("[data-delete-confirm]");

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

    deleteConfirmButton.addEventListener("click", () => {
      const status = document.querySelector("[data-delete-status]");
      if (status) status.textContent = "Deletion request placeholder sent.";
      PartnersStore.addActivity({
        creatorId: id,
        event: "Deletion request submitted",
        details: "Partner account deletion review requested",
        status: "Logged",
      });
      dasToast("Deletion request saved");
      closeDeleteModal();
    });
  }
});
