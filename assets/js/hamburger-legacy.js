// assets/js/hamburger-legacy.js
(() => {
  const menuToggle = document.querySelector(".menu-toggle");
  const slideNav = document.querySelector(".slide-nav");
  const backdrop = document.querySelector(".slide-nav-backdrop");
  const studySidebar = document.querySelector(".app > #sidebar.sidebar");

  const useStudySidebar = Boolean(studySidebar) && !slideNav;

  function isMenuOpen() {
    if (useStudySidebar) return studySidebar.classList.contains("open");
    return slideNav?.classList.contains("active") || false;
  }

  function setMenu(open) {
    if (!menuToggle || !backdrop) return;

    if (useStudySidebar) {
      studySidebar.classList.toggle("open", open);
      slideNav?.classList.remove("active");
    } else if (slideNav) {
      slideNav.classList.toggle("active", open);
    }

    backdrop.classList.toggle("active", open);
    menuToggle.classList.toggle("is-open", open);
    document.body.classList.toggle("mobile-menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  function closeMenu() {
    setMenu(false);
  }

  if (!menuToggle || !backdrop) return;
  if (!useStudySidebar && !slideNav) return;

  menuToggle.setAttribute("aria-expanded", "false");

  menuToggle.addEventListener("click", () => {
    setMenu(!isMenuOpen());
  });

  backdrop.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  slideNav?.addEventListener("click", (e) => {
    if (e.target.closest?.("a, button")) closeMenu();
  });

  studySidebar?.addEventListener("click", (e) => {
    if (window.matchMedia("(max-width: 1024px)").matches) {
      if (e.target.closest?.("a, button")) closeMenu();
    }
  });

  window
    .matchMedia("(min-width: 1025px)")
    .addEventListener("change", closeMenu);
})();
