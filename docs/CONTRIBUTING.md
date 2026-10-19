# איך תורמים

## שלוש דרכים לעזור
1. **גלישה עם מצב איסוף** ושליחת מחרוזות (הכי קל — ראו README).
2. **תרגום מחרוזות ממתינות** (`dict/sources/pending.json`) והעברתן ל-`reviewed.json`.
3. **תיקון תרגומים קיימים** ב-`manual.json` או `reviewed.json`.

## זרימת העבודה במאגר
```
Issue [collected] ──► node tools/merge_collected.mjs <קבצים/גופי issue>
                      ──► dict/sources/pending.json  (אנגלית בלבד)
                      ──► תרגום (ערך עברי לכל מפתח)
                      ──► העברה ל-dict/sources/reviewed.json
                      ──► npm run check ──► Pull Request
```
אחרי מיזוג ל-`main`, ה-CI בונה מחדש ומפרסם את `he.json` ואת הסקריפט בענף `dist` וב-Releases, והמשתמשים מקבלים את המילון המעודכן בעדכון האוטומטי.

## כללי הקבצים
| קובץ | תוכן | הערות |
|---|---|---|
| `dict/sources/manual.json` | תרגומים שנכתבו/תוקנו ידנית | עדיפות גבוהה ביותר |
| `dict/sources/reviewed.json` | מחרוזות שנאספו ותורגמו ואושרו | |
| `dict/sources/seed-app.json` | זרע מהאפליקציה | **לא לערוך ידנית**; לתיקון — להוסיף ל-`manual.json` |
| `dict/sources/scoped.json` | (אופציונלי) רשומות לפי הקשר | מערך של `{en, he, scope:{path?, selector?}}` |
| `dict/sources/pending.json` | מועמדים לתרגום | ערך ריק = עוד לא תורגם |

`dict/he.json` ו-`dist/` נוצרים בבנייה, **לא** מוסיפים אותם ל-PR.

## בדיקות לפני PR
```bash
npm run validate
npm test
npm run build
```
המאמתים בודקים: JSON תקין, `{n}`/`{1}` זהים בין מקור לתרגום, אין ערכים ריקים, אין כתובות/HTML בערך, אין תווי כיוון, אורך סביר.

## כללי תרגום
ראו [GLOSSARY.md](GLOSSARY.md).

## שינויי קוד
- בלי תלויות חדשות בזמן ריצה.
- כל שינוי בלוגיקה — עם בדיקה ב-`test/`.
- שינוי שנוגע לאיסוף/שליחה — לעדכן גם את [PRIVACY.md](PRIVACY.md).
