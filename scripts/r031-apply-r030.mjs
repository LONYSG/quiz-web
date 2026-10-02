#!/usr/bin/env node
// =============================================================================
// R031 — V004 반영 · 미확인 사실 확인 · 짝 재검 결과를 R030 문항 파일에 쓴다 (★ 적재 전 파일만 고친다)
//
//   입력: data/pipeline/audit/r031-fixes.json  { edits: [{ id, set?, discard?, roundDupOk?, src }] }
//   ★ 고치기 전 값을 question.r031.before 에 남긴다 / 격리는 지우지 않고 question.discarded 에 사유
//   ★ 고친 문항은 노출·조각·빈칸·힌트 검사를 다시 돌린다 — 하나라도 막히면 아무것도 쓰지 않는다
//
// 사용법  node scripts/r031-apply-r030.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../pipeline/lib/question-checks.mjs';
import { checkHint } from './hint-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/pipeline/generated/r030');
const APPLY = process.argv.includes('--apply');
const { edits } = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/r031-fixes.json'), 'utf8'));

const docs = new Map();
const where = new Map();
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
  docs.set(f, d);
  for (const it of d.items) where.set(it.seedId, { f, it });
}
const problems = [];
const touched = new Set();
let nSet = 0, nDisc = 0, nOk = 0;
const seen = new Map();
for (const e of edits) {
  const w = where.get(e.id);
  if (!w) { problems.push(`${e.id}: 문항이 없다`); continue; }
  if (seen.has(e.id) && e.set && seen.get(e.id).set) {
    // 같은 문항에 두 번 — 뒤의 것이 앞의 것을 덮는다 (명시적으로 허용, 기록에 남긴다)
  }
  seen.set(e.id, e);
  const q = w.it.question;
  if (e.set) {
    q.r031 ??= { before: {}, src: [] };
    for (const [k, v] of Object.entries(e.set)) {
      if (!(k in q.r031.before)) q.r031.before[k] = q[k] ?? null;
      q[k] = v;
    }
    q.r031.src.push(e.src);
    if (e.set.generalHint) q.generalHintVersion = 'hint-v3';
    nSet++;
  }
  if (e.roundDupOk) { q.roundDupOk = e.roundDupOk; nOk++; }
  if (e.discard) { q.discarded = { reason: e.discard, at: 'r031', src: e.src }; nDisc++; }
  if (!e.set && !e.discard && !e.roundDupOk) { q.r031 ??= { before: {}, src: [] }; q.r031.src.push(`그대로 — ${e.src}`); }
  touched.add(e.id);
}
// 다시 검사
for (const id of touched) {
  const { it } = where.get(id); const q = it.question;
  if (q.discarded) continue;
  for (const a of [q.answer, ...(q.acceptedAnswers ?? [])]) if (findAnswerInQuestion(q.question, a) === 'word') problems.push(`${id}: 질문에 정답 "${a}" 노출`);
  for (const b of checkHint({ hint: q.question, answer: q.answer, variants: q.acceptedAnswers ?? [] }).block) if (b.kind === 'partial') {
    const before = q.r031?.before?.question;
    const had = before && checkHint({ hint: before, answer: q.answer, variants: q.acceptedAnswers ?? [] }).block.some((x) => x.frag === b.frag);
    if (!had) problems.push(`${id}: 질문에 정답 조각 "${b.frag}" 이 새로 들어갔다`);
  }
  const bc = blankCheck(q.question, q.answer); if (!bc.ok) problems.push(`${id}: 빈칸 ${bc.blanks} ≠ ${bc.answerLength}`);
  if (q.generalHint) {
    const c = checkHint({ hint: q.generalHint, answer: q.answer, variants: q.acceptedAnswers ?? [], question: q.question, explanation: q.explanation ?? '' });
    if (c.block.length) problems.push(`${id}: 힌트 막힘 ${JSON.stringify(c.block)}`);
  }
  if (!/[?？]\s*$/.test(q.question)) problems.push(`${id}: 묻는 문장이 끝에 없다`);
}
console.log(`[r031] 고침 ${nSet} · 격리 ${nDisc} · 같은 소재 통과 ${nOk} · 건드린 문항 ${touched.size}`);
if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
if (!APPLY) { console.log('[r031] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
for (const [f, d] of docs) {
  if (!d.items.some((it) => touched.has(it.seedId))) continue;
  d._meta.r031 = { at: new Date().toISOString(), note: 'V004 반영 · 미확인 사실 확인 · 짝 재검 (data/pipeline/audit/r031-fixes.json)' };
  writeFileSync(path.join(DIR, f), JSON.stringify(d, null, 1) + '\n');
}
console.log('[r031] 썼다');
