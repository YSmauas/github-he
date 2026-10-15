'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Dictionary, LayeredDictionary } = require('../src/dictionary');
const { normalizeKey, splitWhitespace, templateize } = require('../src/normalize');

const d = new Dictionary({
  meta: {},
  strings: {
    'Sign in': 'כניסה',
    'Pull requests': 'Pull requests',
    '{n} commits': '{n} commits',
    '{n} days ago': 'לפני {n} ימים',
    'Merged {1} into {2}': 'בוצע merge של {1} אל {2}',
    '{n} Open': '{n} פתוחים',
    'Oct {n}, {n}': '{n} באוק׳ {n}',
  },
  scoped: [
    { en: 'Open', he: 'פתוח', scope: { path: '^/[^/]+/[^/]+/issues' } },
    { en: 'Open', he: 'פתיחה', scope: { path: '^/settings' } },
  ],
});

test('התאמה מדויקת', () => assert.equal(d.lookup('Sign in'), 'כניסה'));
test('אין התאמה → null', () => assert.equal(d.lookup('Something else'), null));
test('מפתח עם עברית לא מתורגם', () => assert.equal(d.lookup('כניסה Sign in'), null));
test('מפתח בלי אותיות לטיניות לא מתורגם', () => assert.equal(d.lookup('123'), null));
test('תבנית עם מספר', () => assert.equal(d.lookup('3 days ago'), 'לפני 3 ימים'));
test('תבנית עם מספר גדול ופסיק', () => assert.equal(d.lookup('1,234 commits'), '1,234 commits'));
test('תבנית עם k/m', () => assert.equal(d.lookup('12.5k Open'), '12.5k פתוחים'));
test('תבנית עם טקסט חופשי', () => assert.equal(d.lookup('Merged feature/x into main'), 'בוצע merge של feature/x אל main'));
test('שני מספרים באותה תבנית — לפי סדר', () => assert.equal(d.lookup('Oct 5, 2026'), '5 באוק׳ 2026'));
test('התאמה מדויקת גוברת על תבנית', () => {
  const x = new Dictionary({ strings: { '1 commit': 'commit אחד', '{n} commits': '{n} commits' } });
  assert.equal(x.lookup('1 commit'), 'commit אחד');
  assert.equal(x.lookup('2 commits'), '2 commits');
});
test('הקשר (scoped) לפי נתיב', () => {
  assert.equal(d.lookup('Open', { path: '/o/r/issues' }), 'פתוח');
  assert.equal(d.lookup('Open', { path: '/settings/profile' }), 'פתיחה');
  assert.equal(d.lookup('Open', { path: '/' }), null);
});
test('scoped גובר על exact', () => {
  const x = new Dictionary({ strings: { Open: 'X' }, scoped: [{ en: 'Open', he: 'Y', scope: { path: '^/a' } }] });
  assert.equal(x.lookup('Open', { path: '/a' }), 'Y');
  assert.equal(x.lookup('Open', { path: '/b' }), 'X');
});
test('מילון שכבות — האישי גובר', () => {
  const user = new Dictionary({ strings: { 'Sign in': 'התחברות' } });
  const l = new LayeredDictionary([user, d]);
  assert.equal(l.lookup('Sign in'), 'התחברות');
  assert.equal(l.lookup('3 days ago'), 'לפני 3 ימים');
});
test('normalizeKey: רווחים, NBSP, תווי כיוון', () => {
  assert.equal(normalizeKey('  Sign\u00a0 in \n'), 'Sign in');
  assert.equal(normalizeKey('\u2067Sign in\u2069'), 'Sign in');
  assert.equal(normalizeKey('Sig\u200bn in'), 'Sign in');
});
test('splitWhitespace שומר הזחות', () => {
  assert.deepEqual(splitWhitespace('\n   Sign in\n  '), { lead: '\n   ', core: 'Sign in', trail: '\n  ' });
});
test('templateize', () => {
  assert.equal(templateize('3 commits'), '{n} commits');
  assert.equal(templateize('Issue #123'), 'Issue #{n}');
  assert.equal(templateize('v1.2 released'), 'v1.2 released');
  assert.equal(templateize('1,234 stars'), '{n} stars');
});
