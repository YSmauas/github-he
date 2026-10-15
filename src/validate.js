'use strict';
/* ולידציה של מילון — משותפת לסקריפט (עדכון מרחוק) ולכלי הבנייה/CI. */
const { placeholders } = require('./normalize');
const CFG = require('./config');

const URL_OR_HTML = /(https?:\/\/|www\.|javascript:|data:text|<\s*\/?\s*[a-z][^>]*>|&#?\w+;)/i;
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f\u2028\u2029]/;

/**
 * בודק רשומה בודדת. מחזיר מערך שגיאות (ריק אם תקין).
 */
function checkEntry(en, he) {
  const errs = [];
  if (typeof en !== 'string' || typeof he !== 'string') return ['המפתח או הערך אינם מחרוזת'];
  if (!en.trim()) errs.push('מפתח ריק');
  if (!he.trim()) errs.push('ערך ריק');
  if (en.length > CFG.LIMITS.maxKey) errs.push(`מפתח ארוך מדי (${en.length})`);
  if (he.length > CFG.LIMITS.maxValue) errs.push(`ערך ארוך מדי (${he.length})`);
  if (CONTROL_CHARS.test(en) || CONTROL_CHARS.test(he)) errs.push('תווי בקרה אסורים');
  if (BIDI.test(he)) errs.push('תווי כיוון אסורים בערך (הסקריפט מוסיף אותם בעצמו)');
  if (URL_OR_HTML.test(he) && !URL_OR_HTML.test(en)) errs.push('הערך מכיל כתובת/HTML שאינם במקור');
  const a = placeholders(en).join(','), b = placeholders(he).join(',');
  if (a !== b) errs.push(`placeholders לא תואמים: ${a || '-'} ≠ ${b || '-'}`);
  if (en !== en.trim() || he !== he.trim()) errs.push('רווחים בקצה');
  if (/\{(?:n|\d+)\}/.test(en) && !/[A-Za-z]{2,}/.test(en.replace(/\{(?:n|\d+)\}/g, ''))) errs.push('תבנית בלי טקסט קבוע');
  return errs;
}

/**
 * בודק ומנקה אובייקט מילון. strict=true — כל שגיאה נכשלת (CI);
 * strict=false — רשומות פגומות נזרקות והשאר נשמר (עדכון בזמן ריצה).
 */
function validateDict(data, { strict = false } = {}) {
  const errors = [], warnings = [];
  const clean = { meta: {}, strings: {}, scoped: [] };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['המילון אינו אובייקט'], warnings, clean };
  const meta = data.meta || {};
  if (typeof meta.schema !== 'number' || meta.schema > CFG.SCHEMA) {
    return { ok: false, errors: [`schema לא נתמך: ${meta.schema} (נתמך עד ${CFG.SCHEMA})`], warnings, clean };
  }
  if (typeof meta.built !== 'string' || Number.isNaN(Date.parse(meta.built))) errors.push('meta.built חסר או לא תקין');
  clean.meta = { lang: String(meta.lang || 'he'), schema: meta.schema, built: String(meta.built || ''), count: 0, rev: Number(meta.rev) || 0 };
  const strings = data.strings && typeof data.strings === 'object' ? data.strings : {};
  const keys = Object.keys(strings);
  if (keys.length > CFG.LIMITS.maxEntries) errors.push(`יותר מדי רשומות (${keys.length})`);
  for (const en of keys.slice(0, CFG.LIMITS.maxEntries)) {
    const e = checkEntry(en, strings[en]);
    if (e.length) { (strict ? errors : warnings).push(`"${en}": ${e.join('; ')}`); continue; }
    clean.strings[en] = strings[en];
  }
  const scoped = Array.isArray(data.scoped) ? data.scoped : [];
  for (const s of scoped.slice(0, 2000)) {
    const e = s && typeof s === 'object' ? checkEntry(s.en, s.he) : ['רשומה לא תקינה'];
    const sc = s && s.scope;
    if (!sc || (typeof sc.path !== 'string' && typeof sc.selector !== 'string')) e.push('scope חסר');
    if (sc && typeof sc.path === 'string') { try { new RegExp(sc.path); } catch (_) { e.push('scope.path אינו regex תקין'); } }
    if (e.length) { (strict ? errors : warnings).push(`scoped "${s && s.en}": ${e.join('; ')}`); continue; }
    clean.scoped.push({ en: s.en, he: s.he, scope: { path: sc.path, selector: sc.selector } });
  }
  clean.meta.count = Object.keys(clean.strings).length + clean.scoped.length;
  return { ok: errors.length === 0, errors, warnings, clean };
}

module.exports = { checkEntry, validateDict };
