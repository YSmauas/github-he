'use strict';
/* מעטפת מעל GM_getValue/GM_setValue עם JSON וגיבוי בזיכרון (לבדיקות). */

function createStorage(gm) {
  const mem = new Map();
  const hasGM = gm && typeof gm.getValue === 'function' && typeof gm.setValue === 'function';
  return {
    get(key, fallback) {
      try {
        const raw = hasGM ? gm.getValue(key, undefined) : mem.get(key);
        if (raw === undefined || raw === null) return fallback;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) { return fallback; }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try { if (hasGM) gm.setValue(key, raw); else mem.set(key, raw); } catch (_) { /* מכסה מלאה וכד' */ }
    },
    remove(key) {
      try { if (hasGM && gm.deleteValue) gm.deleteValue(key); else mem.delete(key); } catch (_) { /* */ }
    },
  };
}

module.exports = { createStorage };
