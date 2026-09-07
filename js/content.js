/**
 * EASYSEARCH — content engine
 *
 * Free-of-cost by design:
 *  - Source material comes from the Wikipedia Action API, which is free,
 *    keyless, and CORS-enabled (origin=*). This is the "gather information
 *    from the web" step. A general web-wide search engine API (Google/Bing)
 *    either costs money at any real volume or requires a paid-tier key, so
 *    Wikipedia is the sustainable free source here.
 *  - The representative image also comes from Wikipedia (via the same API's
 *    pageimages property, which points at a Wikimedia Commons file) — no
 *    image-generation cost, no paid stock-photo API.
 *  - Question generation is done with local heuristics/pattern-matching in
 *    JavaScript — no AI API call, so no per-request cost. Quality is more
 *    basic than an LLM would produce, but it's genuinely free forever.
 */
const Content = (() => {
  const API = "https://en.wikipedia.org/w/api.php";

  // How much material to include, chosen on the "page length" step.
  const SECTION_COUNT_BY_GOAL = { short: 2, medium: 5, long: 10 };

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
    return page.extract;
  }

  /** Fetches one representative image for the topic. Fails silently — images are a nice-to-have. */
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

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      return { dataUrl, width: thumb.width, height: thumb.height };
    } catch (e) {
      console.warn("Image fetch skipped:", e);
      return null;
    }
  }

  /** Split a raw Wikipedia plaintext extract into {heading, text} sections. */
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
      .map(s => ({ heading: s.heading, text: s.paras.join(" ") }));
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
        const sentences = s.text.match(/[^.!?]+[.!?]+/g) || [s.text];
        return { heading: s.heading, text: sentences.slice(0, 4).join(" ").trim() };
      });
    }
    return picked;
  }

  /** Pull candidate definition-style sentences for question generation. */
  function extractDefinitionSentences(sections) {
    const all = [];
    sections.forEach(s => {
      const sentences = s.text.match(/[^.!?]+[.!?]+/g) || [];
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
        const firstSentence = (s.text.match(/[^.!?]+[.!?]+/) || [s.text])[0].trim();
        chosen.push({ q: `Briefly explain "${s.heading}" in the context of ${topic}.`, a: firstSentence });
      }
    }
    return chosen.slice(0, count);
  }

  /**
   * Main entry point.
   * @returns {Promise<{title, sourceTitle, sections, questions, image}>}
   */
  async function generate(topic, designation, pageGoal, includeQuestions, onStatus) {
    onStatus && onStatus("Searching reference material…");
    const { pageid, title } = await searchTitle(topic);

    onStatus && onStatus("Fetching content…");
    const [raw, image] = await Promise.all([
      fetchExtract(pageid),
      (onStatus && onStatus("Looking for a relevant image…"), fetchLeadImage(pageid))
    ]);

    const allSections = splitSections(raw);
    if (!allSections.length) throw new Error("This topic didn't return usable content. Try a more specific term.");

    onStatus && onStatus("Structuring the document…");
    const sections = shapeContent(allSections, designation, pageGoal);

    let questions = [];
    if (includeQuestions) {
      onStatus && onStatus("Preparing practice questions…");
      const qCount = designation === "school" ? 5 : designation === "college" ? 8 : 10;
      questions = generateQuestions(topic, allSections, qCount);
    }

    return { title: topic.trim(), sourceTitle: title, sections, questions, image };
  }

  return { generate };
})();
