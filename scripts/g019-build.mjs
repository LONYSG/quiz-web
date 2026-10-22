#!/usr/bin/env node
// =============================================================================
// G019 — 상(4) 생성 4차(두 묶음 g019a · g019b)를 적재 게이트 형식 파일로 만든다 (★ DB 를 쓰지 않는다 — 적재는 V024 뒤 다음 G)
//   g009-build.mjs 의 g019 판. 흐름: 생성 → ★ 정답 친숙도 판정(scripts/g019-familiarity.mjs — 1 은 격리) → 채점(score1) → 3 이하 한 번 고침 → 다시 채점 → 힌트(hint-v6) → blind 자기 점검
//   다른 점: familiarity(판정자 값 · 생성자 어림) · identity · 친숙도 1 은 discarded("친숙도 1") 로 파일에 남김 · blind(힌트만 맞혀 보기) · hint-v6
//
//   node scripts/g019-build.mjs --round g019a   (또는 g019b)
//   입력 (작업 폴더 tmp/g019/<round>/ — .gitignore)
//     final.json             생성 초안 + 중앙 기계 검사 + score1 · rewrite · score (tmp/g019/tools/stage.mjs <round> final)
//     hint-out-*.json        hint-v6 일반 힌트 (최종 난이도 3~5 · 알 가치 기준 통과 전부)
//     flow.json              묶음별 흐름 · 쓰기 전 버린 소재 (선택)
//     tmp/g019/active.json   활성 사본 — 2회차의 1회차 문항
//   출력
//     data/pipeline/generated/<round>/<midKey>-<n>.json   pipeline-load --round <round> --gate-only 가 읽는다
//     data/pipeline/samples/<round>-deep.json             한 파일 정리본
//     data/pipeline/audit/<round>-verify-targets.json     VERIFY(V024) 묶음
//   ★ 접근성은 문항마다 매기지 않는다 — data/pipeline/criteria/mid-accessibility.json (15 §5-3 · D-111)
//   ★ 멱등: 같은 입력이면 같은 출력. generated/<round> 의 이전 파일은 지우고 다시 쓴다
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMid } from '../pipeline/dist/categories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUND = process.argv[process.argv.indexOf('--round') + 1];
if (!/^g019[ab]$/.test(ROUND ?? '')) { console.error('사용법: node scripts/g019-build.mjs --round g019a|g019b'); process.exit(1); }
const WORK = path.join(ROOT, 'tmp/g019', ROUND);
const T = (p) => path.join(WORK, p);
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const F = J(T('final.json'));
const readAll = (pre) => readdirSync(WORK).filter((f) => f.startsWith(pre) && f.endsWith('.json')).flatMap((f) => J(T(f)));
const HI = new Map([...readAll('hint-out-'), ...readAll('hint-redo-out-')].map((h) => [h.ref, h])); // blind 뒤 다시 쓴 힌트(hint-redo-out-*)가 이긴다
const ACC = new Map(J(path.join(ROOT, 'data/pipeline/criteria/mid-accessibility.json')).mids.map((m) => [m.midKey, m]));
const ACT = new Map(J(path.join(ROOT, 'tmp/g019/active.json')).map((r) => [Number(r.id), r]));
const FAMJ = J(T('familiarity.json')).items;
const BLIND = existsSync(T('blind.json')) ? new Map(J(T('blind.json')).items.map((b) => [b.ref, b])) : new Map();
if (existsSync(T('blindr2.json'))) for (const b of J(T('blindr2.json')).items) BLIND.set(b.ref, { ...b, first: BLIND.get(b.ref) ?? null }); // 다시 쓴 힌트의 두 번째 blind(first = 첫 blind)
const LATE = existsSync(T('late-drop.json')) ? J(T('late-drop.json')) : {};
const M = J(T('merged.json'));
const changed = (it) => !!(it.rewrite && !it.rewrite.skipped && it.question !== it.rewrite.before);
const sc = (s) => (s ? { dif: s.dif, easiestCue: s.easiestCue ?? null, difWhy: s.difWhy, wor: s.wor, worWhy: s.worWhy } : null);

const problems = [];
const bySub = new Map();
const flat = [];
// 친숙도 1(격리) — final 에는 없다(stage 가 뺐다) · merged 에서 가져와 discarded 로 파일에 남긴다
const FAM1 = M.filter((i) => !i.drop.length && LATE[i.ref]?.startsWith('친숙도 1'));
for (const it of [...F, ...FAM1.map((i) => ({ ...i, fam1Only: true }))]) {
  const fam = FAMJ[it.ref] ?? null;
  if (!fam) { problems.push(`${it.ref}: 친숙도 판정 없음`); continue; }
  if (it.fam1Only) {
    const [midKey, n] = it.subId.split('/');
    const rec = { seedId: `${it.subId}#${ROUND}-${it.ref}`, seed: { subject: it.answer, aspect: null, ref: it.ref, pairedWith: it.pairedWith ?? null }, question: { ok: true, mode: it.mode, pairedWith: it.pairedWith ?? null, question: it.question, answer: it.answer, acceptedAnswers: it.acceptedAnswers ?? [], originalTitleVariants: it.originalTitleVariants ?? [], explanation: it.explanation, identity: it.identity ?? null, familiarity: { judge: fam.familiarity, pct: fam.pct, why: fam.why, piece: fam.piece, genPct: it.familiarityPct ?? null }, sources: it.sources ?? [], facts: it.facts ?? [], discarded: `정답 친숙도 1 — 판정자 pct ${fam.pct} (${fam.why}) · 15 §5-4 · 채점 전에 격리` } };
    if (!bySub.has(it.subId)) bySub.set(it.subId, { midKey, n, subName: it.sub, items: [] });
    bySub.get(it.subId).items.push(rec);
    continue;
  }
  if (fam.familiarity === 1) { problems.push(`${it.ref}: 친숙도 1 인데 final 에 있다`); continue; }
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
    generalHint: h?.hint ?? null, generalHintVersion: h?.hint ? 'hint-v6' : null,
    identity: it.identity ?? null,
    familiarity: { judge: fam.familiarity, pct: fam.pct, why: fam.why, piece: fam.piece, genPct: it.familiarityPct ?? null },
    blind: BLIND.get(it.ref) ?? null,
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
      scorePrompt: 'score-v3', hintPrompt: 'hint-v6', familiarityJudge: 'scripts/g019-familiarity.mjs (V022 꼴)', generator: 'claude-opus-5-5', questionGenerator: 'claude-opus-5-5', stage: 'deep',
      note: `G019 — 상(4) 생성 4차 ${ROUND}(정답 친숙도 판정 · 생성 직후 채점 · 3 이하 한 번 고침 · hint-v6 · blind 자기 점검). 적재하지 않았다 — V024 판정 뒤 다음 G 가 적재한다 (data/pipeline/audit/${ROUND}-verify-targets.json)` },
    items: g.items }, null, 1) + '\n');
}
writeFileSync(path.join(ROOT, `data/pipeline/samples/${ROUND}-deep.json`), JSON.stringify({ round: ROUND.toUpperCase(), count: flat.length, items: flat }, null, 1) + '\n');

const targets = flat.map((f) => ({
  ref: f.ref, round: ROUND, seedId: f.seedId, topic: f.topic, mid: f.mid, sub: f.sub,
  method: f.question.mode, pairedWith: f.question.pairedWith, first: f.question.first ?? null, layer: f.question.layer ?? null, work: f.question.work ?? null, hobby: f.question.hobby, defForm: f.question.defForm,
  question: f.question.question, answer: f.question.answer, variants: f.question.acceptedAnswers, originalTitleVariants: f.question.originalTitleVariants, variantCheck: f.question.variantCheck,
  explanation: f.question.explanation, hint: f.question.generalHint,
  identity: f.question.identity, familiarity: f.question.familiarity, blind: f.question.blind,
  rewrite: f.question.rewrite, score1: f.question.score1, score: f.question.score,
  sources: f.question.sources, facts: f.question.facts, knowledgeClaims: f.question.knowledgeClaims,
  hintBasis: f.question.hintBasis, hintSources: f.question.hintSources, hintNote: f.question.hintNote,
  easiestCue: f.question.easiestCue, targetWhy: f.question.targetWhy,
  selfJudge: f.question.selfJudge, selfJudgeWhy: f.question.selfJudgeWhy, dbCheck: f.question.dbCheck, pairCheck: f.question.pairCheck,
  check: ['★ 정답 친숙도(15 §5-4 — 정답 이름만 보고 "들어 봤다" 30% 이상인가 · familiarity 칸은 판정자 값)', '사실(질문·해설 — facts 의 url · note 와 글자 대조)', '정답 유일성·한정어(3-1 · 3-2)', '2회차면 1회차 질문·해설·힌트와 같은 사실 · 범주 단서(3-3 — first 칸)', '난이도 blind 재채점(score-v3 — 질문의 모든 문장 · 가장 쉬운 충분 단서)', '고친 것(rewrite)은 고친 뒤 유일성 · 새 사실', '알 가치', '변형(한국 표기 · B2 · B7 · A5)', '힌트 세기(H9 · MD9) · H2 한 글자 조각 · H7 · H10 반대 꼴 · H12 · removedCue 되살림', '전역 중복(9장)'],
  criteria: f.topic === 'media' ? '15 §7-1 MD1~MD11 · §5-1 · §5-2 미디어 예외 · §4-1' : '15 §2 · §3 · §3-2 · §3-3 · §4-1 · §5-1',
}));
writeFileSync(path.join(ROOT, `data/pipeline/audit/${ROUND}-verify-targets.json`), JSON.stringify({ round: ROUND.toUpperCase(), note: `V024 판정 대상 — 적재 전. facts[] 는 생성·고침 에이전트가 WebFetch 로 연 문서 · familiarity = 정답만 본 판정자(V022 꼴 · 보정 예) · score1 = 생성 직후 채점 · score = 최종(고친 것은 다른 채점자) · blind = 힌트만 보고 맞혀 보기 · first = 2회차의 1회차 문항(질문·해설·힌트)`, count: targets.length, targets }, null, 1) + '\n');
if (existsSync(T('flow.json'))) writeFileSync(path.join(ROOT, `data/pipeline/audit/${ROUND}-flow.json`), JSON.stringify(J(T('flow.json')), null, 1) + '\n');
const disc = [...bySub.values()].flatMap((g) => g.items).filter((r) => r.question.discarded);
console.log(`[g019-build ${ROUND}] 격리 ${disc.length}건: ${disc.map((r) => r.seed.ref).join(' ')}`);
console.log(`[g019-build ${ROUND}] ${flat.length}건 · 파일 ${bySub.size} · 힌트 ${flat.filter((f) => f.question.generalHint).length} · 상 ${flat.filter((f) => f.question.score.dif >= 4).length}`);
