# Sutian+ Enhanced Search Browser Extension — Implementation Plan (Part 1)

> Document purpose: this is the complete pre-implementation design plan, for cross-review by humans and codex.
> **No code is written in this phase.** Part 2 (romanization hover popup showing Pe̍h-ōe-jī / Taiwanese Phonetic Symbols) is out of scope for this document; only an interface note is left in §13.
>
> Status markers: each stage carries "Goal / Success criteria / Tests / Status", updated section by section during implementation.

---

## 1. Goals and Requirements

On the search box of the MoE "Dictionary of Frequently-Used Taiwan Taiwanese" (https://sutian.moe.edu.tw/), overlay an enhanced search via browser extension (following the "enhance, don't replace" pattern of vendor/ebird-extension):

| # | Requirement | Summary |
|---|------|------|
| R1 | Fuzzy search | Typo tolerance (edit distance), tone-insensitive matching |
| R2 | Regex search | Users can filter entries with regular expressions |
| R3 | Case-insensitive romanization | Fully case-insensitive |
| R4 | Multiple input systems | Pe̍h-ōe-jī (POJ), MoE Tâi-lô (TL), Hanzi, Taiwanese Phonetic Symbols (TPS), Zhuyin approximate-sound matching |
| R5 | Plan document first | This document |

Non-goals (explicitly excluded from v1):
- Do not rewrite or intercept the site's native search submission behavior; only add a suggestion dropdown.
- No Taiwanese tone sandhi inference (taigi-converter cannot do this either, see §2.4).
- When `lui != tai_su` (Taiwanese sentence / Mandarin word / Mandarin sentence), the enhancement is **disabled** — the dataset consists of Taiwanese headwords; other modes cannot produce correct suggestions.
- No speech, no full-text search over example sentences.

---

## 2. Current-State Investigation Results (completed)

### 2.1 Target site sutian.moe.edu.tw

- Server-rendered (Django-style URLs), Bootstrap 5.1; every navigation is a full page load (no SPA routing issues).
- Search form: `<form name="tshiautuann" action="/zh-hant/tshiau/" method="get">`
  - Keyword field: `<input type="search" name="tsha" id="id_tsha" maxlength="50" required>`
  - Category radio: `name="lui"`, values `tai_su` (Taiwanese word, default) / `tai_ku` / `hua_su` / `hua_ku`
- Search results URL: `/{locale}/tshiau/?lui=tai_su&tsha=<keyword>`
- Entry pages: `/{locale}/su/<id>/`. **kautian.csv does not contain this id**, so clicking a suggestion navigates to an "exact-search URL" rather than the entry page (see §7.4 and open question Q8).
- There are two locale paths: `/zh-hant/` (Han-Roman UI) and `/und-hani/` (all-Hanzi UI). The extension must derive the prefix from the current URL and support both.
- The site's front-end JS (`tshiau.js`) only handles voice-search recording; **there is no native autocomplete** — the dropdown container must be self-built (unlike ebird-extension, which borrows the host site's dropdown).

### 2.2 Data: kautian.csv

57,379 rows, 7.5MB, with very high field completeness; **the normalized fields needed for fuzzy / case-insensitive matching are almost all precomputed**:

| Field | Description | Coverage |
|------|--------|--------|
| `tl` / `poj` / `hanzi` | Tâi-lô (with tone marks) / Pe̍h-ōe-jī / Hanzi | 100% |
| `tl_num` / `poj_num` | Numeric tone-number form, no hyphens (`tong5ku1`) | 100% |
| `tps_num` / `tps_num_var` | Taiwanese Phonetic Symbols (with tones) / variant | 99.99% |
| `tl_notone` / `poj_notone` / `tps_notone(_var)` | Tone-less, hyphen-less forms | 100% |
| `tl_abbrev` / `poj_abbrev` / `tps_abbrev(_var)` | Initial-letter abbreviations (`tk` = tông-ku) | Multisyllabic words only |
| `frequency` | Word frequency (usable directly as a ranking weight) | 98.6% > 0 |
| `kautian_main` | Whether it is a main entry in the MoE dictionary | 37,721 True |
| `is_variant` | Whether it is a variant reading / variant form | 3,341 True |
| `kautian_accent_mask` | Semantics to be confirmed (likely an accent/stress bitmask) | — |
| `kautian` / `kautian_name` | Whether included in the MoE dictionary / whether a personal or place name | — |

`kautian.ods` is the same-source raw data; the plan uses the CSV as the build input.

### 2.3 vendor/ebird-extension (architecture template)

MV3, zero dependencies, vanilla JS content script. **Patterns to reuse**:
- "Enhance, don't replace": add an `input` listener on the host site's input; never intercept or disable native behavior.
- Truncate result sets before touching the DOM; use `cloneNode(false)` to swap the container and clear old listeners in one shot; after selection, hand control back to the host site via a synthetic `input` event (used in this project for the "fill without submit" scenario).

**Problems to explicitly avoid** (confirmed as bugs/anti-patterns during review):
- Re-registering a `document keydown` listener on every keystroke without ever removing it (memory leak) → in this project keydown is bound once at init.
- No debounce, full O(n·m) `toLowerCase` scan on every keystroke → this project pre-normalizes at build time + uses indexes.
- `innerHTML` insertion of unescaped data (injection risk) → this project always uses `textContent` / `dataset`.
- Result rows built with `div` + `window.location.href` → this project uses `<a href>` (middle-click / new tab / accessibility for free).
- Whole dataset `JSON.stringify`'d into IndexedDB, with a separate IDB class in both SW and content script (one is dead code) → this project does not use IDB in v1 (§3).
- `web_accessible_resources` open to `<all_urls>` → this project restricts WAR via `matches` to the sutian origin.
- No relevance ranking → this project has explicit ranking tiers (§6.3).

### 2.4 vendor/taigi-converter (conversion engine)

- npm `@taigikeyboard/taigi-cli` v0.1.5, MIT, **pure ESM, zero dependencies, runs directly in the browser** (its `index.html` already loads `src/` with native browser ES modules).
- Public API: `convert(text, source, target)` (`tl|poj|zhuyin`), `toToneNumber`, `toToneNumberAscii`, `toToneMark`, `segmentWords`. Internal modules also include `parseSyllable`, `stripToneMark`, `normalizeToTl` (POJ spelling unification: ch→ts, o͘→oo, oa→ua, eng→ing…) — since it is vendored as a submodule, we can deep-import past the npm `exports` restrictions.
- **Pitfall: the static import chain of `index.js`/`converter.js` pulls in the 1.5MB word-segmentation dictionary trie (`dictionary.js`)**, which is only needed for zhuyin→TL segmentation. At runtime this project deep-imports only `src/phonetics.js` (depends only on tables.js), avoiding it entirely.
- Its `zhuyin.js` handles **Taiwanese Phonetic Symbols (TPS, U+31A0–31BF)**, not Mandarin Zhuyin — "Zhuyin approximate-sound matching" needs its own mapping layer (§5.4).
- Known limitations: no tone sandhi; invalid-syllable errors are swallowed by `catch {}` and returned unchanged (call `parseSyllable` yourself if validation is needed); tone 1 in TPS is represented by trailing whitespace (whitespace is semantic); round-trips like `or→ㄛ̮→er` are lossy.
- **Division of responsibilities**: all four representations are already in the CSV; at runtime taigi-converter only handles "user input normalization" (stripping tone marks, POJ→TL spelling unification); at build time it is additionally used for data QA cross-validation (§4.3).

---

## 3. Architecture Overview

```
┌─ build time ────────────────────────────────────────────┐
│ kautian.csv ─→ scripts/build-data.mjs ─→ data/kautian.min.json │
│                    │  (normalized keys, Zhuyin fold keys, taigi-converter cross QA)│
└─────────────────────────────────────────────────────────┘
┌─ runtime (MV3, content script only, zero permissions)────┐
│ sutian page                                              │
│   #id_tsha ─input(debounce)─→ query interpretation (§5) ─→ search engine (§6) │
│      ▲                                        │          │
│      └── self-built dropdown (ARIA listbox) ←─ ranked results (§6.3) ──┘ │
│   Data: lazy fetch on first focus of the search box       │
│         chrome.runtime.getURL("data/kautian.min.json")   │
└─────────────────────────────────────────────────────────┘
```

**Key v1 decision: no service worker, no IndexedDB, no alarms, no remote data host** (Option A).

Rationale:
1. The lexicon is static dictionary data; its update frequency = the MoE's revision frequency, so shipping it with extension releases suffices. ebird's SW+IDB+alarm+remote-host pipeline exists to make "data independent of version updates" — YAGNI here.
2. Avoids the entire class of problems ebird hit: first-install race (content script needs data before the SW has fetched it), SW cold-start latency, IDB serialization anti-patterns, etc.
3. `permissions: []` — minimal review friction.

Costs and mitigations:
- Every page navigation (server-rendered, each page is a brand-new document) reloads the data. Mitigation: **lazy — fetch+parse only on first focus of the search box**; pages where search is unused cost nothing. Estimated JSON parse of 6MB ≈ 60–150ms, completable between focus and the first keystroke; show a loading hint row in the meantime.
- Memory: about 20–40MB per sutian tab (only tabs on the sutian domain).
- **Upgrade threshold (fixed in advance to avoid future debate)**: only if Stage 4 measurements show "focus → first suggestions usable" P95 > 600ms do we switch to Option B (resident SW queries + message API). Option B's interface is already isolated as pure functions in §6; migration touches only the data-loading layer.

---

## 4. Data Pipeline (build time)

### 4.1 Build script: `scripts/build-data.mjs`

Node 22+, zero dependencies (same philosophy as taigi-converter), CSV → `data/kautian.min.json`:

1. Parse the CSV (a self-written minimal parser or a simple implementation on the level of the built-in `util.parseArgs`; fields containing quoted commas must be handled).
2. Retained fields: `tl, hanzi, poj, tps_num, tl_num, tl_notone, poj_notone, tps_notone, tps_notone_var, tl_abbrev, poj_abbrev, tps_abbrev, frequency, kautian_main, is_variant`. Dropped: `poj_num, tps_num_var, tps_abbrev_var, kautian, kautian_name, kautian_accent_mask` (unused in v1; add `kautian_name` back if it proves useful after Q6 is clarified).
3. Derived fields (computed at build time):
   - `zhu_key`: `tps_notone` mapped through the §5.4 fold table into an approximate-sound key of "characters typeable on a standard Zhuyin keyboard".
   - NFC normalization of all fields; romanization fields additionally stored lowercase (`tl`/`poj` keep original casing for display).
4. Output **columnar packed JSON**: `{ tl: [...], hanzi: [...], ... }` rather than 57k objects — faster to parse, smaller, and easier to switch to a binary format later.
5. Output `data/build-report.txt`: row count, per-field coverage, size, QA anomaly list.

### 4.2 Size Estimate and Baseline

Original CSV 7.5MB → estimated 5–7MB after dropping redundant fields, roughly 1.5–2MB zipped (store package). **Success criteria: `kautian.min.json` ≤ 8MB, ≤ 3MB zipped**; if exceeded, switch to binary packing (string pool + offset table), listed as a Stage 1 fallback rather than the default.

### 4.3 Data QA (built into the build; anomalies go to the report and do not fail the build)

- Cross-validate a sample with taigi-converter: `tl` with tones stripped → should equal `tl_notone` (after removing hyphens); `convert(tl_num, 'tl', 'zhuyin')` → should equal `tps_num` (tolerating a list of known lossy mappings).
- Checks: empty fields, `tl` containing invalid syllables (those where `parseSyllable` throws), duplicate rows (same `tl`+`hanzi`).

---

## 5. Query Interpretation Layer (input interpretation)

### 5.1 Input Type Detection (evaluated in order, can be compound)

| Detection | Rule | Search path taken |
|------|------|----------------|
| Regex mode | Input starts with `/` and length ≥ 2 (`/pat/` or `/pat`) | §6.5 |
| Hanzi | Contains CJK (U+4E00–9FFF, extension blocks) | hanzi index |
| TPS/Zhuyin | Contains U+3100–312F (standard Zhuyin) or U+31A0–31BF (TPS extension) | TPS index + Zhuyin fold index |
| Romanization | Remaining Latin (may include tone marks, tone-number digits, hyphens) | TL/POJ indexes |
| Mixed | Hanzi+Latin etc. | v1 takes the dominant script, ignores other characters, and notes this in the hint row |

### 5.2 Romanization Normalization Pipeline (core of R3, R4)

```
raw → NFD → strip \p{M} (tone marks) → remove tone-number digits [1-9] → lowercase
    → remove hyphens/whitespace/"--" neutral-tone prefix → normalizeToTl() (POJ spelling unification, vendor deep import)
    → norm_key
```

- `norm_key` is matched against both `tl_notone` and `poj_notone` (double coverage: the CSV has both columns; normalizeToTl unifies most POJ spellings to TL, but for historical spellings like `oa/oe/ek/eng` comparing directly against `poj_notone` is more robust).
- When user input **includes tone marks or tone-number digits**, additionally perform "toned exact matching" (against `tl`/`tl_num`/`poj` lowercased); such hits rank first (§6.3 tier 1).
- POJ ASCII-ization such as `ⁿ`/`ᴺ` → `nn`, `o͘` → `oo` is handled by `toToneNumberAscii` logic.

### 5.3 Taiwanese Phonetic Symbol Input

Input containing TPS extension-block characters → strip tone symbols (ˊˋ˫˪˙, trailing whitespace, U+0307/U+02D9) → exact/prefix match against `tps_notone` (and `tps_notone_var`).

### 5.4 Zhuyin Approximate-Sound Matching (the part of R4 most in need of review)

**Problem**: an ordinary user's Zhuyin keyboard cannot type TPS extension characters (ㆤㆦㆲ…), and Mandarin Zhuyin sound values only approximate Taiwanese.
**Mechanism**: a two-sided fold into a common sequence of "sound-class tokens" —
- build-time: each symbol of an entry's `tps_notone` goes through the FOLD table → `zhu_key`.
- query-time: the user's Zhuyin input, after tone stripping, first undergoes sequence convergence (longest-match, e.g. `ㄨㄥ`→`@ong`), then passes through the same FOLD table → the same token space, matched exact/prefix.
- One-to-many mappings (e.g. ㄩ→{i,u}) are expanded on the query side; each candidate key is queried separately and results merged.

**FOLD table draft v0** (⚠️ needs linguistic review; codex and human reviewers should focus on this table):

| TPS/Zhuyin | token | Notes |
|----------|-------|------|
| ㆠ | b | Voiced labial |
| ㆣ | g | |
| ㆡ ㆢ | j | Query side ㄖ→j |
| ㄫ | ng- | No corresponding key on the query side; accept ㄥ as an approximation |
| ㆤ ㆥ | e | Query side ㄝ→e, ㄟ→{e, ue} |
| ㆦ ㆧ | oo | Query side ㄛ→{oo, o}, ㄡ→{au, oo} |
| ㄜ | o | TPS uses ㄜ for TL `o`; query side ㄜ→o, ㄦ→o |
| ㆨ | ir | Query side ㄨ→{u, ir}, ㄩ→{i, u, ir} |
| ㆩ ㆪ ㆫ ㆮ ㆯ | a i u ai au | Nasalized vowels fold to oral vowels (recall first) |
| ㆬ ㆭ | m ng | Syllabic finals; query side ㄥ→{ng, ong, ing} |
| ㆰ ㆱ ㆲ | am om ong | Query side ㄢ→{an, am}, ㄤ→ang |
| ㆴ ㆵ ㆷ ㆻ | (dropped) | Checked-tone (entering-tone) codas do not participate in approximate-sound matching |
| ㄓㄔㄕ | ts tsh s | Mandarin retroflexes folded to dentals |
| ㄈ | h | Taiwanese has no f; usually corresponds to h (e.g. 福 hok) |
| ㄐㄑㄒ | tsi tshi si | TPS already borrows these; passed straight through on the query side |
| Remaining standard symbols | pass-through | ㄅㄆㄇㄉㄊㄋㄌㄍㄎㄏㄗㄘㄙㄚㄞㄠㄢㄤㄧㄨ |

Results hit through this path get an "approximate sound" badge and rank below exact paths (§6.3 tier 5).

---

## 6. Search Engine

Pure-function module (no DOM, no chrome API dependency), unit-testable directly in Node; the data-loading layer is isolated behind an interface (easing a future migration to Option B).

### 6.1 Index Structures (built once at load time)

| Index | Structure | Serves |
|------|------|----------|
| `exact`: `Map<string, idx[]>` | keys = tl/tl_num/poj lowercase, tl_notone, poj_notone, tps_notone(+var), hanzi, zhu_key, abbrev ×3 | tiers 1/2/4, Zhuyin exact |
| `prefix`: one sorted array each for `tl_notone`, `poj_notone`, `hanzi`, `zhu_key` | Binary search for ranges | tier 3 |
| Linear scan (capped) | Raw field arrays | substring, fuzzy, regex |

Memory traded for time: indexes add ~10–20MB in exchange for <10ms per keystroke.

### 6.2 Query Flow

```
input(debounce 120ms) → detect (§5.1) → normalize (§5.2–5.4)
  → query tier by tier, short-circuit once 50 results accumulate
  → rank (§6.3) → render top 20
```

### 6.3 Ranking (ranking tiers)

| Tier | Match |
|------|------|
| 1 | Toned exact (tl / tl_num / poj / tps_num full equality) |
| 2 | Tone-less exact (notone / hanzi full equality) |
| 3 | Tone-less prefix |
| 4 | Abbreviation exact (tl_abbrev etc., e.g. `tk` → tông-ku) |
| 5 | Zhuyin approximate sound (zhu_key exact/prefix) |
| 6 | Substring (notone / hanzi contains) |
| 7 | Fuzzy (§6.4) |

Within the same tier: `kautian_main` first → `is_variant` last → `frequency` descending → shorter length first. Before hanzi matching, apply variant-character folding such as `台→臺` (following ebird's experience; start the fold table small).

### 6.4 Fuzzy (R1)

- Algorithm: Damerau-Levenshtein (with adjacent transposition); thresholds: `norm_key` length ≤5 → distance ≤1; ≥6 → ≤2.
- Candidate pruning: bucket by length (compare only when |len difference| ≤ threshold), plus banded DP with early termination. Full scan of 57k entries estimated <30ms worst case; if exceeded, add a bigram inverted index as a pre-filter (decide after Stage 2 measurement, not built up front).
- Enabled only for the romanization path; error tolerance for Hanzi/TPS is carried by the fold tables.

### 6.5 Regex Mode (R2)

- Syntax: input starting with `/`, either `/pat/` or unclosed `/pat`; default flags `iu`.
- Fields matched: `tl` (with tones), `tl_notone`, `poj`, `hanzi` — a row qualifies if any of the four fields matches, sorted by frequency (no tiers).
- **Safety guard (ReDoS)**: pattern length capped at 64; `new RegExp` wrapped in try/catch (on invalid pattern, show the error in the hint row and do not query); the linear scan checks the time budget every 2,000 rows (abort a query exceeding 80ms and show "results incomplete"); if backreferences are ever needed, re-evaluate an RE2-family wasm (not in v1; listed as a risk in §12).
- Regex-mode input is **not** written back to the site's form submission (`tsha` is a site parameter; the site does not understand regex; the hint row notes "local filtering only").

---

## 7. UI / UX Specification

### 7.1 Injection and Mounting

- `run_at: document_idle`; look for `#id_tsha` (form `tshiautuann`); if not found (non-search page), stay entirely idle.
- Load data only on first `focus`/`input` (§3); while loading, show a single row "Loading lexicon…".
- Dropdown container `<div class="stnp-dropdown">` inserted after the input, `position:absolute` aligned to the input; all classes use the `stnp-` prefix + high-specificity scoping, **no blanket `!important`** (avoiding ebird's 81 lines of !important).

### 7.2 Suggestion Row Content

Each row (`<a>`): Hanzi (primary), Tâi-lô (with tones), POJ, Taiwanese Phonetic Symbols, source badge (exact/prefix/abbreviation/approximate/fuzzy/regex, shown only when non-exact), `is_variant` shown as 又音 (variant reading). All text via `textContent`.

### 7.3 Keyboard and Accessibility

- `↑`/`↓` to move (no wrapping outside the input), `Enter` opens the selected item, `Esc` closes, `Tab` closes and passes through; with no selection, `Enter` passes through to the site's native form submission (**never hijack native behavior**).
- keydown listener **bound on the input element, once at init**; dropdown updates only swap content.
- ARIA: input `role="combobox"` `aria-expanded` `aria-controls` `aria-activedescendant`; container `role="listbox"`; rows `role="option"` `aria-selected`. (ebird only did this halfway; this project does the full set.)
- Outside-click to close: a single `pointerdown` listener on `document`, bound once at init.

### 7.4 Selection Behavior

- Click/Enter: navigate to `/{current locale}/tshiau/?lui=tai_su&tsha=${encodeURIComponent(tl)}` (native `<a href>` behavior; middle-click/⌘click supported for free). An exact search on the entry's full Tâi-lô; the site's results page is usually that exact entry.
- `Shift+Enter`: only fill the Tâi-lô into the input without navigating (synthetic `input` event to notify the site's JS — reusing ebird's hand-back-control pattern).

### 7.5 Coexistence with the Host Site

- When `lui != tai_su`: keep listeners but produce no suggestions (sync the enabled state on radio `change`).
- `maxlength=50`: our matching completes before any interception and is unaffected; only truncation-check when writing `tsha` back to the form.
- The site's page CSP does not affect the content script (isolated world) fetching the extension's own resources.

---

## 8. Extension Structure and Manifest

### 8.1 manifest.json Draft

```json
{
  "manifest_version": 3,
  "name": "Sutian+ 臺灣台語辭典增強搜尋",
  "version": "0.1.0",
  "description": "為教育部臺灣台語常用詞辭典加上模糊、正規表示式與多音標系統即時搜尋建議",
  "permissions": [],
  "content_scripts": [{
    "matches": ["https://sutian.moe.edu.tw/*"],
    "js": ["dist/content.js"],
    "css": ["dist/content.css"],
    "run_at": "document_idle"
  }],
  "web_accessible_resources": [{
    "resources": ["data/kautian.min.json"],
    "matches": ["https://sutian.moe.edu.tw/*"]
  }],
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
}
```

Key points: zero permissions, zero host_permissions, WAR open only to the sutian origin (fixing ebird's `<all_urls>` extension-id leak), no background.

### 8.2 Directory Structure

```
sutian-plus/
├── manifest.json
├── scripts/build-data.mjs        # CSV → data/kautian.min.json
├── src/
│   ├── content/
│   │   ├── main.js               # mounting, event binding, lazy loading
│   │   └── ui.js                 # dropdown rendering, keyboard, ARIA
│   ├── search/
│   │   ├── detect.js             # §5.1 input detection
│   │   ├── normalize.js          # §5.2–5.3 (deep import of vendor phonetics.js)
│   │   ├── zhuyin-fold.js        # §5.4 FOLD table and folding
│   │   ├── engine.js             # §6 indexes + queries
│   │   ├── fuzzy.js              # §6.4
│   │   └── regex-mode.js         # §6.5
│   └── config.js                 # selectors, URL templates, limit constants (single source of truth)
├── data/                          # build artifacts (gitignored)
├── tests/                         # node:test
├── vendor/                        # submodules (reference + phonetics deep import)
├── kautian.csv / kautian.ods      # raw data
└── esbuild.config.mjs             # bundle content.js (handles vendor ESM imports)
```

### 8.3 Technology Choices

- **ESM JavaScript + esbuild bundle + node:test**, zero runtime dependencies (same philosophy as both vendor projects; content scripts cannot run ESM directly, hence the bundle — which also tree-shakes unused vendor modules, and the bundle verifies the 1.5MB dictionary.js is not pulled in by mistake).
- Browser targets: v1 Chrome/Chromium (Edge-compatible). Firefox deferred (Q5).

---

## 9. Testing Strategy

| Layer | Tooling | Contents |
|----|------|------|
| Data QA | Built into the build script | §4.3; build-report anomaly list manually reviewed |
| Unit | node:test | normalize (POJ/TL/tone marks/tone numbers/ⁿ/o͘/`--`), detect, FOLD two-sided consistency, fuzzy boundaries (thresholds, transpositions), regex safety (invalid patterns, timeout abort), ranking golden tests (fixed query → expected top-N snapshot) |
| Performance | bench inside node:test | Full 57k: exact/prefix <5ms, substring+fuzzy <30ms, regex worst <80ms (abort mechanism effective) |
| Integration | Saved HTML fixture + Playwright (optional) | mounting, keyboard flow, `lui`-switch disabling, locale URL generation; use offline fixtures to avoid hitting the site |
| Manual | checklist | Real site in both locales, middle-click new tab, lazy loading on slow networks, coexistence with the voice-search modal |

Golden query samples (into fixtures): `sutiann`, `su-tiann`, `sū-tiānn`, `su7tiann7`, `chhiau` (POJ ch-), `ㄙㄨㄉㄧㄚ` (Zhuyin approximate), `ㆠㄨㄣˊ` (TPS), `/^tshi.*h8$/`, `臺語`/`台語`, `tk` (abbreviation), misspelled `sutiam`.

---

## 10. Implementation Stages

### Stage 1: Data pipeline
- **Goal**: `build-data.mjs` produces packed JSON + QA report.
- **Success criteria**: all 57,379 rows output; JSON ≤ 8MB; QA anomalies listed and manually reviewed; measured parse time recorded in the report.
- **Tests**: build is idempotently rerunnable; field-coverage assertions; taigi-converter cross-validation pass rate ≥ 99% (differences added to the known-lossy list).
- **Status**: ✅ Done; subsequently upgraded per PERF_EVALUATION.md to format v2 (string-pool + runtime derivation): 4.44MB / gzip 1.07MB; full comparison of derived fields shows 0 inconsistencies; FOLD table covers all 51 TPS characters

### Stage 2: Query interpretation + search engine (pure functions)
- **Goal**: full §5, §6 functionality with no browser dependencies.
- **Success criteria**: all golden tests green; performance bench meets §9 thresholds; FOLD table v0 with two-sided test coverage of every symbol.
- **Tests**: §9 unit + bench.
- **Status**: ✅ Done; subsequently changed per PERF_EVALUATION.md to Map-free lazy sorted indexes (19/19 tests green; bench: exact <1ms, fuzzy ~10ms, regex budget abort effective; createEngine 234→92ms)

### Stage 3: Extension shell + UI
- **Goal**: manifest, mounting, dropdown, keyboard, ARIA, lazy loading.
- **Success criteria**: manual checklist passes on the real site in both locales; no console errors; exactly one keydown and one pointerdown listener each (verified in DevTools); `getEventListeners` does not grow with keystrokes.
- **Tests**: fixture integration tests + manual checklist.
- **Status**: ✅ Code complete (bundle 22.6KB, no vendor dictionary pulled in by mistake; real-site manual checklist pending user load verification)

### Stage 4: Integration tuning and store packaging
- **Goal**: tune ranking with real queries, a11y re-check, measure the §3 upgrade threshold, store assets and zip.
- **Success criteria**: focus→usable P95 ≤ 600ms (otherwise trigger Option B evaluation); store review materials complete (single-purpose statement, privacy statement: no data collected).
- **Tests**: performance measurement script + final pre-submission manual checklist.
- **Status**: 🔶 Partially done (`npm run package` produces a 1.15MB zip; Node-side load measurement ~100ms + lazy indexing, far below the 600ms threshold. TODO: real-site manual verification, icons, store assets, license clarification Q1)

---

## 11. Licensing and Compliance

- Both vendor projects are MIT; code reuse is unproblematic (retain copyright notices).
- **kautian.csv originates from MoE dictionary data**: the MoE has historically released under "Creative Commons Attribution-NoDerivs Taiwan 3.0"-type terms — whether derived fields like `*_notone`/`zhu_key` and distribution with the extension constitute a "derivative work" **must be clarified before store submission** (→ Q1, the highest-risk item in this plan). Alternative: on first activation, the extension downloads the official data on the user's side and builds it locally (costly; listed only as a fallback).
- Extension license: MIT (consistent with the repo LICENSE).

## 12. Risk Register

| Risk | Impact | Mitigation |
|------|------|------|
| Data license disallows redistribution (Q1) | Cannot publish | Confirm terms before submission; fallback in §11 |
| Linguistic errors in the FOLD table | Approximate search misses / wrong hits | Table isolated as its own module + tests, v0 marked pending review; can be revised independently after release |
| Regex ReDoS freezes the tab | UX breakdown | Length cap + time-budget abort (§6.5); wasm RE2 if necessary |
| Site redesign (DOM/URL) | Silent feature failure | selectors/URLs centralized in `config.js`; single-line console warning on mount failure |
| Load latency of 6MB of data | Poor first experience | Lazy loading + measured threshold + Option B fallback (§3) |
| Store review (large data file / single purpose) | Publication delay | Zero-permission design, clear purpose statement |

## 13. Open Questions (codex reviewers: please take a position on each)

1. **Data licensing** (§11): compliance verdict on distributing kautian-derived data with the extension?
2. **FOLD table v0** (§5.4): check the sound-class mappings row by row, especially ㄈ→h, ㄡ→{au,oo}, the nasalized-vowel fold, and dropping checked-tone codas.
3. **Option A vs B** (§3): is the 600ms P95 threshold and lazy strategy reasonable? Should we go straight to SW + caching?
4. **Regex field scope** (§6.5): are four fields enough? Support `hanzi:` / `tl:` field-prefix syntax (v1 leans no)?
5. **Firefox**: include in v1 (MV3 WAR/ESM differences cost roughly a few days)?
6. **`kautian_accent_mask` / `kautian_name`**: once semantics are confirmed, should they participate in ranking (down-rank personal/place names?).
7. **Full disabling when `lui != tai_su`**: or at least provide partial suggestions from the hanzi field in `hua_su` mode?
8. **No entry id**: is navigating to the search-results page instead of the entry page acceptable? (Fallback: parse the site's sitemap to build a tl→id mapping table; adds build complexity and fragility, v1 leans no.)
9. **Homographs (same tl, different hanzi)** — dropdown merge strategy: separate rows (current plan) or one merged row with multiple hanzi?

## 14. Part 2 Interface Note (out of scope this phase)

Hover popup showing POJ/TPS for MoE romanization: at that point the data pipeline from this phase (tl→poj/tps lookup in the same `kautian.min.json`) and the content-script mounting framework can be fully reused; only entry-page DOM scanning and a popup component need to be added. This phase's code organization (search/ and content/ separation) already reserves room for it.
