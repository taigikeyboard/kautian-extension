// Input type detection (IMPLEMENTATION_PLAN.md §5.1)
import { isBopomofo } from "./zhuyin-fold.js";

const CJK_RE = /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2ffff}]/u;
const LATIN_RE = /\p{Script=Latin}/u;

// → 'regex' | 'hanzi' | 'bopomofo' | 'latin' | 'empty'
export function classify(input) {
  const text = input.trim();
  if (!text) return "empty";
  if (text.length >= 2 && text.startsWith("/")) return "regex";
  if (CJK_RE.test(text)) return "hanzi";
  if (isBopomofo(text)) return "bopomofo";
  if (LATIN_RE.test(text)) return "latin";
  return "empty";
}
