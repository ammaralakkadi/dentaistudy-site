// notes.js
// Notes page: PDF upload -> full exam-ready notes.

(() => {
  "use strict";

  const form = document.getElementById("notesForm");
  const fileInput = document.getElementById("notesPdfInput");
  const fileButton = document.getElementById("notesFileButton");
  const dropzone = document.getElementById("notesDropzone");
  const fileName = document.getElementById("notesFileName");
  const fileMeta = document.getElementById("notesFileMeta");
  const generateBtn = document.getElementById("notesGenerateBtn");
  const clearBtn = document.getElementById("notesClearBtn");
  const status = document.getElementById("notesStatus");
  const result = document.getElementById("notesResult");
  const resultBody = document.getElementById("notesResultBody");
  const copyBtn = document.getElementById("notesCopyBtn");
  const flashcardsLink = document.getElementById("notesFlashcardsLink");
  const quizLink = document.getElementById("notesQuizLink");
  const generateBtnLabel = document.getElementById("notesGenerateBtnLabel");
  const savedNoteSelect = document.getElementById("notesSavedSelect");

  if (!form || !fileInput || !dropzone || !generateBtn) return;

  const MAX_FILE_MB = 50;
  const MAX_PDF_PAGES = 900;
  const MAX_PDF_CHARS = 1800000;
  const PDFJS_ASSET_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/";
  const LOADING_PHRASES = [
    "Extracting PDF...",
    "Reading pages...",
    "Scanning chapter structure...",
    "Building notes...",
    "Organizing key points...",
    "Saving notes...",
  ];

  let selectedFile = null;
  let extracted = null;
  let generatedText = "";
  let savedNoteId = "";
  let loadingPhraseTimer = null;
  const customSelects = new Map();
  let customSelectEventsBound = false;

  function tools() {
    return window.DentAIStudyTools || null;
  }

  function toast(message, type) {
    tools()?.toast?.(message, type);
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return "PDF selected";
    const mb = n / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  function fileId(file) {
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  function selectedOption(select) {
    return (
      select?.selectedOptions?.[0] || select?.options?.[select.selectedIndex]
    );
  }

  function closeCustomSelects(except) {
    customSelects.forEach(({ root, menu }) => {
      if (root === except) return;
      root.classList.remove("is-open");
      root.classList.remove("is-drop-up");
      menu.hidden = true;
      menu.style.left = "";
      menu.style.top = "";
      menu.style.right = "";
      menu.style.width = "";
      menu.style.maxHeight = "";
    });
  }

  function positionCustomSelect(root, menu) {
    const rect = root.getBoundingClientRect();
    const gap = 8;
    const padding = 12;
    const optionCount = Math.max(
      1,
      menu.querySelectorAll(".study-custom-option").length,
    );
    const maxHeight = 280;
    const desiredHeight = Math.min(maxHeight, optionCount * 42 + 8);
    const minReadableHeight = Math.min(96, desiredHeight);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;
    const shouldOpenUp =
      spaceBelow < minReadableHeight && spaceAbove > spaceBelow;
    const available = Math.max(
      minReadableHeight,
      shouldOpenUp ? spaceAbove - gap : spaceBelow - gap,
    );
    const menuHeight = Math.min(desiredHeight, available);
    const width = Math.min(rect.width, viewportWidth - padding * 2);
    const left = Math.max(
      padding,
      Math.min(rect.left, viewportWidth - width - padding),
    );
    const top = shouldOpenUp
      ? Math.max(padding, rect.top - gap - menuHeight)
      : Math.min(rect.bottom + gap, viewportHeight - padding - menuHeight);

    root.classList.toggle("is-drop-up", shouldOpenUp);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.right = "auto";
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${menuHeight}px`;
  }

  function repositionOpenCustomSelects() {
    customSelects.forEach(({ root, menu }) => {
      if (!menu.hidden) positionCustomSelect(root, menu);
    });
  }

  function syncCustomSelect(select) {
    const custom = customSelects.get(select);
    if (!custom) return;

    const active = selectedOption(select);
    custom.label.textContent = active?.textContent || "Choose";
    custom.menu.innerHTML = "";

    Array.from(select.options).forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "study-custom-option";
      item.dataset.value = option.value;
      item.classList.toggle("is-selected", option.value === select.value);
      item.innerHTML = `<span>${escapeHtml(option.textContent || "Choose")}</span>`;
      custom.menu.appendChild(item);
    });
  }

  function enhanceSelect(select) {
    if (!select || customSelects.has(select)) {
      syncCustomSelect(select);
      return;
    }

    const root = document.createElement("div");
    root.className = "study-custom-select";
    const btn = document.createElement("button");
    btn.className = "study-custom-select-btn";
    btn.type = "button";
    btn.innerHTML = "<span></span>";
    const menu = document.createElement("div");
    menu.className = "study-custom-select-menu";
    menu.hidden = true;

    root.append(btn, menu);
    select.classList.add("is-enhanced");
    select.insertAdjacentElement("afterend", root);

    customSelects.set(select, {
      root,
      button: btn,
      label: btn.querySelector("span"),
      menu,
    });

    btn.addEventListener("click", () => {
      const willOpen = menu.hidden;
      closeCustomSelects(root);
      root.classList.toggle("is-open", willOpen);
      menu.hidden = !willOpen;
      if (willOpen) positionCustomSelect(root, menu);
    });

    menu.addEventListener("click", (event) => {
      const option = event.target.closest(".study-custom-option");
      if (!option) return;
      select.value = option.dataset.value || "";
      syncCustomSelect(select);
      closeCustomSelects();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    syncCustomSelect(select);
  }

  function enhanceSelects() {
    enhanceSelect(savedNoteSelect);

    if (customSelectEventsBound) return;
    customSelectEventsBound = true;

    document.addEventListener("click", (event) => {
      if (event.target.closest(".study-custom-select")) return;
      closeCustomSelects();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeCustomSelects();
    });

    window.addEventListener("resize", repositionOpenCustomSelects);
    window.addEventListener("scroll", repositionOpenCustomSelects, true);
  }

  function setStatus(message) {
    if (!status) return;
    status.textContent = message || "";
    status.hidden = !message;
  }

  function syncNoteActionLinks() {
    const hasNote = Boolean(savedNoteId);

    if (flashcardsLink) {
      flashcardsLink.hidden = !hasNote;
      flashcardsLink.href = hasNote
        ? `study-flashcards.html?note=${encodeURIComponent(savedNoteId)}`
        : "study-flashcards.html";
    }

    if (quizLink) {
      quizLink.hidden = !hasNote;
      quizLink.href = hasNote
        ? `study-quiz.html?note=${encodeURIComponent(savedNoteId)}`
        : "study-quiz.html";
    }
  }

  function setLoading(isLoading) {
    generateBtn.disabled = isLoading || !selectedFile;
    generateBtn.classList.toggle("is-loading", isLoading);
    generateBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
    if (generateBtnLabel) {
      generateBtnLabel.textContent = isLoading
        ? "Generating notes"
        : "Generate notes";
    }
    if (clearBtn) clearBtn.disabled = isLoading || !selectedFile;
    if (fileButton) fileButton.disabled = isLoading;
  }

  function setLoadingPhrase(message) {
    if (generateBtnLabel) generateBtnLabel.textContent = message;
    setStatus(message);
  }

  function startLoadingPhrases() {
    let phraseIndex = 0;

    stopLoadingPhrases();
    setLoadingPhrase(LOADING_PHRASES[phraseIndex]);

    loadingPhraseTimer = window.setInterval(() => {
      phraseIndex = (phraseIndex + 1) % LOADING_PHRASES.length;
      setLoadingPhrase(LOADING_PHRASES[phraseIndex]);
    }, 1400);
  }

  function stopLoadingPhrases() {
    window.clearInterval(loadingPhraseTimer);
    loadingPhraseTimer = null;
  }

  function revealResult(shouldScroll = true) {
    if (!result) return;

    result.classList.add("is-entering");
    result.hidden = false;

    window.requestAnimationFrame(() => {
      result.classList.remove("is-entering");
      if (!shouldScroll) return;

      const prefersReducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      )?.matches;

      result.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function resetResult() {
    generatedText = "";
    savedNoteId = "";
    syncNoteActionLinks();
    if (result) {
      result.hidden = true;
      result.classList.remove("is-entering");
    }
    if (resultBody) resultBody.innerHTML = "";
  }

  function resetFile() {
    stopLoadingPhrases();
    selectedFile = null;
    extracted = null;
    fileInput.value = "";
    dropzone.classList.remove("has-file", "is-dragover");
    if (fileName) fileName.textContent = "Upload one dental PDF";
    if (fileMeta) fileMeta.textContent = "PDF only · up to 50 MB";
    if (savedNoteSelect) {
      savedNoteSelect.value = "";
      syncCustomSelect(savedNoteSelect);
    }
    setStatus("");
    setLoading(false);
    resetResult();
  }

  function acceptFile(file) {
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      toast("Please upload a PDF file.", "error");
      return;
    }

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast(`PDF must be ${MAX_FILE_MB} MB or smaller.`, "error");
      return;
    }

    selectedFile = file;
    extracted = null;
    stopLoadingPhrases();
    resetResult();
    if (savedNoteSelect) {
      savedNoteSelect.value = "";
      syncCustomSelect(savedNoteSelect);
    }
    dropzone.classList.add("has-file");
    if (fileName) fileName.textContent = file.name;
    if (fileMeta)
      fileMeta.textContent = `${formatBytes(file.size)} · ready to generate`;
    setStatus("");
    setLoading(false);
  }

  async function extractPdfText(file) {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
      throw new Error(
        "PDF reader did not load. Refresh the page and try again.",
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;

    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(
        `This PDF has ${pdf.numPages} pages. Upload a book under ${MAX_PDF_PAGES} pages or split it by section.`,
      );
    }

    let text = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = (content.items || [])
        .map((item) => String(item?.str || "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText) text += `[Page ${pageNum}]\n${pageText}\n\n`;
      if (text.length >= MAX_PDF_CHARS) break;
    }

    const cleanText = text.trim().slice(0, MAX_PDF_CHARS);

    const minReadableChars = Math.min(1200, Math.max(80, pdf.numPages * 120));

    if (cleanText.length < minReadableChars) {
      throw new Error(
        "I could not read enough selectable text from this PDF. Re-save it as a searchable PDF, then upload it again.",
      );
    }

    return {
      text: cleanText,
      pages: pdf.numPages,
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function inlineFormat(value) {
    return escapeHtml(value)
      .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function isTableSeparator(line) {
    const text = String(line || "").trim();
    return /^\|?[\s:-]+\|[\s|:-]*$/.test(text) && text.includes("|");
  }

  function splitTableRow(line) {
    let text = String(line || "").trim();
    if (text.startsWith("|")) text = text.slice(1);
    if (text.endsWith("|")) text = text.slice(0, -1);
    return text.split("|").map((cell) => inlineFormat(cell.trim()));
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || "")
      .replace(/\r\n/g, "\n")
      .split("\n");
    let html = "";
    let listType = "";

    function closeList() {
      if (!listType) return;
      html += `</${listType}>`;
      listType = "";
    }

    function openList(type) {
      if (listType === type) return;
      closeList();
      html += `<${type}>`;
      listType = type;
    }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();

      if (!raw) {
        closeList();
        continue;
      }

      if (
        raw.includes("|") &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      ) {
        closeList();

        const headerCells = splitTableRow(raw);
        i += 2;

        const bodyRows = [];
        while (i < lines.length && lines[i].trim().includes("|")) {
          bodyRows.push(splitTableRow(lines[i]));
          i += 1;
        }
        i -= 1;

        html +=
          '<div class="notes-table-wrap"><table class="notes-table"><thead><tr>';
        headerCells.forEach((cell) => {
          html += `<th>${cell}</th>`;
        });
        html += "</tr></thead><tbody>";
        bodyRows.forEach((row) => {
          html += "<tr>";
          row.forEach((cell) => {
            html += `<td>${cell}</td>`;
          });
          html += "</tr>";
        });
        html += "</tbody></table></div>";
        continue;
      }

      if (/^###\s+/.test(raw)) {
        closeList();
        html += `<h3>${inlineFormat(raw.replace(/^###\s+/, ""))}</h3>`;
        continue;
      }

      if (/^##\s+/.test(raw)) {
        closeList();
        html += `<h2>${inlineFormat(raw.replace(/^##\s+/, ""))}</h2>`;
        continue;
      }

      if (/^#\s+/.test(raw)) {
        closeList();
        html += `<h2>${inlineFormat(raw.replace(/^#\s+/, ""))}</h2>`;
        continue;
      }

      const looseNumberedHeading = /^(\d{1,2})\s+([A-Z][^:]{2,90})$/.exec(raw);
      if (looseNumberedHeading) {
        closeList();
        html += `<h3>${looseNumberedHeading[1]}. ${inlineFormat(
          looseNumberedHeading[2],
        )}</h3>`;
        continue;
      }

      const orderedItem = /^\d+\.\s+(.+)$/.exec(raw);
      if (orderedItem) {
        openList("ol");
        html += `<li>${inlineFormat(orderedItem[1])}</li>`;
        continue;
      }

      if (/^[-*]\s+/.test(raw)) {
        openList("ul");
        html += `<li>${inlineFormat(raw.replace(/^[-*]\s+/, ""))}</li>`;
        continue;
      }

      closeList();
      html += `<p>${inlineFormat(raw)}</p>`;
    }

    closeList();
    return html;
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "").trim();
    if (!value) return false;

    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Fall through to the textarea copy fallback.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.className = "notes-copy-helper";
    textarea.setAttribute("readonly", "");

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, value.length);

    let copied = false;

    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }

    return copied;
  }

  async function generateNotes() {
    if (!selectedFile) {
      toast("Upload a PDF first.", "error");
      return;
    }

    const t = tools();
    if (!t?.ready || !t?.ai || !t?.saveGeneratedNote) {
      toast("Study tools did not load. Refresh and try again.", "error");
      return;
    }

    const appState = await t.ready();
    if (!appState?.isPro) {
      toast("Notes are a Pro feature.", "error");
      return;
    }

    setLoading(true);
    startLoadingPhrases();

    try {
      if (!extracted) extracted = await extractPdfText(selectedFile);

      const data = await t.ai({
        topic:
          "Create complete exam-ready notes from the full PDF. Use clear headings, high-yield bullets, clinical reasoning, exam traps, and likely viva/MCQ angles.",
        task: "chapter_notes",
        subject: "General dentistry",
        pdf_docs: [
          {
            file_id: fileId(selectedFile),
            file_name: selectedFile.name,
            text: extracted.text,
            pages: extracted.pages,
          },
        ],
      });

      generatedText = String(data?.content || data?.output || "").trim();
      if (!generatedText) throw new Error("No notes returned.");

      savedNoteId = await t.saveGeneratedNote({
        title: selectedFile.name,
        sourceFileName: selectedFile.name,
        content: generatedText,
        pageCount: extracted.pages,
      });

      syncNoteActionLinks();
      if (resultBody) resultBody.innerHTML = renderMarkdown(generatedText);
      revealResult();
      setStatus("Notes generated and saved to Library.");
      toast("Notes saved to Library.");
    } catch (error) {
      console.error("[notes] generate failed", error);
      setStatus("");
      toast(error?.message || "Could not generate notes.", "error");
    } finally {
      stopLoadingPhrases();
      setLoading(false);
    }
  }

  fileButton?.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    acceptFile(fileInput.files?.[0]);
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-dragover");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    acceptFile(event.dataTransfer?.files?.[0]);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    generateNotes();
  });

  clearBtn?.addEventListener("click", resetFile);

  savedNoteSelect?.addEventListener("change", () => {
    const id = savedNoteSelect.value;
    if (!id) {
      resetFile();
      return;
    }
    openSavedNote(id);
  });

  copyBtn?.addEventListener("click", async () => {
    const copied = await copyTextToClipboard(generatedText);

    if (copied) {
      const isDesktopPointer = window.matchMedia?.(
        "(hover: hover) and (pointer: fine)",
      )?.matches;

      const userAgent = navigator.userAgent || "";
      const isSafari =
        /Safari/i.test(userAgent) &&
        !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|OPR|Android/i.test(
          userAgent,
        );

      if (isDesktopPointer || isSafari) toast("Notes copied.");
      return;
    }

    toast("Could not copy notes.", "error");
  });

  async function openSavedNote(noteId) {
    const t = tools();
    if (!t?.ready || !t?.fetchNoteText || !noteId) return;

    try {
      const appState = await t.ready();
      if (!appState?.user) return;

      setStatus("Opening saved note…");
      const note = await t.fetchNoteText(noteId);
      if (!note?.content) throw new Error("Saved note not found.");

      generatedText = String(note.content || "").trim();
      savedNoteId = String(note.id || "");
      selectedFile = null;
      extracted = null;
      fileInput.value = "";
      dropzone.classList.remove("has-file", "is-dragover");
      if (fileName) fileName.textContent = note.title || "Saved note";
      if (fileMeta) {
        const pages = note.page_count
          ? `${note.page_count} pages`
          : "Saved note";
        fileMeta.textContent = `${pages} · from Library`;
      }
      if (savedNoteSelect) {
        savedNoteSelect.value = savedNoteId;
        syncCustomSelect(savedNoteSelect);
      }
      syncNoteActionLinks();
      if (resultBody) resultBody.innerHTML = renderMarkdown(generatedText);
      revealResult();
      setStatus("Saved note opened.");
      setLoading(false);
    } catch (error) {
      console.error("[notes] open saved note failed", error);
      setStatus("");
      toast(error?.message || "Could not open saved note.", "error");
      resetFile();
    }
  }

  async function loadSavedNotesList() {
    if (!savedNoteSelect) return;
    const t = tools();
    if (!t?.fetchNotes) return;

    const list = await t.fetchNotes(30);
    savedNoteSelect.innerHTML = `<option value="">Choose a saved note</option>`;

    list.forEach((note) => {
      const opt = document.createElement("option");
      opt.value = note.id;
      opt.textContent = note.title || "Untitled note";
      savedNoteSelect.appendChild(opt);
    });

    syncCustomSelect(savedNoteSelect);
  }

  async function loadSavedNoteFromUrl() {
    const noteId = new URLSearchParams(window.location.search).get("note");
    if (!noteId) {
      resetFile();
      return;
    }

    await openSavedNote(noteId);
  }

  enhanceSelects();

  (async () => {
    await loadSavedNotesList();
    await loadSavedNoteFromUrl();
  })();
})();
