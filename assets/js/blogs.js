document.addEventListener("DOMContentLoaded", () => {
  const cards = Array.from(document.querySelectorAll(".blog-card"));
  const filters = Array.from(document.querySelectorAll(".blog-filter"));
  const searchInput = document.getElementById("blog-search");
  const loadMoreBtn = document.getElementById("load-more");

  if (!cards.length) return; // nothing to do if no blogs

  let activeFilter = "all";
  let visibleCount = 9;

  function applyVisibility() {
    const query = (searchInput && searchInput.value ? searchInput.value : "")
      .toLowerCase()
      .trim();

    const filtered = cards.filter(card => {
      const cats = (card.dataset.category || "").toLowerCase();
      const text = (card.innerText || "").toLowerCase();
      const matchFilter = activeFilter === "all" || cats.includes(activeFilter);
      const matchQuery = !query || text.includes(query);
      return matchFilter && matchQuery;
    });

    // hide all
    cards.forEach(c => {
      c.classList.add("is-hidden");
      c.style.display = "none";
    });

    // show first batch
    filtered.slice(0, visibleCount).forEach(c => {
      c.classList.remove("is-hidden");
      c.style.display = "";
    });

    // load more button visibility
    if (loadMoreBtn) {
      if (filtered.length > visibleCount) {
        loadMoreBtn.style.display = "inline-block";
      } else {
        loadMoreBtn.style.display = "none";
      }
    }
  }

  // filter buttons
  filters.forEach(btn => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter || "all";
      filters.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      visibleCount = 9;
      applyVisibility();
    });
  });

  // search input
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      visibleCount = 9;
      applyVisibility();
    });
  }

  // load more button
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      visibleCount += 9;
      applyVisibility();
    });
  }

  // initial state
  applyVisibility();
});
