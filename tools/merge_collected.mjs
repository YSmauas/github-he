// ממזג קבצי איסוף (JSON מייצוא, או גופי Issue שנשמרו כטקסט) לקובץ pending.json — אנגלית בלבד, לתרגום.
// שימוש: node tools/merge_collected.mjs file1.json issue-body.md ...
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJson, loadSources, mergeSources } from './lib.mjs';

const require = createRequire(import.meta.url);
const { Dictionary } = require('../src/dictionary.js');
const { sanitize } = require('../src/collector.js');
const { normalizeKey } = require('../src/normalize.js');

const files = process.argv.slice(2);
if (!files.length) { console.error('שימוש: node tools/merge_collected.mjs <קבצים...>'); process.exit(2); }

/** מחלץ אובייקטי איסוף מקובץ JSON או מטקסט Markdown עם בלוקי ```json */
function extract(text) {
  const out = [];
  const tryParse = (s) => { try { const o = JSON.parse(s); if (o && Array.isArray(o.entries)) out.push(o); } catch (_) { /* */ } };
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);
  if (blocks.length) blocks.forEach(tryParse); else tryParse(text);
  return out;
}

const merged = new Map();
let totalFiles = 0;
for (const f of files) {
  const payloads = extract(fs.readFileSync(f, 'utf8'));
  if (!payloads.length) { console.warn(`דילוג: ${f} (לא נמצא מבנה איסוף)`); continue; }
  totalFiles++;
  for (const p of payloads) for (const e of p.entries) {
    const en = sanitize(String(e.en || ''));          // סינון חוזר בצד המפתח — לא סומכים על הלקוח
    if (!en) continue;
    const key = (e.kind || 'text') + '|' + en;
    const cur = merged.get(key) || { en, kind: e.kind || 'text', seen: 0, pages: [], sources: 0 };
    cur.seen += Number(e.seen) || 1;
    cur.pages = [...new Set([...cur.pages, ...(e.pages || [])])].slice(0, 12);
    cur.sources += 1;
    merged.set(key, cur);
  }
}

// מסננים מה שכבר קיים במילון
const { strings } = mergeSources(loadSources());
const known = new Dictionary({ meta: {}, strings });
const pendingPath = 'dict/sources/pending.json';
const pending = readJson(pendingPath, {});
let added = 0, skippedKnown = 0;
for (const it of [...merged.values()].sort((a, b) => b.seen - a.seen || a.en.localeCompare(b.en))) {
  if (known.lookup(normalizeKey(it.en)) !== null) { skippedKnown++; continue; }
  if (!(it.en in pending)) { pending[it.en] = ''; added++; }
}
fs.writeFileSync(path.join(ROOT, pendingPath), JSON.stringify(pending, null, 1) + '\n');
console.log(`נקראו ${totalFiles} קבצים · ${merged.size} מחרוזות ייחודיות · ${skippedKnown} כבר במילון · ${added} חדשות נוספו ל-${pendingPath}`);
console.log(`סה"כ ממתינות לתרגום: ${Object.values(pending).filter((v) => !v).length}`);
