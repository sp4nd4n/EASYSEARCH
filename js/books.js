/**
 * EASYSEARCH — books engine
 *
 * Two paths, chosen automatically per title, both free:
 *
 *  1. PUBLIC DOMAIN → full text.
 *     Checked via Gutendex (https://gutendex.com), a free, keyless, CORS-
 *     enabled wrapper around Project Gutenberg's catalog. If the title is
 *     found with copyright:false, we fetch the actual plain-text file
 *     Gutenberg hosts and paginate the *entire, unmodified* file — which
 *     already includes Gutenberg's own header and footer/license text —
 *     into the PDF. We don't strip or edit that boilerplate: keeping it
 *     verbatim is the straightforward, always-compliant way to redistribute
 *     a Gutenberg text.
 *
 *  2. STILL UNDER COPYRIGHT → study guide, not the book.
 *     We do not have, and will not build, any free (or paid) way to
 *     legally reproduce a copyrighted book's full text. Instead this path
 *     builds a synopsis/themes/discussion-question guide from free public
 *     sources: Wikipedia's article about the book (CC BY-SA, same as the
 *     Content engine) for plot/background/reception, and Open Library's
 *     free API for author/cover metadata. The book's own text is never
 *     fetched or included.
 *
 * A Gutendex miss, or any network/CORS failure while checking it, is
 * treated the same as "not public domain" — it falls through to the study
 * guide path rather than erroring out.
 */
const Books = (() => {
  const GUTENDEX_API = "https://gutendex.com/books/";
  const WIKI_API = "https://en.wikipedia.org/w/api.php";
  const OPENLIBRARY_API = "https://openlibrary.org/search.json";

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ---------------- Path 1: public domain (Gutenberg) ----------------

  /** Looks up a title on Gutendex. Returns a public-domain match, or null (incl. on any failure). */
  async function findPublicDomainMatch(title) {
    try {
      const url = `${GUTENDEX_API}?search=${encodeURIComponent(title)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const hit = (data.results || []).find(b => b.copyright === false) || null;
      if (!hit) return null;

      const textUrl = hit.formats && (hit.formats["text/plain; charset=utf-8"] || hit.formats["text/plain"]);
      if (!textUrl) return null; // no plain-text format available for this edition

      return {
        gutenbergId: hit.id,
        title: hit.title,
        author: (hit.authors && hit.authors[0] && hit.authors[0].name) || "Unknown author",
        textUrl
      };
    } catch (e) {
      console.warn("Gutendex lookup skipped (falling back to study guide):", e);
      return null;
    }
  }

  /** Fetches the full raw Gutenberg text file. Returns null on any network/CORS failure. */
  async function fetchGutenbergText(textUrl) {
    try {
      const res = await fetch(textUrl);
      if (!res.ok) return null;
      const text = await res.text();
      return text && text.length > 0 ? text : null;
    } catch (e) {
      console.warn("Could not fetch Gutenberg text (falling back to study guide):", e);
      return null;
    }
  }

  // ---------------- Path 2: study guide (Wikipedia + Open Library) ----------------

  async function searchWikipediaArticle(title) {
    const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(title + " novel")}&format=json&origin=*&srlimit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Search request failed");
    const data = await res.json();
    const hit = data?.query?.search?.[0];
    if (!hit) throw new Error(`No reference material found for "${title}".`);
    return { pageid: hit.pageid, title: hit.title };
  }

  async function fetchWikipediaExtract(pageid) {
    const url = `${WIKI_API}?action=query&prop=extracts&explaintext=1&pageids=${pageid}&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Content request failed");
    const data = await res.json();
    const page = data?.query?.pages?.[pageid];
    if (!page || !page.extract) throw new Error("No readable content returned for this book.");
    return page.extract
      .replace(/\[\d+\]/g, "")
      .replace(/\[(citation needed|clarification needed|note \d+|[a-z])\]/gi, "");
  }

  function splitSections(raw) {
    const lines = raw.split("\n");
    const sections = [];
    let current = { heading: "Overview", paras: [] };
    for (const line of lines) {
      const headerMatch = line.match(/^(={2,4})\s*(.+?)\s*\1$/);
      if (headerMatch) {
        if (current.paras.length) sections.push(current);
        current = { heading: headerMatch[2].trim(), paras: [] };
      } else if (line.trim()) {
        current.paras.push(line.trim());
      }
    }
    if (current.paras.length) sections.push(current);
    const skip = /^(see also|references|external links|further reading|notes|bibliography|adaptations)$/i;
    return sections.filter(s => !skip.test(s.heading)).map(s => ({ heading: s.heading, paragraphs: s.paras }));
  }

  async function fetchOpenLibraryMeta(title) {
    try {
      const url = `${OPENLIBRARY_API}?title=${encodeURIComponent(title)}&limit=1`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const doc = data?.docs?.[0];
      if (!doc) return null;

      let image = null;
      if (doc.cover_i) {
        try {
          const coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
          const imgRes = await fetch(coverUrl);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            if (blob && blob.size > 0) image = { dataUrl: await blobToDataUrl(blob), width: 400, height: 600 };
          }
        } catch { /* cover is a nice-to-have, skip on failure */ }
      }

      return {
        author: doc.author_name && doc.author_name[0],
        publishYear: doc.first_publish_year,
        image
      };
    } catch (e) {
      console.warn("Open Library lookup skipped:", e);
      return null;
    }
  }

  /** Open-ended discussion prompts built from section headings — no AI call, genuinely free. */
  function generateDiscussionQuestions(bookTitle, sections) {
    const templates = [
      h => `What role does "${h}" play in ${bookTitle}, and how does it shape the story's meaning?`,
      h => `How does the "${h}" section connect to the book's larger themes?`,
      h => `What would you highlight from "${h}" if you were leading a discussion on ${bookTitle}?`
    ];
    const usable = sections.filter(s => s.heading !== "Overview");
    return usable.slice(0, 6).map((s, i) => ({
      q: templates[i % templates.length](s.heading),
      a: (s.paragraphs.join(" ").match(/[^.!?]+[.!?]+/) || [s.paragraphs[0] || ""])[0].trim()
    }));
  }

  async function buildStudyGuide(title, includeQuestions, onStatus) {
    onStatus && onStatus("Looking up the book…");
    const [wiki, meta] = await Promise.all([
      searchWikipediaArticle(title).then(async ({ pageid, title: sourceTitle }) => {
        onStatus && onStatus("Fetching synopsis and background…");
        const raw = await fetchWikipediaExtract(pageid);
        return { sourceTitle, sections: splitSections(raw) };
      }),
      fetchOpenLibraryMeta(title)
    ]);

    if (!wiki.sections.length) throw new Error("This book didn't return usable content. Try the exact title.");

    let questions = [];
    if (includeQuestions) {
      onStatus && onStatus("Preparing discussion questions…");
      questions = generateDiscussionQuestions(title, wiki.sections);
    }

    return {
      mode: "studyguide",
      title: title.trim(),
      author: meta && meta.author,
      publishYear: meta && meta.publishYear,
      sourceTitle: wiki.sourceTitle,
      sections: wiki.sections.slice(0, 6),
      questions,
      image: meta && meta.image
    };
  }

  const GENERIC_DISCUSSION_QUESTIONS = [
    "What surprised you most about how the story unfolded?",
    "Which character did you relate to most, and why?",
    "How does the setting shape the events of the book?",
    "What central theme do you think the author wanted readers to take away?",
    "Would you recommend this book to a friend? Why or why not?"
  ];

  // ---------------- Main entry point ----------------

  /**
   * @returns {Promise<object>} either a {mode:'fulltext', ...} or {mode:'studyguide', ...} payload
   */
  async function generate(title, includeQuestions, onStatus) {
    onStatus && onStatus("Checking availability…");
    const pd = await findPublicDomainMatch(title);

    if (pd) {
      onStatus && onStatus("Fetching the full public-domain text…");
      const rawText = await fetchGutenbergText(pd.textUrl);
      if (rawText) {
        return {
          mode: "fulltext",
          title: pd.title,
          author: pd.author,
          gutenbergId: pd.gutenbergId,
          rawText,
          // Generic, book-club-style prompts — not tied to plot specifics we haven't analyzed.
          questions: includeQuestions ? GENERIC_DISCUSSION_QUESTIONS : []
        };
      }
      // Text fetch failed (e.g. a CORS-restricted mirror) — fall through to the study guide below.
      onStatus && onStatus("Full text unavailable right now — building a study guide instead…");
    }

    return buildStudyGuide(title, includeQuestions, onStatus);
  }

  return { generate };
})();
