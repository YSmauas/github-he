// בונה: dict/he.json + dist/github-he.user.js + dist/github-he.meta.js
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, loadSources, mergeSources, stringifyDict, validate } from './lib.mjs';

const pkg = readJson('package.json');
const SRC = path.join(ROOT, 'src');

// ---- 1. מילון
const { strings, errors, warnings, stats } = mergeSources(loadSources());
if (warnings.length) console.warn(`אזהרות (${warnings.length}) — רשומות זרע שנדחו:\n  ` + warnings.slice(0, 10).join('\n  ') + (warnings.length > 10 ? '\n  …' : ''));
if (errors.length) {
  console.error(`שגיאות במילון (${errors.length}):\n  ` + errors.join('\n  '));
  process.exit(1);
}
const prev = readJson('dict/he.json', { meta: { rev: 0 }, strings: null, scoped: [] });
const scoped = readJson('dict/sources/scoped.json', []);
// אם התוכן לא השתנה — משאירים built/rev כמו שהיו, כדי שלקוחות לא יורידו מילון זהה ושה-CI לא יצור קומיטים מיותרים
const canon = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
const unchanged = !!prev.strings && canon(prev.strings) === canon(strings) && JSON.stringify(prev.scoped || []) === JSON.stringify(scoped);
const dict = {
  meta: {
    lang: 'he', schema: 1,
    built: unchanged ? prev.meta.built : new Date().toISOString(),
    version: pkg.version, count: Object.keys(strings).length,
    rev: unchanged ? prev.meta.rev : (prev.meta.rev || 0) + 1,
  },
  strings, scoped,
};
const check = validate.validateDict(dict, { strict: true });
if (!check.ok) { console.error('המילון שנוצר אינו תקין:\n  ' + check.errors.join('\n  ')); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'dict/he.json'), stringifyDict(dict));
console.log(`dict/he.json${unchanged ? ' (ללא שינוי)' : ''}: ${dict.meta.count} רשומות (${Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(', ')})`);

// ---- 2. חבילה (CommonJS קטן ללא תלויות)
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
const modules = {};
for (const f of files) {
  const name = f.replace(/\.js$/, '');
  let code = fs.readFileSync(path.join(SRC, f), 'utf8');
  if (name === 'config') code = code.replace('%%VERSION%%', pkg.version);
  if (name === 'bundled-dict') code = `'use strict';\nmodule.exports = ${JSON.stringify(dict)};\n`;
  modules[name] = code;
}
const defs = Object.entries(modules).map(([name, code]) =>
  `__d[${JSON.stringify(name)}] = function (module, exports, require) {\n${code}\n};`).join('\n');
const bundle = `(function () {
'use strict';
var __d = {}, __c = {};
function __r(p) {
  var k = String(p).replace(/^\\.\\//, '').replace(/\\.js$/, '');
  if (__c[k]) return __c[k].exports;
  if (!__d[k]) throw new Error('github-he: מודול חסר ' + k);
  var m = __c[k] = { exports: {} };
  __d[k].call(m.exports, m, m.exports, __r);
  return m.exports;
}
${defs}
__r('main').start();
})();
`;
const header = fs.readFileSync(path.join(SRC, 'meta.header.txt'), 'utf8').replace('%%VERSION%%', pkg.version);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/github-he.user.js'), header + '\n' + bundle);
fs.writeFileSync(path.join(ROOT, 'dist/github-he.meta.js'), header);
const kb = (fs.statSync(path.join(ROOT, 'dist/github-he.user.js')).size / 1024).toFixed(0);
console.log(`dist/github-he.user.js: ${kb}KB, גרסה ${pkg.version}`);
