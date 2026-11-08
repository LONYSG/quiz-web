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
// ★★ R078 (D-332 · D-331) — 플레이 서버는 **플레이 트리**(git worktree · 기본 C:\work\quiz-web-play · env QUIZ_PLAY_DIR)에서 뜬다.
//   build · migrate · npm start · 터널이 모두 그 트리(cwd)에서 · 그 트리의 scripts 로. 창 래퍼(ops-run)와 로그(tmp/ops)는 이 트리.
//   켤 때 이 트리의 tmp/ops/play.json 에 { dir, head, tag, port, pid, startedAt, lockHash, here } — test-db liveServerUp 이 본다
//   (3000 이 플레이 트리에서 떴으면 이 트리의 빌드 · 검사가 자유롭다). 코드 고르기(--code=…):
//     latest(기본) = origin/main 을 fetch 한 커밋 → 플레이 트리 checkout --detach + 로컬 태그 play/YYYYMMDD-HHmm(push 안 함)
//     keep = 지금 플레이 트리 그대로 · <태그·커밋> = 그 커밋(되돌리기)
//   서버가 이미 떠 있으면 코드 고르기 · npm ci · 빌드를 전부 건너뛴다(떠 있는 서버 밑의 파일을 바꾸지 않는다).
//
// 사용법
//   ops.bat → 1  전부 — 먼저 "어느 코드로 켤까요? [1] main 최신 [2] 플레이 트리 그대로 [3] 태그·커밋" (= node scripts/play.mjs --code=…)
//   ops.bat → 2  빌드 건너뜀 (--no-build --code=keep · 코드가 안 바뀌었을 때)
//   ops.bat → 18 플레이 트리 만들기 / 상태 (--tree)
//   되돌리기:   node scripts/play.mjs --here   (옛 방식 — 이 트리에서 3000 · play.json dir = 이 트리 → 빌드 빗장이 다시 선다)
//   ops.bat → 3  터널 · 서버 끄기 (--stop · DB 는 둔다) — ★ R070: 포트가 비고 cloudflared 가 사라질 때까지 기다린다
//   검사:  PORT=3100 DATABASE_URL=…/quizweb_test node scripts/play.mjs --no-tunnel   (로그는 tmp/ops/server3100.log)
// =============================================================================

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, cloudflaredPids, dbName, gitHead, hm, hms, logPaths, out, portPids, pruneLogs, tail, windowPids } from './ops-lib.mjs';
import {
  TAG_PREFIX, assertPlainPath, codeFromArg, lockHashOf, needsCi, playDir, readPlayJson, tagName, writePlayJson,
} from './play-tree.mjs';

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
const argv = process.argv.slice(2);
const args = new Set(argv);
const argVal = (name) => argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
// ★ R078 — 플레이 트리(TREE)에서 켠다. --here(되돌리기) · 3000 이 아닌 포트(검사)는 옛 방식대로 이 트리.
const HERE = args.has('--here') || !MAIN_PORT;
const TREE = HERE ? ROOT : playDir();
// 창 래퍼는 늘 이 트리의 것(로그가 이 트리 tmp/ops 에 — 메뉴 4 · 14) · 자식은 --cwd=TREE 에서
const RUNNER = path.join(ROOT, 'scripts', 'ops-run.mjs');
const CWD_ARG = HERE ? '' : ` --cwd=${TREE}`;

const log = (m) => console.log(`[play ${hms()}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function sh(cmd, { quiet = false, check = true, cwd = ROOT } = {}) {
  const r = spawnSync(cmd, { cwd, shell: true, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (check && r.status !== 0) {
    if (quiet) process.stderr.write((r.stdout ?? '') + (r.stderr ?? ''));
    throw new Error(`실패: ${cmd}`);
  }
  return r;
}
const ok = (cmd) => spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'pipe' }).status === 0;
/** git (이 저장소 · 태그 · fetch) / gitT (플레이 트리) — 출력(앞뒤 공백 뺌) · check:false 면 실패 때 null */
const git = (a, { cwd = ROOT, check = true } = {}) => {
  const r = spawnSync(`git ${a}`, { cwd, shell: true, stdio: 'pipe', encoding: 'utf8' });
  if (check && r.status !== 0) throw new Error(`git ${a} 실패: ${(r.stderr ?? '').trim().slice(0, 300)}`);
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
};
const gitT = (a, o = {}) => git(a, { ...o, cwd: TREE });
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

// ── ★ R078 플레이 트리 (D-332)
const treeExists = () => existsSync(path.join(TREE, '.git'));
const tagsAt = (sha) => (git(`tag --points-at ${sha} -l "${TAG_PREFIX}*"`) ?? '').split(/\r?\n/).filter(Boolean).sort();

/** origin/main 을 fetch(실패하면 경고 · 지금 아는 origin/main) → 커밋 해시 */
function latestMain() {
  const f = spawnSync('git fetch origin main', { cwd: ROOT, shell: true, stdio: 'pipe', encoding: 'utf8' });
  if (f.status !== 0) {
    const why = (f.stderr ?? '').trim().split(/\r?\n/)[0]?.slice(0, 120) ?? '';
    log(`★ git fetch 실패 — 지금 아는 origin/main 으로 갑니다 (VPN 확인 필요 · ${why})`);
  }
  return git('rev-parse origin/main');
}

/** 플레이 트리 node_modules — 없거나 package-lock.json 해시가 지난번과 다를 때만 npm ci(1~3분) → 지금 해시 */
function ensureDeps(prevLockHash) {
  const lockHash = lockHashOf(TREE);
  const hasNodeModules = existsSync(path.join(TREE, 'node_modules'));
  if (needsCi({ hasNodeModules, prevLockHash, lockHash })) {
    log(`npm ci (플레이 트리 · ${hasNodeModules ? `package-lock 해시 ${prevLockHash || '모름'} → ${lockHash}` : 'node_modules 없음'} · 1~3분)`);
    sh('npm ci --no-audit --no-fund', { cwd: TREE });
    log('npm ci 끝');
  } else log(`node_modules 그대로 (package-lock 해시 ${lockHash} 같음)`);
  return lockHash;
}

/** .env 는 gitignore 라 worktree 에 없다 — 없을 때만 이 트리의 .env 를 복사(값은 바꾸지 않는다 · .env.dev 는 복사하지 않는다) */
function ensureEnv() {
  const dst = path.join(TREE, '.env');
  if (existsSync(dst)) return;
  const src = path.join(ROOT, '.env');
  if (!existsSync(src)) throw new Error('이 트리에 .env 가 없습니다 — .env.example 을 .env 로 복사해 값을 채운 뒤 다시');
  copyFileSync(src, dst);
  log('.env 를 플레이 트리로 복사(이 트리 것 그대로 · 없을 때만)');
}

/** 없으면 만든다(origin/main 최신에서 · detached) → { created } */
function ensureTree() {
  assertPlainPath(ROOT, '이 트리');
  assertPlainPath(TREE, '플레이 트리');
  if (treeExists()) return { created: false };
  if (existsSync(TREE) && readdirSync(TREE).length > 0) {
    throw new Error(`${TREE} 가 이미 있는데 git worktree 가 아닙니다 — 비우거나 QUIZ_PLAY_DIR 로 다른 경로를`);
  }
  const sha = latestMain();
  log(`플레이 트리 만들기: git worktree add --detach ${TREE} ${sha.slice(0, 8)} (origin/main)`);
  git(`worktree add --detach "${TREE}" ${sha}`);
  ensureEnv();
  return { created: true };
}

/** 이 커밋을 가리키는 play/* 태그(없으면 만든다 — 로컬 · push 안 함) */
function ensureTag(sha) {
  const have = tagsAt(sha);
  if (have.length) return have.at(-1);
  const all = (git(`tag -l "${TAG_PREFIX}*"`) ?? '').split(/\r?\n/).filter(Boolean);
  const tag = tagName(new Date(), all);
  git(`tag ${tag} ${sha}`);
  log(`태그 ${tag} → ${sha.slice(0, 8)} (로컬 · push 안 함)`);
  return tag;
}

/** 코드 고르기 → 플레이 트리를 그 커밋으로(detached) → { head, tag, switched } */
function selectCode(code) {
  const cur = gitT('rev-parse HEAD');
  let sha;
  if (code.kind === 'keep') sha = cur;
  else if (code.kind === 'latest') sha = latestMain();
  else {
    sha = git(`rev-parse --verify --quiet "${code.ref}^{commit}"`, { check: false });
    if (!sha) throw new Error(`태그·커밋을 찾지 못했습니다: ${code.ref} (목록: git tag -l "play/*")`);
  }
  let switched = false;
  if (sha !== cur) {
    const dirty = gitT('status --porcelain --untracked-files=no');
    if (dirty) throw new Error(`플레이 트리에 고친 파일이 있습니다(읽기 전용 취급) — 확인 뒤 git -C ${TREE} checkout -- .\n${dirty.slice(0, 300)}`);
    log(`플레이 트리 ${cur.slice(0, 8)} → ${sha.slice(0, 8)} (checkout --detach)`);
    gitT(`checkout --detach ${sha}`);
    switched = true;
  } else log(`플레이 트리 코드 그대로 (${sha.slice(0, 8)})`);
  return { head: sha, tag: ensureTag(sha), switched };
}

/** 메뉴 18 — 플레이 트리 만들기 / 상태 */
async function treeStatus() {
  const { created } = ensureTree();
  const prev = readPlayJson();
  if (created) ensureDeps('');
  const head = gitT('rev-parse HEAD');
  const tag = tagsAt(head).at(-1);
  const when = gitT('log -1 --format=%cd --date=format:%Y-%m-%d_%H:%M HEAD');
  const subject = (gitT('log -1 --format=%s HEAD') ?? '').slice(0, 60);
  const ahead = git(`rev-list --count ${head}..HEAD`, { check: false });
  const behind = git(`rev-list --count ${head}..origin/main`, { check: false });
  const free = out(`powershell -NoProfile -Command "[math]::Round((Get-PSDrive ${TREE[0]}).Free/1GB,1)"`).trim();
  log(`플레이 트리 ${TREE}${created ? ' (방금 만듦)' : ''}`);
  log(`  HEAD ${head.slice(0, 8)} · 태그 ${tag ?? '(없음 — 메뉴 1 이 붙인다)'} · 커밋 시각 ${when} · "${subject}"`);
  log(`  개발 트리 HEAD ${gitHead()} — 플레이보다 ${ahead ?? '?'} 커밋 앞 · origin/main 은 플레이보다 ${behind ?? '?'} 커밋 앞`);
  log(`  package-lock 해시 ${lockHashOf(TREE)} (지난 켜기 ${prev?.lockHash ?? '-'}) · node_modules ${existsSync(path.join(TREE, 'node_modules')) ? '있음' : '없음'} · .env ${existsSync(path.join(TREE, '.env')) ? '있음' : '없음'} · 드라이브 여유 ${free}GB`);
  if (prev) log(`  마지막 켜기 ${prev.startedAt ? new Date(prev.startedAt).toLocaleString('ko-KR') : '-'} · ${prev.tag ?? prev.head?.slice(0, 8) ?? '-'} · ${prev.here ? '★ 이 트리(--here)' : '플레이 트리'}`);
  if (created) log('  ★ 다음: 메뉴 1 → [1] (플레이 트리를 최신으로 빌드해 3000 을 켭니다)');
}

async function main() {
  if (!WIN) throw new Error('이 스크립트는 Windows 용입니다 (docs/11 §2 의 수동 절차를 쓰세요).');
  if (args.has('--stop')) return stop();
  if (args.has('--tree')) return treeStatus();
  log(HERE ? `★ 이 트리에서 켭니다(${MAIN_PORT ? '--here — 되돌리기 · 빌드 빗장이 다시 선다' : `검사 포트 ${PORT}`})` : `플레이 트리 ${TREE}`);

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
  //    ★ R078 — 켜는 트리(플레이 트리)의 migrations 로 · 코드 고르기 뒤에. 새 마이그레이션은 플레이 트리가 그 커밋으로 올라갈 때 quizweb 에 들어간다.
  const migrate = () => {
    const dry = sh('node scripts/migrate.mjs --dry', { quiet: true, cwd: TREE });
    const pending = dry.stdout.match(/적용 대상 (\d+)개/);
    if (pending) {
      log(`마이그레이션 ${pending[1]}개 적용 (${HERE ? '이 트리' : '플레이 트리'}의 migrations · 잠금 10초 제한 — 걸리면 스스로 멈추고 알려 준다)`);
      sh('node scripts/migrate.mjs', { cwd: TREE });
    } else log('적용할 마이그레이션 없음 → migrate 건너뜀');
  };

  // 4) 서버
  const h = await health(2000);
  if (h) {
    const booted = h.bootedAt ? new Date(h.bootedAt) : null;
    const dist = path.join(TREE, 'server', 'dist', 'index.js');
    const built = existsSync(dist) ? statSync(dist).mtime : null;
    const newer = booted && built && built > booted;
    log(
      `서버가 이미 켜져 있음(기동 ${booted ? hm(booted) : '?'}${h.pid ? ` · PID ${h.pid}` : ''} · ` +
        `${newer ? `★ 빌드(${hm(built)})가 기동보다 새것` : '빌드 그대로'} · HEAD ${HERE || treeExists() ? gitHead(TREE) : '?'}) → 코드 고르기 · 빌드 · 서버 시작을 건너뜁니다.`,
    );
    const pj = readPlayJson();
    if (MAIN_PORT && pj && !HERE && pj.pid && h.pid && String(pj.pid) !== String(h.pid)) {
      log(`★ tmp/ops/play.json 의 PID(${pj.pid})와 떠 있는 서버 PID(${h.pid})가 다름 — 이 트리 빌드 빗장이 섭니다(메뉴 3 → 1 로 바로잡힘)`);
    }
    if (HERE || treeExists()) migrate();
    log('★ 새 빌드로 바꾸려면: 메뉴 3(끄기) → 1(켜기) (하던 판이 끊기니 게임 중에는 하지 않기)');
  } else {
    const stale = portPids(PORT);
    if (stale.length) {
      log(`포트 ${PORT} 는 LISTENING(PID ${stale.join(',')})인데 /healthz 가 2초 안에 답하지 않음 — 죽는 중 · 멈춘 옛 서버 → 끄고 새로 띄웁니다`);
      for (const pid of stale) kill(pid);
      const sec = await waitGone({ tunnel: false });
      log(`옛 서버 꺼짐 확인(포트 ${PORT} 비어 있음 · ${sec.toFixed(1)}초)`);
    }
    // ★ R078 — 플레이 트리: 만들기(없으면) → 코드 고르기 → .env → npm ci(조건) → migrate → 빌드 (전부 TREE 에서)
    let pick = { head: HERE ? git('rev-parse HEAD') : '', tag: null, switched: false };
    let lockHash = '';
    if (!HERE) {
      const { created } = ensureTree();
      pick = selectCode(codeFromArg(argVal('--code')));
      ensureEnv();
      lockHash = ensureDeps(created ? '' : readPlayJson()?.lockHash ?? '');
    }
    migrate();
    const noDist = !existsSync(path.join(TREE, 'server', 'dist', 'index.js')) || !existsSync(path.join(TREE, 'client', 'dist', 'index.html'));
    if (args.has('--no-build') && !pick.switched && !noDist) log('빌드 건너뜀(--no-build)');
    else {
      if (args.has('--no-build')) log(`★ --no-build 인데 ${pick.switched ? '코드가 바뀜' : 'dist 가 없음'} → 빌드합니다`);
      log(`빌드 중… (shared → server → client · ${HERE ? '이 트리' : '플레이 트리'})`);
      sh('npm run build', { cwd: TREE });
      log('빌드 끝');
    }
    log(`서버 새 창(${SERVER_TITLE})으로 시작 (npm start — 감시 없음 · 로그 ${rel(SERVER_LOG)})`);
    const since = Date.now();
    openWindow(
      `start "${SERVER_TITLE}" cmd /k "chcp 65001 >nul && title ${SERVER_TITLE} && node ${RUNNER} ${SERVER_KIND}${CWD_ARG} npm start"`,
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
    const up = await health();
    log(`서버 응답 확인 (${HEALTH} · ${((Date.now() - since) / 1000).toFixed(1)}초 · PID ${up?.pid ?? '?'})`);
    if (MAIN_PORT) {
      writePlayJson({
        dir: TREE, head: pick.head, tag: pick.tag, port: PORT, pid: up?.pid ?? null,
        startedAt: new Date().toISOString(), lockHash: lockHash || lockHashOf(TREE), here: HERE,
      });
      log(`tmp/ops/play.json 기록 — ${HERE ? '★ 이 트리(--here · 빌드 빗장 선다)' : `플레이 트리 ${pick.tag ?? pick.head.slice(0, 8)} (이 트리 빌드 · 검사 자유)`}`);
    }
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
      `start "${TUNNEL_TITLE}" cmd /k "chcp 65001 >nul && title ${TUNNEL_TITLE} && node ${RUNNER} ${TUNNEL_KIND}${CWD_ARG} node scripts\\dev-tunnel.mjs"`,
    );
  }
  log('안 열리면: 메뉴 4(상태 — 로그 꼬리) · 메뉴 14(로그 열기)');
}

main().catch((err) => {
  console.error('');
  console.error(`[play ${hms()}] ${err.message}`);
  process.exit(1);
});
