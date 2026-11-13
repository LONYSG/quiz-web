#!/usr/bin/env node
// =============================================================================
// ★★ R100 (D2) — 메모리 점검 · 정리 (ops 메뉴 20)
//
//   찬종 2026-11-13: "세션들 실행할 때마다 메모리가 점점 줄고 회수가 안 돼서 결국 재부팅한다"
//
//   node scripts/mem-check.mjs            보기만 — 전체 · 남은 메모리 · 이름별 상위 10 · 우리 것으로 보이는 남은 프로세스
//   node scripts/mem-check.mjs --kill     위 목록 중 "끝낼 것"(고아 · 6시간 넘은 검사용 chrome)만 끝낸다(ops 가 y 를 받은 뒤 부른다)
//
//   ★ 절대 건드리지 않음: tmp/ops/play.json 의 pid(실 서버)와 그 자식 · 3000/3001 포트를 잡은 서버와 그 창 · 이 메뉴 자신
//     · Docker / WSL / DB · claude · codex · Code · 표시 없는 일반 chrome(분류가 아예 목록에 올리지 않는다)
// =============================================================================

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devOverrides } from './dev-env.mjs';
import { portPids, windowPids } from './ops-lib.mjs';
import { readPlayJson } from './play-tree.mjs';
import { classifyProcs, killTree, listProcesses, pidAlive, sweepTemp, topByName } from './proc-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 없어도 됨 */ }
const PORT = process.env.PORT ?? '3000';
const DEV_PORT = devOverrides().PORT;
const KILL = process.argv.includes('--kill');

const gb = (mb) => (mb / 1024).toFixed(1);
const t = (ms) => (ms ? new Date(ms).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');

const total = os.totalmem() / 1048576;
const free = os.freemem() / 1048576;
console.log(`\n■ 메모리 — 전체 ${gb(total)}GB · 남음 ${gb(free)}GB (${Math.round((free / total) * 100)}%)`);

const procs = listProcesses();
console.log('\n  이름별 합계 상위 10 (개수 · GB)');
for (const r of topByName(procs, 10)) console.log(`   ${r.name.padEnd(28)} ${String(r.count).padStart(4)}개  ${gb(r.mb).padStart(5)}GB`);

const play = readPlayJson();
const devUp = portPids(DEV_PORT).map(Number);
const protect = [
  play?.pid,
  ...portPids(PORT).map(Number),
  ...devUp,
  ...windowPids('server').map(Number),
  ...windowPids('tunnel').map(Number),
  ...windowPids('dev').map(Number),
  process.pid,
].filter(Boolean);
const { items } = classifyProcs(procs, { protect });

console.log(`\n  우리 것으로 보이는 프로세스 ${items.length}개 (검사용 chrome · 이 저장소의 bot · ui-check · vitest · tsx · vite)`);
if (!items.length) console.log('   (없음)');
for (const it of items) {
  const short = it.cmd.replace(/\s+/g, ' ').slice(0, 90);
  console.log(
    `   ${it.kill ? '✗' : '·'} ${it.kind.padEnd(6)} PID ${String(it.pid).padEnd(6)} ${String(it.treeMb).padStart(5)}MB(${it.count}개) 시작 ${t(it.startMs)} 부모 ${it.parentAlive ? '살아 있음' : '없음'}${it.why ? ` — ${it.why}` : ''}`,
  );
  console.log(`       ${short}`);
}
if (devUp.length) console.log(`\n  개발 서버(${DEV_PORT}) 떠 있음 — 끄려면 메뉴 16 (이 메뉴는 건드리지 않는다)`);
if (play?.pid && pidAlive(play.pid)) console.log(`  실 서버(play.json pid ${play.pid}) 떠 있음 — 건드리지 않는다`);

const targets = items.filter((it) => it.kill);
console.log(`\n  끝낼 것(고아 · 6시간 넘은 검사용 chrome) ${targets.length}개 · 합계 ${targets.reduce((n, x) => n + x.treeMb, 0)}MB`);

if (KILL) {
  let got = 0;
  for (const it of targets) {
    killTree(it.pid);
    const ok = !pidAlive(it.pid);
    if (ok) got += it.treeMb;
    console.log(`   ${ok ? '✓ 끝냄' : '✗ 못 끝냄'} ${it.kind} PID ${it.pid} · ${it.treeMb}MB — ${it.why}`);
  }
  const sw = sweepTemp({ procs: listProcesses() });
  console.log(`\n  되찾은 메모리 ≈ ${got}MB · 지금 남음 ${gb(os.freemem() / 1048576)}GB`);
  console.log(`  임시 폴더(quizui- · r098- · r068av-) 지움 ${sw.removed}개 · ${sw.mb}MB${sw.failed ? ` · 잠겨서 못 지움 ${sw.failed}` : ''}`);
}
