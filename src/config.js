'use strict';
/* הגדרות קבועות של הפרויקט. שינוי בעלים/שם המאגר נעשה כאן בלבד. */
const OWNER = 'YSmauas';
const REPO = 'github-he';

module.exports = {
  VERSION: '%%VERSION%%',
  OWNER,
  REPO,
  SCHEMA: 1, // גרסת מבנה המילון שהסקריפט יודע לקרוא

  // עדכון אוטומטי של המילון מהמאגר (לפי סדר ניסיון)
  DICT_URLS: [
    `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/dict/he.json`,
    `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@main/dict/he.json`,
  ],
  UPDATE_INTERVAL_MS: 6 * 60 * 60 * 1000,
  UPDATE_DELAY_MS: 4000,        // כמה זמן אחרי טעינת הדף בודקים עדכון
  UPDATE_TIMEOUT_MS: 15000,
  MAX_DICT_BYTES: 3 * 1024 * 1024,

  // מגבלות על המילון (גם בזמן ריצה וגם ב-CI)
  LIMITS: { maxEntries: 30000, maxKey: 300, maxValue: 400 },

  // איסוף
  COLLECT: {
    minLen: 2,
    maxLen: 120,
    minSeen: 3,
    minPatterns: 2,
    minOwnersForRepoPages: 2,
    maxStored: 5000,
    flushDelayMs: 2500,
  },

  // שליחה למפתח
  SEND: {
    titlePrefix: '[collected]',
    template: 'collected-strings.md',
    maxBodyChars: 60000,
    maxIssuesPerRun: 5,
    delayBetweenIssuesMs: 3500,
    maxPrefillUrlChars: 7000,
  },

  // מנוע ההחלפה
  ENGINE: {
    maxTextLen: 300,
    frameBudgetMs: 12,
  },

  ISSUES_URL: `https://github.com/${OWNER}/${REPO}/issues`,
  REPO_URL: `https://github.com/${OWNER}/${REPO}`,
};
