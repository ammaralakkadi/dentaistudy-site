// DentAIstudy – Profile picture upload (Supabase storage + user_metadata update)

document.addEventListener("DOMContentLoaded", () => {
  const avatarInput = document.getElementById("avatar-input");
  const avatarImg = document.getElementById("das-profile-avatar-main");
  const avatarUploadBtn = document.getElementById("avatar-upload-btn");
  const avatarStatusEl = document.getElementById("avatar-status");

  if (!avatarInput || !avatarImg || !window.dasSupabase) return;

  const supabase = window.dasSupabase;

  // Clicking the button should open the file picker
  if (avatarUploadBtn) {
    avatarUploadBtn.addEventListener("click", () => {
      avatarInput.click();
    });
  }

  avatarInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // 1) Immediate UI preview
    try {
      avatarImg.src = URL.createObjectURL(file);
    } catch (err) {
      console.warn("[profile-upload] preview failed", err);
    }

    if (avatarStatusEl) {
      avatarStatusEl.textContent = "Uploading photo...";
    }

    try {
      // 2) Get current user
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes || !userRes.user) {
        console.error("[profile-upload] cannot get user", userErr);
        if (avatarStatusEl) {
          avatarStatusEl.textContent = "Could not get user.";
        }
        return;
      }

      const user = userRes.user;

      // 3) Build file path
      const ext = file.name.split(".").pop();
      const fileName = `${user.id}-${Date.now()}.${ext}`;
      const filePath = `${user.id}/${fileName}`;

      // 4) Upload to "profile-pictures" bucket
      const { error: uploadErr } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, file, {
          upsert: true,
          cacheControl: "3600",
        });

      if (uploadErr) {
        console.error("[profile-upload] upload failed", uploadErr);
        if (avatarStatusEl) {
          avatarStatusEl.textContent = "Upload failed. Try again.";
        }
        return;
      }

      // 5) Get public URL
      const { data: urlData } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath);

      const publicUrl = urlData && urlData.publicUrl;
      if (!publicUrl) {
        console.error("[profile-upload] missing public URL");
        if (avatarStatusEl) {
          avatarStatusEl.textContent = "Could not read image URL.";
        }
        return;
      }

      // 6) Save into user_metadata.avatar_url
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });

      if (metaErr) {
        console.error("[profile-upload] metadata update failed", metaErr);
        if (avatarStatusEl) {
          avatarStatusEl.textContent = "Could not save profile photo.";
        }
        return;
      }

      if (avatarStatusEl) {
        avatarStatusEl.textContent = "Photo updated.";
      }

      console.log("[profile-upload] avatar updated:", publicUrl);
    } catch (err) {
      console.error("[profile-upload] unexpected error", err);
      if (avatarStatusEl) {
        avatarStatusEl.textContent = "Something went wrong.";
      }
    } finally {
      // Clear input so you can upload the same file again if needed
      avatarInput.value = "";
    }
  });
});