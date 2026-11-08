// =============================================================================
// ★ 플레이 트리 (R078 · D-332 · D-331) — 플레이 서버(3000 · quizweb · 터널)는 별도 git worktree 에서 뜬다
//
//   왜 — 이 트리의 `npm run build` 가 플레이 중인 3000 의 client/dist 를 즉시 바꿨다(R073 실측 — 서버는 옛 코드 · 화면만 새 것).
//   그래서 플레이는 `C:\work\quiz-web-play`(QUIZ_PLAY_DIR) 에서 **로컬 태그 play/YYYYMMDD-HHmm** 로 고정한 커밋으로 뜨고,
//   이 트리(개발)는 3001 · quizweb_dev 를 쓴다. 이 트리의 빌드 · 검사는 플레이 트리의 dist 에 닿지 않는다.
//
//   tmp/ops/play.json (이 트리) — play.mjs 가 켤 때 쓴다: { dir, head, tag, port, pid, startedAt, lockHash, here }
//     test-db.mjs liveServerUp() 이 본다 — 3000 이 살아 있어도 **그 서버가 이 트리에서 뜬 게 아니면** 빌드 허용.
//
//   ★ 플레이 트리는 읽기 전용 취급 — 커밋 · 수정하지 않는다(checkout --detach 만). 태그는 push 하지 않는다.
//   ★ 이 파일의 순수 함수는 scripts/play-tree.test.mjs 가 본다.
// =============================================================================

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LOG_DIR, ROOT, stamp } from './ops-lib.mjs';

export const PLAY_DIR_DEFAULT = path.join(path.dirname(ROOT), 'quiz-web-play');
export const PLAY_JSON = path.join(LOG_DIR, 'play.json');
export const TAG_PREFIX = 'play/';

/** 플레이 트리 경로 — env QUIZ_PLAY_DIR 로 바꿀 수 있다(기본 이 트리 옆 quiz-web-play) */
export const playDir = (env = process.env) => path.resolve(env.QUIZ_PLAY_DIR || PLAY_DIR_DEFAULT);

/** Windows 경로 비교용 — 대소문자 · 구분자 · 끝 슬래시 무시 */
export const samePath = (a, b) => {
  const n = (p) => path.resolve(String(p)).replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
  return !!a && !!b && n(a) === n(b);
};

/** play/20261108-1430 · 이미 있으면 -2 · -3 … */
export function tagName(d = new Date(), existing = []) {
  const base = `${TAG_PREFIX}${stamp(d)}`;
  const have = new Set(existing);
  if (!have.has(base)) return base;
  for (let i = 2; ; i++) if (!have.has(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * 메뉴 1 의 "어느 코드로 켤까요?" 답 → { kind: 'latest' | 'keep' | 'ref', ref? } · 알 수 없으면 null
 *   '' · '1' → latest(origin/main 최신 · 기본) · '2' → keep(지금 플레이 트리 그대로) · '3' → ref(ref 는 따로 묻는다 — 비어 있음)
 *   그 밖의 글(태그 · 커밋 해시)을 바로 적으면 ref 로 받는다.
 */
export function parseCodeChoice(input) {
  const v = String(input ?? '').trim();
  if (v === '' || v === '1') return { kind: 'latest' };
  if (v === '2') return { kind: 'keep' };
  if (v === '3') return { kind: 'ref', ref: '' };
  if (/^[0-9a-f]{7,40}$/i.test(v) || /^[A-Za-z0-9._/-]+$/.test(v)) return { kind: 'ref', ref: v };
  return null;
}

/** play.mjs --code 인자(latest · keep · <ref>) → 같은 꼴 */
export function codeFromArg(arg) {
  if (!arg || arg === 'latest') return { kind: 'latest' };
  if (arg === 'keep') return { kind: 'keep' };
  return { kind: 'ref', ref: arg };
}

/** package-lock.json 의 해시(앞 12자) — 없으면 '' */
export function lockHashOf(dir) {
  const f = path.join(dir, 'package-lock.json');
  if (!existsSync(f)) return '';
  return createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12);
}

/** npm ci 를 다시 해야 하나 — node_modules 가 없거나 · 지난번 해시를 모르거나 · lock 해시가 바뀌었을 때 */
export function needsCi({ hasNodeModules, prevLockHash, lockHash }) {
  if (!hasNodeModules) return true;
  if (!prevLockHash) return true;
  return prevLockHash !== lockHash;
}

export function readPlayJson(file = PLAY_JSON) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function writePlayJson(data, file = PLAY_JSON) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/**
 * ★ 빌드 빗장 판단(순수) — 3000 에 살아 있는 서버(health)가 있을 때, 이 트리에서 빌드해도 되나.
 *   true(허용) = play.json 이 있고 · dir 이 이 트리(root)가 아니고 · (pid 가 둘 다 있으면) health.pid 와 같다.
 *   false(거부) = 파일 없음 · dir == root(--here · 옛 방식) · pid 가 다름(play.json 이 다른 서버 이야기 — 과도기 안전).
 */
export function buildAllowedWithLive({ health, playJson, root = ROOT }) {
  if (!health) return true;
  if (health.testServer === true) return true;
  if (!playJson?.dir) return false;
  if (samePath(playJson.dir, root)) return false;
  if (playJson.pid && health.pid && String(playJson.pid) !== String(health.pid)) return false;
  return true;
}

/** 경로에 공백 · 따옴표가 있으면 창 명령줄(cmd /k "…")이 깨진다 — 미리 막는다 */
export function assertPlainPath(p, label) {
  if (/[\s"&^%]/.test(p)) throw new Error(`${label} 경로에 공백·특수문자가 있다(${p}) — QUIZ_PLAY_DIR 를 공백 없는 경로로`);
  return p;
}
