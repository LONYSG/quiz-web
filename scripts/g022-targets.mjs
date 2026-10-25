// G022 대상 — audit/v028-split.json 의 gen 2,853 을 DB 에서 고정 사본으로 뽑는다 (읽기 전용 · 시작 직후 한 번)
//   출력  data/pipeline/audit/g022-raw/targets.json  items[id] = v027-targets 꼴(사람 결과 없음) + overlap + famSource(지금 3 이상 — V022 · V023 · V025/V026 친숙도)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(`${A}/${f}`, 'utf8'));
const OUT = `${A}/g022-raw/targets.json`;
const S = J('v028-split.json'); const ids = S.gen; const OV = new Set(S.overlap);
const v22 = J('v022-familiarity.json').items; const v23 = J('v023-familiarity.json').items; const cross = J('v023-cross.json');
const v25 = J('v025-results.json').familiarity2; const v26 = J('v026-results.json').familiarity2;
const g19 = { g019a: Object.fromEntries(v25.rows.map((r) => [r.ref, { familiarity: r.second, pct: r.secondPct, gen: r.gen, genPct: r.genPct }])),
  g019b: Object.fromEntries(v26.rows.map((r) => [r.ref, { familiarity: r.second, pct: r.secondPct, gen: r.gen, genPct: r.genPct }])) };
for (const [ref, t] of Object.entries(v25.third ?? {})) Object.assign(g19.g019a[ref] ??= {}, { third: { familiarity: t.familiarity, pct: t.pct } });
for (const [ref, t] of Object.entries(v26.third ?? {})) Object.assign(g19.g019b[ref] ??= {}, { third: { familiarity: t.familiarity, pct: t.pct } });
const famSrc = (id, ref) => {
  const m = /#(g019[ab])-(.+)$/.exec(ref ?? '');
  if (m) { const r = g19[m[1]][m[2]]; return r ? { from: m[1] === 'g019a' ? 'V025' : 'V026', level: r.third?.familiarity ?? r.familiarity, pct: r.third?.pct ?? r.pct, ...(r.third ? { third: true } : {}) } : { from: m[1], missing: true }; }
  const c = cross.mid[id] ?? cross.top[id];
  if (v22[id]) return { from: 'V022', level: v22[id].familiarity, pct: v22[id].pct, ...(c ? { cross: { pct2: c.pct2, second: c.second, confirmed: c.confirmed } } : {}) };
  if (v23[id]) return { from: 'V023', level: v23[id].familiarity, pct: v23[id].pct, ...(c ? { cross: { pct2: c.pct2, second: c.second, confirmed: c.confirmed } } : {}) };
  return null;
};
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.difficulty_score, q.is_active, q.source_ref, ct.mid_name, ct.sub_name, ct.major_name, cg.game_topic from questions q left join categories cg on cg.id=q.category_id left join category_tree ct on ct.category_id=q.category_id where q.id = any($1)`, [ids])).rows;
const vars = (await c.query('select question_id, answer_text, is_primary from question_answers where question_id = any($1)', [ids])).rows;
const activeCount = (await c.query('select count(*)::int n from questions where is_active')).rows[0].n;
await c.end();
const vmap = {}; for (const v of vars) (vmap[v.question_id] ||= []).push(v);
const items = {};
for (const r of rows) items[r.id] = { id: Number(r.id), active: r.is_active, question: r.question_text, answer: r.display_answer, variants: (vmap[r.id] || []).filter((v) => !v.is_primary).map((v) => v.answer_text), explanation: r.explanation, hint: r.general_hint,
  category: [r.major_name, r.mid_name, r.sub_name].filter(Boolean).join(' > '), gameTopic: r.game_topic, curDif: r.difficulty_score, sourceRef: r.source_ref, overlap: OV.has(Number(r.id)), famSource: famSrc(String(r.id), r.source_ref) };
const act = Object.values(items).filter((x) => x.active);
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const out = { builtAt: new Date().toISOString(), activeAtStart: activeCount, split: ids.length, found: rows.length, activeTargets: act.length, overlap: act.filter((x) => x.overlap).length, byDif: cnt(act, (x) => x.curDif),
  famNeeded: act.filter((x) => x.curDif <= 2).length, famSourceBy: cnt(act.filter((x) => x.curDif >= 3), (x) => x.famSource ? x.famSource.from + (x.famSource.missing ? ' 없음' : '') : '없음'), items };
fs.mkdirSync(`${A}/g022-raw`, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const { items: _, ...head } = out; console.log(JSON.stringify(head));
