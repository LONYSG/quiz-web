#!/usr/bin/env node
// =============================================================================
// G064 — 말투 첫 적용: data/pipeline/tone/g064-apply.json → DB(멱등 · 한 트랜잭션 · 열린 판 0 · 되돌리기 json)
//   칸: question_text · general_hint(kind rewrite 면 general_hint_version='hint-v7') · explanation · 변형 add/remove · 비활성 3
//   ★ 쓰기: 지금 값이 before 와 같을 때만(after 와 같으면 이미 됨 · 다르면 멈춤 — 하나라도 다르면 아무것도 안 쓴다)
//   ★ DB = DATABASE_URL · --db quizweb_dev 로 이름만 바꿈 · 되돌리기 audit/g064-undo-<db>.json
//   사용 node scripts/g064-apply.mjs [--db quizweb_dev [--skip-diff]] [--apply | --undo]   (기본 = 확인만 · --skip-diff = before 와 다른 칸만 건너뜀)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { ROOT, guardNoOpenGames } from './g023-common.mjs';

const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const db = url.pathname.slice(1);
const TAG = 'G064';
const plan = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/tone/g064-apply.json'), 'utf8'));
const UNDO = path.join(ROOT, `data/pipeline/audit/g064-undo-${db}.json`);
const COLS = ['question_text', 'general_hint', 'explanation'];

const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
console.log(`[${TAG}] DB ${db} · ${mode}`);

async function undo() {
  const u = JSON.parse(readFileSync(UNDO, 'utf8'));
  await guardNoOpenGames(c, `${TAG} undo`);
  await c.query('begin'); let n = 0;
  for (const r of [...u.rows].reverse()) {
    if (r.field === 'variant') n += r.after != null
      ? (await c.query('delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary', [r.id, r.after])).rowCount
      : (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [r.id, r.before, normalizeAnswer(r.before), r.beforeNote])).rowCount;
    else if (r.field === 'state') n += (await c.query('update questions set is_active=$2, inactive_reason=$3 where id=$1', [r.id, r.before.is_active, r.before.inactive_reason])).rowCount;
    else if (r.field === 'general_hint') n += (await c.query('update questions set general_hint=$2, general_hint_version=$3 where id=$1 and general_hint is not distinct from $4', [r.id, r.before, r.beforeVersion, r.after])).rowCount;
    else n += (await c.query(`update questions set ${r.field}=$2 where id=$1 and ${r.field} is not distinct from $3`, [r.id, r.before, r.after])).rowCount;
  }
  if (n !== u.rows.length) { await c.query('rollback'); console.error(`★ 되돌린 수 ${n}/${u.rows.length} — 취소`); process.exitCode = 1; return; }
  await c.query('commit'); console.log(`[${TAG} undo] ${n} 행`);
}

async function apply() {
  const ids = [...plan.items.map((x) => x.id), ...plan.deactivate.map((x) => x.id)];
  const cur = new Map((await c.query(`select q.id::int, q.is_active, q.inactive_reason, q.question_text, q.general_hint, q.general_hint_version, q.explanation,
    coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
    from questions q where q.id = any($1::bigint[])`, [ids])).rows.map((r) => [r.id, r]));
  const todo = []; const diff = []; let done = 0; const cnt = {};
  const k = (x) => { cnt[x] = (cnt[x] ?? 0) + 1; };
  for (const it of plan.items) {
    const r = cur.get(it.id);
    if (!r) { diff.push(`${it.id}: 없음`); continue; }
    if (!r.is_active) { diff.push(`${it.id}: 비활성`); continue; }
    for (const col of COLS) {
      const f = it[col]; if (!f) continue;
      if (r[col] === f.after) { done++; continue; }
      if (r[col] !== f.before) { diff.push(`${it.id} ${col}: 지금 값이 before 와 다름\n    DB : ${r[col]}\n    bef: ${f.before}`); continue; }
      todo.push({ id: it.id, field: col, before: f.before, after: f.after, kind: f.kind, beforeVersion: r.general_hint_version }); k(`${col}:${f.kind}`);
    }
    for (const v of it.remove ?? []) { if (r.variants.includes(v)) { todo.push({ id: it.id, field: 'variant', before: v, after: null }); k('varRemove'); } else done++; }
    for (const v of it.add ?? []) { if (!r.variants.some((x) => normalizeAnswer(x) === normalizeAnswer(v))) { todo.push({ id: it.id, field: 'variant', before: null, after: v }); k('varAdd'); } else done++; }
  }
  for (const x of plan.deactivate) {
    const r = cur.get(x.id);
    if (!r.is_active) { done++; continue; }
    todo.push({ id: x.id, field: 'state', before: { is_active: true, inactive_reason: r.inactive_reason }, after: { is_active: false, inactive_reason: x.deactivate } }); k('deactivate');
  }
  console.log(`[${TAG}] 문항 ${plan.items.length} · 쓸 칸 ${todo.length} · 이미 됨 ${done} · 다름 ${diff.length} · ${JSON.stringify(cnt)}`);
  if (diff.length && a.includes('--skip-diff')) {
    // dev 처럼 실과 갈라진 DB — 한 칸이라도 다른 문항은 통째로 건너뛴다(새 질문 + 옛 힌트처럼 섞여 겹침이 생기지 않게) · 목록만 남긴다
    const bad = new Set(diff.map((d) => Number(d.split(/[ :]/)[0])));
    const before = todo.length;
    for (let i = todo.length - 1; i >= 0; i--) if (bad.has(todo[i].id) && todo[i].field !== 'state') todo.splice(i, 1);
    writeFileSync(path.join(ROOT, `data/pipeline/audit/g064-skipped-${db}.json`), JSON.stringify({ items: [...bad].sort((x, y) => x - y), diff }, null, 1) + '\n');
    console.log(`[${TAG}] before 와 다른 칸 ${diff.length} → 문항 ${bad.size} 통째로 건너뜀(쓸 칸 ${before} → ${todo.length}) → audit/g064-skipped-${db}.json`);
  } else if (diff.length) { for (const d of diff) console.error('★', d); console.error(`[${TAG}] ★ before 와 다른 것이 있어 멈춘다`); process.exitCode = 2; return; }
  if (mode !== 'apply' || !todo.length) { console.log(mode === 'apply' ? `[${TAG}] 쓸 것 없음` : `[${TAG}] 확인만 — 쓰려면 --apply`); return; }
  const at = await guardNoOpenGames(c, TAG);
  await c.query('begin'); let n = 0;
  for (const t of todo) {
    if (t.field === 'general_hint') {
      n += (await c.query(`update questions set general_hint=$2, general_hint_version=case when $4 then 'hint-v7' else general_hint_version end, updated_at=now() where id=$1 and general_hint is not distinct from $3`, [t.id, t.after, t.before, t.kind === 'rewrite'])).rowCount;
    } else if (t.field === 'variant' && t.after) {
      n += (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [t.id, t.after, normalizeAnswer(t.after), 'G064 재구성 변형 추가'])).rowCount;
    } else if (t.field === 'variant') {
      const r = await c.query('delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary returning note', [t.id, t.before]);
      n += r.rowCount; t.beforeNote = r.rows[0]?.note ?? null;
    } else if (t.field === 'state') {
      n += (await c.query('update questions set is_active=false, inactive_reason=$2, updated_at=now() where id=$1 and is_active', [t.id, t.after.inactive_reason])).rowCount;
    } else {
      n += (await c.query(`update questions set ${t.field}=$2, updated_at=now() where id=$1 and ${t.field} is not distinct from $3`, [t.id, t.after, t.before])).rowCount;
    }
  }
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${todo.length} — 되돌렸다`); process.exitCode = 1; return; }
  await c.query('commit');
  const u = existsSync(UNDO) ? JSON.parse(readFileSync(UNDO, 'utf8')) : { round: TAG, db, rows: [] };
  u.at = at; u.rows.push(...todo);
  writeFileSync(UNDO, JSON.stringify(u, null, 1) + '\n');
  console.log(`[${TAG}] 썼다 ${n} 칸 · ${at} · 되돌리기 ${path.basename(UNDO)}`);
}

try { if (mode === 'undo') await undo(); else await apply(); } finally { await c.end().catch(() => {}); }
