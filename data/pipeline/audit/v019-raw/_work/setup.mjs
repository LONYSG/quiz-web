// V019 setup — GEN 이 새로 쓴(또는 비운) 힌트 전수 (DB 읽기 전용) → items.json · 힌트 판정 조각 p1~p4 · blind 입력
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const A = 'C:/work/quiz-web/data/pipeline/audit'; const W = A + '/v019-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const g12 = J(A + '/g012-decisions.json').items, g13 = J(A + '/g013-decisions.json').items, g14 = J(A + '/g014-fixes.json'), g15 = J(A + '/g015-fixes.json');
const v15 = J(A + '/v015-active4.json').items;
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.difficulty_score d, q.source_ref, q.is_active,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants from questions q`)).rows;
await c.end();
const byId = new Map(rows.map((r) => [Number(r.id), r]));
const act = rows.filter((r) => r.is_active);
const byRef = new Map(); for (const r of act) { const m = (r.source_ref || '').match(/#g009b-([A-Z0-9]+-\d+)/); if (m) byRef.set(m[1], r); }
const primNorm = new Map(); for (const r of act) { const n = normalizeAnswer(r.display_answer); if (!primNorm.has(n)) primNorm.set(n, []); primNorm.get(n).push(r); }
const targets = new Map(); // id -> {grp, kind, src, sources, why}
const add = (id, o) => { if (!targets.has(id)) targets.set(id, o); else targets.get(id).also = (targets.get(id).also || []).concat(o.grp); };
// g009b 새 힌트 23
for (const [ref, d] of Object.entries(g12)) if (d.newHint) { const r = byRef.get(ref); if (!r) { console.log('MISSING g012', ref); continue; } add(Number(r.id), { grp: 'g009b', kind: 'written', ref, sources: d.hintSources || [], why: d.why, hintNote: d.hintNote }); }
// G013 — 제안 없이 쓴 9 + GEN 이 제안을 고쳐 쓴 6
const gen13 = new Set(['1036', '3516', '4036', '4294', '4550', '4663', '3780', '5330', '5365']); const edit13 = new Set(['989', '2827', '3072', '3773', '3935', '4037']);
for (const [k, d] of Object.entries(g13)) if (d.general_hint && (gen13.has(k) || edit13.has(k))) add(Number(k), { grp: 'g013', kind: gen13.has(k) ? 'written' : 'edited', sources: d.hintSources || [], why: d.why });
// G014 gen 90 (쓴 59 + 비운 31)
for (const p of Object.values(g14.parts)) for (const r of p.rows) if (r.field === 'general_hint' && r.gen) add(r.id, { grp: 'g014', kind: r.after ? 'written' : 'cleared', before: r.before, sources: r.sources || [], why: r.why });
// G015 9
for (const p of Object.values(g15.parts)) for (const r of p.rows) if (r.field === 'general_hint') add(r.id, { grp: 'g015', kind: r.after ? (r.gen ? 'written' : 'edited') : 'cleared', before: r.before, sources: r.sources || [], why: r.why });
const items = [];
for (const [id, t] of targets) {
  const r = byId.get(id); if (!r) { items.push({ id, ...t, missing: true }); continue; }
  const same = (primNorm.get(normalizeAnswer(r.display_answer)) || []).filter((x) => Number(x.id) !== id).map((x) => ({ id: Number(x.id), question: one(x.question_text), explanation: one(x.explanation), hint: one(x.general_hint), d: x.d }));
  const chk = r.general_hint ? checkHint({ hint: r.general_hint, answer: r.display_answer, variants: r.variants || [], question: r.question_text, explanation: r.explanation || '' }) : null;
  items.push({ ...t, id, d: r.d, active: r.is_active, question: one(r.question_text), answer: r.display_answer, variants: r.variants || [], explanation: one(r.explanation), hint: one(r.general_hint), same, warn: chk ? { block: chk.block.map((w) => w.kind), warn: chk.warn.map((w) => w.kind) } : null });
}
items.sort((a, b) => a.grp.localeCompare(b.grp) || a.id - b.id);
fs.writeFileSync(W + '/items.json', JSON.stringify(items, null, 1));
const fmt = (x) => {
  if (x.missing) return `### #${x.id} [${x.grp}] DB 에 없음\n`;
  const kind = { written: '새로 씀', edited: 'GEN 이 제안을 고쳐 씀', cleared: '비움(힌트 없음)' }[x.kind];
  const L = [`### #${x.id}  [${x.grp} · ${kind}]  난이도 ${x.d}${x.active ? '' : ' (비활성)'}`, `Q: ${x.question}`, `A: ${x.answer}${x.variants.length ? '   변형: ' + x.variants.join(' | ') : ''}`, `E: ${x.explanation}`];
  if (x.kind === 'cleared') L.push(`비우기 전 H: ${x.before}`, `비운 사유: ${x.why}`, `H: (없음)`);
  else L.push(`H: ${x.hint}`, `hintSources: ${(x.sources || []).join(' ; ') || '(없음)'}${x.hintNote ? '   hintNote: ' + x.hintNote : ''}`, `GEN 사유: ${one(x.why)}`);
  for (const s of x.same) L.push(`  sameAnswerActive #${s.id}: Q: ${s.question} | E: ${s.explanation} | H: ${s.hint || '(없음)'}`);
  L.push(`hint-check: block=[${x.warn?.block.join(',') ?? ''}] warn=[${x.warn?.warn.join(',') ?? ''}]`, '');
  return L.join('\n');
};
const NP = 4; const per = Math.ceil(items.length / NP); const pieces = [];
for (let i = 0; i < NP; i++) { const a = items.slice(i * per, i * per + per); const name = 'p' + (i + 1); fs.writeFileSync(`${W}/${name}.txt`, `## 힌트 점검 조각 ${name} (${a.length}건)\n\n` + a.map(fmt).join('\n')); fs.writeFileSync(`${W}/${name}.ids.json`, JSON.stringify(a.map((x) => x.id))); pieces.push(name); }
fs.writeFileSync(W + '/pieces.json', JSON.stringify(pieces));
// blind 입력 — 힌트만(비운 것·DB 에 없는 것 제외), 번호는 순서대로 b001…
const bl = items.filter((x) => x.hint && !x.missing); const map = bl.map((x, i) => ({ b: 'b' + String(i + 1).padStart(3, '0'), id: x.id }));
fs.writeFileSync(W + '/blind-map.json', JSON.stringify(map));
fs.writeFileSync(W + '/blind.txt', bl.map((x, i) => `${map[i].b}\t${x.hint}`).join('\n') + '\n');
const cnt = {}; for (const x of items) { const k = x.grp + '/' + x.kind; cnt[k] = (cnt[k] || 0) + 1; }
console.log(JSON.stringify({ items: items.length, missing: items.filter((x) => x.missing).length, blind: bl.length, cnt, activeCount: act.length, pieces, dup: items.filter((x) => x.also).map((x) => x.id) }));
