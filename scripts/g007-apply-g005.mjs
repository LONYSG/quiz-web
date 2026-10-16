#!/usr/bin/env node
// =============================================================================
// G007 — V009 판정을 G005 생성 파일(data/pipeline/generated/g005)에 반영한다 (★ 파일만 쓴다 — 적재는 pipeline-load)
//   g004-apply-g003 의 g007 판.
//
//   입력
//     data/pipeline/audit/v009-results.json   items[ref] — verdict · dif(blind) · difWhy · proposal{question,explanation,hint,variants}
//     tmp/g007/fact-a-out.json                GEN 웹 확인 — 제안 새 사실 (confirmed / rewritten / hold)
//     tmp/g007/fact-b-out.json                GEN 웹 확인 — CV-17 문서로 못 닫은 주장 (closed / knowledge / fix)
//     tmp/g007/hint-out.json                  GEN 이 새로 쓴 힌트 (받지 않은 제안 · 제안 없는 fix)
//     tmp/g007/not-taken.json                 받지 않은 힌트 제안과 사유
//   출력
//     data/pipeline/generated/g005/*.json     문항 갱신 · drop 은 question.discarded
//     data/pipeline/samples/g007-load.json    적재 대상 정리본
//     data/pipeline/audit/g007-fixes.json     행 (ref · field · before · after · by · 사유 · 출처) · notTaken · knowledge
//
// ★ 파일 단계에서 막는다 (G004 와 같다): 줄바꿈 · 힌트 120자 · 두 문장 · checkHint 막힘 · 질문 정답 노출 · 빈칸 · 정답 표기 게이트 · 3~5 힌트 빈 칸
// ★ 멱등: 처음 실행할 때 generated/g005 를 tmp/g007/g005-before/ 에 떠 두고, 늘 그 사본에서 다시 만든다
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnswer } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';
import { findAnswerInQuestion, checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../pipeline/lib/question-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => path.join(ROOT, p);
const J = (p) => JSON.parse(readFileSync(P(p), 'utf8'));
const JO = (p) => (existsSync(P(p)) ? J(p) : []);
const GEN = 'data/pipeline/generated/g005'; const SNAP = 'tmp/g007/g005-before';
if (!existsSync(P(SNAP))) { mkdirSync(P(SNAP), { recursive: true }); cpSync(P(GEN), P(SNAP), { recursive: true }); console.log('[g007] 원본을 떠 둠', SNAP); }

const V9 = J('data/pipeline/audit/v009-results.json').items;
const FA = new Map(JO('tmp/g007/fact-a-out.json').map((o) => [o.ref, o]));
const FB = new Map(JO('tmp/g007/fact-b-out.json').map((o) => [o.ref, o]));
const HO = new Map(JO('tmp/g007/hint-out.json').map((o) => [o.ref, o]));
const NOT_TAKEN = J('tmp/g007/not-taken.json');
// ★ 받지 않는 변형 제안 (CV-16 설계 판단)
// ★ GEN 이 고쳐 받은 힌트 (새 사실 없음)
const TRIM = { 'K2-06': { after: '이 군에는 해발 1,219m의 일월산이 솟아 있다.', why: "CV-17 이 바로잡은 문장의 '고추가 이름난 특산물' 은 영양의 대표 정체(CV-11)라 뺐다" }, 'L3-29': { after: '이 뿌리가 이름에 들어가면 고대 그리스에서는 귀족 집안을 뜻하곤 했다.', why: "제안의 '이 말이' 가 정답 '말' 그대로라(H2 — checkHint 막힘) '이 뿌리가' 로" }, 'S1-10': { after: '연세대 법학과에 입학했고, 1982년 OB 베어스에 1순위로 입단했다.', why: "사실을 바로잡은 문장의 '미국 마이너리그에서 뛰다가' 가 질문을 되풀이해(hint-v5 순서 12) 그 부분을 뺐다" } };
const NOT_TAKEN_VAR = { 'S2-01': "'코비' — B5(불필요한 축약) · CV-16 기본값대로 넣지 않는다" };

const rows = []; const problems = []; const notTaken = []; const knowledge = [];
const row = (ref, field, before, after, by, why, sources = []) => { if (JSON.stringify(before) !== JSON.stringify(after)) rows.push({ ref, field, before, after, by, why, sources }); };
const final = [];
for (const f of readdirSync(P(SNAP)).filter((x) => x.endsWith('.json'))) {
  const doc = JSON.parse(readFileSync(P(`${SNAP}/${f}`), 'utf8'));
  for (const it of doc.items) {
    const q = it.question; const ref = it.seed.ref; const v = V9[ref];
    if (q.discarded) continue; // G005 격리 4 — 그대로
    if (!v) { problems.push(`${ref}: V009 결과 없음`); continue; }
    if (v.verdict === 'drop') { q.discarded = `V009 drop — ${v.reason}`; row(ref, 'discarded', null, 'drop', 'verify', v.reason); continue; }
    const p = v.proposal ?? {}; const fa = FA.get(ref); const fb = FB.get(ref);
    // 질문 · 해설
    for (const [field, key] of [['question', 'question'], ['explanation', 'explanation']]) {
      let after = q[key]; let by = null; let why = null; let src = [];
      if (v.verdict === 'fix' && p[field]) {
        after = p[field]; by = 'verify'; why = `${v.categories.join(',')} — V009 제안`;
        if (fa?.status === 'rewritten' && fa.field === field && fa.text) { after = fa.text; by = 'gen'; why += ` → GEN 이 사실을 다시 열어 고침: ${fa.why}`; }
        else if (fa) why += ` (GEN 웹 확인 ${fa.status})`;
        if (fa?.status === 'hold') { notTaken.push({ ref, what: field, why: `GEN 웹 확인 hold — ${fa.why}` }); after = q[key]; }
        src = [...new Set((fa?.claims ?? []).map((c) => c.url).filter(Boolean))];
      }
      for (const fx of fb?.status === 'fix' ? (fb.fixes ?? []) : []) if (fx.field === field) { after = fx.text; by = 'gen'; why = `CV-17 — 다른 문서로 확인하니 문서와 달라 고침: ${fb.why}`; src = [...new Set(fb.claims.map((c) => c.url).filter(Boolean))]; }
      if (after !== q[key]) { row(ref, field, q[key], after, by, why, src); q[key] = after; }
    }
    // 힌트
    {
      let after = q.generalHint; let by = null; let why = null; let src = []; let note = null;
      if (NOT_TAKEN[ref]) {
        if (p.hint) notTaken.push({ ref, what: 'hint', proposal: p.hint, why: NOT_TAKEN[ref] });
        const h = HO.get(ref); if (!h) { problems.push(`${ref}: GEN 새 힌트(hint-out) 없음`); continue; }
        if (h.hint == null) { if (v.dif >= 3) { notTaken.push({ ref, what: 'hint H8', why: `H8 — ${h.why} · 난이도 ${v.dif} 라 H0 대로 지금 힌트를 둔다` }); } else { after = null; } }
        else { after = h.hint; by = 'gen'; why = `${v.categories.join(',')} — ${p.hint ? '제안을 받지 않고' : '제안 없음 ·'} GEN 이 새로 씀 (hint-v5)`; src = h.hintSources ?? []; note = h.hintNote ?? null; }
      } else if (v.verdict === 'fix' && p.hint) {
        after = p.hint; by = 'verify'; why = `${v.categories.join(',')} — V009 제안`;
        if (fa?.status === 'rewritten' && fa.field === 'hint' && fa.text) { after = fa.text; by = 'gen'; why += ` → GEN 이 사실을 다시 열어 고침: ${fa.why}`; }
        else if (fa) why += ` (GEN 웹 확인 ${fa.status})`;
        if (fa?.status === 'hold') { notTaken.push({ ref, what: 'hint', why: `GEN 웹 확인 hold — ${fa.why}` }); after = q.generalHint; }
        if (TRIM[ref]) { after = TRIM[ref].after; by = 'gen'; why += ` → GEN: ${TRIM[ref].why}`; }
        src = [...new Set([...(fa?.claims ?? []).map((c) => c.url), ...(v.facts ?? []).filter((x) => x.proposal).map((x) => x.source)].filter(Boolean))];
      }
      for (const fx of fb?.status === 'fix' ? (fb.fixes ?? []) : []) if (fx.field === 'hint') { after = fx.text; by = 'gen'; why = `CV-17 — 다른 문서로 확인하니 문서와 달라 고침: ${fb.why}`; src = [...new Set(fb.claims.map((c) => c.url).filter(Boolean))]; }
      if (TRIM[ref] && fb?.status === 'fix' && (fb.fixes ?? []).some((fx) => fx.field === 'hint')) { after = TRIM[ref].after; why += ` → GEN: ${TRIM[ref].why}`; }
      if (after !== q.generalHint) {
        row(ref, 'hint', q.generalHint, after, by, why, src);
        q.generalHint = after; q.generalHintVersion = after ? 'hint-v5' : null;
        q.hintBasis = after ? 'web' : null; q.hintSources = src; if (note) q.hintNote = note;
      }
    }
    // 변형
    if (v.verdict === 'fix' && p.variants) {
      if (NOT_TAKEN_VAR[ref]) notTaken.push({ ref, what: 'variants', proposal: p.variants, why: NOT_TAKEN_VAR[ref] });
      else {
        const after = [...new Set(p.variants.filter((x) => x !== q.answer && normalizeAnswer(x) !== normalizeAnswer(q.answer)))];
        row(ref, 'variants', q.acceptedAnswers, after, 'verify', `${v.categories.join(',')} — V009 제안${ref === 'S1-07' ? ' (CV-16 — 같은 구단의 지금 이름)' : ''}`);
        q.acceptedAnswers = after;
      }
    }
    // CV-17 — 끝내 못 닫은 주장은 지식 근거로 표시(빼지 않는다)
    if (fb?.status === 'knowledge') {
      const kc = fb.knowledgeClaims ?? [];
      q.knowledgeClaims = [...new Set([...(q.knowledgeClaims ?? []), ...kc])];
      if (fb.claims.some((c) => c.where === 'h' && c.result !== 'true')) q.hintBasis = 'knowledge';
      knowledge.push({ ref, claims: kc, hint: fb.claims.some((c) => c.where === 'h' && c.result !== 'true') });
    }
    // 난이도 = V009 blind (CV-14)
    const dif = v.dif; const difWhy = `V009 blind: ${v.difWhy}`;
    if (q.score.dif !== dif) row(ref, 'difficulty', q.score.dif, dif, 'verify', difWhy);
    q.score = { ...q.score, dif, difWhy, easiestCue: v.easiestCue ?? q.score.easiestCue, version: 'score-v2' };
    // ── 미리 막기 (파일 단계)
    const issues = [];
    if (/[\r\n]/.test(`${q.question}${q.explanation}${q.generalHint ?? ''}`)) issues.push('줄바꿈');
    for (const a of [q.answer, ...(q.acceptedAnswers ?? [])]) if (findAnswerInQuestion(q.question, a) === 'word') issues.push(`질문에 정답 '${a}'`);
    if (!blankCheck(q.question, q.answer).ok) issues.push('빈칸 수');
    const g = checkAnswerSet(q.question, q.answer, q.acceptedAnswers ?? [], normalizeAnswer, { originalTitles: q.originalTitleVariants ?? [] });
    if (g?.blocked?.length) issues.push(`표기 게이트 ${JSON.stringify(g.blocked)}`);
    if (q.generalHint) {
      if ([...q.generalHint].length > 120) issues.push('힌트 120자 초과');
      if ((q.generalHint.match(/(?<!(?:^|\s)[A-Z])[.!?](\s|$)/g) ?? []).length > 1) issues.push('힌트 두 문장'); // 이니셜(J. S.)의 마침표는 문장 끝이 아니다
      const c = checkHint({ hint: q.generalHint, answer: q.answer, variants: q.acceptedAnswers ?? [], question: q.question, explanation: q.explanation ?? '' });
      if (c.block.length) issues.push(`checkHint 막힘 ${JSON.stringify(c.block)}`);
    }
    if (dif >= 3 && !q.generalHint) issues.push(`난이도 ${dif} 인데 힌트 없음`);
    if (issues.length) problems.push(`${ref}: ${issues.join(' · ')}`);
    final.push({ ref, topic: it.topic ?? null, seedId: it.seedId, ...it });
  }
  doc._meta.g007 = { at: new Date().toISOString().slice(0, 10), note: 'V009 판정 반영 (scripts/g007-apply-g005.mjs · data/pipeline/audit/g007-fixes.json) — 난이도는 V009 blind' };
  writeFileSync(P(`${GEN}/${f}`), JSON.stringify(doc, null, 1) + '\n');
}
if (problems.length) { for (const x of problems) console.error('★', x); process.exit(1); }
writeFileSync(P('data/pipeline/samples/g007-load.json'), JSON.stringify({ round: 'G007', note: 'G005 493 에 V009 판정 반영 — 적재 대상', count: final.length, items: final }, null, 1) + '\n');
const cnt = {}; for (const r of rows) cnt[`${r.field}/${r.by}`] = (cnt[`${r.field}/${r.by}`] ?? 0) + 1;
writeFileSync(P('data/pipeline/audit/g007-fixes.json'), JSON.stringify({ round: 'G007', note: 'V009 판정을 generated/g005 에 반영 — 되돌리기는 rows[].before 로(또는 tmp 사본 없이 git 이전 판)', counts: cnt, rows, notTaken, knowledge }, null, 1) + '\n');
console.log(`[g007] 최종 ${final.length} · 행 ${rows.length}`, cnt, '· 받지 않음', notTaken.length, '· 지식 근거', knowledge.length);
