#!/usr/bin/env node
// =============================================================================
// 창 + 파일 로그 래퍼 — play.mjs 가 서버 · 터널 창 안에서 부른다 (R070 · D-312)
//
//   찬종 2026-10-27: "로깅을 제대로 남기도록" — 서버 · 터널 창 출력이 파일에 남지 않아 사고 뒤에 원인을 볼 수 없었다.
//   자식의 stdout · stderr 를 **창에도 그대로** 내고 두 파일에 같이 쓴다:
//     tmp/ops/<kind>-YYYYMMDD-HHmm.log  (이번 기동 — 14일 뒤 play 가 지운다)
//     tmp/ops/<kind>.log                 (최신 — 기동마다 덮어씀 · 메뉴 4 · 14 가 본다)
//   첫 줄 = 기동 시각 · 명령 · PORT · DB 이름(비밀번호 뺌) · git HEAD. 끝 줄 = 종료 코드.
//   자식의 exit code 를 그대로 돌려준다. Ctrl+C 는 같은 콘솔의 자식도 받으므로 래퍼는 자식이 끝나길 기다린다.
//
// 사용법:  node scripts/ops-run.mjs server npm start
//          node scripts/ops-run.mjs tunnel node scripts/dev-tunnel.mjs
// =============================================================================

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { LOG_DIR, ROOT, dbName, gitHead, logPaths } from './ops-lib.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 없어도 됨 */ }

const [kind, ...cmd] = process.argv.slice(2);
if (!kind || cmd.length === 0) {
  console.error('사용법: node scripts/ops-run.mjs <server|tunnel> <명령…>');
  process.exit(2);
}

mkdirSync(LOG_DIR, { recursive: true });
const { latest, dated } = logPaths(kind);
const files = [createWriteStream(dated, { flags: 'a' }), createWriteStream(latest, { flags: 'w' })];
const toFiles = (s) => { for (const f of files) f.write(s); };

const head =
  `[ops-run] ${new Date().toISOString()} (${new Date().toLocaleString('ko-KR')}) · 명령 ${cmd.join(' ')} · ` +
  `PORT ${process.env.PORT ?? '3000'} · DB ${dbName(process.env.DATABASE_URL)} · HEAD ${gitHead()} · 로그 ${path.basename(dated)}\n`;
process.stdout.write(head);
toFiles(head);

const child = spawn(cmd.join(' '), { cwd: ROOT, shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
child.stdout.on('data', (b) => { process.stdout.write(b); toFiles(b); });
child.stderr.on('data', (b) => { process.stderr.write(b); toFiles(b); });

// ★ Ctrl+C 는 콘솔 전체가 받는다 — 래퍼는 죽지 않고 자식이 정리하고 끝나길 기다려 끝 줄을 남긴다
process.on('SIGINT', () => {});
process.on('SIGTERM', () => child.kill());

child.on('error', (err) => {
  const line = `[ops-run] 시작 실패: ${err.message}\n`;
  process.stderr.write(line);
  toFiles(line);
});
child.on('close', (code, signal) => {
  const line = `[ops-run] ${new Date().toLocaleString('ko-KR')} 끝(code=${code ?? signal})\n`;
  process.stdout.write(line);
  let left = files.length;
  for (const f of files) f.end(line, () => { if (--left === 0) process.exit(code ?? 1); });
});
