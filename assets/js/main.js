// Slide-out menu
const menuToggle = document.querySelector(".menu-toggle");
const slideNav = document.querySelector(".slide-nav");
const slideNavBackdrop = document.querySelector(".slide-nav-backdrop");
const slideNavClose = document.querySelector(".slide-nav-close");

if (menuToggle && slideNav && slideNavBackdrop) {
  menuToggle.addEventListener("click", () => {
    slideNav.classList.add("active");
    slideNavBackdrop.classList.add("active");
  });
}

if (slideNavClose && slideNav && slideNavBackdrop) {
  slideNavClose.addEventListener("click", () => {
    slideNav.classList.remove("active");
    slideNavBackdrop.classList.remove("active");
  });
}

if (slideNavBackdrop && slideNav) {
  slideNavBackdrop.addEventListener("click", () => {
    slideNav.classList.remove("active");
    slideNavBackdrop.classList.remove("active");
  });
}

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

// Pricing page – handle Pro / Pro Yearly buttons
(() => {
  const planButtons = document.querySelectorAll("[data-pricing-plan]");
  if (!planButtons.length) return;

  // Optional: put your real Paddle checkout URLs here later
  const checkoutUrls = {
    pro: null, // e.g. "https://checkout.paddle.com/pro"
    pro_yearly: null, // e.g. "https://checkout.paddle.com/pro-yearly"
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
    const tier = meta.subscription_tier || "free";
    const isPaid = tier === "pro" || tier === "pro_yearly";

    // Free plan button: logged-in users go straight to Study builder
    if (isFreePlan) {
      window.location.href = "study.html";
      return;
    }

    if (isPaid) {
      // Already Pro → send to Settings (manage plan)
      window.location.href = "settings.html";
      return;
    }

    // Logged in Free → send to payment / billing
    const directUrl = checkoutUrls[plan];
    if (typeof directUrl === "string" && directUrl.length > 0) {
      window.location.href = directUrl;
    } else {
      // Temporary: your generic billing page until Paddle checkout is wired
      const email = user.email;

      // Dodo test product IDs (replace with your real ones)
      const dodoProducts = {
        pro: "pdt_e9mUw084cWnu0tz",
        pro_yearly: "pdt_YEARLY_ID_HERE",
      };

      const productId = dodoProducts[plan];

      const checkoutUrl =
        `https://test.checkout.dodopayments.com/buy/${productId}` +
        `?email=${encodeURIComponent(email)}` +
        `&redirect_url=${encodeURIComponent(
          window.location.origin + "/billing-success.html"
        )}`;

      window.location.href = checkoutUrl;
    }
  }

  planButtons.forEach((btn) => {
    btn.addEventListener("click", handlePlanClick);
  });
})();
