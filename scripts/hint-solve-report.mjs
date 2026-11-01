#!/usr/bin/env node
// =============================================================================
// ★★★ 힌트 뒤 정답 집계 (R071 · docs/16 §7 — 설계가 라운드 끝마다 돌린다) — 읽기만
//
//   npm run hint:solve                                         ← 최근 30일
//   npm run hint:solve -- --since 2026-10-25 [--until 2026-11-01]   ← 기간(한국 날짜 · until 은 그날 끝까지)
//   npm run hint:solve -- --split 2026-10-31T00:00+09:00       ← 그 시각 전 · 뒤 두 표(hint-v7 전후 — 등급 4·5 는 10-31 08:23 · 등급 3 은 11-01 08:54 KST 끝)
//   npm run hint:solve -- --games 2204,2205,2206                ← 판 지정(기간 무시)
//
// ★ 무엇을 재나(D-311 hint-v7 효과): 문항마다 **사람이 처음 맞힌 때**(answer_events accepted · response_ms = 문항 시작 뒤 ms)로 넷에 넣는다 —
//   힌트 전(< 10,000) · 힌트만 보이는 15초 안(10,000 ≤ ms < 25,000 — 일반 힌트는 남은 20초에 · 초성은 남은 5초에) · 초성 뒤(≥ 25,000) · 못 맞힘(timeout · skip_vote · host_skip).
//   ★ 정답 공개를 못 한 문항(aborted · resolved_at 없음)은 뺀다. 봇 · 검사 계정만 맞힌 문항은 "봇만" 으로 따로(못 맞힘에 안 넣음).
// ★ 봇 · 검사 계정: login_id ~ shared NEAR_MISS_SKIP_LOGIN(= 서버 config.tuning.rateSkipLogin 기본 '^(bot|uic|r10_)') — 그런 계정만 있는 판은 통째로 뺀다.
// ★ 등급 · 알가치: game_questions.grade · worth(0028 — R071 부터 기록)가 있으면 그것 · 없으면 지금의 questions.difficulty_score · worth.
// ★ 힌트 없는 문항(questions.general_hint 비어 있음)은 등급 표와 따로 센다(지금 값 기준).
// ★ 출력: 콘솔 표 + tmp/hint-solve.md(git 밖). DB 쓰기 없음.
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d = null) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const SINCE = opt('--since');
const UNTIL = opt('--until');
const SPLIT = opt('--split');
const GAMES = opt('--games');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
if ((SINCE && !DAY.test(SINCE)) || (UNTIL && !DAY.test(UNTIL))) {
  console.error('--since · --until 은 YYYY-MM-DD (한국 날짜)');
  process.exit(1);
}
if (SPLIT && Number.isNaN(Date.parse(SPLIT))) {
  console.error('--split 은 시각(예 2026-10-31T00:00+09:00)');
  process.exit(1);
}
const gameIds = GAMES ? GAMES.split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x)) : null;
if (GAMES && !gameIds.length) {
  console.error('--games 는 쉼표로 판 번호');
  process.exit(1);
}

let SKIP = '^(bot|uic|r10_)';
try {
  SKIP = (await import('../shared/dist/nearMiss.js')).NEAR_MISS_SKIP_LOGIN ?? SKIP;
} catch {
  /* 빌드 전 — 기본값 */
}
const SKIP_RE = new RegExp(SKIP);
const kst = (d) => new Date(new Date(d).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
try {
  // ★ 0028(game_questions.grade · worth)이 아직 안 돈 DB 에서도 돈다
  const gqCols = new Set((await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'game_questions'`)).rows.map((r) => r.column_name));
  const hasGrade = gqCols.has('grade');
  const params = [];
  const where = [`gq.resolved_at IS NOT NULL`, `gq.resolution IS DISTINCT FROM 'aborted'`];
  if (gameIds) {
    params.push(gameIds);
    where.push(`gq.game_id = ANY($${params.length}::bigint[])`);
  } else {
    const since = SINCE ?? new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10);
    params.push(since);
    where.push(`gq.started_at >= ($${params.length}::date)::timestamp AT TIME ZONE 'Asia/Seoul'`);
    if (UNTIL) {
      params.push(UNTIL);
      where.push(`gq.started_at < ($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul'`);
    }
  }
  params.push(SKIP);
  const skipP = `$${params.length}`;
  const rows = (
    await db.query(
      `SELECT gq.game_id::text, gq.question_index, gq.question_id::text, gq.started_at, gq.resolution,
              ${hasGrade ? 'coalesce(gq.grade, q.difficulty_score)' : 'q.difficulty_score'} AS grade,
              ${hasGrade ? 'coalesce(gq.worth, q.worth)' : 'q.worth'} AS worth,
              ${hasGrade ? '(gq.grade IS NOT NULL)' : 'false'} AS grade_logged,
              (nullif(btrim(coalesce(q.general_hint, '')), '') IS NOT NULL) AS has_hint,
              (SELECT min(e.response_ms) FROM answer_events e JOIN accounts a ON a.id = e.account_id
                WHERE e.game_id = gq.game_id AND e.question_index = gq.question_index AND e.accepted AND a.login_id !~ ${skipP}) AS human_ms,
              (SELECT count(*) FROM answer_events e
                WHERE e.game_id = gq.game_id AND e.question_index = gq.question_index AND e.accepted)::int AS any_ok
         FROM game_questions gq
         JOIN questions q ON q.id = gq.question_id
        WHERE ${where.join(' AND ')}
          AND EXISTS (SELECT 1 FROM game_players p JOIN accounts a ON a.id = p.account_id WHERE p.game_id = gq.game_id AND a.login_id !~ ${skipP})
        ORDER BY gq.game_id, gq.question_index`,
      params,
    )
  ).rows;

  const bucketOf = (r) => {
    if (r.human_ms !== null) {
      const ms = Number(r.human_ms);
      return ms < 10_000 ? 'pre' : ms < 25_000 ? 'hint' : 'initial';
    }
    return r.any_ok > 0 ? 'bot' : 'miss';
  };
  const B = ['pre', 'hint', 'initial', 'miss', 'bot'];
  const LABEL = { pre: '힌트 전(<10초)', hint: '힌트만 15초 안(10~25초)', initial: '초성 뒤(≥25초)', miss: '못 맞힘', bot: '봇만' };
  const empty = () => ({ n: 0, pre: 0, hint: 0, initial: 0, miss: 0, bot: 0 });
  const tally = (list, keyOf) => {
    const m = new Map();
    for (const r of list) {
      const k = keyOf(r);
      const t = m.get(k) ?? empty();
      t.n += 1;
      t[bucketOf(r)] += 1;
      m.set(k, t);
    }
    return m;
  };
  const pct = (a, n) => (n ? `${Math.round((a / n) * 100)}%` : '—');
  const cell = (t, b) => `${t[b]} (${pct(t[b], t.n)})`;
  const total = (m) => {
    const t = empty();
    for (const v of m.values()) for (const k of Object.keys(t)) t[k] += v[k];
    return t;
  };
  const tableLines = (title, list) => {
    const withHint = list.filter((r) => r.has_hint);
    const noHint = list.filter((r) => !r.has_hint);
    const byGrade = tally(withHint, (r) => r.grade ?? '?');
    const byWorth = tally(withHint, (r) => r.worth ?? '—');
    const byGradeNo = tally(noHint, (r) => r.grade ?? '?');
    const head = `| 묶음 | 문항 | ${B.map((b) => LABEL[b]).join(' | ')} |`;
    const sep = `|---|---|${B.map(() => '---').join('|')}|`;
    const row = (k, t) => `| ${k} | ${t.n} | ${B.map((b) => cell(t, b)).join(' | ')} |`;
    const sortK = (m) => [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en', { numeric: true }));
    return [
      `### ${title} — 문항 ${list.length} (힌트 있음 ${withHint.length} · 없음 ${noHint.length}) · 판 ${new Set(list.map((r) => r.game_id)).size}`,
      '',
      '**등급별(힌트 있는 문항)**',
      '',
      head,
      sep,
      ...sortK(byGrade).map(([k, t]) => row(`등급 ${k}`, t)),
      row('합', total(byGrade)),
      '',
      '**알가치별(힌트 있는 문항)**',
      '',
      head,
      sep,
      ...sortK(byWorth).map(([k, t]) => row(`알가치 ${k}`, t)),
      '',
      `**힌트 없는 문항 ${noHint.length}**(등급별)`,
      '',
      ...(noHint.length ? [head, sep, ...sortK(byGradeNo).map(([k, t]) => row(`등급 ${k}`, t)), row('합', total(byGradeNo))] : ['없음']),
      '',
    ];
  };

  const scope = gameIds ? `판 ${gameIds.join(', ')}` : `${SINCE ?? '최근 30일'}${UNTIL ? ` ~ ${UNTIL}` : ''}`;
  const logged = rows.filter((r) => r.grade_logged).length;
  const md = [
    `# 힌트 뒤 정답 집계 — ${kst(Date.now())} (한국 시각) · ${scope}`,
    '',
    `- 문항 ${rows.length} · 판 ${new Set(rows.map((r) => r.game_id)).size} · 봇 · 검사 계정(login_id ~ \`${SKIP}\`) 제외 · 등급 출처: game_questions.grade ${logged} · 지금의 questions.difficulty_score ${rows.length - logged}`,
    '- 넷: 사람이 처음 맞힌 response_ms(문항 시작 뒤) — 힌트 전 < 10초 · 힌트만 보이는 15초 안 10~25초 · 초성 뒤 ≥ 25초 · 못 맞힘 = timeout · skip_vote · host_skip · 봇만 = 봇 · 검사 계정만 맞힘',
    '',
  ];
  if (SPLIT) {
    const t = Date.parse(SPLIT);
    md.push(...tableLines(`전 (< ${SPLIT})`, rows.filter((r) => new Date(r.started_at).getTime() < t)));
    md.push(...tableLines(`뒤 (≥ ${SPLIT})`, rows.filter((r) => new Date(r.started_at).getTime() >= t)));
  } else md.push(...tableLines('전체', rows));
  mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  const out = path.join(ROOT, 'tmp', 'hint-solve.md');
  writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\n[hint:solve] → ${path.relative(ROOT, out)}`);
} finally {
  await db.end();
}
