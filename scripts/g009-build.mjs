#!/usr/bin/env node
// =============================================================================
// G009 — 상(4) 생성 3차(두 묶음 g009a · g009b)를 적재 게이트 형식 파일로 만든다 (★ DB 를 쓰지 않는다 — 적재는 V013 뒤 G010)
//   g005-build.mjs 의 g009 판. 흐름 같음: 생성 직후 채점(score1) → 3 이하 한 번 고침(rewrite) → 다른 채점자가 다시(score) → 힌트
//   다른 점: 묶음 인자(--round) · deep-v5 / media-v3 · score-v3 · hint-v5 · 2회차는 1회차 문항(id · 질문 · 해설 · 힌트)을 VERIFY 묶음에 같이 · 낱말 뜻 꼴 · 취미 세부 표시
//
//   node scripts/g009-build.mjs --round g009a   (또는 g009b)
//   입력 (작업 폴더 tmp/g009/<round>/ — .gitignore)
//     final.json             생성 초안 + 중앙 기계 검사 + score1 · rewrite · score (tmp/g009/tools/stage.mjs <round> final)
//     hint-out-*.json        hint-v5 일반 힌트 (최종 난이도 3~5 · 알 가치 기준 통과 전부)
//     flow.json              묶음별 흐름 · 쓰기 전 버린 소재 (선택)
//     tmp/g009/active.json   활성 사본 — 2회차의 1회차 문항
//   출력
//     data/pipeline/generated/<round>/<midKey>-<n>.json   pipeline-load --round <round> --gate-only 가 읽는다
//     data/pipeline/samples/<round>-deep.json             한 파일 정리본
//     data/pipeline/audit/<round>-verify-targets.json     VERIFY(V013) 묶음
//   ★ 접근성은 문항마다 매기지 않는다 — data/pipeline/criteria/mid-accessibility.json (15 §5-3 · D-111)
//   ★ 멱등: 같은 입력이면 같은 출력. generated/<round> 의 이전 파일은 지우고 다시 쓴다
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMid } from '../pipeline/dist/categories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUND = process.argv[process.argv.indexOf('--round') + 1];
if (!/^g009[ab]$/.test(ROUND ?? '')) { console.error('사용법: node scripts/g009-build.mjs --round g009a|g009b'); process.exit(1); }
const WORK = path.join(ROOT, 'tmp/g009', ROUND);
const T = (p) => path.join(WORK, p);
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const F = J(T('final.json'));
const readAll = (pre) => readdirSync(WORK).filter((f) => f.startsWith(pre) && f.endsWith('.json')).flatMap((f) => J(T(f)));
const HI = new Map(readAll('hint-out-').map((h) => [h.ref, h]));
const ACC = new Map(J(path.join(ROOT, 'data/pipeline/criteria/mid-accessibility.json')).mids.map((m) => [m.midKey, m]));
const ACT = new Map(J(path.join(ROOT, 'tmp/g009/active.json')).map((r) => [Number(r.id), r]));
const changed = (it) => !!(it.rewrite && !it.rewrite.skipped && it.question !== it.rewrite.before);
const sc = (s) => (s ? { dif: s.dif, easiestCue: s.easiestCue ?? null, difWhy: s.difWhy, wor: s.wor, worWhy: s.worWhy } : null);

const problems = [];
const bySub = new Map();
const flat = [];
for (const it of F) {
  const s = it.score; const h = HI.get(it.ref); const a = ACC.get(it.mid);
  if (!s) { problems.push(`${it.ref}: 점수 없음`); continue; }
  if (!a) { problems.push(`${it.ref}: 중분류 접근성 없음 ${it.mid}`); continue; }
  const minW = it.topic === 'media' ? 2 : 3;
  if (s.dif >= 3 && !h?.hint && s.wor >= minW) { problems.push(`${it.ref}: 난이도 ${s.dif} 인데 힌트 없음`); continue; } // 격리될 것(알 가치 미달)은 힌트를 쓰지 않았다
  const [midKey, n] = it.subId.split('/');
  const first = it.mode === '가' && it.pairedWith ? ACT.get(Number(it.pairedWith)) : null;
  if (it.mode === '가' && !first) { problems.push(`${it.ref}: 2회차의 1회차 #${it.pairedWith} 가 활성에 없음`); continue; }
  const q = {
    ok: true, mode: it.mode, pairedWith: it.pairedWith ?? null,
    question: it.question, answer: it.answer, acceptedAnswers: it.acceptedAnswers ?? [], originalTitleVariants: it.originalTitleVariants ?? [],
    variantCheck: it.variantCheck ?? null,
    explanation: it.explanation,
    score: { version: 'score-v3', dif: s.dif, easiestCue: s.easiestCue ?? null, difWhy: s.difWhy, wor: s.wor, worWhy: s.worWhy, acc: a.acc, accWhy: a.accWhy },
    score1: sc(it.score1),
    rewrite: it.rewrite ? { changed: changed(it), before: changed(it) ? it.rewrite.before : null, beforeExplanation: changed(it) ? (it.rewrite.beforeExplanation ?? null) : null,
      removedCue: it.rewrite.removedCue ?? null, addedCue: it.rewrite.addedCue ?? null, why: it.rewrite.skipped ?? it.rewrite.why ?? null } : null,
    generalHint: h?.hint ?? null, generalHintVersion: h?.hint ? 'hint-v5' : null,
    ...(it.layer ? { layer: it.layer, genre: it.genre ?? null, work: it.work ?? null } : {}),
    hobby: it.hobby ?? null, defForm: !!it.defForm,
    sources: it.sources ?? [], facts: it.facts ?? [], knowledgeClaims: it.knowledgeClaims ?? [],
    hintBasis: h?.hint ? (h.hintBasis ?? null) : null, hintSources: h?.hintSources ?? [], hintNote: h?.hintNote ?? null,
    easiestCue: it.easiestCue ?? null, targetWhy: it.targetWhy ?? null,
    selfJudge: it.selfJudge ?? null, selfJudgeWhy: it.selfJudgeWhy ?? null,
    pairCheck: it.pairCheck ?? null, dbCheck: it.dbCheck ?? null, warn: it.warn ?? [],
    ...(first ? { first: { id: Number(first.id), question: first.question_text, explanation: first.explanation, hint: first.general_hint, difficulty: first.d } } : {}),
  };
  // ★ 선별 게이트(15 §6 S2 · §5-2 미디어 예외)에 걸리는 것은 격리 — 파일에는 남기고(게이트가 건너뛴다) VERIFY 묶음·정리본에서는 뺀다
  if (s.wor < minW) q.discarded = `선별 게이트 — 알 가치 ${s.wor} (${s.worWhy}) · ${it.topic} 는 ${minW} 이상`;
  const rec = { seedId: `${it.subId}#${ROUND}-${it.ref}`, seed: { subject: it.work ?? it.answer, aspect: it.layer ?? null, ref: it.ref, pairedWith: it.pairedWith ?? null }, question: q };
  if (!bySub.has(it.subId)) bySub.set(it.subId, { midKey, n, subName: it.sub, items: [] });
  bySub.get(it.subId).items.push(rec);
  if (!q.discarded) flat.push({ ref: it.ref, topic: it.topic, mid: it.mid, sub: it.sub, subId: it.subId, ...rec });
}
if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }

const dir = path.join(ROOT, 'data/pipeline/generated', ROUND);
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
for (const [subId, g] of [...bySub].sort()) {
  const mid = findMid(g.midKey);
  if (mid.subs[Number(g.n) - 1] !== g.subName) throw new Error(`소분류 이름 불일치 ${subId}`);
  writeFileSync(path.join(dir, `${g.midKey}-${g.n}.json`), JSON.stringify({
    _meta: { round: ROUND, subId, midKey: g.midKey, subName: g.subName, questionPrompt: g.items[0].question.layer ? 'media-v3' : 'deep-v5',
      scorePrompt: 'score-v3', hintPrompt: 'hint-v5', generator: 'claude-opus-5-5', questionGenerator: 'claude-opus-5-5', stage: 'deep',
      note: `G009 — 상(4) 생성 3차 ${ROUND}(생성 직후 채점 · 3 이하 한 번 고침). 적재하지 않았다 — V013 판정 뒤 G010 이 적재한다 (data/pipeline/audit/${ROUND}-verify-targets.json)` },
    items: g.items }, null, 1) + '\n');
}
writeFileSync(path.join(ROOT, `data/pipeline/samples/${ROUND}-deep.json`), JSON.stringify({ round: ROUND.toUpperCase(), count: flat.length, items: flat }, null, 1) + '\n');

const targets = flat.map((f) => ({
  ref: f.ref, round: ROUND, seedId: f.seedId, topic: f.topic, mid: f.mid, sub: f.sub,
  method: f.question.mode, pairedWith: f.question.pairedWith, first: f.question.first ?? null, layer: f.question.layer ?? null, work: f.question.work ?? null, hobby: f.question.hobby, defForm: f.question.defForm,
  question: f.question.question, answer: f.question.answer, variants: f.question.acceptedAnswers, originalTitleVariants: f.question.originalTitleVariants, variantCheck: f.question.variantCheck,
  explanation: f.question.explanation, hint: f.question.generalHint,
  rewrite: f.question.rewrite, score1: f.question.score1, score: f.question.score,
  sources: f.question.sources, facts: f.question.facts, knowledgeClaims: f.question.knowledgeClaims,
  hintBasis: f.question.hintBasis, hintSources: f.question.hintSources, hintNote: f.question.hintNote,
  easiestCue: f.question.easiestCue, targetWhy: f.question.targetWhy,
  selfJudge: f.question.selfJudge, selfJudgeWhy: f.question.selfJudgeWhy, dbCheck: f.question.dbCheck, pairCheck: f.question.pairCheck,
  check: ['사실(질문·해설 — facts 의 url · note 와 글자 대조)', '정답 유일성·한정어(3-1 · 3-2)', '2회차면 1회차 질문·해설·힌트와 같은 사실 · 범주 단서(3-3 — first 칸)', '난이도 blind 재채점(score-v3 — 질문의 모든 문장 · 가장 쉬운 충분 단서)', '고친 것(rewrite)은 고친 뒤 유일성 · 새 사실', '알 가치', '변형(한국 표기 · B2 · B7 · A5)', '힌트 세기(H9 · MD9) · H2 한 글자 조각 · H7 · H10 반대 꼴 · H12 · removedCue 되살림', '전역 중복(9장)'],
  criteria: f.topic === 'media' ? '15 §7-1 MD1~MD11 · §5-1 · §5-2 미디어 예외 · §4-1' : '15 §2 · §3 · §3-2 · §3-3 · §4-1 · §5-1',
}));
writeFileSync(path.join(ROOT, `data/pipeline/audit/${ROUND}-verify-targets.json`), JSON.stringify({ round: ROUND.toUpperCase(), note: `V013 판정 대상 — 적재 전. facts[] 는 생성·고침 에이전트가 WebFetch 로 연 문서 · score1 = 생성 직후 채점 · score = 최종(고친 것은 다른 채점자) · first = 2회차의 1회차 문항(질문·해설·힌트)`, count: targets.length, targets }, null, 1) + '\n');
if (existsSync(T('flow.json'))) writeFileSync(path.join(ROOT, `data/pipeline/audit/${ROUND}-flow.json`), JSON.stringify(J(T('flow.json')), null, 1) + '\n');
const disc = [...bySub.values()].flatMap((g) => g.items).filter((r) => r.question.discarded);
console.log(`[g009-build ${ROUND}] 격리 ${disc.length}건: ${disc.map((r) => r.seed.ref).join(' ')}`);
console.log(`[g009-build ${ROUND}] ${flat.length}건 · 파일 ${bySub.size} · 힌트 ${flat.filter((f) => f.question.generalHint).length} · 상 ${flat.filter((f) => f.question.score.dif >= 4).length}`);
