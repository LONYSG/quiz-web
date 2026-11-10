#!/usr/bin/env node
// =============================================================================
// G060 — #2458 혼성 문항 고침(찬종 제보 #122 · DG-098) — 고친 행만
//   입력 audit/g060-decisions.json · 몸통 scripts/g033-apply-lib.mjs(before 같을 때만 · 한 트랜잭션 · 열린 판 0)
//   ★ DB = DATABASE_URL — quizweb_dev 는 DATABASE_URL 을 바꿔 한 번 더 · 되돌리기 파일 DB 별
//       quizweb → audit/g060-undo.json · 그 밖 → audit/g060-undo-<db>.json
//   사용 node scripts/g060-apply.mjs [--apply | --undo [--dry-run]]   (기본 = 확인만)
// =============================================================================
import { cli } from './g033-apply-lib.mjs';
process.loadEnvFile?.(new URL('../.env', import.meta.url));
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
console.log(`[G060] DB ${db}`);
await cli('G060', 'g060-decisions.json', db === 'quizweb' ? 'g060-undo.json' : `g060-undo-${db}.json`, 'G060 혼성 문항 고침 — --undo');
