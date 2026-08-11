// Content-script entry: mounting, lazy data loading, query routing
// Mounts the enhanced search UI on the dictionary search form.
import { CONFIG, extensionResourceUrl } from "./config.js";
import { createEngine } from "../search/engine.js";
import { createUI } from "./ui.js";
import { watchSettings } from "./settings.js";
import { createRecency } from "./recency.js";

function getLocale() {
  const seg = window.location.pathname.split("/")[1];
  return CONFIG.LOCALES.includes(seg) ? seg : CONFIG.DEFAULT_LOCALE;
}

function init() {
  const input = document.getElementById(CONFIG.INPUT_ID);
  const form = document.forms[CONFIG.FORM_NAME];
  if (!input || !form) return; // not a search page — stay fully idle

  const dataUrl = extensionResourceUrl(globalThis.chrome?.runtime, CONFIG.DATA_URL);
  if (!dataUrl) {
    console.warn("[kautian-extension] extension context unavailable; reload the page");
    return;
  }

  const locale = getLocale();
  const luiEnabled = () => form.elements.lui?.value === CONFIG.LUI_ENABLED;

  let engine = null;
  let loading = false;
  let pending = ""; // query to re-run once loading finishes
  let pendingRandom = false; // random-entry click arrived before data loaded
  let timer = 0;

  // re-render open results when the user changes display settings
  const getSettings = watchSettings(globalThis.chrome?.storage?.sync, () => {
    if (engine && ui.visible()) run(input.value);
  });
  const recency = createRecency(globalThis.chrome?.storage?.local);

  const ui = createUI({
    input,
    getSettings,
    buildHref: (res) => CONFIG.entryHref(locale, res.id),
    onSelect: (res) => {
      if (getSettings().rememberRecent) recency.record(res.id);
    },
    onFill: (res) => {
      input.value = res.tl;
      // hand control back to the host page (synthetic input event)
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    },
  });

  function ensureData() {
    if (engine || loading) return;
    loading = true;
    fetch(dataUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        engine = createEngine(data);
        loading = false;
        if (pendingRandom) {
          pendingRandom = false;
          goRandom(); // opens a new tab — this page keeps working
        }
        if (pending) run(pending);
      })
      .catch((err) => {
        loading = false;
        pendingRandom = false;
        if (randomBtn) randomBtn.disabled = false;
        console.warn("[kautian-extension] failed to load lexicon:", err.message);
        ui.hide();
      });
  }

  function goRandom() {
    if (!engine) {
      pendingRandom = true;
      if (randomBtn) randomBtn.disabled = true; // block double-clicks while loading
      ensureData();
      return;
    }
    window.open(CONFIG.entryHref(locale, engine.randomMainId()), "_blank", "noopener");
    if (randomBtn) randomBtn.disabled = false; // page stays — make it clickable again
  }

  // 🎲 beside the「搜尋」label: open a random main entry
  const label = document.getElementById(CONFIG.LABEL_ID);
  const randomBtn = label ? document.createElement("button") : null;
  if (randomBtn) {
    randomBtn.type = "button";
    randomBtn.className = "stnp-random";
    randomBtn.textContent = "🎲";
    randomBtn.title = "Open a random word";
    randomBtn.setAttribute("aria-label", "Open a random word");
    randomBtn.addEventListener("click", goRandom);
    label.insertAdjacentElement("afterend", randomBtn);
  }

  function run(value) {
    const q = value.trim();
    if (!q || !luiEnabled()) {
      ui.hide();
      return;
    }
    if (!engine) {
      pending = q;
      ui.render({ type: "loading" });
      ensureData();
      return;
    }
    pending = "";
    const out = engine.query(q, {
      limit: CONFIG.LIMIT,
      recencyRank: getSettings().rememberRecent ? recency.rankOf : undefined,
    });
    ui.render({ type: "results", ...out });
  }

  input.addEventListener("focus", ensureData);
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), CONFIG.DEBOUNCE_MS);
  });
  for (const radio of form.elements.lui || []) {
    radio.addEventListener("change", () => {
      if (!luiEnabled()) ui.hide();
      else run(input.value);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
