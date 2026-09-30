#!/usr/bin/env node
// =============================================================================
// 난이도 출제 비율 측정 (R028 / 건우 확인 지시)
//
// ★ 건우: "중과 상을 체크했다면 두 난이도를 섞어서 내게 하면 좋겠다. 비율은 피라미드 형태로 —
//   ★ 문제 개수 비율에 맞게 출제하도록 하자."
//
// ★ 무엇을 재는가 — **실제 선정 함수**(server/dist/game/select.js 의 selectNextQuestion)를
//   **실제 DB 풀**에 대고 수천 번 돌려, 출제된 난이도 비율과 풀의 난이도 비율을 비교한다.
//   ★ 게임을 실제로 돌리면 문제마다 5초 대기가 있어 표본을 크게 모을 수 없다.
//     선정은 순수 함수라 같은 코드를 그대로 부르면 같은 결과다 (봇 difficulty 시나리오가 실경로를 따로 본다).
//
// ★ 선정에 겹쳐 있는 것 — 전원 미경험 우선(1단계) / 미경험자 수 가중(2·3단계) / 한 판 안 정답 중복 금지(Q-76).
//   ★ 경험 기록이 쌓이는 상황도 흉내 낸다 (판이 끝나면 본 문제가 경험이 된다).
//
// 사용법  npm run build 후   node scripts/measure-difficulty-mix.mjs [--games 60] [--count 50]
// =============================================================================

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { selectNextQuestion } = await import(
  pathToFileURL(path.join(ROOT, 'server', 'dist', 'game', 'select.js')).href
);

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const GAMES = opt('--games', 60);
const COUNT = opt('--count', 50);
// ★ --fresh: 판마다 경험을 비운다 (독립 표본을 크게 모은다). 없으면 경험이 누적된다
const FRESH = args.includes('--fresh');

const TIERS = { easy: [1, 2], medium: [3], hard: [4, 5] };
const CASES = [
  { label: '중+상', tiers: ['medium', 'hard'] },
  { label: '전체', tiers: ['easy', 'medium', 'hard'] },
];
const tierOf = (s) => (s <= 2 ? '하' : s === 3 ? '중' : '상');

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb',
});
await c.connect();
const rows = (
  await c.query(
    `SELECT q.id::text AS id, q.difficulty_score AS s,
            coalesce(array_agg(a.answer_norm) FILTER (WHERE a.answer_norm IS NOT NULL), '{}') AS norms
       FROM questions q LEFT JOIN question_answers a ON a.question_id = q.id
      WHERE q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'
      GROUP BY q.id, q.difficulty_score`,
  )
).rows;
await c.end();

/** 결정적 난수 — 실행마다 같은 결과를 낸다 */
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 0x100000000;
  };
}

const pct = (n, d) => (d === 0 ? '0.0' : ((100 * n) / d).toFixed(1));

for (const cs of CASES) {
  const allowed = cs.tiers.flatMap((t) => TIERS[t]);
  const pool = rows
    .filter((r) => allowed.includes(r.s))
    .map((r) => ({
      id: r.id,
      text: '',
      categoryName: '',
      displayAnswer: '',
      hintAnswer: null,
      generalHint: null,
      explanation: null,
      answersNorm: r.norms,
      answersRaw: [],
      _s: r.s,
    }));
  const poolCount = { 하: 0, 중: 0, 상: 0 };
  for (const q of pool) poolCount[tierOf(q._s)] += 1;

  const participants = ['p1', 'p2'];
  const experienced = new Map(participants.map((p) => [p, new Set()]));
  const random = rng(20260930);
  const drawn = { 하: 0, 중: 0, 상: 0 };
  const firstGames = { 하: 0, 중: 0, 상: 0 };
  const stages = { 1: 0, 2: 0, 3: 0 };
  let total = 0;
  let early = 0;

  for (let gi = 0; gi < GAMES; gi += 1) {
    if (FRESH) for (const p of participants) experienced.set(p, new Set());
    const used = new Set();
    const usedNorms = new Set();
    for (let k = 0; k < COUNT; k += 1) {
      const r = selectNextQuestion({
        pool,
        usedQuestionIds: used,
        usedAnswerNorms: usedNorms,
        participantIds: participants,
        experienced,
        random,
      });
      if (!r) {
        early += 1;
        break;
      }
      used.add(r.question.id);
      for (const n of r.question.answersNorm) usedNorms.add(n);
      const tier = tierOf(r.question._s);
      drawn[tier] += 1;
      if (gi < 5) firstGames[tier] += 1;
      stages[r.stage] += 1;
      total += 1;
      // ★ 정답 공개 순간 둘 다 있었다고 본다 → 경험이 된다
      for (const p of participants) experienced.get(p).add(r.question.id);
    }
  }

  const poolTotal = pool.length;
  console.log(`\n== ${cs.label}  (풀 ${poolTotal}건 / ${GAMES}판 × ${COUNT}문제, 2인, ${FRESH ? '판마다 경험 초기화' : '경험 누적'})`);
  console.log('난이도   풀 비율     출제 비율(전체)   출제 비율(처음 5판)');
  const f5 = Object.values(firstGames).reduce((a, b) => a + b, 0);
  for (const t of ['하', '중', '상']) {
    if (poolCount[t] === 0) continue;
    console.log(
      `  ${t}     ${pct(poolCount[t], poolTotal).padStart(5)}%      ${pct(drawn[t], total).padStart(5)}%            ${pct(firstGames[t], f5).padStart(5)}%`,
    );
  }
  console.log(`  단계  1단계 ${stages[1]} / 2단계 ${stages[2]} / 3단계 ${stages[3]}   조기 종료 ${early}판   총 ${total}문제`);
}
