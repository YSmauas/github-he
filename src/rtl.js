'use strict';
/* כיווניות: הטקסט העברי מימין לשמאל, בלי להפוך את הפריסה ובלי יישור לימין. */
const { hasHebrew } = require('./normalize');

const RLI = '\u2067';
const PDI = '\u2069';
const ATTR = 'data-ghe';
const CSS = `[${ATTR}]{direction:rtl;unicode-bidi:isolate;text-align:left}`;

/**
 * מחליט איך להציג את התרגום.
 * מחזיר { text, markEl } — markEl הוא האלמנט שיסומן ב-data-ghe (או null).
 * mode: 'auto' | 'css' | 'isolate' | 'off'
 */
function render(textNode, he, mode) {
  if (mode === 'off' || !hasHebrew(he)) return { text: he, markEl: null };
  const el = textNode.parentElement;
  const leaf = !!el && el.childElementCount === 0;
  if (mode === 'css') return { text: he, markEl: el };
  if (mode === 'isolate') return { text: RLI + he + PDI, markEl: null };
  // auto
  if (leaf) return { text: he, markEl: el };
  return { text: RLI + he + PDI, markEl: null };
}

module.exports = { render, CSS, ATTR, RLI, PDI };
