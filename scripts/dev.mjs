#!/usr/bin/env node
// =============================================================================
// 개발 서버 실행기
//
// ★ 왜 이런 방식인가 (R006에서 사고를 고치며 정한 것. docs/07-DECISIONS.md D-020)
//
//   이전 dev 스크립트는 `node --experimental-strip-types --watch src/index.ts` 였고,
//   서버가 아예 뜨지 않았다.
//
//   원인은 두 규칙이 서로 맞지 않는 것이었다.
//     · tsconfig 의 module/moduleResolution = NodeNext 는 상대 import 에
//       "컴파일 결과물의 확장자(.js)" 를 쓰도록 요구한다. 그래서 소스는 './config.js' 다.
//     · Node 의 --experimental-strip-types 는 import 문자열을 재작성하지 않는다.
//       './config.js' 를 문자 그대로 파일 시스템에서 찾고, 거기에는 config.ts 만 있으므로 실패한다.
//   두 규칙은 각각 옳고 조합이 불가능하다.
//
//   ★ 더 중요한 문제는 "dev 만 다른 코드 경로를 쓰고 있었다" 는 점이다.
//     npm start 와 테스트는 컴파일 산출물(server/dist/index.js)을 실행했고,
//     dev 만 소스를 직접 실행했다. 그래서 아무도 그 경로를 검증하지 않았다.
//
//   그래서 실행기를 바꾸는 대신 **dev 도 컴파일 산출물을 실행하도록** 했다.
//   dev 와 start 와 테스트가 전부 같은 파일을 실행한다. 경로가 하나뿐이면 이 사고가 반복될 수 없다.
//
//   부수 이점: 서버는 어차피 @quiz/shared 를 shared/dist 에서 가져오므로
//   dev 에도 빌드 단계가 이미 필요했다. server 까지 함께 빌드하는 비용은 사실상 없다.
//
// 동작
//   1. tsc -b shared server 로 한 번 빌드한다 (완료를 기다린다)
//   2. tsc -b --watch 로 소스 변경을 감시해 dist 를 갱신한다
//   3. node --watch server/dist/index.js 로 서버를 띄운다.
//      dist 가 갱신되면 node --watch 가 알아서 재시작한다
//
// 사용법
//   npm run dev
// =============================================================================

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function log(msg) {
  console.log(`[dev] ${msg}`);
}

// ── 1. 첫 빌드
//    ★ dist 가 없는데 tsconfig.tsbuildinfo 가 남아 있으면 tsc 가 "최신" 이라 판단해
//      아무것도 만들지 않는다. dist 를 손으로 지운 뒤 겪는 흔한 함정이다.
//      그래서 산출물이 없으면 --force 로 빌드한다.
const needForce = !existsSync(SERVER_ENTRY);
log(`첫 빌드${needForce ? ' (산출물이 없어 --force)' : ''}…`);

const build = spawnSync(
  npx,
  ['tsc', '-b', 'shared', 'server', ...(needForce ? ['--force'] : [])],
  { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (build.status !== 0) {
  console.error('[dev] 빌드 실패. 위 오류를 먼저 고치세요.');
  process.exit(build.status ?? 1);
}
if (!existsSync(SERVER_ENTRY)) {
  console.error(`[dev] 빌드했는데 산출물이 없습니다: ${SERVER_ENTRY}`);
  process.exit(1);
}
log('빌드 완료');

// ── 2. 감시 빌드
const watcher = spawn(
  npx,
  ['tsc', '-b', 'shared', 'server', '--watch', '--preserveWatchOutput'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
);
const relayWatcher = (chunk) => {
  const text = chunk.toString().trim();
  if (!text) return;
  // tsc 의 "Starting compilation" 같은 잡음은 줄여 출력한다
  for (const line of text.split('\n')) {
    if (/Starting compilation|Found 0 errors/.test(line)) continue;
    console.log(`[tsc] ${line.trim()}`);
  }
};
watcher.stdout.on('data', relayWatcher);
watcher.stderr.on('data', relayWatcher);

// ── 3. 서버
//    ★ npm start 와 완전히 같은 파일을 실행한다.
const server = spawn(process.execPath, ['--watch', SERVER_ENTRY], {
  cwd: ROOT,
  stdio: 'inherit',
});

log('감시 시작. 소스를 고치면 자동으로 다시 빌드하고 서버를 재시작합니다.');
log('클라이언트 화면은 별도 터미널에서  npm run dev:client');
log('종료: Ctrl+C');

// ── 종료 처리
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  watcher.kill();
  server.kill();
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
server.on('exit', (code) => {
  if (!stopping) {
    log(`서버 프로세스 종료 (code=${code})`);
    stop(code ?? 0);
  }
});
