// Pure-function unit tests (no built data required)
import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/search/detect.js";
import { normalizeLatin, foldHanzi, normalizeTps } from "../src/search/normalize.js";
import { dataFold, queryFold } from "../src/search/zhuyin-fold.js";
import { boundedDistance, fuzzyThreshold } from "../src/search/fuzzy.js";
import { parsePattern } from "../src/search/regex-mode.js";

test("classify: mode detection", () => {
  assert.equal(classify(""), "empty");
  assert.equal(classify("  "), "empty");
  assert.equal(classify("/tsh.*u/"), "regex");
  assert.equal(classify("/"), "empty"); // a lone / is not regex
  assert.equal(classify("臺語"), "hanzi");
  assert.equal(classify("ㄙㄨ"), "bopomofo");
  assert.equal(classify("ㆠㄨㄣ"), "bopomofo");
  assert.equal(classify("sutiann"), "latin");
  assert.equal(classify("sū-tiānn"), "latin");
  assert.equal(classify("台語 tai"), "hanzi"); // mixed input: Hanzi wins
});

test("normalizeLatin: tone marks / tone digits / hyphens / case", () => {
  const a = normalizeLatin("Sū-tiānn");
  assert.equal(a.tlKey, "sutiann");
  assert.equal(a.toned, "sūtiānn");
  assert.equal(a.hasTone, true);

  const b = normalizeLatin("su7tiann7");
  assert.equal(b.tlKey, "sutiann");
  assert.equal(b.toned, "su7tiann7");
  assert.equal(b.hasTone, true);

  const c = normalizeLatin("SUTIANN");
  assert.equal(c.tlKey, "sutiann");
  assert.equal(c.hasTone, false);

  // POJ: ch → ts, o͘ → oo, ⁿ → nn
  assert.equal(normalizeLatin("chhiau").tlKey, "tshiau");
  assert.equal(normalizeLatin("chhiau").pojKey, "chhiau");
  assert.equal(normalizeLatin("thô͘").tlKey, "thoo");
  assert.equal(normalizeLatin("koaⁿ").tlKey, "kuann");
  // neutral-tone prefix --
  assert.equal(normalizeLatin("khì--ah").tlKey, "khiah");
});

test("foldHanzi / normalizeTps", () => {
  assert.equal(foldHanzi("台語"), "臺語");
  assert.equal(normalizeTps("ㆠㄨㄣˊ"), "ㆠㄨㄣ");
  assert.equal(normalizeTps("ㄒㄧ˫"), "ㄒㄧ");
  assert.equal(normalizeTps("ㄗㄨˆ"), "ㄗㄨ"); // tone 9 ˆ U+02C6 (bug found in PERF_EVALUATION)
});

test("dataFold: TPS → tokens", () => {
  assert.equal(dataFold("ㄏㄨㄚㆵ").key, "hua"); // checked-tone coda dropped
  assert.equal(dataFold("ㄒㄧ").key, "si");
  assert.equal(dataFold("ㄙㄨㄉㄧㆩ").key, "sutia"); // nasalized ㆩ → a
  assert.equal(dataFold("ㆲ").key, "ong");
  assert.deepEqual(dataFold("xㄚ").unknown, ["x"]);
});

test("queryFold: Zhuyin approximate-sound expansion", () => {
  assert.ok(queryFold("ㄙㄨㄉㄧㄚ").includes("sutia"));
  assert.deepEqual(queryFold("ㄨㄥ"), ["ong"]);
  assert.ok(queryFold("ㄈㄨ").includes("hu")); // ㄈ → h
  assert.ok(queryFold("ㄓㄨ").includes("tsu")); // retroflex folds to dental
  assert.ok(queryFold("ㄒㄧˊ").includes("si")); // tone stripped
  // one-to-many expansion
  const keys = queryFold("ㄛ");
  assert.ok(keys.includes("o") && keys.includes("oo"));
});

test("boundedDistance: edit distance with transposition", () => {
  assert.equal(boundedDistance("abc", "abc", 2), 0);
  assert.equal(boundedDistance("abc", "abd", 2), 1);
  assert.equal(boundedDistance("abc", "acb", 2), 1); // adjacent transposition
  assert.equal(boundedDistance("abc", "abcd", 2), 1);
  assert.equal(boundedDistance("ab", "abcd", 1), 2); // above k → k+1
  assert.equal(boundedDistance("sualakku", "sualakkhu", 2), 1);
  assert.equal(fuzzyThreshold(5), 1);
  assert.equal(fuzzyThreshold(6), 2);
});

test("parsePattern: regex guards", () => {
  assert.ok(parsePattern("/tsh.*u/").re instanceof RegExp);
  assert.ok(parsePattern("/tsh.*u").re instanceof RegExp); // unclosed also accepted
  assert.equal(parsePattern("/[").error, "invalid");
  assert.equal(parsePattern("//").error, "empty");
  assert.equal(parsePattern("/" + "a".repeat(100)).error, "too-long");
});
