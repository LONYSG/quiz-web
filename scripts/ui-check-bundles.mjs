#!/usr/bin/env node
// =============================================================================
// ★★★ ui-check 경량 묶음 실행기 (R053 ⓪ · D-240)
//
//   node scripts/ui-check-bundles.mjs                 ← 묶음 전부(끝 점검 ui-check 단계 11개를 작은 묶음으로)
//   node scripts/ui-check-bundles.mjs main-layout shop mg-r052-lab …   ← 고른 묶음만
//   node scripts/ui-check-bundles.mjs --list          ← 묶음 목록
//   [--retry N --retry-gap-min M]  못 돌린(메모리) 묶음을 M 분 간격으로 N 번 더
//   [--out <파일>]                 묶음 표(JSON)를 남긴다
//
// ★ 왜: 세 세션이 같이 돌면 남는 메모리가 1~3GB 다 — R050~R052 내내 ui-check(3GB 기준)를 못 돌렸다.
//   묶음 하나 = 프로세스 하나 = Chrome 하나 · 끝나면 Chrome 이 닫힌다(메모리를 돌려준다) · 묶음 사이 남는 메모리 1.5GB 확인.
// ★ 빌드는 한 번만: dist 가 소스보다 새것이면 건너뛴다(UICHECK_NO_BUILD=1 이면 아예 안 한다).
// ★ 메모리: 묶음 시작 전 os.freemem() ≥ 1.5GB 를 60초 × 10 기다린다 · 그래도 모자라면 그 묶음 "못 돌림" 으로 적고 다음 묶음(멈춰 서지 않는다).
// ★ 묶음마다 걸린 시간 · 시작/끝 남는 메모리 · [결과] 건수를 표로.
// =============================================================================
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useTestDb } from './test-db.mjs';

// ★★★ R060 (D-253) — 묶음마다 띄우는 ui-check 도 같은 검사 DB(quizweb_test)로
await useTestDb('bundles');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const optv = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const MIN_FREE = Number(process.env.UICHECK_MIN_FREE_MB ?? 1536) * 1024 * 1024;
const WAIT_MS = Number(process.env.UICHECK_MEM_WAIT_MS ?? 60_000);
const WAIT_TIMES = Number(process.env.UICHECK_MEM_WAIT_TIMES ?? 10);
const TIMEOUT_MS = Number(process.env.UICHECK_BUNDLE_TIMEOUT_MS ?? 30 * 60_000);

const MG = (o) => ({ MG_SKIP_R050: '1', MG_SKIP_R051: '1', MG_SKIP_R052: '1', MG_SKIP_R053: '1', MG_SKIP_R054: '1', ...o });
/** ★ 묶음 — 단계(끝 점검의 11 단계) → 묶음들. 미니게임은 라운드 · 게임별로 쪼갠다 */
export const BUNDLES = [
  { id: 'main-layout', stage: 'ui-check', args: ['--layout'] },
  { id: 'main-behavior', stage: 'ui-check', args: ['--behavior'] },
  { id: 'sound', stage: 'sound', args: ['--sound'] },
  { id: 'social', stage: 'social', args: ['--social'], env: { UICHECK_NO_CHAIN: '1' } },
  { id: 'profile', stage: 'profile', args: ['--profile'] },
  { id: 'emoji', stage: 'emoji', args: ['--emoji'] },
  { id: 'leave', stage: 'leave', args: ['--leave'] },
  { id: 'spam', stage: 'spam', args: ['--spam'] },
  { id: 'shop', stage: 'shop', args: ['--shop'] },
  { id: 'copy', stage: 'copy', args: ['--copy'] },
  { id: 'devices', stage: 'devices', args: ['--devices'] },
  { id: 'mg-r050-lab', stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R050: '', MG_SKIP_LIVE: '1' }) },
  { id: 'mg-r050-live', stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R050: '', MG_SKIP_LAB: '1' }) },
  { id: 'mg-r051-lab', stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R051: '', MG_SKIP_LIVE: '1', SHOT_DIR: 'r051' }) },
  ...['reaction', 'typing', 'circle', 'angle'].map((g) => ({ id: `mg-r051-${g}`, stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R051: '', MG_SKIP_LAB: '1', MG_GAMES: g, SHOT_DIR: 'r051' }) })),
  { id: 'mg-r052-lab', stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R052: '', MG_SKIP_LIVE: '1', SHOT_DIR: 'r052' }) },
  ...['price', 'worldprice', 'photo', 'estimate', 'which'].map((g) => ({ id: `mg-r052-${g}`, stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R052: '', MG_SKIP_LAB: '1', MG_QUIZ: g, SHOT_DIR: 'r052' }) })),
  { id: 'mg-r053-lab', stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R053: '', MG_SKIP_LIVE: '1', SHOT_DIR: 'r053' }) },
  ...['minority', 'oddone', 'gauge'].map((g) => ({ id: `mg-r053-${g}`, stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R053: '', MG_SKIP_LAB: '1', MG_R053: g, SHOT_DIR: 'r053' }) })),
  // ★ R054
  { id: 'mg-r054-lab', stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R054: '', MG_SKIP_LIVE: '1', SHOT_DIR: 'r054' }) },
  ...['balloon', 'tap'].map((g) => ({ id: `mg-r054-${g}`, stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_R054: '', MG_SKIP_LAB: '1', MG_R054: g, SHOT_DIR: 'r054' }) })),
  { id: 'r054-stats', stage: 'minigame', args: ['--minigame'], env: MG({ MG_SKIP_LAB: '1', MG_SKIP_LIVE: '1', UICHECK_STATS: '1', SHOT_DIR: 'r054' }) },
  // ★ R056 — 문제 평가(공개 · 결과 · 로비) · 골라 하기 가로 스크롤 · "없어요" · 프사 확대 · 업적 창 (r056-before = 옛 빌드로 "전" 그림)
  { id: 'r056', stage: 'minigame', args: ['--minigame'], env: MG({ UICHECK_R056: '1', SHOT_DIR: 'r056', RESOLVED_WAIT_MS: '8000' }) },
  { id: 'r056-before', stage: 'minigame', args: ['--minigame'], env: MG({ UICHECK_R056: '1', R056_BEFORE: '1', SHOT_DIR: 'r056' }) },
  // ★ R057 — 미니게임만 모드(설정 · 2개 · 결과) · 이모티콘 나열(토글 · Shift+클릭 · 길게 누르기 · 인라인 · 미리 보기)
  { id: 'r057', stage: 'minigame', args: ['--minigame'], env: MG({ UICHECK_R057: '1', SHOT_DIR: 'r057', MINIGAME_PHASE_SCALE: '0.5' }) },
  // ★ R060 — 미니게임만 사이 문구 · 긴 단위(광년) · 이모티콘 보내면 창 닫힘 · 공동 1위 (실험실 장면 + 방 하나)
  { id: 'r060', stage: 'minigame', args: ['--minigame'], env: MG({ UICHECK_R060: '1', SHOT_DIR: 'r060', MG_SKIP_LAB: '1', MG_SKIP_LIVE: '1' }) },
];

if (flag('--list')) {
  for (const b of BUNDLES) console.log(`${b.id.padEnd(18)} ${b.stage.padEnd(9)} ${b.args.join(' ')} ${JSON.stringify(b.env ?? {})}`);
  process.exit(0);
}
const pick = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a) && a !== optv('--out', '\0') && a !== optv('--shot-dir', '\0'));
const chosen = pick.length ? BUNDLES.filter((b) => pick.includes(b.id) || pick.includes(b.stage)) : BUNDLES;
const RETRY = Number(optv('--retry', 0));
const RETRY_GAP = Number(optv('--retry-gap-min', 30)) * 60_000;
const OUT = optv('--out', null);
// ★ R055 — 옛 라운드 그림을 덮지 않게 그림 폴더를 강제(예: --shot-dir verify) · 없으면 묶음 값 → verify
const SHOT_FORCE = optv('--shot-dir', null);

const mb = (b) => Math.round(b / 1048576);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = () => new Date().toTimeString().slice(0, 5);

/** 남는 메모리 — Windows 는 os.freemem() 이 "사용 가능"(대기 목록 포함)이 아니라 빈 메모리만 줄 수 있어 CIM 값을 쓴다 */
function freeBytes() {
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'], { encoding: 'utf8' });
    const kb = Number(String(r.stdout).trim());
    if (Number.isFinite(kb) && kb > 0) return kb * 1024;
  }
  return os.freemem();
}

async function memGate(id, times = WAIT_TIMES) {
  for (let i = 0; i <= times; i += 1) {
    const f = freeBytes();
    if (f >= MIN_FREE) return { ok: true, free: f, waited: i };
    if (i === times) return { ok: false, free: f, waited: i };
    console.log(`[bundles] ${hhmm()} ${id} — 남는 메모리 ${mb(f)}MB < ${mb(MIN_FREE)}MB · 기다림 ${i + 1}/${times}`);
    await sleep(WAIT_MS);
  }
  return { ok: false, free: freeBytes(), waited: WAIT_TIMES };
}

/** dist 가 소스보다 오래됐으면 한 번 빌드 */
function newest(dir) {
  let t = 0;
  if (!existsSync(dir)) return 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}
function buildIfNeeded() {
  if (process.env.UICHECK_NO_BUILD === '1') return 'skip(UICHECK_NO_BUILD)';
  const src = Math.max(newest(path.join(ROOT, 'shared/src')), newest(path.join(ROOT, 'server/src')), newest(path.join(ROOT, 'client/src')));
  const distT = (f) => (existsSync(f) ? statSync(f).mtimeMs : 0);
  const dist = Math.min(distT(path.join(ROOT, 'server/dist/index.js')), distT(path.join(ROOT, 'client/dist/index.html')));
  if (dist > src) return 'skip(dist 가 새것)';
  console.log('[bundles] 소스가 dist 보다 새것 — 한 번 빌드');
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error('빌드 실패');
  return 'built';
}

function runOne(b) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...(b.env ?? {}) };
    for (const [k, v] of Object.entries(env)) if (v === '') delete env[k];
    if (SHOT_FORCE) env.SHOT_DIR = SHOT_FORCE;
    env.SHOT_DIR ??= 'verify';
    const proc = spawn(process.execPath, [path.join(ROOT, 'scripts/ui-check.mjs'), ...b.args], { cwd: ROOT, env });
    let out = '';
    proc.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    proc.stderr.on('data', (d) => {
      out += d;
      process.stderr.write(d);
    });
    const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
    proc.on('close', (code) => {
      clearTimeout(timer);
      const m = [...out.matchAll(/\[결과\] (\d+)\/(\d+)/g)].pop();
      const fails = [...out.matchAll(/^\s*FAIL\s+(.+)$/gm)].map((x) => x[1].trim()).slice(0, 8);
      // ★ 환경 탓(결함 아님 — 찬종 2026-10-17): Chrome 을 밖에서 끔(browser disconnected · Target closed) · WSL 재시작으로 DB 가 잠깐 내려감(연결 오류)
      const env = code !== 0 && /browser disconnected|Target closed|WebSocket is not open|socket hang up|ECONNREFUSED|ECONNRESET|Connection terminated|terminating connection|57P01|the database system is (starting|shutting)/i.test(out);
      resolve({ code, ok: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null, fails, env });
    });
  });
}

const rows = [];
console.log(`[bundles] ${hhmm()} 시작 — 묶음 ${chosen.length} · 기준 ${mb(MIN_FREE)}MB · 빌드 ${buildIfNeeded()}`);
async function pass(list) {
  const skipped = [];
  // ★ 한 묶음이 10분을 기다리고도 못 돌았으면, 같은 차례의 나머지 묶음은 한 번만 재고 건너뛴다(다음 재시도에서) — 차례 하나가 몇 시간씩 늘지 않게
  let starved = false;
  for (const b of list) {
    const g = await memGate(b.id, starved ? 0 : WAIT_TIMES);
    if (g.ok) starved = false;
    else starved = true;
    if (!g.ok) {
      console.log(`[bundles] ${hhmm()} ★ 못 돌림 — 메모리: ${b.id} (남는 ${mb(g.free)}MB · 대기 ${g.waited}분)`);
      rows.push({ id: b.id, stage: b.stage, status: 'SKIP-MEM', startFreeMb: mb(g.free), waitedMin: g.waited, at: hhmm() });
      skipped.push(b);
      continue;
    }
    const t0 = Date.now();
    console.log(`[bundles] ${hhmm()} ▶ ${b.id} (남는 ${mb(g.free)}MB)`);
    let r = await runOne(b);
    if (r.env) {
      console.log(`[bundles] ${hhmm()} ${b.id} — 환경 탓 실패(Chrome 끊김 · DB 연결) — 60초 뒤 이 묶음만 다시`);
      await sleep(60_000);
      r = await runOne(b);
    }
    const endFree = freeBytes();
    const row = { id: b.id, stage: b.stage, status: r.code === 0 ? 'PASS' : r.env ? 'FAIL-ENV' : 'FAIL', ok: r.ok, total: r.total, sec: Math.round((Date.now() - t0) / 1000), startFreeMb: mb(g.free), endFreeMb: mb(endFree), waitedMin: g.waited, fails: r.fails, at: hhmm() };
    rows.push(row);
    console.log(`[bundles] ${hhmm()} ■ ${b.id} ${row.status} ${r.ok ?? '?'}/${r.total ?? '?'} · ${row.sec}s · 남는 ${row.startFreeMb}→${row.endFreeMb}MB`);
  }
  return skipped;
}
let left = await pass(chosen);
for (let i = 0; i < RETRY && left.length; i += 1) {
  console.log(`[bundles] ${hhmm()} 못 돌린 ${left.length}묶음 — ${RETRY_GAP / 60000}분 뒤 다시(${i + 1}/${RETRY})`);
  await sleep(RETRY_GAP);
  left = await pass(left);
}

console.log('\n[bundles] 묶음 표');
console.log('묶음               단계      결과      건수      초    남는MB(시작→끝)  대기분');
for (const r of rows) console.log(`${r.id.padEnd(18)} ${r.stage.padEnd(9)} ${r.status.padEnd(9)} ${r.ok !== undefined && r.ok !== null ? `${r.ok}/${r.total}`.padEnd(9) : '-'.padEnd(9)} ${String(r.sec ?? '-').padEnd(5)} ${`${r.startFreeMb}→${r.endFreeMb ?? '-'}`.padEnd(16)} ${r.waitedMin}`);
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 2));
const bad = rows.filter((r) => r.status === 'FAIL');
process.exit(bad.length ? 1 : 0);
