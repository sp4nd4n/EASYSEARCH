# EASYSEARCH

A study-PDF generator: pick who it's for (school / college / job), choose whether to add practice questions, type a topic, and get a downloadable PDF. Built as plain HTML/CSS/JS with no backend, so hosting is free forever (GitHub Pages) and there is no server, database, or API bill.

---

## 1. How it works, and why it stays free

| Need | Free approach used | Why not the "obvious" paid option |
|---|---|---|
| Google login | [Google Identity Services](https://developers.google.com/identity/gsi/web) client-side sign-in | Free for unlimited users. There's no backend, so this is a UI identity/gate, not a server-verified session — normal for a static app like this. |
| "Search the web" for a topic | [Wikipedia's public API](https://www.mediawiki.org/wiki/API:Main_page) (keyless, free, CORS-enabled) | A general web-search API (Google/Bing) either costs money at real usage or needs a paid-tier key. Wikipedia gives solid, well-structured reference text for free with no rate-limit surprises. |
| Generating the PDF | [jsPDF](https://github.com/parallax/jsPDF) running in the browser | No server-side rendering service to pay for. |
| Practice questions | Local JavaScript pattern-matching (definition-sentence detection) | A genuinely free method. An LLM (e.g. Claude/GPT) would produce noticeably better questions, but every such API charges per request — wire one in later (see below) if you're OK with that cost. |
| Storing your PDFs | Only the **topic name + settings** are saved in the browser's `localStorage`. Tapping a saved title re-runs the generator and rebuilds the same PDF. | Storing actual PDF files needs cloud storage (Firebase, S3, etc.), which isn't free at scale. Regenerating is free and (for Wikipedia-sourced topics) reliably reproducible. |
| Hosting | [GitHub Pages](https://pages.github.com/) | Free static hosting, HTTPS included (required for both PWA install and Google login). |

Two more things worth knowing about how the app behaves:

- **Page length step.** After picking a designation, there's now a Short / Medium / Long step that controls roughly how many Wikipedia sections go into the PDF (short ≈ 1–2 pages, medium ≈ 3–5, long ≈ 6+). It's saved per document, so reopening a saved PDF regenerates it at the same length.
- **Resume where you left off.** The app remembers the screen (and any in-progress "create content" selections) a signed-in user was last on, in `localStorage`. Reopening the app — or reinstalling the PWA on the same device — picks up from there instead of always starting at the home screen. This resets on sign-out or account deletion.
- **One image per PDF.** Each document tries to include the topic's main Wikipedia image (via the same free API, `pageimages`), placed below the title. If Wikipedia has no image for that topic, or the image can't be fetched, the PDF is generated without one — this never blocks generation.

**Everything lives on the user's device.** There is no database — sign-out, "delete document", and "delete account" all just clear browser storage.

---

## 2. Set up Google Sign-In (free, ~5 minutes)

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a new project (no billing account required for this).
3. Click **Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins**, add the exact URL you'll host on, e.g. `https://YOUR_USERNAME.github.io`.
4. Copy the generated Client ID.
5. Open `js/config.js` and paste it in:
   ```js
   GOOGLE_CLIENT_ID: "123456789-abc.apps.googleusercontent.com",
   ```
6. You may also be asked to configure the **OAuth consent screen** (External, add your email as a test user or publish it) — still free.

Until you set a real client ID, the Google button will render but sign-in will fail — the app strictly requires a working Google login, with no bypass, per spec.

---

## 3. Deploy to GitHub Pages (free)

1. Create a new GitHub repository, e.g. `easysearch`.
2. Push everything in this folder to the repo root (`index.html` should sit at the top level).
3. In the repo: **Settings → Pages → Source → Deploy from a branch → `main` / root**.
4. Your app will be live at `https://YOUR_USERNAME.github.io/easysearch/`.
5. Make sure this exact URL is in your Google OAuth **Authorized JavaScript origins** (step 2 above) — Google login will fail otherwise.

---

## 4. Install as a fullscreen app on Android

1. Open the GitHub Pages URL in Chrome on the Android phone.
2. Tap the **⋮** menu → **Add to Home screen** (Chrome will usually also prompt this automatically after a visit or two, since the app has a valid manifest + service worker).
3. Launch it from the home screen icon — it opens without browser chrome, per `"display": "fullscreen"` in `manifest.json`.

---

## 5. File structure

```
EASYSEARCH/
├── index.html          # all screens (login, home, create flow, result, settings, credits)
├── manifest.json        # PWA config — name, icons, fullscreen display
├── service-worker.js    # offline app-shell caching
├── css/styles.css        # blue/black theme, layout, components
├── js/
│   ├── config.js         # Google Client ID goes here
│   ├── storage.js        # localStorage: user session + PDF-name history
│   ├── auth.js           # Google Identity Services wiring
│   ├── content.js        # Wikipedia fetch + designation shaping + question generation
│   ├── pdf.js             # jsPDF document builder
│   └── app.js             # screen navigation & app state
└── icons/                # app icons (192, 512, maskable)
```

---

## 6. Honest limitations (worth knowing)

- **No real backend auth.** Google login here identifies the user for the UI; it isn't verified server-side, because there's no server. Fine for a personal/free project — not appropriate for anything handling sensitive data.
- **Question quality is basic.** It's rule-based sentence extraction, not AI-generated. It reliably finds definition-style facts but won't ask genuinely creative or higher-order questions.
- **Regeneration depends on Wikipedia having an article close to what the user typed.** Obscure or ambiguous topics may return a "no reference material found" message — encourage users to be specific (e.g. "cellular respiration" rather than "biology stuff").
- **Content is Wikipedia-derived (CC BY-SA).** The generated PDF prints a source/attribution line — please don't remove it if you publish this.

## 7. Optional future upgrade (not free)

If better question quality matters more than staying at zero cost, `content.js`'s `generateQuestions()` function is the place to swap in a real AI API call (e.g. the Anthropic API) — that will cost a small amount per PDF generated, billed to whatever API key you provide.

## 8. Installation issue
When you'll try to install the app, the package installer of your phone tag it as harmful app. But don't worry as it is not signed officialy by Google playstore, that's why that message is coming. The app is not gonna collect your personal informationa secretly behind your back.

---

© Spandan Chatterjee. All rights reserved.
