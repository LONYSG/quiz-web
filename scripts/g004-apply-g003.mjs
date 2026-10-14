#!/usr/bin/env node
// =============================================================================
// G004 B — V007 판정을 G003 생성 파일(data/pipeline/generated/g003)에 반영한다 (★ 파일만 쓴다 — 적재는 pipeline-load)
//
//   입력
//     data/pipeline/audit/v007-results.json   g003[ref] — verdict · proposal{question,explanation,hint,variants,layer} · score{dif,difWhy}
//     tmp/g004/out-f.jsonl                    GEN 웹 확인 — 제안 속 새 사실이 있는 fix 40 (confirmed / rewritten / hold)
//     tmp/g004/out-v.jsonl                    변형 추가 후보의 한국 표기 확인 (add / skip)
//     tmp/g004/gen-own.json                   GEN 이 직접 쓴 것 (A2-01 drop · C2-05 질문)
//   출력
//     data/pipeline/generated/g003/*.json     문항 갱신 · drop 은 question.discarded
//     data/pipeline/samples/g004-deep.json    최종 정리본 (적재 대상)
//     data/pipeline/audit/g004-fixes.json     g003 행 (ref · field · before · after · by · 사유 · 출처) — C 단계가 db 행을 더한다
//
// ★ 파일 단계에서 막는다 (G002 · 브리핑): 줄바꿈 · 힌트 120자 · 두 문장 · checkHint 막힘 · 질문 정답 노출 · 빈칸 · 정답 표기 게이트
// ★ 멱등: 처음 실행할 때 generated/g003 를 tmp/g004/g003-before/ 에 떠 두고, 늘 그 사본에서 다시 만든다
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnswer } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';
import { findAnswerInQuestion, checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck, answerFragments } from '../pipeline/lib/question-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => path.join(ROOT, p);
const J = (p) => JSON.parse(readFileSync(P(p), 'utf8'));
const L = (p) => existsSync(P(p)) ? readFileSync(P(p), 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x)) : [];
const GEN = 'data/pipeline/generated/g003'; const SNAP = 'tmp/g004/g003-before';
if (!existsSync(P(SNAP))) { mkdirSync(P(SNAP), { recursive: true }); cpSync(P(GEN), P(SNAP), { recursive: true }); console.log('[g004-b] 원본을 떠 둠', SNAP); }

const V7 = J('data/pipeline/audit/v007-results.json').g003;
const F = new Map(L('tmp/g004/out-f.jsonl').map((o) => [o.key, o]));
const VV = L('tmp/g004/out-v.jsonl');
const OWN = J('tmp/g004/gen-own.json').g003;
// ★ 받지 않는 제안 (사유와 함께 — 보고서)
const NOT_TAKEN = {
  'P2-02:variants': "V007 은 'Formica' 를 변형에서 빼고 originalTitleVariants 에만 두라 했지만, 적재는 변형(acceptedAnswers)만 정답으로 넣는다 — 빼면 Formica 를 친 사람이 오답. 상표가 영어인 대상이라 B10 대로 변형에 둔다",
};
const LAYER_TO_PUBLIC = ['M1-22', 'M1-24', 'M2-10']; // 결정 5 (CV-01)

const rows = []; const problems = []; const notTaken = [];
const row = (ref, field, before, after, by, why, sources = []) => { if (JSON.stringify(before) !== JSON.stringify(after)) rows.push({ ref, field, before, after, by, why, sources }); };
const files = readdirSync(P(SNAP)).filter((f) => f.endsWith('.json'));
const final = [];
for (const f of files) {
  const doc = JSON.parse(readFileSync(P(`${SNAP}/${f}`), 'utf8'));
  for (const it of doc.items) {
    const q = it.question; const ref = it.seed.ref; const v = V7[ref];
    if (q.discarded) continue; // G003 격리 10 — 그대로
    if (!v) { problems.push(`${ref}: V007 결과 없음`); continue; }
    // drop
    const ownDrop = OWN[ref]?.drop;
    if (v.verdict === 'drop' && ref !== 'M1-14') { q.discarded = `V007 drop — ${v.reason}`; row(ref, 'discarded', null, 'drop', 'verify', v.reason); continue; }
    if (ownDrop) { q.discarded = `G004 drop — ${ownDrop}`; row(ref, 'discarded', null, 'drop', 'gen', ownDrop); continue; }
    if (ref === 'M1-14') notTaken.push({ ref, what: 'verdict drop', why: '결정 7(CV-08) — 이태원 클라쓰는 한국 레전드 → ok, 층 팬 세부 그대로' });
    const p = v.proposal ?? {}; const fo = F.get(ref);
    // 질문 · 해설 · 힌트
    for (const [field, key] of [['question', 'question'], ['explanation', 'explanation'], ['hint', 'generalHint']]) {
      let after = q[key]; let by = null; let why = null; let src = [];
      if (v.verdict === 'fix' && p[field] != null) {
        if (fo) {
          if (fo.status === 'hold') { notTaken.push({ ref, what: field, why: `GEN 웹 확인 hold — ${fo.why}` }); continue; }
          after = fo[field] ?? p[field]; by = fo.status === 'rewritten' && fo[field] && fo[field] !== p[field] ? 'gen' : 'verify';
          why = `${v.categories.join(',')} — ${by === 'gen' ? 'GEN 다시 씀: ' + fo.why : 'V007 제안(GEN 웹 확인 ' + fo.status + ')'}`;
          src = [...new Set((fo.facts ?? []).map((x) => x.url).filter(Boolean))];
        } else { after = p[field]; by = 'verify'; why = `${v.categories.join(',')} — V007 제안(새 사실 없음)`; src = v.proposalSource ? [v.proposalSource] : []; }
      }
      if (field === 'question' && OWN[ref]?.question) { after = OWN[ref].question; by = 'gen'; why = OWN[ref].why; src = OWN[ref].sources ?? []; }
      if (after !== q[key]) { row(ref, field, q[key], after, by, why, src); q[key] = after; if (field === 'hint') q.generalHintVersion = 'hint-v3+v007'; } // V007 판정으로 바뀐 힌트 (G002 의 hint-v3+v006 과 같은 방식)
    }
    if (p.dropHint) { row(ref, 'hint', q.generalHint, null, 'verify', v.reason); q.generalHint = null; q.generalHintVersion = null; }
    // 변형
    if (v.verdict === 'fix' && p.variants) {
      if (NOT_TAKEN[`${ref}:variants`]) notTaken.push({ ref, what: 'variants', why: NOT_TAKEN[`${ref}:variants`] });
      else {
        const skip = new Set(VV.filter((x) => x.key === ref && x.decision === 'skip').map((x) => x.variant));
        const after = p.variants.filter((x) => !skip.has(x) && x !== q.answer && normalizeAnswer(x) !== normalizeAnswer(q.answer));
        for (const x of p.variants) if (skip.has(x)) notTaken.push({ ref, what: `변형 '${x}'`, why: `한국 표기 확인 skip — ${VV.find((y) => y.key === ref && y.variant === x).why}` });
        const src = VV.filter((x) => x.key === ref && x.decision === 'add').flatMap((x) => x.urls ?? []);
        row(ref, 'variants', q.acceptedAnswers, after, 'verify', `${v.categories.join(',')} — ${v.reason.slice(0, 120)}`, src);
        q.acceptedAnswers = after;
      }
    }
    // 층 (결정 5)
    if (LAYER_TO_PUBLIC.includes(ref) && q.layer !== '대중') { row(ref, 'layer', q.layer, '대중', 'verify', '결정 5(CV-01) — 국민 밈에 가까운 팬 세부는 층 표시의 문제'); q.layer = '대중'; }
    // 난이도 = V007 재채점
    const dif = v.score.dif; const difWhy = `V007: ${v.score.difWhy}`;
    if (q.score.dif !== dif) row(ref, 'difficulty', q.score.dif, dif, 'verify', difWhy);
    q.score = { ...q.score, dif, difWhy, version: 'score-v2' };
    // ── 미리 막기 (파일 단계)
    const issues = [];
    if (/[\r\n]/.test(`${q.question}${q.explanation}${q.generalHint ?? ''}`)) issues.push('줄바꿈');
    for (const a of [q.answer, ...(q.acceptedAnswers ?? [])]) if (findAnswerInQuestion(q.question, a) === 'word') issues.push(`질문에 정답 '${a}'`);
    if (!blankCheck(q.question, q.answer).ok) issues.push('빈칸 수');
    const g = checkAnswerSet(q.question, q.answer, q.acceptedAnswers ?? [], normalizeAnswer, { originalTitles: q.originalTitleVariants ?? [] });
    if (g?.blocked?.length) issues.push(`표기 게이트 ${JSON.stringify(g.blocked)}`);
    if (q.generalHint) {
      if ([...q.generalHint].length > 120) issues.push('힌트 120자 초과');
      if ((q.generalHint.match(/[.!?](\s|$)/g) ?? []).length > 1) issues.push('힌트 두 문장');
      const c = checkHint({ hint: q.generalHint, answer: q.answer, variants: q.acceptedAnswers ?? [], question: q.question, explanation: q.explanation ?? '' });
      if (c.block.length) issues.push(`checkHint 막힘 ${JSON.stringify(c.block)}`);
    }
    if (dif >= 3 && !q.generalHint) issues.push(`난이도 ${dif} 인데 힌트 없음`);
    if (issues.length) problems.push(`${ref}: ${issues.join(' · ')}`);
    const fr = answerFragments(q.question, q.answer).map((x) => x.frag);
    final.push({ ref, seedId: it.seedId, topic: v.topic, mid: v.mid, sub: doc._meta.subName, fragWarn: fr, ...it });
  }
  doc._meta.g004 = { at: new Date().toISOString().slice(0, 10), note: 'V007 판정 반영 (scripts/g004-apply-g003.mjs · data/pipeline/audit/g004-fixes.json)' };
  doc._meta.scorePrompt = 'score-v1 → V007 재채점(score-v2 읽기)';
  writeFileSync(P(`${GEN}/${f}`), JSON.stringify(doc, null, 1) + '\n');
}
if (problems.length) { for (const x of problems) console.error('★', x); process.exit(1); }
writeFileSync(P('data/pipeline/samples/g004-deep.json'), JSON.stringify({ round: 'G004', note: 'G003 490 에 V007 판정 반영 — 적재 대상', count: final.length, items: final }, null, 1) + '\n');
const fx = P('data/pipeline/audit/g004-fixes.json');
const prev = existsSync(fx) ? JSON.parse(readFileSync(fx, 'utf8')) : { round: 'G004', rows: { g003: [], db: [] } };
prev.rows.g003 = rows; prev.notTaken = notTaken;
writeFileSync(fx, JSON.stringify(prev, null, 1) + '\n');
const cnt = {}; for (const r of rows) cnt[`${r.field}/${r.by}`] = (cnt[`${r.field}/${r.by}`] ?? 0) + 1;
console.log(`[g004-b] 최종 ${final.length} · 행 ${rows.length}`, cnt, '· 받지 않음', notTaken.length);
