'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateDict } = require('../src/validate');
const { Dictionary } = require('../src/dictionary');

const root = path.join(__dirname, '..');
const exists = (p) => fs.existsSync(path.join(root, p));

test('dict/he.json תקין לפי כללי ה-CI', { skip: !exists('dict/he.json') }, () => {
  const d = JSON.parse(fs.readFileSync(path.join(root, 'dict/he.json'), 'utf8'));
  const r = validateDict(d, { strict: true });
  assert.deepEqual(r.errors, []);
  assert.ok(r.clean.meta.count > 300);
});
test('המילון נטען ומתרגם מחרוזות נפוצות', { skip: !exists('dict/he.json') }, () => {
  const d = new Dictionary(JSON.parse(fs.readFileSync(path.join(root, 'dict/he.json'), 'utf8')));
  assert.equal(d.lookup('Sign in'), 'כניסה');
  assert.equal(d.lookup('3 days ago'), 'לפני 3 ימים');
  assert.equal(d.lookup('Pull requests'), 'Pull requests');
});
test('dist/github-he.user.js — כותרת וסינטקס תקינים', { skip: !exists('dist/github-he.user.js') }, () => {
  const code = fs.readFileSync(path.join(root, 'dist/github-he.user.js'), 'utf8');
  assert.match(code, /^\/\/ ==UserScript==/);
  assert.match(code, /@run-at\s+document-start/);
  assert.match(code, /@connect\s+raw\.githubusercontent\.com/);
  assert.doesNotMatch(code, /%%VERSION%%/);
  new vm.Script(code); // לא זורק = סינטקס תקין
});
