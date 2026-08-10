// User-input normalization (IMPLEMENTATION_PLAN.md §5.2–5.3)
import { normalizeToTl } from "../../vendor/taigi-converter/src/phonetics.js";

const COMBINING_RE = /[̀-ͯ]/g;
const SEG_SPLIT_RE = /--|[-\s·'’]+/;

// Single syllable segment → toneless POJ/TL normal form
function segNotone(seg) {
  return seg
    .toLowerCase()
    .normalize("NFD")
    .replaceAll("͘", "o") // o͘ → oo (must run before combining marks are stripped)
    .replaceAll("ⁿ", "nn")
    .replaceAll("ᴺ", "nn")
    .replace(COMBINING_RE, "")
    .replace(/[0-9]/g, "")
    .normalize("NFC");
}

// Romanized input → match keys.
// pojKey:  toneless, POJ spelling preserved (matched against poj_notone)
// tlKey:   toneless, normalizeToTl applied per segment (matched against tl_notone)
// toned:   toned key (lowercase, hyphens/whitespace removed, tone marks/digits kept)
// tonedTl: toned key with POJ spelling folded to TL (khoann1 → khuann1, khoaⁿ → khuann);
//          tone marks/digits survive because normalizeToTl only rewrites base letters
// hasTone: whether the input carries tone info (diacritics or digits)
export function normalizeLatin(input) {
  const raw = input.trim();
  const segs = raw.split(SEG_SPLIT_RE).filter(Boolean);
  const pojKey = segs.map(segNotone).join("");
  const tlKey = segs.map((s) => normalizeToTl(segNotone(s))).join("");
  const toned = raw.toLowerCase().replace(SEG_SPLIT_RE, "").normalize("NFC");
  const tonedTl = normalizeToTl(toned.normalize("NFD")).normalize("NFC");
  const hasTone = /[0-9]/.test(raw) || /[̀-ͯ]/.test(raw.normalize("NFD"));
  return { pojKey, tlKey, toned, tonedTl, hasTone };
}

// Hanzi variant folding (applied on both sides; v1 starts small)
export function foldHanzi(text) {
  return text.normalize("NFC").replaceAll("台", "臺");
}

// TPS input → toneless TPS key (tone-mark set shared with the data side, see derive.js)
export { deriveTpsNotone as normalizeTps } from "./derive.js";
