#!/usr/bin/env node
// =============================================================================
// ★★ R110 — 판 시작 때 읽는 것들의 크기(힙 증가) — node --expose-gc scripts/pool-sizes.mjs [--db quizweb_dev]
//   R109 까지: 문항 풀은 판마다 새로 · 퀴즈류 적재본 · 주제 세트는 서버에 60초 캐시 한 벌 · 노래 풀 · 객관식 보기 · 경험은 판마다 새로.
//   각 값 = 그것 하나를 붙잡았을 때 늘어난 힙(gc 뒤 · 다섯 번 중 가장 큰 값 = 처음 읽을 때). 쓰기 없음.
// =============================================================================
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dbName = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'quizweb_dev';
process.env.DATABASE_URL ??= `postgresql://quiz:quizlocal@localhost:5434/${dbName}`;
if (typeof globalThis.gc !== 'function') throw new Error('node --expose-gc 로 돌린다');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { loadQuestionPool, loadQuestionPoolSql, loadExperienced, ensureSharedPool } = await imp('server/dist/db/questionPool.js');
const { loadQuizData, loadAllItemExperiences } = await imp('server/dist/db/minigameItems.js');
const { loadTopicStore } = await imp('server/dist/db/topics.js');
const { loadChoiceOptions } = await imp('server/dist/db/choices.js');
const { loadSongPool } = await imp('server/dist/song/mode.js');
const { query, closePool } = await imp('server/dist/db/pool.js');
const { DEFAULT_TOPICS, DEFAULT_SONG_SETTINGS } = await import('@quiz/shared');

const heap = () => {
  globalThis.gc();
  globalThis.gc();
  return process.memoryUsage().heapUsed;
};
async function size(fn) {
  const xs = [];
  for (let i = 0; i < 5; i++) {
    const a = heap();
    globalThis.__hold = await fn();
    const b = heap();
    xs.push(b - a);
    globalThis.__hold = null;
  }
  xs.sort((x, y) => x - y);
  if (process.env.SIZES_DEBUG) console.log(xs.map((v) => (v / 1048576).toFixed(2)).join(" "));
  return xs[4]; // ★ 가장 큰 값 = 처음 한 번 읽을 때(뒤 표본은 V8 이 같은 글자를 다시 쓰는지 0 근처로 나온다 — 따로 돌린 한 번과 맞는 쪽)
}
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
const filter = { level: 'advanced', topics: DEFAULT_TOPICS };
// 가장 많이 푼 계정 10명(경험 크기 — 사람마다 다르다)
const top = (await query(`SELECT account_id::text id FROM question_experiences GROUP BY account_id ORDER BY count(*) DESC LIMIT 10`)).rows.map((r) => r.id);
await ensureSharedPool();
await loadQuizData();
await loadTopicStore();
const rows = [
  ['문항 풀 — 옛 길(판마다 SQL · 고급 · 분야 전부)', await size(() => loadQuestionPoolSql(filter)), '판마다 새로(R109 까지)'],
  ['문항 풀 — 새 길(한 벌을 거른 참조 배열 · 캐시 비우고 다시 거름)', await size(async () => { const p = await ensureSharedPool(); p.byFilter.clear(); return loadQuestionPool(filter); }), '판마다(캐시 hit 이면 0)'],
  ['퀴즈류 미니게임 적재본(loadQuizData)', await size(() => loadQuizData(true)), '서버 한 벌 · 60초 캐시(이미)'],
  ['주제 세트(loadTopicStore)', await size(() => loadTopicStore(true)), '서버 한 벌 · 60초 캐시(이미)'],
  ['객관식 저장 보기(loadChoiceOptions)', await size(() => loadChoiceOptions()), '객관식을 고른 판마다'],
  ['노래 풀(loadSongPool · 기본 설정)', await size(() => loadSongPool(DEFAULT_SONG_SETTINGS)), '노래 방식 판마다(적재본 참조 + 곡 객체)'],
  ['경험 — 가장 많이 푼 10명(loadExperienced)', await size(() => loadExperienced(top)), '판마다(사람마다 다르다 · 그대로 둠)'],
  ['미니게임 항목 경험 — 같은 10명', await size(() => loadAllItemExperiences(top)), '판마다(그대로 둠)'],
];
const p = await ensureSharedPool();
console.log(`[pool-sizes] ${dbName} · 한 벌 ${p.all.length}개`);
console.log('| 무엇 | 힙 증가 | 언제 |');
console.log('|---|---|---|');
for (const [a, b, c] of rows) console.log(`| ${a} | ${mb(b)} | ${c} |`);
// 한 벌 자체(풀을 비우고 다시 읽기 — 지문을 비워 강제)
await closePool?.();
process.exit(0);
