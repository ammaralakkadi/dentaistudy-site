// DentAIstudy - Auth guard + header/menu UI + user metadata
// - Protects profile/settings
// - Fills profile + settings with user info
// - Handles default level, email tips, delete account
// - Handles avatar display + upload
// - Shows study activity counters + favorites + preferred output style

document.addEventListener("DOMContentLoaded", async () => {
  const path = window.location.pathname || "";
  const fileName = path.split("/").pop() || "index.html";
  const isProfile = fileName === "profile.html";
  const isSettings = fileName === "settings.html";
  const isProtected = isProfile || isSettings;

  try {
    // If Supabase isn't loaded on this page, just show logged-out UI
    if (!window.dasSupabase || !window.dasSupabase.auth) {
      updateAuthUI(null);
      if (isProtected) {
        window.location.href = "login.html";
      }
      return;
    }

    const { data, error } = await window.dasSupabase.auth.getSession();
    if (error) {
      console.error("Session error:", error);
    }

    const session = data?.session || null;

    // Keep header + slide menu in sync
    updateAuthUI(session);

    // No active session → redirect protected pages
    if (!session) {
      if (isProtected) {
        window.location.href = "login.html";
      }
      return;
    }

    // We have a session → user + metadata
    const user = session.user;
    const meta = user?.user_metadata || {};

    const fullName = meta.full_name || "";
    const email = user?.email || "";
    const avatarUrl = meta.avatar_url || "";
    const defaultLevel = meta.default_level || "undergraduate";

    // Study usage counters from metadata
    const packsCount =
      typeof meta.packs_count === "number" ? meta.packs_count : 0;
    const osceCount =
      typeof meta.osce_count === "number" ? meta.osce_count : 0;
    const flashcardCount =
      typeof meta.flashcard_count === "number" ? meta.flashcard_count : 0;
    const starredCount =
      typeof meta.starred_count === "number" ? meta.starred_count : 0;
    const lastActive = meta.last_active_at || null;
    const topMode = meta.top_used_category || null;

    // Favorites and preferred output styles (arrays of slugs)
    const favoriteSubjects = Array.isArray(meta.favorite_subjects)
      ? meta.favorite_subjects
      : [];
    const preferredOutputStyles = Array.isArray(meta.preferred_output_styles)
      ? meta.preferred_output_styles
      : [];

    // -------------
    // Workspace header name (sidebar top)
    // -------------
    const workspaceNameEl = document.getElementById("das-user-name");
    if (workspaceNameEl && fullName) {
      workspaceNameEl.textContent = fullName;
    }

    // -------------
    // Profile page basic info
    // -------------
    const profileNameEl = document.getElementById("das-profile-name");
    const profileEmailEl = document.getElementById("das-profile-email");

    if (profileNameEl && fullName) {
      profileNameEl.textContent = fullName;
    }
    if (profileEmailEl && email) {
      profileEmailEl.textContent = email;
    }

    // Profile default level chip
    const profileDefaultLevelEl = document.getElementById(
      "das-profile-default-level"
    );
    if (profileDefaultLevelEl) {
      profileDefaultLevelEl.textContent =
        defaultLevel === "postgraduate" ? "Postgraduate" : "Undergraduate";
    }

    // Profile study activity counters
    const packsEl = document.getElementById("das-profile-packs-count");
    const osceEl = document.getElementById("das-profile-osce-count");
    const flashcardEl = document.getElementById("das-profile-flashcard-count");
    const topModeEl = document.getElementById("das-profile-top-mode");
    const lastActiveEl = document.getElementById("das-profile-last-active");
    const starredEl = document.getElementById("das-profile-starred-count");

    if (packsEl) {
      packsEl.textContent = packsCount;
    }
    if (osceEl) {
      osceEl.textContent = osceCount;
    }
    if (flashcardEl) {
      flashcardEl.textContent = flashcardCount;
    }
    if (starredEl) {
      starredEl.textContent = starredCount;
    }

    if (topModeEl) {
      const map = {
        osce: "OSCE flows",
        packs: "Study packs",
        flashcard: "Flashcard decks",
        theory: "Theory / notes",
        viva: "Viva prep",
      };
      topModeEl.textContent = topMode ? map[topMode] || "—" : "—";
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
          lastActiveEl.textContent = "—";
        }
      } else {
        lastActiveEl.textContent = "—";
      }
    }

    // Favorite subjects pills (top 3 favorites highlighted)
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

    // Preferred output style pills (top preferences highlighted)
    const outputPills = document.querySelectorAll("[data-das-output-pill]");
    if (outputPills.length) {
      const topOutputs = preferredOutputStyles.slice(0, 3);

      outputPills.forEach((pill) => {
        const slug = pill.getAttribute("data-das-output-pill");

        // base style: neutral pill
        pill.style.background = "#f3f4f6";
        pill.style.color = "#4b5563";

        // highlight preferred styles
        if (topOutputs.includes(slug)) {
          pill.style.background = "#ecfdf3";
          pill.style.color = "#15803d";
        }
      });
    }

    // -------------
    // Settings page fields
    // -------------
    const settingsFullNameInput = document.getElementById("settings-fullname");
    if (settingsFullNameInput && fullName) {
      settingsFullNameInput.value = fullName;
    }

    const settingsEmailInput = document.getElementById("settings-email");
    if (settingsEmailInput && email) {
      settingsEmailInput.value = email;
    }

    // Settings-specific logic
    if (isSettings) {
      // Default level select + Save button
      const defaultLevelSelect = document.getElementById(
        "settings-default-level"
      );
      const saveBtn = document.getElementById("settings-save-btn");
      const newPasswordInput = document.getElementById(
        "settings-new-password"
      );

      if (defaultLevelSelect) {
        defaultLevelSelect.value = defaultLevel;
      }

      if (defaultLevelSelect && saveBtn) {
        saveBtn.addEventListener("click", async () => {
          const selectedLevel = defaultLevelSelect.value || "undergraduate";
          const newPassword =
            newPasswordInput && newPasswordInput.value
              ? newPasswordInput.value.trim()
              : "";

          try {
            const currentMeta = user.user_metadata || {};
            const updatePayload = {
              data: {
                ...currentMeta,
                default_level: selectedLevel,
              },
            };

            // If user entered a new password, include it in the update
            if (newPassword) {
              updatePayload.password = newPassword;
            }

            const { error: updateError } =
              await window.dasSupabase.auth.updateUser(updatePayload);

            if (updateError) {
              console.error("Failed to update settings:", updateError);
            } else if (newPasswordInput) {
              // Clear the password field after successful update
              newPasswordInput.value = "";
            }
          } catch (e) {
            console.error("Settings update failed:", e);
          }
        });
      }

      // Email tips toggle
      const emailTipsCheckbox = document.getElementById("email-tips");
      if (emailTipsCheckbox) {
        const wantsTips = !!meta.email_tips;
        emailTipsCheckbox.checked = wantsTips;

        emailTipsCheckbox.addEventListener("change", async () => {
          try {
            const currentMeta = user.user_metadata || {};
            const { error: updateError } =
              await window.dasSupabase.auth.updateUser({
                data: {
                  ...currentMeta,
                  email_tips: emailTipsCheckbox.checked,
                },
              });

            if (updateError) {
              console.error(
                "Failed to update email tips setting:",
                updateError
              );
            }
          } catch (e) {
            console.error("Email tips toggle failed:", e);
          }
        });
      }

      // Soft delete account
      const deleteBtn = document.getElementById("delete-account-btn");
      const deleteStatus = document.getElementById("delete-account-status");

      if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
          const confirmed = window.confirm(
            "Are you sure you want to delete your DentAIstudy account? This will sign you out and mark your account as deleted."
          );
          if (!confirmed) return;

          if (deleteStatus) {
            deleteStatus.textContent = "Deleting account...";
          }

          try {
            const currentMeta = user.user_metadata || {};
            const { error: updateError } =
              await window.dasSupabase.auth.updateUser({
                data: {
                  ...currentMeta,
                  deleted_at: new Date().toISOString(),
                },
              });

            if (updateError) {
              console.error(
                "Failed to mark account as deleted:",
                updateError
              );
              if (deleteStatus) {
                deleteStatus.textContent =
                  "Delete failed. Please try again.";
              }
              return;
            }

            await window.dasSupabase.auth.signOut();

            if (deleteStatus) {
              deleteStatus.textContent =
                "Account deleted. Redirecting...";
            }

            window.location.href = "index.html";
          } catch (e) {
            console.error("Delete account failed:", e);
            if (deleteStatus) {
              deleteStatus.textContent =
                "Delete failed. Please try again.";
            }
          }
        });
      }
    }

    // -------------
    // Avatar display (profile + sidebar)
    // -------------
    const profileAvatarEl = document.getElementById("das-profile-avatar-main");
    const sidebarAvatarEl = document.querySelector(".sidebar-avatar img");
    const avatarTargets = document.querySelectorAll("[data-das-avatar]");

    if (avatarUrl) {
      if (profileAvatarEl) {
        profileAvatarEl.src = avatarUrl;
      }
      if (sidebarAvatarEl) {
        sidebarAvatarEl.src = avatarUrl;
      }
      if (avatarTargets.length) {
        avatarTargets.forEach((el) => {
          el.src = avatarUrl;
        });
      }
    }

    // -------------
    // Avatar upload on profile page
    // -------------
    const avatarUploadBtn = document.getElementById("avatar-upload-btn");
    const avatarFileInput = document.getElementById("avatar-input");
    const avatarStatusEl = document.getElementById("avatar-status");

    if (avatarUploadBtn && avatarFileInput) {
      avatarUploadBtn.addEventListener("click", () => {
        avatarFileInput.click();
      });

      avatarFileInput.addEventListener("change", async () => {
        if (!avatarFileInput.files || avatarFileInput.files.length === 0) {
          return;
        }

        const file = avatarFileInput.files[0];

        if (avatarStatusEl) {
          avatarStatusEl.textContent = "Uploading photo...";
        }

        try {
          if (typeof uploadProfilePicture !== "function") {
            console.error("uploadProfilePicture helper is missing");
            if (avatarStatusEl) {
              avatarStatusEl.textContent = "Upload helper missing.";
            }
            return;
          }

          const publicUrl = await uploadProfilePicture(user.id, file);
          if (!publicUrl) {
            if (avatarStatusEl) {
              avatarStatusEl.textContent =
                "Upload failed. Please try again.";
            }
            return;
          }

          const { error: updateError } =
            await window.dasSupabase.auth.updateUser({
              data: {
                ...(user.user_metadata || {}),
                avatar_url: publicUrl,
              },
            });

          if (updateError) {
            console.error("Error saving avatar URL:", updateError);
            if (avatarStatusEl) {
              avatarStatusEl.textContent =
                "Save failed. Please try again.";
            }
            return;
          }

          if (profileAvatarEl) {
            profileAvatarEl.src = publicUrl;
          }
          if (sidebarAvatarEl) {
            sidebarAvatarEl.src = publicUrl;
          }
          if (avatarTargets.length) {
            avatarTargets.forEach((el) => {
              el.src = publicUrl;
            });
          }

          if (avatarStatusEl) {
            avatarStatusEl.textContent = "Photo updated.";
          }
        } catch (e) {
          console.error("Avatar upload error:", e);
          if (avatarStatusEl) {
            avatarStatusEl.textContent = "Something went wrong.";
          }
        } finally {
          avatarFileInput.value = "";
        }
      });
    }
  } catch (err) {
    console.error("Auth guard failed:", err);

    updateAuthUI(null);

    if (isProtected) {
      window.location.href = "login.html";
    }
  }
});

// Toggle header + slide menu between Log in / Log out
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
    headerSignup.style.display = isLoggedIn ? "none" : "";
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
