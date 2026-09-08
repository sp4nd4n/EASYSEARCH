# EASYSEARCH

A study-PDF generator: pick who it's for (school / college / job), choose whether to add practice questions, type a topic, and get a downloadable PDF. Built as plain HTML/CSS/JS with no backend, so hosting is free forever (GitHub Pages) and there is no server, database, or API bill.

---

## 1. How it works, and why it stays free

| Need | Free approach used | Why not the "obvious" paid option |
|---|---|---|
| Google login | [Google Identity Services](https://developers.google.com/identity/gsi/web) client-side sign-in | Free for unlimited users. There's no backend, so this is a UI identity/gate, not a server-verified session — normal for a static app like this. |
| "Search the web" for a topic | [Wikipedia's public API](https://www.mediawiki.org/wiki/API:Main_page) (keyless, free, CORS-enabled) | A general web-search API (Google/Bing) either costs money at real usage or needs a paid-tier key. Wikipedia gives solid, well-structured reference text for free with no rate-limit surprises. |
| Generating the PDF | [jsPDF](https://github.com/parallax/jsPDF) running in the browser, with an embedded Spectral font (OFL-licensed, shipped statically in `js/pdf-fonts.js`) for headings, real paragraph breaks, and images spread across sections | No server-side rendering service to pay for, and no live font-CDN fetch needed at generation time. |
| Practice questions | Local JavaScript pattern-matching (definition-sentence detection) | A genuinely free method. An LLM (e.g. Claude/GPT) would produce noticeably better questions, but every such API charges per request — wire one in later (see below) if you're OK with that cost. |
| Storing your PDFs | Only the **topic name + settings** are saved in the browser's `localStorage`. Tapping a saved title re-runs the generator and rebuilds the same PDF. | Storing actual PDF files needs cloud storage (Firebase, S3, etc.), which isn't free at scale. Regenerating is free and (for Wikipedia-sourced topics) reliably reproducible. |
| Hosting | [GitHub Pages](https://pages.github.com/) | Free static hosting, HTTPS included (required for both PWA install and Google login). |
| Books — full text | [Project Gutenberg](https://www.gutenberg.org) via [Gutendex](https://gutendex.com) (free, keyless) | Only legally possible for public-domain titles. |
| Books — study guide | Wikipedia (CC BY-SA) + [Open Library](https://openlibrary.org) (free, keyless) for metadata/cover | Any book still under copyright can't legally have its full text reproduced, at any price — so this path builds a synopsis/themes/discussion guide instead, and never fetches the book's own text. |

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
├── index.html          # all screens (login, content, books, result, settings, credits)
├── manifest.json        # PWA config — name, icons, fullscreen display
├── service-worker.js    # offline app-shell caching
├── css/styles.css        # blue/black theme, layout, components
├── js/
│   ├── config.js         # Google Client ID goes here
│   ├── storage.js        # localStorage: user session, content history, book history
│   ├── auth.js           # Google Identity Services wiring
│   ├── content.js        # Wikipedia fetch + designation shaping + question generation
│   ├── books.js          # Gutenberg full-text path + Wikipedia/Open Library study-guide path
│   ├── pdf-fonts.js      # embedded Spectral font (base64), SIL Open Font License
│   ├── pdf.js             # jsPDF document builders (topics + both book modes)
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

## 8. The BOOKS section

Type any book title in the Books tab. The app checks it automatically and picks one of two paths — there's no way to force one or the other, by design:

- **Public domain (pre-~1929 classics, mostly)** → the *entire real text* is fetched free from Project Gutenberg (via [Gutendex](https://gutendex.com), no key needed) and paginated into a PDF. This is the only case where "500 pages" is real — a full novel really does run that long once formatted with margins and reasonable font size.
- **Anything still under copyright (most books people call "famous" today)** → a study guide instead: synopsis, themes, and background pulled from the book's own Wikipedia article, plus author/cover info from Open Library, ending with a few discussion questions. **The book's actual text is never fetched or included.** This isn't a lesser version of the feature — reproducing a copyrighted book's full text isn't something this app does, at any price.

Two honest caveats worth knowing:

- **The Gutenberg text fetch can occasionally fail.** Some of Gutenberg's file mirrors may not send the CORS headers a browser needs to read the response. When that happens, the app quietly falls back to the study-guide path instead of erroring out — so a public-domain title might still come back as a study guide if its mirror doesn't cooperate that day.
- **Long books take real time and battery to paginate**, since jsPDF does this entirely on-device with no server. The generating screen shows rough progress; expect a 500-page novel to take noticeably longer than a short story, especially on older phones.

The full-text PDFs intentionally keep Project Gutenberg's own header and license text intact rather than stripping it — that's the straightforward, always-compliant way to redistribute their files under their license.

## 9. Installation warning on Android

When installing the app, your phone's package installer may flag it as a potentially harmful app. This is expected and not a sign of anything wrong — it's because the app isn't signed through the Google Play Store, which is the only signal Android checks for. The app doesn't collect or transmit personal information beyond what's described above (Google sign-in identity, all shown in this README).

---

© Spandan Chatterjee. All rights reserved.
