'use strict';
/* שליחת מחרוזות שנאספו למפתח כ-Issue (או חלופות ידניות). */
const CFG = require('./config');

const MARK = '<!-- github-he:collected v1 -->';

/** מפצל את הרשומות לגופי Issue שלא חורגים ממגבלת האורך. */
function buildBodies(entries, { version = CFG.VERSION, dictBuilt = '', now = new Date() } = {}) {
  const limit = CFG.SEND.maxBodyChars - 1500;
  const chunks = [];
  let cur = []; let size = 0;
  for (const e of entries) {
    const len = JSON.stringify(e).length + 2;
    if (cur.length && size + len > limit) { chunks.push(cur); cur = []; size = 0; }
    cur.push(e); size += len;
  }
  if (cur.length) chunks.push(cur);
  const date = now.toISOString().slice(0, 10);
  return chunks.map((list, i) => {
    const payload = { schema: 1, tool: 'github-he', version, dict: dictBuilt, exportedAt: now.toISOString(), part: i + 1, parts: chunks.length, entries: list };
    const part = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : '';
    const title = `${CFG.SEND.titlePrefix} ${list.length} מחרוזות · ${date}${part}`;
    const body = `${MARK}\nגרסת סקריפט: ${version} · גרסת מילון: ${dictBuilt || '-'} · מחרוזות: ${list.length}${part}\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n`;
    return { title, body, count: list.length, payload };
  });
}

function buildPrefillUrl(title, body) {
  const url = `${CFG.REPO_URL}/issues/new?template=${encodeURIComponent(CFG.SEND.template)}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  return url.length <= CFG.SEND.maxPrefillUrlChars ? url : null;
}

function templateUrl() { return `${CFG.REPO_URL}/issues/new?template=${encodeURIComponent(CFG.SEND.template)}`; }

class SendError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

/**
 * יוצר Issue דרך טופס האתר באמצעות ה-session של המשתמש (אין טוקן ואין שרת ביניים).
 * deps: { fetch, parseHtml(html) → Document, origin }
 * מחזיר את כתובת ה-Issue שנוצר.
 */
async function submitIssue({ title, body }, deps) {
  const { fetch: fx, parseHtml, origin = 'https://github.com' } = deps;
  const formUrl = `${origin}/${CFG.OWNER}/${CFG.REPO}/issues/new?template=${encodeURIComponent(CFG.SEND.template)}`;
  let res;
  try {
    res = await fx(formUrl, { credentials: 'same-origin', headers: { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' } });
  } catch (e) { throw new SendError('network', 'שגיאת רשת בעת טעינת טופס ה-Issue'); }
  if (res.status === 404) throw new SendError('not-found', 'המאגר לא נמצא');
  if (!res.ok) throw new SendError('http', `שגיאת שרת (${res.status}) בטעינת הטופס`);
  if (/\/login/.test(res.url || '')) throw new SendError('login', 'יש להתחבר ל-GitHub כדי לשלוח');
  const doc = parseHtml(await res.text());
  const forms = [...doc.querySelectorAll('form')];
  const form = forms.find((f) => /\/issues$/.test((f.getAttribute('action') || '').split('?')[0]) && f.querySelector('[name="issue[body]"]'));
  if (!form) {
    const loggedOut = !doc.querySelector('meta[name="user-login"][content]:not([content=""])');
    throw new SendError(loggedOut ? 'login' : 'form-not-found', loggedOut ? 'יש להתחבר ל-GitHub כדי לשלוח' : 'לא נמצא טופס Issue (ייתכן ש-GitHub שינה את הממשק)');
  }
  const params = new URLSearchParams();
  for (const el of form.querySelectorAll('input[name],textarea[name],select[name]')) {
    if (el.disabled) continue;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
    if (type === 'file' || type === 'submit' || type === 'button') continue;
    params.append(el.getAttribute('name'), el.value != null ? el.value : '');
  }
  params.set('issue[title]', title);
  params.set('issue[body]', body);
  const action = new URL(form.getAttribute('action'), origin).href;
  let post;
  try {
    post = await fx(action, {
      method: 'POST', credentials: 'same-origin', redirect: 'follow',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' },
      body: params.toString(),
    });
  } catch (e) { throw new SendError('network', 'שגיאת רשת בעת שליחת ה-Issue'); }
  if (post.status === 429) throw new SendError('rate', 'GitHub מגביל את קצב היצירה. נסו שוב בעוד כמה דקות');
  if (/\/issues\/\d+/.test(post.url || '')) return post.url;
  if (post.status === 422) throw new SendError('rejected', 'GitHub דחה את הבקשה (422)');
  throw new SendError('unexpected', 'לא התקבל אישור יצירה מ-GitHub');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** שולח את כל הגופים ברצף. onProgress(index, total, result). עוצר בשגיאה ראשונה. */
async function sendAll(bodies, deps, onProgress, delayMs = CFG.SEND.delayBetweenIssuesMs) {
  const results = [];
  const list = bodies.slice(0, CFG.SEND.maxIssuesPerRun);
  for (let i = 0; i < list.length; i++) {
    try {
      const url = await submitIssue(list[i], deps);
      results.push({ ok: true, url, count: list[i].count });
    } catch (e) {
      results.push({ ok: false, error: e, count: list[i].count });
      if (onProgress) onProgress(i, list.length, results[results.length - 1]);
      break;
    }
    if (onProgress) onProgress(i, list.length, results[results.length - 1]);
    if (i < list.length - 1) await sleep(delayMs);
  }
  return { results, skipped: Math.max(0, bodies.length - list.length) };
}

module.exports = { buildBodies, buildPrefillUrl, templateUrl, submitIssue, sendAll, SendError, MARK };
