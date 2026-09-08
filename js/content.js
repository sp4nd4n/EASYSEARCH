/**
 * EASYSEARCH — content engine
 *
 * Free-of-cost by design:
 *  - Source material comes from the Wikipedia Action API, which is free,
 *    keyless, and CORS-enabled (origin=*). This is the "gather information
 *    from the web" step. A general web-wide search engine API (Google/Bing)
 *    either costs money at any real volume or requires a paid-tier key, so
 *    Wikipedia is the sustainable free source here.
 *  - Images (one lead image + a few section images) also come from
 *    Wikipedia/Wikimedia Commons via the same free API — no image-generation
 *    cost, no paid stock-photo API.
 *  - Question generation is done with local heuristics/pattern-matching in
 *    JavaScript — no AI API call, so no per-request cost. Quality is more
 *    basic than an LLM would produce, but it's genuinely free forever.
 */
const Content = (() => {
  const API = "https://en.wikipedia.org/w/api.php";
  const MAX_SECTION_IMAGES = 4;

  // How much material to include, chosen on the "page length" step.
  const SECTION_COUNT_BY_GOAL = { short: 2, medium: 5, long: 10 };

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function searchTitle(topic) {
    const url = `${API}?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Search request failed");
    const data = await res.json();
    const hit = data?.query?.search?.[0];
    if (!hit) throw new Error(`No reference material found for "${topic}". Try a different phrasing.`);
    return { pageid: hit.pageid, title: hit.title };
  }

  async function fetchExtract(pageid) {
    const url = `${API}?action=query&prop=extracts&explaintext=1&pageids=${pageid}&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Content request failed");
    const data = await res.json();
    const page = data?.query?.pages?.[pageid];
    if (!page || !page.extract) throw new Error("No readable content returned for this topic.");
    // Wikipedia's plaintext extract occasionally leaves citation markers like
    // "[1]" or "[citation needed]" behind — strip them for cleaner reading.
    return page.extract
      .replace(/\[\d+\]/g, "")
      .replace(/\[(citation needed|clarification needed|note \d+|[a-z])\]/gi, "");
  }

  /** Fetches one representative "hero" image for the topic. Fails silently — images are a nice-to-have. */
  async function fetchLeadImage(pageid) {
    try {
      const url = `${API}?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=640&pageids=${pageid}&format=json&origin=*`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const thumb = data?.query?.pages?.[pageid]?.thumbnail;
      if (!thumb || !thumb.source) return null;

      const imgRes = await fetch(thumb.source);
      if (!imgRes.ok) return null;
      const blob = await imgRes.blob();
      if (!blob || blob.size === 0) return null;

      return { dataUrl: await blobToDataUrl(blob), width: thumb.width, height: thumb.height };
    } catch (e) {
      console.warn("Lead image fetch skipped:", e);
      return null;
    }
  }

  /** Fetches a handful of extra images from the article to place alongside sections. */
  async function fetchSectionImages(pageid, excludeSourceUrl, max) {
    try {
      const listUrl = `${API}?action=query&prop=images&pageids=${pageid}&imlimit=40&format=json&origin=*`;
      const listRes = await fetch(listUrl);
      if (!listRes.ok) return [];
      const listData = await listRes.json();
      const files = (listData?.query?.pages?.[pageid]?.images || []).map(f => f.title);

      // Skip non-content icons/logos/flags that clutter rather than illustrate.
      const skip = /(commons-logo|wiktionary|wikiquote|wikisource|edit-icon|folder|question_mark|ambox|padlock|disambig|nuvola|sister|flag_of|coat_of_arms|official_seal|_icon|wiki-|loudspeaker)/i;
      const candidates = files.filter(t => /\.(jpe?g|png)$/i.test(t) && !skip.test(t)).slice(0, max + 1);
      if (!candidates.length) return [];

      const infoUrl = `${API}?action=query&titles=${encodeURIComponent(candidates.join("|"))}&prop=imageinfo&iiprop=url|size&iiurlwidth=560&format=json&origin=*`;
      const infoRes = await fetch(infoUrl);
      if (!infoRes.ok) return [];
      const infoData = await infoRes.json();
      const pages = Object.values(infoData?.query?.pages || {});

      const images = await Promise.all(pages.slice(0, max + 1).map(async (p) => {
        const info = p.imageinfo?.[0];
        const src = info?.thumburl || info?.url;
        if (!src || src === excludeSourceUrl) return null;
        try {
          const imgRes = await fetch(src);
          if (!imgRes.ok) return null;
          const blob = await imgRes.blob();
          if (!blob || blob.size === 0) return null;
          return { dataUrl: await blobToDataUrl(blob), width: info.thumbwidth || info.width, height: info.thumbheight || info.height };
        } catch {
          return null;
        }
      }));

      return images.filter(Boolean).slice(0, max);
    } catch (e) {
      console.warn("Section images skipped:", e);
      return [];
    }
  }

  /** Split a raw Wikipedia plaintext extract into {heading, paragraphs} sections. */
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

    const skip = /^(see also|references|external links|further reading|notes|bibliography|gallery)$/i;
    return sections
      .filter(s => !skip.test(s.heading))
      .map(s => ({ heading: s.heading, paragraphs: s.paras }));
  }

  /**
   * Shapes final section count/length from two independent choices:
   * - pageGoal controls how much material is included (short/medium/long)
   * - designation additionally simplifies language depth for "school"
   */
  function shapeContent(allSections, designation, pageGoal) {
    const limit = SECTION_COUNT_BY_GOAL[pageGoal] || SECTION_COUNT_BY_GOAL.medium;
    let picked = allSections.slice(0, Math.max(1, limit));

    if (designation === "school") {
      picked = picked.map(s => {
        const sentences = s.paragraphs.join(" ").match(/[^.!?]+[.!?]+/g) || s.paragraphs;
        return { heading: s.heading, paragraphs: [sentences.slice(0, 4).join(" ").trim()] };
      });
    }
    return picked;
  }

  /** Pull candidate definition-style sentences for question generation. */
  function extractDefinitionSentences(sections) {
    const all = [];
    sections.forEach(s => {
      const sentences = s.paragraphs.join(" ").match(/[^.!?]+[.!?]+/g) || [];
      sentences.forEach(sen => all.push(sen.trim()));
    });
    const patterns = [/ is an? /i, / are /i, / refers to /i, / was an? /i, / means /i, / describes /i];
    return all.filter(sen => sen.length > 40 && sen.length < 260 && patterns.some(p => p.test(sen)));
  }

  function buildQuestionFromSentence(sentence) {
    const m = sentence.match(/^(.{3,60}?)\s+(is|are|was|were|refers to|means|describes)\s+/i);
    if (m) {
      const subject = m[1].replace(/^(the|a|an)\s+/i, "").trim();
      return { q: `What ${m[2].toLowerCase() === "are" || m[2].toLowerCase() === "were" ? "are" : "is"} ${subject}?`, a: sentence };
    }
    return { q: `Explain the following in your own words:`, a: sentence };
  }

  function generateQuestions(topic, sections, count) {
    const candidates = extractDefinitionSentences(sections);
    const shuffled = candidates.slice(0, count * 2);
    const chosen = [];
    const seen = new Set();
    for (const sen of shuffled) {
      if (chosen.length >= count) break;
      const key = sen.slice(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(buildQuestionFromSentence(sen));
    }
    let i = 0;
    while (chosen.length < count && i < sections.length) {
      const s = sections[i++];
      if (s.heading !== "Overview") {
        const firstSentence = (s.paragraphs.join(" ").match(/[^.!?]+[.!?]+/) || [s.paragraphs[0]])[0].trim();
        chosen.push({ q: `Briefly explain "${s.heading}" in the context of ${topic}.`, a: firstSentence });
      }
    }
    return chosen.slice(0, count);
  }

  /**
   * Main entry point.
   * @returns {Promise<{title, sourceTitle, sections, questions, image}>}
   *   Each section may carry its own `.image` (from fetchSectionImages).
   */
  async function generate(topic, designation, pageGoal, includeQuestions, onStatus) {
    onStatus && onStatus("Searching reference material…");
    const { pageid, title } = await searchTitle(topic);

    onStatus && onStatus("Fetching content…");
    const [raw, leadImage] = await Promise.all([
      fetchExtract(pageid),
      (onStatus && onStatus("Looking for a relevant image…"), fetchLeadImage(pageid))
    ]);

    const allSections = splitSections(raw);
    if (!allSections.length) throw new Error("This topic didn't return usable content. Try a more specific term.");

    onStatus && onStatus("Structuring the document…");
    const sections = shapeContent(allSections, designation, pageGoal);

    // Spread a few extra images across the later sections (Overview already has the lead image).
    if (sections.length > 1) {
      onStatus && onStatus("Gathering illustrations…");
      const needed = Math.min(MAX_SECTION_IMAGES, sections.length - 1);
      const extraImages = needed > 0 ? await fetchSectionImages(pageid, null, needed) : [];
      extraImages.forEach((img, idx) => { sections[idx + 1].image = img; });
    }

    let questions = [];
    if (includeQuestions) {
      onStatus && onStatus("Preparing practice questions…");
      const qCount = designation === "school" ? 5 : designation === "college" ? 8 : 10;
      questions = generateQuestions(topic, allSections, qCount);
    }

    return { title: topic.trim(), sourceTitle: title, sections, questions, image: leadImage };
  }

  return { generate };
})();
