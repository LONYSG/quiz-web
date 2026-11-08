#!/usr/bin/env node
// =============================================================================
// 운영자 메뉴 — ops.bat 이 부른다 (찬종 2026-10-24: "선택 · 계정 이름 입력만 하면 명령어는 알아서")
//
//   번호를 고르고 묻는 것(아이디 · 포인트 · 메모)만 적으면 기존 스크립트를 올바른 인자로 대신 부른다.
//   ★ DB 를 바꾸는 항목(포인트 · 비밀번호 · 처리 표시 · 채택)은 반드시 ① 무엇을 할지 보여 주고 ② y 를 받고 ③ 먼저 백업한다.
//   ★ 새 규칙을 만들지 않는다 — 거부(봇 계정 · 범위 밖 포인트 · 없는 번호)는 각 스크립트의 것을 그대로 쓴다.
//
// 사용법:  ops.bat   (또는 node scripts/ops.mjs)
// =============================================================================

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { cloudflaredPids, logPaths, portPids, tail, tunnelUrl } from './ops-lib.mjs';
import { parseCodeChoice, playDir, readPlayJson } from './play-tree.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 없어도 됨 */ }
const PORT = process.env.PORT ?? '3000';
// ★ R070 — play.mjs 가 남기는 창 로그(3000 이 아닌 포트는 이름에 포트가 붙는다 — play.mjs 와 같은 규칙)
const LOGS = Object.fromEntries(['server', 'tunnel'].map((k) => [k, logPaths(PORT === '3000' ? k : `${k}${PORT}`).latest]));
const DATABASE_URL = process.env.DATABASE_URL;
const rl = createInterface({ input, output });
rl.on('close', () => { console.log('\n[ops] 끝'); process.exit(0); }); // Ctrl+C · 입력 끝

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const line = (ch = '─', n = 60) => console.log(ch.repeat(n));
function run(cmd, { quiet = false } = {}) {
  console.log(`\n$ ${cmd}`);
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  return r.status === 0;
}
const out = (cmd) => spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'pipe', encoding: 'utf8' }).stdout ?? '';
async function ask(label, { required = true, def = null } = {}) {
  for (;;) {
    const v = (await rl.question(`${label}${def != null ? ` [${def}]` : ''}: `)).trim();
    if (v) return v;
    if (def != null) return String(def);
    if (!required) return '';
  }
}
async function yes(label = '진행할까요?') {
  const v = (await rl.question(`${label} (y/N): `)).trim().toLowerCase();
  return v === 'y' || v === 'yes';
}
function backup() {
  console.log('\n[ops] 먼저 백업합니다 (npm run db:backup)');
  if (!run('npm run db:backup')) throw new Error('백업이 실패해서 멈춥니다 — 아무것도 바꾸지 않았습니다.');
}

// ── DB 읽기(읽기만 — 쓰기는 전부 기존 스크립트가 한다)
let client = null;
async function db() {
  if (!DATABASE_URL) throw new Error('.env 의 DATABASE_URL 이 없습니다.');
  if (!client) { client = new pg.Client({ connectionString: DATABASE_URL }); await client.connect(); }
  return client;
}
const BOT = /^(bot_?|uic|r10_)/i;
async function account(login) {
  const c = await db();
  const r = await c.query(
    `SELECT a.id, a.login_id, a.nickname, a.created_at,
            (SELECT count(*) FROM answer_events WHERE account_id = a.id AND accepted)::int
          + (SELECT coalesce(sum(amount),0) FROM minigame_rewards WHERE account_id = a.id)::int
          + (SELECT coalesce(sum(amount),0) FROM point_grants WHERE account_id = a.id)::int
          - (SELECT coalesce(sum(amount),0) FROM point_spends WHERE account_id = a.id)::int AS balance
       FROM accounts a WHERE a.login_id = $1`,
    [login],
  );
  return r.rows[0] ?? null;
}
async function showAccount(login) {
  const a = await account(login);
  if (!a) { console.log(`  ✗ 없는 아이디: ${login}`); return null; }
  console.log(`  → ${a.login_id} (${a.nickname}) · 잔액 ${a.balance}P · 가입 ${new Date(a.created_at).toLocaleDateString('ko-KR')}${BOT.test(a.login_id) ? ' · ★ 봇/검사 계정' : ''}`);
  return a;
}

// ── 메뉴 항목
async function listAccounts() {
  const c = await db();
  const r = await c.query(
    `SELECT a.login_id, a.nickname, a.created_at,
            (SELECT count(*) FROM answer_events WHERE account_id = a.id AND accepted)::int
          + (SELECT coalesce(sum(amount),0) FROM minigame_rewards WHERE account_id = a.id)::int
          + (SELECT coalesce(sum(amount),0) FROM point_grants WHERE account_id = a.id)::int
          - (SELECT coalesce(sum(amount),0) FROM point_spends WHERE account_id = a.id)::int AS balance,
            (SELECT max(started_at) FROM games g JOIN game_players gp ON gp.game_id = g.id WHERE gp.account_id = a.id) AS last_game
       FROM accounts a ORDER BY a.id`,
  );
  const rows = r.rows.filter((x) => !BOT.test(x.login_id));
  // 한글은 두 칸 — 열이 맞게 채운다
  const width = (s) => [...String(s)].reduce((n, ch) => n + (/[ᄀ-ᇿ　-〿가-힯＀-￯]/.test(ch) ? 2 : 1), 0);
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
  line();
  console.log(`  계정 ${rows.length}명 (봇 · 검사 계정 ${r.rows.length - rows.length} 뺌)`);
  console.log(`  ${pad('아이디', 16)} ${pad('닉네임', 18)} ${'잔액'.padStart(6)}  가입        마지막 판`);
  for (const x of rows) {
    const d = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '-');
    console.log(`  ${pad(x.login_id, 16)} ${pad(x.nickname, 18)} ${String(x.balance).padStart(5)}P  ${d(x.created_at)}  ${d(x.last_game)}`);
  }
  line();
}

async function grantPoints() {
  console.log('\n■ 포인트 주기 (npm run points:grant · reason=admin)');
  const login = await ask('아이디');
  if (!(await showAccount(login))) return;
  const points = await ask('포인트(1~1000)');
  const note = await ask('메모(받는 사람 토스트에 안 보임 · 기록용)', { required: false, def: '운영자 지급' });
  console.log(`\n  ${login} 에게 ${points}P · 메모 "${note}"`);
  if (!(await yes())) return console.log('  취소');
  backup();
  run(`npm run points:grant -- --login ${q(login)} --points ${q(points)} --reason admin --note ${q(note)} --yes`);
}

async function resetPassword() {
  console.log('\n■ 비밀번호 초기화 — 0000 으로 바꾸고, 그 사람은 다음 로그인 때 새 비밀번호를 반드시 정하게 된다');
  const login = await ask('아이디');
  if (!(await showAccount(login))) return;
  if (!(await yes(`${login} 의 비밀번호를 0000 으로 초기화할까요? (기존 로그인은 전부 풀립니다)`))) return console.log('  취소');
  backup();
  run(`npm run reset-password -- ${q(login)}`);
  console.log('\n  → 본인에게: "0000 으로 로그인하면 새 비밀번호 화면이 뜬다"');
}

async function reports(all = false) {
  run(`npm run reports:report -- --no-bots${all ? ' --all' : ''}`);
  console.log('  (전체 글은 tmp/app-reports.md)');
}

async function handleReports() {
  console.log('\n■ 제보 처리 표시 (reports:handle)');
  const ids = await ask('제보 번호(여러 개는 쉼표 · 예 32,33)');
  const note = await ask('메모(예 "R066 반영" · "답변함")');
  console.log(`\n  #${ids} → 처리됨 · 메모 "${note}"`);
  if (!(await yes())) return console.log('  취소');
  backup();
  run(`npm run reports:handle -- --id ${q(ids)} --note ${q(note)} --yes`);
}

async function adoptFeedback() {
  console.log('\n■ 문제 평가 채택 (+5P 기본) — 번호(f#)는 먼저 9번 메뉴로 본다');
  const id = await ask('평가 번호(f# 의 숫자)');
  const points = await ask('포인트', { def: 5 });
  const note = await ask('메모', { required: false, def: '제보 채택' });
  console.log(`\n  f#${id} 채택 · ${points}P · "${note}"`);
  if (!(await yes())) return console.log('  취소');
  backup();
  run(`npm run feedback:adopt -- --id ${q(id)} --points ${q(points)} --note ${q(note)} --yes`);
}

async function status() {
  line();
  const docker = spawnSync('docker info', { shell: true, stdio: 'pipe' }).status === 0;
  const dbUp = docker && out('docker inspect -f "{{.State.Health.Status}}" quiz-web-db').trim() === 'healthy';
  let h = null;
  try {
    const res = await fetch(`http://localhost:${PORT}/healthz`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) h = await res.json().catch(() => ({}));
  } catch { /* 꺼짐 */ }
  const server = !!h;
  const cf = cloudflaredPids(PORT);
  const tunnel = cf.length > 0;
  console.log(`  Docker ${docker ? '켜짐' : '꺼짐'} · DB ${dbUp ? '정상' : '꺼짐'} · 서버(${PORT}) ${server ? '켜짐' : '꺼짐'} · 터널 ${tunnel ? '켜짐' : '꺼짐'}`);
  // ★ R070 — 기동 시각 · 포트 PID · 터널 주소(로그에서) — "몇 분 기다려도 안 열림" 때 서버 탓인지 터널 탓인지 가르는 줄
  const port = portPids(PORT);
  console.log(
    `  서버 기동 ${h?.bootedAt ? new Date(h.bootedAt).toLocaleString('ko-KR') : '-'} · 포트 ${PORT} PID ${port.join(',') || '없음'}` +
      `${server ? '' : port.length ? ' ★ 포트는 잡혀 있는데 /healthz 무응답(죽는 중 · 멈춤 → 메뉴 3 → 1)' : ''}` +
      ` · 터널 ${tunnel ? `PID ${cf.join(',')} · 주소 ${tunnelUrl(LOGS.tunnel) ?? '(로그에 없음)'}` : '꺼짐'}`,
  );
  if (dbUp) {
    try {
      const c = await db();
      const g = await c.query(`SELECT count(*)::int AS n FROM games WHERE ended_at IS NULL`);
      const r = await c.query(`SELECT count(*)::int AS n FROM app_reports WHERE handled_at IS NULL`);
      const p = await c.query(`SELECT max(started_at) AS t FROM games`);
      console.log(`  진행 중인 판 ${g.rows[0].n} · 처리 안 된 제보 ${r.rows[0].n} · 마지막 판 ${p.rows[0].t ? new Date(p.rows[0].t).toLocaleString('ko-KR') : '-'}`);
    } catch (e) { console.log(`  (DB 조회 실패: ${e.message})`); }
  }
  for (const [kind, file] of Object.entries(LOGS)) {
    const lines = tail(file, 15);
    console.log(`\n  ── ${path.relative(ROOT, file).replace(/\\/g, '/')} 마지막 ${lines.length}줄${lines.length ? '' : ` (아직 없음 — ${kind} 를 메뉴 1 로 켜면 생긴다)`}`);
    for (const l of lines) console.log(`  │ ${l}`);
  }
  line();
}

function openLogs() {
  const files = Object.values(LOGS).filter((f) => existsSync(f));
  if (files.length === 0) return console.log('  로그가 아직 없습니다 — 메뉴 1 로 켜면 tmp/ops/server.log · tunnel.log 가 생깁니다');
  for (const f of files) spawn(`start "" notepad "${f}"`, { shell: true, detached: true, stdio: 'ignore' }).unref();
  console.log(`  메모장으로 열었습니다: ${files.map((f) => path.basename(f)).join(' · ')} (지난 기동은 tmp/ops/<server|tunnel>-날짜-시각.log · 14일 보관)`);
}

/** /healthz 본문(응답 없으면 null) */
async function healthOf(port) {
  try {
    const res = await fetch(`http://localhost:${port}/healthz`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.json().catch(() => ({})) : null;
  } catch { return null; }
}

// ★ R078 (D-332) — 메뉴 1 은 먼저 "어느 코드로 켤까요?" · 서버가 이미 떠 있으면 묻지 않는다(play.mjs 가 건너뛴다고 알린다)
async function playOn() {
  if (await healthOf(PORT)) return run('node scripts/play.mjs');
  const tree = existsSync(path.join(playDir(), '.git'));
  console.log(`\n  어느 코드로 켤까요?${tree ? '' : '  (플레이 트리가 아직 없음 — 먼저 만듭니다 · 처음 한 번 몇 분)'}`);
  console.log('   [1] main 최신 (origin/main 을 받아서 · 기본)');
  console.log(`   [2] 지금 플레이 트리 그대로${tree ? ` (${out(`git -C "${playDir()}" log -1 --format="%h %cd" --date=format:%m-%d_%H:%M`).trim()})` : ''}`);
  console.log('   [3] 태그·커밋 직접 입력 (되돌리기)');
  let code;
  for (;;) {
    code = parseCodeChoice(await rl.question('  고르기 [1]: '));
    if (code) break;
    console.log('  1 · 2 · 3 중 하나');
  }
  if (code.kind === 'ref' && !code.ref) {
    const tags = out('git tag -l "play/*" --sort=-creatordate').split(/\r?\n/).filter(Boolean).slice(0, 5);
    if (tags.length) console.log(`  최근 태그: ${tags.join(' · ')}`);
    code.ref = await ask('  태그 또는 커밋');
  }
  const arg = code.kind === 'latest' ? 'latest' : code.kind === 'keep' ? 'keep' : code.ref;
  run(`node scripts/play.mjs --code=${q(arg)}`);
}

async function pruneBackups() {
  const { pickPrune } = await import('./backup-prune.mjs');
  const dir = path.join(ROOT, 'backups');
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const gone = pickPrune(names, 5);
  if (!gone.length) return console.log('  지울 백업이 없습니다(덤프 5개 이하)');
  console.log(`  지울 것 ${gone.length}개: ${gone.join(' · ')}`);
  if (!(await yes('지울까요?'))) return console.log('  그만둠');
  run('node scripts/backup.mjs --prune-only --keep 5');
}

const MENU = [
  ['1', '서버 켜기 — 어느 코드로? → 플레이 트리 → DB → 빌드 → 서버 창 → 터널 창 → 브라우저', playOn],
  ['2', '서버 켜기 — 빌드 건너뜀 (플레이 트리 그대로)', () => run('node scripts/play.mjs --no-build --code=keep')],
  ['3', '서버 · 터널 끄기 (DB 는 둠 · 포트가 빌 때까지 기다림)', () => run('node scripts/play.mjs --stop')],
  ['4', '지금 상태 (Docker · DB · 서버 · 터널 · 진행 중인 판 · 제보 · 로그 꼬리)', status],
  ['5', '계정 목록 (잔액 · 가입 · 마지막 판)', listAccounts],
  ['6', '포인트 주기', grantPoints],
  ['7', '비밀번호 초기화 (0000 + 다음 로그인 때 바꾸게)', resetPassword],
  ['8', '제보 보기 — 처리 안 된 것', () => reports(false)],
  ['9', '문제 평가(👍/👎) 보고', () => run('npm run feedback:report -- --no-bots')],
  ['10', '제보 처리 표시', handleReports],
  ['11', '문제 평가 채택 (+5P)', adoptFeedback],
  ['12', 'DB 백업', () => run('npm run db:backup')],
  ['13', '제보 보기 — 전부(처리된 것 포함)', () => reports(true)],
  ['14', '로그 열기 (서버 · 터널 — 메모장)', openLogs],
  // ★ R074 (§F ①) — 백업은 만들 때마다 최신 5개만 남긴다 · 이 줄은 덤프 없이 정리만(지울 목록을 보여 주고 y)
  // ★ R078 — 15~17 은 개발 서버 · 18 플레이 트리(브리핑 번호) → 백업 정리는 15 에서 19 로 옮겼다
  ['18', '플레이 트리 만들기 / 상태 (HEAD · 태그 · lock 해시 · 디스크)', () => run('node scripts/play.mjs --tree')],
  ['19', '오래된 백업 정리 (최신 5개만 남김 · zip 은 그대로)', pruneBackups],
  ['0', '끝'],
];

async function main() {
  console.log('\n★ quiz-web 운영자 메뉴  (DB 를 바꾸는 일은 항상 확인 → 백업 → 실행)');
  for (;;) {
    console.log('');
    for (const [k, label] of MENU) console.log(`  ${k.padStart(2)}  ${label}`);
    const pick = (await rl.question('\n번호: ')).trim();
    const item = MENU.find(([k]) => k === pick);
    if (!item) { console.log('  없는 번호'); continue; }
    if (item[0] === '0') break;
    try { await item[2](); } catch (e) { console.log(`\n  ✗ ${e.message}`); }
  }
}

main().finally(async () => { rl.close(); if (client) await client.end().catch(() => {}); });
