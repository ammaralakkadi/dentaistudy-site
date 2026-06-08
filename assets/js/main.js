// Mobile menu panel
const menuToggle = document.querySelector(".menu-toggle");
const slideNav = document.querySelector(".slide-nav");
const slideNavBackdrop = document.querySelector(".slide-nav-backdrop");
const slideNavClose = document.querySelector(".slide-nav-close");

function setMobileMenu(open) {
  if (!menuToggle || !slideNav || !slideNavBackdrop) return;

  slideNav.classList.toggle("active", open);
  slideNavBackdrop.classList.toggle("active", open);
  menuToggle.classList.toggle("is-open", open);
  document.body.classList.toggle("mobile-menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

function closeMobileMenu() {
  setMobileMenu(false);
}

if (menuToggle && slideNav && slideNavBackdrop) {
  menuToggle.setAttribute("aria-expanded", "false");

  menuToggle.addEventListener("click", () => {
    setMobileMenu(!slideNav.classList.contains("active"));
  });

  slideNavBackdrop.addEventListener("click", closeMobileMenu);
  slideNavClose?.addEventListener("click", closeMobileMenu);

  slideNav.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) closeMobileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });

  window
    .matchMedia("(min-width: 901px)")
    .addEventListener("change", closeMobileMenu);
}

// Header intentionally scrolls with the page.

// FAQ toggle
document.querySelectorAll(".faq-item").forEach((item) => {
  const btn = item.querySelector(".faq-question");
  if (!btn) return;
  btn.addEventListener("click", () => {
    item.classList.toggle("open");
  });
});

// Copy buttons (for result cards)
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const card = btn.closest(".result-card");
    if (!card) return;

    const text = card.innerText.replace("Copy", "").trim();

    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.classList.add("copied");
      btn.textContent = "Copied";

      setTimeout(() => {
        btn.classList.remove("copied");
        btn.textContent = original;
      }, 1500);
    });
  });
});

// Cookie banner
(() => {
  const cookieBanner = document.querySelector(".cookie-banner");
  if (!cookieBanner) return;

  let hasAck = false;
  try {
    hasAck = !!localStorage.getItem("das_cookie_ack");
  } catch (err) {
    // If localStorage is blocked, just show the banner and don't crash
    hasAck = false;
  }

  if (!hasAck) {
    cookieBanner.style.display = "flex";
  }

  const cookieAccept = cookieBanner.querySelector(".cookie-accept");
  if (!cookieAccept) return;

  cookieAccept.addEventListener("click", () => {
    try {
      localStorage.setItem("das_cookie_ack", "1");
    } catch (err) {
      // Ignore storage errors
    }
    cookieBanner.style.display = "none";
  });
})();

// Pricing page – handle plan buttons
(() => {
  const planButtons = document.querySelectorAll("[data-pricing-plan]");
  if (!planButtons.length) return;

  /**
   * Provider-neutral checkout URL map.
   * Later, we can set these to:
   * - a Payoneer hosted checkout URL (if static)
   * - OR your internal checkout page (recommended): "checkout.html?plan=pro"
   */
  const checkoutUrls = {
    pro: null,
    pro_yearly: null,
  };

  async function handlePlanClick(event) {
    event.preventDefault();

    const btn = event.currentTarget;
    const plan = btn.getAttribute("data-pricing-plan") || "pro";
    const isFreePlan = plan === "free";

    // If Supabase client is missing, fallback to signup
    if (!window.dasSupabase || !window.dasSupabase.auth) {
      const url = new URL("signup.html", window.location.origin);
      url.searchParams.set("plan", plan);
      window.location.href = url.toString();
      return;
    }

    let sessionRes;
    try {
      sessionRes = await window.dasSupabase.auth.getSession();
    } catch (err) {
      const url = new URL("signup.html", window.location.origin);
      url.searchParams.set("plan", plan);
      window.location.href = url.toString();
      return;
    }

    const session = sessionRes && sessionRes.data && sessionRes.data.session;
    if (!session) {
      // Not logged in → go to signup with plan hint
      const url = new URL("signup.html", window.location.origin);
      url.searchParams.set("plan", plan);
      window.location.href = url.toString();
      return;
    }

    const user = session.user;
    const meta = (user && user.user_metadata) || {};
    const appMeta = (user && user.app_metadata) || {};
    const tier = appMeta.subscription_tier || meta.subscription_tier || "free";
    const isPaid = tier === "pro" || tier === "pro_yearly";

    // Free plan button: logged-in users go straight to Study builder
    if (isFreePlan) {
      window.location.href = "study.html";
      return;
    }

    // Already paid users → send to Settings (manage plan)
    if (isPaid) {
      window.location.href = "settings.html";
      return;
    }

    // Logged-in free user clicking Pro/Pro Yearly:
    // 1) If a direct checkout URL is configured, go there
    const directUrl = checkoutUrls[plan];
    if (typeof directUrl === "string" && directUrl.length > 0) {
      window.location.href = directUrl;
      return;
    }

    return; // Paddle handled by assets/js/paddle-checkout.js
  }

  planButtons.forEach((btn) => {
    btn.addEventListener("click", handlePlanClick);
  });
})();
