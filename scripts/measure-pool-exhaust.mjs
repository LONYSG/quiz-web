#!/usr/bin/env node
// =============================================================================
// 상 풀 소진 측정 (R032 / R031 6절 (1))
//
// ★ 묻는 것: 난이도를 "상" 만(또는 "중+상") 고르고 50문제로 하면, 같은 모임이 몇 판까지 새 문제를 받는가
// ★ 방법: 실제 선정 함수(server/dist/game/select.js 의 selectNextQuestion)를 실제 DB 활성 풀에 대고 돌린다
//   · 경험 규칙 — 정답이 공개된 문제는 그 자리 전원의 경험이 된다 (01-GAME-RULES 12장). 판이 이어지면 쌓인다
//   · 선정 — 1단계 전원 미경험 + 정답 미사용 / 2단계 1명 이상 미경험 + 정답 미사용 / 3단계 1명 이상 미경험 (정답 중복 허용) / 셋 다 비면 조기 종료
//   · 시작 검증 — 출제 가능 수(1명 이상 미경험) 가 문제 수보다 적으면 그 판은 시작되지 않는다 (Q-21) — 여기서 "판 수" 를 끊는다
// ★ 가정: 모임 전원이 처음 하는 사람이다 (DB 에 쌓인 경험 기록은 넣지 않는다). 매 판 같은 사람이 끝까지 있다
//   → 한 명이라도 처음 오는 사람이 끼면 그 사람 몫으로 시작 검증은 늘 통과한다(판 수 제한 없음). 다만 나머지 사람에겐 이미 본 문제가 섞인다
//
// 사용법  node scripts/measure-pool-exhaust.mjs [--count 50] [--case 상|중+상|전체]
// =============================================================================
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const { selectNextQuestion } = await import(pathToFileURL(path.join(ROOT, 'server', 'dist', 'game', 'select.js')).href);
const args = process.argv.slice(2);
const COUNT = Number(args[args.indexOf('--count') + 1]) || 50;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await c.connect();
const rows = (await c.query(
  `SELECT q.id::text AS id, q.difficulty_score AS s,
          coalesce(array_agg(a.answer_norm) FILTER (WHERE a.answer_norm IS NOT NULL), '{}') AS norms
     FROM questions q LEFT JOIN question_answers a ON a.question_id = q.id
    WHERE q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'
    GROUP BY q.id, q.difficulty_score`)).rows;
await c.end();

function rng(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x100000000; }; }

function run(allowed, people) {
  const pool = rows.filter((r) => allowed.includes(r.s)).map((r) => ({ id: r.id, text: '', categoryName: '', displayAnswer: '', hintAnswer: null, generalHint: null, explanation: null, answersNorm: r.norms, answersRaw: [] }));
  const roster = Array.from({ length: people }, (_, i) => `p${i}`);
  const experienced = new Map(roster.map((p) => [p, new Set()]));
  const random = rng(20261004);
  let games = 0, lastStages = null;
  for (;;) {
    // 시작 검증 — 1명 이상 미경험인 문제 수
    const avail = pool.filter((q) => roster.some((p) => !experienced.get(p).has(q.id))).length;
    if (avail < COUNT) return { games, pool: pool.length, leftover: avail, lastStages };
    const used = new Set(), usedNorms = new Set(); const stages = { 1: 0, 2: 0, 3: 0 }; let n = 0;
    for (let k = 0; k < COUNT; k += 1) {
      const r = selectNextQuestion({ pool, usedQuestionIds: used, usedAnswerNorms: usedNorms, participantIds: roster, experienced, random });
      if (!r) break;
      used.add(r.question.id); for (const x of r.question.answersNorm) usedNorms.add(x);
      stages[r.stage] += 1; n += 1;
      for (const p of roster) experienced.get(p).add(r.question.id);
    }
    if (n < COUNT) return { games, pool: pool.length, leftover: 0, earlyStop: n, lastStages };
    games += 1; lastStages = stages;
  }
}

const only = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;
const CASES = [['상', [4, 5]], ['중+상', [3, 4, 5]], ['전체', [1, 2, 3, 4, 5]]].filter(([l]) => !only || l === only);
console.log(`문제 수 ${COUNT} · 전원 처음 하는 모임 · 매 판 같은 사람`);
for (const [label, allowed] of CASES) {
  for (const people of [4, 5, 6]) {
    const r = run(allowed, people);
    console.log(`${label.padEnd(4)} ${people}명: 풀 ${r.pool} → 새 문제로 ${r.games}판 (남은 미경험 ${r.leftover})`);
  }
}
