#!/usr/bin/env node
// =============================================================================
// 원터치 플레이 실행기 — ops.bat 메뉴 1 · 2 · 3 이 부른다 (찬종 2026-10-24: "db 키고 빌드하고 외부 공개까지 원터치" · "bat 하나로")
//
//   1) Docker Desktop 이 꺼져 있으면 켜고 기다린다
//   2) DB 컨테이너(quiz-web-db)를 올리고 healthy 까지 기다린다
//   3) 마이그레이션 — 적용할 것이 있을 때만(--dry 로 먼저 본다 · R070: GEN 작업과 겹칠 일을 줄인다)
//   4) 서버가 이미 떠 있으면(/healthz 응답) 빌드·서버는 건너뛴다
//      — ★ 빌드가 켜진 서버를 재시작시키면 하던 판이 끊긴다(bootCleanup). 새 빌드를 쓰려면 메뉴 3 뒤 1.
//      ★ R070 — 포트는 LISTENING 인데 /healthz 가 2초 안에 답하지 않으면(죽는 중 · 멈춤) 그 PID 를 죽이고 비기를 기다린 뒤 새로 띄운다.
//      아니면 npm run build → 새 창에서 npm start(감시 없음) — 출력은 창 + tmp/ops/server.log (ops-run.mjs)
//   5) DB 확인 한 번(SELECT 1 · 열린 판) — /healthz 는 DB 를 안 보므로(docs/02 3장) 여기서 따로 친다
//   6) 터널(cloudflared)을 새 창에서 — 출력은 창 + tmp/ops/tunnel.log · 밖에서 /healthz 200 이 온 뒤에 주소를 크게 · 클립보드 · 브라우저
//
// 사용법
//   ops.bat → 1  전부 (= node scripts/play.mjs)
//   ops.bat → 2  빌드 건너뜀 (--no-build · 코드가 안 바뀌었을 때)
//   ops.bat → 3  터널 · 서버 끄기 (--stop · DB 는 둔다) — ★ R070: 포트가 비고 cloudflared 가 사라질 때까지 기다린다
//   검사:  PORT=3100 DATABASE_URL=…/quizweb_test node scripts/play.mjs --no-tunnel   (로그는 tmp/ops/server3100.log)
// =============================================================================

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, cloudflaredPids, dbName, gitHead, hm, hms, logPaths, out, portPids, pruneLogs, tail, windowPids } from './ops-lib.mjs';

const WIN = process.platform === 'win32';
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* .env 없어도 됨 */ }
const PORT = process.env.PORT ?? '3000';
const HEALTH = `http://localhost:${PORT}/healthz`;
const MAIN_PORT = PORT === '3000';
// ★ 창 제목은 ASCII 만 — start "제목" 이 Node 의 인자 따옴표 처리를 거치며 깨졌다(2026-10-24 찬종: "서버\ 를 찾을 수 없다")
// ★ R070 — 3000 이 아닌 포트(검사)는 제목 · 로그 이름에 포트를 붙인다(검사의 끄기가 실 서버 창을 닫지 않게)
const SERVER_TITLE = MAIN_PORT ? 'quiz-web-server' : `quiz-web-server-${PORT}`;
const TUNNEL_TITLE = MAIN_PORT ? 'quiz-web-tunnel' : `quiz-web-tunnel-${PORT}`;
const SERVER_KIND = MAIN_PORT ? 'server' : `server${PORT}`;
const TUNNEL_KIND = MAIN_PORT ? 'tunnel' : `tunnel${PORT}`;
const SERVER_LOG = logPaths(SERVER_KIND).latest;
// 새 창을 띄울 때는 인자 배열이 아니라 문자열 하나로(shell) — start 의 "제목" 자리를 그대로 보존한다
const openWindow = (cmdline) => spawn(cmdline, { cwd: ROOT, shell: true, detached: true, stdio: 'ignore' }).unref();
const args = new Set(process.argv.slice(2));

const log = (m) => console.log(`[play ${hms()}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function sh(cmd, { quiet = false, check = true } = {}) {
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (check && r.status !== 0) {
    if (quiet) process.stderr.write((r.stdout ?? '') + (r.stderr ?? ''));
    throw new Error(`실패: ${cmd}`);
  }
  return r;
}
const ok = (cmd) => spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'pipe' }).status === 0;
const kill = (pid) => sh(`taskkill /PID ${pid} /T /F`, { quiet: true, check: false });

/** /healthz 본문(응답 없으면 null) */
async function health(ms = 1500) {
  try {
    const res = await fetch(HEALTH, { signal: AbortSignal.timeout(ms) });
    return res.ok ? await res.json().catch(() => ({})) : null;
  } catch {
    return null;
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

/** 포트 LISTENING · (터널까지 끄는 경우) 이 포트의 cloudflared 가 사라질 때까지 0.5초 간격 · 최대 15초 */
async function waitGone({ tunnel }) {
  const t0 = Date.now();
  for (;;) {
    const left = { port: portPids(PORT), cf: tunnel ? cloudflaredPids(PORT) : [] };
    if (left.port.length === 0 && left.cf.length === 0) return (Date.now() - t0) / 1000;
    if (Date.now() - t0 > 15_000) {
      const what = [left.port.length && `포트 ${PORT} PID ${left.port.join(',')}`, left.cf.length && `cloudflared PID ${left.cf.join(',')}`]
        .filter(Boolean).join(' · ');
      throw new Error(`15초가 지나도 아직 떠 있음(${what}) — 작업 관리자에서 node.exe · cloudflared.exe 확인`);
    }
    await sleep(500);
  }
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
  const cf = cloudflaredPids(PORT);
  log(`터널 끄기 (cloudflared ${cf.length ? `PID ${cf.join(',')}` : '없음'})`);
  for (const pid of cf) kill(pid);
  const pids = portPids(PORT);
  log(`서버 끄기 (포트 ${PORT} ${pids.length ? `PID ${pids.join(',')}` : '비어 있음'})`);
  for (const pid of pids) kill(pid);
  // 창 닫기 — 창 제목이 아니라 cmd /k 의 명령줄로 찾는다(ops-lib windowPids 주석 — Windows Terminal)
  const wins = [...windowPids(SERVER_KIND), ...windowPids(TUNNEL_KIND)];
  for (const pid of wins) kill(pid);
  if (wins.length) log(`창 ${wins.length}개 닫음`);
  const sec = await waitGone({ tunnel: true });
  log(`서버 · 터널 꺼짐 확인(포트 ${PORT} 비어 있음 · ${sec.toFixed(1)}초) — DB(quiz-web-db)는 그대로 둡니다(끄려면 npm run db:down)`);
}

/** 서버 창의 이번 기동 로그가 "끝(code=" 으로 닫혔는가 — 기동 전 로그(옛 실행)는 첫 줄 시각으로 거른다 */
function serverExited(since) {
  const lines = tail(SERVER_LOG, 400);
  const first = lines[0]?.match(/^\[ops-run\] (\S+Z)/);
  if (!first || Date.parse(first[1]) < since - 1000) return false;
  return lines.some((l) => /^\[ops-run\] .* 끝\(code=/.test(l));
}

function showServerTail(n = 30) {
  const lines = tail(SERVER_LOG, n);
  console.log(`\n──── ${rel(SERVER_LOG)} 마지막 ${lines.length}줄 ────`);
  for (const l of lines) console.log(`  ${l}`);
  console.log('────');
}

async function dbCheck() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 10_000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    const g = await client.query('SELECT count(*)::int AS n FROM games WHERE ended_at IS NULL');
    log(`DB 응답(${dbName(process.env.DATABASE_URL)}) · 열린 판 ${g.rows[0].n}`);
  } catch (e) {
    throw new Error(`DB 확인 실패(${dbName(process.env.DATABASE_URL)}): ${e.message} — 서버 로그: ${rel(SERVER_LOG)}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (!WIN) throw new Error('이 스크립트는 Windows 용입니다 (docs/11 §2 의 수동 절차를 쓰세요).');
  if (args.has('--stop')) return stop();

  const gone = pruneLogs();
  if (gone.length) log(`14일 지난 로그 ${gone.length}개 지움 (tmp/ops)`);

  // 1) Docker
  if (!ok('docker info')) {
    const exe = dockerDesktopExe();
    if (!exe) throw new Error('Docker Desktop 을 찾지 못했습니다. 먼저 켜 주세요.');
    log('Docker Desktop 켜는 중…');
    openWindow(`start "" "${exe}"`);
    await waitFor('Docker', async () => ok('docker info'), 180_000, 3000);
    console.log('');
  }
  log('Docker 준비됨');

  // 2) DB
  sh('docker compose up -d', { quiet: true });
  await waitFor('DB', async () => out('docker inspect -f "{{.State.Health.Status}}" quiz-web-db').trim() === 'healthy', 90_000);
  log('DB 준비됨 (quiz-web-db healthy)');

  // 3) 마이그레이션 — 적용할 것이 있을 때만(대부분의 날은 없다 → GEN 의 긴 트랜잭션과 겹칠 일 자체가 없다)
  const dry = sh('node scripts/migrate.mjs --dry', { quiet: true });
  const pending = dry.stdout.match(/적용 대상 (\d+)개/);
  if (pending) {
    log(`마이그레이션 ${pending[1]}개 적용 (잠금 10초 제한 — 걸리면 스스로 멈추고 알려 준다)`);
    sh('node scripts/migrate.mjs');
  } else log('적용할 마이그레이션 없음 → migrate 건너뜀');

  // 4) 서버
  const h = await health(2000);
  if (h) {
    const booted = h.bootedAt ? new Date(h.bootedAt) : null;
    const dist = path.join(ROOT, 'server', 'dist', 'index.js');
    const built = existsSync(dist) ? statSync(dist).mtime : null;
    const newer = booted && built && built > booted;
    log(
      `서버가 이미 켜져 있음(기동 ${booted ? hm(booted) : '?'}${h.pid ? ` · PID ${h.pid}` : ''} · ` +
        `${newer ? `★ 빌드(${hm(built)})가 기동보다 새것` : '빌드 그대로'} · HEAD ${gitHead()}) → 빌드 · 서버 시작을 건너뜁니다.`,
    );
    log('★ 새 빌드로 바꾸려면: 메뉴 3(끄기) → 1(켜기) (하던 판이 끊기니 게임 중에는 하지 않기)');
  } else {
    const stale = portPids(PORT);
    if (stale.length) {
      log(`포트 ${PORT} 는 LISTENING(PID ${stale.join(',')})인데 /healthz 가 2초 안에 답하지 않음 — 죽는 중 · 멈춘 옛 서버 → 끄고 새로 띄웁니다`);
      for (const pid of stale) kill(pid);
      const sec = await waitGone({ tunnel: false });
      log(`옛 서버 꺼짐 확인(포트 ${PORT} 비어 있음 · ${sec.toFixed(1)}초)`);
    }
    if (args.has('--no-build')) log('빌드 건너뜀(--no-build)');
    else {
      log('빌드 중… (shared → server → client)');
      sh('npm run build');
      log('빌드 끝');
    }
    log(`서버 새 창(${SERVER_TITLE})으로 시작 (npm start — 감시 없음 · 로그 ${rel(SERVER_LOG)})`);
    const since = Date.now();
    openWindow(
      `start "${SERVER_TITLE}" cmd /k "chcp 65001 >nul && title ${SERVER_TITLE} && node scripts\\ops-run.mjs ${SERVER_KIND} npm start"`,
    );
    try {
      await waitFor('서버', async () => {
        if (await health()) return true;
        if (serverExited(since)) throw new Error('서버 창의 프로세스가 끝났습니다(위 로그 꼬리 · 창은 남아 있음)');
        return false;
      }, 60_000, 1500);
    } catch (e) {
      console.log('');
      showServerTail(30);
      throw e;
    }
    console.log('');
    log(`서버 응답 확인 (${HEALTH} · ${((Date.now() - since) / 1000).toFixed(1)}초)`);
  }

  // 5) DB 확인 — /healthz 는 DB 를 안 본다(docs/02 3장)
  await dbCheck();

  // 6) 터널
  if (args.has('--no-tunnel')) return log('터널 건너뜀(--no-tunnel)');
  const cf = cloudflaredPids(PORT);
  if (cf.length) {
    log(`터널이 이미 떠 있습니다(PID ${cf.join(',')}) — 그 창(${TUNNEL_TITLE})의 주소를 그대로 쓰세요 (새 주소가 필요하면 메뉴 3 뒤 다시).`);
  } else {
    log(`터널을 새 창(${TUNNEL_TITLE})에서 시작 — 밖에서 열리는 것을 확인한 뒤 주소가 크게 뜨고, 클립보드에 복사되고, 브라우저가 열립니다(보통 10~30초). 로그 ${rel(logPaths(TUNNEL_KIND).latest)}`);
    openWindow(
      `start "${TUNNEL_TITLE}" cmd /k "chcp 65001 >nul && title ${TUNNEL_TITLE} && node scripts\\ops-run.mjs ${TUNNEL_KIND} node scripts\\dev-tunnel.mjs"`,
    );
  }
  log('안 열리면: 메뉴 4(상태 — 로그 꼬리) · 메뉴 14(로그 열기)');
}

main().catch((err) => {
  console.error('');
  console.error(`[play ${hms()}] ${err.message}`);
  process.exit(1);
});
