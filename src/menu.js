'use strict';
/* פקודות בתפריט Tampermonkey. */
const settingsLib = require('./settings');
const { validateDict } = require('./validate');

const rtlNames = { auto: 'אוטומטי', css: 'CSS בלבד', isolate: 'תווי בקרה', off: 'כבוי' };
const onoff = (b) => (b ? 'מופעל' : 'כבוי');

function registerMenu({ gm, win, storage, settings, collector, ui, actions, status }) {
  const reg = (label, fn) => { if (gm.registerMenuCommand) gm.registerMenuCommand(label, fn); };
  const change = (patch) => { Object.assign(settings, patch); settingsLib.save(storage, settings); win.location.reload(); };

  reg(`תרגום: ${onoff(settings.enabled)} (לחיצה להחלפה)`, () => change({ enabled: !settings.enabled }));
  reg(`איסוף מחרוזות: ${onoff(settings.collect)} (לחיצה להחלפה)`, () => change({ collect: !settings.collect }));
  reg('📤 שליחה למפתח…', () => ui.openModal());
  reg('ייצוא מחרוזות שנאספו (קובץ JSON)', () => actions.exportFile());
  reg('מחיקת מחרוזות שנאספו', () => { if (win.confirm('למחוק את כל המחרוזות שנאספו?')) { collector.clear(); ui.refresh(); } });
  reg(`כיווניות: ${rtlNames[settings.rtl]} (לחיצה להחלפה)`, () => change({ rtl: settingsLib.nextRtl(settings.rtl) }));
  reg('עדכון המילון עכשיו', () => actions.updateNow());
  reg(`עדכון אוטומטי של המילון: ${onoff(settings.autoUpdate)}`, () => change({ autoUpdate: !settings.autoUpdate }));
  reg('ייבוא מילון אישי (JSON)', () => actions.importUserDict());
  reg('איפוס הגדרות', () => { storage.remove(settingsLib.KEY); win.location.reload(); });
  reg('ℹ️ מצב ומידע', () => win.alert(status()));
}

module.exports = { registerMenu };
