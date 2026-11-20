#!/usr/bin/env node
// =============================================================================
// ★★★ R110 — 문항 풀 한 벌(새 길) = 설정마다 SQL(옛 길) 대조
//   node scripts/pool-equiv.mjs [--db quizweb_dev]   (먼저 npm run build — server/dist 를 쓴다)
//   난이도 3 × 분야 부분집합 **전부**(빈 것 빼고)마다:
//     ① id 집합 같음 ② 읽기 순서까지 같음(같은 씨앗 → 같은 뽑기) ③ "출제 가능 수"(countAvailableQuestions · 경험 없는 사람)와 같은 수
//     ④ 같은 씨앗으로 selectNextQuestion 10번 — 옛 풀 · 새 풀이 같은 문항을 같은 순서로
//     ⑤ 새 길 배열의 원소 = 한 벌의 같은 객체(복사 없음)
//   쓰기 없음(읽기만).
// =============================================================================
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dbName = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'quizweb_dev';
process.env.DATABASE_URL ??= `postgresql://quiz:quizlocal@localhost:5434/${dbName}`;
process.env.POOL_FREEZE = '1';

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { loadQuestionPool, loadQuestionPoolSql, sharedPoolInfo } = await imp('server/dist/db/questionPool.js');
const { countAvailableQuestions } = await imp('server/dist/db/questions.js');
const { selectNextQuestion } = await imp('server/dist/game/select.js');
const { closePool } = await imp('server/dist/db/pool.js').catch(() => ({}));
const { GAME_TOPICS, DIFFICULTY_LEVELS } = await import('@quiz/shared');

const levels = (DIFFICULTY_LEVELS ?? []).map((l) => (typeof l === 'string' ? l : l.level ?? l.key ?? l.id)).filter(Boolean);
const topics = GAME_TOPICS.map((t) => t.topic);
if (levels.length === 0) throw new Error('난이도 목록을 못 읽었다(DIFFICULTY_LEVELS)');

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function picks(pool, seed) {
  const used = new Set();
  const norms = new Set();
  const out = [];
  const random = seeded(seed);
  for (let i = 0; i < 10; i++) {
    const r = selectNextQuestion({ pool, usedQuestionIds: used, usedAnswerNorms: norms, participantIds: ['1', '2'], experienced: new Map([['1', new Set()], ['2', new Set()]]), random });
    if (!r) break;
    used.add(r.question.id);
    for (const n of r.question.answersNorm) norms.add(n);
    out.push(r.question.id);
  }
  return out.join(',');
}

let n = 0;
const bad = [];
const t0 = Date.now();
for (const level of levels) {
  for (let mask = 1; mask < 1 << topics.length; mask++) {
    const sel = topics.filter((_, i) => mask & (1 << i));
    const filter = { level, topics: sel };
    const [oldP, newP, cnt] = await Promise.all([loadQuestionPoolSql(filter), loadQuestionPool(filter), countAvailableQuestions([], filter)]);
    const oldIds = oldP.map((q) => q.id);
    const newIds = newP.map((q) => q.id);
    const sameSet = oldIds.length === newIds.length && new Set(oldIds).size === new Set([...oldIds, ...newIds]).size;
    const sameOrder = oldIds.join() === newIds.join();
    const sameCount = cnt === newIds.length;
    const seed = 1000 + n;
    const samePick = picks(oldP, seed) === picks(newP, seed);
    const again = await loadQuestionPool(filter);
    const shared = again === newP && Object.isFrozen(newP) && (newP.length === 0 || Object.isFrozen(newP[0]));
    if (!(sameSet && sameOrder && sameCount && samePick && shared)) bad.push({ level, topics: sel.join('+'), old: oldIds.length, new: newIds.length, count: cnt, sameSet, sameOrder, samePick, shared });
    n += 1;
  }
}
const info = sharedPoolInfo();
console.log(`[pool-equiv] ${dbName} · 조합 ${n}개(난이도 ${levels.length} × 분야 부분집합 ${2 ** topics.length - 1}) · ${Date.now() - t0}ms`);
console.log(`[pool-equiv] 한 벌 ${info?.count}개 · 약 ${info?.approxMB} MB · 거른 배열 캐시 ${info?.filters}개`);
if (bad.length) {
  console.log(`[pool-equiv] ★ 어긋남 ${bad.length}개:`);
  for (const b of bad.slice(0, 20)) console.log('  ', JSON.stringify(b));
} else console.log('[pool-equiv] 전부 같다 — id 집합 · 순서 · 출제 가능 수 · 같은 씨앗 10문항 · 같은 객체(얼림)');
await closePool?.();
process.exit(bad.length ? 1 : 0);
