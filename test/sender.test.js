'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sender = require('../src/sender');
const CFG = require('../src/config');

const entries = (n) => Array.from({ length: n }, (_, i) => ({ en: `Label number ${i} for testing purposes only`, kind: 'text', seen: 5, pages: ['/a', '/b'], ctx: 'SPAN.x' }));

test('buildBodies: גוף אחד, מכיל JSON תקין וסימון', () => {
  const [b] = sender.buildBodies(entries(3), { version: '0.0.1', dictBuilt: 'X', now: new Date('2026-10-12T00:00:00Z') });
  assert.match(b.title, /^\[collected\] 3 מחרוזות · 2026-10-12$/);
  assert.ok(b.body.startsWith(sender.MARK));
  const json = /```json\n([\s\S]*?)\n```/.exec(b.body)[1];
  assert.equal(JSON.parse(json).entries.length, 3);
});
test('buildBodies: מפצל כשחורגים ממגבלת האורך', () => {
  const bs = sender.buildBodies(entries(2000));
  assert.ok(bs.length > 1);
  for (const b of bs) assert.ok(b.body.length < CFG.SEND.maxBodyChars, `body ${b.body.length}`);
  assert.equal(bs.reduce((a, b) => a + b.count, 0), 2000);
  assert.match(bs[0].title, new RegExp(`\\(1/${bs.length}\\)$`));
});
test('buildPrefillUrl: מחזיר null כשארוך מדי', () => {
  assert.ok(sender.buildPrefillUrl('t', 'short'));
  assert.equal(sender.buildPrefillUrl('t', 'x'.repeat(9000)), null);
});

// DOM מזויף מינימלי לטופס Issue
function fakeForm(action, fields) {
  const els = fields.map((f) => ({ getAttribute: (k) => ({ name: f.name, type: f.type })[k] ?? null, value: f.value, checked: f.checked, disabled: false }));
  return {
    getAttribute: (k) => (k === 'action' ? action : null),
    querySelector: (sel) => (sel.includes('issue[body]') ? els.find((e) => e.getAttribute('name') === 'issue[body]') : null),
    querySelectorAll: () => els,
  };
}
const doc = (forms, loggedIn = true) => ({
  querySelectorAll: (s) => (s === 'form' ? forms : []),
  querySelector: (s) => (s.startsWith('meta[name="user-login"]') && loggedIn ? {} : null),
});
const fields = [
  { name: 'authenticity_token', type: 'hidden', value: 'TOKEN' },
  { name: 'issue[title]', type: 'text', value: '' },
  { name: 'issue[body]', type: 'textarea', value: '' },
  { name: 'ignored', type: 'checkbox', value: 'x', checked: false },
];

test('submitIssue: מצליח ומחזיר כתובת', async () => {
  const calls = [];
  const fx = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (!opts.method) return { ok: true, status: 200, url, text: async () => '<html/>' };
    return { ok: true, status: 200, url: 'https://github.com/YSmauas/github-he/issues/7', text: async () => '' };
  };
  const url = await sender.submitIssue({ title: 'T', body: 'B' }, { fetch: fx, parseHtml: () => doc([fakeForm('/YSmauas/github-he/issues', fields)]) });
  assert.equal(url, 'https://github.com/YSmauas/github-he/issues/7');
  const post = calls[1];
  assert.equal(post.url, 'https://github.com/YSmauas/github-he/issues');
  const p = new URLSearchParams(post.opts.body);
  assert.equal(p.get('authenticity_token'), 'TOKEN');
  assert.equal(p.get('issue[title]'), 'T');
  assert.equal(p.get('issue[body]'), 'B');
  assert.equal(p.has('ignored'), false);
});
test('submitIssue: לא מחובר', async () => {
  const fx = async (url) => ({ ok: true, status: 200, url, text: async () => '' });
  await assert.rejects(sender.submitIssue({ title: 'T', body: 'B' }, { fetch: fx, parseHtml: () => doc([], false) }), (e) => e.code === 'login');
});
test('submitIssue: טופס חסר כשמחוברים → form-not-found', async () => {
  const fx = async (url) => ({ ok: true, status: 200, url, text: async () => '' });
  await assert.rejects(sender.submitIssue({ title: 'T', body: 'B' }, { fetch: fx, parseHtml: () => doc([], true) }), (e) => e.code === 'form-not-found');
});
test('submitIssue: 429 → rate', async () => {
  const fx = async (url, o = {}) => (o.method ? { ok: false, status: 429, url, text: async () => '' } : { ok: true, status: 200, url, text: async () => '' });
  await assert.rejects(sender.submitIssue({ title: 'T', body: 'B' }, { fetch: fx, parseHtml: () => doc([fakeForm('/x/issues', fields)]) }), (e) => e.code === 'rate');
});
test('submitIssue: מפנה ל-login → login', async () => {
  const fx = async () => ({ ok: true, status: 200, url: 'https://github.com/login?return_to=x', text: async () => '' });
  await assert.rejects(sender.submitIssue({ title: 'T', body: 'B' }, { fetch: fx, parseHtml: () => doc([]) }), (e) => e.code === 'login');
});
test('sendAll: עוצר בשגיאה ראשונה ומכבד מגבלת Issues', async () => {
  let n = 0;
  const fx = async (url, o = {}) => {
    if (!o.method) return { ok: true, status: 200, url, text: async () => '' };
    n++; return n === 2 ? { ok: false, status: 429, url, text: async () => '' } : { ok: true, status: 200, url: `https://github.com/a/b/issues/${n}`, text: async () => '' };
  };
  const deps = { fetch: fx, parseHtml: () => doc([fakeForm('/x/issues', fields)]) };
  const bodies = Array.from({ length: 4 }, (_, i) => ({ title: 't' + i, body: 'b', count: 10 }));
  const r = await sender.sendAll(bodies, deps, null, 0);
  assert.equal(r.results.length, 2); assert.equal(r.results[0].ok, true); assert.equal(r.results[1].ok, false);
  const many = Array.from({ length: 9 }, (_, i) => ({ title: 't' + i, body: 'b', count: 1 }));
  n = 100;
  const r2 = await sender.sendAll(many, deps, null, 0);
  assert.equal(r2.results.length, CFG.SEND.maxIssuesPerRun); assert.equal(r2.skipped, 9 - CFG.SEND.maxIssuesPerRun);
});
