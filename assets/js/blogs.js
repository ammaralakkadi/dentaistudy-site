// blogs.js – registry-based blog listing (ADEX-ready)
document.addEventListener("DOMContentLoaded", () => {
  const blogLibrary = document.getElementById("blog-library");
  const filters = Array.from(document.querySelectorAll(".blog-filter"));
  const searchInput = document.getElementById("blog-search");
  const loadMoreBtn = document.getElementById("load-more");

  // If we're not on the blogs page, do nothing
  if (!blogLibrary) return;

  // ------------------------------------
  // 1. BLOG REGISTRY
  //    Add new entries here only.
  // ------------------------------------
  const BLOG_REGISTRY = [
    {
      title: "ADEX Exam 2025 – What Candidates Must Know",
      url: "blogs/adex/adex-what-is-the-exam.html",
      tag: "ADEX",
      description:
        "A clear, examiner-focused guide to the ADEX exam structure, scoring, and what you need to pass.",
      meta: "7 min read • ADEX exam",
      category: "theory adex", // used for filter pills + search
    },
    // ➜ Future ADEX posts: add more objects here.

    {
      title: "ADEX Scoring & Common Failing Points",
      url: "blogs/adex/adex-scoring-fail-points.html",
      tag: "ADEX",
      description:
        "Understanding ADEX scoring, critical errors, and the mistakes that cause most candidates to fail.",
      meta: "8 min read • ADEX exam",
      category: "theory adex",
    },
    {
      title: "ADEX Class II Preparation – Step-by-Step Guide",
      url: "blogs/adex/adex-class-ii-preparation.html",
      tag: "ADEX",
      description:
        "A safe, examiner-friendly Class II (MO/DO) preparation method for predictable ADEX passing.",
      meta: "9 min read • ADEX exam",
      category: "skills adex class2",
    },
    {
      title: "ADEX Class III Preparation – Complete Exam Guide",
      url: "blogs/adex/adex-class-iii-preparation.html",
      tag: "ADEX",
      description:
        "Controlled access, proximal extension, enamel preservation, and the criteria you must meet to pass.",
      meta: "8 min read • ADEX exam",
      category: "skills adex class3",
    },
    {
      title: "ADEX Provisional Crown Preparation – Step-by-Step Guide",
      url: "blogs/adex/adex-provisional-crown-preparation.html",
      tag: "ADEX",
      description:
        "How to prepare, trim, fit, and finish a provisional crown that meets ADEX pass-level criteria.",
      meta: "8 min read • ADEX exam",
      category: "skills adex provisional",
    },
    {
      title: "ADEX OSCE Overview – Format, Topics & Strategy",
      url: "blogs/adex/adex-osce-overview.html",
      tag: "ADEX",
      description:
        "A complete breakdown of ADEX OSCE structure, radiology patterns, emergency logic, and clinical reasoning.",
      meta: "7 min read • ADEX exam",
      category: "theory adex osce",
    },
    {
      title: "ADEX Radiology OSCE – High-Yield Interpretation Guide",
      url: "blogs/adex/adex-radiology-osce.html",
      tag: "ADEX",
      description:
        "The radiographic patterns, bone loss rules, caries appearances, and periapical signs repeatedly tested in the ADEX OSCE.",
      meta: "8 min read • ADEX exam",
      category: "theory adex osce radiology",
    },
    {
      title: "ADEX Medical Emergencies OSCE – High-Yield Decision Guide",
      url: "blogs/adex/adex-emergencies-osce.html",
      tag: "ADEX",
      description:
        "A predictable guide to syncope, hypoglycemia, angina, asthma, and anaphylaxis — and the first-step actions ADEX expects.",
      meta: "7 min read • ADEX exam",
      category: "theory adex osce emergencies",
    },
    {
      title: "ADEX Treatment Planning OSCE – Next Best Step Guide",
      url: "blogs/adex/adex-treatment-planning-osce.html",
      tag: "ADEX",
      description:
        "Simple, predictable sequencing rules to choose the safest next step in ADEX treatment planning OSCE cases.",
      meta: "7 min read • ADEX exam",
      category: "theory adex osce treatment",
    },
    {
      title: "ADEX Ethics & Legal OSCE – High-Yield Decision Guide",
      url: "blogs/adex/adex-ethics-legal-osce.html",
      tag: "ADEX",
      description:
        "Consent, confidentiality, documentation, minors, scope of practice, and error disclosure — the ethics patterns ADEX repeats.",
      meta: "7 min read • ADEX exam",
      category: "theory adex osce ethics",
    },
    // ADEX BLOGS (11–20)
    {
      title: "ADEX Periodontal Assessment OSCE – Probing, Charting & Diagnosis",
      url: "blogs/adex/adex-periodontal-assessment-osce.html",
      tag: "ADEX",
      description:
        "How to probe, chart, and stage periodontal disease in ADEX OSCE cases with safe, examiner-friendly wording.",
      meta: "7 min read • ADEX exam",
      category: "theory adex osce perio",
    },
    {
      title: "ADEX Local Anesthesia OSCE – Techniques & Safety Steps",
      url: "blogs/adex/adex-local-anesthesia-osce.html",
      tag: "ADEX",
      description:
        "Landmarks, injection sequence, aspiration, and failure management for ADEX local anesthesia OSCE stations.",
      meta: "7 min read • ADEX exam",
      category: "theory adex osce anesthesia",
    },
    {
      title: "ADEX Medical History Review OSCE – Red Flags & Modifications",
      url: "blogs/adex/adex-medical-history-review-osce.html",
      tag: "ADEX",
      description:
        "Systematic questions, medical red flags, and chairside treatment modifications ADEX expects you to mention.",
      meta: "7 min read • ADEX exam",
      category: "theory adex osce medical",
    },
    {
      title: "ADEX Infection Control & PPE OSCE – Step-by-Step Guide",
      url: "blogs/adex/adex-infection-control-ppe-osce.html",
      tag: "ADEX",
      description:
        "Donning and doffing PPE, surface disinfection, instrument flow, and cross-contamination traps in ADEX OSCE.",
      meta: "6 min read • ADEX exam",
      category: "theory adex osce infection",
    },
    {
      title: "ADEX Restorative Errors & Fail Points – Mistakes to Avoid",
      url: "blogs/adex/adex-restorative-errors-fail-points.html",
      tag: "ADEX",
      description:
        "The preparation, margin, and contact mistakes that repeatedly cause critical failures in ADEX manikin exams.",
      meta: "7 min read • ADEX exam",
      category: "skills adex restorative",
    },
    {
      title: "ADEX Radiographic Interpretation – Caries, Perio & Endo Patterns",
      url: "blogs/adex/adex-radiographic-interpretation.html",
      tag: "ADEX",
      description:
        "Pattern recognition for caries, periodontal bone loss, and endodontic lesions in ADEX radiographic questions.",
      meta: "8 min read • ADEX exam",
      category: "theory adex osce radiology",
    },
    {
      title: "ADEX Emergency Drug Kit – Items, Uses & Exam Essentials",
      url: "blogs/adex/adex-emergency-drug-kit.html",
      tag: "ADEX",
      description:
        "Core emergency drugs, indications, and dosages you must recall for ADEX OSCE and medical emergency stations.",
      meta: "6 min read • ADEX exam",
      category: "theory adex osce emergencies",
    },
    {
      title:
        "ADEX Patient Communication OSCE – Consent, Explanation & Behavior",
      url: "blogs/adex/adex-patient-communication-osce.html",
      tag: "ADEX",
      description:
        "How to structure consent, explain risks, and manage anxious or upset patients in ADEX communication OSCEs.",
      meta: "7 min read • ADEX exam",
      category: "theory adex osce communication",
    },
    {
      title: "ADEX Pharmacology Essentials – What You Must Know for the Exam",
      url: "blogs/adex/adex-pharmacology-essentials.html",
      tag: "ADEX",
      description:
        "High-yield analgesic, antibiotic, and emergency drug facts ADEX commonly tests in OSCE and viva questions.",
      meta: "7 min read • ADEX exam",
      category: "theory adex pharmacology",
    },
    {
      title: "ADEX Common Viva Questions – High-Yield Short Answers",
      url: "blogs/adex/adex-common-viva-questions.html",
      tag: "ADEX",
      description:
        "Short, structured sample answers to common ADEX viva questions in cariology, perio, endo, anesthesia, and emergencies.",
      meta: "8 min read • ADEX exam",
      category: "theory adex viva",
    },
  ];

  // ------------------------------------
  // 2. INJECT REGISTRY BLOG CARDS
  //    This appends new cards to the existing 35 cards.
  //    No need to edit blogs.html for new posts.
  // ------------------------------------
  function injectDynamicBlogs() {
    BLOG_REGISTRY.forEach((blog) => {
      // Skip if card already exists (safety)
      const existing = blogLibrary.querySelector(
        `a.blog-card[href="${blog.url}"]`
      );
      if (existing) return;

      const link = document.createElement("a");
      link.href = blog.url;
      link.className = "blog-card is-hidden";
      link.dataset.category = blog.category;

      const article = document.createElement("article");
      article.className = "subject-card";

      const tagDiv = document.createElement("div");
      tagDiv.className = "sidebar-tag";
      tagDiv.style.width = "max-content";
      tagDiv.textContent = blog.tag;

      const h3 = document.createElement("h3");
      h3.textContent = blog.title;

      const p = document.createElement("p");
      p.textContent = blog.description;

      const metaDiv = document.createElement("div");
      metaDiv.className = "subject-ai";
      metaDiv.textContent = blog.meta;

      article.appendChild(tagDiv);
      article.appendChild(h3);
      article.appendChild(p);
      article.appendChild(metaDiv);

      link.appendChild(article);
      blogLibrary.appendChild(link);
    });
  }

  injectDynamicBlogs();

  // After injection, collect all cards (old + new) and apply filters/search.
  const cards = Array.from(document.querySelectorAll(".blog-card"));
  if (!cards.length) return;

  let activeFilter = "all";
  let visibleCount = 9;

  function applyVisibility() {
    const query = (searchInput && searchInput.value ? searchInput.value : "")
      .toLowerCase()
      .trim();

    const filtered = cards.filter((card) => {
      const cats = (card.dataset.category || "").toLowerCase();
      const text = (card.innerText || "").toLowerCase();
      const matchFilter = activeFilter === "all" || cats.includes(activeFilter);
      const matchQuery = !query || text.includes(query);
      return matchFilter && matchQuery;
    });

    // hide all
    cards.forEach((c) => {
      c.classList.add("is-hidden");
      c.style.display = "none";
    });

    // show first batch
    filtered.slice(0, visibleCount).forEach((c) => {
      c.classList.remove("is-hidden");
      c.style.display = "";
    });

    // load more button visibility
    if (loadMoreBtn) {
      loadMoreBtn.style.display =
        filtered.length > visibleCount ? "inline-block" : "none";
    }
  }

  // Filter pills
  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter || "all";
      filters.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      visibleCount = 9;
      applyVisibility();
    });
  });

  // Clickable tags on cards (e.g., OSCE, Viva, ADEX)
  // Uses event delegation so it works for static + injected cards.
  const TAG_TO_FILTER = {
    "study skills": "skills",
    endo: "endo",
    endodontics: "endo",
    prostho: "prostho",
    prosthodontics: "prostho",
    ortho: "ortho",
    orthodontics: "ortho",
    pedo: "pedo",
    perio: "perio",
    adex: "adex",
    "adex exam": "adex",
    osce: "osce",
    viva: "viva",
    theory: "theory",
    operative: "operative",
    dentaistudy: "skills",
  };

  function setActiveFilter(nextFilter) {
    activeFilter = nextFilter || "all";

    // Sync pill UI
    const pill = filters.find((b) => (b.dataset.filter || "") === activeFilter);
    filters.forEach((b) => b.classList.remove("is-active"));
    if (pill) pill.classList.add("is-active");

    visibleCount = 9;
    applyVisibility();
  }

  blogLibrary.addEventListener("click", (e) => {
    const tagEl = e.target.closest(".sidebar-tag");
    if (!tagEl) return;

    const raw = (tagEl.textContent || "").trim().toLowerCase();
    const mapped = TAG_TO_FILTER[raw] || raw;

    // Only act if it maps to a known pill (otherwise ignore)
    const exists = filters.some((b) => (b.dataset.filter || "") === mapped);
    if (!exists) return;

    setActiveFilter(mapped);

    // Optional: nudge focus to the filter row for clarity
    const search = document.getElementById("blog-search");
    if (search) search.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  
  // Search box
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      visibleCount = 9;
      applyVisibility();
    });
  }

  // Load more
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      visibleCount += 9;
      applyVisibility();
    });
  }

  // Initial state
  applyVisibility();
});
