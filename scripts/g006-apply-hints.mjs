#!/usr/bin/env node
// =============================================================================
// G006 — V008 판정 반영: 기존 활성 힌트 고침 (g004-apply-hints 의 g006 판)
//
//   입력
//     tmp/g006/rows.json      V008 fix 241 행 (current = V008 이 본 DB 값 · proposal · sets (가)(나)(다)) — scripts/_g006-prep.mjs
//     tmp/g006/fact-out.json  GEN 이 제안 새 사실을 다시 연 결과 (confirmed / rewritten / hold)
//     tmp/g006/rw-out.json    GEN 이 새로 쓴 힌트 (받지 않은 제안 6 · 제안 없는 2 · 목록 밖 2)
//   출력
//     data/pipeline/audit/g006-fixes.json   rows (id · field · before · after · by · version · why · sources) · notTaken · held
//
// ★ 안전장치 (g004-apply-hints 와 같다)
//   · 기본은 확인만 (--apply 로 쓴다). 한 트랜잭션. DB 값이 before 와 같을 때만 · after 와 같으면 건너뜀(멱등) · 둘 다 아니면 건너뛰고 보고
//   · 파일 단계에서 줄바꿈 · 120자 · 두 문장 · checkHint 막힘(DB 의 질문·정답·변형·해설로)을 막는다
//   · general_hint · general_hint_version · updated_at 만 쓴다. 쓴 뒤 3~5 힌트 빈 칸이 0 이 아니면 되돌린다
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
const ROWS = J('tmp/g006/rows.json');
const FACT = new Map((existsSync(path.join(ROOT, 'tmp/g006/fact-out.json')) ? J('tmp/g006/fact-out.json') : []).map((o) => [o.id, o]));
const RW = new Map(J('tmp/g006/rw-out.json').map((o) => [o.id, o]));
const VERSION = 'hint-v5';

// ★ 받지 않은 제안 — 질문 없이 힌트만 읽어도 답이 나온다(H9 · hint-v5 순서 4) → GEN 이 새로 쓴다 (rw-out)
const NOT_TAKEN = {
  626: "'미국 추수감사절은 11월 넷째 주 이 요일' — 질문 없이도 목요일이 바로 나온다",
  728: "'리본의 기사'와 '불새' — 작가의 대표작 나열(질문의 '철완 아톰'과 같은 길)",
  2384: "'작가는 이후 아리랑과 한강으로 대하소설 3부작' — 질문의 조정래와 합치면 곧바로 답(대표작 연결)",
  3248: "'소설에서는 발자크와 플로베르가 대표 작가' — 사조의 대표 작가",
  3719: '불면증 부산 형사가 추락사한 남자의 아내를 수사 — 영화 제목 정답의 줄거리 요지',
  3814: "'붉은 빛깔은 라이코펜' — 토마토의 대표 성분",
};
// ★ GEN 이 제안을 조금 고쳐 받은 것 (새 사실 없음)
const TRIM = {
  2226: { after: '공작 빌헬름 4세가 공포한 것으로 알려져 있다.', why: "제안의 '바이에른' 이 같은 정답 #3533 질문('1516년 바이에른 공국의 규정')에 있다 — 그 낱말만 뺐다(H12 · hint-v5 순서 8)" },
};
// ★ V008 목록 밖 — GEN 이 찾은 것 (rw-out)
const GEN_OWN = {
  3898: "지금 힌트의 '3·1 운동에도 영향' 이 같은 정답 #1957 해설과 같은 사실(H12) — g006-pair-check 로 찾음",
  3990: '지금 힌트가 같은 정답 #2012 힌트 안의 문장과 같다(힌트↔힌트 같은 문장 — G004 방식으로 나중 번호를 바꿈)',
};

const rows = []; const notTaken = []; const held = [];
const genRow = (id, before, why) => {
  const o = RW.get(id); if (!o) { console.error(`★ ${id}: GEN 새 힌트(rw-out) 없음`); process.exit(1); }
  if (o.hint == null) { held.push({ id, why: `H8 — 새 두 번째 줄 사실을 문서로 찾지 못함: ${o.why} · 난이도 3 이라 H0 대로 지금 힌트를 둔다` }); return; }
  rows.push({ id, field: 'general_hint', before, after: o.hint, by: 'gen', version: VERSION, why, sources: o.hintSources ?? [], note: o.hintNote ?? null });
};
for (const r of ROWS) {
  const base = `V008 (${r.sets.join('')}) ${r.categories.join(',')}`;
  if (NOT_TAKEN[r.id]) { notTaken.push({ id: r.id, proposal: r.proposal, why: NOT_TAKEN[r.id] }); genRow(r.id, r.current, `${base} — 제안을 받지 않고(${NOT_TAKEN[r.id]}) GEN 이 새로 씀`); continue; }
  if (!r.proposal) { genRow(r.id, r.current, `${base} — 제안 없음 · GEN 이 새 사실로 씀`); continue; }
  if (TRIM[r.id]) { rows.push({ id: r.id, field: 'general_hint', before: r.current, after: TRIM[r.id].after, by: 'gen', version: VERSION, why: `${base} — 제안을 고쳐 받음: ${TRIM[r.id].why}`, sources: r.facts.map((f) => f.source).filter(Boolean) }); continue; }
  const f = FACT.get(r.id);
  if (f?.status === 'hold') { held.push({ id: r.id, why: `GEN 웹 확인 hold — ${f.why}` }); continue; }
  const after = f?.status === 'rewritten' && f.hint ? f.hint : r.proposal;
  const by = after !== r.proposal ? 'gen' : 'verify';
  rows.push({ id: r.id, field: 'general_hint', before: r.current, after, by, version: VERSION,
    why: `${base} — ${by === 'gen' ? 'GEN 이 사실을 다시 열어 고침: ' + f.why : `제안 그대로${f ? ` (GEN 웹 확인 ${f.status})` : ''}`}`,
    sources: [...new Set([...(f?.claims ?? []).map((c) => c.url), ...r.facts.map((x) => x.source)].filter(Boolean))] });
}
for (const [id, why] of Object.entries(GEN_OWN)) {
  if (rows.some((r) => String(r.id) === id)) { console.error(`★ ${id}: 두 곳에서 고친다`); process.exit(1); }
  genRow(Number(id), null, `GEN (목록 밖) — ${why}`);
}
// 파일 단계 막기
const pre = [];
for (const r of rows) {
  if (/[\r\n]/.test(r.after)) pre.push(`${r.id}: 줄바꿈`);
  if ([...r.after].length > 120) pre.push(`${r.id}: 120자 초과`);
  if ((r.after.match(/[.!?](\s|$)/g) ?? []).length > 1) pre.push(`${r.id}: 두 문장`);
}
if (pre.length) { for (const p of pre) console.error('★', p); process.exit(1); }

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const { rows: dbRows } = await client.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.is_active,
      coalesce((select array_agg(answer_text) from question_answers x where x.question_id = q.id and not x.is_primary), '{}') variants
      from questions q where q.id = any($1::bigint[])`, [rows.map((r) => r.id)]);
  const db = new Map(dbRows.map((r) => [Number(r.id), r]));
  const problems = [], warns = [], skipped = [], todo = []; let done = 0;
  for (const r of rows) {
    const d = db.get(r.id); if (!d || !d.is_active) { problems.push(`${r.id}: 활성 문항이 아님`); continue; }
    if (r.before == null) r.before = d.general_hint; // 목록 밖(GEN_OWN) — 지금 DB 값이 before
    if (d.general_hint === r.after) { done++; continue; }
    if (d.general_hint !== r.before) { skipped.push(`${r.id}: DB 값이 before 와 다름 — 건너뜀`); continue; }
    const c = checkHint({ hint: r.after, answer: d.display_answer, variants: d.variants, question: d.question_text, explanation: d.explanation ?? '' });
    if (c.block.length) problems.push(`${r.id}: checkHint 막힘 ${JSON.stringify(c.block)}`);
    if (c.warn.length) warns.push(`${r.id}: 경고 ${JSON.stringify(c.warn)}`);
    todo.push(r);
  }
  const fx = path.join(ROOT, 'data/pipeline/audit/g006-fixes.json');
  const cnt = (k) => rows.filter((r) => r.by === k).length;
  writeFileSync(fx, JSON.stringify({ round: 'G006', note: 'V008 판정 반영 — 기존 활성 힌트. 되돌리기는 rows[].before 로 (general_hint_version 은 반영 전 값을 따로 남기지 않았다 — V008 이 본 값은 v008-results.json)', version: VERSION,
    counts: { rows: rows.length, verify: cnt('verify'), gen: cnt('gen'), notTaken: notTaken.length, held: held.length }, rows, notTaken, held }, null, 1) + '\n');
  console.log(`[g006] 행 ${rows.length} (verify ${cnt('verify')} · gen ${cnt('gen')}) · 받지 않음 ${notTaken.length} · 보류 ${held.length} · 할 일 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
  for (const s of skipped) console.log('  (건너뜀)', s);
  for (const w of warns) console.log('  (경고)', w);
  for (const h of held) console.log('  (보류)', h.id, h.why);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY) { console.log('[g006] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
  if (!todo.length) { console.log('[g006] 할 일 0'); process.exit(0); }
  await client.query('begin');
  let n = 0;
  for (const r of todo) n += (await client.query(`update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and is_active and general_hint is not distinct from $4`, [r.id, r.after, r.version, r.before])).rowCount;
  const { rows: [{ e }] } = await client.query(`select count(*)::int e from questions where is_active and difficulty_score>=3 and (general_hint is null or general_hint='')`);
  if (n !== todo.length || e !== 0) { await client.query('rollback'); console.error(`★ 쓴 수 ${n}/${todo.length} · 3~5 빈 칸 ${e} — 되돌렸다`); process.exit(1); }
  await client.query('commit');
  console.log(`[g006] 썼다 — ${n}행 · 3~5 힌트 빈 칸 ${e}`);
} finally { await client.end(); }
