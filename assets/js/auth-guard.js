console.log("[auth-guard] LOADED FILE v3.1 on", window.location.href);

// DentAIstudy - Auth guard + header/menu UI + user metadata
// ---------------------------------------------------------------------
// Responsibilities
// ---------------------------------------------------------------------
// - Read Supabase session + fresh user (handles stale JWT / Google re-login)
// - Derive subscription_tier from app_metadata (then user_metadata)
// - Protect profile/settings pages (redirect to login if not authenticated)
// - Fill profile + settings UI with user information
// - Lock / unlock Study Preferences cards based on plan
// - Keep header + slide menu login/logout labels in sync
// - Hook into existing logout handler via [data-das-logout]
// - Handle avatar display + upload (profile photo)
//
// This file is written to be easy to read & debug. All important steps
// have a small comment above them so you can follow what is happening.

document.addEventListener("DOMContentLoaded", async () => {
  const path = window.location.pathname || "";
  const fileName = path.split("/").pop() || "index.html";
  const isProfile = fileName === "profile.html";
  const isSettings = fileName === "settings.html";
  const isProtected = isProfile || isSettings;

  try {
    // -------------------------------------------------------------
    // 0) Ensure Supabase client exists
    // -------------------------------------------------------------
    if (!window.dasSupabase || !window.dasSupabase.auth) {
      console.warn("[auth-guard] Supabase client not found on this page");
      updateAuthUI(null);
      if (isProtected) {
        window.location.href = "login.html";
      }
      return;
    }

    const supabase = window.dasSupabase;

    // -------------------------------------------------------------
    // 1) Get current session (may be slightly stale)
    // -------------------------------------------------------------
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      console.error("[auth-guard] getSession error:", sessionError);
    }
    const session = sessionData?.session || null;

    // Keep header + slide menu in sync with current auth state
    updateAuthUI(session);

    // -------------------------------------------------------------
    // 2) Get a FRESH user from Supabase
    //    This makes sure we see updated metadata after SQL changes,
    //    Google sign-in, etc.
    // -------------------------------------------------------------
    let freshUserData = null;
    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError) {
        console.warn("[auth-guard] getUser error:", userError);
      } else {
        freshUserData = userData;
      }
    } catch (e) {
      console.warn("[auth-guard] getUser threw:", e);
    }

    // -------------------------------------------------------------
    // 3) Choose which user object to trust
    //    Prefer fresh user → fall back to session.user
    // -------------------------------------------------------------
    const effectiveUser = freshUserData?.user || session?.user || null;

    console.log("[auth-guard] getSession result:", {
      fileName,
      sessionUser: session?.user,
      sessionUserMeta: session?.user?.user_metadata,
      sessionUserAppMeta: session?.user?.app_metadata,
    });

    console.log("[auth-guard] getUser result:", {
      fileName,
      freshUser: freshUserData?.user,
      freshUserMeta: freshUserData?.user?.user_metadata,
      freshUserAppMeta: freshUserData?.user?.app_metadata,
    });

    // If there is no user and this is a protected page → go to login
    if (!effectiveUser) {
      if (isProtected) {
        window.location.href = "login.html";
      }
      return;
    }

    // -------------------------------------------------------------
    // 4) Derive metadata + plan information
    // -------------------------------------------------------------
    const user = effectiveUser;
    const meta = user.user_metadata || {};
    const appMeta = user.app_metadata || {};

    const fullName =
      meta.full_name ||
      meta.name ||
      (user.email ? user.email.split("@")[0] : "") ||
      "";
    const email = user.email || "";
    const avatarUrl = meta.avatar_url || meta.picture || "";

    const defaultLevel = meta.default_level || "undergraduate";

    // Study activity / usage
    const packsCount =
      typeof meta.packs_count === "number" ? meta.packs_count : 0;
    const osceCount = typeof meta.osce_count === "number" ? meta.osce_count : 0;
    const flashcardCount =
      typeof meta.flashcard_count === "number" ? meta.flashcard_count : 0;
    const starredCount =
      typeof meta.starred_packs_count === "number"
        ? meta.starred_packs_count
        : typeof meta.starred_count === "number"
        ? meta.starred_count
        : 0;
    const lastActive = meta.last_active_at || null;
    const topMode = meta.top_used_category || null;

    // ⚡ Plan / subscription tier
    const subscriptionTier =
      appMeta.subscription_tier || meta.subscription_tier || "free";

    const isPaidPlan =
      subscriptionTier === "pro" || subscriptionTier === "pro_yearly";

    console.log("[auth-guard] derived plan from metadata:", {
      fileName,
      email,
      subscriptionTier,
      fromAppMeta: appMeta.subscription_tier,
      fromUserMeta: meta.subscription_tier,
      isPaidPlan,
    });

    // Favorites and preferred output styles (arrays of slugs)
    const favoriteSubjects = Array.isArray(meta.favorite_subjects)
      ? meta.favorite_subjects
      : [];
    const preferredOutputStyles = Array.isArray(meta.preferred_output_styles)
      ? meta.preferred_output_styles
      : [];

    // -------------------------------------------------------------
    // 5) Fill common workspace header name (top left)
    // -------------------------------------------------------------
    const workspaceNameEl = document.getElementById("das-user-name");
    if (workspaceNameEl && fullName) {
      workspaceNameEl.textContent = fullName;
    }

    // -------------------------------------------------------------
    // 6) Profile page: basic info + counters + preferences card
    // -------------------------------------------------------------
    if (isProfile) {
      // Basic identity
      const profileNameEl = document.getElementById("das-profile-name");
      const profileEmailEl = document.getElementById("das-profile-email");
      const profilePlanBadge = document.getElementById(
        "das-profile-plan-badge"
      );

      if (profileNameEl && fullName) {
        profileNameEl.textContent = fullName;
      }
      if (profileEmailEl && email) {
        profileEmailEl.textContent = email;
      }
      if (profilePlanBadge) {
        if (subscriptionTier === "pro_yearly") {
          profilePlanBadge.textContent = "DentAIstudy Pro yearly plan";
        } else if (subscriptionTier === "pro") {
          profilePlanBadge.textContent = "DentAIstudy Pro plan";
        } else {
          profilePlanBadge.textContent = "DentAIstudy free plan";
        }
      }

      // Study activity numbers
      const packsEl = document.getElementById("das-profile-packs-count");
      const osceEl = document.getElementById("das-profile-osce-count");
      const flashcardEl = document.getElementById(
        "das-profile-flashcard-count"
      );
      const topModeEl = document.getElementById("das-profile-top-mode");
      const lastActiveEl = document.getElementById("das-profile-last-active");
      const starredEl = document.getElementById("das-profile-starred-count");

      if (packsEl) packsEl.textContent = packsCount;
      if (osceEl) osceEl.textContent = osceCount;
      if (flashcardEl) flashcardEl.textContent = flashcardCount;
      if (starredEl) starredEl.textContent = starredCount;

      if (topModeEl) {
        let label = "";
        switch (topMode) {
          case "osce":
            label = "OSCE flows";
            break;
          case "viva":
            label = "Viva questions";
            break;
          case "theory":
            label = "Theory questions";
            break;
          case "packs":
            label = "Study packs";
            break;
          case "flashcard":
          case "flashcards":
            label = "Flashcard decks";
            break;
          default:
            label = "–";
        }
        topModeEl.textContent = label || "–";
      }

      if (lastActiveEl) {
        if (lastActive) {
          const d = new Date(lastActive);
          if (!Number.isNaN(d.getTime())) {
            lastActiveEl.textContent = d.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
          } else {
            lastActiveEl.textContent = "–";
          }
        } else {
          lastActiveEl.textContent = "–";
        }
      }

      // Default level text
      const defaultLevelEl = document.getElementById(
        "das-profile-default-level"
      );
      if (defaultLevelEl) {
        if (defaultLevel === "postgraduate") {
          defaultLevelEl.textContent = "Postgraduate";
        } else if (defaultLevel === "undergraduate") {
          defaultLevelEl.textContent = "Undergrad / Intern";
        } else {
          defaultLevelEl.textContent = defaultLevel;
        }
      }

      // Profile study preferences card (lock/ unlock)
      const profilePrefsCard = document.querySelector(
        "[data-das-profile-preferences-card]"
      );
      const profilePrefsNote = document.getElementById(
        "das-profile-preferences-note"
      );

      if (profilePrefsCard) {
        if (isPaidPlan) {
          profilePrefsCard.style.opacity = "1";
          profilePrefsCard.style.background = "#ffffff";
          profilePrefsCard.style.pointerEvents = "auto";
        } else {
          profilePrefsCard.style.opacity = "0.8";
          profilePrefsCard.style.background = "#f3f4f6";
          profilePrefsCard.style.pointerEvents = "none";
        }
      }
      if (profilePrefsNote) {
        profilePrefsNote.style.display = isPaidPlan ? "none" : "block";
      }
    }

    // -------------------------------------------------------------
    // 7) Settings page: plan label + preferences card
    // -------------------------------------------------------------
    if (isSettings) {
      const settingsPlanLabel = document.getElementById(
        "das-settings-plan-label"
      );
      const settingsPlanNote = document.getElementById(
        "das-settings-plan-note"
      );
      const settingsPlanUpgrade = document.getElementById(
        "das-settings-plan-upgrade-actions"
      );
      const settingsPlanManage = document.getElementById(
        "das-settings-plan-manage-actions"
      );

      if (settingsPlanLabel) {
        if (subscriptionTier === "pro_yearly") {
          settingsPlanLabel.textContent = "DentAIstudy Pro yearly plan";
        } else if (subscriptionTier === "pro") {
          settingsPlanLabel.textContent = "DentAIstudy Pro plan";
        } else {
          settingsPlanLabel.textContent = "DentAIstudy free plan";
        }
      }

      if (settingsPlanNote && settingsPlanUpgrade && settingsPlanManage) {
        if (isPaidPlan) {
          settingsPlanNote.textContent =
            "Your Pro access renews automatically until you cancel.";
          settingsPlanUpgrade.style.display = "none";
          settingsPlanManage.style.display = "flex";
        } else {
          settingsPlanNote.textContent =
            "Upgrade to Pro for higher daily limits and more focused OSCE / Viva study flows.";
          settingsPlanUpgrade.style.display = "flex";
          settingsPlanManage.style.display = "none";
        }
      }

      // Settings Study preferences card (lock / unlock)
      const settingsPrefsCard = document.querySelector(
        "[data-das-settings-preferences-card]"
      );
      const settingsPrefsNote = document.getElementById(
        "das-settings-preferences-note"
      );

      if (settingsPrefsCard) {
        if (isPaidPlan) {
          settingsPrefsCard.style.opacity = "1";
          settingsPrefsCard.style.background = "#ffffff";
          settingsPrefsCard.style.pointerEvents = "auto";
        } else {
          settingsPrefsCard.style.opacity = "0.8";
          settingsPrefsCard.style.background = "#f3f4f6";
          settingsPrefsCard.style.pointerEvents = "none";
        }
      }
      if (settingsPrefsNote) {
        settingsPrefsNote.style.display = isPaidPlan ? "none" : "block";
      }
    }

    // -------------------------------------------------------------
    // 8) Favorite subjects + preferred output style pills
    // -------------------------------------------------------------
    const subjectPills = document.querySelectorAll("[data-das-subject-pill]");
    if (subjectPills.length) {
      const topFavorites = favoriteSubjects.slice(0, 3);
      subjectPills.forEach((pill) => {
        const slug = pill.getAttribute("data-das-subject-pill");

        // base style: neutral pill
        pill.style.background = "#f3f4f6";
        pill.style.color = "#4b5563";

        // highlight top 3 favorites
        if (topFavorites.includes(slug)) {
          pill.style.background = "#f3f4ff";
          pill.style.color = "#4f46e5";
        }
      });
    }

    const outputPills = document.querySelectorAll("[data-das-output-pill]");
    if (outputPills.length) {
      outputPills.forEach((pill) => {
        const slug = pill.getAttribute("data-das-output-pill");

        // base style
        pill.style.background = "#f3f4f6";
        pill.style.color = "#4b5563";

        if (preferredOutputStyles.includes(slug)) {
          pill.style.background = "#eef2ff";
          pill.style.color = "#4338ca";
        }
      });
    }

    // -------------------------------------------------------------
    // 9) Avatar display (profile + sidebar)
    // -------------------------------------------------------------
    const profileAvatarEl = document.getElementById("das-profile-avatar-main");
    const sidebarAvatarImg = document.querySelector(".sidebar-avatar img");
    const avatarTargets = document.querySelectorAll("[data-das-avatar]");

    if (avatarUrl) {
      if (profileAvatarEl) profileAvatarEl.src = avatarUrl;
      if (sidebarAvatarImg) sidebarAvatarImg.src = avatarUrl;
      if (avatarTargets.length) {
        avatarTargets.forEach((el) => {
          el.src = avatarUrl;
        });
      }
    }
  } catch (err) {
    console.error("[auth-guard] Auth guard failed:", err);
    updateAuthUI(null);

    if (isProtected) {
      window.location.href = "login.html";
    }
  }
});

// ---------------------------------------------------------------------
// Toggle header + slide menu between Log in / Log out
// ---------------------------------------------------------------------
function updateAuthUI(session) {
  const isLoggedIn = !!session;

  const pathname = (window.location.pathname || "").toLowerCase();
  const isInBlogsFolder = pathname.includes("/blogs/");
  const loginHref = isInBlogsFolder ? "../login.html" : "login.html";

  // Desktop header buttons
  const headerLogin = document.querySelector(".header-right .header-login");
  const headerSignup = document.querySelector(".header-right .header-signup");

  // Mobile slide menu link
  const slideLoginLink = document.querySelector(".slide-nav .slide-login-link");

  // Header (desktop)
  if (headerLogin) {
    if (isLoggedIn) {
      headerLogin.textContent = "Log out";
      headerLogin.removeAttribute("href");
      headerLogin.setAttribute("data-das-logout", "true");
    } else {
      headerLogin.textContent = "Log in";
      headerLogin.setAttribute("href", loginHref);
      headerLogin.removeAttribute("data-das-logout");
    }
  }

  if (headerSignup) {
    if (isLoggedIn) {
      headerSignup.style.display = "none";
    } else {
      headerSignup.style.display = "";
      headerSignup.setAttribute("href", "signup.html");
    }
  }

  // Slide menu (mobile)
  if (slideLoginLink) {
    if (isLoggedIn) {
      slideLoginLink.textContent = "Log out";
      slideLoginLink.setAttribute("href", "#");
      slideLoginLink.setAttribute("data-das-logout", "true");
    } else {
      slideLoginLink.textContent = "Log in";
      slideLoginLink.setAttribute("href", loginHref);
      slideLoginLink.removeAttribute("data-das-logout");
    }
  }
}