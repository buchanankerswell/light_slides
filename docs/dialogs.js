/* Canonical dialog behavior: theme toggle + overlay dialogs.
   Vendored into each app and wired by element ID. Requires dialogs.css.
   Keyboard shortcuts (?/s/Esc) and input guards stay app-side; see STANDARDS.md. */

function initTheme(toggleParentSelector) {
  const toggle = document.createElement("button");
  toggle.className = "pill theme-toggle";
  toggle.setAttribute("aria-label", "Toggle light and dark mode");
  const meta = document.querySelector('meta[name="theme-color"]');
  const paint = () => {
    const dark = document.documentElement.classList.contains("dark-mode");
    toggle.textContent = dark ? "☀ Light" : "☾ Dark";
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
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
  document.querySelector(toggleParentSelector).appendChild(toggle);
}

// Wire one overlay dialog. The open button and the dialog share nothing but
// IDs; opening focuses the card, backdrop clicks dismiss.
function wireDialog(dialogId, buttonId) {
  const dialog = document.getElementById(dialogId);
  const card = dialog.querySelector(".help-card");
  let open = false;
  const api = {
    get isOpen() {
      return open;
    },
    open() {
      dialog.hidden = false;
      open = true;
      card.focus();
    },
    close() {
      if (!open) return;
      dialog.hidden = true;
      open = false;
    },
    toggle() {
      open ? api.close() : api.open();
    },
  };
  document.getElementById(buttonId).addEventListener("click", api.toggle);
  dialog.addEventListener("pointerdown", (e) => {
    if (e.target === dialog) api.close();
  });
  return api;
}
