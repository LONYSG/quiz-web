#!/usr/bin/env node
// =============================================================================
// G003 — 상(4~5) 생성 1차를 적재 게이트 형식 파일로 만든다 (★ DB 를 쓰지 않는다 — 적재는 V007 뒤 G004)
//
//   입력 (작업 폴더 tmp/g003/ — .gitignore)
//     merged.json            생성 초안 + 중앙 기계 검사 결과 (drop[] 이 빈 것만 쓴다)
//     score-out-*.json       score-v1 채점 (생성자와 다른 하위 에이전트 · 분야 섞어)
//     hint-out-*.json        hint-v3 일반 힌트 (난이도 3~5 전부)
//   출력
//     data/pipeline/generated/g003/<midKey>-<n>.json   pipeline-load --round g003 --gate-only 가 읽는다
//     data/pipeline/samples/g003-deep.json             한 파일 정리본 (사람이 읽기용)
//     data/pipeline/audit/g003-verify-targets.json     VERIFY(V007) 묶음
//   ★ 접근성은 문항마다 매기지 않는다 — data/pipeline/criteria/mid-accessibility.json (15 §5-3 · D-111)
//   ★ 멱등: 같은 입력이면 같은 출력. generated/g003 의 이전 파일은 지우고 다시 쓴다
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMid } from '../pipeline/dist/categories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = (p) => path.join(ROOT, 'tmp/g003', p);
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const M = J(T('merged.json')).filter((i) => !i.drop.length);
const readAll = (pre) => readdirSync(path.join(ROOT, 'tmp/g003')).filter((f) => f.startsWith(pre) && f.endsWith('.json')).flatMap((f) => J(T(f)));
const SC = new Map(readAll('score-out-').map((s) => [s.ref, s]));
const HI = new Map(readAll('hint-out-').map((h) => [h.ref, h]));
const ACC = new Map(J(path.join(ROOT, 'data/pipeline/criteria/mid-accessibility.json')).mids.map((m) => [m.midKey, m]));

const problems = [];
const bySub = new Map();
const flat = [];
for (const it of M) {
  const s = SC.get(it.ref); const h = HI.get(it.ref); const a = ACC.get(it.mid);
  if (!s) { problems.push(`${it.ref}: 점수 없음`); continue; }
  if (!a) { problems.push(`${it.ref}: 중분류 접근성 없음 ${it.mid}`); continue; }
  if (s.dif >= 3 && !h?.hint) { problems.push(`${it.ref}: 난이도 ${s.dif} 인데 힌트 없음`); continue; }
  const [midKey, n] = it.subId.split('/');
  const q = {
    ok: true, mode: it.mode, pairedWith: it.pairedWith ?? null,
    question: it.question, answer: it.answer, acceptedAnswers: it.acceptedAnswers ?? [], originalTitleVariants: it.originalTitleVariants ?? [],
    explanation: it.explanation,
    score: { version: 'score-v1', dif: s.dif, difWhy: s.difWhy, wor: s.wor, worWhy: s.worWhy, acc: a.acc, accWhy: a.accWhy },
    generalHint: h?.hint ?? null, generalHintVersion: h?.hint ? 'hint-v3' : null,
    ...(it.layer ? { layer: it.layer, genre: it.genre ?? null, work: it.work ?? null } : {}),
    sources: it.sources ?? [], facts: it.facts ?? [], knowledgeClaims: it.knowledgeClaims ?? [],
    hintBasis: h?.hint ? (h.hintBasis ?? null) : null, hintSources: h?.hintSources ?? [],
    selfJudge: it.selfJudge ?? null, selfJudgeWhy: it.selfJudgeWhy ?? null, targetWhy: it.targetWhy ?? null,
    pairCheck: it.pairCheck ?? null, dbCheck: it.dbCheck ?? null, warn: it.warn ?? [],
  };
  // ★ 선별 게이트(15 §6 S2 · §5-2 미디어 예외)에 걸리는 것은 격리한다 — 파일에는 남기고(게이트가 건너뛴다) VERIFY 묶음·정리본에서는 뺀다
  const minW = it.topic === 'media' ? 2 : 3;
  if (s.wor < minW) q.discarded = `선별 게이트 — 알 가치 ${s.wor} (${s.worWhy}) · ${it.topic} 는 ${minW} 이상`;
  const rec = { seedId: `${it.subId}#g003-${it.ref}`, seed: { subject: it.work ?? it.answer, aspect: it.layer ?? null, ref: it.ref, pairedWith: it.pairedWith ?? null }, question: q };
  if (!bySub.has(it.subId)) bySub.set(it.subId, { midKey, n, subName: it.sub, items: [] });
  bySub.get(it.subId).items.push(rec);
  if (!q.discarded) flat.push({ ref: it.ref, topic: it.topic, mid: it.mid, sub: it.sub, subId: it.subId, ...rec });
}
if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }

const dir = path.join(ROOT, 'data/pipeline/generated/g003');
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
for (const [subId, g] of [...bySub].sort()) {
  const mid = findMid(g.midKey);
  if (mid.subs[Number(g.n) - 1] !== g.subName) throw new Error(`소분류 이름 불일치 ${subId}`);
  writeFileSync(path.join(dir, `${g.midKey}-${g.n}.json`), JSON.stringify({
    _meta: { round: 'g003', subId, midKey: g.midKey, subName: g.subName, questionPrompt: g.items[0].question.layer ? 'media-v2' : 'deep-v3',
      scorePrompt: 'score-v1', hintPrompt: 'hint-v3', generator: 'claude-opus-5-5', questionGenerator: 'claude-opus-5-5', stage: 'deep',
      note: 'G003 — 상(4~5) 생성 1차. 적재하지 않았다 — V007 판정 뒤 G004 가 적재한다 (data/pipeline/audit/g003-verify-targets.json)' },
    items: g.items }, null, 1) + '\n');
}
writeFileSync(path.join(ROOT, 'data/pipeline/samples/g003-deep.json'), JSON.stringify({ round: 'G003', count: flat.length, items: flat }, null, 1) + '\n');

// VERIFY 묶음 — 브리핑 E 의 항목
const targets = flat.map((f) => ({
  ref: f.ref, seedId: f.seedId, topic: f.topic, mid: f.mid, sub: f.sub,
  method: f.question.mode, pairedWith: f.question.pairedWith, layer: f.question.layer ?? null, work: f.question.work ?? null,
  question: f.question.question, answer: f.question.answer, variants: f.question.acceptedAnswers, originalTitleVariants: f.question.originalTitleVariants,
  explanation: f.question.explanation, hint: f.question.generalHint,
  score: f.question.score, sources: f.question.sources, facts: f.question.facts, knowledgeClaims: f.question.knowledgeClaims,
  hintBasis: f.question.hintBasis, hintSources: f.question.hintSources,
  selfJudge: f.question.selfJudge, selfJudgeWhy: f.question.selfJudgeWhy, dbCheck: f.question.dbCheck, pairCheck: f.question.pairCheck,
  check: ['사실(질문·해설 — facts 의 url 대조)', '정답 유일성·한정어(3-1 · 3-2)', '2회차면 같은 사실 아닌가(3-3)', '난이도·알 가치(score-v1)', '힌트 세기(H9 · MD9)', '다른 이름 · 정답이 아닌 이름으로 유도(H10 · Q-109 가)', '같은 정답 활성 문항과 같은 사실(Q-109 나)', '전역 중복(9장)'],
  criteria: f.topic === 'media' ? '15 §7-1 MD1~MD11 · §5-2 미디어 예외 · §4-1' : '15 §3 · §3-2 · §3-3 · §4-1 · §5',
}));
writeFileSync(path.join(ROOT, 'data/pipeline/audit/g003-verify-targets.json'), JSON.stringify({ round: 'G003', note: 'V007 판정 대상 — 적재 전. 항목마다 facts[] 는 생성 에이전트가 WebFetch 로 연 문서', count: targets.length, targets }, null, 1) + '\n');
const disc = [...bySub.values()].flatMap((g) => g.items).filter((r) => r.question.discarded);
console.log(`[g003-build] 격리 ${disc.length}건: ${disc.map((r) => r.seed.ref).join(' ')}`);
console.log(`[g003-build] ${flat.length}건 · 파일 ${bySub.size} · 힌트 ${flat.filter((f) => f.question.generalHint).length}`);
