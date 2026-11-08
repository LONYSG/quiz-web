import { withDb, ROWSQL } from './db.mjs';
const ids = process.argv.slice(2).map(Number);
await withDb(async (c) => { for (const r of (await c.query(ROWSQL + ' order by q.id', [ids])).rows) console.log(`#${r.id} ${r.display_answer} [${r.variants.join(', ')}] w${r.worth} d${r.difficulty_score}\n Q ${r.question_text}\n H ${r.general_hint}\n E ${r.explanation}\n`); });
