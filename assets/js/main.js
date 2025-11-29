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

// Profile image preview (UI only)
const avatarInput = document.getElementById("avatar-input");
const avatarImg = document.getElementById("das-profile-avatar-main");

if (avatarInput && avatarImg) {
  avatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      avatarImg.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
