/**
 * EASYSEARCH — auth
 *
 * Uses Google Identity Services (accounts.google.com/gsi/client), which is
 * free with no usage limits tied to billing. We decode the returned JWT
 * purely client-side to read name/email/picture for display — there's no
 * server to verify it against, which is expected for a zero-cost static app.
 */
const Auth = (() => {
  function decodeJwt(token) {
    const payload = token.split(".")[1];
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  }

  function handleCredentialResponse(response) {
    const data = decodeJwt(response.credential);
    const user = {
      name: data.name || "Student",
      email: data.email || "",
      picture: data.picture || "icons/icon-192.png"
    };
    Storage.setUser(user);
    App.onLoginSuccess(user);
  }

  function init() {
    if (!window.google || !google.accounts || !google.accounts.id) {
      // Google script not loaded (offline, blocked, or first paint) — retry shortly.
      setTimeout(init, 400);
      return;
    }
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false
    });
    google.accounts.id.renderButton(
      document.getElementById("google-btn-container"),
      { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 260 }
    );
  }

  function signOut() {
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    Storage.clearUser();
  }

  return { init, signOut };
})();
