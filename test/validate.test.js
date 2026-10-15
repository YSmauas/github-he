'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEntry, validateDict } = require('../src/validate');

const ok = (en, he) => assert.deepEqual(checkEntry(en, he), []);
const bad = (en, he, re) => assert.ok(checkEntry(en, he).some((e) => re.test(e)), `${en} → ${he}`);

test('רשומה תקינה', () => { ok('Sign in', 'כניסה'); ok('{n} commits', '{n} commits'); });
test('ערך ריק', () => bad('Sign in', '', /ריק/));
test('placeholders לא תואמים', () => { bad('{n} commits', 'commits', /placeholders/); bad('A {1} {2}', 'א {1}', /placeholders/); });
test('כתובת/HTML בערך אסורים', () => {
  bad('Help', 'עזרה https://evil.example', /כתובת/);
  bad('Help', 'עזרה <b>x</b>', /כתובת/);
  bad('Help', 'javascript:alert(1)', /כתובת/);
});
test('כתובת מותרת אם קיימת גם במקור', () => ok('See https://x.y', 'ראו https://x.y'));
test('תווי כיוון אסורים בערך', () => bad('Help', '\u2067עזרה\u2069', /כיוון/));
test('תווי בקרה', () => bad('Help', 'עזרה\u0007', /בקרה/));
test('רווחים בקצה', () => bad('Help', 'עזרה ', /רווחים/));
test('ערך ארוך מדי', () => bad('Help', 'א'.repeat(401), /ארוך/));
test('תבנית בלי טקסט קבוע', () => bad('{1}', '{1}', /תבנית בלי טקסט/));

const good = { meta: { schema: 1, built: '2026-10-12T00:00:00.000Z' }, strings: { 'Sign in': 'כניסה' } };
test('validateDict: תקין', () => assert.equal(validateDict(good, { strict: true }).ok, true));
test('validateDict: schema חדש מדי נדחה', () => assert.equal(validateDict({ ...good, meta: { ...good.meta, schema: 99 } }).ok, false));
test('validateDict: built חסר → שגיאה', () => assert.equal(validateDict({ meta: { schema: 1 }, strings: {} }).ok, false));
test('validateDict: לא-strict זורק רשומה פגומה ושומר את השאר', () => {
  const r = validateDict({ ...good, strings: { 'Sign in': 'כניסה', Bad: 'x https://evil.example' } });
  assert.equal(r.ok, true); assert.equal(r.clean.strings.Bad, undefined); assert.equal(r.clean.strings['Sign in'], 'כניסה'); assert.equal(r.warnings.length, 1);
});
test('validateDict: strict נכשל על רשומה פגומה', () => {
  assert.equal(validateDict({ ...good, strings: { Bad: 'x https://evil.example' } }, { strict: true }).ok, false);
});
test('validateDict: scoped עם regex שבור נדחה', () => {
  const r = validateDict({ ...good, scoped: [{ en: 'Open', he: 'פתוח', scope: { path: '(' } }] }, { strict: true });
  assert.equal(r.ok, false);
});
test('validateDict: לא אובייקט', () => assert.equal(validateDict([]).ok, false));
