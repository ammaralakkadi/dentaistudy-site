// assets/js/study-builder/flashcards.js
(() => {
  "use strict";

  const tools = window.DentAIStudyTools;
  const SWIPE_THRESHOLD = 90;
  const QUICK_PRESETS = {
    ore: {
      title: "ORE Part 1 flashcards",
      count: 18,
      source:
        "Generate high-yield ORE Part 1 dental flashcards covering diagnosis, treatment planning, medical emergencies, pharmacology, radiology, ethics, and common clinical reasoning traps.",
    },
    adex: {
      title: "ADEX OSCE prompt deck",
      count: 18,
      source:
        "Generate ADEX OSCE flashcards for patient communication, medical history review, infection control, emergency drugs, local anesthesia, radiographic interpretation, and restorative decision-making.",
    },
    inbde: {
      title: "INBDE case basics deck",
      count: 18,
      source:
        "Generate INBDE flashcards focused on case-based dental reasoning, high-yield foundation areas, diagnosis, risk factors, prevention, pharmacology, oral pathology, and treatment planning.",
    },
    adc: {
      title: "ADC written flashcards",
      count: 18,
      source:
        "Generate ADC written exam flashcards covering general dentistry, clinical judgment, operative dentistry, endodontics, periodontics, prosthodontics, oral surgery, and patient safety.",
    },
    ndecc: {
      title: "NDECC clinical skills deck",
      count: 18,
      source:
        "Generate NDECC flashcards for clinical skills, situational judgment, procedure protocols, diagnosis, communication, infection control, and examiner-style decision points.",
    },
    sdle: {
      title: "SDLE high-yield deck",
      count: 18,
      source:
        "Generate SDLE dental flashcards covering Saudi licensing exam high-yield topics, restorative dentistry, oral surgery, endodontics, periodontics, prosthodontics, pediatric dentistry, and prevention.",
    },
    uae: {
      title: "UAE licensing deck",
      count: 18,
      source:
        "Generate UAE DHA MOH DOH dental licensing flashcards covering Prometric-style general dentistry, oral surgery, periodontics, endodontics, prosthodontics, pediatric dentistry, and emergency care.",
    },
    endodontics: {
      title: "Endodontics recall deck",
      count: 16,
      source:
        "Generate high-yield endodontics flashcards covering pulp diagnosis, periapical diagnosis, working length, irrigation, obturation, missed canals, retreatment, trauma, and antibiotic decisions.",
    },
    operative: {
      title: "Operative dentistry deck",
      count: 16,
      source:
        "Generate operative dentistry flashcards covering caries removal, bonding, matrix and wedging, composite placement, postoperative sensitivity, rubber dam isolation, deep margin elevation, and restoration repair.",
    },
    prosthodontics: {
      title: "Prosthodontics recall deck",
      count: 16,
      source:
        "Generate prosthodontics flashcards covering complete dentures, RPD design, crown preparation, ferrule effect, bridges, implant prosthodontics, occlusion, impressions, and common exam mistakes.",
    },
    periodontology: {
      title: "Periodontology recall deck",
      count: 16,
      source:
        "Generate periodontology flashcards covering staging and grading, probing, CAL, BOP, furcation, SRP, reevaluation, periodontal abscess, peri-implant disease, and maintenance decisions.",
    },
    "oral-surgery": {
      title: "Oral surgery recall deck",
      count: 16,
      source:
        "Generate oral surgery flashcards covering extraction decisions, third molars, dry socket, infection spread, bleeding control, anticoagulants, MRONJ, oroantral communication, and trauma triage.",
    },
    "oral-anatomy": {
      title: "Oral anatomy recall deck",
      count: 16,
      source:
        "Generate oral anatomy flashcards covering trigeminal nerve branches, local anesthesia landmarks, muscles of mastication, TMJ, maxillary sinus, fascial spaces, lymph drainage, and tooth morphology.",
    },
    orthodontics: {
      title: "Orthodontics recall deck",
      count: 16,
      source:
        "Generate orthodontics flashcards covering classifications, space analysis, anchorage, growth modification, crossbite, open bite, deep bite, extractions, retainers, and impacted canines.",
    },
    pediatric: {
      title: "Pediatric dentistry deck",
      count: 16,
      source:
        "Generate pediatric dentistry flashcards covering behavior guidance, pulp therapy, primary molar crowns, space maintainers, dental trauma, local anesthesia dosing, SDF, Hall technique, and child abscess care.",
    },
  };
  const els = {};
  let decks = [];
  let cards = [];
  let currentIndex = 0;
  let isRevealed = false;
  let activeDeckId = null;
  let suppressNextClick = false;
  let drag = null;
  let knownCards = new Set();
  let reviewCards = new Set();
  let cardMotionTimer = null;
  const customSelects = new Map();
  let customSelectEventsBound = false;

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

  function cacheEls() {
    els.layout = document.querySelector(".flashcards-layout");
    els.title = qs("deckTitleInput");
    els.count = qs("cardCountInput");
    els.source = qs("flashcardSourceInput");
    els.chatSelect = qs("flashcardChatSelect");
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
    return Math.max(6, Math.min(30, Math.round(n)));
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
    menu.style.maxHeight = `${Math.max(160, Math.min(260, available))}px`;
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
    [els.chatSelect, els.deckSelect].forEach(enhanceSelect);

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

  function resetStage(message) {
    cards = [];
    currentIndex = 0;
    isRevealed = false;
    knownCards = new Set();
    reviewCards = new Set();
    setFlowMode("normal");
    els.layout?.classList.add("is-empty");
    els.card?.classList.add("is-empty");
    els.card?.classList.remove(
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
        "Create a deck from notes or choose a saved deck.";
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

      progress[activeDeckId] = {
        known_ids: Array.from(knownCards),
        review_ids: Array.from(reviewCards),
        total: cards.length,
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

  function updateProgress() {
    const percent = cards.length
      ? Math.round(((currentIndex + 1) / cards.length) * 100)
      : 0;

    if (els.progressValue) els.progressValue.textContent = `${percent}%`;
    if (els.progressBar) els.progressBar.style.width = `${percent}%`;
  }

  function renderCard() {
    if (!cards.length) {
      resetStage("No flashcards yet.");
      return;
    }

    els.card?.classList.remove("is-empty", "is-swipe-next", "is-swipe-prev");
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
    if (els.frontText) els.frontText.textContent = card.front;
    if (els.backText) els.backText.textContent = card.back;
    if (els.hint) els.hint.textContent = "Click the card to reveal the answer.";
    if (els.reveal) els.reveal.textContent = isRevealed ? "Hide" : "Reveal";
    els.know?.classList.toggle("is-active", knownCards.has(key));
    els.review?.classList.toggle("is-active", reviewCards.has(key));
    updateProgress();
    renderStrip();
  }

  function goToCard(index) {
    if (!cards.length) return;
    const previousIndex = currentIndex;
    currentIndex = (index + cards.length) % cards.length;
    setFlipped(false);
    renderCard();
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
    setFlipped(!isRevealed);
  }

  function markCard(status) {
    if (!cards.length) return;

    const key = cardKey(cards[currentIndex], currentIndex);
    if (status === "known") {
      knownCards.add(key);
      reviewCards.delete(key);
    } else {
      reviewCards.add(key);
      knownCards.delete(key);
    }

    saveFlashcardProgress();

    if (cards.length > 1) {
      goToCard(currentIndex + 1);
      return;
    }

    renderCard();
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

  function focusCreateForm() {
    document.activeElement?.blur?.();
    setFlowMode("create");

    if (isMobileFlow()) {
      scrollPageTop();
      return;
    }

    scrollToTarget(".flashcard-create-form");
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
    const validKeys = new Set(cards.map((card, index) => cardKey(card, index)));
    const saved = readFlashcardProgress(state.user?.user_metadata, deckId);
    knownCards = new Set(validCardKeys(saved?.known_ids, validKeys));
    reviewCards = new Set(validCardKeys(saved?.review_ids, validKeys));
    renderCard();
    if (options.focus) focusDeckStage({ repeat: true });
  }

  async function loadChats() {
    if (!els.chatSelect) return;

    const chats = await tools.fetchConversations(30);
    els.chatSelect.innerHTML = `<option value="">Optional: pull from a saved chat</option>`;

    chats.forEach((chat) => {
      const opt = document.createElement("option");
      opt.value = chat.id;
      opt.textContent = chat.title || "Untitled study chat";
      els.chatSelect.appendChild(opt);
    });

    syncCustomSelect(els.chatSelect);
  }

  async function useSelectedChat() {
    const id = els.chatSelect?.value;
    if (!id) return;

    const text = await tools.fetchConversationText(id);
    if (!text) {
      tools.toast("That chat has no saved messages yet.", "error");
      return;
    }

    els.source.value = text.slice(0, 18000);
    if (!els.title.value.trim()) {
      const opt = els.chatSelect.options[els.chatSelect.selectedIndex];
      els.title.value = opt?.textContent || "Study deck";
    }
  }

  function useQuickPreset(presetId) {
    const preset = QUICK_PRESETS[presetId];
    if (!preset || els.generate?.disabled) return;

    if (els.title) els.title.value = preset.title;
    if (els.count) els.count.value = String(preset.count);
    if (els.source) els.source.value = preset.source;

    focusCreateForm();
  }

  function sanitizeCards(aiCards) {
    return (Array.isArray(aiCards) ? aiCards : [])
      .map((card) => ({
        front: String(card.front || card.question || "").trim(),
        back: String(card.back || card.answer || "").trim(),
      }))
      .filter((card) => card.front && card.back)
      .slice(0, 30);
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
      tools.toast("Paste notes or pull a saved chat first.", "error");
      return;
    }

    const requestedCount = clampCount(els.count?.value);
    const title =
      (els.title?.value || "").trim() ||
      source
        .split(/\n|\.|:/)
        .find(Boolean)
        ?.slice(0, 48) ||
      "Study deck";

    els.generate.disabled = true;
    els.generate.classList.add("is-loading");
    setGenerateLabel("Generating...");

    try {
      const data = await tools.ai({
        task: "flashcards",
        topic: source,
        card_count: requestedCount,
      });

      const aiCards = sanitizeCards(data.cards);
      if (!aiCards.length) throw new Error("No flashcards returned");

      const deckTitle = String(data.title || title)
        .trim()
        .slice(0, 90);
      const deckId = await saveGeneratedDeck(deckTitle, aiCards);

      tools.toast("Flashcards saved.");
      await loadDecks();
      els.deckSelect.value = deckId;
      syncCustomSelect(els.deckSelect);
      await loadCards(deckId, { focus: true });
    } catch (err) {
      tools.toast(err?.message || "Could not generate flashcards.", "error");
    } finally {
      els.generate.disabled = false;
      els.generate.classList.remove("is-loading");
      setGenerateLabel("Generate flashcards");
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
    document
      .querySelector("[data-flashcard-presets]")
      ?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-flashcard-preset]");
        if (!btn) return;
        useQuickPreset(btn.dataset.flashcardPreset);
      });

    els.chatSelect?.addEventListener("change", useSelectedChat);
    els.deckSelect?.addEventListener("change", (event) =>
      loadCards(event.target.value, { focus: true }),
    );
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
      markCard("review");
    });
    els.know?.addEventListener("click", () => {
      markCard("known");
    });

    els.prev?.addEventListener("click", () => {
      goToCard(currentIndex - 1);
    });

    els.next?.addEventListener("click", () => {
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

    const state = await tools.ready();
    if (!state.isPro) return;

    await Promise.all([loadDecks(), loadChats()]);

    const deckId = decks.find((deck) => deck.id === initialDeckId)?.id;

    if (deckId) {
      els.deckSelect.value = deckId;
      syncCustomSelect(els.deckSelect);
      await loadCards(deckId, { focus: true });
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
