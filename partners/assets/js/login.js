document.addEventListener("DOMContentLoaded", () => {
  const select = document.querySelector("[data-creator-select]");
  const form = document.querySelector("[data-login-form]");
  const data = PartnersStore.getData();
  if (select) {
    select.innerHTML = data.creators
      .map(
        (c) =>
          `<option value="${dasEscapeHtml(c.id)}">${dasEscapeHtml(c.name)} · ${dasEscapeHtml(c.code)}</option>`,
      )
      .join("");
  }
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      PartnersStore.setActiveCreator(select.value);
      dasToast("Opening partner dashboard", 700);

      setTimeout(() => {
        location.href = "../dashboard/";
      }, 1050);
    });
  }
});
