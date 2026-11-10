#!/usr/bin/env node
// =============================================================================
// G059 — 답을 두 개 묶어 묻는 문항 정리(찬종 제보 #119 · DG-097) — 고친 행 · 비활성만
//   입력 audit/g059-decisions.json · 몸통 scripts/g033-apply-lib.mjs(before 같을 때만 · 한 트랜잭션 · 열린 판 0)
//   ★ DB = DATABASE_URL — quizweb_dev 는 DATABASE_URL 을 바꿔 한 번 더 · 되돌리기 파일 DB 별
//       quizweb → audit/g059-undo.json · 그 밖 → audit/g059-undo-<db>.json
//   사용 node scripts/g059-apply.mjs [--apply | --undo [--dry-run]]   (기본 = 확인만)
// =============================================================================
import { cli } from './g033-apply-lib.mjs';
process.loadEnvFile?.(new URL('../.env', import.meta.url));
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
console.log(`[G059] DB ${db}`);
await cli('G059', 'g059-decisions.json', db === 'quizweb' ? 'g059-undo.json' : `g059-undo-${db}.json`, 'G059 두 답 묶음 정리 — --undo');
