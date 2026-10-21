#!/usr/bin/env node
// =============================================================================
// ★★ 근접 오답 보고 (R058 · A83 (나) · D-252) — 읽기만
//
//   npm run answers:near                      ← 콘솔 요약 + tmp/answer-near-report.md(git 밖)
//   npm run answers:near -- --since 7         ← 최근 7일만 (날짜 2026-10-21 도 된다)
//   npm run answers:near -- --with-bots       ← 봇 · 검사 계정 행도(기본은 뺀다 — 서버도 안 남기지만 검사 서버가 덮어쓸 수 있다)
//
// ★ 표 near_misses(0022) — 정답에 가까운 틀린 제출만 · 정규화 글만 · 90일.
// ★ 읽는 사람: GEN(복수정답 변형 추가 후보). 같은 글이 여러 사람에게서 나오면 변형 누락일 가능성이 크다.
//   한 사람이 같은 판에서 여러 번 친 것은 "사람 수" 로 따로 센다.
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NEAR_MISS_SKIP_LOGIN } from '../shared/dist/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const sinceArg = opt('--since');
const withBots = args.includes('--with-bots');
let since = null;
if (sinceArg) {
  since = /^\d+$/.test(sinceArg) ? new Date(Date.now() - Number(sinceArg) * 86400000) : new Date(sinceArg);
  if (Number.isNaN(since.getTime())) {
    console.error(`--since 값을 읽지 못했다: ${sinceArg} (일수 또는 날짜)`);
    process.exit(1);
  }
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();

try {
  const rows = (
    await db.query(
      `SELECT n.question_id::text qid, n.normalized, n.nearest, n.distance, n.kind, n.account_id::text acc, n.created_at
         FROM near_misses n JOIN accounts a ON a.id = n.account_id
        WHERE ($1::timestamptz IS NULL OR n.created_at >= $1)
          AND ($2 OR a.login_id !~* $3)
        ORDER BY n.created_at`,
      [since, withBots, NEAR_MISS_SKIP_LOGIN],
    )
  ).rows;
  const byQ = new Map();
  for (const r of rows) {
    if (!byQ.has(r.qid)) byQ.set(r.qid, []);
    byQ.get(r.qid).push(r);
  }
  const qids = [...byQ.keys()];
  const info = new Map();
  if (qids.length > 0) {
    const qs = (
      await db.query(
        `SELECT q.id::text qid, q.question_text text, q.is_active,
                array_agg(a.answer_text ORDER BY a.is_primary DESC, a.id) answers
           FROM questions q JOIN question_answers a ON a.question_id = q.id
          WHERE q.id = ANY($1::bigint[]) GROUP BY q.id`,
        [qids],
      )
    ).rows;
    for (const q of qs) info.set(q.qid, q);
  }
  // 문항 순서 — 사람 수 많은 것 → 행 많은 것
  const summary = qids
    .map((qid) => {
      const list = byQ.get(qid);
      const people = new Set(list.map((r) => r.acc)).size;
      const texts = new Map();
      for (const r of list) {
        const t = texts.get(r.normalized) ?? { normalized: r.normalized, nearest: r.nearest, distance: r.distance, kind: r.kind, n: 0, people: new Set() };
        t.n += 1;
        t.people.add(r.acc);
        texts.set(r.normalized, t);
      }
      const examples = [...texts.values()].sort((a, b) => b.people.size - a.people.size || b.n - a.n || a.distance - b.distance);
      return { qid, rows: list.length, people, examples, q: info.get(qid) };
    })
    .sort((a, b) => b.people - a.people || b.rows - a.rows);

  const kinds = { contains: 0, contained: 0, edit: 0 };
  for (const r of rows) kinds[r.kind] += 1;
  const cut = (s, n = 60) => ([...s].length > n ? [...s].slice(0, n).join('') + '…' : s);
  const lines = [];
  lines.push('# 근접 오답 보고 (near_misses · R058 · D-252)');
  lines.push('');
  lines.push(`- 범위: ${since ? `${since.toISOString().slice(0, 10)} 부터` : '전체(보관 90일)'} · ${withBots ? '봇 · 검사 계정 포함' : '봇 · 검사 계정 뺌'}`);
  lines.push(`- 행 ${rows.length} · 문항 ${summary.length} · 포함 ${kinds.contains} · 포함됨 ${kinds.contained} · 거리 ${kinds.edit}`);
  lines.push('- ★ 읽는 법: "사람" 이 둘 이상인 글은 변형 누락 후보(GEN 이 정답 변형으로 넣을지 본다). 판정은 바꾸지 않는다 — 오타 허용 · 유사도 판정 없음(01 10장).');
  lines.push('');
  if (summary.length === 0) lines.push('(아직 행이 없다)');
  for (const s of summary) {
    const q = s.q;
    lines.push(`## 문항 ${s.qid} — 행 ${s.rows} · 사람 ${s.people}${q && !q.is_active ? ' · (비활성)' : ''}`);
    if (q) {
      lines.push(`- 질문: ${cut(q.text)}`);
      lines.push(`- 정답: ${q.answers.join(' · ')}`);
    }
    lines.push('');
    lines.push('| 제출(정규화) | 가까운 정답 | 거리 | 종류 | 행 | 사람 |');
    lines.push('|---|---|---|---|---|---|');
    for (const e of s.examples.slice(0, 10)) lines.push(`| ${e.normalized} | ${e.nearest} | ${e.distance} | ${e.kind} | ${e.n} | ${e.people.size} |`);
    if (s.examples.length > 10) lines.push(`| … ${s.examples.length - 10}개 더 | | | | | |`);
    lines.push('');
  }
  const out = path.join(ROOT, 'tmp', 'answer-near-report.md');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`[near] 행 ${rows.length} · 문항 ${summary.length} · 포함 ${kinds.contains} · 포함됨 ${kinds.contained} · 거리 ${kinds.edit}`);
  for (const s of summary.slice(0, 5)) console.log(`  문항 ${s.qid} — 사람 ${s.people} · 예 ${s.examples.slice(0, 3).map((e) => `${e.normalized}→${e.nearest}`).join(' · ')}`);
  console.log(`[near] → ${path.relative(ROOT, out)}`);
} finally {
  await db.end();
}
