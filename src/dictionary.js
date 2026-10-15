'use strict';
/* מילון: התאמה מדויקת, התאמה לפי הקשר (scoped) ותבניות עם {n}/{1}. */
const { normalizeKey, hasHebrew, hasLatin } = require('./normalize');

const NUM = '(\\d[\\d,]*(?:\\.\\d+)?[kKmM]?)';
const TXT = '(.+?)';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PH = /\{(n|\d+)\}/g;
const isTemplate = (s) => /\{(?:n|\d+)\}/.test(s);

function compileTemplate(en, he) {
  const names = [];
  let re = '';
  let last = 0;
  en.replace(PH, (m, name, idx) => {
    re += escapeRe(en.slice(last, idx)).replace(/ /g, '\\s+');
    re += name === 'n' ? NUM : TXT;
    names.push(name);
    last = idx + m.length;
    return m;
  });
  re += escapeRe(en.slice(last)).replace(/ /g, '\\s+');
  const words = (en.replace(PH, ' ').toLowerCase().match(/[a-z]{3,}/g) || []);
  const anchor = words.sort((a, b) => b.length - a.length)[0] || null;
  return { en, he, names, regex: new RegExp('^' + re + '$'), anchor, literal: en.replace(PH, '').length };
}

function fillTemplate(t, m) {
  const byName = {}; const nList = [];
  t.names.forEach((n, i) => {
    const v = m[i + 1];
    if (n === 'n') nList.push(v); else byName[n] = v;
  });
  let k = 0;
  return t.he.replace(PH, (_, n) => (n === 'n' ? (nList[k++] ?? '') : (byName[n] ?? '')));
}

class Dictionary {
  /** data: { meta, strings, scoped } (כבר עבר ולידציה) */
  constructor(data) {
    data = data || {};
    this.meta = data.meta || {};
    this.exact = new Map();
    this.templates = [];
    this.anchorIndex = new Map();
    this.anchorless = [];
    this.scoped = [];
    for (const [en, he] of Object.entries(data.strings || {})) {
      if (isTemplate(en)) this._addTemplate(en, he);
      else this.exact.set(normalizeKey(en), he);
    }
    for (const s of data.scoped || []) {
      this.scoped.push({
        en: normalizeKey(s.en), he: s.he,
        path: s.scope && s.scope.path ? new RegExp(s.scope.path) : null,
        selector: s.scope && s.scope.selector || null,
      });
    }
  }

  _addTemplate(en, he) {
    let t;
    try { t = compileTemplate(en, he); } catch (_) { return; }
    this.templates.push(t);
    if (t.anchor) {
      if (!this.anchorIndex.has(t.anchor)) this.anchorIndex.set(t.anchor, []);
      this.anchorIndex.get(t.anchor).push(t);
    } else this.anchorless.push(t);
  }

  get size() { return this.exact.size + this.templates.length + this.scoped.length; }

  /**
   * מחזיר את התרגום (מחרוזת) או null אם אין.
   * key חייב להיות מנורמל (normalizeKey). ctx = { path, el }.
   */
  lookup(key, ctx) {
    if (!key || !hasLatin(key) || hasHebrew(key)) return null;
    if (this.scoped.length) {
      for (const s of this.scoped) {
        if (s.en !== key) continue;
        if (s.path && !(ctx && s.path.test(ctx.path || ''))) continue;
        if (s.selector && !(ctx && ctx.el && ctx.el.closest && ctx.el.closest(s.selector))) continue;
        return s.he;
      }
    }
    const hit = this.exact.get(key);
    if (hit !== undefined) return hit;
    if (this.templates.length === 0) return null;
    const words = key.toLowerCase().match(/[a-z]{3,}/g) || [];
    const tried = new Set();
    for (const w of words) {
      const list = this.anchorIndex.get(w);
      if (!list) continue;
      for (const t of list) {
        if (tried.has(t)) continue;
        tried.add(t);
        const m = t.regex.exec(key);
        if (m) return fillTemplate(t, m);
      }
    }
    for (const t of this.anchorless) {
      const m = t.regex.exec(key);
      if (m) return fillTemplate(t, m);
    }
    return null;
  }

  has(key, ctx) { return this.lookup(key, ctx) !== null; }
}

/** מיזוג: ה-overlay גובר על ה-base (למילון אישי של המשתמש). */
class LayeredDictionary {
  constructor(layers) { this.layers = layers.filter(Boolean); }
  lookup(key, ctx) {
    for (const d of this.layers) { const r = d.lookup(key, ctx); if (r !== null) return r; }
    return null;
  }
  has(key, ctx) { return this.lookup(key, ctx) !== null; }
  get size() { return this.layers.reduce((a, d) => a + d.size, 0); }
  get meta() { return (this.layers[0] && this.layers[0].meta) || {}; }
}

module.exports = { Dictionary, LayeredDictionary, isTemplate, compileTemplate };
