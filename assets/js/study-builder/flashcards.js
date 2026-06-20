// assets/js/study-builder/flashcards.js
(() => {
  "use strict";

  const tools = window.DentAIStudyTools;
  const SWIPE_THRESHOLD = 90;

  const els = {};
  let decks = [];
  let cards = [];
  let currentIndex = 0;
  let isRevealed = false;
  let sessionFinished = false;
  let activeDeckId = null;
  let suppressNextClick = false;
  let drag = null;
  let knownCards = new Set();
  let reviewCards = new Set();
  let cardMotionTimer = null;
  let generatePhraseTimer = null;
  const customSelects = new Map();
  let customSelectEventsBound = false;

  const GENERATING_PHRASES = [
    "Reading note...",
    "Finding key facts...",
    "Writing cards...",
    "Checking recall points...",
    "Saving deck...",
  ];

  function qs(id) {
    return document.getElementById(id);
  }

  function renderLucideIcons() {
    window.lucide?.createIcons({
      attrs: {
        width: 19,
        height: 19,
        "stroke-width": 1.9,
      },
    });
  }

  function setGenerateLabel(label) {
    const labelEl = els.generate?.querySelector("[data-generate-label]");
    if (labelEl) {
      labelEl.textContent = label;
      return;
    }

    if (els.generate) els.generate.textContent = label;
  }

  function setGeneratingPhrase(label) {
    setGenerateLabel(label);

    if (!els.stage?.classList.contains("is-generating")) return;
    if (els.deckMeta) els.deckMeta.textContent = label;
    if (els.frontText) {
      els.frontText.textContent = label;
      syncTextDensity(els.frontText, label);
    }
    if (els.hint) els.hint.textContent = "This usually takes a moment.";
  }

  function startGeneratePhrases() {
    let phraseIndex = 0;

    stopGeneratePhrases();
    setGeneratingPhrase(GENERATING_PHRASES[phraseIndex]);

    generatePhraseTimer = window.setInterval(() => {
      phraseIndex = (phraseIndex + 1) % GENERATING_PHRASES.length;
      setGeneratingPhrase(GENERATING_PHRASES[phraseIndex]);
    }, 1400);
  }

  function stopGeneratePhrases() {
    window.clearInterval(generatePhraseTimer);
    generatePhraseTimer = null;
    setGenerateLabel("Generate flashcards");
  }

  function cacheEls() {
    els.layout = document.querySelector(".flashcards-layout");
    els.stage = document.querySelector(".deck-stage");
    els.empty = qs("flashcardEmptyState");
    els.createModal = qs("flashcardCreateModal");
    els.openCreate = qs("openFlashcardCreateBtn");
    els.createClose = document.querySelectorAll(
      "[data-flashcard-create-close]",
    );
    els.title = qs("deckTitleInput");
    els.count = qs("cardCountInput");
    els.source = qs("flashcardSourceInput");
    els.noteSelect = qs("flashcardNoteSelect");
    els.deckSelect = qs("deckSelect");
    els.generate = qs("generateCardsBtn");
    els.deleteDeck = qs("deleteDeckBtn");
    els.card = qs("flashcardCard");
    els.label = qs("flashcardLabel");
    els.frontText = qs("flashcardFrontText");
    els.backText = qs("flashcardBackText");
    els.hint = qs("flashcardHint");
    els.counter = qs("flashcardCounter");
    els.progressValue = qs("sessionProgressValue");
    els.progressBar = qs("sessionProgressBar");
    els.deckName = qs("activeDeckName");
    els.deckMeta = qs("activeDeckMeta");
    els.prev = qs("prevCardBtn");
    els.next = qs("nextCardBtn");
    els.reveal = qs("revealCardBtn");
    els.review = qs("reviewCardBtn");
    els.know = qs("knowCardBtn");
    els.strip = qs("flashcardStrip");
  }

  function clampCount(value) {
    const n = Number(value || 12);
    return Math.max(6, Math.min(40, Math.round(n)));
  }

  function isTypingTarget(target) {
    return Boolean(
      target?.closest?.(
        "button, input, textarea, select, [contenteditable='true']",
      ),
    );
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
    const minHeight = 150;
    const maxHeight = 280;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;
    const shouldOpenUp = spaceBelow < minHeight && spaceAbove > spaceBelow;
    const available = shouldOpenUp ? spaceAbove - gap : spaceBelow - gap;
    const menuHeight = Math.max(minHeight, Math.min(maxHeight, available));
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
    [els.noteSelect, els.deckSelect].forEach(enhanceSelect);

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

  function resetStage(message) {
    stopGeneratePhrases();
    cards = [];
    currentIndex = 0;
    isRevealed = false;
    sessionFinished = false;
    knownCards = new Set();
    reviewCards = new Set();
    setFlowMode("normal");
    els.layout?.classList.add("is-empty");
    if (els.empty) els.empty.hidden = false;
    els.stage?.classList.remove("is-complete", "is-generating");
    els.card?.classList.add("is-empty");
    els.card?.classList.remove(
      "is-complete",
      "is-flipped",
      "is-dragging",
      "is-swipe-next",
      "is-swipe-prev",
    );
    activeDeckId = null;
    if (els.card) els.card.style.transform = "";
    if (els.deckName) els.deckName.textContent = "No deck selected";
    if (els.deckMeta)
      els.deckMeta.textContent =
        "Create flashcards from a saved Note or choose a saved deck.";
    if (els.counter) els.counter.textContent = "0 of 0";
    if (els.label) els.label.textContent = "Question";
    if (els.frontText)
      els.frontText.textContent = message || "No flashcards yet.";
    if (els.backText) els.backText.textContent = "";
    if (els.hint) els.hint.textContent = "Click the card to reveal the answer.";
    if (els.reveal) els.reveal.textContent = "Reveal";
    updateProgress();
    els.know?.classList.remove("is-active");
    els.review?.classList.remove("is-active");
    if (els.strip) els.strip.innerHTML = "";
  }

  function setFlipped(value) {
    isRevealed = Boolean(value);
    els.card?.classList.toggle("is-flipped", isRevealed);
    if (els.reveal) els.reveal.textContent = isRevealed ? "Hide" : "Reveal";

    if (isRevealed) saveFlashcardProgress();
  }

  function cardKey(card, index) {
    return String(card?.id || `${card?.deck_id || "deck"}:${index}`);
  }

  function readFlashcardProgress(meta, deckId) {
    const progress = meta?.study_flashcard_progress;
    if (!progress || typeof progress !== "object") return null;
    return progress[deckId] && typeof progress[deckId] === "object"
      ? progress[deckId]
      : null;
  }

  function validCardKeys(values, validKeys) {
    return (Array.isArray(values) ? values : [])
      .map((value) => String(value))
      .filter((value) => validKeys.has(value));
  }

  function reviewedKeys() {
    return new Set([...knownCards, ...reviewCards]);
  }

  function reviewedCount() {
    return Math.min(reviewedKeys().size, cards.length);
  }

  function cardIsReviewed(card, index) {
    const key = cardKey(card, index);
    return knownCards.has(key) || reviewCards.has(key);
  }

  function nextUnreviewedIndex(fromIndex) {
    if (!cards.length) return -1;

    for (let step = 1; step <= cards.length; step += 1) {
      const index = (fromIndex + step) % cards.length;
      if (!cardIsReviewed(cards[index], index)) return index;
    }

    return -1;
  }

  function firstReviewIndex() {
    return cards.findIndex((card, index) =>
      reviewCards.has(cardKey(card, index)),
    );
  }

  function syncTextDensity(element, value) {
    if (!element) return;

    const length = String(value || "")
      .replace(/\s+/g, " ")
      .trim().length;

    element.classList.toggle("is-long", length > 170);
    element.classList.toggle("is-very-long", length > 270);
  }

  async function saveFlashcardProgress() {
    if (!activeDeckId || !cards.length) return;

    try {
      const state = await tools.ready();
      if (!state.supabase?.auth || !state.user) return;

      const meta = state.user.user_metadata || {};
      const progress = {
        ...(meta.study_flashcard_progress &&
        typeof meta.study_flashcard_progress === "object"
          ? meta.study_flashcard_progress
          : {}),
      };
      const viewedCount = sessionProgressCount();

      progress[activeDeckId] = {
        known_ids: Array.from(knownCards),
        review_ids: Array.from(reviewCards),
        viewed_count: viewedCount,
        total: cards.length,
        percent: cards.length
          ? Math.round((viewedCount / cards.length) * 100)
          : 0,
        updated_at: new Date().toISOString(),
      };

      const nextMeta = { ...meta, study_flashcard_progress: progress };
      const { error } = await state.supabase.auth.updateUser({
        data: nextMeta,
      });
      if (!error) state.user.user_metadata = nextMeta;
    } catch {}
  }

  function sessionMeta() {
    if (!cards.length)
      return "Create a deck from notes or choose a saved deck.";

    const known = knownCards.size;
    const review = reviewCards.size;
    if (known === cards.length)
      return "Session complete - every card marked known.";
    if (known || review)
      return `${cards.length} cards - ${known} known, ${review} to review`;
    return `${cards.length} cards - start with the first honest answer.`;
  }

  function renderStrip() {
    if (!els.strip) return;

    if (els.strip.children.length !== cards.length) {
      els.strip.innerHTML = "";
      cards.forEach((card, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "flashcard-strip-card";
        btn.dataset.index = String(index);
        btn.innerHTML = `
          <span class="flashcard-strip-number">Card ${index + 1}</span>
          <span class="flashcard-strip-title">${tools.escapeHtml(card.front)}</span>
        `;
        els.strip.appendChild(btn);
      });
    }

    Array.from(els.strip.children).forEach((btn, index) => {
      const card = cards[index];
      const key = cardKey(card, index);
      btn.classList.toggle("is-active", index === currentIndex);
      btn.classList.toggle("is-known", knownCards.has(key));
      btn.classList.toggle("is-review", reviewCards.has(key));
    });

    const active = els.strip.querySelector(".flashcard-strip-card.is-active");
    active?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }

  function sessionProgressCount() {
    if (!cards.length) return 0;
    return Math.min(Math.max(reviewedCount(), currentIndex + 1), cards.length);
  }

  function updateProgress() {
    const sessionCount = sessionProgressCount();
    const percent = cards.length
      ? Math.round((sessionCount / cards.length) * 100)
      : 0;

    if (els.progressValue) els.progressValue.textContent = `${percent}%`;
    if (els.progressBar) els.progressBar.style.width = `${percent}%`;
  }

  function renderCompletionCard() {
    els.stage?.classList.remove("is-generating");
    els.stage?.classList.add("is-complete");
    if (els.empty) els.empty.hidden = true;
    els.card?.classList.remove(
      "is-empty",
      "is-flipped",
      "is-swipe-next",
      "is-swipe-prev",
    );
    els.card?.classList.add("is-complete");
    els.layout?.classList.remove("is-empty");
    if (els.card) els.card.style.transform = "";
    if (els.deckName) els.deckName.textContent = "Flashcards complete";
    if (els.deckMeta)
      els.deckMeta.textContent = `${knownCards.size} known - ${reviewCards.size} need another round.`;
    if (els.counter)
      els.counter.textContent = `${cards.length} of ${cards.length}`;
    if (els.label) els.label.textContent = "Done";
    if (els.frontText) {
      const completeText = `Deck reviewed\n${knownCards.size} known · ${reviewCards.size} review again`;
      els.frontText.textContent = completeText;
      syncTextDensity(els.frontText, completeText);
    }
    if (els.backText) {
      els.backText.textContent = "";
      syncTextDensity(els.backText, "");
    }
    if (els.hint)
      els.hint.textContent = reviewCards.size
        ? "Review the hard cards now before starting another deck."
        : "Clean round. You can restart if you want one more pass.";
    if (els.reveal) els.reveal.textContent = "Restart";
    if (els.review)
      els.review.textContent = reviewCards.size
        ? "Review again"
        : "Review deck";
    if (els.know) els.know.textContent = "Finished";
    if (els.next) els.next.textContent = "Next";
    if (els.prev) els.prev.textContent = "Previous";
    updateProgress();
  }

  function renderCard() {
    if (!cards.length) {
      resetStage("No flashcards yet.");
      return;
    }

    if (sessionFinished) {
      renderCompletionCard();
      return;
    }

    els.stage?.classList.remove("is-complete", "is-generating");
    if (els.empty) els.empty.hidden = true;
    els.card?.classList.remove(
      "is-complete",
      "is-empty",
      "is-swipe-next",
      "is-swipe-prev",
    );
    els.layout?.classList.remove("is-empty");
    els.card?.classList.toggle("is-flipped", isRevealed);
    if (els.card) els.card.style.transform = "";
    const card = cards[currentIndex];
    const key = cardKey(card, currentIndex);
    if (els.deckName)
      els.deckName.textContent = card.deck_title || "Flashcard deck";
    if (els.deckMeta) els.deckMeta.textContent = sessionMeta();
    if (els.counter)
      els.counter.textContent = `${currentIndex + 1} of ${cards.length}`;
    if (els.label) els.label.textContent = "Question";
    if (els.frontText) {
      els.frontText.textContent = card.front;
      syncTextDensity(els.frontText, card.front);
    }
    if (els.backText) {
      els.backText.textContent = card.back;
      syncTextDensity(els.backText, card.back);
    }
    if (els.hint) els.hint.textContent = "Click the card to reveal the answer.";
    if (els.prev) els.prev.textContent = "Previous";
    if (els.reveal) els.reveal.textContent = isRevealed ? "Hide" : "Reveal";
    if (els.review) els.review.textContent = "Review again";
    if (els.know) els.know.textContent = "Know it";
    if (els.next) els.next.textContent = "Next";
    els.know?.classList.toggle("is-active", knownCards.has(key));
    els.review?.classList.toggle("is-active", reviewCards.has(key));
    updateProgress();
    renderStrip();
  }

  function renderGeneratingDeck() {
    cards = [];
    currentIndex = 0;
    isRevealed = false;
    sessionFinished = false;
    knownCards = new Set();
    reviewCards = new Set();
    activeDeckId = null;
    setFlowMode("study");
    els.layout?.classList.remove("is-empty");
    if (els.empty) els.empty.hidden = true;
    els.stage?.classList.remove("is-complete");
    els.stage?.classList.add("is-generating");
    els.card?.classList.remove(
      "is-complete",
      "is-flipped",
      "is-dragging",
      "is-swipe-next",
      "is-swipe-prev",
    );
    els.card?.classList.add("is-empty");
    if (els.card) els.card.style.transform = "";
    if (els.deckName) els.deckName.textContent = "Building deck";
    if (els.deckMeta) els.deckMeta.textContent = "Saving your flashcards...";
    if (els.counter) els.counter.textContent = "0 of 0";
    if (els.progressValue) els.progressValue.textContent = "0%";
    if (els.progressBar) els.progressBar.style.width = "0%";
    if (els.label) els.label.textContent = "Generating";
    if (els.frontText) {
      els.frontText.textContent = "Building deck...";
      syncTextDensity(els.frontText, "Building deck...");
    }
    if (els.backText) {
      els.backText.textContent = "";
      syncTextDensity(els.backText, "");
    }
    if (els.hint) els.hint.textContent = "Saving...";
    if (els.strip) els.strip.innerHTML = "";
    els.know?.classList.remove("is-active");
    els.review?.classList.remove("is-active");
  }

  function goToCard(index) {
    if (!cards.length) return;
    sessionFinished = false;
    const previousIndex = currentIndex;
    currentIndex = (index + cards.length) % cards.length;
    setFlipped(false);
    renderCard();
    saveFlashcardProgress();
    if (currentIndex === previousIndex || !els.card) return;

    const direction = index > previousIndex ? "is-step-next" : "is-step-prev";
    els.card.classList.remove("is-step-next", "is-step-prev");
    void els.card.offsetWidth;
    els.card.classList.add(direction);
    clearTimeout(cardMotionTimer);
    cardMotionTimer = setTimeout(() => {
      els.card?.classList.remove("is-step-next", "is-step-prev");
    }, 320);
  }

  function flipCard() {
    if (!cards.length) return;

    if (sessionFinished) {
      goToCard(0);
      return;
    }

    setFlipped(!isRevealed);
  }

  function finishSession() {
    if (!cards.length) return;
    sessionFinished = true;
    isRevealed = false;
    saveFlashcardProgress();
    renderCard();
  }

  function reviewAgain() {
    if (!cards.length) return;
    const index = firstReviewIndex();
    goToCard(index >= 0 ? index : 0);
  }

  function markCard(status) {
    if (!cards.length || sessionFinished) return;

    const key = cardKey(cards[currentIndex], currentIndex);
    if (status === "known") {
      knownCards.add(key);
      reviewCards.delete(key);
    } else {
      reviewCards.add(key);
      knownCards.delete(key);
    }

    saveFlashcardProgress();

    const nextIndex = nextUnreviewedIndex(currentIndex);
    if (nextIndex >= 0) {
      goToCard(nextIndex);
      return;
    }

    finishSession();
  }

  function snapCard() {
    if (!els.card) return;
    els.card.classList.remove("is-dragging", "is-swipe-next", "is-swipe-prev");
    els.card.style.transform = "translate3d(0, 0, 0)";
  }

  function finishSwipe(step, exitX) {
    if (!els.card) return;

    els.card.classList.remove("is-dragging", "is-swipe-next", "is-swipe-prev");
    els.card.style.transform = `translate3d(${exitX}%, 0, 0)`;

    window.setTimeout(() => {
      els.card.classList.add("is-dragging");
      els.card.style.transform = "translate3d(0, 0, 0)";
      goToCard(currentIndex + step);
      requestAnimationFrame(() => {
        els.card?.classList.remove(
          "is-dragging",
          "is-swipe-next",
          "is-swipe-prev",
        );
      });
    }, 180);
  }

  function onPointerDown(event) {
    if (!cards.length || !els.card || event.button > 0) return;

    drag = {
      id: event.pointerId,
      startX: event.clientX,
      dx: 0,
      moved: false,
    };

    els.card.setPointerCapture?.(event.pointerId);
    els.card.classList.add("is-dragging");
  }

  function onPointerMove(event) {
    if (!drag || drag.id !== event.pointerId || !els.card) return;

    drag.dx = event.clientX - drag.startX;
    if (Math.abs(drag.dx) > 6) drag.moved = true;

    const rotate = Math.max(-8, Math.min(8, drag.dx / 22));
    els.card.classList.toggle("is-swipe-next", drag.dx < -18);
    els.card.classList.toggle("is-swipe-prev", drag.dx > 18);
    els.card.style.transform = `translate3d(${drag.dx}px, 0, 0) rotateZ(${rotate}deg)`;
  }

  function onPointerUp(event) {
    if (!drag || drag.id !== event.pointerId) return;

    const dx = drag.dx;
    const moved = drag.moved;
    drag = null;

    if (moved) suppressNextClick = true;

    if (Math.abs(dx) >= SWIPE_THRESHOLD && cards.length > 1) {
      finishSwipe(dx < 0 ? 1 : -1, dx < 0 ? -120 : 120);
      return;
    }

    snapCard();
  }

  function onPointerCancel(event) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    suppressNextClick = true;
    snapCard();
  }

  function onKeyDown(event) {
    if (
      !cards.length ||
      isTypingTarget(event.target) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToCard(currentIndex - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToCard(currentIndex + 1);
      return;
    }

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      flipCard();
    }
  }

  function setDeckOptions() {
    if (!els.deckSelect) return;

    const current = els.deckSelect.value;
    els.deckSelect.innerHTML = `<option value="">Choose a saved deck</option>`;

    decks.forEach((deck) => {
      const opt = document.createElement("option");
      opt.value = deck.id;
      opt.textContent = deck.title || "Untitled deck";
      els.deckSelect.appendChild(opt);
    });

    if (current && decks.some((d) => d.id === current)) {
      els.deckSelect.value = current;
    }

    syncCustomSelect(els.deckSelect);
  }

  function getInitialDeckId() {
    return new URLSearchParams(window.location.search).get("deck") || "";
  }

  function getInitialNoteId() {
    return new URLSearchParams(window.location.search).get("note") || "";
  }

  function setFlowMode(mode) {
    const page = document.querySelector(".study-page");
    const layout = document.querySelector(".flashcards-layout");
    const isStudy = mode === "study";
    const isCreate = mode === "create";

    page?.classList.toggle("is-study-mode", isStudy);
    page?.classList.toggle("is-create-mode", isCreate);
    layout?.classList.toggle("is-study-mode", isStudy);
    layout?.classList.toggle("is-create-mode", isCreate);
  }

  function isMobileFlow() {
    return window.matchMedia?.("(max-width: 1024px)")?.matches;
  }

  function scrollPageTop() {
    const root = document.scrollingElement || document.documentElement;

    requestAnimationFrame(() => {
      root.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
    });
  }

  function scrollToTarget(selector, behavior = "smooth") {
    requestAnimationFrame(() => {
      document
        .querySelector(selector)
        ?.scrollIntoView({ behavior, block: "start" });
    });
  }

  function setCreateModal(open) {
    if (!els.createModal) return;

    els.createModal.hidden = !open;
    els.createModal.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("study-modal-open", open);

    if (open) {
      window.setTimeout(() => {
        els.noteSelect?.focus?.();
      }, 80);
    }
  }

  function openCreateModal() {
    document.activeElement?.blur?.();
    setFlowMode("create");
    setCreateModal(true);
  }

  function closeCreateModal() {
    setCreateModal(false);
  }

  function focusCreateForm() {
    openCreateModal();
  }

  function focusPageTop() {
    scrollPageTop();
  }

  async function loadDecks() {
    const state = await tools.ready();
    if (!state.supabase || !state.user) return;

    const { data, error } = await state.supabase
      .from("flashcard_decks")
      .select("id,title,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);

    decks = error || !Array.isArray(data) ? [] : data;
    setDeckOptions();
  }

  function focusDeckStage(options = {}) {
    setFlowMode("study");

    if (isMobileFlow()) {
      scrollPageTop();
      return;
    }

    scrollToTarget(".deck-stage", options.behavior || "smooth");
  }

  async function loadCards(deckId, options = {}) {
    const state = await tools.ready();
    if (!state.supabase || !deckId) return;

    const deck = decks.find((d) => d.id === deckId);
    const { data, error } = await state.supabase
      .from("flashcards")
      .select("id,front,back,position,deck_id")
      .eq("deck_id", deckId)
      .order("position", { ascending: true });

    if (error || !Array.isArray(data)) {
      tools.toast("Could not load this deck.", "error");
      return;
    }

    activeDeckId = deckId;
    cards = data.map((card) => ({
      ...card,
      deck_title: deck?.title || "Flashcard deck",
    }));
    currentIndex = 0;
    isRevealed = false;
    sessionFinished = false;

    try {
      const { data: refreshed } = await state.supabase.auth.getUser();
      if (refreshed?.user) state.user = refreshed.user;
    } catch {}

    const validKeys = new Set(cards.map((card, index) => cardKey(card, index)));
    const saved = readFlashcardProgress(state.user?.user_metadata, deckId);
    knownCards = new Set(validCardKeys(saved?.known_ids, validKeys));
    reviewCards = new Set(validCardKeys(saved?.review_ids, validKeys));
    renderCard();
    if (options.focus) focusDeckStage({ repeat: true });
  }

  async function loadNotes() {
    if (!els.noteSelect) return;

    const notes = await tools.fetchNotes(30);
    els.noteSelect.innerHTML = `<option value="">Choose a saved Note</option>`;

    notes.forEach((note) => {
      const opt = document.createElement("option");
      opt.value = note.id;
      opt.textContent = note.title || "Untitled note";
      els.noteSelect.appendChild(opt);
    });

    syncCustomSelect(els.noteSelect);
  }

  async function useSelectedNote() {
    const id = els.noteSelect?.value;

    if (!id) {
      if (els.source) els.source.value = "";
      return;
    }

    const note = await tools.fetchNoteText(id);
    if (!note?.content) {
      if (els.source) els.source.value = "";
      tools.toast("Could not open this Note.", "error");
      return;
    }

    if (els.source)
      els.source.value = String(note.content || "").slice(0, 22000);

    if (!els.title.value.trim()) {
      els.title.value = `${note.title || "Saved Note"} flashcards`.slice(0, 90);
    }
  }

  function sanitizeCards(aiCards) {
    return (Array.isArray(aiCards) ? aiCards : [])
      .map((card) => ({
        front: String(card.front || card.question || "").trim(),
        back: String(card.back || card.answer || "").trim(),
      }))
      .filter((card) => card.front && card.back)
      .slice(0, 40);
  }

  async function saveGeneratedDeck(title, aiCards) {
    const state = await tools.ready();
    if (!state.supabase || !state.user) throw new Error("Not signed in");

    const { data: deck, error: deckError } = await state.supabase
      .from("flashcard_decks")
      .insert({ user_id: state.user.id, title })
      .select("id,title")
      .single();

    if (deckError || !deck?.id)
      throw deckError || new Error("Could not create deck");

    const rows = aiCards.map((card, index) => ({
      deck_id: deck.id,
      user_id: state.user.id,
      front: card.front,
      back: card.back,
      position: index + 1,
    }));

    const { error: cardError } = await state.supabase
      .from("flashcards")
      .insert(rows);
    if (cardError) throw cardError;

    return deck.id;
  }

  async function generateDeck() {
    const source = (els.source?.value || "").trim();
    if (source.length < 40) {
      tools.toast("Choose a saved Note first.", "error");
      return;
    }

    const rawCount = Number(els.count?.value || 12);

    if (rawCount > 40) {
      tools.toast("Maximum is 40 flashcards per deck.", "error");
      if (els.count) els.count.value = 40;
      return;
    }

    const requestedCount = clampCount(rawCount);
    const title =
      (els.title?.value || "").trim() ||
      source
        .split(/\n|\.|:/)
        .find(Boolean)
        ?.slice(0, 48) ||
      "Study deck";

    els.generate.disabled = true;
    els.generate.classList.add("is-loading");
    closeCreateModal();
    renderGeneratingDeck();
    startGeneratePhrases();
    focusDeckStage({ behavior: "smooth" });

    try {
      const data = await tools.ai({
        task: "flashcards",
        topic: source,
        card_count: requestedCount,
      });

      const aiCards = sanitizeCards(data.cards);
      if (!aiCards.length)
        throw new Error("Could not generate flashcards from this note.");

      const deckTitle = String(data.title || title)
        .trim()
        .slice(0, 90);
      const deckId = await saveGeneratedDeck(deckTitle, aiCards);

      await loadDecks();
      els.deckSelect.value = deckId;
      syncCustomSelect(els.deckSelect);
      await loadCards(deckId, { focus: true });
    } catch (err) {
      resetStage();
      tools.toast(err?.message || "Could not generate flashcards.", "error");
    } finally {
      els.generate.disabled = false;
      els.generate.classList.remove("is-loading");
      stopGeneratePhrases();
    }
  }

  async function deleteDeck() {
    const deckId = els.deckSelect?.value;
    if (!deckId) return;

    const ok = window.confirm(
      "Delete this flashcard deck? This can't be undone.",
    );
    if (!ok) return;

    const state = await tools.ready();
    const { error } = await state.supabase
      .from("flashcard_decks")
      .delete()
      .eq("id", deckId);

    if (error) {
      tools.toast("Could not delete this deck.", "error");
      return;
    }

    tools.toast("Deck deleted.");
    resetStage();
    await loadDecks();
    syncCustomSelect(els.deckSelect);
  }

  function bind() {
    els.openCreate?.addEventListener("click", openCreateModal);
    els.createClose?.forEach((button) => {
      button.addEventListener("click", closeCreateModal);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.createModal?.hidden) {
        closeCreateModal();
      }
    });

    els.noteSelect?.addEventListener("change", useSelectedNote);
    els.deckSelect?.addEventListener("change", (event) => {
      const deckId = event.target.value;
      if (!deckId) {
        resetStage();
        focusPageTop();
        return;
      }

      loadCards(deckId, { focus: true });
    });
    els.generate?.addEventListener("click", generateDeck);
    els.deleteDeck?.addEventListener("click", deleteDeck);

    els.card?.addEventListener("click", () => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }

      flipCard();
    });

    els.card?.addEventListener("pointerdown", onPointerDown);
    els.card?.addEventListener("pointermove", onPointerMove);
    els.card?.addEventListener("pointerup", onPointerUp);
    els.card?.addEventListener("pointercancel", onPointerCancel);

    els.strip?.addEventListener("click", (event) => {
      const btn = event.target.closest(".flashcard-strip-card");
      if (!btn) return;
      goToCard(Number(btn.dataset.index || 0));
    });

    els.reveal?.addEventListener("click", flipCard);
    els.review?.addEventListener("click", () => {
      if (sessionFinished) {
        reviewAgain();
        return;
      }

      markCard("review");
    });
    els.know?.addEventListener("click", () => {
      markCard("known");
    });

    els.prev?.addEventListener("click", () => {
      if (sessionFinished) {
        goToCard(0);
        return;
      }

      goToCard(currentIndex - 1);
    });

    els.next?.addEventListener("click", () => {
      if (sessionFinished) {
        goToCard(0);
        return;
      }

      if (currentIndex >= cards.length - 1) {
        finishSession();
        return;
      }

      goToCard(currentIndex + 1);
    });

    document.addEventListener("keydown", onKeyDown);
  }

  async function boot() {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    cacheEls();
    renderLucideIcons();
    bind();
    enhanceSelects();
    resetStage();

    const initialDeckId = getInitialDeckId();
    const initialNoteId = getInitialNoteId();

    const state = await tools.ready();
    if (!state.isPro) return;

    await Promise.all([loadDecks(), loadNotes()]);

    const deckId = decks.find((deck) => deck.id === initialDeckId)?.id;
    const hasInitialNote = Boolean(
      initialNoteId &&
      els.noteSelect?.querySelector(
        `option[value="${CSS.escape(initialNoteId)}"]`,
      ),
    );

    if (deckId) {
      els.deckSelect.value = deckId;
      syncCustomSelect(els.deckSelect);
      await loadCards(deckId, { focus: true });
    } else if (hasInitialNote) {
      els.noteSelect.value = initialNoteId;
      syncCustomSelect(els.noteSelect);
      await useSelectedNote();
      focusPageTop();
    } else {
      focusPageTop();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
