# Sutian+

A browser extension (Chrome MV3, zero permissions, zero runtime dependencies) that adds enhanced
search suggestions to the search box of the Ministry of Education (MoE) "Dictionary of
Frequently-Used Taiwan Taiwanese" (https://sutian.moe.edu.tw/).

Supported input: MoE Tâi-lô (case- and tone-insensitive; tone diacritics or tone numbers both work),
Pe̍h-ōe-jī (POJ), Hanzi (台/臺 interchangeable), Taiwanese Phonetic Symbols (TPS),
Zhuyin approximate-sound input (approximate lookup with a regular Zhuyin keyboard),
initial-letter abbreviations (`tk` → tông-ku), plus fuzzy error tolerance and `/pattern/` regex mode.

## Development

```bash
git clone --recurse-submodules <repo>
npm install          # only esbuild (devDependency)
npm run build        # build:data (CSV → data/kautian.min.json) + build:js (esbuild bundle)
npm test             # node:test: unit + golden (requires build:data first)
npm run bench        # performance measurements
npm run package      # produces sutian-plus.zip (for store upload)
```

Local install: after `npm run build`, Chrome → `chrome://extensions` → Developer mode →
"Load unpacked" → select this repo's root directory.

## Documentation

- `GOAL.md` — goals and progress (in Chinese)
- `IMPLEMENTATION_PLAN.md` — full design plan (architecture, Zhuyin folding table, ranking, risks)

## Data and Licensing

- Code: MIT.
- The `kautian.csv` lexicon is derived from MoE dictionary data; MoE licensing terms must be
  confirmed before public redistribution (see IMPLEMENTATION_PLAN.md §11).
- `vendor/taigi-converter`, `vendor/ebird-extension`: MIT (git submodules).
