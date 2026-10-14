#!/usr/bin/env node
// =============================================================================
// G004 C — 기존 활성 힌트 고침 (V007 (나) G002 표본 fix 7 · (다) 같은 정답 쌍 fix 26 · 꼴 힌트 · 목록 밖 참고)
//
//   입력
//     data/pipeline/audit/v007-results.json   g002Sample · pairs29 — before(V007 이 판정한 DB 값) · proposal.hint
//     tmp/g004/out-c.jsonl                    GEN 웹 확인 (confirmed / rewritten / hold)
//     tmp/g004/gen-own.json                   GEN 이 직접 쓴 것 (꼴 22 · #2188 · #3679 · #3942 · #3706)
//     tmp/g004/db-targets.json                 V007 뒤 · G004 전의 DB 값 사본 (gen-own 의 before)
//   출력
//     data/pipeline/audit/g004-fixes.json      rows.db (id · field · before · after · by · 사유 · 출처 · version) — 되돌리기는 before 로
//
// ★ 안전장치 (G002 g002-apply-v006 과 같다)
//   · 기본은 확인만 (--apply 로 쓴다). 한 트랜잭션. DB 값이 before 와 같을 때만 · after 와 같으면 건너뜀(멱등) · 둘 다 아니면 건너뛰고 보고
//   · 파일 단계에서 줄바꿈 · 120자 · 두 문장 · checkHint 막힘(DB 의 질문·정답·변형·해설로)을 막는다
//   · H12 — 같은 정답 활성 문항의 질문·해설과 한글 4글자 구절을 나누면 경고(사람이 본다)
//   · 쓴 뒤 3~5 힌트 빈 칸이 0 이 아니면 되돌린다
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const APPLY = process.argv.includes('--apply');
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const L = (p) => existsSync(path.join(ROOT, p)) ? readFileSync(path.join(ROOT, p), 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x)) : [];
const V7 = J('data/pipeline/audit/v007-results.json');
const OUT = new Map(L('tmp/g004/out-c.jsonl').map((o) => [String(o.key), o]));
const OWN = J('tmp/g004/gen-own.json').db;
const SNAP = J('tmp/g004/db-targets.json');

const rows = []; const notTaken = [];
for (const x of [...Object.values(V7.g002Sample), ...Object.values(V7.pairs29)]) {
  if (x.verdict !== 'fix') continue;
  const before = x.set === 'n' ? x.after : x.hint;
  const o = OUT.get(String(x.id));
  if (!o) { console.error(`★ ${x.id}: GEN 웹 확인 결과 없음`); process.exit(1); }
  if (o.status === 'hold') { notTaken.push({ id: x.id, why: `GEN 웹 확인 hold — ${o.why}` }); continue; }
  const after = o.hint ?? x.proposal.hint; const by = o.status === 'rewritten' && after !== x.proposal.hint ? 'gen' : 'verify';
  rows.push({ id: x.id, field: 'general_hint', before, after, by, version: by === 'gen' ? 'hint-v4+g004' : 'hint-v3+v007',
    why: `V007 (${x.set === 'n' ? '나 G002 표본' : '다 같은 정답 쌍'}) ${x.categories.join(',')} — ${by === 'gen' ? 'GEN 다시 씀: ' + o.why : '제안 그대로(GEN 웹 확인 ' + o.status + ')'}`,
    sources: [...new Set((o.facts ?? []).map((f) => f.url).filter(Boolean))] });
}
for (const [id, g] of Object.entries(OWN)) {
  if (rows.some((r) => String(r.id) === id)) { console.error(`★ ${id}: 두 곳에서 고친다`); process.exit(1); }
  const before = SNAP[id][g.field === 'general_hint' ? 'general_hint' : 'question_text'];
  rows.push({ id: Number(id), field: g.field, before, after: g.after, by: 'gen', version: g.field === 'general_hint' ? 'hint-v4+g004' : null, why: `${g.kind} — ${g.why}`, sources: g.sources ?? [] });
}
// 파일 단계 막기
const pre = [];
for (const r of rows) if (r.field === 'general_hint') {
  if (/[\r\n]/.test(r.after)) pre.push(`${r.id}: 줄바꿈`);
  if ([...r.after].length > 120) pre.push(`${r.id}: 120자 초과`);
  if ((r.after.match(/[.!?](\s|$)/g) ?? []).length > 1) pre.push(`${r.id}: 두 문장`);
}
if (pre.length) { for (const p of pre) console.error('★', p); process.exit(1); }

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const { rows: dbRows } = await client.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.is_active,
      (select answer_norm from question_answers a where a.question_id = q.id and a.is_primary limit 1) norm,
      coalesce((select array_agg(answer_text) from question_answers x where x.question_id = q.id and not x.is_primary), '{}') variants
      from questions q where q.id = any($1::bigint[])`, [rows.map((r) => r.id)]);
  const db = new Map(dbRows.map((r) => [Number(r.id), r]));
  const g4 = (s) => { const t = (s ?? '').replace(/[^가-힣0-9]/g, ''); const o = new Set(); for (let i = 0; i + 4 <= t.length; i++) o.add(t.slice(i, i + 4)); return o; };
  const problems = [], warns = [], skipped = [], todo = []; let done = 0;
  for (const r of rows) {
    const d = db.get(r.id); if (!d) { problems.push(`${r.id}: DB 에 없음`); continue; }
    const col = r.field === 'general_hint' ? 'general_hint' : 'question_text';
    if (d[col] === r.after) { done++; continue; }
    if (d[col] !== r.before) { skipped.push(`${r.id}: DB 값이 before 와 다름 — 건너뜀`); continue; }
    if (r.field === 'general_hint') {
      const c = checkHint({ hint: r.after, answer: d.display_answer, variants: d.variants, question: d.question_text, explanation: d.explanation ?? '' });
      if (c.block.length) problems.push(`${r.id}: checkHint 막힘 ${JSON.stringify(c.block)}`);
      if (c.warn.length) warns.push(`${r.id}: 경고 ${JSON.stringify(c.warn)}`);
      const { rows: same } = await client.query(`select q.id, q.question_text, q.explanation from questions q join question_answers a on a.question_id=q.id and a.is_primary where q.is_active and a.answer_norm=$1 and q.id<>$2`, [d.norm, r.id]);
      const hg = g4(r.after);
      for (const s of same) { const sh = [...g4(`${s.question_text} ${s.explanation ?? ''}`)].filter((x) => hg.has(x)); if (sh.length) warns.push(`${r.id}: H12 — #${s.id} 과 구절 ${sh.slice(0, 3).join('·')}`); }
    }
    todo.push(r);
  }
  const fx = path.join(ROOT, 'data/pipeline/audit/g004-fixes.json');
  const prev = existsSync(fx) ? JSON.parse(readFileSync(fx, 'utf8')) : { round: 'G004', rows: { g003: [], db: [] } };
  prev.rows.db = rows; prev.notTakenDb = notTaken;
  writeFileSync(fx, JSON.stringify(prev, null, 1) + '\n');
  console.log(`[g004-c] 행 ${rows.length} (힌트 ${rows.filter((r) => r.field === 'general_hint').length} · 질문 ${rows.filter((r) => r.field !== 'general_hint').length}) · 받지 않음 ${notTaken.length} · 할 일 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
  for (const s of skipped) console.log('  (건너뜀)', s);
  for (const w of warns) console.log('  (경고)', w);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY) { console.log('[g004-c] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
  if (!todo.length) { console.log('[g004-c] 할 일 0'); process.exit(0); }
  await client.query('begin');
  let n = 0;
  for (const r of todo) {
    if (r.field === 'general_hint') n += (await client.query(`update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and general_hint is not distinct from $4`, [r.id, r.after, r.version, r.before])).rowCount;
    else n += (await client.query(`update questions set question_text=$2, updated_at=now() where id=$1 and question_text=$3`, [r.id, r.after, r.before])).rowCount;
  }
  const { rows: [{ e }] } = await client.query(`select count(*)::int e from questions where is_active and difficulty_score>=3 and (general_hint is null or general_hint='')`);
  if (n !== todo.length || e !== 0) { await client.query('rollback'); console.error(`★ 쓴 수 ${n}/${todo.length} · 3~5 빈 칸 ${e} — 되돌렸다`); process.exit(1); }
  await client.query('commit');
  console.log(`[g004-c] 썼다 — ${n}행 · 3~5 힌트 빈 칸 ${e}`);
} finally { await client.end(); }
