'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Collector, sanitize } = require('../src/collector');
const { createStorage } = require('../src/storage');
const { classifyPath } = require('../src/routes');

test('sanitize: מחרוזת ממשק רגילה', () => assert.equal(sanitize('Create new file'), 'Create new file'));
test('sanitize: מספרים הופכים ל-{n}', () => { assert.equal(sanitize('12 comments'), '{n} comments'); assert.equal(sanitize('Issue #45 opened'), 'Issue #{n} opened'); });
test('sanitize: נדחים', () => {
  for (const s of ['https://github.com/x', 'a@b.com', 'octocat', 'owner/repo', 'src/index.js', 'main', 'a1b2c3d4e5f', '@someone said hi',
    'Oct 12, 2026', 'שלום world', 'x', '12345', '{n}']) assert.equal(sanitize(s), null, s);
  assert.equal(sanitize('A'.repeat(121)), null);
});
test('sanitize: אותיות לטיניות קטנות עם רווח נשמרות (משפט ממשק)', () => assert.equal(sanitize('no results found'), 'no results found'));

function mk() { const storage = createStorage(null); return { storage, c: new Collector({ storage, now: () => new Date('2026-10-12T10:00:00Z') }) }; }

test('סף: לא מוכן לפני 3 הופעות ו-2 תבניות עמוד', () => {
  const { c } = mk();
  c.note('Create new file', 'text', null, null, '/settings/profile');
  c.note('Create new file', 'text', null, null, '/settings/profile');
  c.note('Create new file', 'text', null, null, '/settings/profile');
  assert.equal(c.ready().length, 0);                       // 3 הופעות, עמוד אחד
  c.note('Create new file', 'text', null, null, '/notifications');
  assert.equal(c.ready().length, 1);
});
test('דפי repo: נדרשים 2 "בעלים" שונים', () => {
  const { c } = mk();
  for (const p of ['/a/x/issues', '/a/x/pulls', '/a/x/actions']) c.note('Some label', 'text', null, null, p);
  assert.equal(c.ready().length, 0);
  c.note('Some label', 'text', null, null, '/b/y/issues');
  assert.equal(c.ready().length, 1);
});
test('אותו צומת לא נספר פעמיים', () => {
  const { c } = mk(); const node = {};
  c.note('Create new file', 'text', node, null, '/a');
  c.note('Create new file', 'text', node, null, '/b');
  assert.equal([...c.items.values()][0].seen, 1);
});
test('כתובות אמיתיות לא נשמרות — רק תבניות', () => {
  const { c } = mk();
  c.note('Create new file', 'text', null, null, '/secret-org/private-repo/issues/42');
  const it = [...c.items.values()][0];
  assert.deepEqual(it.pages, ['/:owner/:repo/issues/:n']);
  assert.ok(!JSON.stringify(it).includes('secret-org'));
});
test('markSent מוחק ולא אוסף שוב', () => {
  const { c } = mk();
  for (const p of ['/settings/a', '/notifications', '/settings/b']) c.note('Create new file', 'text', null, null, p);
  const r = c.ready(); assert.equal(r.length, 1);
  c.markSent(r);
  assert.equal(c.ready().length, 0);
  c.note('Create new file', 'text', null, null, '/explore');
  assert.equal(c.items.size, 0);
});
test('קביעות בין לשוניות: מיזוג ושמירת sent', () => {
  const storage = createStorage(null);
  const a = new Collector({ storage }); const b = new Collector({ storage });
  a.note('Create new file', 'text', null, null, '/settings/x'); a.flush();
  b.note('Another label here', 'text', null, null, '/explore'); b.flush();
  const c = new Collector({ storage });
  assert.equal(c.items.size, 2);
});
test('clear מוחק גם מהאחסון', () => {
  const { c, storage } = mk();
  c.note('Create new file', 'text', null, null, '/settings/x'); c.flush();
  c.clear();
  assert.equal(new Collector({ storage }).items.size, 0);
});
test('buildExport מכיל רק שדות בטוחים', () => {
  const { c } = mk();
  for (const p of ['/settings/a', '/notifications', '/settings/b']) c.note('Create new file', 'text', null, { tagName: 'BUTTON', classList: ['btn'] }, p);
  const ex = c.buildExport();
  assert.deepEqual(Object.keys(ex.entries[0]).sort(), ['ctx', 'en', 'kind', 'pages', 'seen']);
  assert.equal(ex.entries[0].ctx, 'BUTTON.btn');
});
test('classifyPath', () => {
  assert.deepEqual(classifyPath('/'), { pattern: '/', repoPage: false, owner: null });
  assert.equal(classifyPath('/settings/profile').pattern, '/settings/profile');
  assert.equal(classifyPath('/notifications').pattern, '/notifications');
  assert.equal(classifyPath('/octocat/Hello-World').pattern, '/:owner/:repo');
  assert.equal(classifyPath('/octocat/Hello-World/pull/12/files').pattern, '/:owner/:repo/pull/:n/files');
  assert.equal(classifyPath('/octocat/Hello-World/blob/main/src/a.js').pattern, '/:owner/:repo/blob');
  assert.equal(classifyPath('/octocat').pattern, '/:owner');
  assert.equal(classifyPath('/octocat/Hello-World').repoPage, true);
});
