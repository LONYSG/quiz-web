#!/usr/bin/env node
// =============================================================================
// ★ 라이어 이의제기 인정 목록 (R091 · D-348 · 0036) — 읽기만
//
//   npm run liar:appeals                ← 실 DB(quizweb) · 인정된 이의제기만
//   npm run liar:appeals -- --all       ← 기각도 함께
//   DATABASE_URL=… npm run liar:appeals ← 다른 DB(quizweb_dev · quizweb_test)
//
// ★ 인정된 라이어의 답은 그 제시어의 **변형 후보** — GEN 이 나중에 topics 파일의 변형으로 넣는다(docs/16 §7 제보 흐름).
//   같은 (세트 · 제시어 · 답) 은 한 줄로 묶어 횟수 · 표 합을 센다. 답은 정규화(normalizeAnswer)해서 묶는다.
// =============================================================================
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';

const all = process.argv.includes('--all');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
try {
  const has = (await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'liar_rounds' AND column_name = 'appeal'`)).rowCount > 0;
  if (!has) {
    console.log('[liar:appeals] liar_rounds.appeal 칸이 없다 — 0036 전 DB(메뉴 1 로 적용)');
    process.exit(0);
  }
  const rows = (
    await db.query(
      `SELECT r.topic, coalesce(s.name_ko, r.topic) name_ko, r.item_id, r.keyword, r.appeal, r.created_at
         FROM liar_rounds r LEFT JOIN topic_sets s ON s.topic = r.topic
        WHERE r.appeal IS NOT NULL ${all ? '' : `AND (r.appeal->>'passed')::boolean`}
        ORDER BY r.created_at`,
    )
  ).rows;
  const groups = new Map();
  for (const r of rows) {
    const a = r.appeal ?? {};
    const k = `${r.topic}|${r.item_id}|${normalizeAnswer(String(a.guess ?? ''))}|${a.passed ? 1 : 0}`;
    const g = groups.get(k) ?? { set: r.name_ko, topic: r.topic, keyword: r.keyword, guess: String(a.guess ?? ''), passed: !!a.passed, n: 0, yes: 0, no: 0, last: r.created_at };
    g.n += 1;
    g.yes += Number(a.yes ?? 0);
    g.no += Number(a.no ?? 0);
    g.last = r.created_at;
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((x, y) => y.n - x.n || String(x.set).localeCompare(String(y.set), 'ko'));
  console.log(`[liar:appeals] ${all ? '이의제기 전부' : '인정된 이의제기'} ${rows.length}건 · 묶음 ${list.length}`);
  if (list.length) console.log('세트\t제시어\t라이어의 답\t결과\t횟수\t표(인정:기각)\t마지막');
  for (const g of list) console.log(`${g.set}(${g.topic})\t${g.keyword}\t${g.guess}\t${g.passed ? '인정' : '기각'}\t${g.n}\t${g.yes}:${g.no}\t${new Date(g.last).toISOString().slice(0, 10)}`);
} finally {
  await db.end();
}
