#!/usr/bin/env node
// =============================================================================
// 개발용 터널 실행기
//
// 게임 서버를 외부에 공개한다. Cloudflare quick tunnel(TryCloudflare)을 쓴다.
// 계정도 도메인도 필요 없고 무료다. 대신 URL이 실행할 때마다 바뀐다.
//
// ★ URL이 바뀌는 것이 이 프로젝트에서는 문제가 되지 않는다.
//   초대 링크는 서버 환경 변수가 아니라 방장 브라우저의 window.location.origin 으로
//   만들기 때문이다. 방장은 이미 새 URL에 접속해 있으므로 항상 올바른 링크를 얻는다.
//   (R004 0장)
//
// 사용법
//   1) 터미널 A:  npm run dev        (서버)
//   2) 터미널 B:  npm run dev:tunnel (터널)
//   3) 출력된 https://... 주소를 친구들에게 공유
//
// 자세한 절차와 네트워크 단절 시 복구 방법은 docs/11-DEPLOY.md 를 본다.
// =============================================================================

import { spawn } from 'node:child_process';

const PORT = process.env.PORT ?? '3000';
const TARGET = `http://localhost:${PORT}`;

// cloudflared 는 진행 로그를 stderr로 낸다.
const child = spawn('cloudflared', ['tunnel', '--url', TARGET, '--no-autoupdate'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});

let announced = false;

function scan(chunk) {
  const text = chunk.toString();
  process.stderr.write(text);

  if (announced) return;
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!match) return;

  announced = true;
  const url = match[0];
  const line = '='.repeat(Math.max(46, url.length + 10));

  // ★ 건우가 복사하기 쉽도록 크게, 그리고 단독 줄로 출력한다.
  console.log('');
  console.log(line);
  console.log('  외부 접속 주소 (친구들에게 이 주소를 공유하세요)');
  console.log('');
  console.log(`      ${url}`);
  console.log('');
  console.log(`  로컬:   ${TARGET}`);
  console.log('  종료:   Ctrl+C  (터널만 닫힙니다. 서버와 게임은 그대로 살아 있습니다)');
  console.log(line);
  console.log('');
}

child.stdout.on('data', scan);
child.stderr.on('data', scan);

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error('');
    console.error('cloudflared 를 찾을 수 없습니다.');
    console.error('설치:  winget install --id Cloudflare.cloudflared');
    console.error('');
  } else {
    console.error('[tunnel] 오류:', err.message);
  }
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`\n[tunnel] 종료 (code=${code}). 서버 프로세스는 영향을 받지 않습니다.`);
  process.exit(code ?? 0);
});

const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
