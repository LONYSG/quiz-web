#!/usr/bin/env node
// =============================================================================
// 활성 문항 전체의 일반 힌트에 hint-check 를 돌린다 — G002 (끝 점검 "hint-check 활성 전체 막힘 0")
//
//   막힘(block)이 하나라도 있으면 목록을 보이고 exit 1. 경고는 종류별 수만 (--list 로 single · letter-talk · blank · crossans 목록)
//   ★ G029: 경고 crossans — 힌트 속 다른 활성 문항의 대표 정답(H12 · scripts/hint-crossans.mjs)
//   ★ G037: crossans 오탐 쌍 명단 data/pipeline/audit/crossans-skip.json 을 hint-crossans.mjs 가 읽어 뺀다(SKIP · 뺀 수를 첫 줄에)
//   DB 는 읽기만 한다.
//
// 사용법
//   node scripts/hint-check-active.mjs
//   node scripts/hint-check-active.mjs --list
// =============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';
import { crossAnswers, SKIP } from './hint-crossans.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const LIST = process.argv.includes('--list');

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint,
      coalesce((select array_agg(answer_text) from question_answers x where x.question_id = q.id and not x.is_primary), '{}') variants
      from questions q where q.is_active and q.general_hint is not null order by q.id`);
  // ★ G029 — H12 crossans: 활성 문항 대표 정답(정규화) 목록 · 같은 정답 무리는 crossAnswers 가 뺀다
  const prim = (await client.query(`select a.question_id::text id, a.answer_norm norm, q.display_answer answer from question_answers a
      join questions q on q.id = a.question_id and q.is_active where a.is_primary`)).rows;
  const normOf = new Map(prim.map((p) => [p.id, p.norm]));
  const blocks = []; const kinds = {}; const listed = [];
  for (const r of rows) {
    const res = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation ?? '' });
    for (const x of crossAnswers({ id: r.id, hint: r.general_hint, answerNorm: normOf.get(String(r.id)) }, prim)) res.warn.push({ kind: 'crossans', frag: `#${x.id} ${x.answer}` });
    if (res.block.length) blocks.push(`#${r.id} ${r.display_answer} ${JSON.stringify(res.block)} | ${r.general_hint}`);
    for (const w of res.warn) {
      kinds[w.kind] = (kinds[w.kind] ?? 0) + 1;
      if (['single', 'letter-talk', 'blank'].includes(w.kind)) listed.push(`[${w.kind}] #${r.id} ${r.display_answer} | ${r.general_hint}`);
      if (w.kind === 'crossans') listed.push(`[crossans] #${r.id} ${r.display_answer} → ${w.frag} | ${r.general_hint}`);
    }
  }
  console.log(`[hint-check-active] 힌트 ${rows.length} · 막힘 ${blocks.length} · 경고 ${JSON.stringify(kinds)} · crossans 오탐 명단 ${SKIP.size}쌍`);
  if (LIST) for (const l of listed) console.log('  ', l);
  if (blocks.length) { for (const b of blocks) console.error('★', b); process.exit(1); }
} finally {
  await client.end();
}
