// Golden tests: verify end-to-end query behavior against the real built data.
// Requires npm run build:data first.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createEngine, TIER } from "../src/search/engine.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "kautian.min.json");
if (!existsSync(DATA)) {
  throw new Error("missing data/kautian.min.json — run npm run build:data first");
}
const engine = createEngine(JSON.parse(readFileSync(DATA, "utf8")));

const tls = (r) => r.results.map((x) => x.tl);
const hanzis = (r) => r.results.map((x) => x.hanzi);

test("entry ids: kan-tann / kan-ta / 干焦 all resolve to entry 448", () => {
  for (const q of ["kan-tann", "kan-ta", "kan-na", "干焦"]) {
    const r = engine.query(q);
    assert.ok(r.results.length > 0, `no results for ${q}`);
    assert.equal(r.results[0].id, 448, `top result for ${q} should be entry 448`);
  }
  // variant hanzi spelling (異用字) also resolves to the parent entry
  const v = engine.query("乾焦");
  assert.equal(v.results[0].id, 448);
});

test("entry 16685 (寬/緩 khuann): every input system reaches it", () => {
  // unmarked TL is a valid tone-1 spelling → toned-exact puts 16685 on top
  for (const q of ["khuaⁿ", "khuann", "ㄎㄨㆩ", "khoann1", "khoaⁿ1", "KHUANN"]) {
    const r = engine.query(q);
    assert.equal(r.results[0]?.id, 16685, `top result for ${JSON.stringify(q)} should be entry 16685`);
  }
  // Hanzi lookups share the surface form with other entries (寬 khuan, 緩 uān)
  // but 16685 must be present
  for (const q of ["寬", "緩"]) {
    const r = engine.query(q);
    assert.ok(r.results.some((x) => x.id === 16685), `${q} should include entry 16685`);
  }
});

test("entry dedup: one row per entry id", () => {
  const r = engine.query("kanna");
  const ids = r.results.map((x) => x.id);
  assert.equal(ids.length, new Set(ids).size);
});

test("toned exact: tone digits / tone diacritics", () => {
  const a = engine.query("si7");
  assert.equal(a.results[0].hanzi, "是");
  assert.equal(a.results[0].tier, TIER.TONED);
  const b = engine.query("sī");
  assert.equal(b.results[0].hanzi, "是");
  const c = engine.query("tong5-ku1");
  assert.ok(hanzis(c).includes("同居"));
});

test("case-insensitive + toneless: SI → high-frequency si* words", () => {
  const r = engine.query("SI");
  assert.ok(r.results.length > 0);
  // "si" is a valid tone-1 spelling, so the toned-exact hit (詩 si) leads;
  // toneless matches like 是 sī follow
  assert.ok(r.results[0].tier <= TIER.EXACT);
  assert.ok(hanzis(r).includes("是"));
});

test("POJ input: chhiau→tshiau, soa-lak-khu→沙鹿區", () => {
  const a = engine.query("chhiau");
  assert.ok(tls(a).some((t) => t.toLowerCase().startsWith("tshiau")));
  const b = engine.query("soalakkhu");
  assert.ok(hanzis(b).includes("沙鹿區"));
});

test("prefix: sutia* completion", () => {
  const r = engine.query("sutia");
  assert.ok(r.results.length > 0);
  assert.ok(r.results.every((x) => x.tier <= TIER.PREFIX || x.tier >= TIER.SUBSTR));
});

test("abbreviation: tk (many collisions)", () => {
  const r = engine.query("tk");
  assert.ok(r.results.length > 0);
  assert.equal(r.results[0].tier, TIER.ABBREV);
  // 同居 is in the full abbreviation hit set
  const all = engine.query("tk", { limit: 2000 });
  assert.ok(hanzis(all).includes("同居"));
});

test("Hanzi: exact / prefix / 台→臺 folding", () => {
  const a = engine.query("同居");
  assert.equal(a.results[0].hanzi, "同居");
  // the data itself mixes 台/臺 (臺北 vs 舞台) — verify two-sided folding
  const b = engine.query("台北");
  assert.ok(hanzis(b).includes("臺北"));
  const b2 = engine.query("舞臺");
  assert.ok(hanzis(b2).includes("舞台"));
  const c = engine.query("沙鹿");
  assert.ok(hanzis(c).includes("沙鹿區"));
});

test("TPS input: ㆠㄨㄣˊ → 文", () => {
  const r = engine.query("ㆠㄨㄣˊ");
  assert.ok(hanzis(r).includes("文"));
  // with the tone mark present this is now a toned-exact hit
  assert.equal(r.results[0].tier, TIER.TONED);
  assert.equal(r.results[0].hanzi, "文");
});

test("Zhuyin approximate sound: ㄙㄨㄉㄧㄚ, ㄒㄧ", () => {
  const a = engine.query("ㄙㄨㄉㄧㄚ");
  assert.ok(tls(a).some((t) => t.toLowerCase().replace(/[-]/g, "").startsWith("su")));
  const b = engine.query("ㄒㄧ");
  assert.ok(hanzis(b).length > 0);
});

test("fuzzy: sualakku (missing h) → 沙鹿區", () => {
  const r = engine.query("sualakku");
  assert.ok(hanzis(r).includes("沙鹿區"));
  const hit = r.results.find((x) => x.hanzi === "沙鹿區");
  assert.equal(hit.tier, TIER.FUZZY);
});

test("regex mode", () => {
  const a = engine.query("/^tshiau/");
  assert.ok(a.results.length > 0);
  // the engine's regex scan includes tlNotone (toneless AND hyphenless)
  const notone = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-\s]+/g, "");
  assert.ok(
    a.results.every(
      (x) =>
        /^tshiau/i.test(x.tl) || /^tshiau/i.test(notone(x.tl)) ||
        /^tshiau/i.test(x.poj) || /^tshiau/i.test(x.hanzi)
    )
  );
  const b = engine.query("/[");
  assert.equal(b.error, "invalid");
  const c = engine.query("/^臺.語$/");
  assert.ok(c.results.every((x) => /^臺.語$/.test(x.hanzi)));
});

test("empty input", () => {
  assert.equal(engine.query("").results.length, 0);
  assert.equal(engine.query("   ").results.length, 0);
});

test("ranking: toned-exact and main entries first (no frequency)", () => {
  const r = engine.query("e5");
  assert.ok(r.results.length > 0);
  assert.equal(r.results[0].tier, TIER.TONED);
  assert.equal(r.results[0].tl.toLowerCase(), "ê");
});
