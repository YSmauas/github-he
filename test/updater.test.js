'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkForUpdate, pickDictionary, CACHE_KEY, CHECK_KEY } = require('../src/updater');
const { createStorage } = require('../src/storage');

const mkDict = (built, extra = {}) => {
  const strings = {};
  for (let i = 0; i < 60; i++) strings[`Label ${i}`] = `תווית ${i}`;
  return { meta: { schema: 1, built, lang: 'he' }, strings: { ...strings, ...extra } };
};
const bundled = mkDict('2026-10-01T00:00:00.000Z');

test('pickDictionary: המטמון הטרי גובר', () => {
  const cache = { data: mkDict('2026-10-10T00:00:00.000Z') };
  assert.equal(pickDictionary(bundled, cache), cache.data);
  assert.equal(pickDictionary(bundled, { data: mkDict('2026-09-01T00:00:00.000Z') }), bundled);
  assert.equal(pickDictionary(bundled, null), bundled);
});
test('עדכון מוצלח נשמר במטמון', async () => {
  const storage = createStorage(null);
  const remote = mkDict('2026-10-12T00:00:00.000Z', { 'New thing': 'דבר חדש' });
  const r = await checkForUpdate({ fetchText: async () => JSON.stringify(remote), storage, currentBuilt: bundled.meta.built, now: () => 1e12 }, { force: true });
  assert.equal(r.status, 'updated');
  assert.equal(storage.get(CACHE_KEY).data.strings['New thing'], 'דבר חדש');
});
test('אותו תאריך → current ולא נשמר', async () => {
  const storage = createStorage(null);
  const r = await checkForUpdate({ fetchText: async () => JSON.stringify(bundled), storage, currentBuilt: bundled.meta.built, now: () => 1e12 }, { force: true });
  assert.equal(r.status, 'current'); assert.equal(storage.get(CACHE_KEY, null), null);
});
test('דילוג לפי מרווח, ושימוש ב-force', async () => {
  const storage = createStorage(null); storage.set(CHECK_KEY, 1e12 - 1000);
  let hits = 0;
  const deps = { fetchText: async () => { hits++; return JSON.stringify(bundled); }, storage, currentBuilt: bundled.meta.built, now: () => 1e12 };
  assert.equal((await checkForUpdate(deps)).status, 'skipped'); assert.equal(hits, 0);
  assert.equal((await checkForUpdate(deps, { force: true })).status, 'current'); assert.equal(hits, 1);
});
test('מילון שגוי/זדוני נדחה', async () => {
  const storage = createStorage(null);
  const run = (text) => checkForUpdate({ fetchText: async () => text, storage, currentBuilt: bundled.meta.built, now: () => 1e12 }, { force: true });
  assert.equal((await run('not json')).status, 'error');
  assert.equal((await run(JSON.stringify({ meta: { schema: 9, built: '2030-01-01T00:00:00Z' }, strings: {} }))).status, 'error');
  assert.equal((await run(JSON.stringify(mkDict('2026-12-01T00:00:00.000Z', { Help: 'לחצו https://evil.example' })))).status, 'updated'); // הרשומה נזרקת, השאר נשמר
  assert.equal(storage.get(CACHE_KEY).data.strings.Help, undefined);
  assert.equal((await run(JSON.stringify({ meta: { schema: 1, built: '2027-01-01T00:00:00Z' }, strings: { A1: 'א' } }))).status, 'error'); // קטן באופן חשוד
});
test('נכשל בכתובת הראשונה ומצליח בשנייה', async () => {
  const storage = createStorage(null); let n = 0;
  const remote = mkDict('2026-11-01T00:00:00.000Z');
  const r = await checkForUpdate({ fetchText: async () => { if (n++ === 0) throw new Error('HTTP 404'); return JSON.stringify(remote); }, storage, currentBuilt: bundled.meta.built, now: () => 1e12 }, { force: true });
  assert.equal(r.status, 'updated');
});
