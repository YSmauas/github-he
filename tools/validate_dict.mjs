// בודק את מקורות המילון ואת dict/he.json (ל-CI).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, loadSources, mergeSources, validate } from './lib.mjs';

let failed = false;
const { errors, warnings, stats } = mergeSources(loadSources());
console.log('מקורות:', stats);
if (warnings.length) console.warn(`${warnings.length} אזהרות בזרע (נדחות בבנייה). דוגמאות:\n  ` + warnings.slice(0, 5).join('\n  '));
if (errors.length) { failed = true; console.error(`שגיאות (${errors.length}):\n  ` + errors.slice(0, 50).join('\n  ')); }

// התראת אורך (לא כישלון)
const long = [];
for (const s of loadSources().filter((x) => x.strict)) for (const [en, he] of Object.entries(s.data)) if (he.length > en.length * 2.5 + 10) long.push(`${en} → ${he}`);
if (long.length) console.warn(`התראה: ${long.length} תרגומים ארוכים מפי 2.5 מהמקור:\n  ` + long.slice(0, 10).join('\n  '));

const built = path.join(ROOT, 'dict/he.json');
if (fs.existsSync(built)) {
  const r = validate.validateDict(readJson('dict/he.json'), { strict: true });
  if (!r.ok) { failed = true; console.error('dict/he.json לא תקין:\n  ' + r.errors.slice(0, 20).join('\n  ')); }
  else console.log(`dict/he.json תקין (${r.clean.meta.count} רשומות)`);
}
process.exit(failed ? 1 : 0);
