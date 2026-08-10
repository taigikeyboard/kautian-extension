# Performance Evaluation: Faster, Lighter Alternatives (2026-08-10)

> **Status: Option C+ implemented and verified** (same day). Measured results: data file 7.39→4.44 MB,
> gzip 1.70→1.07 MB, store zip 1.8→1.15 MB, parse 30→9.5 ms,
> createEngine 234→92 ms (indexes made lazy, cost amortized to each mode's first query),
> full build-QA comparison of the three derived fields with 0 mismatches, 19/19 tests green, `ˆ˘` tone-stripping bug fixed.

> Purpose: evaluate whether the current architecture (v0.1.0) has faster/lighter alternatives.
> Method: prototype measurements on real data (57,379 entries), not paper estimates.
> Conclusion up front: **yes — Option C cuts the data file by 40% and cold start by 55%, with no architecture changes and no new dependencies.**

## 1. Current Cost Breakdown (measured, Node 26 / M-series)

| Item | Value |
|------|------|
| Data file | 7.39 MB (gzip 1.70 MB; store zip 1.8 MB) |
| Cold start (first focus after each page navigation) | ≈ 258 ms |
| ├─ JSON.parse | 30 ms |
| ├─ Normalization pass (lowercase / 台↔臺 fold) | 8 ms |
| ├─ **Map exact-index construction (4 Maps, ~500k keys)** | **128 ms** |
| └─ Prefix sorted indexes ×5 | 92 ms |
| Query latency | exact <1ms, fuzzy ~10ms, regex <80ms (targets met) |

Two structural facts:

1. **Map construction accounts for half the cost, yet is entirely unnecessary** — measured exact lookup
   with sorted array + binary search takes only **0.2 µs/query** (10k queries in 2ms). Swapping Maps for
   binary search: queries ~0.2µs slower (imperceptible), saves 128ms of construction and the memory for
   ~500k Map entries. The prefix index already requires sorted arrays, so **one index serves both exact
   and prefix lookups**.
2. **Nearly half the data file is redundant fields derivable at load time.** Measured derivation cost and correctness:

| Field | Derived from | Cost | Consistency with CSV |
|------|----------|------|---------------|
| `tlNotone` | `tl` with tones and hyphens stripped | 17 ms | **100%** ✅ |
| `pojNotone` | `poj` same as above + o͘/ⁿ handling | 27 ms | **100%** ✅ |
| `tpsNotone` | `tps` with tones stripped | 7 ms | 99.99% (8 tone-9 entries where `ˆ` U+02C6 is missing from the tone-stripping character set — an existing bug; fixing it yields 100%) |
| `zhu` | `dataFold(tpsNotone)` | ~15 ms | 100% (true by definition) |

## 2. Candidate Options (measured)

| Option | Data file | gzip | Cold start | Notes |
|------|--------|------|--------|------|
| Current | 7.39 MB | 1.70 MB | ~258 ms | baseline |
| A: string-pool (fields joined with `\n`) | 6.68 MB | 1.67 MB | ~250 ms | only 10% saved, parse no faster, **not worth doing alone** |
| B/C: string-pool + drop derived fields | **4.44 MB** | **1.07 MB** | parse+split 27 + derive 87 + sort 81 ≈ **196 ms** | file -40%, zip roughly 1.8→1.1 MB |
| C+: additionally "no Maps + lazy indexes" | 4.44 MB | 1.07 MB | **first focus ≈ 115 ms**; each mode's index is sorted only on its first query (+10–40 ms one-time) | **recommended option** |
| D: SW-resident engine (original Option B) | 4.44 MB | 1.07 MB | first ~200 ms, then **~0 ms per page** (while the SW stays alive) | MV3 SW is killed after ~30s idle; stays warm for most dictionary-browsing rhythms. Adds the complexity of a background + message protocol |

Composition of Option C+:

1. **Data format**: fields `join("\n")` into a string-pool; keep only `tl, hanzi, poj, tps, tlNum,
   tpsNotoneVar, abTl, abPoj, abTps, freq, flags`; `tlNotone / pojNotone / tpsNotone / zhu`
   are derived at load time (the build script keeps the derivation logic for QA cross-validation —
   any mismatch fails the build).
2. **Indexes**: remove all 4 Maps; exact and prefix share the same sorted index (binary search).
   toned/abbrev each use their own sorted index as well.
3. **Lazy indexes**: sorting for each key-space is deferred until that mode's first query
   (latin-input users never pay for the Hanzi/bopomofo indexes).
4. Fix a bug along the way: add `ˆ` (U+02C6) and `˘` (U+02D8) to the TPS tone-stripping character set
   (shared by normalize.js and the derivation code).

Expected outcome: **data file 7.39→4.44 MB (-40%), store zip 1.8→~1.1 MB,
first-usable latency ~258→~115-150 ms, memory savings of ~500k Map entries**.
Query latency unchanged (binary search differences are at the µs level).

## 3. Directions Evaluated but Not Recommended

| Direction | Why not |
|------|----------|
| Ship a pre-sorted permutation with the data file | the permutation is near-random and barely gzip-compressible; +1.5 MB for -80 ms contradicts "lighter"; lazy sorting already amortizes the cost to imperceptibility |
| FlexSearch / Fuse.js / lunr | generic tokenizing indexes don't understand Tâi-lô/POJ/TPS normalization, so our own normalize layer is still needed; Fuse is fully linear fuzzy (slower); adds a dependency and size for no speed gain |
| WASM (SQLite FTS5 / RE2) | +1 MB wasm plus initialization cost, unneeded at 57k-entry scale; revisit RE2 only if regex ReDoS protection proves insufficient |
| Prebuilt trie / FST binary format | greatly increases build and debugging complexity; at 57k scale binary search is already at µs level, no perceptible gain |
| Shrinking the lexicon (dropping low-frequency words) | touches product value (rare words are exactly what dictionary lookups are for); not considered |

## 4. Recommendation and Cost

- **Recommendation: implement Option C+** (format v2 + no Maps + lazy indexes + `ˆ˘` tone-stripping fix).
- Effort: about half a day. Low risk — the `createEngine(data)` interface is unchanged, so the 19 existing
  tests guard the change directly; the build script's QA cross-validation becomes a full comparison of
  "derived results vs CSV fields".
- Option D (SW-resident) **does not conflict with C+**; keep it as the next step if things still feel slow
  after C+ ships (the 600ms threshold logic in the original plan §3 stands; post-C+ measurements are
  already far below the threshold).

## Appendix: Measurement Scripts

The prototype measurement scripts live in the session scratchpad (`perf-eval.mjs`, `perf-eval2.mjs`);
the key numbers are embedded in this document. To rerun: execute the same steps against
`data/kautian.min.json` to reproduce.
