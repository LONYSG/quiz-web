#!/usr/bin/env node
// =============================================================================
// G119 — "질문이 바뀌었는데 등급 · 알가치를 다시 안 본 카드" 막기(찬종 2026-11-28 "문장이 바뀌면 등급도 그 자리에서 다시")
//   실 DB(quizweb) 활성 카드 중 ① 장부(data/pipeline/audit/grade-judged.json)에 없거나 ② 지금 질문 글의 해시가 장부와 다른 카드를 센다
//   인정 답 · 힌트 · 해설만 바뀐 것은 걸지 않는다(질문 글만) · 하나라도 있으면 목록을 보이고 exit 1 · DB 는 읽기만
//   ★ 장부 키는 실 DB id — dev 는 id 가 달라 이 검사를 하지 않는다
//   사용 node scripts/grade-fresh-check.mjs [--list]
// =============================================================================
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';
import { ledgerRead, qHash } from './grade-ledger.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const u = new URL(process.env.DATABASE_URL); u.pathname = '/quizweb';
const c = new pg.Client({ connectionString: u.toString() });
await c.connect();
const rows = (await c.query('select id::int, question_text, display_answer from questions where is_active order by id')).rows;
await c.end();
const L = ledgerRead().items;
const missing = [], changed = [];
for (const r of rows) {
  const e = L[String(r.id)];
  if (!e) missing.push(r);
  else if (e.h !== qHash(r.question_text)) changed.push(r);
}
console.log(`[grade-fresh] 활성 ${rows.length} · 장부 ${Object.keys(L).length} · 장부에 없음 ${missing.length} · 질문 바뀜 ${changed.length}`);
const all = process.argv.includes('--list');
for (const [n, xs] of [['장부에 없음', missing], ['질문 바뀜(다시 매기지 않음)', changed]]) for (const r of xs.slice(0, all ? Infinity : 30)) console.log(`  ${n} #${r.id} ${r.display_answer}`);
process.exit(missing.length + changed.length ? 1 : 0);
