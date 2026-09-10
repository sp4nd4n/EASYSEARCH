/**
 * EASYSEARCH — app controller
 */
const App = (() => {
  const wizard = { designation: null, pageGoal: null, includeQuestions: false, topic: "" };
  let lastGenerated = null; // { data, meta, filename } for the result screen's download button
  let lastGeneratedBook = null; // same, for the Books result screen
  let pendingRegenerate = null; // history item being reopened, if any

  const TAB_SCREENS = ["screen-home", "screen-books", "screen-settings"];

  // In-app navigation stack, kept in lockstep with browser history (via
  // pushState/popstate) so the Android hardware/gesture back button steps
  // back through in-app screens instead of closing the whole app.
  let navStack = [];
  let suppressHistoryPush = false;

  // Screens worth resuming into if the user reopens the app mid-task.
  // Transient screens (login, generating, result) are deliberately excluded.
  const RESUMABLE_SCREENS = [
    "screen-home", "screen-books", "screen-settings", "screen-credits",
    "screen-designation", "screen-pages", "screen-questions", "screen-topic",
    "screen-book-input"
  ];

  // ---------- screen navigation ----------
  function showScreen(id, opts = {}) {
    const currentEl = document.querySelector(".screen.active");
    const newEl = document.getElementById(id);
    const isSwitchingTabs = currentEl && currentEl.id !== id &&
      TAB_SCREENS.includes(currentEl.id) && TAB_SCREENS.includes(id);

    if (isSwitchingTabs) {
      const fromIdx = TAB_SCREENS.indexOf(currentEl.id);
      const toIdx = TAB_SCREENS.indexOf(id);
      slideTabs(currentEl, newEl, toIdx > fromIdx ? 1 : -1);
    } else {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
      newEl.classList.add("active");
    }

    const tabbar = document.getElementById("tabbar");
    const topLevel = TAB_SCREENS.includes(id);
    tabbar.style.display = topLevel ? "flex" : "none";
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === id);
    });

    // Remember where a logged-in user is, so relaunching the app resumes here.
    if (Storage.getUser() && RESUMABLE_SCREENS.includes(id)) {
      Storage.setLastScreen(id);
    }

    if (!opts.fromPopstate) pushHistory(id);
  }

  /** Sweeping swipe-style transition between the three tab screens. direction: 1 = forward (slide left), -1 = back (slide right). */
  function slideTabs(oldEl, newEl, direction) {
    const offset = direction * 100;
    oldEl.classList.add("tab-sliding");
    newEl.classList.add("tab-sliding", "active");
    oldEl.style.transform = "translateX(0%)";
    newEl.style.transform = `translateX(${offset}%)`;

    void newEl.offsetWidth; // force reflow so the starting position registers before animating

    requestAnimationFrame(() => {
      oldEl.style.transform = `translateX(${-offset}%)`;
      newEl.style.transform = "translateX(0%)";
    });

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      oldEl.classList.remove("active", "tab-sliding");
      oldEl.style.transform = "";
      newEl.classList.remove("tab-sliding");
      newEl.style.transform = "";
      oldEl.removeEventListener("transitionend", onTransitionEnd);
    };
    const onTransitionEnd = (e) => { if (e.target === oldEl) cleanup(); };
    oldEl.addEventListener("transitionend", onTransitionEnd);
    setTimeout(cleanup, 400); // safety net in case transitionend doesn't fire
  }

  /** Registers a navigation step so the Android back button can step back through in-app screens. */
  function pushHistory(id) {
    if (suppressHistoryPush) return;
    if (navStack[navStack.length - 1] === id) return;
    navStack.push(id);
    history.pushState({ depth: navStack.length }, "", "");
  }

  function handlePopState() {
    if (navStack.length <= 1) return; // nothing left in our stack — let the OS handle it (exits/backgrounds the app)
    navStack.pop();
    const previous = navStack[navStack.length - 1];
    suppressHistoryPush = true;
    showScreen(previous, { fromPopstate: true });
    suppressHistoryPush = false;
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function openModal(title, body, onConfirm, confirmLabel = "Delete") {
    const backdrop = document.getElementById("modal-backdrop");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").textContent = body;
    const confirmBtn = document.getElementById("modal-confirm");
    confirmBtn.textContent = confirmLabel;
    backdrop.classList.add("show");

    const cleanup = () => {
      backdrop.classList.remove("show");
      confirmBtn.removeEventListener("click", onConfirmClick);
    };
    const onConfirmClick = () => { cleanup(); onConfirm(); };
    confirmBtn.addEventListener("click", onConfirmClick);
    document.getElementById("modal-cancel").onclick = cleanup;
  }

  // ---------- history ----------
  function renderHistory() {
    const list = Storage.getHistory();
    const el = document.getElementById("history-list");
    if (!list.length) {
      el.innerHTML = `<div class="empty-state">No PDFs yet. Tap "Create content" to generate your first study document.</div>`;
      return;
    }
    const designationLabel = { school: "School", college: "College", job: "Job" };
    const pageLabel = { short: "Short", medium: "Medium", long: "Long" };
    el.innerHTML = "";
    list.forEach(item => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `
        <div class="history-main">
          <div class="history-title">${escapeHtml(item.topic)}</div>
          <div class="history-meta">${designationLabel[item.designation] || item.designation} · ${pageLabel[item.pageGoal] || "Medium"}${item.includeQuestions ? " · with Q&A" : ""} · ${new Date(item.createdAt).toLocaleDateString()}</div>
        </div>
        <button class="history-del" aria-label="Delete">✕</button>
      `;
      row.querySelector(".history-main").addEventListener("click", () => reopenHistoryItem(item));
      row.querySelector(".history-del").addEventListener("click", (e) => {
        e.stopPropagation();
        openModal("Delete this document?", `"${item.topic}" will be removed from your list. This can't be undone.`, () => {
          Storage.deleteHistoryItem(item.id);
          renderHistory();
          showToast("Deleted");
        });
      });
      el.appendChild(row);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function reopenHistoryItem(item) {
    pendingRegenerate = item;
    runGeneration(item.topic, item.designation, item.pageGoal || "medium", item.includeQuestions, item.id);
  }

  // ---------- book history ----------
  function renderBookHistory() {
    const list = Storage.getBookHistory();
    const el = document.getElementById("book-history-list");
    if (!list.length) {
      el.innerHTML = `<div class="empty-state">No books yet. Tap "Find a book" to generate your first one.</div>`;
      return;
    }
    const modeLabel = { fulltext: "Full text", studyguide: "Study guide" };
    el.innerHTML = "";
    list.forEach(item => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `
        <div class="history-main">
          <div class="history-title">${escapeHtml(item.title)}</div>
          <div class="history-meta">${modeLabel[item.mode] || ""}${item.includeQuestions ? " · with questions" : ""} · ${new Date(item.createdAt).toLocaleDateString()}</div>
        </div>
        <button class="history-del" aria-label="Delete">✕</button>
      `;
      row.querySelector(".history-main").addEventListener("click", () => reopenBookHistoryItem(item));
      row.querySelector(".history-del").addEventListener("click", (e) => {
        e.stopPropagation();
        openModal("Delete this book?", `"${item.title}" will be removed from your list. This can't be undone.`, () => {
          Storage.deleteBookHistoryItem(item.id);
          renderBookHistory();
          showToast("Deleted");
        });
      });
      el.appendChild(row);
    });
  }

  function reopenBookHistoryItem(item) {
    runBookGeneration(item.title, item.includeQuestions, item.id);
  }

  // ---------- create flow wiring ----------
  function resetWizard() {
    wizard.designation = null;
    wizard.pageGoal = null;
    wizard.includeQuestions = false;
    wizard.topic = "";
    document.querySelectorAll("#designation-list .option-card").forEach(c => c.classList.remove("selected"));
    document.getElementById("btn-designation-continue").disabled = true;
    document.querySelectorAll("#pages-list .option-card").forEach(c => c.classList.remove("selected"));
    document.getElementById("btn-pages-continue").disabled = true;
    document.getElementById("toggle-questions").classList.remove("on");
    document.getElementById("topic-input").value = "";
    document.getElementById("btn-generate").disabled = true;
    Storage.clearWizardState();
  }

  /** Reflects the wizard object back onto the UI — used when resuming a saved in-progress task. */
  function applyWizardStateToUI() {
    if (wizard.designation) {
      document.querySelectorAll("#designation-list .option-card").forEach(c => {
        c.classList.toggle("selected", c.dataset.value === wizard.designation);
      });
      document.getElementById("btn-designation-continue").disabled = false;
    }
    if (wizard.pageGoal) {
      document.querySelectorAll("#pages-list .option-card").forEach(c => {
        c.classList.toggle("selected", c.dataset.value === wizard.pageGoal);
      });
      document.getElementById("btn-pages-continue").disabled = false;
    }
    document.getElementById("toggle-questions").classList.toggle("on", !!wizard.includeQuestions);
    if (wizard.topic) {
      document.getElementById("topic-input").value = wizard.topic;
      document.getElementById("btn-generate").disabled = false;
    }
  }

  function initCreateFlow() {
    document.getElementById("open-create").addEventListener("click", () => {
      resetWizard();
      showScreen("screen-designation");
    });

    document.querySelectorAll("#designation-list .option-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll("#designation-list .option-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        wizard.designation = card.dataset.value;
        document.getElementById("btn-designation-continue").disabled = false;
        Storage.setWizardState(wizard);
      });
    });
    document.getElementById("btn-designation-continue").addEventListener("click", () => showScreen("screen-pages"));

    document.querySelectorAll("#pages-list .option-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll("#pages-list .option-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        wizard.pageGoal = card.dataset.value;
        document.getElementById("btn-pages-continue").disabled = false;
        Storage.setWizardState(wizard);
      });
    });
    document.getElementById("btn-pages-continue").addEventListener("click", () => showScreen("screen-questions"));

    document.getElementById("toggle-questions").addEventListener("click", (e) => {
      e.currentTarget.classList.toggle("on");
      wizard.includeQuestions = e.currentTarget.classList.contains("on");
      Storage.setWizardState(wizard);
    });
    document.getElementById("btn-questions-continue").addEventListener("click", () => showScreen("screen-topic"));

    const topicInput = document.getElementById("topic-input");
    topicInput.addEventListener("input", () => {
      wizard.topic = topicInput.value.trim();
      document.getElementById("btn-generate").disabled = wizard.topic.length === 0;
      Storage.setWizardState(wizard);
    });
    document.querySelectorAll("#screen-topic .chip").forEach(chip => {
      chip.addEventListener("click", () => {
        topicInput.value = chip.dataset.topic;
        topicInput.dispatchEvent(new Event("input"));
      });
    });

    document.getElementById("btn-generate").addEventListener("click", () => {
      pendingRegenerate = null;
      runGeneration(wizard.topic, wizard.designation, wizard.pageGoal, wizard.includeQuestions, null);
    });
  }

  // ---------- generation ----------
  async function runGeneration(topic, designation, pageGoal, includeQuestions, existingId) {
    const goal = pageGoal || "medium";
    showScreen("screen-generating");
    const statusEl = document.getElementById("generating-status");
    statusEl.textContent = "Fetching source material…";

    try {
      const data = await Content.generate(topic, designation, goal, includeQuestions, (msg) => {
        statusEl.textContent = msg;
      });

      const meta = {
        designation,
        dateStr: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      };

      lastGenerated = { data, meta };

      const historyItem = {
        id: existingId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
        topic: data.title,
        designation,
        pageGoal: goal,
        includeQuestions,
        createdAt: Date.now()
      };
      Storage.addHistoryItem(historyItem);
      renderHistory();
      Storage.clearWizardState(); // task complete — nothing left to resume into

      document.getElementById("result-title").textContent = "Your PDF is ready";
      document.getElementById("result-sub").textContent =
        `"${data.title}" — ${includeQuestions ? "with practice questions — " : ""}saved to your documents.`;
      showScreen("screen-result");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Something went wrong. Try a different topic.");
      showScreen(existingId ? "screen-home" : "screen-topic");
    }
  }

  function initResultScreen() {
    document.getElementById("btn-download").addEventListener("click", () => {
      if (!lastGenerated) return;
      PdfBuilder.buildAndDownload(lastGenerated.data, lastGenerated.meta);
      showToast("Download started");
    });
    document.getElementById("btn-result-home").addEventListener("click", () => showScreen("screen-home"));
  }

  // ---------- books flow wiring ----------
  let bookSearchToken = 0; // guards against a slow, stale search overwriting a newer one

  function resetBookSearch() {
    document.getElementById("book-search-input").value = "";
    document.getElementById("book-search-results").innerHTML =
      `<div class="empty-state">Search for a book to see results.</div>`;
  }

  function escapeAttr(str) {
    return String(str || "").replace(/"/g, "&quot;");
  }

  function renderBookSearchResults(results, query) {
    const el = document.getElementById("book-search-results");
    if (!results.length) {
      el.innerHTML = `<div class="book-search-empty">No books found for "${escapeHtml(query)}". Try a different spelling or a shorter title.</div>`;
      return;
    }
    const sourceLabel = { openlibrary: "Open Library", googlebooks: "Google Books" };
    el.innerHTML = "";
    results.forEach((book, i) => {
      const card = document.createElement("div");
      card.className = "book-result-card";
      const cover = book.coverUrl
        ? `<img class="book-result-cover" src="${escapeAttr(book.coverUrl)}" alt="" loading="lazy" />`
        : `<div class="book-result-cover placeholder">📖</div>`;
      const meta = [book.author, book.year].filter(Boolean).join(" · ");

      let actions = `<button class="book-action-btn primary" data-action="generate" data-idx="${i}">Generate PDF</button>`;
      if (book.freeDownloadUrl) {
        actions += `<button class="book-action-btn" data-action="download" data-idx="${i}">Download free</button>`;
      }
      if (book.previewUrl) {
        actions += `<button class="book-action-btn" data-action="preview" data-idx="${i}">Preview</button>`;
      }

      card.innerHTML = `
        ${cover}
        <div class="book-result-info">
          <div class="book-result-title">${escapeHtml(book.title)}</div>
          ${meta ? `<div class="book-result-meta">${escapeHtml(meta)}</div>` : ""}
          <div class="book-source-badge">${sourceLabel[book.source] || book.source}</div>
          <div class="book-result-actions">${actions}</div>
        </div>
      `;
      el.appendChild(card);
    });

    el.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const book = results[Number(btn.dataset.idx)];
        if (btn.dataset.action === "download") window.open(book.freeDownloadUrl, "_blank", "noopener");
        else if (btn.dataset.action === "preview") window.open(book.previewUrl, "_blank", "noopener");
        else runBookGeneration(book.title, true, null);
      });
    });
  }

  async function runBookSearch(query) {
    const el = document.getElementById("book-search-results");
    const token = ++bookSearchToken;
    el.innerHTML = `<div class="book-search-loading">Searching…</div>`;
    try {
      const results = await Books.searchBooks(query);
      if (token !== bookSearchToken) return; // a newer search started while this one was in flight
      renderBookSearchResults(results, query);
    } catch (e) {
      console.error(e);
      if (token !== bookSearchToken) return;
      el.innerHTML = `<div class="book-search-empty">Search failed — please try again.</div>`;
    }
  }

  function initBookFlow() {
    document.getElementById("open-book-create").addEventListener("click", () => {
      resetBookSearch();
      showScreen("screen-book-input");
    });

    const searchInput = document.getElementById("book-search-input");
    let debounceTimer = null;
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < 3) {
        document.getElementById("book-search-results").innerHTML =
          `<div class="empty-state">Search for a book to see results.</div>`;
        return;
      }
      debounceTimer = setTimeout(() => runBookSearch(q), 500);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(debounceTimer);
        const q = searchInput.value.trim();
        if (q.length >= 2) runBookSearch(q);
      }
    });
  }

  async function runBookGeneration(title, includeQuestions, existingId) {
    showScreen("screen-book-generating");
    const statusEl = document.getElementById("book-generating-status");
    statusEl.textContent = "Checking availability…";

    try {
      const data = await Books.generate(title, includeQuestions, (msg) => {
        statusEl.textContent = msg;
      });

      lastGeneratedBook = { data };

      const historyItem = {
        id: existingId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
        title: data.title,
        mode: data.mode,
        includeQuestions,
        createdAt: Date.now()
      };
      Storage.addBookHistoryItem(historyItem);
      renderBookHistory();

      const modeLabel = data.mode === "fulltext" ? "Full text" : "Study guide";
      document.getElementById("book-result-title").textContent = "Your PDF is ready";
      document.getElementById("book-result-sub").textContent =
        `"${data.title}" — ${modeLabel}${includeQuestions ? " with questions" : ""} — saved to your books.`;
      showScreen("screen-book-result");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Something went wrong. Try the exact book title.");
      showScreen(existingId ? "screen-books" : "screen-book-input");
    }
  }

  function initBookResultScreen() {
    document.getElementById("btn-book-download").addEventListener("click", async () => {
      if (!lastGeneratedBook) return;
      const btn = document.getElementById("btn-book-download");
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = lastGeneratedBook.data.mode === "fulltext" ? "Preparing (this can take a moment)…" : "Preparing…";
      try {
        await PdfBuilder.buildBookAndDownload(lastGeneratedBook.data);
        showToast("Download started");
      } catch (e) {
        console.error(e);
        showToast("Could not build the PDF — please try again.");
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
    document.getElementById("btn-book-result-home").addEventListener("click", () => showScreen("screen-books"));
  }

  // ---------- back buttons / tabbar ----------
  function initNav() {
    document.querySelectorAll("[data-back]").forEach(btn => {
      btn.addEventListener("click", () => showScreen(btn.dataset.back));
    });
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => showScreen(btn.dataset.tab));
    });
  }

  // ---------- settings ----------
  function renderProfile() {
    const user = Storage.getUser();
    if (!user) return;
    document.getElementById("profile-name").textContent = user.name || "Student";
    document.getElementById("profile-email").textContent = user.email || "";
    if (user.picture) document.getElementById("profile-avatar").src = user.picture;
  }

  function initSettings() {
    document.getElementById("open-credits").addEventListener("click", () => showScreen("screen-credits"));

    document.getElementById("btn-clear-history").addEventListener("click", () => {
      openModal("Delete all documents?", "Every saved document name will be removed from this device. This can't be undone.", () => {
        Storage.clearHistory();
        renderHistory();
        showToast("All documents deleted");
      });
    });

    document.getElementById("btn-sign-out").addEventListener("click", () => {
      openModal("Sign out?", "You can sign back in any time with the same Google account.", () => {
        Auth.signOut();
        navStack = [];
        showScreen("screen-login");
      }, "Sign out");
    });

    document.getElementById("btn-delete-account").addEventListener("click", () => {
      openModal("Delete account?", "This removes your session and every saved document name from this device. This can't be undone.", () => {
        Storage.deleteAccount();
        Auth.signOut();
        showToast("Account deleted");
        navStack = [];
        showScreen("screen-login");
      }, "Delete account");
    });
  }

  // ---------- login ----------
  function onLoginSuccess(user) {
    renderProfile();
    renderHistory();
    renderBookHistory();
    showScreen("screen-home");
    requestFullscreenIfInstalled();
  }

  function requestFullscreenIfInstalled() {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches || window.navigator.standalone;
    if (isStandalone && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  // ---------- swipe gestures (left/right between tabs) ----------
  function initSwipeGestures() {
    const area = document.getElementById("tab-content-area");
    if (!area) return;
    const SWIPE_THRESHOLD = 60;
    let startX = 0, startY = 0, tracking = false;

    area.addEventListener("touchstart", (e) => {
      const activeId = document.querySelector(".screen.active")?.id;
      tracking = TAB_SCREENS.includes(activeId) && e.touches.length === 1;
      if (!tracking) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    area.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // Ignore short drags and anything more vertical than horizontal (scrolling a list, etc.)
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;

      const activeId = document.querySelector(".screen.active")?.id;
      const idx = TAB_SCREENS.indexOf(activeId);
      if (idx === -1) return;

      if (dx < 0 && idx < TAB_SCREENS.length - 1) {
        showScreen(TAB_SCREENS[idx + 1]); // swiped left -> next tab
      } else if (dx > 0 && idx > 0) {
        showScreen(TAB_SCREENS[idx - 1]); // swiped right -> previous tab
      }
    }, { passive: true });
  }

  // ---------- boot ----------
  function init() {
    document.getElementById("credit-year").textContent = new Date().getFullYear();

    initNav();
    initCreateFlow();
    initResultScreen();
    initBookFlow();
    initBookResultScreen();
    initSettings();
    initSwipeGestures();

    const existingUser = Storage.getUser();
    if (existingUser) {
      renderProfile();
      renderHistory();
      renderBookHistory();

      const savedWizard = Storage.getWizardState();
      if (savedWizard) {
        Object.assign(wizard, savedWizard);
        applyWizardStateToUI();
      }

      const savedScreen = Storage.getLastScreen();
      showScreen(RESUMABLE_SCREENS.includes(savedScreen) ? savedScreen : "screen-home");
      requestFullscreenIfInstalled();
    } else {
      showScreen("screen-login");
      Auth.init();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }

    window.addEventListener("popstate", handlePopState);
  }

  return { init, onLoginSuccess };
})();

document.addEventListener("DOMContentLoaded", App.init);
