// פונקציות משותפות לכלי הבנייה.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
export const validate = require('../src/validate.js');
export const normalize = require('../src/normalize.js');
export const CFG = require('../src/config.js');

export const readJson = (p, fallback) => {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
};

/** כתיבת מילון: meta ואז רשומה בכל שורה (דיפים קריאים ב-git). */
export function stringifyDict(d) {
  const lines = ['{', `"meta": ${JSON.stringify(d.meta)},`, '"strings": {'];
  const keys = Object.keys(d.strings).sort((a, b) => a.localeCompare(b, 'en'));
  keys.forEach((k, i) => lines.push(`${JSON.stringify(k)}: ${JSON.stringify(d.strings[k])}${i < keys.length - 1 ? ',' : ''}`));
  lines.push('},', `"scoped": ${JSON.stringify(d.scoped || [])}`, '}');
  return lines.join('\n') + '\n';
}

/** טוען את מקורות המילון לפי סדר עדיפות עולה: seed < reviewed < manual. */
export function loadSources() {
  return [
    { name: 'seed-app', strict: false, stripBidi: true, data: readJson('dict/sources/seed-app.json', {}) },
    { name: 'reviewed', strict: true, data: readJson('dict/sources/reviewed.json', {}) },
    { name: 'manual', strict: true, data: readJson('dict/sources/manual.json', {}) },
  ];
}

/** ממזג מקורות, בודק כל רשומה. מחזיר { strings, errors, warnings, stats }. */
export function mergeSources(sources) {
  const strings = {}; const errors = []; const warnings = []; const stats = {};
  for (const src of sources) {
    let n = 0;
    for (const [rawEn, rawHe] of Object.entries(src.data)) {
      const en = normalize.normalizeKey(rawEn);
      const he = src.stripBidi ? rawHe.replace(normalize.BIDI_CONTROLS, '').trim() : rawHe;
      const errs = validate.checkEntry(en, he);
      if (errs.length) {
        (src.strict ? errors : warnings).push(`[${src.name}] "${rawEn}": ${errs.join('; ')}`);
        continue;
      }
      strings[en] = he; n++;
    }
    stats[src.name] = n;
  }
  return { strings, errors, warnings, stats };
}
