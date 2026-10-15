// בדיקות קצה-לקצה בדפדפן אמיתי (Chromium דרך Playwright) מול עמוד דוגמה.
// הרצה: npm run test:e2e   (דורש: npm i && npx playwright install chromium)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const script = fs.readFileSync(path.join(root, 'dist/github-he.user.js'), 'utf8');
const fixture = fs.readFileSync(path.join(dir, 'fixture.html'), 'utf8');
const OUT = process.env.E2E_OUT || '/tmp';

const shim = `
  var unsafeWindow = window;
  window.__cmds = [];
  function GM_getValue(k, d) { var v = localStorage.getItem('GM:' + k); return v === null ? d : v; }
  function GM_setValue(k, v) { localStorage.setItem('GM:' + k, typeof v === 'string' ? v : JSON.stringify(v)); }
  function GM_deleteValue(k) { localStorage.removeItem('GM:' + k); }
  function GM_registerMenuCommand(n, f) { window.__cmds.push([n, f]); }
  function GM_setClipboard(t) { window.__clip = t; }
  function GM_xmlhttpRequest(o) {
    setTimeout(function () {
      if (window.__remoteDict) o.onload({ status: 200, responseText: JSON.stringify(window.__remoteDict) });
      else o.onerror();
    }, 5);
  }
`;

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ← ' + extra}`); if (!cond) failures++; };

async function newPage(browser, { settings, url = 'https://github.com/settings/profile', route } = {}) {
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('https://github.com/**', async (r) => {
    const u = new URL(r.request().url());
    if (route) { const handled = await route(r, u); if (handled) return; }
    const body = u.pathname === '/settings/profile' ? fixture : fixture.replace('some user wrote this sentence once', '');
    await r.fulfill({ status: 200, contentType: 'text/html', body });
  });
  await page.addInitScript(`localStorage.getItem('GM:ghe.settings') || localStorage.setItem('GM:ghe.settings', ${JSON.stringify(JSON.stringify(settings || {}))});`);
  // Playwright לא מיירט יעדי redirect ברשת סגורה, לכן מדמים את ההפניה של GitHub לכתובת ה-Issue החדש
  await page.addInitScript(`(function(){var of=window.fetch;window.fetch=async function(){var r=await of.apply(this,arguments);var h=r.headers.get('x-test-redirect');if(!h)return r;return new Proxy(r,{get:function(t,k){if(k==='url')return h;var v=t[k];return typeof v==='function'?v.bind(t):v;}});};})();`);
  await page.addInitScript(shim + script);
  await page.goto(url);
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}

const text = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent, sel);
const browser = await chromium.launch();

// ---------- 1. תרגום בסיסי
{
  const { ctx, page, errors } = await newPage(browser);
  ok('תרגום: leaf מקבל data-ghe', (await text(page, '#cnf')).trim() === 'יצירת קובץ חדש' && await page.evaluate(() => document.getElementById('cnf').hasAttribute('data-ghe')));
  ok('תרגום: שמירת רווחים/שורות חדשות בצמתים', (await text(page, '#cnf')).startsWith('\n   ') && (await text(page, '#cnf')).endsWith('\n '));
  const sign = await page.evaluate(() => { const b = document.getElementById('signin'); return { first: b.firstElementChild.tagName.toLowerCase(), t: b.lastChild.nodeValue }; });
  ok('תרגום: כפתור עם אייקון — האייקון נשאר ראשון, הטקסט עטוף ב-RLI/PDI', sign.first === 'svg' && sign.t.includes('\u2067כניסה\u2069'), JSON.stringify(sign));
  ok('תרגום: אייקון + span (leaf) — data-ghe על ה-span', (await text(page, '#cmt')) === 'הערה' && await page.evaluate(() => document.getElementById('cmt').hasAttribute('data-ghe')));
  ok('תכונות: placeholder ו-aria-label', await page.evaluate(() => document.getElementById('q').placeholder === 'חיפוש או מעבר אל…' && document.getElementById('q').getAttribute('aria-label') === 'חיפוש'));
  ok('תכונות: placeholder של textarea מתורגם והתוכן שלו לא', await page.evaluate(() => document.getElementById('ta').placeholder === 'השאירו הערה' && document.getElementById('ta').value === 'Sign in'));
  ok('תבניות: ימים/פתוחים/כוכבים', (await text(page, '#ago')) === 'לפני 3 ימים' && (await text(page, '#open')) === '12 פתוחים' && (await text(page, '#stars')) === '1,234 כוכבים', `${await text(page, '#ago')}|${await text(page, '#open')}|${await text(page, '#stars')}`);
  ok('דילוג: כותרת issue, markdown-body, code לא משתנים', (await text(page, '#title')) === 'Pull requests' && (await text(page, '#md')) === 'Sign in' && (await text(page, '#code')) === 'Sign in');
  ok('Shadow DOM: כפתור ב-shadow root מתורגם', await page.evaluate(() => document.getElementById('widget').shadowRoot.querySelector('button').textContent === 'ביטול'));
  ok('כותרת הדף מתורגמת חלקית', (await page.title()) === 'הגדרות · GitHub', await page.title());
  // דינמי
  await page.evaluate(() => window.addDyn('<button class="btn"><span id="late">Close issue</span></button>'));
  await page.waitForTimeout(100);
  ok('תוכן שנוסף דינמית מתורגם', (await text(page, '#late')) === 'סגירת issue');
  // סימולציית React: כתיבת אנגלית חזרה לצומת
  await page.evaluate(() => { document.getElementById('cmt').firstChild.nodeValue = 'Comment'; });
  await page.waitForTimeout(100);
  ok('כתיבה חוזרת של אנגלית לצומת מתורגמת שוב (בלי לולאה)', (await text(page, '#cmt')) === 'הערה');
  const st = await page.evaluate(() => GHE.stats());
  ok('GHE.stats() מחזיר כיסוי סביר', st.translated > 10 && st.coverage > 50, JSON.stringify(st));
  await page.screenshot({ path: path.join(OUT, 'ghe-e2e.png') });
  ok('אין שגיאות JS בדף', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- 2. ביצועים
{
  const { ctx, page } = await newPage(browser);
  const ms = await page.evaluate(async () => {
    const t0 = performance.now(); window.bulk(5000);
    await new Promise((r) => setTimeout(r, 50));
    while (GHE.engine.queue.size) await new Promise((r) => setTimeout(r, 10));
    return performance.now() - t0;
  });
  const done = await page.evaluate(() => [...document.querySelectorAll('#dyn span')].filter((s) => /כניסה|מידע נוסף/.test(s.textContent)).length);
  ok(`ביצועים: 5000 צמתים נוספים עובדו (${Math.round(ms)}ms)`, done === 5000 && ms < 3000, `translated=${done} ms=${ms}`);
  await ctx.close();
}

// ---------- 3. מצבי כיווניות וכיבוי
for (const [mode, check] of [
  ['off', (p) => p.evaluate(() => !document.getElementById('cnf').hasAttribute('data-ghe') && !document.getElementById('signin').lastChild.nodeValue.includes('\u2067'))],
  ['isolate', (p) => p.evaluate(() => document.getElementById('cnf').firstChild.nodeValue.includes('\u2067') && !document.getElementById('cnf').hasAttribute('data-ghe'))],
  ['css', (p) => p.evaluate(() => document.getElementById('signin').hasAttribute('data-ghe') && !document.getElementById('signin').lastChild.nodeValue.includes('\u2067'))],
]) {
  const { ctx, page } = await newPage(browser, { settings: { rtl: mode } });
  ok(`מצב כיווניות: ${mode}`, await check(page));
  await ctx.close();
}
{
  const { ctx, page } = await newPage(browser, { settings: { enabled: false } });
  ok('תרגום כבוי: שום דבר לא משתנה', (await text(page, '#cnf')).includes('Create new file'));
  await ctx.close();
}

// ---------- 4. איסוף פרטי + שליחה + עדכון
{
  let posted = null;
  const route = async (r, u) => {
    const req = r.request();
    if (u.pathname === '/YSmauas/github-he/issues/new') {
      await r.fulfill({ status: 200, contentType: 'text/html', body: `<html><head><meta name="user-login" content="tester"></head><body>
        <form action="/YSmauas/github-he/issues" method="post"><input type="hidden" name="authenticity_token" value="TKN">
        <input name="issue[title]" value=""><textarea name="issue[body]"></textarea><input type="hidden" name="issue[labels][]" value="x"></form></body></html>` });
      return true;
    }
    if (u.pathname === '/YSmauas/github-he/issues' && req.method() === 'POST') {
      posted = req.postData();
      await r.fulfill({ status: 200, headers: { 'x-test-redirect': 'https://github.com/YSmauas/github-he/issues/12', 'access-control-expose-headers': 'x-test-redirect' }, contentType: 'text/html', body: 'ok' });
      return true;
    }
    if (u.pathname === '/YSmauas/github-he/issues/12') { await r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>ok</body></html>' }); return true; }
    return false;
  };
  const { ctx, page } = await newPage(browser, { settings: { collect: true }, route });
  for (const p of ['/settings/appearance', '/notifications', '/explore']) {
    await page.goto('https://github.com' + p); await page.waitForTimeout(250);
  }
  const ready = await page.evaluate(() => GHE.collector.ready().map((i) => i.en));
  ok('איסוף: מחרוזת ממשק חוזרת נאספה', ready.includes('Totally new label'), JSON.stringify(ready));
  const all = JSON.stringify(await page.evaluate(() => [...GHE.collector.items.values()].map((i) => i.en)));
  ok('איסוף: שם מוסתר ב-hovercard לא נאסף', !all.includes('secret name'));
  ok('איסוף: owner/repo ומשפט חד-פעמי לא נאספו כמוכנים', !ready.some((e) => /secret-repo|sentence once/.test(e)));
  ok('איסוף: מחרוזת מתורגמת (ידועה) לא נאספת', !all.includes('Create new file') && !all.includes('Sign in'));
  ok('איסוף: כתובות אמיתיות לא נשמרות', !(await page.evaluate(() => localStorage.getItem('GM:ghe.collected'))).includes('octocat'));
  // כפתור צף
  await page.waitForTimeout(5300);
  ok('כפתור "שליחה למפתח" מופיע עם מספר', await page.evaluate(() => { const h = document.querySelector('[data-ghe-root]'); return !!h && /שליחה למפתח \(\d+\)/.test(h.shadowRoot.textContent); }));
  // שליחה
  await page.evaluate(() => GHE.ui.openModal());
  await page.evaluate(() => { const r = document.querySelector('[data-ghe-root]').shadowRoot; r.querySelector('label.cons input').click(); });
  await page.evaluate(() => { const r = document.querySelector('[data-ghe-root]').shadowRoot; [...r.querySelectorAll('button')].find((b) => /שליחה כ-Issue/.test(b.textContent)).click(); });
  await page.waitForFunction(() => /נשלח בהצלחה|שגיאה/.test(document.querySelector('[data-ghe-root]').shadowRoot.querySelector('.ov').textContent), null, { timeout: 8000 }).catch(() => {});
  const msg = await page.evaluate(() => [...document.querySelector('[data-ghe-root]').shadowRoot.querySelectorAll('.st')].map((e) => e.textContent).join(' | '));
  ok('שליחה: Issue נוצר ומוצג קישור', /נשלח בהצלחה/.test(msg) && /issues\/12/.test(msg), msg.slice(0, 200));
  const params = posted ? new URLSearchParams(posted) : null;
  ok('שליחה: נשלחו token, כותרת וגוף עם ה-JSON', !!params && params.get('authenticity_token') === 'TKN' && /^\[collected\]/.test(params.get('issue[title]')) && params.get('issue[body]').includes('Totally new label'), posted?.slice(0, 200));
  ok('שליחה: אחרי הצלחה המחרוזות סומנו כנשלחו ולא נאספות שוב', await page.evaluate(() => GHE.collector.ready().length === 0));
  // עדכון מילון חי
  const strings = {}; for (let i = 0; i < 80; i++) strings['Filler label ' + i] = 'מילוי ' + i;
  strings['Totally new label'] = 'תווית חדשה לגמרי';
  await page.evaluate((s) => { window.__remoteDict = { meta: { schema: 1, lang: 'he', built: '2099-01-01T00:00:00.000Z' }, strings: s, scoped: [] }; }, strings);
  const res = await page.evaluate(() => GHE.updateNow().then((r) => r.status));
  await page.waitForTimeout(200);
  ok('עדכון אוטומטי: status=updated והמילון הוחל חי על הדף', res === 'updated' && (await text(page, '#unknown span')) === 'תווית חדשה לגמרי', res);
  await page.reload(); await page.waitForTimeout(300);
  ok('עדכון אוטומטי: המילון מהמטמון נטען בטעינה הבאה', (await text(page, '#unknown span')) === 'תווית חדשה לגמרי');
  await ctx.close();
}

// ---------- 5. עדכון: מילון זדוני נדחה
{
  const { ctx, page } = await newPage(browser);
  const strings = {}; for (let i = 0; i < 80; i++) strings['Filler label ' + i] = 'מילוי ' + i;
  strings['Totally new label'] = 'לחצו כאן https://evil.example';
  await page.evaluate((s) => { window.__remoteDict = { meta: { schema: 1, lang: 'he', built: '2099-01-01T00:00:00.000Z' }, strings: s }; }, strings);
  await page.evaluate(() => GHE.updateNow());
  await page.waitForTimeout(150);
  ok('עדכון: ערך עם כתובת נדחה', (await text(page, '#unknown span')) === 'Totally new label');
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} בדיקות נכשלו` : '\nכל בדיקות ה-e2e עברו');
process.exit(failures ? 1 : 0);
