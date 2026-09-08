/**
 * EASYSEARCH — config
 *
 * GOOGLE_CLIENT_ID
 * -----------------
 * Create this for free at https://console.cloud.google.com/apis/credentials
 *   1. Create a project (free).
 *   2. "Create credentials" → "OAuth client ID" → Application type: "Web application".
 *   3. Under "Authorized JavaScript origins" add the exact URL you will host
 *      the app on, e.g. https://yourusername.github.io
 *   4. Copy the generated client ID and paste it below.
 * There is no cost for this — Google Sign-In / Identity Services is free
 * for any number of users.
 *
 * Note: because EasySearch has no backend server, this sign-in is used to
 * identify the user in the UI (name, email, avatar) and gate the app —
 * it is not a server-verified session. That's normal for a static,
 * zero-cost, client-only app like this one.
 */
const CONFIG = {
  GOOGLE_CLIENT_ID: "986970006034-eb4db9p1jmh2f9mps27h43m75ndfehpv.apps.googleusercontent.com",
  APP_NAME: "EASYSEARCH",
  DEVELOPER: "Spandan Chatterjee"
};
