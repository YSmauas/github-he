'use strict';
/* נרמול טקסט לצורך חיפוש במילון. */

const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const ZERO_WIDTH = /[\u200b\u200c\u200d\u2060\ufeff]/g;
const HEBREW = /[\u0590-\u05ff]/;
const LATIN = /[A-Za-z]/;

/** מפריד רווחים בתחילת/סוף צומת (GitHub מוסיף הזחות ושורות חדשות). */
function splitWhitespace(s) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  return { lead: m[1], core: m[2], trail: m[3] };
}

/** מפתח חיפוש: בלי תווי כיוון/רוחב-אפס, רווחים מאוחדים. */
function normalizeKey(s) {
  return s.replace(BIDI_CONTROLS, '').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
}

/** מחליף מספרים ב-{n} ומספרי issue (#123) ב-#{n}. משמש את האיסוף. */
function templateize(s) {
  return s
    .replace(/#\d+/g, '#{n}')
    .replace(/(?<![\w.#{-])\d[\d,]*(?:\.\d+)?[kKmM]?(?![\w}])/g, '{n}');
}

function hasHebrew(s) { return HEBREW.test(s); }
function hasLatin(s) { return LATIN.test(s); }

/** רשימת ה-placeholders במחרוזת, ממוינת (לבדיקת זהות בין מקור לתרגום). */
function placeholders(s) {
  return (s.match(/\{(?:n|\d+)\}/g) || []).slice().sort();
}

module.exports = {
  splitWhitespace, normalizeKey, templateize, hasHebrew, hasLatin, placeholders,
  BIDI_CONTROLS, ZERO_WIDTH,
};
