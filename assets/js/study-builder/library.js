// assets/js/study-builder/library.js
(() => {
  "use strict";

  const tools = window.DentAIStudyTools;
  const els = {};
  let conversations = [];
  let decks = [];
  let quizzes = [];
  let activeFilter = "all";
  let sortMode = "recent";
  let viewMode = "grid";
  const libraryOpenedAt = new Date().toISOString();
  let canUseProLibrary = false;
  const lockedStatIcon = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v2.5" />
      <path d="M20 17v-2a2 2 0 1 0-4 0v2" />
      <rect x="14" y="17" width="8" height="5" rx="1" />
    </svg>
  `;
  const deckStatIcon = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 16V4a2 2 0 0 1 2-2h11" />
      <path d="M5 14H4a2 2 0 1 0 0 4h1" />
      <path d="M22 18H11a2 2 0 1 0 0 4h11V6H11a2 2 0 0 0-2 2v12" />
    </svg>
  `;
  const quizStatIcon = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  `;
  const customSelects = new Map();
  let customSelectEventsBound = false;

  function qs(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    els.grid = qs("libraryGrid");
    els.empty = qs("libraryEmpty");
    els.search = qs("librarySearch");
    els.refresh = qs("libraryRefresh");
    els.sort = qs("librarySort");
    els.viewButtons = Array.from(
      document.querySelectorAll("[data-library-view]"),
    );
    els.tabs = Array.from(document.querySelectorAll("[data-library-filter]"));
    els.countAll = qs("libraryCountAll");
    els.countChats = qs("libraryCountChats");
    els.countDecks = qs("libraryCountDecks");
    els.countQuizzes = qs("libraryCountQuizzes");
    els.statChats = qs("libraryStatChats");
    els.statDecks = qs("libraryStatDecks");
    els.statQuizzes = qs("libraryStatQuizzes");
    els.statDeckIcon = qs("libraryStatDeckIcon");
    els.statQuizIcon = qs("libraryStatQuizIcon");
    els.statLastActivity = qs("libraryStatLastActivity");
    els.statLastActivityDetail = qs("libraryStatLastActivityDetail");
  }

  function cleanTitle(value, fallback) {
    return (value || fallback || "Untitled").replace(/\s+/g, " ").trim();
  }

  function itemTime(item) {
    return item.updated_at || item.created_at || "";
  }

  function buildItems() {
    const chatItems = conversations.map((chat) => ({
      id: chat.id,
      kind: "chat",
      label: "Chat",
      title: cleanTitle(chat.title, "Untitled study chat"),
      summary: "Study chat",
      updated_at: itemTime(chat),
      href: `study.html?chat=${encodeURIComponent(chat.id)}`,
      table: "conversations",
      deleteMessage: "Delete this study chat? This can't be undone.",
    }));

    const deckItems = decks.map((deck) => ({
      id: deck.id,
      kind: "deck",
      label: "Cards",
      title: cleanTitle(deck.title, "Untitled deck"),
      summary: "Flashcard deck",
      progress: deck.progress || null,
      updated_at: itemTime(deck),
      href: `study-flashcards.html?deck=${encodeURIComponent(deck.id)}`,
      table: "flashcard_decks",
      deleteMessage: "Delete this flashcard deck? This can't be undone.",
    }));

    const quizItems = quizzes.map((quiz) => ({
      id: quiz.id,
      kind: "quiz",
      label: "Quiz",
      title: cleanTitle(quiz.title, "Untitled quiz"),
      summary: `${Number(quiz.question_count || 0)} questions`,
      progress: quiz.progress || null,
      updated_at: itemTime(quiz),
      href: `study-quiz.html?quiz=${encodeURIComponent(quiz.id)}`,
      table: "study_quizzes",
      deleteMessage: "Delete this quiz? This can't be undone.",
    }));

    return [...chatItems, ...deckItems, ...quizItems].sort((a, b) => {
      const aTime = new Date(a.updated_at).getTime() || 0;
      const bTime = new Date(b.updated_at).getTime() || 0;
      return bTime - aTime;
    });
  }

  function sortItems(items) {
    const next = [...items];

    if (sortMode === "title") {
      return next.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
    }

    return next.sort((a, b) => {
      const aTime = new Date(a.updated_at).getTime() || 0;
      const bTime = new Date(b.updated_at).getTime() || 0;
      return bTime - aTime;
    });
  }

  function formatActivityDetail(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Start studying";

    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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
      menu.style.maxHeight = "";
    });
  }

  function positionCustomSelect(root, menu) {
    const rect = root.getBoundingClientRect();
    const gap = 12;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const shouldOpenUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const available = shouldOpenUp ? spaceAbove : spaceBelow;

    root.classList.toggle("is-drop-up", shouldOpenUp);
    menu.style.maxHeight = `${Math.max(120, Math.min(220, available))}px`;
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
      item.innerHTML = `<span>${tools.escapeHtml(option.textContent || "Choose")}</span>`;
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
    enhanceSelect(els.sort);

    if (customSelectEventsBound) return;
    customSelectEventsBound = true;

    document.addEventListener("click", (event) => {
      if (event.target.closest(".study-custom-select")) return;
      closeCustomSelects();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeCustomSelects();
    });
  }

  function setLockedStatIcon(iconEl, unlockedIcon) {
    if (!iconEl) return;

    const isLocked = !canUseProLibrary;
    iconEl.classList.toggle("is-locked", isLocked);
    iconEl.closest(".library-stat")?.classList.toggle("is-locked", isLocked);
    iconEl.innerHTML = isLocked ? lockedStatIcon : unlockedIcon;
  }

  function syncLockedStats() {
    setLockedStatIcon(els.statDeckIcon, deckStatIcon);
    setLockedStatIcon(els.statQuizIcon, quizStatIcon);
  }

  function syncLastActivity() {
    if (els.statLastActivity) {
      els.statLastActivity.textContent = "Today";
    }
    if (els.statLastActivityDetail) {
      els.statLastActivityDetail.textContent =
        formatActivityDetail(libraryOpenedAt);
    }
  }

  function focusPageTop() {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function updateCounts(items = []) {
    syncLockedStats();

    if (els.countChats)
      els.countChats.textContent = String(conversations.length);
    if (els.countDecks) {
      els.countDecks.textContent = canUseProLibrary
        ? String(decks.length)
        : "Pro";
    }
    if (els.countQuizzes) {
      els.countQuizzes.textContent = canUseProLibrary
        ? String(quizzes.length)
        : "Pro";
    }
    if (els.statChats) els.statChats.textContent = String(conversations.length);
    if (els.statDecks) {
      els.statDecks.textContent = canUseProLibrary
        ? String(decks.length)
        : "Pro";
    }
    if (els.statQuizzes) {
      els.statQuizzes.textContent = canUseProLibrary
        ? String(quizzes.length)
        : "Pro";
    }
    if (els.countAll) {
      els.countAll.textContent = String(
        conversations.length + decks.length + quizzes.length,
      );
    }

    syncLastActivity();
  }

  function setActiveTab() {
    els.tabs?.forEach((tab) => {
      const filter = tab.dataset.libraryFilter || "all";
      const isProOnlyFilter = filter === "deck" || filter === "quiz";
      tab.disabled = isProOnlyFilter && !canUseProLibrary;
      tab.classList.toggle("is-active", filter === activeFilter);
    });

    const active = els.tabs?.find(
      (tab) => tab.dataset.libraryFilter === activeFilter,
    );
    active?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start",
    });
  }

  function setActiveView() {
    els.grid?.classList.toggle("is-list", viewMode === "list");
    els.viewButtons?.forEach((button) => {
      const isActive = button.dataset.libraryView === viewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function matchesSearch(item, query) {
    if (!query) return true;
    return [item.title, item.summary, item.label]
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  function iconForKind(kind) {
    if (kind === "deck") {
      return `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 16V4a2 2 0 0 1 2-2h11" />
          <path d="M5 14H4a2 2 0 1 0 0 4h1" />
          <path d="M22 18H11a2 2 0 1 0 0 4h11V6H11a2 2 0 0 0-2 2v12" />
        </svg>
      `;
    }

    if (kind === "quiz") {
      return `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="m9 14 2 2 4-4" />
        </svg>
      `;
    }

    return `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </svg>
    `;
  }

  function previewForItem(item) {
    if (item.kind === "deck") return "Review this saved flashcard deck.";
    if (item.kind === "quiz")
      return "Practice this saved quiz when you are ready.";
    return "Continue this saved study chat.";
  }

  function clampPercent(value) {
    const n = Number(value) || 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function progressMarkup(item) {
    if (!item.progress || item.kind === "chat") return "";

    const percent = clampPercent(item.progress.percent);

    return `
      <div class="library-progress is-${item.kind}" aria-label="${tools.escapeHtml(item.progress.label)}">
        <div class="library-progress-head">
          <span>${tools.escapeHtml(item.progress.label)}</span>
          <span>${percent}%</span>
        </div>
        <div class="library-progress-track" aria-hidden="true">
          <span data-progress="${percent}"></span>
        </div>
      </div>
    `;
  }

  function render() {
    if (!els.grid) return;

    const q = (els.search?.value || "").trim().toLowerCase();
    const allItems = buildItems();
    const items = sortItems(allItems);
    const filtered = items.filter(
      (item) =>
        (activeFilter === "all" || item.kind === activeFilter) &&
        matchesSearch(item, q),
    );

    updateCounts(allItems);
    setActiveTab();
    setActiveView();
    els.grid.innerHTML = "";
    if (els.empty) els.empty.hidden = filtered.length > 0;

    filtered.forEach((item) => {
      const card = document.createElement("article");
      card.className = `library-card is-${item.kind} is-entering`;
      card.dataset.itemId = item.id;
      card.dataset.kind = item.kind;

      card.innerHTML = `
        <div class="library-card-main">
          <div class="library-card-head">
            <div class="library-card-identity">
              <span class="library-art is-${item.kind}" aria-hidden="true">${iconForKind(item.kind)}</span>
              <div class="library-title-group">
                <h2 class="library-title">${tools.escapeHtml(item.title)}</h2>
                <div class="library-meta">
                  <span class="library-meta-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 7.5v5l3 1.8" />
                    </svg>
                  </span>
                  <span>${tools.formatRelativeTime(item.updated_at)}</span>
                  <span class="library-meta-dot" aria-hidden="true"></span>
                  <span>${tools.escapeHtml(item.summary)}</span>
                </div>
              </div>
            </div>
            <div class="library-type is-${item.kind}">${tools.escapeHtml(item.label)}</div>
          </div>
          <p class="library-summary">${tools.escapeHtml(previewForItem(item))}</p>
          ${progressMarkup(item)}
        </div>
        <div class="library-actions">
          <button class="library-action primary" type="button" data-open>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 7v14" />
              <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
            </svg>
            <span>Open</span>
          </button>
          <button class="library-action" type="button" data-rename>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>Rename</span>
          </button>
          <button class="library-action danger" type="button" data-delete>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6 18 20H6L5 6" />
              <path d="M10 11v5" />
              <path d="M14 11v5" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      `;

      els.grid.appendChild(card);
    });

    window.requestAnimationFrame(() => {
      els.grid.querySelectorAll(".library-card.is-entering").forEach((card) => {
        card.classList.remove("is-entering");
      });

      els.grid
        .querySelectorAll(".library-progress-track span[data-progress]")
        .forEach((bar) => {
          bar.style.width = `${bar.dataset.progress}%`;
        });
    });
  }

  async function fetchRows(table, select) {
    const state = await tools.ready();
    if (!state.supabase || !state.user) return [];

    const { data, error } = await state.supabase
      .from(table)
      .select(select)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    if (error || !Array.isArray(data)) return [];
    return data;
  }

  function countAnswered(answers) {
    return (Array.isArray(answers) ? answers : []).filter(
      (answer) => answer !== null && answer !== undefined,
    ).length;
  }

  async function fetchQuizProgress(quizRows) {
    const map = new Map();
    const quizIds = quizRows.map((quiz) => quiz.id).filter(Boolean);
    if (!quizIds.length) return map;

    const state = await tools.ready();
    if (!state.supabase || !state.user) return map;

    const { data, error } = await state.supabase
      .from("study_quiz_attempts")
      .select("quiz_id,total,answers,created_at")
      .in("quiz_id", quizIds)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error || !Array.isArray(data)) return map;

    data.forEach((attempt) => {
      if (!attempt.quiz_id || map.has(attempt.quiz_id)) return;

      const quiz = quizRows.find((row) => row.id === attempt.quiz_id);
      const total = Number(attempt.total || quiz?.question_count || 0);
      const answered = countAnswered(attempt.answers);
      if (!total || !answered) return;

      const percent = clampPercent((answered / total) * 100);
      map.set(attempt.quiz_id, {
        percent,
        label:
          answered >= total ? "Complete" : `${answered} of ${total} answered`,
      });
    });

    return map;
  }

  function readFlashcardProgress(meta) {
    const progress = meta?.study_flashcard_progress;
    return progress && typeof progress === "object" ? progress : {};
  }

  async function fetchFlashcardProgress(deckRows) {
    const map = new Map();
    const deckIds = deckRows.map((deck) => deck.id).filter(Boolean);
    if (!deckIds.length) return map;

    const state = await tools.ready();
    if (!state.supabase || !state.user) return map;

    try {
      const { data } = await state.supabase.auth.getUser();
      if (data?.user) state.user = data.user;
    } catch {}

    const { data, error } = await state.supabase
      .from("flashcards")
      .select("id,deck_id")
      .in("deck_id", deckIds)
      .limit(1200);

    if (error || !Array.isArray(data)) return map;

    const cardsByDeck = new Map();
    data.forEach((card) => {
      const deckCards = cardsByDeck.get(card.deck_id) || new Set();
      deckCards.add(String(card.id));
      cardsByDeck.set(card.deck_id, deckCards);
    });

    const savedProgress = readFlashcardProgress(state.user?.user_metadata);

    deckRows.forEach((deck) => {
      const saved =
        savedProgress[deck.id] && typeof savedProgress[deck.id] === "object"
          ? savedProgress[deck.id]
          : {};

      const validCards = cardsByDeck.get(deck.id) || new Set();
      const known = Array.isArray(saved.known_ids) ? saved.known_ids : [];
      const review = Array.isArray(saved.review_ids) ? saved.review_ids : [];
      const reviewed = new Set(
        [...known, ...review]
          .map((id) => String(id))
          .filter((id) => !validCards.size || validCards.has(id)),
      );
      const total = validCards.size || Number(saved.total || 0);
      if (!total) return;

      const viewedCount = Number(saved.viewed_count || 0);
      const reviewedCount = Math.min(
        Math.max(reviewed.size, viewedCount),
        total,
      );
      const percent = clampPercent((reviewedCount / total) * 100);

      map.set(deck.id, {
        percent,
        label:
          reviewedCount >= total
            ? "Complete"
            : `${reviewedCount} of ${total} reviewed`,
      });
    });

    return map;
  }

  async function load() {
    els.refresh?.classList.add("is-loading");
    if (els.refresh) els.refresh.disabled = true;

    try {
      const state = await tools.ready();
      canUseProLibrary = Boolean(state.isPro);

      const chatRows = await tools.fetchConversations(30);
      const [deckRows, quizRows] = canUseProLibrary
        ? await Promise.all([
            fetchRows("flashcard_decks", "id,title,created_at,updated_at"),
            fetchRows(
              "study_quizzes",
              "id,title,difficulty,question_count,created_at,updated_at",
            ),
          ])
        : [[], []];

      const [deckProgress, quizProgress] = await Promise.all([
        fetchFlashcardProgress(deckRows),
        fetchQuizProgress(quizRows),
      ]);

      conversations = chatRows;
      decks = deckRows.map((deck) => ({
        ...deck,
        progress: deckProgress.get(deck.id) || null,
      }));
      quizzes = quizRows.map((quiz) => ({
        ...quiz,
        progress: quizProgress.get(quiz.id) || null,
      }));
      render();
    } finally {
      els.refresh?.classList.remove("is-loading");
      if (els.refresh) els.refresh.disabled = false;
    }
  }

  function findItem(id, kind) {
    return buildItems().find((item) => item.id === id && item.kind === kind);
  }

  async function renameItem(item) {
    const current = cleanTitle(item?.title);
    const next = await tools.askModal({
      title: "Rename item",
      message: "Name this saved study item.",
      value: current,
      input: true,
    });
    if (!next || !next.trim() || next.trim() === current) return;

    const s = await tools.ready();
    const { error } = await s.supabase
      .from(item.table)
      .update({ title: next.trim() })
      .eq("id", item.id);

    if (error) {
      tools.toast("Could not rename this item.", "error");
      return;
    }

    tools.toast("Item renamed.");
    await load();
  }

  async function deleteItem(item) {
    const ok = await tools.askModal({
      title: "Delete item",
      message: item.deleteMessage,
      danger: true,
    });
    if (!ok) return;

    const s = await tools.ready();
    const { error } = await s.supabase
      .from(item.table)
      .delete()
      .eq("id", item.id);

    if (error) {
      tools.toast("Could not delete this item.", "error");
      return;
    }

    tools.toast("Item deleted.");
    await load();
  }

  function bind() {
    els.search?.addEventListener("input", render);
    els.refresh?.addEventListener("click", load);
    els.sort?.addEventListener("change", () => {
      sortMode = els.sort.value || "recent";
      syncCustomSelect(els.sort);
      render();
    });

    els.tabs?.forEach((tab) => {
      tab.addEventListener("click", () => {
        activeFilter = tab.dataset.libraryFilter || "all";
        render();
      });
    });

    els.viewButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        viewMode = button.dataset.libraryView || "grid";
        render();
      });
    });

    els.grid?.addEventListener("click", async (event) => {
      const card = event.target.closest(".library-card");
      if (!card) return;

      const item = findItem(card.dataset.itemId, card.dataset.kind);
      if (!item) return;

      if (event.target.closest("[data-open]")) {
        window.location.href = item.href;
        return;
      }

      if (event.target.closest("[data-rename]")) {
        await renameItem(item);
        return;
      }

      if (event.target.closest("[data-delete]")) {
        await deleteItem(item);
      }
    });
  }

  async function boot() {
    cacheEls();
    syncLastActivity();
    bind();
    enhanceSelects();

    const state = await tools.ready();
    if (!state.user) return;
    canUseProLibrary = Boolean(state.isPro);
    if (
      !canUseProLibrary &&
      (activeFilter === "deck" || activeFilter === "quiz")
    ) {
      activeFilter = "all";
    }

    await load();
    focusPageTop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
