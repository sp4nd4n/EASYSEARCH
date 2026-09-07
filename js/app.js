/**
 * EASYSEARCH — app controller
 */
const App = (() => {
  const wizard = { designation: null, pageGoal: null, includeQuestions: false, topic: "" };
  let lastGenerated = null; // { data, meta, filename } for the result screen's download button
  let pendingRegenerate = null; // history item being reopened, if any

  // Screens worth resuming into if the user reopens the app mid-task.
  // Transient screens (login, generating, result) are deliberately excluded.
  const RESUMABLE_SCREENS = [
    "screen-home", "screen-settings", "screen-credits",
    "screen-designation", "screen-pages", "screen-questions", "screen-topic"
  ];

  // ---------- screen navigation ----------
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");

    const tabbar = document.getElementById("tabbar");
    const topLevel = id === "screen-home" || id === "screen-settings";
    tabbar.style.display = topLevel ? "flex" : "none";
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === id);
    });

    // Remember where a logged-in user is, so relaunching the app resumes here.
    if (Storage.getUser() && RESUMABLE_SCREENS.includes(id)) {
      Storage.setLastScreen(id);
    }
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
    document.querySelectorAll(".chip").forEach(chip => {
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
        showScreen("screen-login");
      }, "Sign out");
    });

    document.getElementById("btn-delete-account").addEventListener("click", () => {
      openModal("Delete account?", "This removes your session and every saved document name from this device. This can't be undone.", () => {
        Storage.deleteAccount();
        Auth.signOut();
        showToast("Account deleted");
        showScreen("screen-login");
      }, "Delete account");
    });
  }

  // ---------- login ----------
  function onLoginSuccess(user) {
    renderProfile();
    renderHistory();
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

  // ---------- boot ----------
  function init() {
    document.getElementById("credit-year").textContent = new Date().getFullYear();

    initNav();
    initCreateFlow();
    initResultScreen();
    initSettings();

    const existingUser = Storage.getUser();
    if (existingUser) {
      renderProfile();
      renderHistory();

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
  }

  return { init, onLoginSuccess };
})();

document.addEventListener("DOMContentLoaded", App.init);
