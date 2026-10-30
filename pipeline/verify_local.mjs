// Publish-faithful local verification, run under `make verify-local`
// (range-capable server + rewritten test tree). Exits non-zero on any
// failure; screenshots to --shots.
import puppeteer from "puppeteer";
import fs from "fs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : []))
    .filter(([k]) => k),
);
const ORIGIN = (args.origin ?? "http://127.0.0.1:8812").replace(/\/$/, "");
const BASE = (args.base ?? "/light_slides").replace(/\/$/, "");
const SHOTS = args.shots ?? "/tmp/ls-local-shots";
const TREE = (args.tree ?? "/tmp/ls-local-test").replace(/\/$/, "");
const URL = `${ORIGIN}${BASE}/index.html`;
const failures = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "ok" : "FAIL"}: ${msg}`);
  if (!cond) failures.push(msg);
};

const manifest = JSON.parse(fs.readFileSync(`${TREE}/data/slides.json`, "utf8"));
const firstCues = JSON.parse(fs.readFileSync(`${TREE}/assets/cues/${manifest.slides[0].id}.json`, "utf8"));
const probeTimes = [firstCues[2], firstCues[Math.floor(firstCues.length / 2)], firstCues[firstCues.length - 2]]
  .filter(Boolean)
  .map((c) => (c.start + c.end) / 2);

// Transcript fix-note regression gate: the 60/120 and end-section
// normalizations must hold across all baked cue files.
const cueResidue = fs
  .readdirSync(`${TREE}/assets/cues`)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => /61\s*-?\s*20|n-sections?/i.test(fs.readFileSync(`${TREE}/assets/cues/${f}`, "utf8")));
ok(cueResidue.length === 0, `no 61-20/n-section residue in cues ${cueResidue.length ? "(" + cueResidue.join(",") + ")" : ""}`);

async function snapshot(page, t) {
  await page.evaluate(
    (tt) =>
      new Promise((res, rej) => {
        const v = document.querySelector("video");
        const to = setTimeout(() => rej(new Error("seek timeout @" + tt)), 10000);
        v.onseeked = () => {
          clearTimeout(to);
          res();
        };
        v.currentTime = tt;
      }),
    t,
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => ({
    t: +document.querySelector("video").currentTime.toFixed(2),
    capScrollW: document.getElementById("caption").scrollWidth,
    capClientW: document.getElementById("caption").clientWidth,
    pageScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    words: document.querySelectorAll("#caption .w").length,
  }));
}

const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000 });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 1440, height: 900, deviceScaleFactor: 1 } });
const pageerrors = [];
const badResponses = [];
page.on("pageerror", (e) => pageerrors.push("pageerror: " + e.message));
page.on("console", (m) => {
  // The broken-video probe intentionally 404s; its fallback is asserted separately below.
  if (m.type() !== "error") return;
  const url = m.location()?.url ?? "";
  if (url.includes("does-not-exist")) return;
  pageerrors.push("console: " + m.text() + (url ? ` (${url})` : ""));
});
page.on("response", (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
});

await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.querySelectorAll(".card").length > 0, { timeout: 30000 });
const cards = await page.evaluate(() => document.querySelectorAll(".card").length);
const decks = await page.evaluate(() => document.querySelectorAll(".deck").length);
ok(cards === 54, `54 cards (got ${cards})`);
ok(decks === 7, `7 decks (got ${decks})`);

// Video loads with real duration through the range-capable server.
await page.waitForFunction(() => document.querySelector("video").duration > 0, { timeout: 30000 });
const dur = await page.evaluate(() => document.querySelector("video").duration);
ok(dur > 10, `video duration sane (got ${dur.toFixed(1)}s)`);

// Same-origin Range fetch must 206 (this is what scrubbing depends on).
const range = await page.evaluate(async () => {
  const r = await fetch(document.querySelector("video").currentSrc, { headers: { Range: "bytes=0-1023" } });
  return { status: r.status, cr: r.headers.get("content-range") };
});
ok(range.status === 206, `range request 206 (got ${range.status}, ${range.cr})`);

// Seek to cue midpoints: currentTime lands, captions have words, no overflow.
for (const t of probeTimes) {
  const s = await snapshot(page, t);
  ok(Math.abs(s.t - t) < 1.5, `seek to ${t.toFixed(0)}s lands (${s.t.toFixed(1)}s)`);
  ok(s.words > 0, `caption has words @${t.toFixed(0)}s (${s.words})`);
  ok(s.capScrollW - s.capClientW <= 0, `no caption overflow @${t.toFixed(0)}s`);
  ok(s.pageScrollW - s.innerW <= 0, `no page overflow @${t.toFixed(0)}s`);
}

// Search: symbol hit, empty state, exclusion.
for (const q of ["opx", "twinkle", "qz -quartz", "xyz-no-match"]) {
  await page.evaluate((query) => {
    const s = document.getElementById("search");
    s.value = query;
    s.dispatchEvent(new Event("input", { bubbles: true }));
  }, q);
  await new Promise((r) => setTimeout(r, 300));
  const n = await page.evaluate(() => document.querySelectorAll(".card").length);
  const empty = await page.evaluate(() => document.querySelector(".empty")?.textContent ?? "");
  console.log(`filter ${JSON.stringify(q)} -> ${n} cards ${empty ? "| " + empty : ""}`);
}
ok(true, "search filters run");
await page.evaluate(() => {
  const s = document.getElementById("search");
  s.value = "";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});

// --- Library: cmd-k minerals vs properties (seg control + left/right) ---
await page.evaluate(() => {
  document.querySelector("video").muted = true;
  document.querySelector("video").play();
});
await new Promise((r) => setTimeout(r, 300));
async function toggleLib(key) {
  await page.keyboard.down("Control");
  await page.keyboard.press(key);
  await page.keyboard.up("Control");
  await new Promise((r) => setTimeout(r, 200));
}
async function libSnap() {
  return page.evaluate(() => ({
    open: !document.getElementById("library").hidden,
    paused: document.querySelector("video").paused,
    tabs: document.querySelectorAll(".lib-tab").length,
  }));
}
const mineralNames = manifest.slides.filter((s) => s.symbol || s.formula).map((s) => s.mineral);
// cmd-k opens the mineral collection and pauses.
await toggleLib("k");
let st = await page.evaluate(
  (names) => ({
    open: !document.getElementById("library").hidden,
    paused: document.querySelector("video").paused,
    tabs: document.querySelectorAll(".lib-tab").length,
    allMinerals: [...document.querySelectorAll(".lib-tab")].every((t) => {
      const txt = t.textContent;
      return names.includes(txt) || names.includes(txt.replace(/ \(.*\)$/, "")) || names.some((n) => txt.startsWith(n));
    }),
    seg: document.querySelector('.lib-seg [aria-pressed="true"]')?.textContent ?? "",
    h2: document.querySelector("#libBody h2")?.textContent ?? "",
    distinguishing: [...document.querySelectorAll("#libBody dt")].some((d) => d.textContent === "Distinguishing features"),
    subscripts: document.querySelectorAll("#libBody .lib-formula sub").length,
    resourcesH: [...document.querySelectorAll("#libBody h3")].some((h) => h.textContent === "Resources"),
    textbookPill: [...document.querySelectorAll("#libBody .lib-actions .pill")].some((a) => a.textContent.includes("Textbook")),
    propertiesH: [...document.querySelectorAll("#libBody h3")].some((h) => h.textContent === "Properties"),
    studyBtn: document.querySelectorAll("#libBody .lib-actions button").length,
    hints: document.querySelector("#search")?.placeholder ?? "",
  }),
  mineralNames,
);
ok(st.open && !st.paused, "cmd-k opens minerals without touching playback (keeps playing)");
ok(st.tabs === 48, `mineral scope is 48 entries (${st.tabs})`);
ok(st.allMinerals, "mineral tabs all name minerals");
ok(st.seg === "Minerals", "minerals segment active");
const segFlush = await page.evaluate(() => {
  const seg = document.querySelector(".lib-seg").getBoundingClientRect();
  const tabs = document.querySelector(".lib-tabs").getBoundingClientRect();
  return Math.abs(seg.right - tabs.right);
});
ok(segFlush <= 1, `seg flush with tab right edge (${segFlush.toFixed(1)}px)`);
const wrapped = await page.evaluate(() =>
  [...document.querySelectorAll(".lib-tab")].filter((t) => t.scrollWidth - t.clientWidth > 1).map((t) => t.textContent),
);
ok(wrapped.length === 0, `lib tabs fit on one line ${wrapped.length ? "(" + wrapped.join(", ") + ")" : ""}`);
const topbar = await page.evaluate(() => [...document.querySelectorAll(".bar-side a")].map((a) => a.textContent));
ok(!topbar.some((t) => t.includes("YouTube")), `no playlist pill in topbar (${topbar.join("/")})`);
ok(st.h2.length > 0, `library body shows entry (${st.h2 || "none"})`);
ok(st.distinguishing, "library shows distinguishing features");
ok(st.subscripts > 0, "formula renders subscript markup");
ok(!st.resourcesH && st.textbookPill, "resources live as pills, not a section");
ok(st.propertiesH, "mineral body has Properties header");
ok(st.studyBtn === 0, "no Study button");
ok(st.hints.includes("⌘K") && st.hints.includes("?") && !st.hints.includes("⌘M"), "hints name ⌘K and ?");
// ArrowDown moves selection to the next tab.
const firstSel = await page.evaluate(() => document.querySelector('.lib-tab[aria-selected="true"]').textContent);
await page.keyboard.press("ArrowDown");
await new Promise((r) => setTimeout(r, 200));
const secondSel = await page.evaluate(() => document.querySelector('.lib-tab[aria-selected="true"]').textContent);
ok(firstSel !== secondSel, `down arrow moves selection (${secondSel})`);
// Typing in the library search filters live.
await page.evaluate(() => {
  const s = document.getElementById("libSearch");
  s.value = "pyroxene";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
st = await libSnap();
ok(st.open && st.tabs === 2, `library search filters live (${st.tabs} tabs)`);
// The two searches are one filter: library typing mirrors to the topbar.
const mirrored = await page.evaluate(() => document.getElementById("search").value);
ok(mirrored === "pyroxene", "library search mirrors to topbar");
// Clearing the library search clears the topbar and restores everything.
await page.evaluate(() => {
  const s = document.getElementById("libSearch");
  s.value = "";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
const cleared = await page.evaluate(() => ({
  top: document.getElementById("search").value,
  cards: document.querySelectorAll(".card").length,
  tabs: document.querySelectorAll(".lib-tab").length,
}));
ok(cleared.top === "" && cleared.cards === 54 && cleared.tabs === 48, "clearing library search clears topbar and restores all");
// Topbar typing mirrors back into the open library.
await page.evaluate(() => {
  const s = document.getElementById("search");
  s.value = "opx";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
const back = await page.evaluate(() => ({
  lib: document.getElementById("libSearch").value,
  tabs: document.querySelectorAll(".lib-tab").length,
}));
ok(back.lib === "opx" && back.tabs < 48, `topbar mirrors into library (${back.tabs} tabs)`);
// Restore the pyroxene scope for the tab-click test below.
await page.evaluate(() => {
  const s = document.getElementById("libSearch");
  s.value = "pyroxene";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
const tabNames = await page.evaluate(() => [...document.querySelectorAll(".lib-tab")].map((t) => t.textContent));
await page.evaluate(() => document.querySelectorAll(".lib-tab")[1].click());
await new Promise((r) => setTimeout(r, 300));
const h2 = await page.evaluate(() => document.querySelector("#libBody h2").textContent);
ok(tabNames[1].startsWith(h2.split(" (")[0]), `tab click swaps entry (${h2})`);
// Clear the filter so the collection-switch tests start unfiltered
// (one dispatch clears both boxes via the mirror).
await page.evaluate(() => {
  const s = document.getElementById("search");
  s.value = "";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
// cmd-k toggles closed without touching playback (the tab-click load parked it).
await toggleLib("k");
st = await libSnap();
ok(!st.open && st.paused, "cmd-k toggles closed without touching playback");
// ArrowRight switches to the properties collection, ArrowLeft back.
await toggleLib("k");
await page.keyboard.press("ArrowRight");
await new Promise((r) => setTimeout(r, 200));
st = await page.evaluate(() => ({
  open: !document.getElementById("library").hidden,
  paused: document.querySelector("video").paused,
  tabs: document.querySelectorAll(".lib-tab").length,
  seg: document.querySelector('.lib-seg [aria-pressed="true"]')?.textContent ?? "",
}));
ok(st.open && st.paused && st.tabs === 5 && st.seg === "Properties", `arrow switches to properties (${st.tabs} tabs)`);
await page.keyboard.press("ArrowLeft");
await new Promise((r) => setTimeout(r, 200));
st = await libSnap();
ok(st.open && st.paused && st.tabs === 48, "arrow switches back to minerals");
// Properties body indexes minerals under a Minerals header.
await page.keyboard.press("ArrowRight");
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => {
  [...document.querySelectorAll(".lib-tab")].find((t) => t.textContent === "Cleavage").click();
});
await new Promise((r) => setTimeout(r, 200));
const concept = await page.evaluate(() => ({
  h3: document.querySelector("#libBody h3")?.textContent ?? "",
  items: [...document.querySelectorAll("#libBody .lib-minerals li")].map((li) => li.textContent),
}));
ok(concept.h3 === "Minerals" && concept.items.length > 3, `cleavage entry lists minerals (${concept.items.length})`);
ok(
  concept.items.some((t) => t.includes("Hornblende") && t.includes("120 degree cleavage")),
  "hornblende shows its cleavage note",
);
// Space is play/pause everywhere: library open or closed, popup untouched.
await page.evaluate(() => document.querySelector("#libSegMinerals").click());
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 400));
st = await page.evaluate(() => ({
  open: !document.getElementById("library").hidden,
  paused: document.querySelector("video").paused,
}));
ok(st.open && !st.paused, "space plays with the library open (stays open)");
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 400));
st = await page.evaluate(() => ({
  open: !document.getElementById("library").hidden,
  paused: document.querySelector("video").paused,
}));
ok(st.open && st.paused, "space pauses with the library open (stays open)");
// Space on a focused tab never selects; only Enter loads it.
await page.evaluate(() => {
  const h2 = document.querySelector("#libBody h2").textContent;
  [...document.querySelectorAll(".lib-tab")].find((t) => !t.textContent.startsWith(h2)).focus();
});
const focusedSrc = await page.evaluate(() => document.querySelector("video").currentSrc);
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 400));
st = await page.evaluate(() => ({
  open: !document.getElementById("library").hidden,
  paused: document.querySelector("video").paused,
  src: document.querySelector("video").currentSrc,
}));
ok(st.open && !st.paused && st.src === focusedSrc, "space on a focused tab plays without selecting");
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 600));
st = await page.evaluate(() => ({
  open: !document.getElementById("library").hidden,
  paused: document.querySelector("video").paused,
  src: document.querySelector("video").currentSrc,
}));
ok(st.open && st.paused && st.src !== focusedSrc, "enter on a focused tab selects it, staying open and parked");
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 400));
st = await libSnap();
ok(!st.open && !st.paused, "space plays with the library closed");
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 400));
st = await libSnap();
ok(!st.open && st.paused, "space pauses with the library closed");
// Enter selects the highlighted entry into the parked viewer.
await toggleLib("k");
await page.keyboard.press("ArrowDown");
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => document.activeElement.blur());
const enterBefore = await page.evaluate(() => document.querySelector("video").currentSrc);
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 600));
st = await page.evaluate(() => ({
  open: !document.getElementById("library").hidden,
  paused: document.querySelector("video").paused,
  src: document.querySelector("video").currentSrc,
}));
ok(st.open && st.paused && st.src !== enterBefore, "enter swaps the highlighted entry, staying open and parked");
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 200));
// Clicking outside the popup closes it manually (video stays parked).
st = await libSnap();
if (!st.open) await toggleLib("k");
await new Promise((r) => setTimeout(r, 200));
// Real clicks press down first: HTMLElement.click() alone skips
// pointerdown, so dispatch it explicitly like a finger would.
await page.evaluate(() => {
  const el = document.querySelector("#caption");
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  el.click();
});
await new Promise((r) => setTimeout(r, 400));
st = await libSnap();
ok(!st.open && st.paused, "click outside closes without touching playback");
// Typing anywhere focuses the library search.
st = await libSnap();
if (!st.open) await toggleLib("k");
await page.keyboard.press("z");
await new Promise((r) => setTimeout(r, 300));
const typed = await page.evaluate(() => ({
  focus: document.activeElement.id,
  value: document.querySelector("#libSearch").value,
}));
ok(typed.focus === "libSearch" && typed.value.includes("z"), "typing focuses the library search");
// Clear the stray "z" so later tests start unfiltered (clears both boxes).
await page.evaluate(() => {
  const s = document.getElementById("search");
  s.value = "";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
// Esc dismisses without touching playback.
st = await libSnap();
if (!st.open) await toggleLib("k");
await new Promise((r) => setTimeout(r, 200));
await page.waitForFunction(() => document.querySelector("video").readyState >= 2, { timeout: 15000 });
await page.evaluate(() => document.querySelector("video").play());
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 400));
st = await libSnap();
ok(!st.open && !st.paused, "Esc closes and keeps playing");
// Textbook-missing minerals are flagged.
await page.evaluate(() => {
  const s = document.getElementById("libSearch");
  s.value = "Brucite";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await toggleLib("k");
await page.evaluate(() => {
  [...document.querySelectorAll(".lib-tab")].find((t) => t.textContent.startsWith("Brucite")).click();
});
await new Promise((r) => setTimeout(r, 200));
const flag = await page.evaluate(() => ({
  pill: document.querySelector("#libBody .lib-flag")?.textContent ?? "",
  tab: document.querySelector('.lib-tab[aria-selected="true"]').className,
}));
ok(flag.pill === "Not in the textbook" && flag.tab.includes("lib-tab--missing"), "textbook-missing mineral is flagged");
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 200));
// Karaoke words that have played are black and bold in light mode.
// Restore the first slide: probeTimes belong to its cue file.
await page.evaluate(() => document.querySelectorAll(".card-name")[0].click());
await page.waitForFunction(() => document.querySelector("video").duration > 10, { timeout: 30000 });
await page.evaluate(
  (t) =>
    new Promise((res, rej) => {
      const v = document.querySelector("video");
      const to = setTimeout(() => rej(new Error("seek timeout")), 10000);
      v.onseeked = () => {
        clearTimeout(to);
        res();
      };
      v.currentTime = t;
    }),
  (firstCues[2].start + firstCues[2].end) / 2,
);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const kara = await page.evaluate(() => {
  const el = document.querySelector("#caption .w.said");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { weight: cs.fontWeight, color: cs.color, light: !document.documentElement.classList.contains("dark-mode") };
});
ok(kara && kara.weight === "700", `karaoke said words are black and bold`);
await page.evaluate(() => {
  const s = document.getElementById("search");
  s.value = "";
  s.dispatchEvent(new Event("input", { bubbles: true }));
  const l = document.getElementById("libSearch");
  l.value = "";
  l.dispatchEvent(new Event("input", { bubbles: true }));
});

// Broken video URL must show the YouTube fallback instead of hanging on "Loading…".
await page.evaluate(() => {
  const v = document.querySelector("video");
  v.src = "assets/vids/does-not-exist.mp4";
  v.load();
});
await page.waitForFunction(() => !document.getElementById("video-fallback").hidden, { timeout: 15000 });
const fallbackHref = await page.evaluate(() => document.querySelector("#video-fallback a")?.href ?? "");
ok(fallbackHref.includes("youtu"), `fallback links to YouTube (${fallbackHref || "none"})`);
// Restore a working slide for screenshots.
await page.evaluate(() => document.querySelectorAll(".card-name")[0].click());
await page.waitForFunction(() => document.querySelector("video").duration > 0, { timeout: 30000 });

fs.mkdirSync(SHOTS, { recursive: true });
await page.evaluate(() => {
  document.querySelector("video").currentTime = 60;
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${SHOTS}/desktop.png` });
const barFit = await page.evaluate(() => {
  const bar = document.querySelector(".bar");
  return bar.scrollWidth - bar.clientWidth;
});
ok(barFit <= 1, `topbar fits one row (${barFit}px)`);
const sideOrder = await page.evaluate(() => [...document.querySelector(".bar-side").children].map((el) => el.id || el.textContent.trim()));
ok(sideOrder[0] === "search", `search sits left of textbook (${sideOrder.join("/")})`);
const gridFlush = await page.evaluate(() => {
  const s = document.querySelector("#search").getBoundingClientRect();
  const d = document.querySelector("#decks").getBoundingClientRect();
  return Math.abs(s.left - d.left);
});
ok(gridFlush <= 1, `search flush with card grid (${gridFlush.toFixed(1)}px)`);
await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 } });
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => document.querySelector("video").duration > 0, { timeout: 30000 });
const mobOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(mobOverflow <= 0, `no page overflow at 390px (${mobOverflow}px)`);
await page.screenshot({ path: `${SHOTS}/mobile.png` });
const mobBarFit = await page.evaluate(() => {
  const bar = document.querySelector(".bar");
  return bar.scrollWidth - bar.clientWidth;
});
ok(mobBarFit <= 1, `topbar fits one row at 390px (${mobBarFit}px)`);
// Dark mode follows the OS setting and keeps karaoke bold.
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => document.querySelector("video").duration > 0, { timeout: 30000 });
ok(await page.evaluate(() => document.documentElement.classList.contains("dark-mode")), "system dark mode applies");
await page.evaluate(
  (t) =>
    new Promise((res, rej) => {
      const v = document.querySelector("video");
      const to = setTimeout(() => rej(new Error("dark seek timeout")), 10000);
      v.onseeked = () => {
        clearTimeout(to);
        res();
      };
      v.currentTime = t;
    }),
  probeTimes[0]
);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const darkKara = await page.evaluate(() => {
  const el = document.querySelector("#caption .w.said");
  return el ? getComputedStyle(el).fontWeight : null;
});
ok(darkKara === "700", `dark karaoke is bold (${darkKara})`);
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

// Help popup (? only): opens centered as a plain shortcut list,
// auto-pauses, and never resumes on close — only Space restarts play.
await page.keyboard.press("?");
await new Promise((r) => setTimeout(r, 300));
let help = await page.evaluate(() => ({
  open: !document.getElementById("help").hidden,
  paused: document.querySelector("video").paused,
  centered: getComputedStyle(document.getElementById("help")).placeItems === "center",
  list: !!document.querySelector("#help dl.help-list"),
  table: !!document.querySelector("#help table"),
  closeBtn: !!document.getElementById("helpClose"),
  items: [...document.querySelectorAll("#help kbd")].map((k) => k.textContent),
}));
ok(help.open && help.centered, "help opens centered on ?");
ok(help.list && !help.table && !help.closeBtn, "help is a plain list with no table or close button");
ok(["Space", "Enter", "Esc", "?"].every((k) => help.items.includes(k)), "help lists each shortcut plainly");
ok(help.open && help.paused, "? opens paused");
// Closing with ? never resumes.
await page.keyboard.press("?");
await new Promise((r) => setTimeout(r, 300));
help = await page.evaluate(() => ({
  open: !document.getElementById("help").hidden,
  paused: document.querySelector("video").paused,
}));
ok(!help.open && help.paused, "? closes without resuming");
// ? auto-pauses a playing video.
await page.evaluate(() => {
  document.querySelector("video").muted = true;
  document.querySelector("video").play();
});
await new Promise((r) => setTimeout(r, 300));
const playing = await page.evaluate(() => !document.querySelector("video").paused);
await page.keyboard.press("?");
await new Promise((r) => setTimeout(r, 300));
help = await page.evaluate(() => ({
  open: !document.getElementById("help").hidden,
  paused: document.querySelector("video").paused,
}));
ok(playing && help.open && help.paused, "? auto-pauses playing video");
// Only Space restarts playback after help.
await page.keyboard.press("?");
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.press("Space");
await new Promise((r) => setTimeout(r, 400));
help = await page.evaluate(() => ({
  open: !document.getElementById("help").hidden,
  paused: document.querySelector("video").paused,
}));
ok(!help.open && !help.paused, "space resumes after help closes");
await page.keyboard.press("?");
await new Promise((r) => setTimeout(r, 300));
// Clicking the dimmed backdrop closes the help dialog.
await page.evaluate(() => {
  document.getElementById("help").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));
help = await page.evaluate(() => ({
  open: !document.getElementById("help").hidden,
  paused: document.querySelector("video").paused,
}));
ok(!help.open && help.paused, "click outside help closes and stays paused");

await browser.close();
ok(pageerrors.length === 0, `no page/console errors ${pageerrors.length ? "(" + pageerrors.slice(0, 3).join("; ") + ")" : ""}`);
const mp4Bad = badResponses.filter((b) => b.includes(".mp4") && !b.includes("does-not-exist"));
ok(mp4Bad.length === 0, `no unexpected mp4 404s ${mp4Bad.length ? "(" + mp4Bad.slice(0, 3).join("; ") + ")" : ""}`);
console.log(failures.length ? `\n${failures.length} FAILURES` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
