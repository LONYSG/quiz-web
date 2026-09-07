#!/usr/bin/env node
// =============================================================================
// 실행 확인 (smoke test)
//
// ★ 이 스크립트가 존재하는 이유 (docs/07-DECISIONS.md D-021)
//
//   R005에서 typecheck 통과 / build 통과 / 봇 테스트 21항목 통과를 보고했는데
//   정작 `npm run dev` 가 실행되지 않았다.
//
//   ★ typecheck 와 build 통과는 "실행 가능성" 을 보장하지 않는다.
//     둘 다 컴파일까지만 검증한다. 프로세스가 실제로 떠서 요청에 응답하는지는
//     아무도 확인하지 않았다.
//
//   그래서 "빌드 → 기동 → 응답 확인 → 정상 종료" 를 한 번에 검증하는 절차를 만들었다.
//   ★ 매 라운드 마지막에 이것을 돌린다. docs/10-TESTING.md 에 절차로 남겼다.
//
// 검증 항목
//   1. 빌드가 성공하는가 (shared / server / client)
//   2. 서버가 실제로 기동하는가 (npm start 와 같은 경로)
//   3. GET /healthz 가 200 이고 필수 필드가 있는가
//   4. GET / 가 클라이언트 HTML 을 서빙하는가 (클라이언트 빌드 누락 감지)
//   5. Socket.IO 핸드셰이크가 되는가
//   6. SIGTERM 으로 정상 종료되는가
//
// 사용법
//   npm run smoke              빌드 포함 전체
//   npm run smoke -- --no-build 이미 빌드된 상태로 기동만 확인
// =============================================================================

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');
const CLIENT_INDEX = path.join(ROOT, 'client', 'dist', 'index.html');
const PORT = Number(process.env.SMOKE_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const SKIP_BUILD = process.argv.includes('--no-build');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// ── 1. 빌드
if (!SKIP_BUILD) {
  console.log('\n[1] 빌드');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const ok = build.status === 0;
  record('npm run build', ok, ok ? '' : (build.stderr?.toString() ?? '').slice(0, 200));
  if (!ok) {
    console.log(build.stdout?.toString().slice(-1500) ?? '');
    finish();
  }
} else {
  console.log('\n[1] 빌드 (--no-build 이므로 건너뜀)');
}

record('서버 산출물 존재', existsSync(SERVER_ENTRY), SERVER_ENTRY.replace(ROOT, '.'));
record('클라이언트 산출물 존재', existsSync(CLIENT_INDEX), CLIENT_INDEX.replace(ROOT, '.'));

// ── 2. 기동
// ★ npm start 와 완전히 같은 명령이다. dev 도 같은 파일을 실행한다.
console.log('\n[2] 서버 기동 (npm start 와 같은 경로)');
const server = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOut = '';
/**
 * 종료 정보.
 * ★ code 만 보면 안 된다. Windows 에서 child.kill() 은 즉시 종료(TerminateProcess)이고
 *   exit 콜백은 code=null, signal='SIGTERM' 을 준다.
 *   code 만 추적하면 "신호로 종료됨" 과 "아직 안 죽음" 이 둘 다 null 이라 구분되지 않는다.
 *   (R006에서 이 스크립트를 처음 돌렸을 때 실제로 여기서 오탐이 났다)
 */
let exitInfo = null;
server.stdout.on('data', (c) => {
  serverOut += c.toString();
});
server.stderr.on('data', (c) => {
  serverOut += c.toString();
});
server.on('exit', (code, signal) => {
  if (exitInfo === null) exitInfo = { code, signal };
});

// ── 3. /healthz 폴링
let health = null;
for (let i = 0; i < 40; i += 1) {
  if (exitInfo !== null) break;
  try {
    const res = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      health = await res.json();
      break;
    }
  } catch {
    /* 아직 안 떴다 */
  }
  await sleep(250);
}

if (exitInfo !== null) {
  record('서버 기동', false, `기동 중 종료 (code=${exitInfo.code}, signal=${exitInfo.signal})`);
  console.log('\n--- 서버 출력 ---\n' + serverOut.slice(-1500));
  finish();
}

record('서버 기동 + /healthz 200', health !== null);
if (health) {
  record('healthz 필수 필드', Boolean(health.ok && health.phase && health.bootedAt), `phase=${health.phase}`);
  record('부팅 정리 절차 실행', /\[boot\]/.test(serverOut), serverOut.split('\n')[0]?.trim() ?? '');
}

// ── 4. 클라이언트 서빙
try {
  const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
  const body = await res.text();
  const looksLikeHtml = res.ok && /<div id="root">/.test(body);
  record('GET / 가 클라이언트 HTML 서빙', looksLikeHtml, `${res.status}, ${body.length} bytes`);
} catch (err) {
  record('GET / 가 클라이언트 HTML 서빙', false, err.message);
}

// ── 5. Socket.IO 핸드셰이크
try {
  const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling`, {
    signal: AbortSignal.timeout(5000),
  });
  record('Socket.IO 핸드셰이크', res.ok, String(res.status));
} catch (err) {
  record('Socket.IO 핸드셰이크', false, err.message);
}

// ── 6. 종료와 포트 해제
//
// ★ 무엇을 검증하는가
//   "프로세스가 실제로 종료되고 포트가 해제되는가" 를 본다.
//   종료 코드가 0인지는 보지 않는다. Windows 에서 child.kill() 은 즉시 종료라
//   프로세스의 SIGTERM 핸들러가 실행되지 못하고 code=null / signal='SIGTERM' 이 되기 때문이다.
//   (실측 확인: 자식 프로세스의 SIGTERM 핸들러가 실행되지 않는다)
//
//   ★ 사람이 터미널에서 Ctrl+C 를 누르는 경우는 콘솔 제어 이벤트로 전달되어
//     서버의 graceful shutdown 핸들러가 실행될 것으로 보이나, 이 스크립트로는
//     그 경로를 재현할 수 없어 확인하지 못했다.
//     포트가 해제되고 프로세스가 사라지는 것은 어느 경로든 동일하므로 그것만 검증한다.
console.log('\n[3] 종료와 포트 해제');
server.kill();
let waited = 0;
while (exitInfo === null && waited < 8000) {
  await sleep(200);
  waited += 200;
}
if (exitInfo === null) {
  server.kill('SIGKILL');
  record('프로세스 종료', false, '8초 내에 종료되지 않아 강제 종료함');
} else {
  record('프로세스 종료', true, `code=${exitInfo.code}, signal=${exitInfo.signal}`);
}

// 포트가 실제로 해제되었는지 확인한다. 남아 있으면 다음 실행이 EADDRINUSE 로 실패한다.
await sleep(500);
let portFree = false;
try {
  await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(1500) });
} catch {
  portFree = true;
}
record('포트 해제', portFree, `${PORT}`);

finish();

function finish() {
  try {
    server?.kill('SIGKILL');
  } catch {
    /* 이미 죽었다 */
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n[결과] ${results.length - failed.length}/${results.length} 통과${failed.length ? ` — 실패 ${failed.length}건` : ''}`,
  );
  if (failed.length) {
    for (const f of failed) console.log(`  ★ 실패: ${f.name} ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}
