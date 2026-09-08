#!/usr/bin/env node
// =============================================================================
// 429 중단 상태 해제 — ★ 사람이 판단해서 실행하는 명령이다
//
// ★ Q-54 확정 규칙은 "429 가 나오면 그날 중단" 이다. 그 규칙을 코드가 스스로 바꾸지 않는다.
//   그러나 R010 실측에서 받은 429 는 몇 분 뒤 회복되었다(최소 호출이 전부 200).
//   즉 일일 한도가 아니라 짧은 창(분당) 한도였다(추정. 근거는 07-DECISIONS D-034).
//
// ★ 그런 경우에 하루를 버리는 것은 규칙의 의도가 아니라고 보지만,
//   그 판단은 운영 판단이므로 사람이 한다. 이 스크립트가 그 문이다.
//   ★ 자동으로 호출되는 곳은 없다.
//
// 사용법
//   npm run pipeline:reset-limit
// =============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearRateLimit, loadState } from '../pipeline/dist/budget.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const before = await loadState(ROOT);
if (!before.rateLimited) {
  console.log(`[reset] 오늘(${before.day}) 은 429 중단 상태가 아니다. 할 일이 없다.`);
  process.exit(0);
}

console.log(`[reset] 오늘(${before.day}) 429 중단 상태를 해제한다.`);
console.log(`[reset]   중단 시각: ${before.rateLimitedAt}`);
console.log(`[reset]   처리 ${before.items}건 / 토큰 ${before.tokens} / 호출 ${before.calls}회`);
console.log('[reset] ★ 짧은 창(분당) 한도였다고 판단한 경우에만 쓴다.');
console.log('[reset]   일일 한도였다면 다시 곧바로 429 가 난다. 그때는 다음 UTC 자정까지 기다린다.');
const after = await clearRateLimit(ROOT);
console.log(`[reset] 해제 완료 (rateLimited=${after.rateLimited})`);
