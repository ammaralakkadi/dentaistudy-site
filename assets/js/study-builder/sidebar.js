// assets/js/study-builder/sidebar.js
// Suite panel wiring: open/close + backdrop + ESC.
// NOTE: This intentionally excludes the hamburger/#sidebar drawer system to avoid conflicts.

(() => {
  const moreBtn = document.getElementById("btnMore");
  const studyPanel = document.getElementById("chatsPanel");
  const studyPanelBody = document.getElementById("chatsPanelBody");
  const studyPanelContent = document.getElementById("chatsPanelContent");
  const studyPanelClose = document.getElementById("chatsPanelClose");
  const backdrop = document.getElementById("backdrop");

  const chatsSlot = document.getElementById("sbChatsSlot");
  const studyNav = document.querySelector('.sb-nav[aria-label="Study Suite"]');
  const sidebar = document.getElementById("sidebar");

  let hideTimer = null;

  function ensureStudyMenuInPanel() {
    const host = studyPanelContent || studyPanelBody;
    if (!host || !studyNav) return;

    if (!host.contains(studyNav)) {
      host.appendChild(studyNav);
    }
  }

  function ensureStudyMenuInSidebar() {
    if (studyNav && sidebar && chatsSlot && !sidebar.contains(studyNav)) {
      sidebar.insertBefore(studyNav, chatsSlot);
    }
  }

  function closeLegacyMenuIfOpen() {
    document.querySelector(".slide-nav")?.classList.remove("active");
    document.querySelector(".slide-nav-backdrop")?.classList.remove("active");

    const menuToggle = document.querySelector(".menu-toggle");
    menuToggle?.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
    menuToggle?.setAttribute("aria-label", "Open menu");

    document.body.classList.remove("mobile-menu-open");
  }

  function openStudyMenu() {
    if (!studyPanel) return;

    closeLegacyMenuIfOpen();
    ensureStudyMenuInPanel();

    clearTimeout(hideTimer);
    studyPanel.classList.remove("open");
    studyPanel.hidden = false;

    if (backdrop) backdrop.hidden = false;

    moreBtn?.setAttribute("aria-expanded", "true");
    document.documentElement.style.overflow = "hidden";

    requestAnimationFrame(() => {
      studyPanel.classList.add("open");
    });
  }

  function closeStudyMenu() {
    if (!studyPanel) return;

    studyPanel.classList.remove("open");
    moreBtn?.setAttribute("aria-expanded", "false");

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      ensureStudyMenuInSidebar();
      studyPanel.hidden = true;

      if (backdrop) backdrop.hidden = true;

      document.documentElement.style.overflow = "";
    }, 220);
  }

  moreBtn?.addEventListener("click", () => {
    studyPanel?.classList.contains("open") ? closeStudyMenu() : openStudyMenu();
  });

  studyPanelClose?.addEventListener("click", closeStudyMenu);
  backdrop?.addEventListener("click", closeStudyMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeStudyMenu();
  });

  studyPanel?.addEventListener("click", (event) => {
    const link = event.target.closest(".sb-btn");

    if (link) {
      closeStudyMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 1025px)").matches) {
      closeStudyMenu();
      ensureStudyMenuInSidebar();
    }
  });

  window.StudyMenuUI = {
    open: openStudyMenu,
    close: closeStudyMenu,
  };
})();
