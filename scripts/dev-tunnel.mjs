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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const p2 = (n) => String(n).padStart(2, '0');
const hms = (d = new Date()) => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const say = (m) => console.log(`[tunnel ${hms()}] ${m}`);

// ★ R070 (D-312) — 주소가 찍히자마자 브라우저를 열면 연결 등록 전이라 Cloudflare 오류 페이지가 떴다.
//   ① 'Registered tunnel connection' 줄을 기다리고(최대 30초) ② 밖에서 <주소>/healthz 를 2초 간격 최대 45초 쳐서
//   ③ 200 이 오면 그때 크게 · 클립보드 · 브라우저 ④ 안 되면 주소는 찍되 마지막 응답과 로컬 /healthz 를 같이 찍는다(터널 탓인지 서버 탓인지).
const REGISTER_WAIT_MS = 30_000;
const PROBE_MS = 45_000;
const PROBE_EVERY_MS = 2_000;

const t0 = Date.now();
let url = null;
let registered = false;
const recent = []; // 마지막 stderr 20줄 — cloudflared 가 죽으면 보여 준다

function scan(chunk) {
  const text = chunk.toString();
  process.stderr.write(text);
  for (const l of text.split(/\r?\n/)) if (l.trim()) { recent.push(l); if (recent.length > 20) recent.shift(); }
  if (/Registered tunnel connection/i.test(text)) registered = true;
  if (url) return;
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!match) return;
  url = match[0];
  say(`주소 받음 (${((Date.now() - t0) / 1000).toFixed(1)}초) — 연결 등록 · 밖에서 열리는지 확인한 뒤 알려 드립니다`);
  confirm().catch((e) => say(`확인 중 오류: ${e.message}`));
}

async function probe(target, ms = 5000) {
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(ms), redirect: 'manual' });
    return { ok: res.status === 200, what: String(res.status) };
  } catch (e) {
    return { ok: false, what: e.cause?.code ?? e.name ?? 'error' };
  }
}

async function confirm() {
  const r0 = Date.now();
  while (!registered && Date.now() - r0 < REGISTER_WAIT_MS) await sleep(250);
  say(registered ? `연결 등록됨 (${((Date.now() - t0) / 1000).toFixed(1)}초)` : '30초 안에 연결 등록 줄이 안 보임 — 그래도 밖에서 쳐 봅니다');
  const p0 = Date.now();
  let last = { ok: false, what: '-' };
  while (Date.now() - p0 < PROBE_MS) {
    last = await probe(`${url}/healthz`);
    if (last.ok) return announce(true);
    say(`등록 대기 ${Math.round((Date.now() - p0) / 1000)}초 (밖에서 /healthz → ${last.what})`);
    await sleep(PROBE_EVERY_MS);
  }
  const local = await probe(`${TARGET}/healthz`, 2000);
  announce(false, `★ 아직 밖에서 안 열림 — 마지막 응답 ${last.what} · 서버 로컬 /healthz ${local.ok ? 'ok' : `실패(${local.what})`}`);
}

function announce(open, warn = null) {
  const line = '='.repeat(Math.max(46, url.length + 10));

  // ★ 건우가 복사하기 쉽도록 크게, 그리고 단독 줄로 출력한다.
  console.log('');
  console.log(line);
  if (open) console.log(`  외부 접속 주소 (친구들에게 이 주소를 공유하세요) — 밖에서 열림 확인 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  else console.log(`  ${warn}`);
  console.log('');
  console.log(`      ${url}`);
  console.log('');
  console.log(`  로컬:   ${TARGET}`);
  console.log('  종료:   Ctrl+C  (터널만 닫힙니다. 서버와 게임은 그대로 살아 있습니다)');
  if (!open) console.log('  다음:   서버 로컬이 실패면 서버 창 · tmp/ops/server.log 마지막 줄 / ok 면 잠시 뒤 주소를 직접 열어 보거나 메뉴 3 → 1');
  if (process.platform === 'win32') {
    // ★ 2026-10-24 — 주소를 클립보드에도 넣는다(play.bat 원터치 · 그대로 붙여넣기)
    try {
      const clip = spawn('clip', { stdio: ['pipe', 'ignore', 'ignore'], shell: true });
      clip.stdin.end(url);
      console.log('  복사:   주소를 클립보드에 넣었습니다 — 그대로 붙여넣기(Ctrl+V)');
    } catch { /* 복사 실패는 무시 — 주소는 위에 있다 */ }
    // ★ 기본 브라우저로 바로 연다(찬종 2026-10-24) — NO_OPEN=1 이면 안 연다(검사 · 봇) · R070: 밖에서 열림을 확인한 때만
    if (open && !process.env.NO_OPEN) {
      try {
        spawn(`start "" "${url}"`, { shell: true, detached: true, stdio: 'ignore' }).unref();
        console.log('  열기:   기본 브라우저로 열었습니다');
      } catch { /* 못 열어도 주소는 위에 있다 */ }
    }
  }
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
  console.log(`\n[tunnel ${hms()}] cloudflared 종료 (code=${code}). 서버 프로세스는 영향을 받지 않습니다.`);
  if (code) {
    console.log(`[tunnel] 마지막 출력 ${recent.length}줄:`);
    for (const l of recent) console.log(`  ${l}`);
  }
  process.exit(code ?? 0);
});

const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
