const video = document.getElementById("video");
const scrub = document.getElementById("scrub");
const play = document.getElementById("play");
const playIcon = document.getElementById("playIcon");
const time = document.getElementById("time");
const caption = document.getElementById("caption");
const transcriptEl = document.getElementById("transcript");
const decksEl = document.getElementById("decks");
const search = document.getElementById("search");

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

  search.addEventListener("input", () => renderDecks(search.value.trim().toLowerCase()));
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") search.blur();
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
  video.addEventListener("pause", () => {
    playIcon.textContent = "▶";
  });
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
    if (e.key === "/") {
      e.preventDefault();
      search.focus();
      return;
    }
    if (e.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 2);
    else if (e.key === "ArrowRight") video.currentTime = Math.min(video.duration || 0, video.currentTime + 2);
    else if (e.key === " ") {
      if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return;
      e.preventDefault();
      video.paused ? video.play() : video.pause();
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

async function load(id) {
  const s = slidesById[id];
  currentId = id;
  video.src = s.video;
  video.poster = s.poster;
  scrub.value = 0;
  caption.textContent = "Loading…";
  delete caption.dataset.key;
  cues = await (await fetch(s.cues)).json();
  pages = buildPages(cues);
  transcriptEl.innerHTML = "";
  cues.forEach((c, i) => {
    const li = document.createElement("li");
    li.textContent = c.text;
    li.dataset.i = i;
    li.addEventListener("click", () => {
      video.currentTime = c.start + 0.01;
      video.play();
    });
    transcriptEl.appendChild(li);
  });
  renderDecks(search.value.trim().toLowerCase());
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
    const cidx = cues.findIndex((c) => t >= c.start && t < c.end);
    [...transcriptEl.children].forEach((li) => {
      const active = +li.dataset.i === cidx;
      li.classList.toggle("active", active);
      if (active && document.getElementById("transcriptWrap").open) li.scrollIntoView({ block: "nearest" });
    });
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
  toggle.className = "theme-toggle";
  const meta = document.getElementById("themeColor");
  const paint = () => {
    const dark = document.documentElement.classList.contains("dark-mode");
    toggle.textContent = dark ? "☀️ Light Mode" : "🌙 Dark Mode";
    meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  };
  toggle.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", dark ? "dark" : "light");
    paint();
  });
  document.body.appendChild(toggle);
  if (localStorage.getItem("theme") === "dark") document.documentElement.classList.add("dark-mode");
  paint();
}
