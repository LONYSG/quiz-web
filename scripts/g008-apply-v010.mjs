#!/usr/bin/env node
// =============================================================================
// G008 A — V010 blind 재채점을 기존 활성 상 608 행에 반영 (CV-18 (a) 설계 판단)
//
//   입력  data/pipeline/audit/v010-results.json  targets.ids(608 고정) · items[id] — current.dif · dif · easiestCue · difWhy
//   쓰는 칸  difficulty_score · difficulty(하 1~2 easy · 중 3 medium · 상 4~5 hard — 01 4장) · score_version · scored_at · difficulty_why
//   출력  data/pipeline/audit/g008-v010-apply.json  (id · before · after) — 되돌리기는 before 로
//
// ★ 안전장치: 기본은 확인만(--apply 로 쓴다) · 한 트랜잭션 · 608 id 가 targets 와 같은가 · 활성인가 ·
//   DB 의 difficulty_score 가 V010 current.dif 와 같은 행만(다르면 건너뛰고 목록) · 이미 after 와 같으면 건너뜀(멱등)
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const APPLY = process.argv.includes('--apply');
const V = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/v010-results.json'), 'utf8'));
const VERSION = 'score-v3-blind';
const label = (d) => (d <= 2 ? 'easy' : d === 3 ? 'medium' : 'hard');

const ids = V.targets.ids.map(Number);
const items = new Map(Object.values(V.items).map((x) => [Number(x.id), x]));
if (ids.length !== 608 || items.size !== 608 || ids.some((i) => !items.has(i))) { console.error('★ targets 와 items 가 맞지 않는다'); process.exit(1); }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
try {
  const { rows } = await c.query('select id, is_active, difficulty_score, difficulty, score_version, scored_at, difficulty_why from questions where id = any($1::bigint[])', [ids]);
  const db = new Map(rows.map((r) => [Number(r.id), r]));
  const todo = []; const skipped = []; let done = 0; const out = [];
  for (const id of ids) {
    const x = items.get(id); const d = db.get(id);
    if (!d || !d.is_active) { skipped.push(`${id}: 활성 아님`); continue; }
    const after = { difficulty_score: x.dif, difficulty: label(x.dif), score_version: VERSION, difficulty_why: `V010 blind: ${x.difWhy} (가장 쉬운 단서: ${x.easiestCue})` };
    out.push({ id, before: { difficulty_score: d.difficulty_score, difficulty: d.difficulty, score_version: d.score_version, scored_at: d.scored_at, difficulty_why: d.difficulty_why }, after });
    if (d.difficulty_score === after.difficulty_score && d.score_version === VERSION && d.difficulty_why === after.difficulty_why && d.difficulty === after.difficulty) { done++; continue; }
    if (d.difficulty_score !== x.current.dif && d.score_version !== VERSION) { skipped.push(`${id}: DB ${d.difficulty_score} ≠ V010 current ${x.current.dif} — 건너뜀`); continue; }
    todo.push({ id, ...after, beforeDif: d.difficulty_score });
  }
  const changedDif = todo.filter((t) => t.beforeDif !== t.difficulty_score).length;
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g008-v010-apply.json'), JSON.stringify({ round: 'G008', note: 'V010 blind 반영 — 기존 활성 상 608 (CV-18 a). 되돌리기는 rows[].before', version: VERSION, rows: out, skipped }, null, 1) + '\n');
  console.log(`[g008-a] 대상 608 · 할 일 ${todo.length}(난이도가 바뀌는 것 ${changedDif}) · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
  for (const s of skipped) console.log('  (건너뜀)', s);
  if (!APPLY) { console.log('[g008-a] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
  if (!todo.length) { console.log('[g008-a] 할 일 0'); process.exit(0); }
  await c.query('begin');
  let n = 0;
  for (const t of todo) n += (await c.query('update questions set difficulty_score=$2, difficulty=$3, score_version=$4, scored_at=now(), difficulty_why=$5 where id=$1 and is_active', [t.id, t.difficulty_score, t.difficulty, t.score_version, t.difficulty_why])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${todo.length} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[g008-a] 썼다 — ${n}행`);
} finally { await c.end(); }
