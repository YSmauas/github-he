'use strict';
/* נקודת כניסה: חיבור כל המודולים. */
const CFG = require('./config');
const { createStorage } = require('./storage');
const settingsLib = require('./settings');
const { Dictionary, LayeredDictionary } = require('./dictionary');
const { checkEntry } = require('./validate');
const { Collector } = require('./collector');
const { Engine } = require('./engine');
const updater = require('./updater');
const { createUI } = require('./ui');
const { registerMenu } = require('./menu');
const bundled = require('./bundled-dict');

const USER_DICT_KEY = 'ghe.userDict';

/** אוסף את פונקציות GM_* מהסביבה (Tampermonkey/Violentmonkey). */
function detectGM(g) {
  /* eslint-disable no-undef */
  return {
    getValue: typeof GM_getValue === 'function' ? GM_getValue : null,
    setValue: typeof GM_setValue === 'function' ? GM_setValue : null,
    deleteValue: typeof GM_deleteValue === 'function' ? GM_deleteValue : null,
    registerMenuCommand: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null,
    xmlHttpRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null,
    setClipboard: typeof GM_setClipboard === 'function' ? GM_setClipboard : null,
    unsafeWindow: typeof unsafeWindow !== 'undefined' ? unsafeWindow : g,
  };
  /* eslint-enable no-undef */
}

function fetchTextVia(gm) {
  return (url) => new Promise((resolve, reject) => {
    if (!gm.xmlHttpRequest) { reject(new Error('GM_xmlhttpRequest לא זמין')); return; }
    gm.xmlHttpRequest({
      method: 'GET', url, timeout: CFG.UPDATE_TIMEOUT_MS, responseType: 'text',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(String(r.responseText || '')) : reject(new Error('HTTP ' + r.status))),
      onerror: () => reject(new Error('שגיאת רשת')),
      ontimeout: () => reject(new Error('תם הזמן')),
    });
  });
}

function run({ win, gm }) {
  const doc = win.document;
  const storage = createStorage(gm);
  const settings = settingsLib.load(storage);
  const cache = storage.get(updater.CACHE_KEY, null);
  const mainData = updater.pickDictionary(bundled, cache);
  const userMap = storage.get(USER_DICT_KEY, null);
  let currentBuilt = mainData.meta.built;
  let source = mainData === bundled ? 'מובנה' : 'עדכון מהמאגר';

  const buildDict = (data) => {
    const layers = [];
    if (userMap && Object.keys(userMap).length) layers.push(new Dictionary({ meta: {}, strings: userMap }));
    layers.push(new Dictionary(data));
    return new LayeredDictionary(layers);
  };
  let dict = buildDict(mainData);
  const collector = new Collector({ storage });
  const engine = new Engine({ win, dict, rtlMode: settings.rtl, collector, collect: settings.collect });

  const copy = (text) => {
    if (gm.setClipboard) { gm.setClipboard(text); return; }
    if (win.navigator && win.navigator.clipboard) win.navigator.clipboard.writeText(text).catch(() => {});
  };
  const download = (name, text) => {
    const blob = new win.Blob([text], { type: 'application/json;charset=utf-8' });
    const url = win.URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    (doc.body || doc.documentElement).appendChild(a);
    a.click();
    win.setTimeout(() => { a.remove(); win.URL.revokeObjectURL(url); }, 1500);
  };

  async function updateNow(force = true) {
    const res = await updater.checkForUpdate({ fetchText: fetchTextVia(gm), storage, currentBuilt }, { force });
    if (res.status === 'updated') {
      currentBuilt = res.built; source = 'עדכון מהמאגר';
      dict = buildDict(res.dict);
      engine.setDictionary(dict);
    }
    return res;
  }

  const actions = {
    exportFile() {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const data = collector.buildExport();
      if (!data.count) { win.alert('אין עדיין מחרוזות מוכנות לייצוא (נדרשות כמה הופעות ב-2 סוגי עמודים לפחות).'); return; }
      download(`github-he-collected-${stamp}.json`, JSON.stringify(data, null, 1));
    },
    async updateNow() {
      const res = await updateNow(true);
      const msg = { updated: `המילון עודכן (${res.built}).`, current: 'המילון כבר מעודכן.', error: `העדכון נכשל: ${res.error}`, skipped: 'דולג.' }[res.status];
      win.alert(msg);
    },
    importUserDict() {
      const input = doc.createElement('input');
      input.type = 'file'; input.accept = 'application/json,.json';
      input.addEventListener('change', async () => {
        try {
          const data = JSON.parse(await input.files[0].text());
          const src = data && data.strings ? data.strings : data;
          const ok = {}; let bad = 0;
          for (const [en, he] of Object.entries(src || {})) { if (checkEntry(en, he).length) bad++; else ok[en] = he; }
          storage.set(USER_DICT_KEY, ok);
          win.alert(`יובאו ${Object.keys(ok).length} רשומות${bad ? ` (${bad} נדחו)` : ''}. הדף ייטען מחדש.`);
          win.location.reload();
        } catch (e) { win.alert('הקובץ אינו JSON תקין של מילון.'); }
      });
      input.click();
    },
  };

  const fetchFn = (...args) => win.fetch(...args);
  const ui = createUI({
    win, collector, copy,
    deps: { fetch: fetchFn, parseHtml: (html) => new win.DOMParser().parseFromString(html, 'text/html'), origin: win.location.origin || 'https://github.com' },
    getDictBuilt: () => currentBuilt,
    enabled: () => settings.enabled && settings.collect,
  });

  const status = () => {
    const st = engine.stats(); const cs = collector.stats();
    return [
      `github-he ${CFG.VERSION}`,
      `מילון: ${currentBuilt} · ${source} · ${dict.size} רשומות`,
      `תרגום: ${settings.enabled ? 'מופעל' : 'כבוי'} · כיווניות: ${settings.rtl}`,
      `בדף הזה: ${st.translated} תורגמו, ${st.untranslated} לא תורגמו (כיסוי ${st.coverage}%)`,
      `איסוף: ${settings.collect ? 'מופעל' : 'כבוי'} · במעקב ${cs.tracked}, מוכנים לשליחה ${cs.ready}, נשלחו ${cs.sent}`,
      `עדכון אוטומטי: ${settings.autoUpdate ? 'מופעל' : 'כבוי'}`,
    ].join('\n');
  };

  registerMenu({ gm, win, storage, settings, collector, ui, actions, status });

  const api = {
    version: CFG.VERSION,
    stats: () => engine.stats(),
    untranslated: (n) => engine.untranslated(n),
    reload: () => engine.scanAll(),
    status, updateNow, collector, engine, ui, settings, get dict() { return dict; },
  };
  const exposeTo = gm.unsafeWindow || win;
  try { exposeTo.GHE = api; } catch (_) { /* */ }

  if (settings.enabled) {
    engine.start();
    const onReady = () => { ui.refresh(); ui.startBadgeLoop(); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', onReady, { once: true }); else onReady();
    if (settings.autoUpdate) win.setTimeout(() => { updateNow(false).catch(() => {}); }, CFG.UPDATE_DELAY_MS);
  }
  return api;
}

function start() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return run({ win: g, gm: detectGM(g) });
}

module.exports = { run, start, detectGM };
