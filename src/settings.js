'use strict';
/* הגדרות משתמש. שינוי הגדרה דורש רענון הדף. */
const KEY = 'ghe.settings';
const DEFAULTS = { enabled: true, collect: false, rtl: 'auto', autoUpdate: true };
const RTL_MODES = ['auto', 'css', 'isolate', 'off'];

function load(storage) {
  const s = Object.assign({}, DEFAULTS, storage.get(KEY, {}) || {});
  if (!RTL_MODES.includes(s.rtl)) s.rtl = 'auto';
  return s;
}
function save(storage, s) { storage.set(KEY, s); }
function nextRtl(mode) { return RTL_MODES[(RTL_MODES.indexOf(mode) + 1) % RTL_MODES.length]; }

module.exports = { load, save, nextRtl, DEFAULTS, RTL_MODES, KEY };
