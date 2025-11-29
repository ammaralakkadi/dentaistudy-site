// assets/js/study-builder.js
// Clean SaaS version — DentAIstudy Study Builder (AI generation)

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("study-form");
  const clearBtn = document.getElementById("study-clear");
  const answerEl = document.getElementById("study-answer");
  const placeholderEl = document.querySelector(".study-answer-placeholder");
  const copyBtn = document.getElementById("copy-answer");
  const topicInput = document.getElementById("study-topic");
  const subjectSelect = document.getElementById("study-subject");

  // Your Supabase Edge Function endpoint
  const AI_ENDPOINT =
    "https://hlvkbqpesiqjxbastxux.functions.supabase.co/ai-generate";

  function updateCopyVisibility() {
    if (!copyBtn || !answerEl) return;
    const text = (answerEl.textContent || "").trim();
    if (!text) copyBtn.classList.add("is-hidden");
    else copyBtn.classList.remove("is-hidden");
  }

  function getSelectedMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : "General overview";
  }

  // -----------------------------
  // Anonymous (visitor) limit: 2/day (localStorage)
  // -----------------------------
  function getAnonUsage() {
    try {
      const raw = localStorage.getItem("das_ai_anon_usage");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setAnonUsage(obj) {
    try {
      localStorage.setItem("das_ai_anon_usage", JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  function enforceAnonLimitOrThrow() {
    const today = new Date().toISOString().slice(0, 10);
    const data = getAnonUsage() || {};
    let usedToday =
      typeof data.usedToday === "number" ? data.usedToday : 0;
    let lastReset = data.date || null;

    if (lastReset !== today) {
      usedToday = 0;
      lastReset = today;
    }

    const limit = 2;
    if (usedToday >= limit) {
      const err = new Error("Anon limit reached");
      // @ts-ignore
      err.code = "ANON_LIMIT";
      throw err;
    }

    setAnonUsage({ date: today, usedToday: usedToday + 1 });
  }

  // -----------------------------
  // Submit Handler — AI Generation
  // -----------------------------
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!form || !answerEl || !placeholderEl) return;

    const topic = topicInput ? topicInput.value.trim() : "";
    if (!topic) {
      alert("Please enter a topic or case.");
      return;
    }

    const mode = getSelectedMode();
    const subject = subjectSelect ? subjectSelect.value : "General dentistry";

    // Reset UI
    answerEl.textContent = "";
    placeholderEl.style.display = "block";
    placeholderEl.textContent = "Generating exam-focused answer...";
    updateCopyVisibility();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Generating...";
    }

    // Logged-in session token (if available)
    let accessToken = null;
    try {
      if (window.dasSupabase && window.dasSupabase.auth) {
        const { data } = await window.dasSupabase.auth.getSession();
        accessToken = data?.session?.access_token || null;
      }
    } catch {
      // ignore
    }

    // Anonymous limit
    try {
      if (!accessToken) {
        enforceAnonLimitOrThrow();
      }
    } catch (err) {
      // @ts-ignore
      if (err.code === "ANON_LIMIT") {
        placeholderEl.textContent =
          "You reached today's free AI limit. Create a free account or log in to continue.";
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Generate";
        }
        return;
      }
    }

    // -----------------------------
    // Call Supabase Edge Function
    // -----------------------------
    try {
      const response = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken
            ? { Authorization: "Bearer " + accessToken }
            : {}),
        },
        body: JSON.stringify({
          topic,
          mode,
          subject,
        }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        // ignore JSON parse errors
      }

      if (!response.ok || !data || data.error) {
        if (data?.error === "LIMIT_REACHED") {
          placeholderEl.textContent =
            "You reached today's AI limit. Try again tomorrow.";
        } else if (data?.error === "TOPIC_REQUIRED") {
          placeholderEl.textContent = "Please enter a topic.";
        } else {
          placeholderEl.textContent =
            "Something went wrong. Please try again.";
        }
        answerEl.textContent = "";
      } else {
        // SUCCESS
        placeholderEl.style.display = "none";
        answerEl.textContent = data.content || "No answer returned.";
        updateCopyVisibility();

        // Update study preference counters (best-effort)
        if (window.dasStudyPrefs?.increment) {
          let key = "theory";
          if (mode === "OSCE flow") key = "osce";
          else if (mode === "Flashcard deck") key = "flashcard";
          else if (mode === "MCQs") key = "theory";
          else if (mode === "High-yield notes") key = "theory";
          window.dasStudyPrefs.increment(key);
        }
      }
    } catch (err) {
      placeholderEl.textContent =
        "Error contacting AI server. Try again.";
      answerEl.textContent = "";
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Generate";
      }
      updateCopyVisibility();
    }
  });

  // -----------------------------
  // Clear button
  // -----------------------------
  clearBtn.addEventListener("click", function () {
    if (topicInput) topicInput.value = "";
    answerEl.textContent = "";
    placeholderEl.style.display = "block";
    placeholderEl.textContent =
      "Your AI-powered answer will appear here once you generate it.";
    updateCopyVisibility();
  });

  // -----------------------------
  // Copy button
  // -----------------------------
  copyBtn.addEventListener("click", function () {
    if (!answerEl) return;
    const text = (answerEl.textContent || "").trim();
    if (!text) return;

    // Try modern clipboard API, no alerts
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
        },
        () => {
          // silently fail – user can still select manually
        }
      );
    } else {
      // Fallback: execCommand
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.style.position = "fixed";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      document.body.removeChild(temp);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
    }
  });

  updateCopyVisibility();
});