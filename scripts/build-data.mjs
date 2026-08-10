// kautian.csv → data/kautian.min.json (format v2: string-pool) + data/build-report.txt
// IMPLEMENTATION_PLAN.md §4, PERF_EVALUATION.md option C+. Zero dependencies, Node 22+.
//
// Format v2: tlNotone / pojNotone / tpsNotone / zhu are not shipped in the file;
// they are derived at runtime (src/search/derive.js). This script QAs that by
// fully comparing "derived result vs CSV column" and fails the build on any
// mismatch — data or rule drift blows up here instead of silently mis-matching.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { dataFold } from "../src/search/zhuyin-fold.js";
import { deriveTlNotone, derivePojNotone, deriveTpsNotone } from "../src/search/derive.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "kautian.csv");
const OUT_DIR = join(ROOT, "data");
const OUT_JSON = join(OUT_DIR, "kautian.min.json");
const OUT_REPORT = join(OUT_DIR, "build-report.txt");

// --- minimal RFC4180 parser ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const t0 = performance.now();
const rows = parseCsv(readFileSync(SRC, "utf8"));
const header = rows.shift();
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const need = (name) => {
  if (!(name in col)) throw new Error(`kautian.csv is missing column: ${name}`);
  return col[name];
};

// Shipped columns (string-pool)
const SHIP = {
  tl: need("tl"), hanzi: need("hanzi"), poj: need("poj"),
  tps: need("tps_num"), tlNum: need("tl_num"), tpsNotoneVar: need("tps_notone_var"),
  abTl: need("tl_abbrev"), abPoj: need("poj_abbrev"), abTps: need("tps_abbrev"),
};
// QA-only columns (not shipped; compared against runtime derivation)
const QA_COLS = {
  tlNotone: need("tl_notone"), pojNotone: need("poj_notone"), tpsNotone: need("tps_notone"),
};
const iFreq = need("frequency");
const iMain = need("kautian_main");
const iVariant = need("is_variant");

const cols = Object.fromEntries(Object.keys(SHIP).map((k) => [k, []]));
const freq = [];
const flags = [];
const errors = [];
const qa = { emptyFields: {}, unknownTps: new Map(), dupes: 0, mismatch: { tlNotone: [], pojNotone: [], tpsNotone: [] } };
const seen = new Set();

for (const r of rows) {
  const get = (i) => (r[i] ?? "").normalize("NFC");
  for (const [k, i] of Object.entries(SHIP)) {
    const v = get(i);
    if (v.includes("\n")) errors.push(`column ${k} contains a newline (string-pool separator): ${v}`);
    cols[k].push(v);
    if (!v && ["tl", "hanzi", "poj"].includes(k)) {
      qa.emptyFields[k] = (qa.emptyFields[k] || 0) + 1;
    }
  }
  freq.push(Number(get(iFreq)) || 0);
  flags.push((get(iMain) === "True" ? 1 : 0) | (get(iVariant) === "True" ? 2 : 0));

  // QA: runtime derivation vs CSV (hard gate)
  const i = cols.tl.length - 1;
  const checks = [
    ["tlNotone", deriveTlNotone(cols.tl[i]), get(QA_COLS.tlNotone).toLowerCase()],
    ["pojNotone", derivePojNotone(cols.poj[i]), get(QA_COLS.pojNotone).toLowerCase()],
    ["tpsNotone", deriveTpsNotone(cols.tps[i]), get(QA_COLS.tpsNotone)],
  ];
  for (const [name, derived, csv] of checks) {
    if (derived !== csv && qa.mismatch[name].length < 20) {
      qa.mismatch[name].push(`${cols.tl[i]}: derived=${JSON.stringify(derived)} csv=${JSON.stringify(csv)}`);
    } else if (derived !== csv) {
      qa.mismatch[name].push(null); // count only
    }
  }
  // QA: FOLD table coverage (soft, report only)
  const { unknown } = dataFold(get(QA_COLS.tpsNotone));
  for (const ch of unknown) qa.unknownTps.set(ch, (qa.unknownTps.get(ch) || 0) + 1);

  const dupKey = `${cols.tl[i]} ${cols.hanzi[i]}`;
  if (seen.has(dupKey)) qa.dupes++;
  else seen.add(dupKey);
}

const count = cols.tl.length;
const out = { meta: { source: "kautian.csv", count, format: 2 }, freq, flags };
for (const k of Object.keys(SHIP)) out[k] = cols[k].join("\n");

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT_JSON, json);
const jsonBytes = Buffer.byteLength(json);
const gzBytes = gzipSync(json).length;
const elapsed = (performance.now() - t0).toFixed(0);

const mismatchLines = Object.entries(qa.mismatch).flatMap(([name, list]) => [
  `derive ${name} mismatches: ${list.length} / ${count}`,
  ...list.filter(Boolean).map((s) => `  sample: ${s}`),
]);
const report = [
  `build-data report — ${new Date().toISOString()}`,
  `format: 2 (string-pool, runtime-derived notone/zhu)`,
  `entries: ${count}`,
  `json bytes: ${jsonBytes} (${(jsonBytes / 1048576).toFixed(2)} MB)`,
  `gzip bytes: ${gzBytes} (${(gzBytes / 1048576).toFixed(2)} MB)`,
  `build time: ${elapsed} ms`,
  ``,
  `-- QA --`,
  `empty required fields: ${JSON.stringify(qa.emptyFields)}`,
  `duplicate (tl+hanzi) rows: ${qa.dupes}`,
  `unknown TPS chars: ${[...qa.unknownTps].map(([c, x]) => `${c}(U+${c.codePointAt(0).toString(16).toUpperCase()})×${x}`).join(" ") || "none"}`,
  ...mismatchLines,
  ``,
].join("\n");
writeFileSync(OUT_REPORT, report);
console.log(report);

// hard gates
const totalMismatch = Object.values(qa.mismatch).reduce((s, l) => s + l.length, 0);
if (totalMismatch > 0) {
  console.error(`FAIL: runtime derivation differs from CSV (${totalMismatch} rows) — fix derive.js or inspect the data`);
  process.exit(1);
}
if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} column errors`, errors.slice(0, 5));
  process.exit(1);
}
if (jsonBytes > 8 * 1048576) {
  console.error("FAIL: JSON exceeds the 8MB limit (IMPLEMENTATION_PLAN.md §4.2)");
  process.exit(1);
}
