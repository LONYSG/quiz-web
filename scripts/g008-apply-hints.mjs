#!/usr/bin/env node
// =============================================================================
// G008 B — 기존 활성 힌트 2 (C69 ② — G007 적재로 새로 생긴 H12 쌍) · g006-apply-hints 꼴
//   입력  tmp/g008/b-in.json (지금 힌트 · 사유) · tmp/g008/b-out.json (GEN 이 hint-v5 로 새로 쓴 힌트)
//   출력  data/pipeline/audit/g008-fixes.json  rows (id · field · before · after · by · version · why · sources · note)
//   ★ 기본은 확인만(--apply) · 한 트랜잭션 · DB 값 = before 일 때만 · after 와 같으면 건너뜀(멱등) · 파일 단계 검사 · general_hint · general_hint_version 만
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const APPLY = process.argv.includes('--apply');
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const IN = new Map(J('tmp/g008/b-in.json').map((x) => [x.id, x]));
const rows = J('tmp/g008/b-out.json').map((o) => {
  const it = IN.get(o.id);
  return { id: o.id, field: 'general_hint', before: it.currentHint, after: o.hint, by: 'gen', version: 'hint-v5', why: `C69 ② — ${it.whyRewrite} → GEN 이 새로 씀: ${o.why}`, sources: o.hintSources ?? [], note: o.hintNote ?? null };
});
const pre = [];
for (const r of rows) {
  if (!r.after) pre.push(`${r.id}: 빈 힌트`);
  else { if (/[\r\n]/.test(r.after)) pre.push(`${r.id}: 줄바꿈`); if ([...r.after].length > 120) pre.push(`${r.id}: 120자 초과`); if ((r.after.match(/(?<!(?:^|\s)[A-Z])[.!?](\s|$)/g) ?? []).length > 1) pre.push(`${r.id}: 두 문장`); }
}
if (pre.length) { for (const p of pre) console.error('★', p); process.exit(1); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
try {
  const { rows: db } = await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.is_active,
    coalesce((select array_agg(answer_text) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants from questions q where q.id = any($1::bigint[])`, [rows.map((r) => r.id)]);
  const D = new Map(db.map((r) => [Number(r.id), r]));
  const todo = []; const problems = []; let done = 0;
  for (const r of rows) {
    const d = D.get(r.id);
    if (!d?.is_active) { problems.push(`${r.id}: 활성 아님`); continue; }
    if (d.general_hint === r.after) { done++; continue; }
    if (d.general_hint !== r.before) { problems.push(`${r.id}: DB 값이 before 와 다름`); continue; }
    const k = checkHint({ hint: r.after, answer: d.display_answer, variants: d.variants, question: d.question_text, explanation: d.explanation ?? '' });
    if (k.block.length) problems.push(`${r.id}: checkHint 막힘 ${JSON.stringify(k.block)}`);
    if (k.warn.length) console.log(`  (경고) ${r.id}: ${JSON.stringify(k.warn)}`);
    todo.push(r);
  }
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g008-fixes.json'), JSON.stringify({ round: 'G008', note: 'C69 ② 기존 활성 힌트 2 — 되돌리기는 rows[].before', rows }, null, 1) + '\n');
  console.log(`[g008-b] 행 ${rows.length} · 할 일 ${todo.length} · 이미 됨 ${done}`);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY || !todo.length) { console.log(APPLY ? '[g008-b] 할 일 0' : '[g008-b] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
  await c.query('begin');
  let n = 0;
  for (const r of todo) n += (await c.query('update questions set general_hint=$2, general_hint_version=$3 where id=$1 and is_active and general_hint=$4', [r.id, r.after, r.version, r.before])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${todo.length} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[g008-b] 썼다 — ${n}행`);
} finally { await c.end(); }
