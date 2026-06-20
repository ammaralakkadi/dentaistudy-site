// composer.js
// Auto-growing textarea (upward), enter-to-send, shift+enter newline, send button state.
// Exam Coach composer only. PDF uploads now belong to the Notes page.

(() => {
  const form = document.getElementById("composer");
  const ta = document.getElementById("prompt");
  const send = document.getElementById("send");
  const messages = document.getElementById("messages");

  if (!form || !ta || !send) return;

  function setSendState() {
    send.disabled = ta.value.trim().length === 0;
  }

  function getTextareaMaxHeight() {
    const max = Number.parseFloat(getComputedStyle(ta).maxHeight);
    return Number.isFinite(max) && max > 0 ? max : 320;
  }

  function keepLatestVisible() {
    if (!messages) return;
    messages.scrollTop = messages.scrollHeight;
  }

  function autoGrow() {
    ta.style.height = "auto";

    const max = getTextareaMaxHeight();
    const nextHeight = Math.min(ta.scrollHeight, max);

    ta.style.height = `${nextHeight}px`;
    ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
  }

  ta.addEventListener("input", () => {
    const prevH = ta.offsetHeight;
    autoGrow();
    setSendState();

    if (
      document.activeElement === ta &&
      window.matchMedia("(max-width: 899px)").matches &&
      ta.offsetHeight > prevH
    ) {
      requestAnimationFrame(keepLatestVisible);
    }
  });

  ta.addEventListener("keydown", (e) => {
    const isMobile = window.matchMedia("(max-width: 640px)").matches;

    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  document.addEventListener("click", (e) => {
    const starter = e.target.closest?.(".starter-card[data-prompt]");
    if (!starter) return;

    ta.value = starter.dataset.prompt || "";
    autoGrow();
    setSendState();
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;

    window.ChatUI?.addUser(text, null);

    ta.value = "";
    autoGrow();
    setSendState();

    // AI reply is handled by assets/js/study-builder.js (Supabase Edge Function).
  });

  autoGrow();
  setSendState();
})();
