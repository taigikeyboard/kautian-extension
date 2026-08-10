// Regex mode (IMPLEMENTATION_PLAN.md §6.5)
// Syntax: /pattern or /pattern/; default flags iu.
// Guards: pattern length cap, try/catch compile, scan time budget with abort.

const MAX_PATTERN_LEN = 64;
const TIME_BUDGET_MS = 80;
const CHECK_EVERY = 2048;
const MAX_HITS = 200;

// input → { re } or { error }
export function parsePattern(input) {
  let pat = input.trim().slice(1); // drop the leading /
  if (pat.endsWith("/")) pat = pat.slice(0, -1);
  if (!pat) return { error: "empty" };
  if (pat.length > MAX_PATTERN_LEN) return { error: "too-long" };
  for (const flags of ["iu", "i"]) {
    try {
      return { re: new RegExp(pat, flags) };
    } catch {
      // the 'u' flag is stricter; retry once with plain 'i'
    }
  }
  return { error: "invalid" };
}

// Scan the four columns tl / tlNotone / poj / hanzi; calls add(idx) on hits.
// Returns { truncated }: true when the time budget was exceeded.
export function regexScan(data, re, add) {
  const { tl, tlNotone, poj, hanzi } = data;
  const start = performance.now();
  let hits = 0;
  for (let i = 0; i < tl.length; i++) {
    if (i % CHECK_EVERY === 0 && performance.now() - start > TIME_BUDGET_MS) {
      return { truncated: true };
    }
    if (re.test(tl[i]) || re.test(tlNotone[i]) || re.test(poj[i]) || re.test(hanzi[i])) {
      add(i);
      if (++hits >= MAX_HITS) return { truncated: true };
    }
  }
  return { truncated: false };
}
