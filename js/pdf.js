/**
 * EASYSEARCH — PDF builder
 *
 * Uses jsPDF (free, MIT-licensed, loaded from a CDN) entirely in the
 * browser — no server, no per-document cost.
 *
 * Quality upgrades, all still free:
 *  - Real serif headings using an embedded Spectral font (js/pdf-fonts.js,
 *    SIL Open Font License — shipped statically, no font-CDN fetch needed
 *    at generation time) instead of jsPDF's default Helvetica everywhere.
 *  - Paragraph breaks are preserved instead of flattened into one block.
 *  - A representative image per topic, plus a few extra images spread
 *    across sections, from Wikimedia Commons.
 *
 * Note on sourcing: content and images are drawn from Wikipedia, which is
 * published under CC BY-SA. We print a source/attribution line on the
 * document as required by that license — please keep this if you ship it.
 */
const PdfBuilder = (() => {
  const MARGIN = 48;
  const PAGE_W = 595.28; // A4 pt
  const PAGE_H = 841.89;
  const MAX_W = PAGE_W - MARGIN * 2;
  const LINE_H = 15;
  const ACCENT = [76, 201, 240];     // matches --accent
  const INK = [10, 20, 35];
  const MUTED = [110, 120, 140];

  let fontsRegistered = false;

  function newDoc() {
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    registerFonts(doc);
    return doc;
  }

  /** Embeds the Spectral font (base64, from js/pdf-fonts.js) for headings/titles. */
  function registerFonts(doc) {
    try {
      doc.addFileToVFS("Spectral-SemiBold.ttf", PDF_FONTS.spectralSemiBold);
      doc.addFont("Spectral-SemiBold.ttf", "Spectral", "normal");
      doc.addFileToVFS("Spectral-Bold.ttf", PDF_FONTS.spectralBold);
      doc.addFont("Spectral-Bold.ttf", "Spectral", "bold");
      fontsRegistered = true;
    } catch (e) {
      console.warn("Custom heading font unavailable, falling back to Helvetica:", e);
      fontsRegistered = false;
    }
  }

  function headingFont(doc, style = "normal") {
    doc.setFont(fontsRegistered ? "Spectral" : "helvetica", style);
  }

  function footer(doc, pageNum) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text("EASYSEARCH", MARGIN, PAGE_H - 24);
    doc.text(String(pageNum), PAGE_W - MARGIN, PAGE_H - 24, { align: "right" });
  }

  function build(data, meta) {
    const doc = newDoc();
    let y = MARGIN;
    let page = 1;

    // Thin brand band across the very top of the first page.
    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, PAGE_W, 5, "F");
    y += 8;

    function ensureSpace(h) {
      if (y + h > PAGE_H - MARGIN - 20) {
        footer(doc, page);
        doc.addPage();
        page++;
        y = MARGIN;
      }
    }

    function writeParagraph(text, size = 11, color = [40, 40, 40], gapAfter = 10) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, MAX_W);
      lines.forEach(line => {
        ensureSpace(LINE_H);
        doc.text(line, MARGIN, y);
        y += LINE_H;
      });
      y += gapAfter;
    }

    /** Renders each paragraph as its own wrapped block, with a gap between them. */
    function writeParagraphs(paragraphs, size = 11, color = [40, 40, 40]) {
      paragraphs.forEach((p, i) => {
        writeParagraph(p, size, color, i === paragraphs.length - 1 ? 4 : 10);
      });
    }

    function writeHeading(text, size = 15) {
      ensureSpace(size + 20);
      // Small accent bar to the left of the heading instead of a plain rule.
      doc.setFillColor(...ACCENT);
      doc.rect(MARGIN, y - size + 3, 4, size - 2, "F");
      headingFont(doc, "bold");
      doc.setFontSize(size);
      doc.setTextColor(...INK);
      doc.text(text, MARGIN + 12, y);
      y += size + 10;
    }

    function writeImage(image, maxH) {
      if (!image || !image.dataUrl) return;
      const naturalW = image.width || 640;
      const naturalH = image.height || 400;
      let w = MAX_W;
      let h = (naturalH / naturalW) * w;
      if (h > maxH) { h = maxH; w = (naturalW / naturalH) * h; }

      ensureSpace(h + 20);
      const format = image.dataUrl.includes("image/png") ? "PNG" : "JPEG";
      try {
        doc.addImage(image.dataUrl, format, MARGIN, y, w, h);
        y += h + 6;
        writeParagraph("Image via Wikimedia Commons — see the source article for its specific license.", 8, [150, 155, 168], 14);
      } catch (e) {
        console.warn("Could not embed image, continuing without it:", e);
      }
    }

    // ---- Title block ----
    headingFont(doc, "bold");
    doc.setFontSize(24);
    doc.setTextColor(...INK);
    const titleLines = doc.splitTextToSize(data.title, MAX_W);
    titleLines.forEach(l => { doc.text(l, MARGIN, y); y += 28; });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...MUTED);
    const designationLabel = { school: "School", college: "College", job: "Job / Professional" }[meta.designation] || meta.designation;
    doc.text(`Prepared for: ${designationLabel}   ·   ${meta.dateStr}`, MARGIN, y);
    y += 22;

    // ---- Lead image (optional — skipped silently if none was found) ----
    writeImage(data.image, 220);

    // ---- Sections ----
    data.sections.forEach(sec => {
      writeHeading(sec.heading);
      writeParagraphs(sec.paragraphs);
      if (sec.image) writeImage(sec.image, 170);
    });

    // ---- Questions ----
    if (data.questions && data.questions.length) {
      ensureSpace(40);
      writeHeading("Practice Questions", 16);
      data.questions.forEach((qa, i) => {
        writeParagraph(`${i + 1}. ${qa.q}`, 11.5, [25, 30, 45], 4);
        writeParagraph(`Answer: ${qa.a}`, 10.5, [95, 105, 125], 12);
      });
    }

    // ---- Attribution (Wikipedia content/images are CC BY-SA — attribution required) ----
    ensureSpace(60);
    doc.setDrawColor(210, 215, 225);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 16;
    writeParagraph(
      `Source material adapted from the Wikipedia article "${data.sourceTitle}", available under the Creative Commons Attribution-ShareAlike License. Content has been restructured and shortened for study purposes.`,
      8.5, [140, 145, 160], 6
    );
    writeParagraph(`Generated by EasySearch. Developed by ${CONFIG.DEVELOPER}.`, 8.5, [140, 145, 160], 0);

    footer(doc, page);
    return doc;
  }

  /** Builds and triggers a browser download. Returns the filename used. */
  function buildAndDownload(data, meta) {
    const doc = build(data, meta);
    const safeName = data.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    const filename = `${safeName}_${meta.designation}.pdf`;
    doc.save(filename);
    return filename;
  }

  // =====================================================================
  // BOOKS — two builders matching the two paths in js/books.js
  // =====================================================================

  /** Study guide for a still-copyrighted book: synopsis/themes from Wikipedia, never the book's own text. */
  function buildBookStudyGuide(data) {
    const doc = newDoc();
    let y = MARGIN;
    let page = 1;

    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, PAGE_W, 5, "F");
    y += 8;

    function ensureSpace(h) {
      if (y + h > PAGE_H - MARGIN - 20) {
        footer(doc, page);
        doc.addPage();
        page++;
        y = MARGIN;
      }
    }

    function writeParagraph(text, size = 11, color = [40, 40, 40], gapAfter = 10) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, MAX_W);
      lines.forEach(line => {
        ensureSpace(LINE_H);
        doc.text(line, MARGIN, y);
        y += LINE_H;
      });
      y += gapAfter;
    }

    function writeHeading(text, size = 15) {
      ensureSpace(size + 20);
      doc.setFillColor(...ACCENT);
      doc.rect(MARGIN, y - size + 3, 4, size - 2, "F");
      headingFont(doc, "bold");
      doc.setFontSize(size);
      doc.setTextColor(...INK);
      doc.text(text, MARGIN + 12, y);
      y += size + 10;
    }

    function writeImage(image, maxH) {
      if (!image || !image.dataUrl) return;
      const naturalW = image.width || 400;
      const naturalH = image.height || 600;
      let w = MAX_W;
      let h = (naturalH / naturalW) * w;
      if (h > maxH) { h = maxH; w = (naturalW / naturalH) * h; }
      ensureSpace(h + 12);
      const format = image.dataUrl.includes("image/png") ? "PNG" : "JPEG";
      try {
        doc.addImage(image.dataUrl, format, MARGIN, y, w, h);
        y += h + 12;
      } catch (e) {
        console.warn("Could not embed cover image:", e);
      }
    }

    // ---- Title block ----
    headingFont(doc, "bold");
    doc.setFontSize(24);
    doc.setTextColor(...INK);
    doc.splitTextToSize(data.title, MAX_W).forEach(l => { doc.text(l, MARGIN, y); y += 28; });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...MUTED);
    const bylineParts = [];
    if (data.author) bylineParts.push(`by ${data.author}`);
    if (data.publishYear) bylineParts.push(`first published ${data.publishYear}`);
    if (bylineParts.length) { doc.text(bylineParts.join("   ·   "), MARGIN, y); y += 18; }
    y += 6;

    writeImage(data.image, 240);

    // ---- Disclaimer — this is a guide, not the book ----
    doc.setFillColor(245, 247, 250);
    ensureSpace(46);
    doc.rect(MARGIN, y - 12, MAX_W, 40, "F");
    writeParagraph(
      `This is a study guide, not the full book — "${data.title}" is still under copyright, so its text can't be reproduced here. For the complete book, borrow or buy it through a library or bookseller.`,
      9, [70, 80, 100], 14
    );

    // ---- Sections (plot/background/reception, from Wikipedia) ----
    data.sections.forEach(sec => {
      writeHeading(sec.heading);
      sec.paragraphs.forEach((p, i) => writeParagraph(p, 11, [40, 40, 40], i === sec.paragraphs.length - 1 ? 4 : 10));
    });

    // ---- Discussion questions ----
    if (data.questions && data.questions.length) {
      ensureSpace(40);
      writeHeading("Discussion Questions", 16);
      data.questions.forEach((qa, i) => {
        writeParagraph(`${i + 1}. ${qa.q}`, 11.5, [25, 30, 45], 4);
        writeParagraph(`Talking point: ${qa.a}`, 10.5, [95, 105, 125], 12);
      });
    }

    // ---- Attribution ----
    ensureSpace(60);
    doc.setDrawColor(210, 215, 225);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 16;
    writeParagraph(
      `Synopsis and background adapted from the Wikipedia article "${data.sourceTitle}", available under the Creative Commons Attribution-ShareAlike License. No text from the book itself is included.`,
      8.5, [140, 145, 160], 6
    );
    writeParagraph(`Generated by EasySearch. Developed by ${CONFIG.DEVELOPER}.`, 8.5, [140, 145, 160], 0);

    footer(doc, page);
    return doc;
  }

  /**
   * Full public-domain text (Project Gutenberg). Paginates the raw file
   * verbatim — including Gutenberg's own header/footer license text, which
   * we keep intact rather than strip — so this stays straightforwardly
   * compliant with their license. Async so the UI can show progress and
   * stay responsive across what can be thousands of lines.
   */
  async function buildBookFullText(data, onProgress) {
    const doc = newDoc();
    let y = MARGIN;
    let page = 1;

    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, PAGE_W, 5, "F");
    y += 8;

    function ensureSpace(h) {
      if (y + h > PAGE_H - MARGIN - 20) {
        footer(doc, page);
        doc.addPage();
        page++;
        y = MARGIN;
      }
    }
    function writeParagraph(text, size = 11, color = [40, 40, 40], gapAfter = 10) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, MAX_W);
      lines.forEach(line => {
        ensureSpace(LINE_H);
        doc.text(line, MARGIN, y);
        y += LINE_H;
      });
      y += gapAfter;
    }
    function writeHeading(text, size = 15) {
      ensureSpace(size + 20);
      doc.setFillColor(...ACCENT);
      doc.rect(MARGIN, y - size + 3, 4, size - 2, "F");
      headingFont(doc, "bold");
      doc.setFontSize(size);
      doc.setTextColor(...INK);
      doc.text(text, MARGIN + 12, y);
      y += size + 10;
    }

    // ---- Cover ----
    headingFont(doc, "bold");
    doc.setFontSize(24);
    doc.setTextColor(...INK);
    doc.splitTextToSize(data.title, MAX_W).forEach(l => { doc.text(l, MARGIN, y); y += 28; });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...MUTED);
    doc.text(`by ${data.author}`, MARGIN, y);
    y += 26;
    writeParagraph(
      "Full public-domain text, sourced from Project Gutenberg (gutenberg.org). Gutenberg's own header and license text are kept intact below, unaltered.",
      9, [110, 120, 140], 10
    );
    doc.addPage();
    page++;
    y = MARGIN;

    // ---- Full text, paginated in chunks with periodic UI yields ----
    const paragraphs = data.rawText.split(/\n\s*\n/);
    const CHUNK = 250;
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i].trim();
      if (p) writeParagraph(p, 10.5, [35, 35, 35], 8);
      if (i % CHUNK === 0) {
        onProgress && onProgress(Math.round((i / paragraphs.length) * 100));
        await new Promise(r => setTimeout(r, 0)); // yield to the browser so it can repaint/respond
      }
    }
    onProgress && onProgress(100);

    // ---- Discussion questions (generic, book-club style) ----
    if (data.questions && data.questions.length) {
      ensureSpace(40);
      writeHeading("Discussion Questions", 16);
      data.questions.forEach((q, i) => writeParagraph(`${i + 1}. ${q}`, 11.5, [25, 30, 45], 10));
    }

    writeParagraph(`Reformatted into PDF by EasySearch. Developed by ${CONFIG.DEVELOPER}.`, 8.5, [140, 145, 160], 0);

    footer(doc, page);
    return doc;
  }

  /** Builds the right book PDF for the given payload's mode, downloads it, and returns the filename. */
  async function buildBookAndDownload(data, onProgress) {
    const doc = data.mode === "fulltext"
      ? await buildBookFullText(data, onProgress)
      : buildBookStudyGuide(data);
    const safeName = data.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    const suffix = data.mode === "fulltext" ? "full_text" : "study_guide";
    const filename = `${safeName}_${suffix}.pdf`;
    doc.save(filename);
    return filename;
  }

  return { build, buildAndDownload, buildBookAndDownload };
})();
