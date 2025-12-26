// Slide-out menu
const menuToggle = document.querySelector(".menu-toggle");
const slideNav = document.querySelector(".slide-nav");
const slideNavBackdrop = document.querySelector(".slide-nav-backdrop");
const slideNavClose = document.querySelector(".slide-nav-close");

if (menuToggle && slideNav && slideNavBackdrop) {
  menuToggle.addEventListener("click", () => {
    const willOpen = !slideNav.classList.contains("active");

    slideNav.classList.toggle("active", willOpen);
    slideNavBackdrop.classList.toggle("active", willOpen);

    /* ✅ drives the morph */
    menuToggle.classList.toggle("is-open", willOpen);
  });
}

if (slideNavClose && slideNav && slideNavBackdrop) {
  slideNavClose.addEventListener("click", () => {
    slideNav.classList.remove("active");
    slideNavBackdrop.classList.remove("active");
    if (menuToggle) menuToggle.classList.remove("is-open");
  });
}

if (slideNavBackdrop && slideNav) {
  slideNavBackdrop.addEventListener("click", () => {
    slideNav.classList.remove("active");
    slideNavBackdrop.classList.remove("active");
    if (menuToggle) menuToggle.classList.remove("is-open");
  });
}

// Close menu on ESC (desktop/power users)
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!slideNav || !slideNavBackdrop) return;

  slideNav.classList.remove("active");
  slideNavBackdrop.classList.remove("active");
  if (menuToggle) menuToggle.classList.remove("is-open");
});

// Mobile/iPad header auto-hide (hide on scroll up, show on scroll down)
(() => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const mq = window.matchMedia("(max-width: 900px)");
  let lastY = window.scrollY;
  let hidden = false;

  const THRESHOLD = 8;

  function setHidden(nextHidden) {
    if (hidden === nextHidden) return;
    hidden = nextHidden;
    header.classList.toggle("is-hidden", nextHidden);
  }

  function onScroll() {
    // Desktop: always visible
    if (!mq.matches) {
      setHidden(false);
      lastY = window.scrollY;
      return;
    }

    // If slide menu is open, keep header visible
    if (slideNav && slideNav.classList.contains("active")) {
      setHidden(false);
      lastY = window.scrollY;
      return;
    }

    const y = window.scrollY;

    // Top of page: always visible
    if (y <= 2) {
      setHidden(false);
      lastY = y;
      return;
    }

    // User rule:
    // - scroll UP  => hide header
    // - scroll DOWN => show header
    if (y < lastY + THRESHOLD) {
      setHidden(true);
    } else if (y > lastY - THRESHOLD) {
      setHidden(false);
    }

    lastY = y;
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  // Re-check when crossing breakpoint
  if (mq.addEventListener) mq.addEventListener("change", onScroll);

  onScroll();
})();

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

    // 2) Otherwise, fallback to your internal billing page
    window.location.href = "billing.html";
    return;
  }

  planButtons.forEach((btn) => {
    btn.addEventListener("click", handlePlanClick);
  });
})();
