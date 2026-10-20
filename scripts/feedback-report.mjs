#!/usr/bin/env node
// =============================================================================
// ★★★ 문제 평가(설문) 보고 (R056 · D-246) — 읽기만
//
//   npm run feedback:report                        ← 전부
//   npm run feedback:report -- --since 2026-10-21  ← 그날부터(갱신 시각 기준)
//   npm run feedback:report -- --no-bots           ← 봇 · 검사 계정(bot_* · uic* · r10_*) 빼고
//   [--top 50]                                     ← 👎 많은 문제 몇 개
//
// ★ 콘솔 표 + tmp/feedback-report.md(git 밖). 표 question_feedback 만 읽는다(DB 쓰기 없음).
// ★ 문항 반영은 GEN 몫 — 이 보고를 읽고 15 기준대로 고친다(MAIN 은 questions 를 건드리지 않는다).
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const SINCE = opt('--since', null);
const NO_BOTS = args.includes('--no-bots');
const TOP = Number(opt('--top', 50));
if (SINCE && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
  console.error('--since 는 YYYY-MM-DD');
  process.exit(1);
}

// ★ 라벨은 shared 상수(빌드 뒤 shared/dist) — 없으면 코드 그대로
let labelOf = (c) => c;
let ORDER = ['never_heard', 'too_easy', 'unclear', 'answer', 'hint', 'boring', 'other'];
try {
  const sh = await import('../shared/dist/feedback.js');
  labelOf = sh.feedbackReasonLabel;
  ORDER = sh.FEEDBACK_REASONS.map((r) => r.code);
} catch {
  /* 빌드 전 — 코드로 */
}

/** 한국 시각 — 2026-10-21 03:15 */
const kst = (d) => new Date(new Date(d).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
const where = ['true'];
const params = [];
if (SINCE) {
  params.push(SINCE);
  where.push(`f.updated_at >= $${params.length}::date`);
}
if (NO_BOTS) where.push(`a.login_id !~ '^(bot|uic|r10_)'`);
const W = where.join(' AND ');
try {
  const rows = (
    await db.query(
      `SELECT f.question_id::text, f.vote, f.reasons, f.comment, f.updated_at, a.nickname, a.login_id
         FROM question_feedback f JOIN accounts a ON a.id = f.account_id
        WHERE ${W}`,
      params,
    )
  ).rows;
  const qids = [...new Set(rows.map((r) => r.question_id))];
  const qs = new Map(
    (
      await db.query(
        `SELECT q.id::text, q.question_text, q.display_answer, q.difficulty, q.is_active, c.name_ko AS cat
           FROM questions q LEFT JOIN categories c ON c.id = q.category_id
          WHERE q.id = ANY($1::bigint[])`,
        [qids],
      )
    ).rows.map((q) => [q.id, q]),
  );
  const per = new Map();
  const reasonTotal = Object.fromEntries(ORDER.map((c) => [c, 0]));
  for (const r of rows) {
    const p = per.get(r.question_id) ?? { up: 0, down: 0, reasons: {}, comments: [] };
    if (r.vote === 1) p.up += 1;
    else {
      p.down += 1;
      for (const c of r.reasons) {
        p.reasons[c] = (p.reasons[c] ?? 0) + 1;
        reasonTotal[c] = (reasonTotal[c] ?? 0) + 1;
      }
    }
    if (r.comment) p.comments.push({ nick: r.nickname, at: r.updated_at, text: r.comment });
    per.set(r.question_id, p);
  }
  const people = new Set(rows.map((r) => r.login_id)).size;
  const downs = rows.filter((r) => r.vote === -1).length;
  const head = `문제 평가 보고 — ${kst(Date.now())} (한국 시각)${SINCE ? ` · ${SINCE}부터` : ''}${NO_BOTS ? ' · 봇 제외' : ''}`;
  const short = (s, n) => ([...s].length > n ? `${[...s].slice(0, n).join('')}…` : s);
  const reasonsText = (o) =>
    ORDER.filter((c) => o[c])
      .map((c) => `${labelOf(c)} ${o[c]}`)
      .join(' · ');
  const top = [...per.entries()]
    .filter(([, p]) => p.down > 0)
    .sort((a, b) => b[1].down - a[1].down || a[1].up - b[1].up || Number(a[0]) - Number(b[0]))
    .slice(0, TOP);

  // ── 콘솔
  console.log(`[feedback] ${head}`);
  console.log(`[feedback] 평가 ${rows.length}행 · 👎 ${downs} · 👍 ${rows.length - downs} · 사람 ${people} · 문제 ${per.size}`);
  console.log('\n사유별 합계(👎 에 붙은 것)');
  for (const c of ORDER) console.log(`  ${String(reasonTotal[c]).padStart(5)}  ${labelOf(c)}`);
  console.log(`\n👎 많은 문제 ${top.length}`);
  console.log('  👎   👍  id      난이도 분야        질문');
  for (const [id, p] of top) {
    const q = qs.get(id);
    console.log(`  ${String(p.down).padStart(3)} ${String(p.up).padStart(4)}  ${id.padEnd(7)} ${String(q?.difficulty ?? '?').padEnd(6)} ${short(q?.cat ?? '?', 8).padEnd(10)} ${short(q?.question_text ?? '?', 40)}`);
    if (Object.keys(p.reasons).length) console.log(`              └ ${reasonsText(p.reasons)}`);
  }
  const comments = [...per.entries()].flatMap(([id, p]) => p.comments.map((c) => ({ id, ...c }))).sort((a, b) => b.at - a.at);
  console.log(`\n의견 ${comments.length}`);
  for (const c of comments) console.log(`  #${c.id} · ${c.nick} · ${kst(c.at)} — ${c.text}`);

  // ── 파일
  const md = [
    `# ${head}`,
    '',
    `- 평가 ${rows.length}행 · 👎 ${downs} · 👍 ${rows.length - downs} · 평가한 사람 ${people} · 문제 ${per.size}`,
    '- 표: question_feedback(0020) · 사유 코드는 shared/src/feedback.ts · 문항 반영은 GEN 몫',
    '',
    '## 사유별 합계',
    '',
    '| 사유 | 수 |',
    '|---|---|',
    ...ORDER.map((c) => `| ${labelOf(c)} (\`${c}\`) | ${reasonTotal[c]} |`),
    '',
    `## 👎 많은 문제 ${top.length}`,
    '',
    '| 👎 | 👍 | id | 활성 | 난이도 | 분야 | 질문 | 정답 | 사유 |',
    '|---|---|---|---|---|---|---|---|---|',
    ...top.map(([id, p]) => {
      const q = qs.get(id);
      const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      return `| ${p.down} | ${p.up} | ${id} | ${q?.is_active ? '✓' : '—'} | ${q?.difficulty ?? ''} | ${cell(q?.cat)} | ${cell(short(q?.question_text ?? '', 60))} | ${cell(q?.display_answer)} | ${cell(reasonsText(p.reasons))} |`;
    }),
    '',
    `## 의견 ${comments.length}`,
    '',
    ...comments.map((c) => `- #${c.id} · ${c.nick} · ${kst(c.at)} — ${c.text.replace(/\n/g, ' ')}`),
    '',
  ].join('\n');
  mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  const out = path.join(ROOT, 'tmp', 'feedback-report.md');
  writeFileSync(out, md);
  console.log(`\n[feedback] → ${path.relative(ROOT, out)}`);
} finally {
  await db.end();
}
