#!/usr/bin/env node
// =============================================================================
// G063 — 제보 #127 서술형 정답 1 비활성 · #128 해설 잘림 등 해설 4
//   입력 audit/g063-decisions.json · 몸통 scripts/g033-apply-lib.mjs(before 같을 때만 · 한 트랜잭션 · 열린 판 0)
//   ★ DB = DATABASE_URL — quizweb_dev 는 DATABASE_URL 을 바꿔 한 번 더 · 되돌리기 파일 DB 별
//       quizweb → audit/g063-undo.json · 그 밖 → audit/g063-undo-<db>.json
//   사용 node scripts/g063-apply.mjs [--apply | --undo [--dry-run]]   (기본 = 확인만)
// =============================================================================
import { cli } from './g033-apply-lib.mjs';
process.loadEnvFile?.(new URL('../.env', import.meta.url));
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
console.log(`[G063] DB ${db}`);
await cli('phrase-answer G063', 'g063-decisions.json', db === 'quizweb' ? 'g063-undo.json' : `g063-undo-${db}.json`, 'G063 서술형 비활성 · 해설 4 — --undo');
