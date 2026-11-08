// A — fix 358 등 V037 대상의 지금 DB 값이 V037 사본(targets.json)과 같은지
import { rj, withDb, ROWSQL } from './db.mjs';
const T = new Map(rj('v037-raw/targets.json').items.map((x) => [x.id, x]));
const R = rj('v037-refurb.json').items;
const fx = new Set(R.filter((x) => x.verdict === 'fix').map((x) => x.id));
await withDb(async (c) => {
  const rows = (await c.query(ROWSQL, [R.map((x) => +x.id)])).rows;
  const out = { q: [], h: [], e: [], v: [], inactive: [] };
  for (const x of rows) {
    const o = T.get(x.id);
    if (!x.is_active) out.inactive.push(x.id);
    if (o.question_text !== x.question_text) out.q.push(x.id);
    if (o.general_hint !== x.general_hint) out.h.push(x.id);
    if (o.explanation !== x.explanation) out.e.push(x.id);
    if (JSON.stringify([...(o.variants ?? [])].sort()) !== JSON.stringify([...x.variants].sort())) out.v.push(x.id);
  }
  console.log('rows', rows.length);
  for (const k of Object.keys(out)) console.log(k, out[k].length, 'in fix:', out[k].filter((i) => fx.has(i)).join(' '));
});
