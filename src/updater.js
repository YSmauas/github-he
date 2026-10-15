'use strict';
/* עדכון אוטומטי של המילון מהמאגר (המילון בלבד — הקוד מתעדכן דרך Tampermonkey). */
const CFG = require('./config');
const { validateDict } = require('./validate');

const CACHE_KEY = 'ghe.dictCache';
const CHECK_KEY = 'ghe.lastCheck';

const builtMs = (d) => Date.parse(d && d.meta && d.meta.built) || 0;
const isNewer = (a, b) => builtMs(a) > builtMs(b);

/** בוחר בין המילון המובנה למילון שבמטמון — הטרי יותר מנצח. */
function pickDictionary(bundled, cache) {
  if (cache && cache.data && cache.data.meta && isNewer(cache.data, bundled)) return cache.data;
  return bundled;
}

function parseRemote(text) {
  if (typeof text !== 'string' || text.length === 0) throw new Error('תגובה ריקה');
  if (text.length > CFG.MAX_DICT_BYTES) throw new Error('המילון גדול מדי');
  let data;
  try { data = JSON.parse(text); } catch (_) { throw new Error('JSON לא תקין'); }
  const v = validateDict(data, { strict: false });
  if (!v.ok) throw new Error(v.errors.join('; ') || 'מילון לא תקין');
  if (v.clean.meta.count < 50) throw new Error('המילון קטן באופן חשוד');
  return { clean: v.clean, warnings: v.warnings };
}

/**
 * בודק עדכון. deps: { fetchText(url) → Promise<string>, storage, now(), currentBuilt }
 * opts: { force, intervalMs }
 */
async function checkForUpdate(deps, opts = {}) {
  const { fetchText, storage } = deps;
  const now = (deps.now || Date.now)();
  const interval = opts.intervalMs != null ? opts.intervalMs : CFG.UPDATE_INTERVAL_MS;
  const last = storage.get(CHECK_KEY, 0);
  if (!opts.force && now - last < interval) return { status: 'skipped' };
  storage.set(CHECK_KEY, now); // גם בכישלון — כדי לא להציף ניסיונות
  let lastErr = null;
  for (const url of CFG.DICT_URLS) {
    try {
      const text = await fetchText(url);
      const { clean, warnings } = parseRemote(text);
      const current = deps.currentBuilt ? { meta: { built: deps.currentBuilt } } : null;
      if (current && !isNewer(clean, current)) return { status: 'current', built: clean.meta.built, url };
      storage.set(CACHE_KEY, { fetchedAt: new Date(now).toISOString(), url, data: clean });
      return { status: 'updated', dict: clean, built: clean.meta.built, warnings, url };
    } catch (e) { lastErr = e; }
  }
  return { status: 'error', error: lastErr ? String(lastErr.message || lastErr) : 'unknown' };
}

module.exports = { checkForUpdate, pickDictionary, parseRemote, isNewer, CACHE_KEY, CHECK_KEY };
