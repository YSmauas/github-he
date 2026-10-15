'use strict';
/* ממשק "שליחה למפתח": כפתור צף + חלון אישור. בנוי ב-Shadow DOM וללא innerHTML (המחרוזות מגיעות מהדף). */
const CFG = require('./config');
const sender = require('./sender');

const STYLE = `
:host{all:initial}
*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
.fab{position:fixed;left:16px;bottom:16px;z-index:2147483000;background:#238636;color:#fff;border:0;border-radius:24px;
 padding:10px 16px;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);direction:rtl}
.fab:hover{background:#2ea043}
.ov{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}
.dlg{background:#fff;color:#1f2328;width:min(680px,94vw);max-height:90vh;display:flex;flex-direction:column;border-radius:12px;
 box-shadow:0 10px 40px rgba(0,0,0,.5);direction:rtl;text-align:right}
@media (prefers-color-scheme:dark){.dlg{background:#161b22;color:#e6edf3}.list{border-color:#30363d!important}.row:hover{background:#21262d}.warn{background:#3a2d00!important;color:#f0d78a!important}}
.hd{padding:16px 20px 8px;font-size:18px;font-weight:600}
.bd{padding:0 20px;overflow:auto}
.warn{background:#fff8c5;color:#4d2d00;border-radius:8px;padding:10px 12px;margin:8px 0;font-size:13px;line-height:1.5}
.list{border:1px solid #d0d7de;border-radius:8px;max-height:260px;overflow:auto;margin:8px 0}
.row{display:flex;gap:8px;align-items:center;padding:4px 10px;font-size:13px}
.row .en{direction:ltr;text-align:left;flex:1;word-break:break-word;font-family:ui-monospace,Consolas,monospace}
.row .n{opacity:.6;font-size:12px}
.tools{display:flex;gap:12px;font-size:13px;margin:6px 0}
.tools a{color:#0969da;cursor:pointer}
.st{min-height:20px;font-size:13px;margin:8px 0;white-space:pre-wrap}
.st a{color:#0969da}
.ft{padding:12px 20px 16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start}
button.b{border:1px solid #d0d7de;background:#f6f8fa;color:inherit;border-radius:6px;padding:7px 14px;font-size:14px;cursor:pointer}
@media (prefers-color-scheme:dark){button.b{background:#21262d;border-color:#30363d}}
button.p{background:#238636;border-color:#238636;color:#fff}
button:disabled{opacity:.5;cursor:default}
label.cons{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:8px 0;line-height:1.4}
`;

function el(doc, tag, props, children) {
  const e = doc.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const c of children || []) e.appendChild(c);
  return e;
}

function createUI({ win, collector, deps, getDictBuilt, copy, enabled }) {
  const doc = win.document;
  let host = null; let root = null; let fab = null; let timer = null;

  function ensureHost() {
    if (host && host.isConnected) return;
    host = doc.createElement('div');
    host.setAttribute('data-ghe-root', '');
    host.setAttribute('data-ghe-skip', '');
    root = host.attachShadow({ mode: 'open' });
    root.appendChild(el(doc, 'style', { text: STYLE }));
    (doc.body || doc.documentElement).appendChild(host);
  }

  function refresh() {
    if (!enabled()) { if (fab) { fab.remove(); fab = null; } return; }
    const ready = collector.ready().length;
    if (ready === 0) { if (fab) { fab.remove(); fab = null; } return; }
    if (!doc.body) return;
    ensureHost();
    if (!fab) {
      fab = el(doc, 'button', { class: 'fab', onclick: () => openModal() });
      root.appendChild(fab);
    }
    fab.textContent = `📤 שליחה למפתח (${ready})`;
  }

  function startBadgeLoop() {
    if (timer) return;
    timer = win.setInterval(refresh, 5000);
    win.addEventListener('pagehide', () => collector.flush());
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') collector.flush(); });
  }

  function openModal() {
    ensureHost();
    const entries = collector.ready();
    const selected = new Set(entries.map((_, i) => i));
    const ov = el(doc, 'div', { class: 'ov' });
    const dlg = el(doc, 'div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true' });
    ov.appendChild(dlg);

    const list = el(doc, 'div', { class: 'list' });
    const checks = [];
    entries.forEach((it, i) => {
      const cb = el(doc, 'input', { type: 'checkbox' }); cb.checked = true;
      cb.addEventListener('change', () => { if (cb.checked) selected.add(i); else selected.delete(i); updateCount(); });
      checks.push(cb);
      const row = el(doc, 'label', { class: 'row' }, [cb, el(doc, 'span', { class: 'en', text: it.en }), el(doc, 'span', { class: 'n', text: `×${it.seen}` })]);
      list.appendChild(row);
    });
    const count = el(doc, 'div', { class: 'st' });
    const status = el(doc, 'div', { class: 'st' });
    const consent = el(doc, 'input', { type: 'checkbox' });
    const sendBtn = el(doc, 'button', { class: 'b p', text: 'שליחה כ-Issue ציבורי', disabled: '' });
    const copyBtn = el(doc, 'button', { class: 'b', text: 'העתקה ללוח' });
    const manualBtn = el(doc, 'button', { class: 'b', text: 'פתיחת Issue ידנית' });
    const closeBtn = el(doc, 'button', { class: 'b', text: 'סגירה' });

    function chosen() { return entries.filter((_, i) => selected.has(i)); }
    function updateCount() {
      count.textContent = `נבחרו ${selected.size} מתוך ${entries.length} מחרוזות`;
      sendBtn.disabled = !(consent.checked && selected.size > 0);
    }
    consent.addEventListener('change', updateCount);

    const selAll = el(doc, 'a', { text: 'בחירת הכול', onclick: () => { checks.forEach((c, i) => { c.checked = true; selected.add(i); }); updateCount(); } });
    const selNone = el(doc, 'a', { text: 'ביטול בחירה', onclick: () => { checks.forEach((c, i) => { c.checked = false; selected.delete(i); }); updateCount(); } });

    dlg.appendChild(el(doc, 'div', { class: 'hd', text: 'שליחת מחרוזות למפתח' }));
    dlg.appendChild(el(doc, 'div', { class: 'bd' }, [
      el(doc, 'div', { text: 'אלה מחרוזות ממשק של GitHub שעדיין אין להן תרגום. הן יישלחו כ-Issue למאגר הפרויקט כדי שנוכל לתרגם אותן.' }),
      el(doc, 'div', { class: 'warn', text: '⚠️ ה-Issue יהיה ציבורי ויופיע בחשבון GitHub שלך. עברו על הרשימה ובטלו כל מחרוזת שנראית לכם אישית או רגישה (שם פרויקט, שם אדם, טקסט של מישהו).' }),
      el(doc, 'div', { class: 'tools' }, [selAll, selNone]),
      list, count,
      el(doc, 'label', { class: 'cons' }, [consent, el(doc, 'span', { text: 'עברתי על הרשימה ואני מאשר/ת לשלוח את המחרוזות שנבחרו כ-Issue ציבורי.' })]),
      status,
    ]));
    dlg.appendChild(el(doc, 'div', { class: 'ft' }, [sendBtn, copyBtn, manualBtn, closeBtn]));
    root.appendChild(ov);
    updateCount();

    function setStatus(text, links) {
      status.textContent = text;
      for (const u of links || []) { status.appendChild(doc.createElement('br')); status.appendChild(el(doc, 'a', { href: u, target: '_blank', rel: 'noopener', text: u })); }
    }
    const close = () => { ov.remove(); refresh(); };
    closeBtn.addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    function bodies() { return sender.buildBodies(collector.buildExport(chosen()).entries, { version: CFG.VERSION, dictBuilt: getDictBuilt() }); }

    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true; copyBtn.disabled = true; manualBtn.disabled = true;
      const bs = bodies();
      setStatus(`שולח ${bs.length} Issue...`);
      const { results, skipped } = await sender.sendAll(bs, deps, (i, n) => setStatus(`נשלח ${i + 1} מתוך ${n}...`));
      const ok = results.filter((r) => r.ok);
      const fail = results.find((r) => !r.ok);
      const sentCount = ok.reduce((a, r) => a + r.count, 0);
      if (sentCount) {
        // מסמנים כנשלחו רק את הרשומות ששייכות לגופים שהצליחו (לפי הסדר)
        collector.markSent(chosen().slice(0, sentCount));
      }
      const links = ok.map((r) => r.url);
      if (fail) setStatus(`נשלחו ${ok.length} Issues. שגיאה: ${fail.error.message}\nאפשר להשתמש ב"העתקה ללוח" או "פתיחת Issue ידנית".`, links);
      else setStatus(`נשלח בהצלחה! תודה 🙏${skipped ? `\n(${skipped} חלקים נוספים יישלחו בהפעלה הבאה)` : ''}`, links);
      copyBtn.disabled = false; manualBtn.disabled = false;
      if (fail) sendBtn.disabled = false;
      else { sendBtn.textContent = 'נשלח ✓'; }
    });

    copyBtn.addEventListener('click', () => {
      const text = JSON.stringify(collector.buildExport(chosen()));
      copy(text); setStatus('הועתק ללוח. אפשר להדביק ב-Issue חדש במאגר.');
    });
    manualBtn.addEventListener('click', () => {
      const bs = bodies();
      const first = bs[0];
      const url = first && bs.length === 1 ? sender.buildPrefillUrl(first.title, first.body) : null;
      if (url) { win.open(url, '_blank', 'noopener'); setStatus('נפתח טופס Issue מוכן — יש ללחוץ שם על "Submit new issue".'); }
      else {
        copy(JSON.stringify(collector.buildExport(chosen())));
        win.open(sender.templateUrl(), '_blank', 'noopener');
        setStatus('הנתונים הועתקו ללוח. הדביקו אותם בגוף ה-Issue שנפתח.');
      }
    });
  }

  return { refresh, openModal, startBadgeLoop };
}

module.exports = { createUI };
