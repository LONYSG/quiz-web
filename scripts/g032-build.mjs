#!/usr/bin/env node
// =============================================================================
// G032 — 새 문항 생성 재개(deep-v6 · score-v4)를 적재 게이트 형식 파일로 만든다 (★ DB 를 쓰지 않는다 — 적재는 pipeline-load --pending)
//   g019-build.mjs 의 g032 판. 흐름: 생성(deep-v6 · 힌트 함께) → 중앙 기계 검사 → 친숙도(g032-familiarity) → 채점(score-v4)
//     → 알가치 1 · 등급 5 알가치 2 격리 → 읽기 판정(19 §8) · 고침 → 사실 기계 대조 → blind 둘(질문 · 힌트) · 고침 → 중복 3겹 → 이 파일
//
//   node scripts/g032-build.mjs --round g032a   (또는 g032b)
//   입력 (작업 폴더 tmp/g032/<round>/ — git 밖)
//     merged.json · late-drop.json · score.json · familiarity.json · read.json · facts.json · blind/{q,h}.score.json · dup.json
//   출력
//     data/pipeline/generated/<round>/<midKey>-<n>.json   pipeline-load --round <round> --gate-only / --pending 이 읽는다
//     data/pipeline/audit/<round>-flow.json               단계별 버림 수
//   게이트 호환: score.dif = v2 등급 · score.wor(옛 1~5) = worth 3→5 · 2→3 · 1→1 · score.acc = 친숙도(판정자) · score.version 'score-v4'
//   ★ 격리(친숙도 1 · 알가치 1 · 등급 5 알가치 2 · 읽기·사실·blind·중복 drop)는 파일에 discarded 로 남긴다(게이트가 건너뛴다)
//   ★ 멱등: generated/<round> 의 이전 파일은 지우고 다시 쓴다
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const ROUND = process.argv[process.argv.indexOf('--round') + 1];
if (!/^g032[ab]$/.test(ROUND ?? '')) { console.error('사용법: node scripts/g032-build.mjs --round g032a|g032b'); process.exit(1); }
const W = path.join(ROOT, 'tmp/g032', ROUND);
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const opt = (p, d) => (existsSync(p) ? J(p) : d);
const M = J(path.join(W, 'merged.json'));
const LATE = opt(path.join(W, 'late-drop.json'), {});
const SC = opt(path.join(W, 'score.json'), { items: {} }).items;
const FAM = opt(path.join(W, 'familiarity.json'), { items: {} }).items;
const RD = opt(path.join(W, 'read.json'), { items: {} }).items;
const FC = opt(path.join(W, 'facts.json'), {});
const BQ = new Map(opt(path.join(W, 'blind/q.score.json'), []).map((x) => [x.ref, x]));
const BH = new Map(opt(path.join(W, 'blind/h.score.json'), []).map((x) => [x.ref, x]));
const DUP = opt(path.join(W, 'dup.json'), { items: {} }).items;
const dupOf = (ref) => Object.values(DUP).filter((x) => x.new?.ref === ref).map((x) => ({ old: x.old?.id, answer: x.old?.answer, verdict: x.verdict, why: x.why }));
const WOR = { 3: 5, 2: 3, 1: 1 };

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const KEY = new Map((await c.query('select id, key from categories where level=3')).rows.map((r) => [Number(r.id), r.key]));
await c.end();

const problems = []; const bySub = new Map(); const flow = { made: M.length, centralBlocked: 0, late: {}, kept: 0 };
for (const it of M) {
  const key = KEY.get(Number(it.l3)); const m = key?.match(/^L3:(.+)#(\d+)$/);
  if (!m) { problems.push(`${it.ref}: L3 ${it.l3} 키 없음`); continue; }
  const [, midKey, n] = m; const subId = `${midKey}/${n}`;
  const s = SC[it.ref]; const fam = FAM[it.ref];
  let discarded = null;
  if (it.drop.length) { discarded = `중앙 기계 검사 — ${it.drop.join(' · ')}`; flow.centralBlocked++; }
  else if (LATE[it.ref]) { discarded = LATE[it.ref]; const k = LATE[it.ref].split(/[ (—]/)[0]; flow.late[k] = (flow.late[k] ?? 0) + 1; }
  else if (!s) problems.push(`${it.ref}: 채점 없음`);
  else if (!fam) problems.push(`${it.ref}: 친숙도 판정 없음`);
  else if (!it.hint) problems.push(`${it.ref}: 힌트 없음`);
  const q = {
    ok: true, mode: '나', pairedWith: null,
    question: it.question, answer: it.answer, acceptedAnswers: it.acceptedAnswers ?? [], originalTitleVariants: it.originalTitleVariants ?? [],
    explanation: it.explanation,
    score: s ? { version: 'score-v4', dif: s.dif, easiestCue: s.easiestCue ?? null, difWhy: s.difWhy, wor: WOR[s.worth], worWhy: `알가치(worth) ${s.worth} · ${s.worthKind ?? ''} — ${s.worthWhy ?? ''}`, acc: fam?.familiarity ?? s.acc, accWhy: `정답 친숙도(15 §5-4) — 판정자 pct ${fam?.pct ?? s.accPct}`, worth: s.worth, worthKind: s.worthKind ?? null } : null,
    generalHint: it.hint ?? null, generalHintVersion: it.hint ? 'hint-v7' : null,
    identity: it.identity ?? null,
    familiarity: fam ? { judge: fam.familiarity, pct: fam.pct, why: fam.why, piece: fam.piece, genPct: it.familiarityPct ?? null } : null,
    read: RD[it.ref] ? { verdict: RD[it.ref].verdict, form: RD[it.ref].form ?? null, reason: RD[it.ref].reason } : null,
    blindQuestion: BQ.get(it.ref) ? { guess: BQ.get(it.ref).guess, hit: BQ.get(it.ref).hit } : null,
    blindHint: BH.get(it.ref) ? { guess: BH.get(it.ref).guess, hit: BH.get(it.ref).hit } : null,
    factCheck: FC[it.ref] ?? null, dupCheck: dupOf(it.ref),
    sources: [...new Set((it.facts ?? []).map((f) => f.url))], facts: it.facts ?? [],
    hintBasis: it.hintBasis ?? null, hintSources: it.hintSources ?? [], hintNote: it.hintNote ?? null,
    easiestCue: it.easiestCue ?? null, worthWhyGen: it.worthWhy ?? null, targetGrade: it.targetGrade, targetWorth: it.targetWorth ?? null,
    selfCheck: it.selfCheck ?? null, history: it.history ?? [], warn: it.warn ?? [], job: it.job,
    ...(discarded ? { discarded } : {}),
  };
  if (!discarded) flow.kept++;
  const rec = { seedId: `${subId}#${ROUND}-${it.ref}`, seed: { subject: it.answer, aspect: null, ref: it.ref, pairedWith: null }, question: q };
  if (!bySub.has(subId)) bySub.set(subId, { midKey, n, items: [] });
  bySub.get(subId).items.push(rec);
}
if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
const dir = path.join(ROOT, 'data/pipeline/generated', ROUND);
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
for (const [subId, g] of [...bySub].sort()) {
  writeFileSync(path.join(dir, `${g.midKey}-${g.n}.json`), JSON.stringify({
    _meta: { round: ROUND, subId, midKey: g.midKey, questionPrompt: 'deep-v6', scorePrompt: 'score-v4', hintPrompt: 'hint-v7(deep-v6 안)', familiarityJudge: 'scripts/g032-familiarity.mjs (V022 꼴)', generator: 'claude-opus-5-5', questionGenerator: 'claude-opus-5-5', judge: 'claude-sonnet-5-5', stage: 'deep',
      note: `G032 — 생성 재개 ${ROUND}(deep-v6 · score-v4 · 친숙도 · 읽기 · 사실 · blind 둘 · 중복 3겹). pipeline-load --pending 으로 비활성 적재 — 활성은 V035 표본 판정 뒤 다음 GEN` },
    items: g.items }, null, 1) + '\n');
}
writeFileSync(path.join(ROOT, `data/pipeline/audit/${ROUND}-flow.json`), JSON.stringify({ ...opt(path.join(W, 'flow.json'), {}), build: flow }, null, 1) + '\n');
console.log(`[g032-build ${ROUND}] 생성 ${flow.made} · 중앙 막힘 ${flow.centralBlocked} · 격리 ${JSON.stringify(flow.late)} · 살아 남음 ${flow.kept} · 파일 ${bySub.size}`);
