#!/usr/bin/env node
// =============================================================================
// ★★ 노래 평가 읽기 (R097 · D-354) — minigame_results.input.rate → 콘솔 + tmp/song-feedback.md
// ★★★ R099 (2026-11-13) — 노래 평가 입력을 뺐다(찬종 "평가는 나만 · 제보로") → 새 평가는 들어오지 않는다 · 지난 기록 읽기용.
//
//   npm run song:feedback [-- --since 7d | --since 2026-11-01] [--db dev|test] [--no-bots]
//   기본 = 실 quizweb · 읽기만(SELECT 만 — 쓰기 0).
//   ★ 평가 저장 = R096 (D-353): minigame_runs.minigame_key = 'song' 의 결과 행 input.rate = { vote: 1|0|-1, reasons[], at }
//     한 사람 한 곡 하나(나중 것이 이긴다). round 의 item_id = 노래 id(minigame_items.item_id).
//     방식 판(RoomMode 'song' · rounds.params.mode = 'song') · 미니게임 판(노래 미니게임) 둘 다 모은다 —
//     R097 때 평가 화면은 방식 판에만 있다(미니게임 판 줄은 0 이 정상).
//   곡별: 👍 · 😐 · 👎(사유별: 모르는 노래 · 너무 쉬움 · 표기 이상 · 미리듣기 이상) · 제목 · 가수 · 연도 · 분류 · 장르 · 👎 많은 순.
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const NO_BOTS = args.includes('--no-bots');
const SINCE_RAW = opt('--since', null);
const DB_OPT = opt('--db', 'live');

const DBS = { live: 'quizweb', dev: 'quizweb_dev', test: 'quizweb_test' };
if (!DBS[DB_OPT]) {
  console.error('--db 는 dev · test (빼면 실 quizweb)');
  process.exit(1);
}
let since = null;
if (SINCE_RAW) {
  const m = /^(\d+)d$/.exec(SINCE_RAW);
  if (m) since = new Date(Date.now() - Number(m[1]) * 86_400_000);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(SINCE_RAW)) since = new Date(`${SINCE_RAW}T00:00:00+09:00`);
  else {
    console.error('--since 는 7d 꼴 또는 YYYY-MM-DD');
    process.exit(1);
  }
}

// 사유 이름(shared 빌드 — 없으면 코드로)
let REASONS = [
  { code: 'unknown', label: '모르는 노래' },
  { code: 'too_easy', label: '너무 쉬움' },
  { code: 'label', label: '제목·가수 표기가 이상함' },
  { code: 'preview', label: '미리듣기가 이상함(다른 판·끊김)' },
];
try {
  const sh = await import('../shared/dist/index.js');
  if (Array.isArray(sh.SONG_FEEDBACK_REASONS)) REASONS = sh.SONG_FEEDBACK_REASONS.map((r) => ({ code: r.code, label: r.label }));
} catch {
  /* 빌드 전 */
}
const SHORT = { unknown: '모름', too_easy: '쉬움', label: '표기', preview: '미리듣기' };

const dbName = DBS[DB_OPT];
const url = DB_OPT === 'live' && process.env.DATABASE_URL ? process.env.DATABASE_URL : `postgresql://quiz:quizlocal@localhost:5434/${dbName}`;
const db = new pg.Client({ connectionString: url });
await db.connect();
// ★ 읽기만 — 이 연결로는 쓰기를 못 하게 막는다
await db.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');

const params = [];
const where = [`r.minigame_key = 'song'`, `res.input ? 'rate'`];
if (since) {
  params.push(since.toISOString());
  where.push(`(res.input->'rate'->>'at')::timestamptz >= $${params.length}::timestamptz`);
}
if (NO_BOTS) where.push(`(a.login_id IS NULL OR a.login_id !~ '^(bot|uic|r10_)')`);
const rows = (
  await db.query(
    `SELECT ro.item_id, coalesce(ro.params->>'mode', '') = 'song' AS mode_board,
            (res.input->'rate'->>'vote')::int AS vote,
            coalesce(res.input->'rate'->'reasons', '[]'::jsonb) AS reasons,
            res.input->'rate'->>'at' AS at,
            i.payload->>'title' AS title, i.payload->>'artist' AS artist, (i.payload->>'year')::int AS year,
            i.payload->>'category' AS category, i.payload->>'genre' AS genre, i.active
       FROM minigame_results res
       JOIN minigame_runs r ON r.id = res.run_id
       JOIN minigame_rounds ro ON ro.run_id = res.run_id AND ro.round_index = res.round_index
       LEFT JOIN accounts a ON a.id = res.account_id
       LEFT JOIN minigame_items i ON i.item_id = ro.item_id
      WHERE ${where.join(' AND ')}`,
    params,
  )
).rows;
await db.end();

const songs = new Map();
const total = { up: 0, mid: 0, down: 0, board: 0, mini: 0, reasons: Object.fromEntries(REASONS.map((r) => [r.code, 0])) };
for (const r of rows) {
  const id = r.item_id ?? '(id 없음)';
  let s = songs.get(id);
  if (!s) {
    s = { id, title: r.title ?? '?', artist: r.artist ?? '?', year: r.year, category: r.category ?? '-', genre: r.genre ?? '-', active: r.active, up: 0, mid: 0, down: 0, reasons: Object.fromEntries(REASONS.map((x) => [x.code, 0])), last: '' };
    songs.set(id, s);
  }
  if (r.vote === 1) (s.up += 1), (total.up += 1);
  else if (r.vote === 0) (s.mid += 1), (total.mid += 1);
  else if (r.vote === -1) {
    s.down += 1;
    total.down += 1;
    for (const c of r.reasons) {
      if (c in s.reasons) (s.reasons[c] += 1), (total.reasons[c] += 1);
    }
  }
  if (r.mode_board) total.board += 1;
  else total.mini += 1;
  if ((r.at ?? '') > s.last) s.last = r.at ?? '';
}
const list = [...songs.values()].sort((a, b) => b.down - a.down || a.up - b.up || a.id.localeCompare(b.id));

const kst = (d) => (d ? new Date(new Date(d).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '-');
const reasonCell = (s) =>
  REASONS.filter((r) => s.reasons[r.code] > 0)
    .map((r) => `${SHORT[r.code] ?? r.code} ${s.reasons[r.code]}`)
    .join(' · ') || '-';

const head = `노래 평가 — ${dbName}${since ? ` · ${kst(since)} 부터` : ''}${NO_BOTS ? ' · 봇 뺌' : ''} · 평가 ${rows.length}(방식 판 ${total.board} · 미니게임 판 ${total.mini}) · 곡 ${list.length}
  👍 ${total.up} · 😐 ${total.mid} · 👎 ${total.down}  (👎 사유: ${REASONS.map((r) => `${r.label} ${total.reasons[r.code]}`).join(' · ')})`;
console.log(head);
console.log('');
console.log(' 👎  👍  😐  사유                 id         제목 — 가수 (연도 · 분류 · 장르)');
for (const s of list) {
  console.log(
    ` ${String(s.down).padStart(2)}  ${String(s.up).padStart(2)}  ${String(s.mid).padStart(2)}  ${reasonCell(s).padEnd(18)}  ${s.id.padEnd(9)}  ${s.title} — ${s.artist} (${s.year ?? '?'} · ${s.category} · ${s.genre})${s.active === false ? ' · 비활성' : ''}`,
  );
}

const md = [
  `# 노래 평가 (npm run song:feedback)`,
  '',
  head.replace(/\n {2}/, '\n\n'),
  '',
  '| 👎 | 👍 | 😐 | 👎 사유 | id | 제목 | 가수 | 연도 | 분류 | 장르 | 마지막 평가 |',
  '|---:|---:|---:|---|---|---|---|---:|---|---|---|',
  ...list.map((s) => `| ${s.down} | ${s.up} | ${s.mid} | ${reasonCell(s)} | ${s.id}${s.active === false ? ' (비활성)' : ''} | ${s.title} | ${s.artist} | ${s.year ?? '?'} | ${s.category} | ${s.genre} | ${kst(s.last)} |`),
  '',
].join('\n');
mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
writeFileSync(path.join(ROOT, 'tmp', 'song-feedback.md'), md);
console.log('\n→ tmp/song-feedback.md');
