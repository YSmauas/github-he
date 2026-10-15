'use strict';
/* כללי דילוג: אלמנטים ואזורי תוכן משתמשים שאסור לתרגם. */

// תגיות שתוכן הטקסט שלהן אינו ממשק
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'TEXTAREA', 'PRE', 'CODE', 'KBD', 'SAMP', 'MATH', 'CANVAS']);

// אזורי תוכן משתמשים (גם לטקסט וגם לתכונות)
const CONTENT_SELECTORS = [
  '.markdown-body', '.comment-body', '.js-comment-body', '.blob-code', '.blob-code-inner', '.react-code-lines',
  '.react-file-line', '.diff-table', '.markdown-title', '.js-issue-title', '[data-testid="issue-title"]',
  '[data-testid="issue-body"]', '[data-testid="markdown-body"]', '.commit-message', '.commit-title',
  '[data-testid="commit-message"]', '.Truncate-text.commit-title', '.branch-name', '.css-truncate-target',
  '[data-hovercard-url]', '[itemprop="name"]', '[itemprop="author"]', '.author', '.user-mention', '.markdown-title',
  '[contenteditable=""]', '[contenteditable="true"]', '.CodeMirror', '.cm-editor', '.monaco-editor',
  '[data-ghe-skip]', '[data-ghe-root]',
];
const CONTENT_SELECTOR = CONTENT_SELECTORS.join(',');

/** האם צריך לדלג על האלמנט ועל כל תת-העץ שלו (לטקסט)? */
function skipSubtree(el) {
  if (SKIP_TAGS.has(el.tagName) || SKIP_TAGS.has(String(el.tagName).toUpperCase())) return true;
  try { return el.matches(CONTENT_SELECTOR); } catch (_) { return false; }
}

/** האם אלמנט נמצא בתוך אזור תוכן משתמשים? (לבדיקת צמתים בודדים שנוספו) */
function insideContent(el) {
  try { return !!(el && el.closest && el.closest(CONTENT_SELECTOR)); } catch (_) { return false; }
}

/** האם לאלמנט (או לאחד מאבותיו) יש תגית דילוג? */
function hasSkipTagAncestor(el) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    if (SKIP_TAGS.has(String(cur.tagName).toUpperCase())) return true;
    cur = cur.parentElement;
  }
  return false;
}

/** בדיקה לצומת טקסט בודד: האב או אחד מאבותיו הם תגית/אזור דילוג. */
function textNodeSkipped(node) {
  const el = node.parentElement;
  if (!el) return true;
  return hasSkipTagAncestor(el) || insideContent(el);
}

module.exports = { SKIP_TAGS, CONTENT_SELECTOR, skipSubtree, insideContent, hasSkipTagAncestor, textNodeSkipped };
