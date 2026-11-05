#!/usr/bin/env node
// =============================================================================
// ★★★ 문항별 실측 보고서 (R074 · 찬종 2026-11-05 "실제 문제 맞히는 시간과 정답률 데이터를 같이 확인해서 데이터를 많이 신뢰하자") — 읽기만
//
//   npm run play:stats                                          ← 지금까지 전부(★ hint:solve 는 기본 30일 — 이 보고서는 문항별이라 길게 본다)
//   npm run play:stats -- --since 2026-10-25 [--until 2026-11-06]   ← 기간(한국 날짜 · until 은 그날 끝까지)
//   npm run play:stats -- --games 2204,2205                       ← 판 지정(기간 무시)
//   npm run play:stats -- --min 3                                 ← 어긋남 후보의 최소 판 수(기본 3)
//
// ★ 문항마다(hint-solve-report 와 같은 잣대): 나온 판 수 n · 사람 첫 정답 넷 — 힌트 전(< 10초) · 힌트만 15초(10~25초) · 초성 뒤(≥ 25초) · 못 맞힘 —
//   비율 · 첫 정답 중앙 시간(ms) · 틀린 제출 수(사람 · matched 아님) · 건너뛰기 표 수(skip_votes_at_end 합) · 지금 등급(difficulty_score) · 알가치(worth) · 마지막 나온 날.
//   ★ 빼는 것: 봇 · 검사 계정만 있는 판 · 정답 공개를 못 한 문항(aborted · resolved_at 없음). 봇만 맞힌 판은 "봇만" 으로 따로(못 맞힘에 안 넣는다 · 비율 분모에서 뺀다).
// ★ 봇 · 검사 계정: login_id ~ shared NEAR_MISS_SKIP_LOGIN(서버 config.tuning.rateSkipLogin 기본값 · hint:solve · feedback-report 와 같은 값).
// ★ 등급 어긋남 후보(n ≥ --min): 등급 4·5 인데 힌트 전 정답 ≥ 50% → "쉬움 의심" · 등급 1·2 인데 못 맞힘 ≥ 50% → "어려움 의심" ·
//   등급 3 은 힌트 전 ≥ 70% → 쉬움 의심 · 못 맞힘 ≥ 60% → 어려움 의심.
// ★ 출력: tmp/play-stats.md(상위 표 · git 밖) + data/pipeline/audit/play-stats-<YYYYMMDD>.json(전 문항 — 설계 · VERIFY 가 쓴다 · git 에 넣는다). DB 쓰기 없음.
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
const GAMES = opt('--games');
const MIN_N = Number(opt('--min', '3'));
const OUT_JSON = opt('--out');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
if ((SINCE && !DAY.test(SINCE)) || (UNTIL && !DAY.test(UNTIL))) {
  console.error('--since · --until 은 YYYY-MM-DD (한국 날짜)');
  process.exit(1);
}
const gameIds = GAMES ? GAMES.split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x)) : null;
if (GAMES && !gameIds.length) {
  console.error('--games 는 쉼표로 판 번호');
  process.exit(1);
}
if (!(MIN_N >= 1)) {
  console.error('--min 은 1 이상');
  process.exit(1);
}

let SKIP = '^(bot|uic|r10_)|^(test|test2|timer136|timer1346)$';
try {
  SKIP = (await import('../shared/dist/nearMiss.js')).NEAR_MISS_SKIP_LOGIN ?? SKIP;
} catch {
  /* 빌드 전 — 기본값 */
}
const kstDay = (d) => new Date(new Date(d).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const kst = (d) => new Date(new Date(d).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

/** 판 하나의 넷(hint-solve-report 와 같은 경계) */
export function bucketOf(humanMs, anyOk) {
  if (humanMs !== null && humanMs !== undefined) {
    const ms = Number(humanMs);
    return ms < 10_000 ? 'pre' : ms < 25_000 ? 'hint' : 'initial';
  }
  return anyOk > 0 ? 'bot' : 'miss';
}
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
/** 등급 어긋남 — 비율은 사람 판(봇만 뺀 판) 기준 */
export function mismatchOf(q, minN = 3) {
  const n = q.n - q.bot;
  if (n < minN || q.grade === null || q.grade === undefined) return null;
  const pre = q.pre / n;
  const miss = q.miss / n;
  const g = Number(q.grade);
  if (g >= 4 && pre >= 0.5) return 'easy';
  if (g <= 2 && miss >= 0.5) return 'hard';
  if (g === 3 && pre >= 0.7) return 'easy';
  if (g === 3 && miss >= 0.6) return 'hard';
  return null;
}
/** 판 행들 → 문항별 */
export function aggregate(rows, minN = 3) {
  const m = new Map();
  for (const r of rows) {
    const id = String(r.question_id);
    const q = m.get(id) ?? { id, n: 0, pre: 0, hint: 0, initial: 0, miss: 0, bot: 0, ms: [], wrong: 0, skip: 0, last: null, grade: r.grade ?? null, worth: r.worth ?? null, text: r.text ?? '', answer: r.answer ?? '' };
    q.n += 1;
    q[bucketOf(r.human_ms, r.any_ok)] += 1;
    if (r.human_ms !== null && r.human_ms !== undefined) q.ms.push(Number(r.human_ms));
    q.wrong += Number(r.wrong ?? 0);
    q.skip += Number(r.skip ?? 0);
    const t = new Date(r.started_at).getTime();
    if (q.last === null || t > q.last) q.last = t;
    m.set(id, q);
  }
  return [...m.values()].map((q) => {
    const h = q.n - q.bot;
    const rate = (k) => (h ? Math.round((q[k] / h) * 1000) / 10 : null);
    return {
      id: q.id,
      n: q.n,
      humanN: h,
      pre: q.pre,
      hint: q.hint,
      initial: q.initial,
      miss: q.miss,
      bot: q.bot,
      prePct: rate('pre'),
      hintPct: rate('hint'),
      initialPct: rate('initial'),
      missPct: rate('miss'),
      medianMs: median(q.ms),
      wrong: q.wrong,
      skipVotes: q.skip,
      grade: q.grade === null ? null : Number(q.grade),
      worth: q.worth === null ? null : Number(q.worth),
      lastSeen: q.last === null ? null : kstDay(q.last),
      mismatch: mismatchOf(q, minN),
      text: q.text,
      answer: q.answer,
    };
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
  await db.connect();
  try {
    const params = [];
    const where = [`gq.resolved_at IS NOT NULL`, `gq.resolution IS DISTINCT FROM 'aborted'`];
    if (gameIds) {
      params.push(gameIds);
      where.push(`gq.game_id = ANY($${params.length}::bigint[])`);
    } else {
      if (SINCE) {
        params.push(SINCE);
        where.push(`gq.started_at >= ($${params.length}::date)::timestamp AT TIME ZONE 'Asia/Seoul'`);
      }
      if (UNTIL) {
        params.push(UNTIL);
        where.push(`gq.started_at < ($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul'`);
      }
    }
    params.push(SKIP);
    const skipP = `$${params.length}`;
    const rows = (
      await db.query(
        `SELECT gq.game_id::text, gq.question_index, gq.question_id::text, gq.started_at, gq.resolution, coalesce(gq.skip_votes_at_end, 0)::int AS skip,
                q.difficulty_score AS grade, q.worth, left(q.question_text, 60) AS text, q.display_answer AS answer,
                (SELECT min(e.response_ms) FROM answer_events e JOIN accounts a ON a.id = e.account_id
                  WHERE e.game_id = gq.game_id AND e.question_index = gq.question_index AND e.accepted AND a.login_id !~ ${skipP}) AS human_ms,
                (SELECT count(*) FROM answer_events e
                  WHERE e.game_id = gq.game_id AND e.question_index = gq.question_index AND e.accepted)::int AS any_ok,
                (SELECT count(*) FROM answer_events e JOIN accounts a ON a.id = e.account_id
                  WHERE e.game_id = gq.game_id AND e.question_index = gq.question_index AND NOT e.matched AND a.login_id !~ ${skipP})::int AS wrong
           FROM game_questions gq
           JOIN questions q ON q.id = gq.question_id
          WHERE ${where.join(' AND ')}
            AND EXISTS (SELECT 1 FROM game_players p JOIN accounts a ON a.id = p.account_id WHERE p.game_id = gq.game_id AND a.login_id !~ ${skipP})
          ORDER BY gq.game_id, gq.question_index`,
        params,
      )
    ).rows;
    const all = aggregate(rows, MIN_N);
    const games = new Set(rows.map((r) => r.game_id)).size;
    const enough = all.filter((q) => q.humanN >= MIN_N);
    const easy = all.filter((q) => q.mismatch === 'easy').sort((a, b) => b.prePct - a.prePct || b.n - a.n);
    const hard = all.filter((q) => q.mismatch === 'hard').sort((a, b) => b.missPct - a.missPct || b.n - a.n);
    const scope = gameIds ? `판 ${gameIds.join(', ')}` : `${SINCE ?? '처음'} ~ ${UNTIL ?? '지금'}`;
    const head = '| 문항 | 등급 | 알가치 | n(사람) | 힌트 전 | 힌트만 | 초성 뒤 | 못 맞힘 | 중앙 ms | 틀린 제출 | 건너뛰기 | 마지막 | 질문(앞 60자) |';
    const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
    const p = (v) => (v === null ? '—' : `${v}%`);
    const row = (q) =>
      `| ${q.id} | ${q.grade ?? '?'} | ${q.worth ?? '—'} | ${q.n}(${q.humanN}) | ${p(q.prePct)} | ${p(q.hintPct)} | ${p(q.initialPct)} | ${p(q.missPct)} | ${q.medianMs ?? '—'} | ${q.wrong} | ${q.skipVotes} | ${q.lastSeen ?? '—'} | ${String(q.text).replace(/\|/g, '/').replace(/\s+/g, ' ')} |`;
    const byGrade = new Map();
    for (const q of enough) {
      const k = q.grade ?? '?';
      const t = byGrade.get(k) ?? { q: 0, easy: 0, hard: 0 };
      t.q += 1;
      if (q.mismatch === 'easy') t.easy += 1;
      if (q.mismatch === 'hard') t.hard += 1;
      byGrade.set(k, t);
    }
    const md = [
      `# 문항별 실측 — ${kst(Date.now())} (한국 시각) · ${scope}`,
      '',
      `- 판 ${games} · 문항 ${all.length} · n(사람) ≥ ${MIN_N} 문항 **${enough.length}** · 봇 · 검사 계정(login_id ~ \`${SKIP}\`)만 있는 판 · 정답 공개 못 한 문항 제외`,
      `- 등급 어긋남 후보: **쉬움 의심 ${easy.length}** · **어려움 의심 ${hard.length}** (등급 4·5 힌트 전 ≥ 50% · 등급 1·2 못 맞힘 ≥ 50% · 등급 3 은 70% / 60%)`,
      '- 넷: 사람이 처음 맞힌 response_ms — 힌트 전 < 10초 · 힌트만 10~25초 · 초성 뒤 ≥ 25초 · 못 맞힘 · (봇만 = 비율 분모에서 뺌) · 등급 · 알가치는 **지금** questions 값',
      '',
      '## 등급별 — n(사람) ≥ ' + MIN_N,
      '',
      '| 등급 | 문항 | 쉬움 의심 | 어려움 의심 |',
      '|---|---|---|---|',
      ...[...byGrade.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en', { numeric: true })).map(([k, t]) => `| ${k} | ${t.q} | ${t.easy} | ${t.hard} |`),
      '',
      `## 쉬움 의심 ${easy.length} (위 40)`,
      '',
      ...(easy.length ? [head, sep, ...easy.slice(0, 40).map(row)] : ['없음']),
      '',
      `## 어려움 의심 ${hard.length} (위 40)`,
      '',
      ...(hard.length ? [head, sep, ...hard.slice(0, 40).map(row)] : ['없음']),
      '',
      '## 많이 나온 문항 (위 30)',
      '',
      head,
      sep,
      ...[...all].sort((a, b) => b.n - a.n).slice(0, 30).map(row),
      '',
    ];
    mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
    const mdOut = path.join(ROOT, 'tmp', 'play-stats.md');
    writeFileSync(mdOut, md.join('\n'));
    const stamp = kstDay(Date.now()).replace(/-/g, '');
    const jsonOut = OUT_JSON ? path.resolve(OUT_JSON) : path.join(ROOT, 'data', 'pipeline', 'audit', `play-stats-${stamp}.json`);
    mkdirSync(path.dirname(jsonOut), { recursive: true });
    writeFileSync(
      jsonOut,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scope,
          skipLogin: SKIP,
          minN: MIN_N,
          games,
          questions: all.length,
          enough: enough.length,
          easy: easy.length,
          hard: hard.length,
          items: [...all].sort((a, b) => Number(a.id) - Number(b.id)).map(({ text, answer, ...rest }) => rest),
        },
        null,
        1,
      ),
    );
    console.log(md.slice(0, 14).join('\n'));
    console.log(`\n[play:stats] → ${path.relative(ROOT, mdOut)} · ${path.relative(ROOT, jsonOut)}`);
  } finally {
    await db.end();
  }
}
