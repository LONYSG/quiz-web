// =============================================================================
// ★★ R100 (D · D2) — 검사 스크립트가 남기는 것 치우기 · 메모리 점검 공용 조각
//
//   찬종 2026-11-13: C 드라이브 360MB — ui-check 가 만든 Chrome 프로필(%TEMP%\quizui-*)을 지우지 않아 183개 · 9.1GB.
//   같은 날: "세션들 실행할 때마다 메모리가 점점 줄고 회수가 안 돼서 결국 재부팅한다".
//
//   ① guardExit — 띄운 chrome · 서버를 **어떻게 끝나든**(정상 · 실패 · 예외 · process.exit · Ctrl+C · 부모가 죽음) 끝내고
//      만든 임시 폴더를 지운다. Windows 는 부모가 죽어도 자식이 남으므로 taskkill /T 로 나무째 끝낸다.
//   ② sweepTemp — 시작할 때 앞선 실행이 남긴 임시 폴더를 쓸어 낸다(하루 넘은 것 · 또는 30분 넘었고 어떤 chrome 도 안 쓰는 프로필).
//   ③ listProcesses · classifyProcs — 메모리 점검 메뉴(scripts/mem-check.mjs)가 쓴다. 분류는 순수 함수(테스트 proc-lib.test.mjs).
// =============================================================================

import { execFile, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 검사가 os.tmpdir() 에 만드는 폴더 머리 — 프로필(chrome 이 씀)과 그냥 파일 폴더 */
export const PROFILE_PREFIXES = ['quizui-', 'r098-'];
export const TEMP_PREFIXES = [...PROFILE_PREFIXES, 'r068av-'];
export const DAY_MS = 86_400_000;
export const IDLE_MS = 30 * 60_000;

const isWin = process.platform === 'win32';

// ── ① 끝날 때 치우기 ─────────────────────────────────────────────────────────

/** pid 와 그 자식을 끝낸다(동기 — exit 처리 안에서도 돈다) · 이미 없으면 조용히 */
export function killTree(pid) {
  if (!pid) return;
  if (isWin) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else {
    try { process.kill(pid, 'SIGKILL'); } catch { /* 이미 없음 */ }
  }
}

/** 폴더 지우기 — chrome 이 막 꺼진 직후엔 잠겨 있을 수 있어 재시도 · 끝내 못 지우면 false(조용히) */
export function rmDirRetry(dir) {
  if (!dir || !existsSync(dir)) return true;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
    return !existsSync(dir);
  } catch {
    return false;
  }
}

let guards = null;
/**
 * 끝날 때 치울 것을 등록한다. pids() · dirs() 는 끝나는 순간에 불러 그때 값을 쓴다.
 * - process 'exit'(정상 · process.exit · 예외로 죽음) → 나무째 끝내고 폴더 지움
 * - SIGINT · SIGTERM · SIGBREAK · SIGHUP → exit(130) 으로 같은 길
 * - 부모 쪽 프로세스가 죽으면(예: Claude Code 가 메모리 부족으로 강제 종료) 10초 안에 스스로 exit(1)
 *   (PARENT_WATCH=0 이면 끔)
 */
export function guardExit({ label = 'cleanup', pids = () => [], dirs = () => [] } = {}) {
  if (!guards) {
    guards = [];
    const runAll = () => {
      for (const g of guards.splice(0)) {
        for (const pid of g.pids().filter(Boolean)) killTree(pid);
        const left = g.dirs().filter(Boolean).filter((d) => !rmDirRetry(d));
        if (left.length) console.log(`[${g.label}] 임시 폴더 ${left.length}개를 못 지웠다(잠김) — 다음 실행이 쓸어 낸다`);
      }
    };
    process.on('exit', runAll);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
      try { process.on(sig, () => { console.log(`\n[${label}] ${sig} — 띄운 것을 끄고 끝낸다`); process.exit(130); }); } catch { /* 이 OS 에 없는 신호 */ }
    }
    if (process.env.PARENT_WATCH !== '0') watchAncestors(label);
  }
  guards.push({ label, pids, dirs });
}

/** 시작 때 조상 PID 들을 알아 두고 10초마다 살아 있나 본다 — 하나라도 없어지면 exit(1) */
function watchAncestors(label) {
  const check = (chain) => {
    if (!chain.length) return;
    const t = setInterval(() => {
      for (const a of chain) {
        if (!pidAlive(a.pid)) {
          console.log(`\n[${label}] ★ 부모 쪽 프로세스(${a.name} ${a.pid})가 사라졌다 — 띄운 것을 끄고 끝낸다`);
          process.exit(1);
        }
      }
    }, 10_000);
    t.unref();
  };
  if (!isWin) return check([{ pid: process.ppid, name: 'parent' }]);
  listProcessesAsync()
    .then((procs) => check(ancestorsOf(process.pid, procs)))
    .catch(() => check([{ pid: process.ppid, name: 'parent' }]));
}

export function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** pid 의 조상(가까운 것부터) — 목록에서 끊기거나 시스템 셸(explorer 등)에 닿으면 멈춘다 · 부모가 자식보다 늦게 시작했으면(PID 재사용) 멈춤 */
export function ancestorsOf(pid, procs, max = 8) {
  const by = new Map(procs.map((p) => [p.pid, p]));
  const out = [];
  let cur = by.get(pid);
  while (cur && out.length < max) {
    const parent = by.get(cur.ppid);
    if (!parent || parent.pid === cur.pid) break;
    if (parent.startMs && cur.startMs && parent.startMs > cur.startMs) break;
    if (/^(explorer|services|wininit|svchost|System)(\.exe)?$/i.test(parent.name)) break;
    out.push(parent);
    cur = parent;
  }
  return out;
}

// ── ② 시작할 때 쓸어 내기 ────────────────────────────────────────────────────

/**
 * 지울 임시 폴더 이름 고르기(순수) — entries [{ name, ageMs }] · inUse = 지금 살아 있는 chrome 명령줄이 가리키는 폴더 이름
 *   · 머리가 TEMP_PREFIXES 인 것만
 *   · 하루 넘음 → 지움
 *   · 프로필(quizui- · r098-)이 30분 넘었고 어떤 chrome 도 안 씀 → 지움(끝난 실행의 것 — 지금 도는 검사의 것은 chrome 이 쓰고 있다)
 */
export function pickTempSweep(entries, inUse = new Set(), { dayMs = DAY_MS, idleMs = IDLE_MS } = {}) {
  return entries
    .filter(({ name, ageMs }) => {
      if (!TEMP_PREFIXES.some((p) => name.startsWith(p))) return false;
      if (inUse.has(name)) return false;
      if (ageMs > dayMs) return true;
      return PROFILE_PREFIXES.some((p) => name.startsWith(p)) && ageMs > idleMs;
    })
    .map((e) => e.name)
    .sort();
}

/** 살아 있는 chrome 명령줄의 --user-data-dir 폴더 이름들 */
export function profilesInUse(procs) {
  const s = new Set();
  for (const p of procs) {
    const m = /--user-data-dir=("?)([^"\s]+)\1/.exec(p.cmd ?? '');
    if (m) s.add(path.basename(m[2]));
  }
  return s;
}

/** os.tmpdir() 의 앞선 실행 잔여물을 지운다 → { removed, failed, mb } · 실패는 조용히(잠김) */
export function sweepTemp({ dir = os.tmpdir(), now = Date.now(), procs = null } = {}) {
  let names = [];
  try { names = readdirSync(dir).filter((n) => TEMP_PREFIXES.some((p) => n.startsWith(p))); } catch { return { removed: 0, failed: 0, mb: 0 }; }
  if (!names.length) return { removed: 0, failed: 0, mb: 0 };
  let list = procs;
  if (!list) {
    try { list = listProcesses(); } catch { list = null; }
  }
  // 프로세스 목록을 못 얻으면 30분 규칙은 쓰지 않는다(하루 규칙만)
  const inUse = list ? profilesInUse(list) : null;
  const entries = [];
  for (const name of names) {
    try {
      const st = statSync(path.join(dir, name));
      entries.push({ name, ageMs: now - Math.max(st.mtimeMs, st.birthtimeMs || 0) });
    } catch { /* 사라짐 */ }
  }
  const pick = inUse ? pickTempSweep(entries, inUse) : pickTempSweep(entries, new Set(), { idleMs: Infinity });
  let removed = 0;
  let failed = 0;
  let mb = 0;
  for (const name of pick) {
    const full = path.join(dir, name);
    const size = dirSizeMb(full);
    if (rmDirRetry(full)) { removed += 1; mb += size; } else failed += 1;
  }
  return { removed, failed, mb: Math.round(mb) };
}

function dirSizeMb(dir) {
  let total = 0;
  const walk = (d) => {
    let ents = [];
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else try { total += statSync(f).size; } catch { /* 잠김 */ }
    }
  };
  walk(dir);
  return total / 1048576;
}

// ── ③ 프로세스 목록 · 분류 ───────────────────────────────────────────────────

const PS_LIST =
  "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId; name=[string]$_.Name; cmd=[string]$_.CommandLine; start=$(if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { '' }); ws=[double]$_.WorkingSetSize } } | ConvertTo-Json -Compress";

function parseList(text) {
  const raw = JSON.parse(text || '[]');
  return (Array.isArray(raw) ? raw : [raw]).map((p) => ({
    pid: p.pid,
    ppid: p.ppid,
    name: p.name ?? '',
    cmd: p.cmd ?? '',
    startMs: p.start ? Date.parse(p.start) : 0,
    mb: Math.round((p.ws ?? 0) / 1048576),
  }));
}

/** 모든 프로세스 [{ pid, ppid, name, cmd, startMs, mb }] — Windows 만(PowerShell CIM · 1~3초) */
export function listProcesses() {
  if (!isWin) throw new Error('Windows 전용');
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS_LIST], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(`프로세스 목록 실패: ${(r.stderr || '').slice(0, 200)}`);
  return parseList(r.stdout);
}

export function listProcessesAsync() {
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS_LIST], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(parseList(stdout)); } catch (e) { reject(e); }
    });
  });
}

const CHROME_MARK = /quizui-|r068av-|r098-|--remote-debugging|--headless/;
const NODE_MARK = /scripts[\\/](bot|ui-check)\.mjs|vitest|[\\/]tsx[\\/]|\btsx\b|[\\/]vite[\\/]|\bvite\b/;
const NEVER = /^(claude|codex|code|docker|com\.docker\.|vmmem|wsl|wslhost|wslservice|postgres)/i;
const NEVER_CMD = /@anthropic-ai|claude-code|[\\/]codex|docker/i;

/**
 * 우리 것으로 보이는 프로세스 분류(순수).
 *   procs: listProcesses() 결과 · now: 지금(ms)
 *   protect: 절대 건드리지 않는 pid 들(실 서버 · dev 서버 · 이 메뉴 자신) — 그 조상 · 자손도 보호
 *   repo: 노드 명령줄에 이 이름이 있거나 상대 경로(scripts\…)면 우리 것
 * → { items: [{ pid, name, kind, cmd, startMs, mb, treeMb, count, parentAlive, ageMs, protected, kill, why }] }
 *   chrome 은 나무의 뿌리 하나로 묶어 보여 준다(렌더러 등 자식 수 · 합계 MB).
 *   kill = 보호 아님 && (부모가 죽음(고아) || 검사용 chrome 이 6시간 넘음)
 */
export function classifyProcs(procs, { now = Date.now(), protect = [], chromeMaxAgeMs = 6 * 3_600_000, repo = 'quiz-web' } = {}) {
  const by = new Map(procs.map((p) => [p.pid, p]));
  const kids = new Map();
  for (const p of procs) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    if (p.ppid !== p.pid) kids.get(p.ppid).push(p);
  }
  const descendants = (pid) => {
    const out = [];
    const stack = [...(kids.get(pid) ?? [])];
    while (stack.length) {
      const c = stack.pop();
      if (c.startMs && by.get(pid)?.startMs && c.startMs < by.get(pid).startMs) continue; // PID 재사용
      out.push(c);
      stack.push(...(kids.get(c.pid) ?? []));
    }
    return out;
  };
  const parentAlive = (p) => {
    const par = by.get(p.ppid);
    if (!par || par.pid === p.pid) return false;
    if (par.startMs && p.startMs && par.startMs > p.startMs) return false; // 부모 PID 를 다른 프로세스가 다시 씀 = 진짜 부모는 죽음
    return true;
  };

  const guarded = new Set();
  for (const pid of protect.filter(Boolean)) {
    if (!by.has(pid)) continue;
    guarded.add(pid);
    for (const d of descendants(pid)) guarded.add(d.pid);
    for (const a of ancestorsOf(pid, procs)) guarded.add(a.pid);
  }

  const isChrome = (p) => /^chrome(\.exe)?$/i.test(p.name);
  const marked = new Set(procs.filter((p) => isChrome(p) && CHROME_MARK.test(p.cmd)).map((p) => p.pid));
  // 표시 있는 chrome 의 자손 chrome 도 같은 나무
  for (const pid of [...marked]) for (const d of descendants(pid)) if (isChrome(d)) marked.add(d.pid);
  const repoRe = new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const isOurNode = (p) => /^node(\.exe)?$/i.test(p.name) && NODE_MARK.test(p.cmd) && (repoRe.test(p.cmd) || /(^|\s)"?scripts[\\/]/.test(p.cmd) || /node_modules[\\/]/.test(p.cmd));

  const items = [];
  for (const p of procs) {
    if (NEVER.test(p.name) || NEVER_CMD.test(p.cmd)) continue;
    let kind = null;
    if (marked.has(p.pid) && !marked.has(p.ppid)) kind = 'chrome';
    else if (isOurNode(p) && !(by.get(p.ppid) && isOurNode(by.get(p.ppid)))) kind = 'node';
    if (!kind) continue;
    const tree = [p, ...descendants(p.pid)];
    const alive = parentAlive(p);
    const ageMs = p.startMs ? now - p.startMs : 0;
    const prot = guarded.has(p.pid);
    let why = '';
    if (prot) why = '보호(실 서버 · dev 서버 · 이 메뉴)';
    else if (!alive) why = '고아(부모 없음)';
    else if (kind === 'chrome' && ageMs > chromeMaxAgeMs) why = `검사용 chrome ${Math.floor(ageMs / 3_600_000)}시간째`;
    items.push({
      pid: p.pid,
      name: p.name,
      kind,
      cmd: p.cmd,
      startMs: p.startMs,
      mb: p.mb,
      treeMb: tree.reduce((n, x) => n + (x.mb || 0), 0),
      count: tree.length,
      parentAlive: alive,
      ageMs,
      protected: prot,
      kill: !prot && why !== '',
      why,
    });
  }
  return { items: items.sort((a, b) => b.treeMb - a.treeMb) };
}

/** 이름별 합계 상위 n — [{ name, count, mb }] */
export function topByName(procs, n = 10) {
  const m = new Map();
  for (const p of procs) {
    const k = p.name.toLowerCase();
    const v = m.get(k) ?? { name: p.name, count: 0, mb: 0 };
    v.count += 1;
    v.mb += p.mb || 0;
    m.set(k, v);
  }
  return [...m.values()].sort((a, b) => b.mb - a.mb).slice(0, n);
}
