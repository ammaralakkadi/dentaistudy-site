(function () {
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const escapeHtml = (value) => {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  };
  window.$ = qs;
  window.$$ = qsa;
  window.dasEscapeHtml = escapeHtml;

  function iconize() {
    qsa("[data-icon]").forEach((el) => {
      const name = el.getAttribute("data-icon");
      if (window.DASIcons && window.DASIcons[name])
        el.innerHTML = window.DASIcons[name];
    });
  }

  function activeNav() {
    const path = location.pathname.replace(/\/$/, "") || "/partners";
    qsa("a[data-nav]").forEach((a) => {
      const href =
        new URL(a.getAttribute("href"), location.href).pathname.replace(
          /\/$/,
          "",
        ) || "/partners";
      if (href === path) a.classList.add("is-active");
    });
  }

  function mobileNav() {
    const toggle = qs("[data-mobile-toggle]");
    const panel = qs("[data-mobile-panel]");
    const backdrop = qs("[data-mobile-backdrop]");
    if (!toggle || !panel) return;

    const setOpen = (open) => {
      toggle.classList.toggle("is-open", open);
      panel.classList.toggle("active", open);
      panel.classList.toggle("is-open", open);
      if (backdrop) {
        backdrop.classList.toggle("active", open);
        backdrop.classList.toggle("is-open", open);
      }
      document.body.classList.toggle("mobile-menu-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };

    toggle.addEventListener("click", () =>
      setOpen(!panel.classList.contains("active")),
    );
    backdrop?.addEventListener("click", () => setOpen(false));
    qsa("a", panel).forEach((link) =>
      link.addEventListener("click", () => setOpen(false)),
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  }

  function setYear() {
    qsa("[data-year]").forEach((el) => {
      el.textContent = new Date().getFullYear();
    });
  }

  function toast(message, duration = 1600) {
    let el = qs(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }

    el.classList.remove("is-visible");
    el.textContent = message;
    el.getBoundingClientRect();

    requestAnimationFrame(() => {
      el.classList.add("is-visible");
    });

    clearTimeout(window.__dasToastTimer);
    window.__dasToastTimer = setTimeout(() => {
      el.classList.remove("is-visible");
    }, duration);
  }
  window.dasToast = toast;

  function accountMenu() {
    const menus = qsa("[data-account-menu]");
    if (!menus.length) return;
    document.addEventListener("click", (event) => {
      menus.forEach((menu) => {
        if (!menu.contains(event.target)) menu.removeAttribute("open");
      });
    });
  }

  function logoutButtons() {
    qsa("[data-logout]:not([data-logout-bound])").forEach((btn) => {
      btn.setAttribute("data-logout-bound", "true");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const target = btn.getAttribute("data-redirect") || "../login/";

        try {
          const client = window.DentAIStudyPartnerSupabase?.client;
          if (client) await client.auth.signOut();
        } catch (error) {
          console.error("Partner logout failed:", error);
        } finally {
          location.replace(target);
        }
      });
    });
  }

  async function syncPublicPartnerNavigation() {
    const headerActions = qs(".header-actions-public");
    const mobileLinks = qs("[data-mobile-panel] .slide-nav-links");
    const auth = window.DentAIStudyPartnerSupabase;

    if (!headerActions || !mobileLinks || !auth?.enabled) return;

    try {
      const user = await auth.getCurrentUser();
      if (!user) return;

      const profile = await auth.getPartnerProfile(user.id);
      if (!profile) return;

      headerActions.innerHTML = `
        <a class="btn btn-primary header-request" href="/partners/dashboard/">Dashboard</a>
        <a class="btn btn-outline header-login" href="/partners/settings/">Settings</a>
      `;

      mobileLinks.innerHTML = `
        <a data-nav href="/partners/program/">
          <span data-icon="program"></span><span>Program</span>
        </a>
        <div class="slide-nav-divider"></div>
        <a data-nav href="/partners/dashboard/">
          <span data-icon="dashboard"></span><span>Dashboard</span>
        </a>
        <a data-nav href="/partners/settings/">
          <span data-icon="settings"></span><span>Settings</span>
        </a>
        <button
          class="slide-nav-button"
          type="button"
          data-logout
          data-redirect="/partners/login/"
        >
          <span data-icon="logout"></span><span>Log out</span>
        </button>
      `;

      iconize();
      activeNav();
      logoutButtons();
    } catch (error) {
      console.error("Partner public navigation check failed:", error);
    }
  }

  function copyButtons() {
    const hasTouchClipboardUi =
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches;

    qsa("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const value = btn.getAttribute("data-copy");

        try {
          await navigator.clipboard.writeText(value);

          if (!hasTouchClipboardUi) {
            toast("Copied", 1200);
          }
        } catch (e) {
          const temp = document.createElement("input");
          temp.value = value;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          temp.remove();

          if (!hasTouchClipboardUi) {
            toast("Copied", 1200);
          }
        }
      });
    });
  }

  function enhanceSelects() {
    qsa("select.select:not([data-enhanced-select])").forEach((select) => {
      select.setAttribute("data-enhanced-select", "true");
      const wrap = document.createElement("div");
      wrap.className = "select-enhanced";
      if (select.getAttribute("style")) {
        wrap.setAttribute("style", select.getAttribute("style"));
        select.removeAttribute("style");
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "select-button";
      button.setAttribute("aria-haspopup", "listbox");
      button.setAttribute("aria-expanded", "false");
      const menu = document.createElement("div");
      menu.className = "select-menu";
      menu.setAttribute("role", "listbox");
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
      wrap.appendChild(button);
      wrap.appendChild(menu);

      const sync = () => {
        const selected =
          select.options[select.selectedIndex] || select.options[0];
        button.textContent = selected ? selected.textContent : "";
        menu.innerHTML = Array.from(select.options)
          .map(
            (option) =>
              `<button type="button" class="select-option${option.selected ? " is-selected" : ""}" data-value="${escapeHtml(option.value)}" role="option">${escapeHtml(option.textContent)}</button>`,
          )
          .join("");
        qsa(".select-option", menu).forEach((optionButton) => {
          optionButton.addEventListener("click", () => {
            select.value = optionButton.getAttribute("data-value");
            select.dispatchEvent(new Event("change", { bubbles: true }));
            close();
            sync();
          });
        });
      };
      const close = () => {
        wrap.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
      };
      const open = () => {
        qsa(".select-enhanced.is-open").forEach((el) => {
          if (el === wrap) return;
          el.classList.remove("is-open");
          const trigger = qs(".select-button", el);
          if (trigger) trigger.setAttribute("aria-expanded", "false");
        });

        const buttonRect = button.getBoundingClientRect();
        const menuHeight = Math.min(menu.scrollHeight, 230);
        const spaceBelow = window.innerHeight - buttonRect.bottom - 12;
        const spaceAbove = buttonRect.top - 12;
        const shouldDropUp =
          spaceBelow < menuHeight && spaceAbove > spaceBelow;

        wrap.classList.toggle("is-dropup", shouldDropUp);
        wrap.classList.add("is-open");
        button.setAttribute("aria-expanded", "true");
      };

      button.addEventListener("click", () =>
        wrap.classList.contains("is-open") ? close() : open(),
      );
      select.addEventListener("change", sync);
      new MutationObserver(sync).observe(select, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["selected"],
      });
      sync();
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".select-enhanced"))
      qsa(".select-enhanced.is-open").forEach((el) => {
        el.classList.remove("is-open");
        const trigger = qs(".select-button", el);
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape")
      qsa(".select-enhanced.is-open").forEach((el) => {
        el.classList.remove("is-open");
        const trigger = qs(".select-button", el);
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      });
  });
  document.addEventListener("reset", (event) => {
    setTimeout(
      () =>
        qsa("select.select", event.target).forEach((select) =>
          select.dispatchEvent(new Event("change", { bubbles: true })),
        ),
      0,
    );
  });

  document.addEventListener("DOMContentLoaded", () => {
    iconize();
    activeNav();
    mobileNav();
    accountMenu();
    logoutButtons();
    syncPublicPartnerNavigation();
    setYear();
    copyButtons();
    setTimeout(enhanceSelects, 0);
  });
})();
