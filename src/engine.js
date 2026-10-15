'use strict';
/*
 * מנוע ההחלפה: סורק את ה-DOM, מחליף nodeValue/תכונות לפי המילון, ומעביר
 * מחרוזות לא מתורגמות לאוסף. משנה רק ערכים — לא מחליף ולא עוטף צמתים.
 */
const CFG = require('./config');
const { splitWhitespace, normalizeKey, hasLatin, hasHebrew } = require('./normalize');
const { skipSubtree, insideContent, hasSkipTagAncestor, textNodeSkipped, CONTENT_SELECTOR, SKIP_TAGS } = require('./skip');
const rtl = require('./rtl');

const TEXT_ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-disable-with', 'data-confirm'];
const VALUE_TYPES = new Set(['submit', 'button', 'reset']);
const ATTR_SELECTOR = TEXT_ATTRS.map((a) => `[${a}]`).join(',') + ',input[type=submit],input[type=button],input[type=reset]';
const WRAP_ATTRS = new Set(['placeholder', 'title']);
const NAV_EVENTS = ['turbo:render', 'turbo:load', 'soft-nav:end', 'pjax:end', 'popstate'];
const FILTER = { ACCEPT: 1, REJECT: 2, SKIP: 3 };
const SHOW_ELEMENT = 0x1;
const SHOW_TEXT = 0x4;

class Engine {
  constructor({ win, dict, rtlMode = 'auto', collector = null, collect = false }) {
    this.win = win;
    this.doc = win.document;
    this.dict = dict;
    this.rtlMode = rtlMode;
    this.collector = collector;
    this.collect = !!(collect && collector);
    this.done = new WeakMap();      // Text → { out }
    this.attrDone = new WeakMap();  // Element → { attr: out }
    this.shadowSeen = new WeakSet();
    this.unknownNodes = new WeakSet();
    this.unknown = new Map();       // טקסט → כמות (לדף הנוכחי)
    this.translated = 0;
    this.unknownCount = 0;
    this.queue = new Set();
    this.timer = null;
    this.observer = null;
    this.started = false;
    this._onNav = () => this.scanAll();
    this._onVisit = () => this.resetPageStats();
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.ensureStyle();
    this.observer = new this.win.MutationObserver((recs) => this.onMutations(recs));
    this.observer.observe(this.doc, this.observerConfig());
    this.enqueue(this.doc.documentElement);
    this.flush();
    if (this.doc.readyState === 'loading') {
      this.doc.addEventListener('DOMContentLoaded', () => { this.ensureStyle(); this.scanAll(); }, { once: true });
    }
    this.win.addEventListener('load', () => this.scanAll(), { once: true });
    for (const ev of NAV_EVENTS) this.doc.addEventListener(ev, this._onNav);
    for (const ev of ['turbo:visit', 'soft-nav:start', 'pjax:start']) this.doc.addEventListener(ev, this._onVisit);
  }

  stop() {
    if (this.observer) this.observer.disconnect();
    for (const ev of NAV_EVENTS) this.doc.removeEventListener(ev, this._onNav);
    for (const ev of ['turbo:visit', 'soft-nav:start', 'pjax:start']) this.doc.removeEventListener(ev, this._onVisit);
    this.started = false;
  }

  observerConfig() {
    return {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: TEXT_ATTRS.concat(['value']),
    };
  }

  /** מוסיף את ה-CSS של הכיווניות. ב-document-start עדיין ייתכן שאין documentElement — מנסים שוב מאוחר יותר. */
  ensureStyle() {
    if (this.styleEl && this.styleEl.isConnected) return;
    if (this.rtlMode === 'off' || this.rtlMode === 'isolate') return;
    const parent = this.doc.head || this.doc.documentElement;
    if (!parent) return;
    const st = this.doc.createElement('style');
    st.setAttribute('data-ghe-skip', '');
    st.textContent = rtl.CSS;
    parent.appendChild(st);
    this.styleEl = st;
  }

  setDictionary(dict) { this.dict = dict; this.scanAll(); }

  scanAll() { this.enqueue(this.doc.documentElement); this.flush(); }

  resetPageStats() { this.unknown = new Map(); this.unknownNodes = new WeakSet(); this.unknownCount = 0; this.translated = 0; }

  enqueue(node) { if (node) this.queue.add(node); }

  onMutations(records) {
    this.ensureStyle();
    for (const r of records) {
      if (r.type === 'childList') {
        for (const n of r.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) this.enqueue(n);
      } else if (r.type === 'characterData') {
        if (r.target.nodeType === 3) this.enqueue(r.target);
      } else if (r.type === 'attributes') {
        this.processAttrs(r.target, r.attributeName);
      }
    }
    this.flush();
  }

  flush() {
    const t0 = this.win.performance.now();
    for (const n of this.queue) {
      this.queue.delete(n);
      try { this.processNode(n); } catch (e) { /* לא מפילים את הדף בגלל תרגום */ }
      if (this.win.performance.now() - t0 > CFG.ENGINE.frameBudgetMs) break;
    }
    if (this.queue.size && !this.timer) {
      this.timer = this.win.setTimeout(() => { this.timer = null; this.flush(); }, 0);
    }
  }

  processNode(n) {
    if (!n.isConnected) return;
    if (n.nodeType === 3) { this.processText(n); return; }
    if (n.nodeType === 1) { this.processTree(n); return; }
    if (n.nodeType === 11) for (const c of n.childNodes) this.enqueue(c);
  }

  /** בעת טעינת הדף ה-parser עשוי להמשיך להוסיף טקסט לצומת האחרון — מחכים. */
  isStreaming(node) {
    if (this.doc.readyState !== 'loading') return false;
    let cur = node;
    while (cur && cur !== this.doc.documentElement) {
      if (cur.nextSibling) return false;
      cur = cur.parentNode;
    }
    return true;
  }

  processTree(root) {
    if (root.parentElement && (insideContent(root.parentElement) || hasSkipTagAncestor(root.parentElement))) return;
    let contentRoot = false;
    try { contentRoot = root.matches(CONTENT_SELECTOR); } catch (_) { /* */ }
    if (contentRoot) return;
    if (root.shadowRoot) this.observeShadow(root.shadowRoot);
    const tag = String(root.tagName).toUpperCase();
    if (SKIP_TAGS.has(tag)) { this.processAttrs(root); return; }
    const walker = this.doc.createTreeWalker(root, SHOW_ELEMENT | SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.nodeType === 1) {
          if (skipSubtree(node)) return FILTER.REJECT;
          if (node.shadowRoot) this.observeShadow(node.shadowRoot);
          return FILTER.SKIP;
        }
        const v = node.nodeValue;
        return v && /\S/.test(v) ? FILTER.ACCEPT : FILTER.REJECT;
      },
    });
    let node;
    while ((node = walker.nextNode())) this.processText(node, true);
    // תכונות: על השורש ועל כל הצאצאים הרלוונטיים
    this.processAttrs(root);
    if (root.querySelectorAll) for (const el of root.querySelectorAll(ATTR_SELECTOR)) this.processAttrs(el);
  }

  observeShadow(sr) {
    if (this.shadowSeen.has(sr)) return;
    this.shadowSeen.add(sr);
    this.observer.observe(sr, this.observerConfig());
    for (const c of sr.childNodes) this.enqueue(c);
  }

  processText(node, treeChecked = false) {
    const raw = node.nodeValue;
    if (!raw || !/\S/.test(raw)) return;
    const rec = this.done.get(node);
    if (rec && rec.out === raw) return;
    const parent = node.parentElement;
    if (!parent) return;
    if (!treeChecked && textNodeSkipped(node)) return;
    if (this.isStreaming(node)) return;
    const { lead, core, trail } = splitWhitespace(raw);
    const key = normalizeKey(core);
    if (key.length < 2 || key.length > CFG.ENGINE.maxTextLen) return;
    if (!hasLatin(key) || hasHebrew(key)) return;
    if (String(parent.tagName).toUpperCase() === 'TITLE') { this.processTitle(node, lead, key, trail); return; }
    const he = this.dict.lookup(key, { path: this.win.location.pathname, el: parent });
    if (he === null) { this.noteUnknown(key, 'text', node, parent); return; }
    if (he === key) return;
    const r = rtl.render(node, he, this.rtlMode);
    const out = lead + r.text + trail;
    node.nodeValue = out;
    this.done.set(node, { out });
    if (r.markEl) r.markEl.setAttribute(rtl.ATTR, '1');
    this.translated++;
  }

  processTitle(node, lead, key, trail) {
    const parts = key.split(/( · | - | — )/);
    let changed = false;
    const out = parts.map((p, i) => {
      if (i % 2 === 1) return p;
      const he = this.dict.lookup(normalizeKey(p), { path: this.win.location.pathname, el: node.parentElement });
      if (he !== null && he !== p) { changed = true; return he; }
      return p;
    }).join('');
    if (!changed) return;
    const val = lead + out + trail;
    node.nodeValue = val;
    this.done.set(node, { out: val });
    this.translated++;
  }

  processAttrs(el, only) {
    if (!el || el.nodeType !== 1 || !el.getAttribute) return;
    if (insideContent(el)) return;
    const list = only ? [only] : TEXT_ATTRS.concat(['value']);
    for (const a of list) {
      if (a === 'value') {
        const isBtn = String(el.tagName).toUpperCase() === 'INPUT' && VALUE_TYPES.has(String(el.type || '').toLowerCase());
        if (!isBtn) continue;
      }
      const v = el.getAttribute(a);
      if (!v || !/\S/.test(v)) continue;
      let rec = this.attrDone.get(el);
      if (rec && rec[a] === v) continue;
      const key = normalizeKey(v);
      if (!hasLatin(key) || hasHebrew(key) || key.length > CFG.ENGINE.maxTextLen) continue;
      const he = this.dict.lookup(key, { path: this.win.location.pathname, el });
      if (he === null) { this.noteUnknown(key, 'attr:' + a, el, el); continue; }
      if (he === key) continue;
      const mixed = hasHebrew(he) && hasLatin(he);
      const out = WRAP_ATTRS.has(a) && mixed ? rtl.RLI + he + rtl.PDI : he;
      el.setAttribute(a, out);
      if (!rec) { rec = {}; this.attrDone.set(el, rec); }
      rec[a] = out;
      this.translated++;
    }
  }

  noteUnknown(key, kind, node, parent) {
    if (!this.unknownNodes.has(node)) {
      this.unknownNodes.add(node);
      this.unknownCount++;
    }
    this.unknown.set(key, (this.unknown.get(key) || 0) + 1);
    if (this.collect) this.collector.note(key, kind, node, parent, this.win.location.pathname);
  }

  /** לדיבוג: GHE.stats() */
  stats() {
    const total = this.translated + this.unknownCount;
    return {
      translated: this.translated,
      untranslated: this.unknownCount,
      coverage: total ? Math.round((this.translated / total) * 1000) / 10 : 0,
      dictionarySize: this.dict.size,
    };
  }

  untranslated(limit = 100) {
    return [...this.unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  }
}

module.exports = { Engine, TEXT_ATTRS };
