#!/usr/bin/env node
// =============================================================================
// 원터치 플레이 실행기 — play.bat 이 부른다 (찬종 2026-10-24: "db 키고 빌드하고 외부 공개까지 원터치")
//
//   1) Docker Desktop 이 꺼져 있으면 켜고 기다린다
//   2) DB 컨테이너(quiz-web-db)를 올리고 healthy 까지 기다린다
//   3) 마이그레이션(없으면 아무것도 안 한다)
//   4) 서버가 이미 떠 있으면(3000 /healthz 응답) 빌드·서버는 건너뛴다
//      — ★ 빌드가 켜진 서버를 재시작시키면 하던 판이 끊긴다(bootCleanup). 새 빌드를 쓰려면 stop.bat 뒤 다시.
//      아니면 npm run build → 새 창에서 npm start(감시 없음 — 소스가 바뀌어도 재시작하지 않는다)
//   5) 터널(cloudflared)을 이 창에서 띄운다 — 주소가 크게 나오고 클립보드에 복사된다
//
// 사용법
//   play.bat            전부
//   play.bat --no-build 빌드 건너뜀(코드가 안 바뀌었을 때)
//   stop.bat            터널 · 서버 끄기(DB 는 둔다)
// =============================================================================

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* .env 없어도 됨 */ }
const PORT = process.env.PORT ?? '3000';
const HEALTH = `http://localhost:${PORT}/healthz`;
const SERVER_TITLE = 'quiz-web 서버';
const args = new Set(process.argv.slice(2));

const log = (m) => console.log(`[play] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sh(cmd, { quiet = false, check = true } = {}) {
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (check && r.status !== 0) {
    if (quiet) process.stderr.write(r.stdout ?? '', r.stderr ?? '');
    throw new Error(`실패: ${cmd}`);
  }
  return r;
}
const ok = (cmd) => spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'pipe' }).status === 0;
const out = (cmd) => spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'pipe', encoding: 'utf8' }).stdout ?? '';

async function healthy() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const res = await fetch(HEALTH, { signal: ctl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(label, fn, ms, every = 2000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await sleep(every);
    process.stdout.write('.');
  }
  console.log('');
  throw new Error(`${label} — ${Math.round(ms / 1000)}초 안에 준비되지 않았습니다.`);
}

function dockerDesktopExe() {
  const found = out('where docker').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
  const cands = [
    found && path.join(path.dirname(found), '..', '..', 'Docker Desktop.exe'),
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    'D:\\Docker\\Docker\\Docker Desktop.exe',
  ].filter(Boolean);
  return cands.find((p) => existsSync(p)) ?? null;
}

async function stop() {
  log('터널 끄기');
  sh('taskkill /IM cloudflared.exe /T /F', { quiet: true, check: false });
  log(`서버 끄기 (포트 ${PORT})`);
  const pids = new Set(
    out(`netstat -ano -p tcp`)
      .split(/\r?\n/)
      .filter((l) => l.includes(`:${PORT} `) && /LISTENING/.test(l))
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((p) => p && p !== '0'),
  );
  for (const pid of pids) sh(`taskkill /PID ${pid} /T /F`, { quiet: true, check: false });
  sh(`taskkill /FI "WINDOWTITLE eq ${SERVER_TITLE}*" /T /F`, { quiet: true, check: false });
  log('끝. DB(quiz-web-db)는 그대로 둡니다 — 끄려면 npm run db:down');
}

async function main() {
  if (!WIN) throw new Error('이 스크립트는 Windows 용입니다 (docs/11 §2 의 수동 절차를 쓰세요).');
  if (args.has('--stop')) return stop();

  // 1) Docker
  if (!ok('docker info')) {
    const exe = dockerDesktopExe();
    if (!exe) throw new Error('Docker Desktop 을 찾지 못했습니다. 먼저 켜 주세요.');
    log('Docker Desktop 켜는 중…');
    spawn('cmd', ['/c', 'start', '""', exe], { detached: true, stdio: 'ignore' }).unref();
    await waitFor('Docker', async () => ok('docker info'), 180_000, 3000);
    console.log('');
  }
  log('Docker 준비됨');

  // 2) DB
  sh('docker compose up -d', { quiet: true });
  await waitFor('DB', async () => out('docker inspect -f "{{.State.Health.Status}}" quiz-web-db').trim() === 'healthy', 90_000);
  log('DB 준비됨 (quiz-web-db healthy)');

  // 3) 마이그레이션 — 이미 적용된 것은 건너뛴다
  sh('npm run db:migrate');

  // 4) 서버
  if (await healthy()) {
    log(`서버가 이미 켜져 있습니다(${HEALTH}) → 빌드 · 서버 시작을 건너뜁니다.`);
    log('★ 새 빌드로 바꾸려면: stop.bat → play.bat (하던 판이 끊기니 게임 중에는 하지 않기)');
  } else {
    if (args.has('--no-build')) log('빌드 건너뜀(--no-build)');
    else {
      log('빌드 중… (shared → server → client)');
      sh('npm run build');
    }
    log('서버 새 창으로 시작 (npm start — 감시 없음)');
    spawn('cmd', ['/c', 'start', `"${SERVER_TITLE}"`, 'cmd', '/k', 'chcp 65001 >nul && npm start'], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref();
    await waitFor('서버', healthy, 60_000, 1500);
    console.log('');
    log(`서버 응답 확인 (${HEALTH})`);
  }

  // 5) 터널
  if (args.has('--no-tunnel')) return log('터널 건너뜀(--no-tunnel)');
  if (/cloudflared\.exe/i.test(out('tasklist /FI "IMAGENAME eq cloudflared.exe" /NH'))) {
    log('터널이 이미 떠 있습니다 — 그 창의 주소를 그대로 쓰세요 (새 주소가 필요하면 stop.bat 뒤 다시).');
    return;
  }
  log('터널 시작 — 아래 주소를 친구들에게. 이 창을 닫으면 터널만 닫힙니다(서버 · 게임은 그대로).');
  const tunnel = spawn(process.execPath, [path.join(ROOT, 'scripts', 'dev-tunnel.mjs')], { cwd: ROOT, stdio: 'inherit' });
  const bye = () => tunnel.kill();
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
  await new Promise((r) => tunnel.on('exit', r));
}

main().catch((err) => {
  console.error('');
  console.error(`[play] ${err.message}`);
  process.exit(1);
});
