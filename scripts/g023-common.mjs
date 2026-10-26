// =============================================================================
// G023 — 반영 스크립트 공용(g023-plan · g023-apply-*.mjs 가 쓴다)
//   ★ 판 열림 검사(games.ended_at IS NULL = 0 이어야 쓴다 — 찬종이 플레이 중일 수 있다) · 세 rerate · 고정 사본 읽기 · 되돌리기 파일
//   ★ 쓰기 스크립트 꼴: 기본 --dry-run(확인만) · --apply(쓰기 — 되돌리기 파일을 먼저 쓰고 한 트랜잭션) · --undo(되돌리기 파일의 옛 값으로)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AUDIT = path.join(ROOT, 'data/pipeline/audit');
process.loadEnvFile?.(path.join(ROOT, '.env'));

export const MODE = process.argv.includes('--undo') ? 'undo' : process.argv.includes('--apply') ? 'apply' : 'dry-run';
export const readJson = (f) => JSON.parse(readFileSync(path.join(AUDIT, f), 'utf8'));
export const writeJson = (f, o) => writeFileSync(path.join(AUDIT, f), JSON.stringify(o, null, 1) + '\n');
export const exists = (f) => existsSync(path.join(AUDIT, f));
export const len = (s) => [...(s ?? '')].length;

export async function connect() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

/** ★ 쓰기 직전마다 — 열린 판이 있으면 쓰지 않는다(종료 코드 3 · 부른 쪽이 10분 뒤 다시) */
export async function guardNoOpenGames(c, tag) {
  const { rows } = await c.query('select count(*)::int n from games where ended_at is null');
  const n = rows[0].n;
  const at = new Date().toISOString();
  console.log(`[${tag}] 열린 판 ${n} (${at})`);
  if (n !== 0) { console.error(`[${tag}] ★ 열린 판 ${n} — 쓰지 않는다(10분 뒤 다시)`); await c.end(); process.exit(3); }
  return at;
}

export async function activeCount(c) {
  const { rows } = await c.query('select count(*)::int n from questions where is_active');
  return rows[0].n;
}

/** 세 판정 파일 + 고정 사본(판정 때 본 질문·정답·변형·힌트) */
export function loadSources() {
  const S = {
    V027: readJson('v027-rerate.json'),
    V028: readJson('v028-rerate.json'),
    G022: readJson('g022-rerate.json'),
  };
  const toMap = (j) => { const it = j.items; return Array.isArray(it) ? Object.fromEntries(it.map((x) => [String(x.id), x])) : it; };
  const T = {
    V027: toMap(readJson('v027-targets.json')),
    V028: toMap(readJson('v028-targets.json')),
    G022: toMap(readJson('g022-raw/targets.json')),
  };
  return { S, T };
}

export function loadPlan() { return readJson('g023-plan.json'); }

export function finishUndoGuard(file) {
  if (!exists(file)) { console.error(`★ 되돌리기 파일 ${file} 없음`); process.exit(1); }
  return readJson(file);
}
