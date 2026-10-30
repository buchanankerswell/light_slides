const video = document.getElementById("video");
const scrub = document.getElementById("scrub");
const play = document.getElementById("play");
const playIcon = document.getElementById("playIcon");
const time = document.getElementById("time");
const caption = document.getElementById("caption");
const decksEl = document.getElementById("decks");
const search = document.getElementById("search");
const library = document.getElementById("library");
const libTabs = document.getElementById("libTabs");
const libBody = document.getElementById("libBody");
const libSearch = document.getElementById("libSearch");
const libSegMinerals = document.getElementById("libSegMinerals");
const libSegProps = document.getElementById("libSegProps");
const help = document.getElementById("help");

const YT_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M23 7.2s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.4-1C16.6 3.6 12 3.6 12 3.6s-4.6 0-7.7.3c-.5.1-1.5.1-2.4 1-.7.7-.9 2.3-.9 2.3S.8 9.1.8 11v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.2 7.6.3 7.6.3s4.6 0 7.7-.4c.5-.1 1.5-.1 2.4-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8zM9.8 15.1V8.4l6.2 3.4-6.2 3.3z"/></svg>';

let manifest,
  slidesById = {},
  cues = [],
  pages = [],
  currentId = null,
  scrubbing = false,
  rafId = null;

async function init() {
  initTheme();
  manifest = await (await fetch("data/slides.json")).json();
  manifest.slides.forEach((s) => {
    slidesById[s.id] = s;
  });
  renderDecks("");
  await load(manifest.slides[0].id);

  search.addEventListener("input", () => {
    renderDecks(search.value.trim().toLowerCase());
    if (!libOpen) return;
    // One filter in two boxes: mirror the topbar into the open library.
    libSearch.value = search.value;
    rescope();
  });
  libSearch.addEventListener("input", () => {
    if (!libOpen) return;
    // ...and mirror the library back out (clearing one clears both).
    search.value = libSearch.value;
    renderDecks(search.value.trim().toLowerCase());
    rescope();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") search.blur();
  });
  libSegMinerals.addEventListener("click", () => setCollection("minerals"));
  libSegProps.addEventListener("click", () => setCollection("properties"));
  // Clicking the dimmed backdrop dismisses the help dialog.
  help.addEventListener("pointerdown", (e) => {
    if (e.target === help) closeHelp();
  });
  // Clicking outside the popup dismisses it, leaving playback untouched.
  // pointerdown precedes click, so toggles still work: they fire while closed.
  document.addEventListener("pointerdown", (e) => {
    if (libOpen && !library.contains(e.target)) closeLibrary();
  });
  scrub.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  scrub.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  scrub.addEventListener("input", () => {
    if (!video.duration) return;
    video.currentTime = (scrub.value / 1000) * video.duration;
    syncVideo();
  });
  // rAF drives slider + captions while visible; timeupdate covers hidden tabs.
  video.addEventListener("timeupdate", () => {
    if (rafId === null) syncVideo();
  });
  video.addEventListener("seeked", syncVideo);
  video.addEventListener("loadedmetadata", () => {
    renderTime();
  });
  video.addEventListener("click", () => {
    video.paused ? video.play() : video.pause();
  });
  play.addEventListener("click", () => {
    video.paused ? video.play() : video.pause();
  });
  video.addEventListener("play", () => {
    playIcon.textContent = "⏸";
    kick();
  });
  video.addEventListener("error", showVideoFallback);
  video.addEventListener("emptied", () => {
    document.getElementById("video-fallback").hidden = true;
  });
  video.addEventListener("pause", () => {
    playIcon.textContent = "▶";
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      // Toggles the library; the current mineral is pre-selected on open.
      if (libOpen) closeLibrary();
      else openLibrary();
      return;
    }
    if (e.key === "Escape" && helpOpen) {
      closeHelp();
      return;
    }
    if (e.key === "Escape" && libOpen) {
      // Manual dismiss leaves playback untouched; only Space changes it.
      closeLibrary();
      return;
    }
    // Left/right switch the open popup between the mineral and property collections.
    if (libOpen && (e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target !== libSearch) {
      e.preventDefault();
      libCollection = libCollection === "minerals" ? "properties" : "minerals";
      const keep = libSelected;
      libScope = computeScope();
      if (!libScope.some((s) => s.id === keep)) libSelected = libScope[0]?.id ?? null;
      renderLibrary();
      libTabs.querySelector('[aria-selected="true"]')?.focus();
      return;
    }
    // Arrows browse the open library; not while editing its search box.
    if (libOpen && (e.key === "ArrowDown" || e.key === "ArrowUp") && e.target !== libSearch) {
      e.preventDefault();
      const i = libScope.findIndex((s) => s.id === libSelected);
      const j = (i + (e.key === "ArrowDown" ? 1 : -1) + libScope.length) % libScope.length;
      if (libScope[j]) {
        libSelected = libScope[j].id;
        renderLibrary();
        libTabs.querySelector('[aria-selected="true"]').focus();
      }
      return;
    }
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
    if (e.key === "/") {
      e.preventDefault();
      // The topbar search is covered by the popup; type into its own box.
      (libOpen ? libSearch : search).focus();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (e.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 2);
    else if (e.key === "ArrowRight") video.currentTime = Math.min(video.duration || 0, video.currentTime + 2);
    else if (e.key === "Enter" && libOpen && tag !== "BUTTON" && tag !== "A" && tag !== "TEXTAREA") {
      // Select the highlighted entry (buttons and links activate natively).
      e.preventDefault();
      libTabs.querySelector('[aria-selected="true"]')?.click();
    } else if (e.key === " ") {
      // Space is play/pause everywhere, popup open or not. Text fields
      // return above, so typing spaces is unaffected; Enter still
      // activates the focused tab or button natively.
      if (tag === "A" || tag === "SUMMARY") return;
      e.preventDefault();
      video.paused ? video.play() : video.pause();
    } else if (libOpen && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Start typing anywhere to filter the library.
      libSearch.focus();
    }
  });
}

function subseq(query, text) {
  query = query.toLowerCase();
  text = text.toLowerCase();
  let i = 0;
  for (const ch of text) {
    if (ch === query[i]) i++;
    if (i === query.length) return true;
  }
  return false;
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

function suggestMineral(query) {
  let best = null;
  manifest.slides.forEach((s) => {
    const d = editDistance(query.toLowerCase(), s.mineral.toLowerCase());
    if (best === null || d < best.d) best = { d, name: s.mineral };
  });
  return best && best.d <= Math.max(2, Math.floor(query.length / 2)) ? best.name : null;
}

function scoreSlide(words, excluded, slide) {
  const groupLabel = manifest.groups.find((g) => g.id === slide.group)?.label ?? "";
  const text = [slide.mineral, slide.symbol ?? "", ...(slide.aliases ?? []), ...(slide.features ?? []), groupLabel].join(" ").toLowerCase();
  if (excluded.some((t) => text.includes(t))) return -1;
  if (!words.length) return 0;
  // A token naming a symbol matches that slide explicitly, like rxnDB identifiers.
  if (slide.symbol && words.some((w) => w === slide.symbol.toLowerCase())) return 3;
  let hits = 0;
  let fuzzy = 0;
  for (const w of words) {
    if (text.includes(w)) hits++;
    else if (subseq(w, slide.mineral) || (slide.symbol && subseq(w, slide.symbol))) fuzzy++;
  }
  if (hits + fuzzy < Math.min(2, words.length)) return -1;
  return hits + 0.5 * fuzzy;
}

function renderDecks(filter) {
  decksEl.innerHTML = "";
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const excluded = tokens.filter((t) => t.startsWith("-") && t.length > 1).map((t) => t.slice(1));
  const words = tokens.filter((t) => !(t.startsWith("-") && t.length > 1) && t !== "-");
  let shown = 0;
  manifest.groups.forEach((g) => {
    const slides = g.slides
      .map((id) => slidesById[id])
      .map((s) => ({ s, score: scoreSlide(words, excluded, s) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score || a.s.mineral.localeCompare(b.s.mineral))
      .map(({ s }) => s);
    if (!slides.length) return;
    shown += slides.length;
    const deck = document.createElement("div");
    deck.className = "deck";
    const h = document.createElement("h2");
    h.textContent = g.label;
    deck.appendChild(h);
    const row = document.createElement("div");
    row.className = "row";
    slides.forEach((s) => {
      const card = document.createElement("div");
      card.className = "card";
      card.setAttribute("aria-current", s.id === currentId ? "true" : "false");
      const poster = document.createElement("button");
      poster.className = "card-poster";
      poster.setAttribute("aria-label", `Study ${s.mineral}`);
      poster.innerHTML = `<img loading="lazy" src="${s.poster}" alt="${s.mineral} thin section">`;
      poster.addEventListener("click", () => load(s.id));
      const foot = document.createElement("div");
      foot.className = "card-foot";
      const name = document.createElement("button");
      name.className = "card-name";
      name.textContent = s.mineral;
      name.setAttribute("aria-label", `Study ${s.mineral}`);
      name.addEventListener("click", () => load(s.id));
      const a = document.createElement("a");
      a.className = "card-yt";
      a.href = s.yt;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", `Watch ${s.mineral} on YouTube`);
      a.innerHTML = YT_SVG;
      foot.append(name, a);
      card.append(poster, foot);
      row.appendChild(card);
    });
    deck.appendChild(row);
    decksEl.appendChild(deck);
  });
  if (!shown) {
    const p = document.createElement("p");
    p.className = "empty";
    const hint = filter ? suggestMineral(filter) : null;
    p.textContent = hint ? `No minerals match that filter. Did you mean ${hint}?` : "No minerals match that filter.";
    decksEl.appendChild(p);
  }
}

let libOpen = false;
let libScope = [];
let libSelected = null;
let libCollection = "minerals"; // 'minerals' | 'properties' while open

// Property entries: concept slides with no mineral data of their own.
// (Carbonate has no IMA symbol but is a mineral entry: it carries a
// formula, so it belongs to the mineral popup, not here.)
function propertySlides() {
  return manifest.slides.filter((s) => !s.symbol && !s.formula && s.id !== "optical-petrography-video-how-to");
}

function parseFilter(filter) {
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const excluded = tokens.filter((t) => t.startsWith("-") && t.length > 1).map((t) => t.slice(1));
  const words = tokens.filter((t) => !(t.startsWith("-") && t.length > 1) && t !== "-");
  return { words, excluded };
}

// Deck-order slide list scored by the same filter as the cards.
function scopeSlides(filter, onlyMinerals) {
  const { words, excluded } = parseFilter(filter);
  return manifest.groups.flatMap((g) =>
    g.slides
      .map((id) => slidesById[id])
      .filter((s) => !onlyMinerals || s.symbol || s.formula)
      .map((s) => ({ s, score: scoreSlide(words, excluded, s) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score || a.s.mineral.localeCompare(b.s.mineral))
      .map(({ s }) => s),
  );
}

function scopeProperties(filter) {
  const { words, excluded } = parseFilter(filter);
  return propertySlides()
    .map((s) => ({ s, score: scoreSlide(words, excluded, s) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || a.s.mineral.localeCompare(b.s.mineral))
    .map(({ s }) => s);
}

function computeScope() {
  const q = libSearch.value.trim().toLowerCase();
  return libCollection === "minerals" ? scopeSlides(q, true) : scopeProperties(q);
}

function openLibrary() {
  if (!libOpen) {
    libSearch.value = search.value.trim();
    libCollection = "minerals";
  }
  libScope = computeScope();
  libSelected = libScope.some((s) => s.id === currentId) ? currentId : (libScope[0]?.id ?? null);
  // Opening never touches playback: only Space (and the explicit
  // play controls) change the play state.
  library.hidden = false;
  libOpen = true;
  updateSeg();
  renderLibrary();
  libTabs.querySelector('[aria-selected="true"]')?.focus();
}

// Closing never touches playback either — only Space (and the explicit
// play controls) change the play state, so every dismiss path is uniform.
function closeLibrary() {
  if (!libOpen) return;
  library.hidden = true;
  libOpen = false;
}

let helpOpen = false;

function toggleHelp() {
  // Opening pauses (the dialog covers the viewer); closing never resumes —
  // only Space restarts playback.
  helpOpen ? closeHelp() : openHelp();
}

function openHelp() {
  video.pause();
  help.hidden = false;
  helpOpen = true;
  help.querySelector(".help-card").focus();
}

function closeHelp() {
  if (!helpOpen) return;
  help.hidden = true;
  helpOpen = false;
}

function rescope() {
  const keep = libSelected;
  libScope = computeScope();
  if (!libScope.some((s) => s.id === keep)) libSelected = libScope[0]?.id ?? null;
  renderLibrary();
}

function setCollection(which) {
  libCollection = which;
  rescope();
}

function updateSeg() {
  libSegMinerals.setAttribute("aria-pressed", libCollection === "minerals" ? "true" : "false");
  libSegProps.setAttribute("aria-pressed", libCollection === "properties" ? "true" : "false");
}

function renderLibrary() {
  updateSeg();
  libTabs.innerHTML = "";
  libScope.forEach((s) => {
    const tab = document.createElement("button");
    tab.className = "lib-tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", s.id === libSelected ? "true" : "false");
    tab.textContent = s.symbol && !s.mineral.includes("(") ? `${s.mineral} (${s.symbol})` : s.mineral;
    if (s.symbol && !s.formula) {
      tab.classList.add("lib-tab--missing");
      tab.title = "Not covered in Optical Mineralogy";
    }
    tab.addEventListener("click", () => {
      // Selecting a mineral also swaps it into the ocular view.
      // (Carbonate has no IMA symbol but is a mineral entry all the same;
      // only the properties collection, which has no viewer pages, skips
      // the swap.)
      libSelected = s.id;
      renderLibrary();
      if (libCollection === "minerals") load(s.id);
    });
    libTabs.appendChild(tab);
  });
  renderLibBody(slidesById[libSelected]);
}

function libRow(label, value) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return null;
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = Array.isArray(value) ? value.join(", ") : value;
  const wrap = document.createElement("div");
  wrap.append(dt, dd);
  return wrap;
}

// Subscripts for plain-text formulas: digits following a letter, closing
// paren, or middle dot render as subscripts (Na2Mg5..., (OH)2, ·H2O).
// Our formulas carry no charges or leading coefficients, so this is safe.
function chemHTML(formula) {
  const esc = formula.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/(^|[^0-9>])([0-9]+)/g, "$1<sub>$2</sub>");
}

// Concepts (symbol-less entries) double as indexes: list the minerals whose
// distinguishing features mention the concept, with the matching feature
// shown so the reader sees what the property looks like there.
function conceptMatches(s) {
  const mineralSlides = manifest.slides.filter((m) => m.symbol || m.formula);
  if (s.minerals?.length) {
    return s.minerals
      .map((name) => mineralSlides.find((m) => m.mineral === name))
      .filter(Boolean)
      .map((m) => ({
        m,
        hits: (m.features ?? []).filter((f) => !f.startsWith("no ") && f.includes("cleavage")).slice(0, 2),
      }));
  }
  const terms = s.aliases.filter((a) => !["extinction", "discrimination"].includes(a));
  return mineralSlides
    .map((m) => ({
      m,
      hits: (m.features ?? []).filter((f) => !f.startsWith("no ") && terms.some((t) => f.includes(t))),
    }))
    .filter(({ hits }) => hits.length);
}

function renderLibBody(s) {
  libBody.innerHTML = "";
  if (!s) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No minerals in scope. Clear the filter to browse the full library.";
    libBody.appendChild(p);
    return;
  }
  const h = document.createElement("h2");
  h.textContent = s.mineral;
  libBody.appendChild(h);
  if (s.symbol && !s.formula) {
    const flag = document.createElement("p");
    flag.className = "lib-flag";
    flag.textContent = "Not in the textbook";
    flag.title = "This tutorial has no matching entry in Optical Mineralogy (yet)";
    libBody.appendChild(flag);
  }
  if (s.formula) {
    const f = document.createElement("p");
    f.className = "lib-formula";
    f.innerHTML = chemHTML(s.formula);
    libBody.appendChild(f);
  }
  const dl = document.createElement("dl");
  dl.className = "lib-facts";
  const factRows = [
    libRow("IMA symbol", s.symbol),
    libRow(
      "Common abbreviations",
      (s.aliases ?? []).filter((a) => a !== s.mineral.toLowerCase()),
    ),
    libRow("Distinguishing features", s.distinguishing),
    libRow("Optical properties", s.features),
    libRow("Occurs in", s.occurrences),
    libRow("Associated with", s.associated),
    libRow("Economic", s.economic ? s.economic[0].toUpperCase() + s.economic.slice(1) : null),
    libRow("Uses & sources", s.economic === "no" ? null : s.uses),
  ].filter(Boolean);
  if (factRows.length) {
    const ph = document.createElement("h3");
    ph.textContent = "Properties";
    libBody.appendChild(ph);
    factRows.forEach((row) => dl.appendChild(row));
    libBody.appendChild(dl);
  }
  if (!s.symbol && !s.formula) {
    const matches = conceptMatches(s);
    const ch = document.createElement("h3");
    ch.textContent = "Minerals";
    libBody.appendChild(ch);
    if (matches.length) {
      const ul = document.createElement("ul");
      ul.className = "lib-minerals";
      matches.forEach(({ m, hits }) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.className = "lib-mineral-link";
        b.textContent = m.symbol ? `${m.mineral} (${m.symbol})` : m.mineral;
        b.setAttribute("aria-label", `Study ${m.mineral}`);
        b.addEventListener("click", () => load(m.id));
        li.appendChild(b);
        if (hits.length) {
          const note = document.createElement("span");
          note.className = "lib-mineral-note";
          note.textContent = ` — ${hits.join("; ")}`;
          li.appendChild(note);
        }
        ul.appendChild(li);
      });
      libBody.appendChild(ul);
    } else {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "A how-to for this viewer, not a mineral — no entries to list.";
      libBody.appendChild(p);
    }
  }
  const actions = document.createElement("div");
  actions.className = "lib-actions";
  // Resources live as pills; fall back to the tutorial link.
  const links = s.resources?.length ? s.resources : [{ label: "YouTube tutorial", url: s.yt }];
  links.forEach((r) => {
    const a = document.createElement("a");
    a.className = "pill";
    a.href = r.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = r.label.replace("Optical Mineralogy", "Textbook");
    actions.appendChild(a);
  });
  libBody.appendChild(actions);
}

async function load(id) {
  const s = slidesById[id];
  if (!s) return;
  currentId = id;
  document.getElementById("video-fallback").hidden = true;
  video.src = s.video;
  video.poster = s.poster;
  video.load();
  scrub.value = 0;
  caption.textContent = "Loading…";
  delete caption.dataset.key;
  try {
    cues = await (await fetch(s.cues)).json();
  } catch {
    cues = [];
    caption.textContent = "Transcript unavailable.";
  }
  pages = buildPages(cues);
  renderDecks(search.value.trim().toLowerCase());
  // Paint immediately: cues arrive after metadata, and a paused video
  // emits no timeupdate to trigger a render on its own.
  syncVideo();
}

function showVideoFallback() {
  const s = slidesById[currentId];
  const el = document.getElementById("video-fallback");
  el.innerHTML = "";
  const msg = document.createTextNode(s ? `Video unavailable for ${s.mineral}. ` : "Video unavailable. ");
  el.appendChild(msg);
  if (s) {
    const a = document.createElement("a");
    a.href = s.yt;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Watch on YouTube";
    el.appendChild(a);
  }
  el.hidden = false;
}

function renderTime() {
  const d = video.duration || 0,
    c = video.currentTime || 0;
  time.textContent = `${c.toFixed(1)} / ${d.toFixed(1)}s`;
}

function syncVideo() {
  if (!scrubbing && video.duration) scrub.value = Math.round((video.currentTime / video.duration) * 1000);
  renderTime();
  renderCaption();
}

function tick() {
  if (!video.paused && !video.ended) {
    syncVideo();
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = null;
  }
}

function kick() {
  if (rafId === null && !video.paused && !video.ended) rafId = requestAnimationFrame(tick);
}

function renderCaption() {
  const t = video.currentTime || 0;
  const idx = pages.findIndex((p) => t >= p.start && t < p.end);
  const page = idx >= 0 ? pages[idx] : null;
  const key = page ? `${page.start}-${page.end}` : "";
  if (caption.dataset.key !== key) {
    caption.dataset.key = key;
    caption.innerHTML = "";
    if (page) {
      page.words.forEach((w) => {
        const sp = document.createElement("span");
        sp.className = "w";
        sp.textContent = w.text;
        caption.append(sp);
      });
    } else {
      caption.textContent = "—";
    }
  }
  if (page) {
    page.words.forEach((w, i) => {
      caption.children[i].classList.toggle("said", w.start <= t);
    });
  }
}

function buildPages(cues) {
  // De-overlap rolling caption windows: each cue repeats the previous
  // window's tail, so keep only words not already in the stream. The
  // result is the true spoken sequence, cut into box-sized pages that
  // swap wholesale instead of scrolling a few words at a time.
  const norm = (s) => s.toLowerCase().replace(/[.,?!;:()"']+$/g, "");
  const stream = [];
  cues.forEach((c) => {
    const ws = (c.words || []).map((w) => ({ text: w.text, start: w.start, end: w.end }));
    if (!ws.length) {
      if (c.text) stream.push({ text: c.text, start: c.start, end: c.end });
      return;
    }
    let overlap = 0;
    const maxK = Math.min(ws.length, stream.length, 30);
    for (let k = maxK; k >= 1; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) {
        if (norm(stream[stream.length - k + i].text) !== norm(ws[i].text)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        overlap = k;
        break;
      }
    }
    ws.slice(overlap).forEach((w) => stream.push(w));
  });
  const pages = [];
  let cur = [];
  let chars = 0;
  const cut = () => {
    if (cur.length) pages.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
    chars = 0;
  };
  stream.forEach((w) => {
    if (cur.length) {
      const prev = cur[cur.length - 1];
      if (w.start - prev.end > 1.5 || chars + w.text.length + 1 > 60 || (w.start - cur[0].start > 6 && cur.length >= 4)) {
        cut();
      }
    }
    cur.push(w);
    chars += w.text.length + 1;
  });
  cut();
  return pages;
}

init();

function initTheme() {
  const toggle = document.createElement("button");
  toggle.className = "pill theme-toggle";
  toggle.setAttribute("aria-label", "Toggle light and dark mode");
  const meta = document.getElementById("themeColor");
  const paint = () => {
    const dark = document.documentElement.classList.contains("dark-mode");
    toggle.textContent = dark ? "☀ Light" : "☾ Dark";
    meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  };
  const apply = (dark) => {
    document.documentElement.classList.toggle("dark-mode", dark);
    paint();
  };
  toggle.addEventListener("click", () => {
    const dark = !document.documentElement.classList.contains("dark-mode");
    localStorage.setItem("theme", dark ? "dark" : "light");
    apply(dark);
  });
  // Default to the OS setting; an explicit toggle choice wins afterwards.
  const stored = localStorage.getItem("theme");
  apply(stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("theme")) apply(e.matches);
  });
  document.querySelector(".bar-side").appendChild(toggle);
}
