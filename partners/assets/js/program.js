document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-faq-item]").forEach((item) => {
    const button = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    if (!button || !answer) return;

    button.addEventListener("click", () => {
      const open = !item.classList.contains("open");
      item.classList.toggle("open", open);
      button.setAttribute("aria-expanded", String(open));
      answer.setAttribute("aria-hidden", String(!open));
    });
  });
});
