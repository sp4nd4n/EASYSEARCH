/**
 * EASYSEARCH — storage
 *
 * Everything lives in the browser's localStorage on this device only.
 * No cloud, no backend, no cost.
 *
 * Important design choice (per spec): we never store the generated PDF
 * file itself. We only store the small metadata needed to regenerate it
 * on demand (topic, designation, whether to include questions, date).
 * Tapping a history item re-runs the same generation pipeline.
 */
const Storage = (() => {
  const USER_KEY = "es_user";
  const HISTORY_KEY = "es_history";
  const BOOK_HISTORY_KEY = "es_book_history";
  const LAST_SCREEN_KEY = "es_last_screen";
  const WIZARD_KEY = "es_wizard_state";

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); }
    catch { return null; }
  }
  function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearUser() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LAST_SCREEN_KEY);
    localStorage.removeItem(WIZARD_KEY);
  }

  /** Remembers which screen the user was last on, so reopening the app resumes there. */
  function getLastScreen() {
    return localStorage.getItem(LAST_SCREEN_KEY);
  }
  function setLastScreen(id) {
    localStorage.setItem(LAST_SCREEN_KEY, id);
  }

  /** Remembers in-progress "create content" selections (designation/pages/questions/topic). */
  function getWizardState() {
    try { return JSON.parse(localStorage.getItem(WIZARD_KEY)); }
    catch { return null; }
  }
  function setWizardState(state) {
    localStorage.setItem(WIZARD_KEY, JSON.stringify(state));
  }
  function clearWizardState() {
    localStorage.removeItem(WIZARD_KEY);
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }
  function saveHistory(list) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  }
  function addHistoryItem(item) {
    const list = getHistory();
    // avoid exact duplicates (same topic+designation+questions) — bump date instead
    const dupeIdx = list.findIndex(
      h => h.topic.toLowerCase() === item.topic.toLowerCase() &&
           h.designation === item.designation &&
           h.includeQuestions === item.includeQuestions
    );
    if (dupeIdx !== -1) {
      list[dupeIdx].createdAt = item.createdAt;
      saveHistory(list);
      return list[dupeIdx];
    }
    list.unshift(item);
    saveHistory(list);
    return item;
  }
  function deleteHistoryItem(id) {
    saveHistory(getHistory().filter(h => h.id !== id));
  }
  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
  }

  function getBookHistory() {
    try { return JSON.parse(localStorage.getItem(BOOK_HISTORY_KEY)) || []; }
    catch { return []; }
  }
  function saveBookHistory(list) {
    localStorage.setItem(BOOK_HISTORY_KEY, JSON.stringify(list));
  }
  function addBookHistoryItem(item) {
    const list = getBookHistory();
    const dupeIdx = list.findIndex(
      h => h.title.toLowerCase() === item.title.toLowerCase() && h.includeQuestions === item.includeQuestions
    );
    if (dupeIdx !== -1) {
      list[dupeIdx].createdAt = item.createdAt;
      saveBookHistory(list);
      return list[dupeIdx];
    }
    list.unshift(item);
    saveBookHistory(list);
    return item;
  }
  function deleteBookHistoryItem(id) {
    saveBookHistory(getBookHistory().filter(h => h.id !== id));
  }
  function clearBookHistory() {
    localStorage.removeItem(BOOK_HISTORY_KEY);
  }

  function deleteAccount() {
    clearUser(); // already clears last-screen + wizard state
    clearHistory();
    clearBookHistory();
  }

  return {
    getUser, setUser, clearUser,
    getLastScreen, setLastScreen,
    getWizardState, setWizardState, clearWizardState,
    getHistory, addHistoryItem, deleteHistoryItem, clearHistory,
    getBookHistory, addBookHistoryItem, deleteBookHistoryItem, clearBookHistory,
    deleteAccount
  };
})();
