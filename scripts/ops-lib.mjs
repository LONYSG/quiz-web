// =============================================================================
// ops 공용 조각 — play.mjs · ops-run.mjs · ops.mjs 가 같이 쓴다 (R070 · D-312)
//
//   로그 위치 · 시각 찍기 · 14일 청소 · 로그 꼬리 · 포트/cloudflared PID 찾기.
//   ★ cloudflared 는 **이 포트를 가리키는 것만** 찾는다 — 검사(PORT=3100)가 실 터널(3000)을 죽이지 않게.
// =============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOG_DIR = path.join(ROOT, 'tmp', 'ops');
export const KEEP_DAYS = 14;

const p2 = (n) => String(n).padStart(2, '0');
/** 20261030-1405 — 로그 파일 이름용 */
export const stamp = (d = new Date()) =>
  `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
/** 14:05:09 — 단계 줄 머리용 */
export const hms = (d = new Date()) => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
export const hm = (d = new Date()) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** 최신 로그(덮어쓰기)와 이번 기동 로그 — kind = server | tunnel */
export function logPaths(kind, d = new Date()) {
  return { latest: path.join(LOG_DIR, `${kind}.log`), dated: path.join(LOG_DIR, `${kind}-${stamp(d)}.log`) };
}

/** <kind>-YYYYMMDD-HHmm.log 중 days 일 지난 것을 지운다(최신 server.log · tunnel.log 는 안 건드림) → 지운 이름 */
export function pruneLogs(dir = LOG_DIR, days = KEEP_DAYS, now = Date.now()) {
  if (!existsSync(dir)) return [];
  const gone = [];
  for (const f of readdirSync(dir)) {
    if (!/^[a-z]+-\d{8}-\d{4}\.log$/.test(f)) continue;
    const full = path.join(dir, f);
    try {
      if (now - statSync(full).mtimeMs > days * 86_400_000) { unlinkSync(full); gone.push(f); }
    } catch { /* 열려 있는 파일 등 — 다음에 */ }
  }
  return gone;
}

/** 파일 마지막 n 줄(없으면 []) */
export function tail(file, n) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-n);
}

export const out = (cmd) => spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'pipe', encoding: 'utf8' }).stdout ?? '';

/** 이 포트에서 LISTENING 중인 PID */
export function portPids(port) {
  return [
    ...new Set(
      out('netstat -ano -p tcp')
        .split(/\r?\n/)
        .filter((l) => /LISTENING/.test(l))
        .map((l) => l.trim().split(/\s+/))
        .filter((c) => c[1]?.endsWith(`:${port}`))
        .map((c) => c.at(-1))
        .filter((p) => p && p !== '0'),
    ),
  ];
}

/** 이름이 image 이고 명령줄이 re 에 맞는 프로세스 PID */
function procPids(image, re) {
  const ps =
    `Get-CimInstance Win32_Process -Filter "Name='${image}'" | ` +
    `ForEach-Object { [string]$_.ProcessId + ' ' + $_.CommandLine }`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe', encoding: 'utf8' });
  return (r.stdout ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => re.test(l))
    .map((l) => l.split(' ')[0]);
}

/** localhost:<port> 를 가리키는 cloudflared PID (명령줄로 가린다) */
export const cloudflaredPids = (port) => procPids('cloudflared.exe', new RegExp(`localhost:${port}(\\D|$)`));

/**
 * play.mjs 가 띄운 창(cmd /k … ops-run.mjs <kind> …)의 cmd.exe PID.
 * ★ 창 제목(taskkill /FI WINDOWTITLE)으로 닫지 않는다 — Windows Terminal 에서는 제목이 WindowsTerminal.exe 에 붙어
 *   맞지 않거나(창이 쌓임), 맞으면 다른 탭까지 통째로 닫힌다(R070 검사에서 확인).
 */
export const windowPids = (kind) => procPids('cmd.exe', new RegExp(`ops-run\\.mjs ${kind} `));

/** DATABASE_URL → DB 이름(비밀번호는 절대 안 찍는다) */
export function dbName(url) {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || '?'; } catch { return '?'; }
}

export const gitHead = () => out('git rev-parse --short HEAD').trim() || '?';

/** 터널 로그에서 마지막 trycloudflare 주소 */
export function tunnelUrl(file = logPaths('tunnel').latest) {
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
  return m ? m.at(-1) : null;
}
