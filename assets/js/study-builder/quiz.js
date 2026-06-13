// assets/js/study-builder/quiz.js
(() => {
  "use strict";

  const tools = window.DentAIStudyTools;
  const QUICK_PRESETS = {
    ore: {
      title: "ORE emergency OSCE quiz",
      count: 12,
      difficulty: "hard",
      source:
        "Generate ORE Part 2 style dental medical emergency MCQs and OSCE decision questions with explanations. Focus on adult drug administration, dose ranges, oxygen, sequence of actions, status epilepticus, anaphylaxis, asthma, hypoglycemia, syncope, angina/MI, adrenal crisis, local anesthetic toxicity, and common UK dental practice station mistakes.",
    },
    adex: {
      title: "ADEX critical error quiz",
      count: 12,
      difficulty: "hard",
      source:
        "Generate ADEX-style exam questions with explanations focused on critical failure traps. Cover anterior endodontic access on tooth #8, lateral perforation risk, crown preparation over-taper, under-reduction, margin errors, restorative decision-making, typodont grading risk, and recognizing automatic-failure patterns.",
    },
    inbde: {
      title: "INBDE patient box quiz",
      count: 12,
      difficulty: "hard",
      source:
        "Generate INBDE Patient Box style MCQs with explanations. Include medically complex cases involving uncontrolled diabetes, warfarin and INR, dual antiplatelet therapy, prosthetic heart valves, antibiotic prophylaxis, penicillin allergy, facial space infection, pharmacology, pathology, ethics, autonomy, and treatment sequencing.",
    },
    adc: {
      title: "ADC guideline scenario quiz",
      count: 12,
      difficulty: "hard",
      source:
        "Generate ADC-style scenario-based MCQs with explanations. Focus on infection control failures, failed autoclave cycle/data logging, professional boundaries, cultural safety, consent, patient safety, referral, emergency triage, and best-answer reasoning when several choices seem acceptable.",
    },
    ndecc: {
      title: "NDECC situational quiz",
      count: 12,
      difficulty: "hard",
      source:
        "Generate NDECC-style situational judgment MCQs with explanations. Focus on patient refusal, unnecessary extraction requests, salvageable root canal communication, informed consent, autonomy, ethical compliance, documentation, infection control, and examiner-style Canadian clinical reasoning.",
    },
    sdle: {
      title: "SDLE trauma quiz",
      count: 12,
      difficulty: "hard",
      source:
        "Generate SDLE-style MCQs with explanations focused on pediatric trauma, immature permanent teeth, complicated crown-root fracture timing, avulsion and luxation management, community dentistry, DMFT calculations, prevention, fluoride, and high-yield Saudi licensing exam traps.",
    },
    uae: {
      title: "UAE medical risk quiz",
      count: 12,
      difficulty: "normal",
      source:
        "Generate UAE DHA MOH DOH Prometric-style MCQs with explanations focused on dental medical risk. Include antibiotic prophylaxis, prosthetic heart valves, penicillin allergy, anticoagulants, aspirin and clopidogrel, diabetes, hypertension, local anesthetic maximum dose, pediatric dosing, syncope, hypoglycemia, and LA toxicity.",
    },
    endodontics: {
      title: "Pulp diagnosis quiz",
      count: 10,
      difficulty: "normal",
      source:
        "Generate endodontics MCQs with explanations that test differentiation between reversible pulpitis, symptomatic irreversible pulpitis, necrotic pulp, symptomatic apical periodontitis, acute apical abscess, cracked tooth, horizontal root fracture, vertical root fracture, and trauma-related endodontic decisions.",
    },
    operative: {
      title: "Deep caries decision quiz",
      count: 10,
      difficulty: "normal",
      source:
        "Generate operative dentistry MCQs with explanations focused on deep caries decision-making. Test direct pulp cap vs indirect pulp cap, selective caries removal, stepwise excavation, bonding failure, postoperative sensitivity, rubber dam isolation, matrix and wedge selection, restoration repair, and caries risk.",
    },
    prosthodontics: {
      title: "Crown preparation quiz",
      count: 10,
      difficulty: "normal",
      source:
        "Generate prosthodontics MCQs with explanations focused on crown preparation and prostho reasoning. Include ferrule, finish line selection, taper, occlusal clearance, biologic width, impression errors, temporary crowns, RPD design basics, pontic design, occlusion, and common failure traps.",
    },
    periodontology: {
      title: "AAP classification quiz",
      count: 10,
      difficulty: "normal",
      source:
        "Generate periodontology MCQs with explanations comparing 1999 periodontal classification with current staging and grading. Test CAL, RBL, probing depth, BOP, furcation, mobility, grade modifiers, diabetes, smoking, periodontal abscess, peri-implant disease, treatment planning, and maintenance.",
    },
    "oral-surgery": {
      title: "MRONJ and bleeding quiz",
      count: 10,
      difficulty: "normal",
      source:
        "Generate oral surgery MCQs with explanations focused on extraction risk. Include MRONJ/BRONJ, bisphosphonate history, antiresorptive therapy, anticoagulants, aspirin and clopidogrel, bleeding control, dry socket, oroantral communication, odontogenic infection spread, third molars, and referral red flags.",
    },
    "oral-anatomy": {
      title: "Fascial space quiz",
      count: 10,
      difficulty: "normal",
      source:
        "Generate oral anatomy MCQs with explanations focused on fascial space infections and Ludwig’s angina. Test anatomical borders, submandibular/sublingual/submental spaces, airway risk, infection spread, local anesthesia landmarks, trigeminal nerve branches, TMJ, maxillary sinus, and lymph drainage.",
    },
    orthodontics: {
      title: "Class II diagnosis quiz",
      count: 10,
      difficulty: "normal",
      source:
        "Generate orthodontics MCQs with explanations comparing Class II Division 1 and Class II Division 2 malocclusion. Test clinical features, incisor inclination, overjet, overbite, lip competence, cephalometric clues, facial profile, radiographic features, treatment timing, and exam traps.",
    },
    pediatric: {
      title: "Pediatric emergency quiz",
      count: 10,
      difficulty: "normal",
      source:
        "Generate pediatric dentistry MCQs with explanations focused on trauma and safety. Include immature permanent teeth, complicated crown-root fracture timing, avulsion, luxation injuries, pulp therapy, stainless steel crowns, space maintainers, local anesthetic maximum dose, SDF, Hall technique, and child abscess care.",
    },
  };
  const els = {};
  let decks = [];
  let quizzes = [];
  let questions = [];
  let answers = [];
  let currentIndex = 0;
  let activeQuizId = null;
  let activeAttemptId = null;
  let reviewed = false;
  let lastScore = null;
  let showingResult = false;
  let quizProgressSavePromise = Promise.resolve();
  let questionMotionTimer = null;
  let generatePhraseTimer = null;
  const customSelects = new Map();
  let customSelectEventsBound = false;

  const GENERATING_PHRASES = [
    "Generating quiz…",
    "Writing clinical questions…",
    "Building answer options…",
    "Saving your quiz…",
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

  function startGeneratePhrases() {
    let phraseIndex = 0;

    window.clearInterval(generatePhraseTimer);
    setGenerateLabel(GENERATING_PHRASES[phraseIndex]);

    generatePhraseTimer = window.setInterval(() => {
      phraseIndex = (phraseIndex + 1) % GENERATING_PHRASES.length;
      setGenerateLabel(GENERATING_PHRASES[phraseIndex]);
    }, 1300);
  }

  function stopGeneratePhrases() {
    window.clearInterval(generatePhraseTimer);
    generatePhraseTimer = null;
    setGenerateLabel("Generate quiz");
  }

  function cacheEls() {
    els.deckSelect = qs("quizDeckSelect");
    els.quizSelect = qs("quizSelect");
    els.source = qs("quizSourceInput");
    els.count = qs("questionCountInput");
    els.generate = qs("generateQuizBtn");
    els.title = qs("quizTitleInput");
    els.stageTitle = qs("quizStageTitle");
    els.stageMeta = qs("quizStageMeta");
    els.pill = qs("quizPill");
    els.progress = qs("quizProgressBar");
    els.map = qs("quizMap");
    els.question = qs("quizQuestion");
    els.options = qs("quizOptions");
    els.explanation = qs("quizExplanation");
    els.result = qs("quizResult");
    els.resultScore = qs("quizResultScore");
    els.resultTitle = qs("quizResultTitle");
    els.resultMeta = qs("quizResultMeta");
    els.reviewMissed = qs("reviewMissedBtn");
    els.prev = qs("prevQuestionBtn");
    els.next = qs("nextQuestionBtn");
    els.finish = qs("finishQuizBtn");
    els.deleteQuiz = qs("deleteQuizBtn");
    els.footer = qs("quizFooter");
  }

  function selectedDifficulty() {
    return (
      document.querySelector('input[name="quizDifficulty"]:checked')?.value ||
      "normal"
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
    [els.deckSelect, els.quizSelect].forEach(enhanceSelect);

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

  function setDifficulty(value) {
    const input = document.querySelector(
      `input[name="quizDifficulty"][value="${value}"]`,
    );
    if (input) input.checked = true;
  }

  function useQuickPreset(presetId) {
    const preset = QUICK_PRESETS[presetId];
    if (!preset || els.generate?.disabled) return;

    if (els.title) els.title.value = preset.title;
    if (els.count) els.count.value = String(preset.count);
    if (els.source) els.source.value = preset.source;
    setDifficulty(preset.difficulty);

    focusCreateForm();
  }

  function isTypingTarget(target) {
    return Boolean(
      target?.closest?.(
        "button, input, textarea, select, [contenteditable='true']",
      ),
    );
  }

  function getInitialQuizId() {
    return new URLSearchParams(window.location.search).get("quiz") || "";
  }

  function setFlowMode(mode) {
    const page = document.querySelector(".study-page");
    const layout = document.querySelector(".quiz-layout");
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

    scrollToTarget(".quiz-create-form");
  }

  function focusPageTop() {
    scrollPageTop();
  }

  function clampCount(value) {
    const n = Number(value || 10);
    return Math.max(5, Math.min(25, Math.round(n)));
  }

  function resetStage(message) {
    questions = [];
    answers = [];
    currentIndex = 0;
    activeQuizId = null;
    activeAttemptId = null;
    reviewed = false;
    lastScore = null;
    showingResult = false;

    setFlowMode("normal");
    document.querySelector(".quiz-stage")?.classList.remove("is-result");
    document.querySelector(".quiz-stage")?.classList.add("is-empty");
    if (els.stageTitle) els.stageTitle.textContent = "No quiz selected";
    if (els.stageMeta)
      els.stageMeta.textContent = "Generate a quiz or open a saved one.";
    if (els.pill) els.pill.textContent = "0 of 0";
    if (els.progress) els.progress.style.width = "0%";
    if (els.map) els.map.innerHTML = "";
    if (els.question) els.question.textContent = message || "No quiz yet.";
    if (els.options) els.options.innerHTML = "";
    if (els.explanation) {
      els.explanation.textContent = "";
      els.explanation.hidden = true;
    }
    if (els.result) els.result.hidden = true;
    if (els.finish) els.finish.textContent = "Finish";
  }

  function scoreQuiz() {
    return questions.reduce(
      (sum, q, index) => sum + (answers[index] === q.correct_index ? 1 : 0),
      0,
    );
  }

  function normalizeSavedAnswers(savedAnswers, total) {
    const values = Array.isArray(savedAnswers) ? savedAnswers : [];
    return Array.from({ length: total }, (_, index) => {
      const value = values[index];
      return Number.isInteger(value) ? value : null;
    });
  }

  async function loadLatestAttempt(quizId, total) {
    const state = await tools.ready();
    if (!state.supabase || !state.user || !quizId) return null;

    const { data, error } = await state.supabase
      .from("study_quiz_attempts")
      .select("id,answers,total,created_at")
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) return null;

    return {
      id: data.id,
      answers: normalizeSavedAnswers(data.answers, total),
    };
  }

  async function saveQuizProgressNow() {
    if (!activeQuizId || !questions.length) return;

    try {
      const state = await tools.ready();
      if (!state.supabase || !state.user) return;

      const total = questions.length;
      const payload = {
        quiz_id: activeQuizId,
        user_id: state.user.id,
        score: scoreQuiz(),
        total,
        answers,
      };

      if (activeAttemptId) {
        await state.supabase
          .from("study_quiz_attempts")
          .update(payload)
          .eq("id", activeAttemptId);
        return;
      }

      const { data, error } = await state.supabase
        .from("study_quiz_attempts")
        .insert(payload)
        .select("id")
        .single();

      if (!error && data?.id) activeAttemptId = data.id;
    } catch {}
  }

  function saveQuizProgress() {
    quizProgressSavePromise = quizProgressSavePromise.then(saveQuizProgressNow);
    return quizProgressSavePromise;
  }

  async function askQuizConfirm({ title, message, danger = false }) {
    if (typeof tools.askModal === "function") {
      return Boolean(
        await tools.askModal({
          title,
          message,
          danger,
        }),
      );
    }

    return window.confirm(message);
  }

  function scoreMessage(percent) {
    if (percent >= 85) return "Strong run - keep the pace.";
    if (percent >= 70) return "Close - review the misses while they are fresh.";
    return "Useful attempt - the missed questions are the next drill.";
  }

  function renderResult() {
    if (!lastScore) return;

    const stage = document.querySelector(".quiz-stage");
    stage?.classList.remove("is-empty");
    stage?.classList.add("is-result");

    if (els.stageTitle) els.stageTitle.textContent = "Quiz complete";
    if (els.stageMeta)
      els.stageMeta.textContent = scoreMessage(lastScore.percent);
    if (els.pill)
      els.pill.textContent = `${lastScore.score} of ${lastScore.total}`;
    if (els.progress) els.progress.style.width = "100%";
    if (els.resultScore) els.resultScore.textContent = `${lastScore.percent}%`;
    if (els.resultTitle) {
      els.resultTitle.textContent =
        lastScore.percent >= 85
          ? "Strong attempt"
          : lastScore.percent >= 70
            ? "Almost there"
            : "Review round needed";
    }
    if (els.resultMeta) {
      const missed = lastScore.total - lastScore.score;
      els.resultMeta.textContent = missed
        ? `${missed} missed - review them now before starting another drill.`
        : "Perfect run - keep this deck warm with a quick repeat later.";
    }
    if (els.result) els.result.hidden = false;
    if (els.finish) els.finish.textContent = "Reviewed";
  }

  function renderMap() {
    if (!els.map) return;

    if (els.map.children.length !== questions.length) {
      els.map.innerHTML = "";
      questions.forEach((q, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quiz-map-btn";
        btn.textContent = String(index + 1);
        btn.dataset.index = String(index);
        btn.setAttribute("aria-label", `Question ${index + 1}`);
        els.map.appendChild(btn);
      });
    }

    questions.forEach((q, index) => {
      const btn = els.map.children[index];
      if (!btn) return;
      const answered = answers[index] !== null;
      btn.classList.toggle("is-active", index === currentIndex);
      btn.classList.toggle("is-answered", answered);

      if (reviewed) {
        btn.classList.toggle("is-correct", answers[index] === q.correct_index);
        btn.classList.toggle("is-wrong", answers[index] !== q.correct_index);
      }
    });

    const active = els.map.querySelector(".quiz-map-btn.is-active");
    active?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }

  function renderQuestion() {
    if (showingResult && reviewed && lastScore) {
      renderResult();
      return;
    }

    if (!questions.length) {
      resetStage("No quiz yet.");
      return;
    }

    document
      .querySelector(".quiz-stage")
      ?.classList.remove("is-empty", "is-result");
    if (els.result) els.result.hidden = true;
    const q = questions[currentIndex];
    const selected = answers[currentIndex];
    const total = questions.length;
    const progress = Math.round(((currentIndex + 1) / total) * 100);
    const answeredCount = answers.filter((answer) => answer !== null).length;
    const remainingCount = total - answeredCount;

    if (els.stageTitle) {
      els.stageTitle.textContent =
        reviewed && lastScore
          ? `Score: ${lastScore.score}/${lastScore.total}`
          : q.quiz_title || "Quiz";
    }
    if (els.stageMeta) {
      els.stageMeta.textContent =
        reviewed && lastScore
          ? `${lastScore.percent}% correct - ${scoreMessage(lastScore.percent)}`
          : remainingCount
            ? `${answeredCount}/${total} answered - ${remainingCount} left`
            : "All answered - finish while the set is fresh.";
    }
    if (els.pill) els.pill.textContent = `${currentIndex + 1} of ${total}`;
    if (els.finish) {
      els.finish.textContent = reviewed
        ? "Reviewed"
        : `Finish ${answeredCount}/${total}`;
    }
    if (els.progress) els.progress.style.width = `${progress}%`;
    if (els.question) els.question.textContent = q.question;
    renderMap();
    if (els.explanation) {
      els.explanation.textContent = reviewed ? q.explanation || "" : "";
      els.explanation.hidden = !reviewed || !q.explanation;
    }

    if (!els.options) return;
    els.options.innerHTML = "";

    q.options.forEach((option, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-option";
      btn.dataset.index = String(index);
      btn.innerHTML = `
        <span class="quiz-option-letter">${String.fromCharCode(65 + index)}</span>
        <span class="quiz-option-text">${tools.escapeHtml(option)}</span>
      `;

      if (!reviewed && selected === index) btn.classList.add("is-selected");
      if (reviewed && index === q.correct_index)
        btn.classList.add("is-correct");
      if (reviewed && selected === index && selected !== q.correct_index) {
        btn.classList.add("is-wrong");
      }

      btn.disabled = reviewed;
      els.options.appendChild(btn);
    });
  }

  function goToQuestion(index) {
    if (!questions.length) return;
    const previousIndex = currentIndex;
    currentIndex = (index + questions.length) % questions.length;
    showingResult = false;
    renderQuestion();

    if (currentIndex === previousIndex) return;

    const panel = document.querySelector(".quiz-question-panel");
    if (!panel) return;

    const direction = index > previousIndex ? "is-step-next" : "is-step-prev";
    panel.classList.remove("is-step-next", "is-step-prev");
    void panel.offsetWidth;
    panel.classList.add(direction);

    clearTimeout(questionMotionTimer);
    questionMotionTimer = window.setTimeout(() => {
      panel.classList.remove("is-step-next", "is-step-prev");
    }, 240);
  }

  function chooseAnswer(index) {
    if (!questions.length || reviewed) return;
    const q = questions[currentIndex];
    if (!q || index < 0 || index >= q.options.length) return;

    answers[currentIndex] = index;
    saveQuizProgress();
    renderQuestion();
  }

  function onKeyDown(event) {
    if (
      !questions.length ||
      isTypingTarget(event.target) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToQuestion(currentIndex - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToQuestion(currentIndex + 1);
      return;
    }

    if (reviewed) return;

    const numberIndex = Number(event.key) - 1;
    if (Number.isInteger(numberIndex) && numberIndex >= 0) {
      event.preventDefault();
      chooseAnswer(numberIndex);
      return;
    }

    const letter = event.key.toLowerCase();
    const letterIndex = letter.length === 1 ? letter.charCodeAt(0) - 97 : -1;
    if (letterIndex >= 0 && letterIndex < 5) {
      event.preventDefault();
      chooseAnswer(letterIndex);
    }
  }

  function sanitizeQuestions(input) {
    return (Array.isArray(input) ? input : [])
      .map((item) => {
        const options = Array.isArray(item.options)
          ? item.options
              .map((v) => String(v || "").trim())
              .filter(Boolean)
              .slice(0, 5)
          : [];
        const correctIndex = Number(
          item.correct_index ?? item.answer_index ?? 0,
        );

        return {
          question: String(item.question || "").trim(),
          options,
          correct_index: Number.isInteger(correctIndex) ? correctIndex : 0,
          explanation: String(item.explanation || "").trim(),
        };
      })
      .filter(
        (item) =>
          item.question &&
          item.options.length >= 3 &&
          item.correct_index >= 0 &&
          item.correct_index < item.options.length,
      )
      .slice(0, 25);
  }

  async function loadDecks() {
    const state = await tools.ready();
    if (!state.supabase || !state.user || !els.deckSelect) return;

    const { data, error } = await state.supabase
      .from("flashcard_decks")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);

    decks = error || !Array.isArray(data) ? [] : data;
    els.deckSelect.innerHTML = `<option value="">Optional: build from flashcards</option>`;
    decks.forEach((deck) => {
      const opt = document.createElement("option");
      opt.value = deck.id;
      opt.textContent = deck.title || "Untitled deck";
      els.deckSelect.appendChild(opt);
    });

    syncCustomSelect(els.deckSelect);
  }

  async function loadDeckSource(deckId) {
    if (!deckId) return;

    const state = await tools.ready();
    const { data, error } = await state.supabase
      .from("flashcards")
      .select("front,back,position")
      .eq("deck_id", deckId)
      .order("position", { ascending: true });

    if (error || !Array.isArray(data) || !data.length) {
      tools.toast("This deck has no cards yet.", "error");
      return;
    }

    const deck = decks.find((d) => d.id === deckId);
    els.source.value = data
      .map((card, index) => `${index + 1}. Q: ${card.front}\nA: ${card.back}`)
      .join("\n\n")
      .slice(0, 18000);

    if (!els.title.value.trim())
      els.title.value = `${deck?.title || "Flashcards"} quiz`;
  }

  async function loadQuizzes() {
    const state = await tools.ready();
    if (!state.supabase || !state.user || !els.quizSelect) return;

    const { data, error } = await state.supabase
      .from("study_quizzes")
      .select("id,title,difficulty,question_count,created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    quizzes = error || !Array.isArray(data) ? [] : data;
    els.quizSelect.innerHTML = `<option value="">Choose a saved quiz</option>`;

    quizzes.forEach((quiz) => {
      const opt = document.createElement("option");
      opt.value = quiz.id;
      opt.textContent = quiz.title || "Untitled quiz";
      els.quizSelect.appendChild(opt);
    });

    syncCustomSelect(els.quizSelect);
  }

  function focusQuizStage(options = {}) {
    setFlowMode("study");

    if (isMobileFlow()) {
      scrollPageTop();
      return;
    }

    scrollToTarget(".quiz-stage", options.behavior || "smooth");
  }

  async function loadQuiz(quizId, options = {}) {
    const state = await tools.ready();
    if (!state.supabase || !quizId) return;

    const quiz = quizzes.find((q) => q.id === quizId);
    const { data, error } = await state.supabase
      .from("study_quiz_questions")
      .select("id,question,options,correct_index,explanation,position")
      .eq("quiz_id", quizId)
      .order("position", { ascending: true });

    if (error || !Array.isArray(data)) {
      tools.toast("Could not load this quiz.", "error");
      return;
    }

    activeQuizId = quizId;
    questions = data.map((q) => ({ ...q, quiz_title: quiz?.title || "Quiz" }));
    const latestAttempt = await loadLatestAttempt(quizId, questions.length);
    activeAttemptId = latestAttempt?.id || null;
    answers =
      latestAttempt?.answers ||
      Array.from({ length: questions.length }, () => null);
    currentIndex = 0;
    reviewed = false;
    lastScore = null;
    showingResult = false;
    renderQuestion();
    if (options.focus) focusQuizStage({ repeat: true });
  }

  async function saveQuiz(title, difficulty, aiQuestions) {
    const state = await tools.ready();
    if (!state.supabase || !state.user) throw new Error("Not signed in");

    const { data: quiz, error: quizError } = await state.supabase
      .from("study_quizzes")
      .insert({
        user_id: state.user.id,
        title,
        difficulty,
        question_count: aiQuestions.length,
      })
      .select("id,title")
      .single();

    if (quizError || !quiz?.id)
      throw quizError || new Error("Could not save quiz");

    const rows = aiQuestions.map((q, index) => ({
      quiz_id: quiz.id,
      user_id: state.user.id,
      question: q.question,
      options: q.options,
      correct_index: q.correct_index,
      explanation: q.explanation,
      position: index + 1,
    }));

    const { error: questionError } = await state.supabase
      .from("study_quiz_questions")
      .insert(rows);

    if (questionError) throw questionError;
    return quiz.id;
  }

  async function generateQuiz() {
    const source = (els.source?.value || "").trim();
    if (source.length < 40) {
      tools.toast("Add notes or choose a flashcard deck first.", "error");
      return;
    }

    const difficulty = selectedDifficulty();
    const count = clampCount(els.count?.value);
    const title =
      (els.title?.value || "").trim() ||
      source
        .split(/\n|\.|:/)
        .find(Boolean)
        ?.slice(0, 48) ||
      "Study quiz";

    els.generate.disabled = true;
    els.generate.classList.add("is-loading");
    startGeneratePhrases();

    try {
      const data = await tools.ai({
        task: "quiz",
        topic: source,
        difficulty,
        question_count: count,
      });

      const aiQuestions = sanitizeQuestions(data.questions);
      if (!aiQuestions.length) throw new Error("No quiz questions returned");

      const quizTitle = String(data.title || title)
        .trim()
        .slice(0, 90);
      const quizId = await saveQuiz(quizTitle, difficulty, aiQuestions);

      tools.toast("Quiz saved.");
      await loadQuizzes();
      els.quizSelect.value = quizId;
      syncCustomSelect(els.quizSelect);
      await loadQuiz(quizId, { focus: true });
    } catch (err) {
      tools.toast(err?.message || "Could not generate quiz.", "error");
    } finally {
      els.generate.disabled = false;
      els.generate.classList.remove("is-loading");
      stopGeneratePhrases();
    }
  }

  async function deleteQuiz() {
    if (!activeQuizId) return;

    const ok = await askQuizConfirm({
      title: "Delete quiz?",
      message: "This saved quiz will be removed permanently.",
      danger: true,
    });
    if (!ok) return;

    const state = await tools.ready();
    const { error } = await state.supabase
      .from("study_quizzes")
      .delete()
      .eq("id", activeQuizId);

    if (error) {
      tools.toast("Could not delete this quiz.", "error");
      return;
    }

    tools.toast("Quiz deleted.");
    resetStage();
    await loadQuizzes();
    syncCustomSelect(els.quizSelect);
  }

  async function finishQuiz() {
    if (!questions.length || reviewed) return;

    const unanswered = answers.some((answer) => answer === null);
    if (unanswered) {
      const ok = await askQuizConfirm({
        title: "Finish quiz?",
        message:
          "Some questions are still unanswered. Finish now and review the missed ones?",
      });
      if (!ok) return;
    }

    const score = scoreQuiz();
    const total = questions.length;
    lastScore = {
      score,
      total,
      percent: Math.round((score / total) * 100),
    };

    reviewed = true;
    currentIndex = answers.findIndex(
      (answer, index) => answer !== questions[index].correct_index,
    );
    if (currentIndex < 0) currentIndex = 0;
    showingResult = true;
    renderQuestion();
    await saveQuizProgress();
  }

  function bind() {
    document
      .querySelector("[data-quiz-presets]")
      ?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-quiz-preset]");
        if (!btn) return;
        useQuickPreset(btn.dataset.quizPreset);
      });

    els.deckSelect?.addEventListener("change", (event) =>
      loadDeckSource(event.target.value),
    );
    els.quizSelect?.addEventListener("change", (event) =>
      loadQuiz(event.target.value, { focus: true }),
    );
    els.generate?.addEventListener("click", generateQuiz);
    els.deleteQuiz?.addEventListener("click", deleteQuiz);
    els.finish?.addEventListener("click", finishQuiz);
    els.reviewMissed?.addEventListener("click", () => {
      if (!questions.length) return;
      const firstMissed = answers.findIndex(
        (answer, index) => answer !== questions[index].correct_index,
      );
      goToQuestion(firstMissed >= 0 ? firstMissed : 0);
    });

    els.options?.addEventListener("click", (event) => {
      const btn = event.target.closest(".quiz-option");
      if (!btn || reviewed) return;
      chooseAnswer(Number(btn.dataset.index));
    });

    els.map?.addEventListener("click", (event) => {
      const btn = event.target.closest(".quiz-map-btn");
      if (!btn || !questions.length) return;
      goToQuestion(Number(btn.dataset.index || 0));
    });

    els.prev?.addEventListener("click", () => {
      goToQuestion(currentIndex - 1);
    });

    els.next?.addEventListener("click", () => {
      goToQuestion(currentIndex + 1);
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

    const initialQuizId = getInitialQuizId();

    const state = await tools.ready();
    if (!state.isPro) return;

    await Promise.all([loadDecks(), loadQuizzes()]);

    const quizId = quizzes.find((quiz) => quiz.id === initialQuizId)?.id;

    if (quizId) {
      els.quizSelect.value = quizId;
      syncCustomSelect(els.quizSelect);
      await loadQuiz(quizId, { focus: true });
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
