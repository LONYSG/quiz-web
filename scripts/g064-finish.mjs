#!/usr/bin/env node
// G064 — g064-plan.json(문장 고르기 + DB before) → data/pipeline/tone/g064-apply.json(문항마다 바뀌는 칸만 before/after · kind ending|rewrite)
//   + data/pipeline/audit/g064-verify-targets.json · 파일만 쓴다
import { readFileSync, writeFileSync } from 'node:fs';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet, findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';
import { endText } from './g064-ending.mjs';
const p = JSON.parse(readFileSync('data/pipeline/tone/g064-plan.json', 'utf8'));
const L = (s) => [...(s ?? '')].length;
// GEN 이 직접 쓴 힌트 · 해설(이유는 보고서 2 · 4절)
const MANUAL = {
  7167: { general_hint: '아폴로 11호와 왕복선을 쏘아 올린 39번 발사대가 있는, 플로리다 동쪽 바닷가의 미국 발사 기지입니다.', why: '새 질문에서 "우주" 가 빠져 옛 힌트의 "우주왕복선 · 우주 기지" 가 정답 조각(H2 막힘)이 됨 → "우주" 만 뺌' },
  19: { general_hint: '주의 행정 중심지는 주노이며, 북아메리카에서 가장 높은 산이 있는 주입니다.', why: '재구성 힌트의 "데날리" — 2025-01 미 연방이 이름을 매킨리산으로 되돌림(알래스카주는 데날리) · 이름 다툼을 피해 산 이름만 뺌' },
  30: { general_hint: '분자 모형에서 큰 공 하나에 작은 공 둘을 붙여 나타냅니다.', why: '"빨간 공 · 회색 공" 색 — ACS 페이지 다시 열어도 본문 빔(못 확인) → 색만 뺌' },
};
const MANUAL_END = { 1593: { general_hint: (s) => s.replace('수십 km 다.', '수십 km입니다.') } };
const SRC = { 19: ['https://ko.wikipedia.org/wiki/알래스카주', 'https://en.wikipedia.org/wiki/Denali'], 30: ['https://en.wikipedia.org/wiki/Properties_of_water'], 50: ['https://en.wikipedia.org/wiki/Olympic_Games', 'https://en.wikipedia.org/wiki/Winter_Olympic_Games'], 202: ['https://ko.wikipedia.org/wiki/제주_화산섬과_용암동굴'], 368: ['https://ko.wikipedia.org/wiki/나트륨'], 1515: ['https://ko.wikipedia.org/wiki/족_(주기율표)'] };
const items = []; const cnt = { question: 0, hintEnding: 0, hintRewrite: 0, explEnding: 0, explRewrite: 0, skippedInactive: [], deactivate: 0 };
const prim = Object.values(p.dbRows).filter((r) => r.is_active).map((r) => ({ id: r.id, norm: normalizeAnswer(r.display_answer) }));
const problems = [];
function field(d, col, after, kind) {
  if (after === undefined || after === d[col]) return undefined;
  return { before: d[col], after, kind };
}
const all = [...Object.values(p.items), ...p.keep.map((id) => ({ id, src: '결과 keep', lane: 'keep' }))];
for (const it of all) {
  const d = p.dbRows[it.id];
  if (!d.is_active) { cnt.skippedInactive.push(it.id); continue; }
  const o = { id: it.id, answer: d.display_answer, src: it.src, lane: it.lane };
  if (it.question && it.question !== d.question_text) { o.question_text = { before: d.question_text, after: it.question, kind: 'rewrite' }; cnt.question++; }
  for (const [col, key] of [['general_hint', 'hint'], ['explanation', 'explanation']]) {
    let after, kind;
    if (MANUAL[it.id]?.[col]) { after = MANUAL[it.id][col]; kind = 'rewrite'; o.why = MANUAL[it.id].why; }
    else if (it[key] !== undefined) { after = it[key]; kind = 'rewrite'; }
    else { after = endText(d[col]).out; kind = 'ending'; if (MANUAL_END[it.id]?.[col]) after = MANUAL_END[it.id][col](after); }
    const f = field(d, col, after, kind);
    if (f) { o[col] = f; cnt[(col === 'general_hint' ? 'hint' : 'expl') + (kind === 'ending' ? 'Ending' : 'Rewrite')]++; }
  }
  if (it.id === 2246) { o.add = ['생명체', '생물체']; o.remove = ['생물상', '생물의 변화', '생물 변화']; }
  if (SRC[it.id]) o.sources = SRC[it.id];
  // 반영 뒤 모습 게이트
  const q = o.question_text?.after ?? d.question_text; const h = o.general_hint?.after ?? d.general_hint; const e = o.explanation?.after ?? d.explanation;
  const vars = [...d.variants.filter((v) => !(o.remove ?? []).includes(v)), ...(o.add ?? [])];
  for (const a of [d.display_answer, ...vars]) if (findAnswerInQuestion(q, a) === 'word' && findAnswerInQuestion(d.question_text, a) !== 'word') problems.push(`${it.id}: 새 질문에 정답 '${a}'`);
  if (L(q) > 200 && L(d.question_text) <= 200) problems.push(`${it.id}: 질문 ${L(q)}자`);
  const g = checkAnswerSet(q, d.display_answer, vars, normalizeAnswer); if (g.blocked.length) problems.push(`${it.id}: 정답 묶음 막힘 ${JSON.stringify(g.blocked)}`); if (g.dropped.some((x) => (o.add ?? []).includes(x.answer))) problems.push(`${it.id}: 변형 떨어짐 ${JSON.stringify(g.dropped)}`);
  if (h) { const ck = checkHint({ hint: h, answer: d.display_answer, variants: vars, question: q, explanation: e ?? '' }); if (ck.block.length) problems.push(`${it.id}: checkHint 막힘 ${JSON.stringify(ck.block)}`); if (L(h) > 120) problems.push(`${it.id}: 힌트 ${L(h)}자`); o._warn = ck.warn.map((w) => w.kind); }
  if (o.question_text || o.general_hint || o.explanation || o.add) items.push(o);
}
const off = Object.entries(p.off).map(([id, name]) => { const d = p.dbRows[id]; if (d.is_active) cnt.deactivate++; return { id: Number(id), answer: d.display_answer, name, deactivate: 'tone-discard G064', before: { is_active: d.is_active, inactive_reason: d.inactive_reason } }; });
for (const it of items) delete it._warn;
const out = { round: 'G064', db_snapshot: p.db, note: '말투 첫 적용 — 결과-06~12(gpt) + 재구성-01 + V052/V053 고친 문장 · 힌트/해설 끝말 · 비활성 3', counts: { ...cnt, skippedInactive: cnt.skippedInactive, items: items.length }, notLoaded: p.notLoaded, deactivate: off, items };
writeFileSync('data/pipeline/tone/g064-apply.json', JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out.counts));
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
// VERIFY 묶음: rewrite 힌트 · 해설 전부 + ending 무작위 60(고정 시드) + 368 · 1515 + 다시 연 출처(19 30 50 202)
let seed = 64; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const isRw = (o) => o.general_hint?.kind === 'rewrite' || o.explanation?.kind === 'rewrite';
const endingOnly = items.filter((o) => !isRw(o) && (o.general_hint || o.explanation));
const pick = []; const pool = [...endingOnly]; while (pick.length < 60 && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
const T = (o, check) => ({ id: o.id, answer: o.answer, check, questionBefore: o.question_text?.before, question: o.question_text?.after, hint: o.general_hint, explanation: o.explanation, sources: o.sources ?? [], why: o.why });
const targets = [
  ...items.filter(isRw).map((o) => T(o, ['rewrite 힌트 · 해설 전수 — 사실 · H2/H3/H10 · 해설과 같은 사실'])),
  ...pick.map((o) => T(o, ['ending 표본 — 끝말만 바뀌었나(뜻 · 낱말 그대로) · 어미 맞춤'])),
  ...items.filter((o) => [368, 1515].includes(o.id)).map((o) => T(o, ['A-2 출처 — GEN 이 연 출처로 질문 사실 확인'])),
];
writeFileSync('data/pipeline/audit/g064-verify-targets.json', JSON.stringify({ round: 'G064', note: 'rewrite 전부 + ending 무작위 60 + 368 · 1515 · 다시 연 출처(19 · 30 · 50 · 202 는 rewrite 안에 sources 로)', targets }, null, 1) + '\n');
console.log('verify targets', targets.length, '(rewrite', items.filter(isRw).length, '· ending', pick.length, ')');
