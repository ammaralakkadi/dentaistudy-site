// assets/js/study-builder/quiz.js
(() => {
  "use strict";

  const tools = window.DentAIStudyTools;

  const els = {};
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
    "Reading note...",
    "Building questions...",
    "Writing explanations...",
    "Balancing difficulty...",
    "Saving quiz...",
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
    if (els.stageMeta) els.stageMeta.textContent = label;
    if (els.question) els.question.textContent = label;
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
    setGenerateLabel("Generate quiz");
  }

  function cacheEls() {
    els.layout = document.querySelector(".quiz-layout");
    els.stage = document.querySelector(".quiz-stage");
    els.empty = qs("quizEmptyState");
    els.createModal = qs("quizCreateModal");
    els.openCreate = qs("openQuizCreateBtn");
    els.createClose = document.querySelectorAll("[data-quiz-create-close]");
    els.noteSelect = qs("quizNoteSelect");
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
    [els.noteSelect, els.quizSelect].forEach(enhanceSelect);

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

  function setDifficulty(value) {
    const input = document.querySelector(
      `input[name="quizDifficulty"][value="${value}"]`,
    );
    if (input) input.checked = true;
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

  function getInitialNoteId() {
    return new URLSearchParams(window.location.search).get("note") || "";
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

  function clampCount(value) {
    const n = Number(value || 10);
    return Math.max(5, Math.min(30, Math.round(n)));
  }

  function resetStage(message) {
    stopGeneratePhrases();
    questions = [];
    answers = [];
    currentIndex = 0;
    activeQuizId = null;
    activeAttemptId = null;
    reviewed = false;
    lastScore = null;
    showingResult = false;

    setFlowMode("normal");
    els.stage?.classList.remove("is-result", "is-generating");
    els.stage?.classList.add("is-empty");
    els.layout?.classList.add("is-empty");
    if (els.empty) els.empty.hidden = false;
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

  function readQuizProgress(metadata, quizId) {
    const progress = metadata?.study_quiz_progress;
    if (!progress || typeof progress !== "object" || !quizId) return null;
    return progress[quizId] || null;
  }

  function clampQuizIndex(value, total) {
    const index = Math.trunc(Number(value));
    if (!Number.isFinite(index)) return 0;
    return Math.max(0, Math.min(total - 1, index));
  }

  function normalizeQuizScore(savedScore, total) {
    if (!savedScore || typeof savedScore !== "object" || !total) return null;

    const score = Math.trunc(Number(savedScore.score));
    const percent = Math.trunc(Number(savedScore.percent));

    if (!Number.isFinite(score) || !Number.isFinite(percent)) return null;

    return {
      score: Math.max(0, Math.min(total, score)),
      total,
      percent: Math.max(0, Math.min(100, percent)),
    };
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
      const score = scoreQuiz();
      const answeredCount = answers.filter((answer) => answer !== null).length;
      const resultScore =
        reviewed && lastScore
          ? lastScore
          : reviewed
            ? {
                score,
                total,
                percent: Math.round((score / total) * 100),
              }
            : null;

      const payload = {
        quiz_id: activeQuizId,
        user_id: state.user.id,
        score,
        total,
        answers,
      };

      if (activeAttemptId) {
        await state.supabase
          .from("study_quiz_attempts")
          .update(payload)
          .eq("id", activeAttemptId);
      } else {
        const { data, error } = await state.supabase
          .from("study_quiz_attempts")
          .insert(payload)
          .select("id")
          .single();

        if (!error && data?.id) activeAttemptId = data.id;
      }

      const meta = state.user.user_metadata || {};
      const progress = {
        ...(meta.study_quiz_progress &&
        typeof meta.study_quiz_progress === "object"
          ? meta.study_quiz_progress
          : {}),
      };

      progress[activeQuizId] = {
        attempt_id: activeAttemptId,
        current_index: currentIndex,
        reviewed,
        showing_result: showingResult,
        last_score: resultScore,
        answered_count: answeredCount,
        total,
        updated_at: new Date().toISOString(),
      };

      const nextMeta = { ...meta, study_quiz_progress: progress };
      const { error } = await state.supabase.auth.updateUser({
        data: nextMeta,
      });

      if (!error) state.user.user_metadata = nextMeta;
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
    stage?.classList.remove("is-generating");
    stage?.classList.add("is-result");
    els.layout?.classList.remove("is-empty");
    if (els.empty) els.empty.hidden = true;

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
    if (els.finish) els.finish.textContent = "Restart";
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
      const isCorrect = reviewed && answers[index] === q.correct_index;
      const isWrong =
        reviewed && answered && answers[index] !== q.correct_index;

      btn.classList.toggle("is-active", index === currentIndex);
      btn.classList.toggle("is-answered", answered);
      btn.classList.toggle("is-correct", isCorrect);
      btn.classList.toggle("is-wrong", isWrong);
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
      ?.classList.remove("is-empty", "is-result", "is-generating");
    els.layout?.classList.remove("is-empty");
    if (els.empty) els.empty.hidden = true;
    if (els.result) els.result.hidden = true;
    const q = questions[currentIndex];
    const selected = answers[currentIndex];
    const total = questions.length;
    const answeredCount = answers.filter((answer) => answer !== null).length;
    const remainingCount = total - answeredCount;
    const progress = Math.round((answeredCount / total) * 100);

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
        ? "Restart"
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

  function renderGeneratingQuiz() {
    questions = [];
    answers = [];
    currentIndex = 0;
    activeQuizId = null;
    activeAttemptId = null;
    reviewed = false;
    lastScore = null;
    showingResult = false;
    setFlowMode("study");
    els.layout?.classList.remove("is-empty");
    if (els.empty) els.empty.hidden = true;
    els.stage?.classList.remove("is-empty", "is-result");
    els.stage?.classList.add("is-generating");
    if (els.stageTitle) els.stageTitle.textContent = "Preparing quiz";
    if (els.stageMeta) els.stageMeta.textContent = "Saving your questions...";
    if (els.pill) els.pill.textContent = "0 of 0";
    if (els.progress) els.progress.style.width = "0%";
    if (els.map) els.map.innerHTML = "";
    if (els.question) els.question.textContent = "Preparing quiz...";
    if (els.options) els.options.innerHTML = "";
    if (els.explanation) {
      els.explanation.textContent = "";
      els.explanation.hidden = true;
    }
    if (els.result) els.result.hidden = true;
    if (els.finish) els.finish.textContent = "Finish";
  }

  function goToQuestion(index) {
    if (!questions.length) return;
    const previousIndex = currentIndex;
    currentIndex = (index + questions.length) % questions.length;
    showingResult = false;
    renderQuestion();

    if (currentIndex === previousIndex) return;

    saveQuizProgress();

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

    const allAnswered = answers.every((answer) => answer !== null);
    const isLastQuestion = currentIndex >= questions.length - 1;

    if (allAnswered && isLastQuestion) {
      window.setTimeout(() => {
        if (!reviewed) finishQuiz();
      }, 260);
    }
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
      .slice(0, 40);
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
      els.title.value = `${note.title || "Saved Note"} quiz`.slice(0, 90);
    }
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

    try {
      const { data: refreshed } = await state.supabase.auth.getUser();
      if (refreshed?.user) state.user = refreshed.user;
    } catch {}

    const latestAttempt = await loadLatestAttempt(quizId, questions.length);
    const savedProgress = readQuizProgress(state.user?.user_metadata, quizId);
    const firstUnanswered = latestAttempt?.answers?.findIndex(
      (answer) => answer === null,
    );

    activeAttemptId = latestAttempt?.id || savedProgress?.attempt_id || null;
    answers =
      latestAttempt?.answers ||
      Array.from({ length: questions.length }, () => null);

    reviewed =
      Boolean(savedProgress?.reviewed) &&
      Number(savedProgress?.total) === questions.length;

    lastScore = reviewed
      ? normalizeQuizScore(savedProgress?.last_score, questions.length)
      : null;

    if (reviewed && !lastScore) {
      const score = scoreQuiz();
      lastScore = {
        score,
        total: questions.length,
        percent: Math.round((score / questions.length) * 100),
      };
    }

    currentIndex = reviewed
      ? clampQuizIndex(savedProgress?.current_index, questions.length)
      : savedProgress
        ? clampQuizIndex(savedProgress.current_index, questions.length)
        : firstUnanswered >= 0
          ? firstUnanswered
          : 0;

    showingResult = reviewed;
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
      tools.toast("Choose a saved Note first.", "error");
      return;
    }

    const difficulty = selectedDifficulty();
    const rawCount = Number(els.count?.value || 10);

    if (rawCount > 30) {
      tools.toast("Maximum is 30 quiz questions.", "error");
      if (els.count) els.count.value = 30;
      return;
    }

    const count = clampCount(rawCount);
    const title =
      (els.title?.value || "").trim() ||
      source
        .split(/\n|\.|:/)
        .find(Boolean)
        ?.slice(0, 48) ||
      "Study quiz";

    els.generate.disabled = true;
    els.generate.classList.add("is-loading");
    closeCreateModal();
    renderGeneratingQuiz();
    startGeneratePhrases();
    focusQuizStage({ behavior: "smooth" });

    try {
      const data = await tools.ai({
        task: "quiz",
        topic: source,
        difficulty,
        question_count: count,
      });

      const aiQuestions = sanitizeQuestions(data.questions);
      if (!aiQuestions.length)
        throw new Error("Could not generate quiz questions from this note.");

      const quizTitle = String(data.title || title)
        .trim()
        .slice(0, 90);
      const quizId = await saveQuiz(quizTitle, difficulty, aiQuestions);

      await loadQuizzes();
      els.quizSelect.value = quizId;
      syncCustomSelect(els.quizSelect);
      await loadQuiz(quizId, { focus: true });
    } catch (err) {
      resetStage();
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

  async function restartQuizSession() {
    if (!questions.length) return;

    answers = Array.from({ length: questions.length }, () => null);
    currentIndex = 0;
    reviewed = false;
    lastScore = null;
    showingResult = false;

    renderQuestion();
    await saveQuizProgress();
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
    els.quizSelect?.addEventListener("change", (event) => {
      const quizId = event.target.value;
      if (!quizId) {
        resetStage();
        focusPageTop();
        return;
      }

      loadQuiz(quizId, { focus: true });
    });
    els.generate?.addEventListener("click", generateQuiz);
    els.deleteQuiz?.addEventListener("click", deleteQuiz);
    els.finish?.addEventListener("click", () => {
      if (reviewed) {
        restartQuizSession();
        return;
      }

      finishQuiz();
    });
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
      if (!questions.length || reviewed) return;

      if (currentIndex >= questions.length - 1) {
        const allAnswered = answers.every((answer) => answer !== null);
        if (allAnswered) finishQuiz();
        return;
      }

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
    const initialNoteId = getInitialNoteId();

    const state = await tools.ready();
    if (!state.isPro) return;

    await Promise.all([loadNotes(), loadQuizzes()]);

    const quizId = quizzes.find((quiz) => quiz.id === initialQuizId)?.id;
    const hasInitialNote = Boolean(
      initialNoteId &&
      els.noteSelect?.querySelector(
        `option[value="${CSS.escape(initialNoteId)}"]`,
      ),
    );

    if (quizId) {
      els.quizSelect.value = quizId;
      syncCustomSelect(els.quizSelect);
      await loadQuiz(quizId, { focus: true });
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
