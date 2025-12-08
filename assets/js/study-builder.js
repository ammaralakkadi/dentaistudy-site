// assets/js/study-builder.js
// DentAIstudy Study Builder (AI generation) — premium + tier-aware

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
  const addFilesBtn = document.getElementById("study-add-file");
  const fileInput = document.getElementById("study-file-input");
  const fileSummary = document.getElementById("study-file-summary");

  // Base Pro-tier limits
  const MAX_FILE_COUNT = 5;
  const MAX_FILE_SIZE_MB = 10;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  // Effective per-tier limits (resolved in initUserTier)
  let effectiveMaxFileCount = 0; // guest / unknown → no files
  let effectiveMaxFileSizeMb = 3; // conservative default
  let effectiveMaxFileSizeBytes = effectiveMaxFileSizeMb * 1024 * 1024;

  let attachedFiles = [];

  const ACCESS_TIER_UNKNOWN = "unknown";
  let userTier = ACCESS_TIER_UNKNOWN; // "guest" | "free" | "pro" | "pro_yearly"
  let isProTier = false;

  console.log("[study-builder] init v2", {
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

  const submitBtn =
    form.querySelector('button[type="submit"]') ||
    document.getElementById("study-generate");

  // -----------------------------
  // CONSTANTS
  // -----------------------------
  const AI_ENDPOINT =
    "https://hlvkbqpesiqjxbastxux.functions.supabase.co/ai-generate"; // Supabase Edge Function URL

  // Guest (anonymous) AI usage — per day
  const ANON_USAGE_KEY = "das_ai_anon_usage";
  const ANON_DAILY_LIMIT = 2; // guest sessions per day (client-side guard)

  // Free-tier file usage — per day (logged-in free users)
  const FREE_FILE_USAGE_KEY = "das_free_file_usage";
  const FREE_FILE_DAILY_LIMIT = 3; // max PDFs per day on free tier

  // -----------------------------
  // PDF FILE TEXT EXTRACTION (pdf.js)
  // -----------------------------
  const PDFJS_WORKER_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // Base Pro-tier extraction limits
  const MAX_PAGES_PER_FILE = 5;
  const MAX_FILE_TEXT_LENGTH = 12000; // characters across all PDFs

  // Effective per-tier extraction limits
  let effectiveMaxPagesPerFile = 2; // free default
  let effectiveMaxFileTextLength = 6000;

  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  }

  // -----------------------------
  // USER TIER RESOLUTION (Pro gating)
  // -----------------------------
  async function initUserTier() {
    try {
      if (!window.dasSupabase || !window.dasSupabase.auth) {
        userTier = "guest";
        isProTier = false;
      } else {
        const { data, error } = await window.dasSupabase.auth.getSession();
        if (error || !data || !data.session) {
          userTier = "guest";
          isProTier = false;
        } else {
          const user = data.session.user;
          const meta = user?.user_metadata || {};
          const tier = meta.subscription_tier || "free";

          userTier = tier;
          isProTier = tier === "pro" || tier === "pro_yearly";
        }
      }
    } catch (err) {
      console.warn("[study-builder] initUserTier error", err);
      userTier = "guest";
      isProTier = false;
    }

    // Compute effective limits based on tier
    if (isProTier) {
      // Pro / Pro yearly → full power
      effectiveMaxFileCount = MAX_FILE_COUNT;
      effectiveMaxFileSizeMb = MAX_FILE_SIZE_MB;
      effectiveMaxFileSizeBytes = MAX_FILE_SIZE_BYTES;
      effectiveMaxPagesPerFile = MAX_PAGES_PER_FILE;
      effectiveMaxFileTextLength = MAX_FILE_TEXT_LENGTH;
    } else if (userTier === "free") {
      // Logged-in free users: 1 small PDF, limited pages/text
      effectiveMaxFileCount = 1;
      effectiveMaxFileSizeMb = 3;
      effectiveMaxFileSizeBytes = effectiveMaxFileSizeMb * 1024 * 1024;
      effectiveMaxPagesPerFile = Math.min(2, MAX_PAGES_PER_FILE);
      effectiveMaxFileTextLength = Math.min(6000, MAX_FILE_TEXT_LENGTH);
    } else {
      // Guests / unknown: no file uploads
      effectiveMaxFileCount = 0;
      effectiveMaxFileSizeMb = 0;
      effectiveMaxFileSizeBytes = 0;
      effectiveMaxPagesPerFile = 0;
      effectiveMaxFileTextLength = 0;
    }

    console.log("[study-builder] tier resolved", {
      userTier,
      isProTier,
      effectiveMaxFileCount,
      effectiveMaxFileSizeMb,
      effectiveMaxPagesPerFile,
    });
  }

  // Kick off tier resolution (no need to await for the initial UI)
  initUserTier();

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
      if (answerEl) {
        answerEl.textContent = typeof message === "string" ? message : "";
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

    const raw = (content || "").toString().replace(/\r\n/g, "\n");

    function escapeHtml(str) {
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    const lines = raw.split("\n");
    const htmlLines = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // ---------- Markdown table detection ----------
      if (
        /^\s*\|.+\|\s*$/.test(line) &&
        i + 1 < lines.length &&
        /^\s*\|\s*-+/.test(lines[i + 1])
      ) {
        const headerLine = line.trim();
        const headerCells = headerLine
          .slice(1, -1)
          .split("|")
          .map((c) => {
            let h = escapeHtml(c.trim());
            h = h.replace(/\*\*\s*(.+?)\s*\*\*/g, "<strong>$1</strong>");
            return h;
          });

        i += 2; // skip header + separator row

        const bodyRows = [];
        while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
          const rowLine = lines[i].trim();
          const rowCells = rowLine
            .slice(1, -1)
            .split("|")
            .map((c) => {
              let cell = escapeHtml(c.trim());
              cell = cell.replace(
                /\*\*\s*(.+?)\s*\*\*/g,
                "<strong>$1</strong>"
              );
              return cell;
            });
          bodyRows.push(rowCells);
          i++;
        }

        let tableHtml = '<table class="study-ai-table"><thead><tr>';
        headerCells.forEach((h) => {
          tableHtml += `<th>${h}</th>`;
        });
        tableHtml += "</tr></thead><tbody>";

        bodyRows.forEach((row) => {
          tableHtml += "<tr>";
          row.forEach((cell) => {
            tableHtml += `<td>${cell}</td>`;
          });
          tableHtml += "</tr>";
        });

        tableHtml += "</tbody></table>";
        htmlLines.push(tableHtml);
        continue;
      }

      // ---------- Normal line ----------
      let htmlLine = escapeHtml(line);

      // Horizontal rule: ---  -> nice separator
      if (/^\s*-{3,}\s*$/.test(line)) {
        htmlLines.push('<hr class="study-ai-separator">');
        i++;
        continue;
      }

      // Headings: #, ##, ###, #### ... -> bold line
      htmlLine = htmlLine.replace(/^\s*#{1,6}\s+(.*)/, "<strong>$1</strong>");

      // Bold with optional spaces: ** title ** -> <strong>title</strong>
      htmlLine = htmlLine.replace(
        /\*\*\s*(.+?)\s*\*\*/g,
        "<strong>$1</strong>"
      );

      htmlLines.push(htmlLine);
      i++;
    }

    const finalHtml = htmlLines.join("<br>");
    answerEl.innerHTML = finalHtml;

    // Fade-in animation for new answer
    answerEl.classList.remove("is-fade-in");
    // force reflow so animation restarts each time
    // eslint-disable-next-line no-unused-expressions
    answerEl.offsetWidth;
    answerEl.classList.add("is-fade-in");
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
  // STUDY USAGE TRACKING (Profile activity)
  // -----------------------------
  function trackStudyUsage(modeLabel) {
    if (!window.dasStudyPrefs || !window.dasStudyPrefs.increment) return;

    let category = "theory"; // default
    const label = (modeLabel || "").toLowerCase();

    if (label.includes("osce")) {
      category = "osce";
    } else if (label.includes("flashcard")) {
      category = "flashcard";
    } else if (label.includes("mcq")) {
      category = "packs";
    } else if (label.includes("viva")) {
      category = "viva";
    }

    try {
      window.dasStudyPrefs.increment(category);
    } catch (err) {
      console.warn("[study-builder] Failed to increment study prefs", err);
    }
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
    let usedToday = typeof data.usedToday === "number" ? data.usedToday : 0;
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

  // Free-tier file usage (per-day) for logged-in "free" users
  function getFreeFileUsage() {
    try {
      const raw = localStorage.getItem(FREE_FILE_USAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setFreeFileUsage(obj) {
    try {
      localStorage.setItem(FREE_FILE_USAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
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

    // Authorization:
    // - Logged in: Bearer <accessToken>
    // - Anonymous: Bearer <SUPABASE_ANON_KEY> (valid JWT, treated as guest)
    if (accessToken) {
      // @ts-ignore
      headers["Authorization"] = `Bearer ${accessToken}`;
    } else if (typeof SUPABASE_ANON_KEY === "string") {
      // @ts-ignore
      headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    return headers;
  }

  // -----------------------------
  // PDF TEXT EXTRACTION (tier-aware)
  // -----------------------------
  async function extractTextFromPdfFiles(files) {
    if (!files || files.length === 0) return "";

    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib || !pdfjsLib.getDocument) {
      console.warn(
        "[study-builder] pdf.js not available; skipping file extraction."
      );
      return "";
    }

    let combinedText = "";
    const maxPages =
      effectiveMaxPagesPerFile || MAX_PAGES_PER_FILE || MAX_PAGES_PER_FILE;
    const maxChars =
      effectiveMaxFileTextLength ||
      MAX_FILE_TEXT_LENGTH ||
      MAX_FILE_TEXT_LENGTH;

    for (const file of files) {
      if (!file) continue;

      const isPdfType =
        (file.type && file.type.toLowerCase() === "application/pdf") ||
        (file.name && file.name.toLowerCase().endsWith(".pdf"));

      if (!isPdfType) continue;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;

        const totalPages = pdfDoc.numPages;
        const pagesToRead = Math.min(totalPages, maxPages);

        for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item) => (item.str || "").trim())
            .join(" ");

          if (pageText) {
            combinedText += "\n\n" + pageText;
          }

          if (combinedText.length >= maxChars) break;
        }
      } catch (err) {
        console.warn("[study-builder] Failed to read PDF file", file.name, err);
      }

      if (combinedText.length >= maxChars) break;
    }

    return combinedText.trim();
  }

  function buildTopicWithFiles(baseTopic, fileText) {
    if (!fileText || !fileText.trim()) return baseTopic;

    return (
      baseTopic +
      "\n\n---\n\n" +
      "The following text comes from uploaded study PDFs. " +
      "Use it as reference to generate exam-focused dental content. " +
      "Do not repeat everything; organize it into clear OSCE steps, high-yield notes, or questions as requested:\n\n" +
      fileText
    );
  }

  // -----------------------------
  // MAIN SUBMIT HANDLER
  // -----------------------------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const baseTopic = topicInput ? topicInput.value.trim() : "";
    const mode = getSelectedMode();
    const subject = getSelectedSubject();

    if (!baseTopic) {
      showPlaceholder("Please enter a topic or question first.");
      if (topicInput) topicInput.focus();
      return;
    }

    // Reset UI
    setLoading(true);
    showPlaceholder("Preparing your AI answer...");
    updateCopyVisibility();

    let topic = baseTopic;

    try {
      const fileText = await extractTextFromPdfFiles(attachedFiles || []);
      topic = buildTopicWithFiles(baseTopic, fileText);
    } catch (err) {
      console.warn("[study-builder] Failed to read attached files", err);
      topic = baseTopic;
    }

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

        // Track usage for logged-in users (updates counters + last_active_at)
        trackStudyUsage(mode);

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

      // Reset attached files + hidden input + summary pills
      attachedFiles = [];
      if (fileInput) fileInput.value = "";
      renderFileSummary();

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
      if (!answerEl) return;

      const raw = (answerEl.innerText || answerEl.textContent || "").toString();
      const textToCopy = raw.trim();

      if (!textToCopy) {
        showPlaceholder(
          "There is nothing to copy yet. Generate an answer first."
        );
        return;
      }

      const fallbackCopy = () => {
        const temp = document.createElement("textarea");
        temp.value = textToCopy;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      };

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          fallbackCopy();
        }

        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1200);
      } catch (err) {
        console.warn("[study-builder] Copy failed, trying fallback", err);
        try {
          fallbackCopy();
          copyBtn.textContent = "Copied";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1200);
        } catch (err2) {
          console.warn("[study-builder] Fallback copy failed", err2);
          showPlaceholder(
            "Copy failed. Please select and copy the text manually."
          );
        }
      }
    });
  }

  // -----------------------------
  // FILE SUMMARY RENDERER
  // -----------------------------
  function renderFileSummary(options = {}) {
    if (!fileSummary) return;

    const { skippedTooLarge = 0 } = options;

    if (!attachedFiles || attachedFiles.length === 0) {
      fileSummary.innerHTML = "";
      fileSummary.classList.remove("is-visible", "is-warning");
      return;
    }

    const pillsHtml = attachedFiles
      .map((file, index) => {
        const safeName = (file && file.name) || "File";
        return `
          <button type="button" class="study-file-pill" data-file-index="${index}">
            <span class="study-file-pill-name">${safeName}</span>
            <span class="study-file-pill-remove" aria-label="Remove file">&times;</span>
          </button>
        `;
      })
      .join("");

    let summary = "";
    if (attachedFiles.length === 1) {
      summary = "1 file added";
    } else {
      summary = `${attachedFiles.length} files added`;
    }

    if (skippedTooLarge > 0) {
      const sizeLabel =
        effectiveMaxFileSizeMb && effectiveMaxFileSizeMb > 0
          ? effectiveMaxFileSizeMb
          : MAX_FILE_SIZE_MB;
      summary += ` — ${skippedTooLarge} skipped (too large, max ${sizeLabel} MB on your plan).`;
      fileSummary.classList.add("is-warning");
    } else {
      fileSummary.classList.remove("is-warning");
    }

    if (!isProTier && userTier === "free") {
      summary += " · Free plan: up to 1 PDF per prompt.";
    }

    fileSummary.innerHTML = `
      <div class="study-file-list">
        ${pillsHtml}
      </div>
      <div>${summary}</div>
    `;
    fileSummary.classList.add("is-visible");
  }

  // -----------------------------
  // File input (tier-aware gating + PDF.js + removable pills)
  // -----------------------------
  if (addFilesBtn && fileInput && fileSummary) {
    addFilesBtn.addEventListener("click", () => {
      // Guests / unknown: nudge to sign up for free
      if (
        !isProTier &&
        (userTier === "guest" || userTier === ACCESS_TIER_UNKNOWN)
      ) {
        fileSummary.textContent =
          "Sign in with a free DentAIstudy account to attach PDFs to your prompts.";
        fileSummary.classList.add("is-visible", "is-warning");
        return;
      }

      // Logged-in free tier: limited but allowed
      if (!isProTier && userTier === "free") {
        if (effectiveMaxFileCount <= 0) {
          fileSummary.textContent =
            "Your current plan does not allow file uploads.";
          fileSummary.classList.add("is-visible", "is-warning");
          return;
        }
      }

      try {
        fileInput.click();
      } catch (err) {
        console.warn("[study-builder] File input trigger failed", err);
      }
    });

    fileInput.addEventListener("change", () => {
      const newFiles = fileInput.files;
      if (!newFiles || newFiles.length === 0) return;

      // Hard guard: if this tier currently has no file capacity
      if (effectiveMaxFileCount <= 0 || effectiveMaxFileSizeBytes <= 0) {
        fileInput.value = "";
        fileSummary.textContent = isProTier
          ? "File uploads are temporarily unavailable."
          : userTier === "free"
          ? "Your current plan does not allow file uploads."
          : "Sign in with a free DentAIstudy account to attach PDFs.";
        fileSummary.classList.add("is-visible", "is-warning");
        return;
      }

      // Free-tier daily limit
      let remainingFreeQuota = Infinity;
      let usageToday = null;
      if (!isProTier && userTier === "free") {
        const today = new Date().toISOString().slice(0, 10);
        const usage = getFreeFileUsage() || {};
        let used = typeof usage.usedFiles === "number" ? usage.usedFiles : 0;
        const lastDate = typeof usage.date === "string" ? usage.date : null;

        if (lastDate !== today) {
          used = 0;
        }

        remainingFreeQuota = Math.max(0, FREE_FILE_DAILY_LIMIT - used);
        usageToday = { date: today, usedFiles: used };

        if (remainingFreeQuota <= 0) {
          fileInput.value = "";
          fileSummary.textContent =
            "You've reached today's free PDF limit. Upgrade to Pro to attach more files.";
          fileSummary.classList.add("is-visible", "is-warning");
          return;
        }
      }

      let skippedTooLarge = 0;
      let acceptedCount = 0;

      // Merge new selection into attachedFiles (respecting per-tier limits)
      for (const file of newFiles) {
        if (!file) continue;

        if (file.size > effectiveMaxFileSizeBytes) {
          skippedTooLarge++;
          continue;
        }

        if (attachedFiles.length >= effectiveMaxFileCount) break;

        if (
          !isProTier &&
          userTier === "free" &&
          acceptedCount >= remainingFreeQuota
        ) {
          break;
        }

        const exists = attachedFiles.some(
          (f) =>
            f.name === file.name &&
            f.size === file.size &&
            f.lastModified === file.lastModified
        );
        if (!exists) {
          attachedFiles.push(file);
          acceptedCount++;
        }
      }

      // Update free-tier usage counter
      if (
        !isProTier &&
        userTier === "free" &&
        acceptedCount > 0 &&
        usageToday
      ) {
        usageToday.usedFiles += acceptedCount;
        setFreeFileUsage(usageToday);
      }

      if (attachedFiles.length === 0) {
        renderFileSummary({ skippedTooLarge });
        console.log(
          "[study-builder] Files attached: none (skipped too large, no quota, or invalid)"
        );
        return;
      }

      renderFileSummary({ skippedTooLarge });
      console.log("[study-builder] Files attached:", attachedFiles);
    });

    // Remove file when clicking the small "x" on a pill
    fileSummary.addEventListener("click", (event) => {
      const pill = event.target.closest(".study-file-pill");
      if (!pill) return;

      const indexAttr = pill.getAttribute("data-file-index");
      const index = Number(indexAttr);
      if (Number.isNaN(index) || index < 0 || index >= attachedFiles.length) {
        return;
      }

      attachedFiles.splice(index, 1);
      renderFileSummary();
    });
  }

  // Initial state
  updateCopyVisibility();
  showPlaceholder(
    "Your AI-powered answer will appear here once you generate it."
  );
});