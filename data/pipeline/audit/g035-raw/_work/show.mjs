// B — 재독용 출력: 원문 · fix_text · 새로 생긴 낱말(원문에 없는 2글자 이상 덩어리) · 힌트 · 해설 · flags
import { rj, withDb, ROWSQL } from './db.mjs';
const [from, to] = process.argv.slice(2).map(Number);
const P = rj('g035-plan.json'); const R = new Map(rj('v037-refurb.json').items.map((x) => [x.id, x]));
const L = (s) => [...(s ?? '')].length;
const sents = (s) => s.split(/(?<=[.?!])\s+/).filter(Boolean);
const stem = (w) => w.replace(/[.,?!'"‘’“”()·]/g, '').replace(/(으로|에서|에게|까지|부터|이라|라는|이라는|입니다|습니다|었습니다|였습니다|했습니다|합니다|일까요|은|는|이|가|을|를|의|에|로|와|과|도|만)$/, '');
const qs = P.Q.slice(from, to);
await withDb(async (c) => {
  const rows = new Map((await c.query(ROWSQL, [qs.map((q) => +q.id)])).rows.map((r) => [r.id, r]));
  for (const q of qs) {
    const r = rows.get(q.id); const v = R.get(q.id);
    const bw = q.before.replace(/\s/g, '');
    const nw = [...new Set(q.fix_text.split(/\s+/).map(stem).filter((w) => L(w) >= 2 && !bw.includes(w)))];
    console.log(`#${q.id} g${q.grade} [${r.display_answer}]${r.variants.length ? ' ~' + r.variants.join('/') : ''}${v.g030_fixed ? ' G030' : ''}${v.reread ? ' RR' : ''}${v.hint_refit === 'yes' ? ' REFIT' : ''}`);
    console.log(`  전 ${q.before}`);
    console.log(`  후 ${sents(q.fix_text).map((s) => `${s}(${L(s)})`).join(' ')} =${L(q.fix_text)}`);
    if (nw.length) console.log(`  새말 ${nw.join(' ')}`);
    console.log(`  H ${r.general_hint}`);
    console.log(`  E ${r.explanation ?? ''}`);
    if ((v.flags ?? []).length) console.log(`  F ${v.flags.join(' | ')}`);
    if (v.reread_note) console.log(`  RRN ${v.reread_note}`);
  }
});
