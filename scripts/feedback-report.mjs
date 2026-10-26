#!/usr/bin/env node
// =============================================================================
// ★★★ 문제 평가(설문) 보고 (R056 · D-246) — 읽기만
//
//   npm run feedback:report                        ← 전부
//   npm run feedback:report -- --since 2026-10-21  ← 그날부터(갱신 시각 기준)
//   npm run feedback:report -- --no-bots           ← 봇 · 검사 계정(bot_* · uic* · r10_*) 빼고
//   [--top 50]                                     ← 👎 많은 문제 몇 개
//   ★ R059 — 👎 설문마다 번호(f#) · 채택 표시(✔ +5P) · "채택된 제보 사람별 합계(월별)" — 채택은 npm run feedback:adopt -- --id <f#> --yes
//   ★★ R068 (docs/19 §7) — 3단계(👍 1 · 😐 0 · 👎 −1) · 그중 공개 중(at_reveal) 수 · ★ 찬종 표(lonysg · lonysg2 — 절대 신뢰)는 따로 열 ·
//     "검토 후보" 절: 찬종 표 없음 · 남의 표 ≥ 2 · 👎 ≥ 👍 + 1 / 한 계정이 한 판(3문제 이상)에서 전부 같은 버튼이면 장난 의심(그 판 표는 후보 셈에서 뺌) /
//     (questions.worth 가 채워진 뒤) worth 3 인데 👎 > 👍 · worth 1 인데 👍 ≥ 2 → 설계가 찬종에게 가져간다(자동 반영 없음)
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
// ★ R068 — 찬종 계정(절대 신뢰 — 실수는 제보 코멘트로 교정)
const CHANJONG = new Set(['lonysg', 'lonysg2']);
try {
  const rows = (
    await db.query(
      `SELECT f.id::text AS fid, f.question_id::text, f.vote, f.reasons, f.comment, f.updated_at, f.adopted_at, g.amount AS adopted_amount, a.nickname, a.login_id,
              f.account_id::text, f.game_id::text, f.at_reveal
         FROM question_feedback f JOIN accounts a ON a.id = f.account_id LEFT JOIN point_grants g ON g.id = f.adopted_grant_id
        WHERE ${W}`,
      params,
    )
  ).rows;
  const qids = [...new Set(rows.map((r) => r.question_id))];
  const qs = new Map(
    (
      await db.query(
        `SELECT q.id::text, q.question_text, q.display_answer, q.difficulty, q.is_active, q.worth, c.name_ko AS cat
           FROM questions q LEFT JOIN categories c ON c.id = q.category_id
          WHERE q.id = ANY($1::bigint[])`,
        [qids],
      )
    ).rows.map((q) => [q.id, q]),
  );
  // ★ R068 — 장난 의심: 한 계정이 한 판에서 3문제 이상 평가했고 전부 같은 버튼
  const byGame = new Map();
  for (const r of rows) {
    if (!r.game_id || CHANJONG.has(r.login_id)) continue;
    const k = `${r.account_id}|${r.game_id}`;
    const g = byGame.get(k) ?? { votes: new Set(), n: 0, nick: r.nickname, game: r.game_id };
    g.votes.add(r.vote);
    g.n += 1;
    byGame.set(k, g);
  }
  const prank = new Set([...byGame.entries()].filter(([, g]) => g.n >= 3 && g.votes.size === 1).map(([k]) => k));
  const per = new Map();
  const reasonTotal = Object.fromEntries(ORDER.map((c) => [c, 0]));
  for (const r of rows) {
    const p = per.get(r.question_id) ?? { up: 0, mid: 0, down: 0, upR: 0, midR: 0, downR: 0, cj: [], oUp: 0, oMid: 0, oDown: 0, reasons: {}, comments: [] };
    // ★ R068 — 공개 중(at_reveal) 수 · 찬종 표 · 남의 표(장난 의심 판 제외)
    if (CHANJONG.has(r.login_id)) p.cj.push(r.vote === 1 ? '👍' : r.vote === 0 ? '😐' : '👎');
    else if (!prank.has(`${r.account_id}|${r.game_id}`)) {
      if (r.vote === 1) p.oUp += 1;
      else if (r.vote === 0) p.oMid += 1;
      else p.oDown += 1;
    }
    if (r.vote === 1) {
      p.up += 1;
      if (r.at_reveal) p.upR += 1;
    } else if (r.vote === 0) {
      p.mid += 1;
      if (r.at_reveal) p.midR += 1;
    } else {
      if (r.at_reveal) p.downR += 1;
      p.down += 1;
      for (const c of r.reasons) {
        p.reasons[c] = (p.reasons[c] ?? 0) + 1;
        reasonTotal[c] = (reasonTotal[c] ?? 0) + 1;
      }
    }
    if (r.comment) p.comments.push({ fid: r.fid, nick: r.nickname, at: r.updated_at, text: r.comment, adopted: r.adopted_at ? r.adopted_amount : null });
    per.set(r.question_id, p);
  }
  const people = new Set(rows.map((r) => r.login_id)).size;
  const downs = rows.filter((r) => r.vote === -1).length;
  const mids = rows.filter((r) => r.vote === 0).length;
  const reveals = rows.filter((r) => r.at_reveal).length;
  // ★ R068 — 검토 후보
  const review = [...per.entries()]
    .filter(([, p]) => p.cj.length === 0 && p.oUp + p.oMid + p.oDown >= 2 && p.oDown >= p.oUp + 1)
    .sort((a, b) => b[1].oDown - a[1].oDown || a[1].oUp - b[1].oUp);
  const worthOdd = [...per.entries()].filter(([id, p]) => {
    const w = qs.get(id)?.worth;
    return (w === 3 && p.oDown > p.oUp) || (w === 1 && p.oUp >= 2);
  });
  const prankList = [...byGame.entries()].filter(([k]) => prank.has(k)).map(([, g]) => g);
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
  console.log(`[feedback] 평가 ${rows.length}행 · 👍 ${rows.length - downs - mids} · 😐 ${mids} · 👎 ${downs} · 그중 공개 중 ${reveals} · 사람 ${people} · 문제 ${per.size}`);
  console.log('\n사유별 합계(👎 에 붙은 것)');
  for (const c of ORDER) console.log(`  ${String(reasonTotal[c]).padStart(5)}  ${labelOf(c)}`);
  console.log(`\n👎 많은 문제 ${top.length}`);
  console.log('  👎(공개) 😐(공개) 👍(공개) 찬종 id      난이도 분야        질문');
  const n3 = (n, r) => `${n}(${r})`.padStart(7);
  for (const [id, p] of top) {
    const q = qs.get(id);
    console.log(`  ${n3(p.down, p.downR)} ${n3(p.mid, p.midR)} ${n3(p.up, p.upR)} ${(p.cj.join('') || '—').padEnd(4)} ${id.padEnd(7)} ${String(q?.difficulty ?? '?').padEnd(6)} ${short(q?.cat ?? '?', 8).padEnd(10)} ${short(q?.question_text ?? '?', 40)}`);
    if (Object.keys(p.reasons).length) console.log(`              └ ${reasonsText(p.reasons)}`);
  }
  console.log(`\n검토 후보 ${review.length} — 찬종 표 없음 · 남의 표 ≥ 2 · 👎 ≥ 👍 + 1 (장난 의심 판 ${prankList.length} 뺌)`);
  for (const [id, p] of review) console.log(`  #${id} · 👎 ${p.oDown} · 😐 ${p.oMid} · 👍 ${p.oUp} · ${short(qs.get(id)?.question_text ?? '?', 44)}`);
  if (prankList.length) console.log(`  장난 의심(한 판 전부 같은 버튼): ${prankList.map((g) => `${g.nick} 판#${g.game} ${g.n}표`).join(' · ')}`);
  console.log(`알가치와 어긋남 ${worthOdd.length} — worth 3 인데 👎 > 👍 · worth 1 인데 👍 ≥ 2${worthOdd.length ? '' : ' (worth 가 아직 비어 있으면 0)'}`);
  for (const [id, p] of worthOdd) console.log(`  #${id} · worth ${qs.get(id)?.worth} · 👎 ${p.oDown} · 👍 ${p.oUp} · ${short(qs.get(id)?.question_text ?? '?', 44)}`);
  const comments = [...per.entries()].flatMap(([id, p]) => p.comments.map((c) => ({ id, ...c }))).sort((a, b) => b.at - a.at);
  console.log(`\n의견 ${comments.length}`);
  const mark = (amt) => (amt ? ` ✔ 채택 +${amt}P` : '');
  for (const c of comments) console.log(`  #${c.id} · f#${c.fid} · ${c.nick} · ${kst(c.at)} — ${c.text}${mark(c.adopted)}`);
  // ★ R059 — 👎 설문 하나하나(채택용 번호) · 채택 합계(월별 · 사람별)
  const downRows = rows.filter((r) => r.vote === -1).sort((a, b) => b.updated_at - a.updated_at);
  const adoptedSum = (
    await db.query(
      `SELECT to_char(g.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month, a.nickname, a.login_id, count(*)::int AS n, sum(g.amount)::int AS points
         FROM point_grants g JOIN accounts a ON a.id = g.account_id
        WHERE g.reason = 'feedback_adopted'${NO_BOTS ? " AND a.login_id !~ '^(bot|uic|r10_)'" : ''}
        GROUP BY 1, 2, 3 ORDER BY 1 DESC, 4 DESC, 5 DESC`,
    )
  ).rows;
  console.log(`\n👎 설문 ${downRows.length} — 채택: npm run feedback:adopt -- --id <f#> --yes`);
  for (const r of downRows.slice(0, 30)) console.log(`  f#${r.fid} · #${r.question_id} · ${r.nickname} · ${r.reasons.map(labelOf).join(' · ')}${r.comment ? ` · "${short(r.comment, 40)}"` : ''}${mark(r.adopted_at ? r.adopted_amount : null)}`);
  console.log(`\n채택된 제보 사람별 합계 ${adoptedSum.length}`);
  for (const x of adoptedSum) console.log(`  ${x.month} · ${x.nickname} — ${x.n}건 · ${x.points}P`);

  // ── 파일
  const md = [
    `# ${head}`,
    '',
    `- 평가 ${rows.length}행 · 👍 ${rows.length - downs - mids} · 😐 ${mids} · 👎 ${downs} · 그중 정답 공개 중 ${reveals} · 평가한 사람 ${people} · 문제 ${per.size}`,
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
    '| 👎(공개) | 😐(공개) | 👍(공개) | 찬종 | id | 활성 | 난이도 | 분야 | 질문 | 정답 | 사유 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...top.map(([id, p]) => {
      const q = qs.get(id);
      const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      return `| ${p.down}(${p.downR}) | ${p.mid}(${p.midR}) | ${p.up}(${p.upR}) | ${p.cj.join('') || '—'} | ${id} | ${q?.is_active ? '✓' : '—'} | ${q?.difficulty ?? ''} | ${cell(q?.cat)} | ${cell(short(q?.question_text ?? '', 60))} | ${cell(q?.display_answer)} | ${cell(reasonsText(p.reasons))} |`;
    }),
    '',
    `## 검토 후보 ${review.length} — 찬종 표 없음 · 남의 표 ≥ 2 · 👎 ≥ 👍 + 1 (자동 반영 없음 — 설계가 찬종에게)`,
    '',
    `- 장난 의심(한 계정이 한 판 3문제 이상 전부 같은 버튼 — 그 판 표는 셈에서 뺌): ${prankList.map((g) => `${g.nick} 판#${g.game} ${g.n}표`).join(' · ') || '없음'}`,
    '',
    '| id | 👎 | 😐 | 👍 | 질문 | 정답 |',
    '|---|---|---|---|---|---|',
    ...review.map(([id, p]) => `| ${id} | ${p.oDown} | ${p.oMid} | ${p.oUp} | ${String(short(qs.get(id)?.question_text ?? '', 60)).replace(/\|/g, '\\|')} | ${String(qs.get(id)?.display_answer ?? '').replace(/\|/g, '\\|')} |`),
    '',
    `## 알가치와 어긋남 ${worthOdd.length} — worth 3 인데 👎 > 👍 · worth 1 인데 👍 ≥ 2`,
    '',
    ...worthOdd.map(([id, p]) => `- #${id} · worth ${qs.get(id)?.worth} · 👎 ${p.oDown} · 👍 ${p.oUp}`),
    '',
    `## 의견 ${comments.length}`,
    '',
    ...comments.map((c) => `- #${c.id} · f#${c.fid} · ${c.nick} · ${kst(c.at)} — ${c.text.replace(/\n/g, ' ')}${mark(c.adopted)}`),
    '',
    `## 👎 설문 하나하나 ${downRows.length} — 채택: \`npm run feedback:adopt -- --id <f#> --yes\``,
    '',
    '| f# | 문제 | 누가 | 언제 | 사유 | 의견 | 채택 |',
    '|---|---|---|---|---|---|---|',
    ...downRows.map((r) => {
      const cell = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      return `| ${r.fid} | #${r.question_id} ${cell(short(qs.get(r.question_id)?.question_text ?? '', 30))} | ${cell(r.nickname)} | ${kst(r.updated_at)} | ${r.reasons.map(labelOf).join(' · ')} | ${cell(r.comment)} | ${r.adopted_at ? `✔ +${r.adopted_amount}P` : ''} |`;
    }),
    '',
    `## 채택된 제보 사람별 합계(월별) ${adoptedSum.length}`,
    '',
    '| 달 | 누가 | 건 | 포인트 |',
    '|---|---|---|---|',
    ...adoptedSum.map((x) => `| ${x.month} | ${x.nickname} | ${x.n} | ${x.points} |`),
    '',
  ].join('\n');
  mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  const out = path.join(ROOT, 'tmp', 'feedback-report.md');
  writeFileSync(out, md);
  console.log(`\n[feedback] → ${path.relative(ROOT, out)}`);
} finally {
  await db.end();
}
