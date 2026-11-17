#!/usr/bin/env node
// =============================================================================
// ★★★ 문항별 플레이 통계 (R103 · D-360) — DB 읽기만
//
//   node scripts/question-stats.mjs                     ← 2026-11-17(카드 다시 쓴 날 · 한국 시각)부터 · 노출 3번 이상
//   node scripts/question-stats.mjs --since 2026-11-01 --min 1
//   node scripts/question-stats.mjs --dev               ← 개발 DB(quizweb_dev) · 기본은 DATABASE_URL 또는 실 DB(quizweb)
//   [--solo]                                            ← 사람 1명 판도 센다(기본은 사람 2명 이상인 문항만 = "사람 판")
//
// ★ 원천: play_events(0037 · 문항 × 사람 한 줄 — R103 부터). 그 전 판(그 문항의 play_events 가 없는 것)은
//   game_questions · answer_events · game_players 로 어림한다(source = old):
//     · 사람 = 그 판의 game_players(중간 참가는 그 문항 전부터 있었다고 친다) · 경험 = question_experiences 처음 본 때가 그 문항 전
//     · 맞힘 = 정답 글자와 맞은 메시지(정답자 · 정답자보다 3초 안의 뒷북 · 마감 뒤) · 힌트 단계 = 걸린 ms 로(10초 전 · 25초 전 · 그 뒤)
//     · 틀린 글 수 · 아무것도 안 침 · 방 난이도 설정은 알 수 없다(NULL)
// ★ 봇 · 검사 계정(shared NEAR_MISS_SKIP_LOGIN)은 사람 수 · 정답률에서 뺀다. 이미 본 사람(experienced)도 뺀다.
// ★ 흔한 오답 = near_misses(정답에 가까운 오답만 — 채팅 원문은 남기지 않는다) · 👍 👎 = question_feedback(R099 부터 입력 없음 — 옛 표만).
// ★ 등급 띠(docs/19 §2): 1 = 90%↑ · 2 = 70~90 · 3 = 45~70 · 4 = 20~45 · 5 = 20↓ — 방 정답률로 "보이는 등급" 을 매겨 지금 등급과 두 칸 이상 어긋나면 목록에.
//
// 출력: data/stats/question-stats.json + 터미널 요약
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NEAR_MISS_SKIP_LOGIN } from '../shared/dist/nearMiss.js';
import { RULES } from '../shared/dist/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const SINCE = opt('--since', '2026-11-17');
const MIN = Number(opt('--min', 3));
const SOLO = args.includes('--solo');
if (!/^\d{4}-\d{2}-\d{2}$/.test(SINCE) || !Number.isInteger(MIN) || MIN < 1) {
  console.error('쓰는 법: --since YYYY-MM-DD --min N(1 이상)');
  process.exit(1);
}
const URL_ = args.includes('--dev')
  ? 'postgresql://quiz:quizlocal@localhost:5434/quizweb_dev'
  : (process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb');
const DB_NAME = new URL(URL_).pathname.slice(1);

// 힌트 경계(문항이 뜬 뒤 ms) — 일반 힌트 = 남은 30초 · 초성 = 남은 15초
const GENERAL_AT = RULES.QUESTION_DURATION_MS - RULES.GENERAL_HINT_REVEAL_AT_MS;
const CHOSUNG_AT = RULES.QUESTION_DURATION_MS - RULES.HINT_REVEAL_AT_MS;
const LATE_MS = RULES.LATE_ANSWER_WINDOW_MS;
/** 방 정답률 → 보이는 등급(docs/19 §2) */
const bandOf = (r) => (r >= 0.9 ? 1 : r >= 0.7 ? 2 : r >= 0.45 ? 3 : r >= 0.2 ? 4 : 5);

const db = new pg.Client({ connectionString: URL_ });
await db.connect();
const sinceSql = `($1::timestamp AT TIME ZONE 'Asia/Seoul')`;
const hasPlay = (await db.query(`SELECT to_regclass('play_events') IS NOT NULL AS ok`)).rows[0].ok;

// ── 사람 줄(문항 × 사람) — 새 기록
const rows = [];
if (hasPlay) {
  const r = await db.query(
    `SELECT pe.game_id, pe.question_index, pe.question_id::text AS qid, pe.account_id::text AS acc, pe.is_bot, pe.experienced,
            pe.won, pe.correct_ms, pe.late, pe.hint_stage, pe.wrong_count, pe.first_ms, pe.level, pe.text_hash, pe.resolution
       FROM play_events pe
      WHERE pe.kind = 'quiz' AND pe.created_at >= ${sinceSql}`,
    [SINCE],
  );
  for (const x of r.rows) rows.push({ ...x, source: 'new' });
}
// ── 옛 판 어림(그 문항의 play_events 가 없는 것만)
{
  const r = await db.query(
    `SELECT gq.game_id, gq.question_index, gq.question_id::text AS qid, gp.account_id::text AS acc,
            (a.login_id ~* $2) AS is_bot,
            EXISTS (SELECT 1 FROM question_experiences qe
                     WHERE qe.account_id = gp.account_id AND qe.question_id = gq.question_id AND qe.first_experienced_at < gq.started_at) AS experienced,
            (gq.winner_account_id = gp.account_id) AS won,
            (SELECT min(ae.response_ms) FROM answer_events ae
              WHERE ae.game_id = gq.game_id AND ae.question_index = gq.question_index AND ae.account_id = gp.account_id AND ae.matched
                AND (ae.accepted OR ae.reject_reason = 'past_deadline'
                     OR (ae.reject_reason = 'already_resolved' AND gq.resolved_at IS NOT NULL
                         AND ae.response_ms <= extract(epoch FROM gq.resolved_at - gq.started_at) * 1000 + $3))) AS correct_ms,
            gq.resolution
       FROM game_questions gq
       JOIN games g ON g.id = gq.game_id AND g.mode = 'quiz'
       JOIN game_players gp ON gp.game_id = gq.game_id
       JOIN accounts a ON a.id = gp.account_id
      WHERE gq.started_at >= ${sinceSql}
        AND gq.resolution IN ('correct', 'timeout', 'skip_vote', 'host_skip')
        ${hasPlay ? 'AND NOT EXISTS (SELECT 1 FROM play_events pe WHERE pe.game_id = gq.game_id AND pe.question_index = gq.question_index)' : ''}`,
    [SINCE, NEAR_MISS_SKIP_LOGIN, LATE_MS],
  );
  for (const x of r.rows) {
    const ms = x.correct_ms === null ? null : Number(x.correct_ms);
    rows.push({
      ...x,
      correct_ms: ms,
      late: ms !== null && !x.won,
      hint_stage: ms === null ? null : ms < GENERAL_AT ? 0 : ms < CHOSUNG_AT ? 1 : 2,
      wrong_count: null,
      first_ms: null,
      level: null,
      text_hash: null,
      source: 'old',
    });
  }
}

// ── 노출(판 × 문항)으로 묶기 — 사람(봇 아님 · 처음 보는 사람)만
const shows = new Map(); // key game|index
for (const x of rows) {
  const k = `${x.game_id}|${x.question_index}`;
  let s = shows.get(k);
  if (!s) shows.set(k, (s = { qid: x.qid, source: x.source, resolution: x.resolution, level: x.level, hash: x.text_hash, humans: 0, people: [] }));
  if (x.is_bot) continue;
  s.humans += 1;
  if (!x.experienced) s.people.push(x);
}

const qs = new Map();
let skippedSolo = 0;
for (const s of shows.values()) {
  if (s.humans < (SOLO ? 1 : 2) || s.people.length === 0) {
    skippedSolo += 1;
    continue;
  }
  let q = qs.get(s.qid);
  if (!q) qs.set(s.qid, (q = { shows: 0, roomCorrect: 0, people: 0, correct: 0, stage: [0, 0, 0], never: 0, fastest: [], wrong: [], silent: 0, silentKnown: 0, old: 0, hashes: new Set(), levels: {} }));
  q.shows += 1;
  if (s.source === 'old') q.old += 1;
  if (s.hash) q.hashes.add(s.hash);
  const lv = s.level ?? '?';
  q.levels[lv] = (q.levels[lv] ?? 0) + 1;
  let best = null;
  for (const p of s.people) {
    q.people += 1;
    if (p.correct_ms !== null) {
      q.correct += 1;
      q.stage[p.hint_stage ?? 0] += 1;
      best = best === null ? p.correct_ms : Math.min(best, p.correct_ms);
    } else q.never += 1;
    if (p.wrong_count !== null) {
      q.wrong.push(p.wrong_count);
      q.silentKnown += 1;
      if (p.first_ms === null) q.silent += 1;
    }
  }
  if (best !== null) {
    q.roomCorrect += 1;
    q.fastest.push(best);
  }
}

// ── 문항 글 · 등급 · 흔한 오답 · 평가
const ids = [...qs.keys()];
const meta = new Map();
const nearTop = new Map();
const votes = new Map();
if (ids.length > 0) {
  for (const m of (await db.query(
    `SELECT id::text, difficulty_score, display_answer, left(question_text, 50) AS text FROM questions WHERE id = ANY($1::bigint[])`, [ids])).rows) meta.set(m.id, m);
  for (const n of (await db.query(
    `SELECT nm.question_id::text AS qid, nm.normalized, count(*)::int AS n
       FROM near_misses nm JOIN accounts a ON a.id = nm.account_id
      WHERE nm.question_id = ANY($1::bigint[]) AND nm.created_at >= ${sinceSql.replace('$1', '$2')} AND a.login_id !~* $3
      GROUP BY 1, 2 ORDER BY 1, 3 DESC, 2`, [ids, SINCE, NEAR_MISS_SKIP_LOGIN])).rows) {
    const l = nearTop.get(n.qid) ?? [];
    if (l.length < 5) l.push(`${n.normalized}×${n.n}`);
    nearTop.set(n.qid, l);
  }
  for (const v of (await db.query(
    `SELECT f.question_id::text AS qid, count(*) FILTER (WHERE vote = 1)::int AS up, count(*) FILTER (WHERE vote = -1)::int AS down
       FROM question_feedback f JOIN accounts a ON a.id = f.account_id
      WHERE f.question_id = ANY($1::bigint[]) AND f.updated_at >= ${sinceSql.replace('$1', '$2')} AND a.login_id !~* $3 GROUP BY 1`,
    [ids, SINCE, NEAR_MISS_SKIP_LOGIN])).rows) votes.set(v.qid, v);
}
await db.end();

const median = (a) => {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n, d) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

const out = [];
for (const [id, q] of qs) {
  const m = meta.get(id) ?? {};
  const roomRate = q.roomCorrect / q.shows;
  const grade = m.difficulty_score ?? null;
  const seen = bandOf(roomRate);
  const fm = median(q.fastest);
  out.push({
    id: Number(id),
    grade,
    text: m.text ?? null,
    answer: m.display_answer ?? null,
    shows: q.shows,
    oldShows: q.old,
    roomCorrectPct: pct(q.roomCorrect, q.shows),
    seenGrade: seen,
    off: grade === null ? null : seen - grade,
    people: q.people,
    personCorrectPct: pct(q.correct, q.people),
    beforeHintPct: pct(q.stage[0], q.people),
    afterGeneralPct: pct(q.stage[1], q.people),
    afterChosungPct: pct(q.stage[2], q.people),
    neverPct: pct(q.never, q.people),
    fastestMedianSec: fm === null ? null : Math.round(fm / 100) / 10,
    silentPct: pct(q.silent, q.silentKnown),
    wrongAvg: q.wrong.length ? Math.round((q.wrong.reduce((a, b) => a + b, 0) / q.wrong.length) * 10) / 10 : null,
    commonWrong: nearTop.get(id) ?? [],
    up: votes.get(id)?.up ?? 0,
    down: votes.get(id)?.down ?? 0,
    textVersions: q.hashes.size,
    levels: q.levels,
  });
}
out.sort((a, b) => b.shows - a.shows || a.id - b.id);
const kept = out.filter((q) => q.shows >= MIN);

const byGrade = {};
for (const g of [1, 2, 3, 4, 5, null]) {
  const l = kept.filter((q) => q.grade === g);
  if (l.length === 0) continue;
  const sh = l.reduce((a, q) => a + q.shows, 0);
  const rc = l.reduce((a, q) => a + (q.roomCorrectPct / 100) * q.shows, 0);
  byGrade[g ?? '?'] = { questions: l.length, shows: sh, roomCorrectPct: pct(rc, sh), band: g ? ['90↑', '70~90', '45~70', '20~45', '20↓'][g - 1] : null };
}
const mismatches = kept.filter((q) => q.off !== null && Math.abs(q.off) >= 2).sort((a, b) => Math.abs(b.off) - Math.abs(a.off) || b.shows - a.shows);

const report = {
  generatedAt: new Date().toISOString(),
  db: DB_NAME,
  since: SINCE,
  min: MIN,
  humanGamesOnly: !SOLO,
  totals: {
    peopleRows: rows.length,
    newRows: rows.filter((r) => r.source === 'new').length,
    showsCounted: out.reduce((a, q) => a + q.shows, 0),
    showsSkippedBotOrSolo: skippedSolo,
    questionsSeen: out.length,
    questionsAtMin: kept.length,
  },
  byGrade,
  mismatches: mismatches.map((q) => ({ id: q.id, grade: q.grade, seenGrade: q.seenGrade, roomCorrectPct: q.roomCorrectPct, shows: q.shows, answer: q.answer })),
  questions: kept,
};
mkdirSync(path.join(ROOT, 'data/stats'), { recursive: true });
const file = path.join(ROOT, 'data/stats/question-stats.json');
writeFileSync(file, JSON.stringify(report, null, 2) + '\n');

// ── 터미널 요약
const T = report.totals;
console.log(`\n[문항 통계] DB ${DB_NAME} · ${SINCE}(한국 시각)부터 · ${SOLO ? '사람 1명 판 포함' : '사람 2명 이상 판만'} · 노출 ${MIN}번 이상`);
console.log(`  사람 줄 ${T.peopleRows}(새 기록 ${T.newRows} · 옛 어림 ${T.peopleRows - T.newRows}) · 센 노출 ${T.showsCounted} · 뺀 노출(봇 · 혼자) ${T.showsSkippedBotOrSolo}`);
console.log(`  나온 문항 ${T.questionsSeen} · 노출 ${MIN}번 이상 ${T.questionsAtMin}`);
console.log('\n  등급  문항  노출  방 정답률  (띠)');
for (const [g, v] of Object.entries(byGrade)) console.log(`  ${String(g).padStart(3)}  ${String(v.questions).padStart(4)}  ${String(v.shows).padStart(4)}  ${String(v.roomCorrectPct ?? '-').padStart(7)}%  (${v.band ?? '-'})`);
console.log(`\n  등급과 두 칸 이상 어긋난 문항 ${mismatches.length}`);
for (const q of mismatches.slice(0, 30)) console.log(`   #${q.id}  등급 ${q.grade} → 보이는 ${q.seenGrade}  방 ${q.roomCorrectPct}% · 노출 ${q.shows} · ${q.answer}`);
if (mismatches.length > 30) console.log(`   … ${mismatches.length - 30}개 더(파일)`);
console.log(`\n  → ${path.relative(ROOT, file).replace(/\\/g, '/')}`);
