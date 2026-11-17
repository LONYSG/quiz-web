#!/usr/bin/env node
// =============================================================================
// G100 — 난이도 고치기(등급 4 · 5 → 웹 블라인드 등급 그대로 · 찬종 2026-11-17)
//   입력  web-desk/grade/_apply.json items[{id, from, web, to, why}]
//   쓰기  questions.difficulty_score ← to · difficulty(옛 3단계 1·2 easy / 3 medium / 4·5 hard — G023 과 같은 규칙) · difficulty_why ← "G100 웹 블라인드 web=<n> → <to> · <why>"
//   게이트(카드마다 · 걸리면 건너뛰고 목록): ① 지금 difficulty_score = from ② 활성 ③ to 1~5 · to ≠ from
//   ★ 멱등: 이미 to · band · why 면 "이미 됨" · 되돌리기 audit/g100-undo-<db>.json(처음 옛 값을 지킨다)
//   사용  node scripts/g100-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, guardNoOpenGames } from './g023-common.mjs';

const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const db = url.pathname.slice(1);
const UNDO = path.join(ROOT, `data/pipeline/audit/g100-undo-${db}.json`);
const PLAN = path.join(ROOT, 'data/pipeline/tone/g100-apply.json');
const SKIP = path.join(ROOT, `data/pipeline/audit/g100-skipped-${db}.json`);
const band = (s) => (s <= 2 ? 'easy' : s === 3 ? 'medium' : 'hard');
const src = JSON.parse(readFileSync(path.join(ROOT, 'web-desk/grade/_apply.json'), 'utf8'));
const why = (it) => `G100 웹 블라인드 web=${it.web} → ${it.to} · ${it.why}`;

const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
console.log(`[G100] DB ${db} · ${mode}`);
try {
  if (mode === 'undo') {
    const u = JSON.parse(readFileSync(UNDO, 'utf8')); await guardNoOpenGames(c, 'G100 undo');
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query('update questions set difficulty_score=$2, difficulty=$3, difficulty_why=$4, updated_at=now() where id=$1', [id, o.score, o.difficulty, o.why])).rowCount;
    if (n !== Object.keys(u.items).length) { await c.query('rollback'); console.error(`★ ${n}/${Object.keys(u.items).length} — 취소`); process.exit(1); }
    await c.query('commit'); console.log(`[G100 undo] ${n}행`); process.exit(0);
  }
  const ids = src.items.map((x) => x.id);
  const DB = new Map((await c.query('select id::int, is_active, difficulty_score, difficulty, difficulty_why from questions where id = any($1::bigint[])', [ids])).rows.map((r) => [r.id, r]));
  const todo = []; const skip = []; let done = 0; const move = {};
  for (const it of src.items) {
    const r = DB.get(it.id); const w = why(it);
    if (!r) { skip.push({ id: it.id, why: '없음' }); continue; }
    if (r.difficulty_score === it.to && r.difficulty === band(it.to) && r.difficulty_why === w) { done++; continue; }
    if (!(it.to >= 1 && it.to <= 5) || it.to === it.from) { skip.push({ id: it.id, why: `③ to=${it.to} from=${it.from}` }); continue; }
    if (!r.is_active) { skip.push({ id: it.id, why: '② 꺼짐' }); continue; }
    if (r.difficulty_score !== it.from) { skip.push({ id: it.id, why: `① 지금 ${r.difficulty_score} ≠ from ${it.from}` }); continue; }
    const k = `${it.from}→${it.to}`; move[k] = (move[k] ?? 0) + 1;
    todo.push({ id: it.id, before: { score: r.difficulty_score, difficulty: r.difficulty, why: r.difficulty_why }, after: { score: it.to, difficulty: band(it.to), why: w } });
  }
  const bandChange = todo.filter((t) => t.before.difficulty !== t.after.difficulty).length;
  console.log(`[G100] 대상 ${src.items.length} · 바꿀 것 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skip.length} · difficulty(3단계) 바뀜 ${bandChange}`);
  console.log(`  이동 ${JSON.stringify(move)}`);
  const why2 = {}; for (const s of skip) { const k = s.why.split(' ')[0]; why2[k] = (why2[k] ?? 0) + 1; }
  if (skip.length) console.log(`  건너뜀 까닭 ${JSON.stringify(why2)}`);
  if (db === 'quizweb' || !existsSync(PLAN)) writeFileSync(PLAN, JSON.stringify({ round: 'G100', rule: src.rule, db, builtAt: new Date().toISOString(), note: 'difficulty_why 에도 같은 근거를 적었다', items: src.items.map((it) => ({ id: it.id, from: it.from, web: it.web, to: it.to, why: why(it) })) }, null, 1) + '\n');
  writeFileSync(SKIP, JSON.stringify({ round: 'G100', db, n: skip.length, items: skip }, null, 1) + '\n');
  if (mode !== 'apply') { console.log('[G100] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'G100');
  const undo = existsSync(UNDO) ? JSON.parse(readFileSync(UNDO, 'utf8')) : { round: 'G100', db, note: '옛 값 — node scripts/g100-apply.mjs [--db quizweb_dev] --undo', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = t.before;
  undo.writtenAt = at; writeFileSync(UNDO, JSON.stringify(undo, null, 1) + '\n');
  await c.query('begin'); let n = 0;
  for (const t of todo) n += (await c.query('update questions set difficulty_score=$2, difficulty=$3, difficulty_why=$4, updated_at=now() where id=$1 and is_active and difficulty_score=$5', [t.id, t.after.score, t.after.difficulty, t.after.why, t.before.score])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${todo.length} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[G100] 썼다 ${n}행`);
} finally { await c.end(); }
