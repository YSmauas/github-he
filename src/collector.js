'use strict';
/*
 * מצב איסוף: רושם מחרוזות ממשק שלא נמצא להן תרגום.
 * כל המידע נשמר מקומית. מחרוזת נחשבת "מוכנה" רק אחרי שנראתה מספיק פעמים
 * ובמספיק סוגי עמודים (הגנה על פרטיות — תוכן משתמשים בדרך כלל ייחודי).
 */
const CFG = require('./config');
const { templateize, hasHebrew, hasLatin } = require('./normalize');
const { classifyPath, hash32 } = require('./routes');

const STORE_KEY = 'ghe.collected';
const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d/i;

/** מחזיר את המחרוזת המנורמלת לאיסוף, או null אם אסור/לא כדאי לאסוף. */
function sanitize(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  if (s.length < CFG.COLLECT.minLen || s.length > CFG.COLLECT.maxLen) return null;
  if (!hasLatin(s) || hasHebrew(s)) return null;
  if (/https?:\/\/|www\.|\S+@\S+\.\S+/i.test(s)) return null;              // כתובות/אימיילים
  if (/^[a-f0-9]{7,40}$/i.test(s)) return null;                             // hash של commit
  if (/(^|\s)@[\w-]+/.test(s)) return null;                                 // אזכורי משתמשים
  if (/^[\w.-]+\/[\w.-]+(\/\S*)?$/.test(s)) return null;                    // owner/repo או נתיב
  if (/^[\w.-]+$/.test(s) && /^[a-z0-9_.-]+$/.test(s)) return null;         // טוקן באותיות קטנות (שם משתמש/branch)
  if (/\S\/\S/.test(s) && !/\s/.test(s)) return null;
  if (MONTHS.test(s)) return null;                                          // תאריכים מוחלטים
  s = templateize(s);
  if (!/[A-Za-z]{2,}/.test(s.replace(/\{n\}/g, ''))) return null;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (letters / s.length < 0.4) return null;
  return s;
}

class Collector {
  constructor({ storage, now, cfg } = {}) {
    this.storage = storage;
    this.cfg = Object.assign({}, CFG.COLLECT, cfg || {});
    this.now = now || (() => new Date());
    const saved = (storage && storage.get(STORE_KEY, null)) || {};
    this.items = new Map(Object.entries(saved.items || {}));
    this.sent = new Map(Object.entries(saved.sent || {}));
    this.dirty = false;
    this.timer = null;
    this.noted = new WeakMap(); // צומת → מפתח (מניעת ספירה כפולה של אותו צומת)
  }

  _key(kind, en) { return kind + '|' + en; }

  /**
   * רושם מחרוזת שלא תורגמה.
   * node — צומת/אלמנט (לתיוג מניעת כפילות), parentEl — לקבלת הקשר, pathname — נתיב נוכחי.
   */
  note(raw, kind, node, parentEl, pathname) {
    const en = sanitize(raw);
    if (!en) return false;
    const key = this._key(kind, en);
    if (node) {
      const prev = this.noted.get(node);
      if (prev === key) return false;
      this.noted.set(node, key);
    }
    if (this.sent.has(key)) return false;
    const route = classifyPath(pathname);
    let it = this.items.get(key);
    const today = this.now().toISOString().slice(0, 10);
    if (!it) {
      if (this.items.size >= this.cfg.maxStored) this._evict();
      it = { en, kind, seen: 0, pages: [], owners: [], repo: false, ctx: '', first: today, last: today };
      this.items.set(key, it);
    }
    it.seen += 1;
    it.last = today;
    if (!it.pages.includes(route.pattern) && it.pages.length < 12) it.pages.push(route.pattern);
    if (route.repoPage) {
      it.repo = true;
      const h = route.owner ? hash32(route.owner.toLowerCase()) : null;
      if (h && !it.owners.includes(h) && it.owners.length < 6) it.owners.push(h);
    }
    if (!it.ctx && parentEl) {
      const cls = (parentEl.classList && parentEl.classList[0]) || '';
      it.ctx = (parentEl.tagName || '') + (cls ? '.' + cls : '');
    }
    this._schedule();
    return true;
  }

  isReady(it) {
    if (it.seen < this.cfg.minSeen) return false;
    if (it.pages.length < this.cfg.minPatterns) return false;
    if (it.repo && it.owners.length < this.cfg.minOwnersForRepoPages) return false;
    return true;
  }

  ready() {
    const out = [];
    for (const it of this.items.values()) if (this.isReady(it)) out.push(it);
    return out.sort((a, b) => b.seen - a.seen || a.en.localeCompare(b.en));
  }

  stats() { return { tracked: this.items.size, ready: this.ready().length, sent: this.sent.size }; }

  /** מבנה הייצוא/שליחה. */
  buildExport(entries, meta) {
    const list = (entries || this.ready()).map((it) => ({
      en: it.en, kind: it.kind, seen: it.seen, pages: it.pages, ctx: it.ctx,
    }));
    return Object.assign({
      schema: 1, tool: 'github-he', exportedAt: this.now().toISOString(), count: list.length, entries: list,
    }, meta || {});
  }

  markSent(entries) {
    const today = this.now().toISOString().slice(0, 10);
    for (const it of entries) {
      const key = this._key(it.kind, it.en);
      this.items.delete(key);
      this.sent.set(key, today);
    }
    this._persist();
  }

  clear() { this.items.clear(); this._persist(true); }
  clearAll() { this.items.clear(); this.sent.clear(); this._persist(true); }

  _evict() {
    // מוחקים את הישנים עם הכי מעט הופעות
    const arr = [...this.items.entries()].sort((a, b) => a[1].seen - b[1].seen || String(a[1].last).localeCompare(String(b[1].last)));
    for (const [k] of arr.slice(0, Math.ceil(arr.length * 0.1))) this.items.delete(k);
  }

  _schedule() {
    this.dirty = true;
    if (this.timer || !this.storage) return;
    this.timer = setTimeout(() => { this.timer = null; this._persist(); }, this.cfg.flushDelayMs);
  }

  /** כתיבה לאחסון. כברירת מחדל ממזגים מול מה שנכתב מלשוניות אחרות; replace=true — דורסים. */
  _persist(replace = false) {
    if (!this.storage) return;
    const sent = Object.fromEntries(this.sent);
    let items;
    if (replace) {
      items = Object.fromEntries(this.items);
    } else {
      const stored = this.storage.get(STORE_KEY, null) || { items: {}, sent: {} };
      Object.assign(sent, stored.sent || {});
      const merged = new Map(Object.entries(stored.items || {}));
      for (const [k, v] of this.items) {
        const o = merged.get(k);
        merged.set(k, !o ? v : {
          ...v,
          seen: Math.max(o.seen || 0, v.seen),
          pages: [...new Set([...(o.pages || []), ...v.pages])].slice(0, 12),
          owners: [...new Set([...(o.owners || []), ...v.owners])].slice(0, 6),
          repo: !!(o.repo || v.repo),
        });
      }
      for (const k of Object.keys(sent)) merged.delete(k);
      items = Object.fromEntries(merged);
    }
    this.storage.set(STORE_KEY, { items, sent });
    this.dirty = false;
  }

  flush() { if (this.dirty || this.timer) { if (this.timer) { clearTimeout(this.timer); this.timer = null; } this._persist(); } }
}

module.exports = { Collector, sanitize, STORE_KEY };
