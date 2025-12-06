// assets/js/study-builder.js
// DentAIstudy Study Builder (AI generation) — polished + resilient

document.addEventListener("DOMContentLoaded", () => {
  // -----------------------------
  // DOM ELEMENTS
  // -----------------------------
  const form = document.getElementById("study-form");
  const clearBtn = document.getElementById("study-clear");
  const answerEl = document.getElementById("study-answer");
  const placeholderEl = document.querySelector(".study-answer-placeholder");
  const copyBtn = document.getElementById("copy-answer");
  const topicInput = document.getElementById("study-topic");
  const subjectSelect = document.getElementById("study-subject");
  const submitBtn =
    form && (form.querySelector('button[type="submit"]') ||
      document.getElementById("study-generate"));

  console.log("[study-builder] init", {
    hasForm: !!form,
    hasTopicInput: !!topicInput,
    hasAnswerEl: !!answerEl,
    hasPlaceholderEl: !!placeholderEl,
  });

  // If the form is not present, silently stop (prevents JS errors on other pages)
  if (!form) {
    console.warn("[study-builder] No #study-form found. Skipping init.");
    return;
  }

  // -----------------------------
  // CONSTANTS
  // -----------------------------
  const AI_ENDPOINT =
    "https://hlvkbqpesiqjxbastxux.functions.supabase.co/ai-generate"; // Supabase Edge Function URL
  const ANON_USAGE_KEY = "das_ai_anon_usage";
  const ANON_DAILY_LIMIT = 2; // guest sessions per day (client-side guard)

  // -----------------------------
  // UI HELPERS
  // -----------------------------
  function setLoading(isLoading) {
    if (placeholderEl) {
      placeholderEl.classList.toggle("is-loading", isLoading);
      if (isLoading) {
        placeholderEl.style.display = "block";
        placeholderEl.textContent = "Generating with DentAIstudy AI...";
      }
    }

    if (submitBtn) {
      submitBtn.disabled = isLoading;
      submitBtn.textContent = isLoading ? "Generating..." : "Generate";
    }

    if (clearBtn) clearBtn.disabled = isLoading;
    if (copyBtn) copyBtn.disabled = isLoading;
  }

  function showPlaceholder(message) {
    if (!placeholderEl) {
      // fallback if there is no placeholder element:
      if (answerEl) {
        answerEl.textContent =
          typeof message === "string" ? message : "";
      }
      return;
    }

    placeholderEl.style.display = "block";
    placeholderEl.textContent =
      typeof message === "string" && message.trim().length > 0
        ? message
        : "Your AI-powered answer will appear here once you generate it.";

    if (answerEl) {
      answerEl.textContent = "";
      answerEl.innerHTML = "";
    }
  }

  function hidePlaceholder() {
    if (!placeholderEl) return;
    placeholderEl.style.display = "none";
  }

  function renderAnswer(content) {
    if (!answerEl) return;
    const safe = (content || "").toString();

    // Escape basic HTML
    let html = safe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Convert **bold** style
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Line breaks
    html = html.replace(/\r\n/g, "\n");
    html = html.replace(/\n/g, "<br>");

    answerEl.innerHTML = html;
  }

  function updateCopyVisibility() {
    if (!copyBtn || !answerEl) return;
    const hasContent =
      answerEl.textContent && answerEl.textContent.trim().length > 0;
    copyBtn.style.display = hasContent ? "inline-flex" : "none";
  }

  function getSelectedMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : "General overview";
  }

  function getSelectedSubject() {
    if (!subjectSelect) return "";
    return subjectSelect.value || "";
  }

  // -----------------------------
  // ANONYMOUS (GUEST) LIMIT — LOCALSTORAGE
  // -----------------------------
  function getAnonUsage() {
    try {
      const raw = localStorage.getItem(ANON_USAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setAnonUsage(obj) {
    try {
      localStorage.setItem(ANON_USAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  function enforceAnonLimitOrThrow() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const data = getAnonUsage() || {};
    let usedToday =
      typeof data.usedToday === "number" ? data.usedToday : 0;
    const lastDate = typeof data.date === "string" ? data.date : null;

    if (lastDate !== today) {
      usedToday = 0;
    }

    if (usedToday >= ANON_DAILY_LIMIT) {
      const error = new Error("Guest limit reached");
      // @ts-ignore
      error.code = "ANON_LIMIT";
      throw error;
    }

    usedToday += 1;
    setAnonUsage({
      date: today,
      usedToday,
    });
  }

  // -----------------------------
  // SUPABASE SESSION HELPERS
  // -----------------------------
  async function getAccessToken() {
    try {
      if (window.dasSupabase && window.dasSupabase.auth) {
        const { data } = await window.dasSupabase.auth.getSession();
        return data?.session?.access_token || null;
      }
    } catch (err) {
      console.warn("[study-builder] Failed to get Supabase session", err);
    }
    return null;
  }

  function buildHeaders(accessToken) {
    const headers = {
      "Content-Type": "application/json",
    };

    // apikey is always the anon key (public)
    if (typeof SUPABASE_ANON_KEY === "string") {
      // @ts-ignore
      headers["apikey"] = SUPABASE_ANON_KEY;
    }

    // Only send Authorization when we have a real user session
    if (accessToken) {
      // @ts-ignore
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    return headers;
  }

  // -----------------------------
  // MAIN SUBMIT HANDLER
  // -----------------------------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const topic = topicInput ? topicInput.value.trim() : "";
    const mode = getSelectedMode();
    const subject = getSelectedSubject();

    if (!topic) {
      showPlaceholder("Please enter a topic or question first.");
      if (topicInput) topicInput.focus();
      return;
    }

    // Reset UI
    setLoading(true);
    showPlaceholder("Preparing your AI answer...");
    updateCopyVisibility();

    let accessToken = null;

    try {
      accessToken = await getAccessToken();

      // Guest-only limit (no Supabase session)
      if (!accessToken) {
        enforceAnonLimitOrThrow();
      }
    } catch (err) {
      // Anonymous soft limit reached
      // @ts-ignore
      if (err && err.code === "ANON_LIMIT") {
        setLoading(false);
        showPlaceholder(
          "You've hit today's guest limit. Create a free DentAIstudy account to unlock more AI sessions each day."
        );
        updateCopyVisibility();
        return;
      }
    }

    try {
      const headers = buildHeaders(accessToken);

      console.log("[study-builder] Calling ai-generate", {
        isLoggedIn: !!accessToken,
        hasAnonKey: typeof SUPABASE_ANON_KEY === "string",
      });

      const response = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers,
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
        data = null;
      }

      console.log("[study-builder] ai-generate status", response.status, data);

      // Success
      if (response.ok && data && typeof data.content === "string") {
        hidePlaceholder();
        renderAnswer(data.content || "No answer returned.");
        updateCopyVisibility();
        return;
      }

      // Handle rate/usage limit from server
      if (response.status === 429 && data && data.error === "LIMIT_REACHED") {
        const tier = data.tier || "free";

        if (tier === "pro" || tier === "pro_yearly") {
          showPlaceholder(
            "You've reached today's AI limit on your current Pro plan. Your limit will reset tomorrow."
          );
        } else if (tier === "free") {
          showPlaceholder(
            "You've reached today's AI limit on the free plan. Upgrade to Pro to unlock more AI sessions."
          );
        } else {
          showPlaceholder(
            "You've reached today's AI usage limit. Please try again tomorrow."
          );
        }

        updateCopyVisibility();
        return;
      }

      // Other error codes (400/500 etc.)
      if (data && typeof data.message === "string") {
        showPlaceholder(`Something went wrong: ${data.message}`);
      } else {
        showPlaceholder("Something went wrong. Please try again.");
      }
      updateCopyVisibility();
    } catch (err) {
      console.error("[study-builder] Error calling ai-generate", err);
      showPlaceholder("Error contacting AI server. Try again.");
      updateCopyVisibility();
    } finally {
      setLoading(false);
    }
  });

  // -----------------------------
  // CLEAR BUTTON
  // -----------------------------
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (topicInput) topicInput.value = "";
      if (answerEl) {
        answerEl.textContent = "";
        answerEl.innerHTML = "";
      }
      showPlaceholder(
        "Your AI-powered answer will appear here once you generate it."
      );
      updateCopyVisibility();
    });
  }

  // -----------------------------
  // COPY BUTTON
  // -----------------------------
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      if (!answerEl || !answerEl.textContent) return;
      const textToCopy = answerEl.innerText || answerEl.textContent;

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          // Fallback for older browsers
          const temp = document.createElement("textarea");
          temp.value = textToCopy;
          temp.style.position = "fixed";
          temp.style.opacity = "0";
          document.body.appendChild(temp);
          temp.focus();
          temp.select();
          document.execCommand("copy");
          document.body.removeChild(temp);
        }
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1200);
      } catch (err) {
        console.warn("[study-builder] Copy failed", err);
      }
    });
  }

  // Initial state
  updateCopyVisibility();
  showPlaceholder("Your AI-powered answer will appear here once you generate it.");
});