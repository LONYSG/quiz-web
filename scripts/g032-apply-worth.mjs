#!/usr/bin/env node
// =============================================================================
// G032 D — pending 적재한 새 문항(source_ref '…#g032[ab]-…' · is_active false)의 questions.worth(1~3)를 쓴다 — g025-apply-worth.mjs 꼴
//   입력  data/pipeline/generated/g032a|g032b/*.json 의 question.score.worth (score-v4 · 격리 아닌 것만)
//   ★ 활성 행은 건드리지 않는다(WHERE is_active = false · source_ref 가 g032 꼴인 것만)
//   출력  audit/g032-undo-worth.json (id → 옛 값)
//   사용  node scripts/g032-apply-worth.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, connect, guardNoOpenGames, readJson, writeJson, exists, MODE } from './g023-common.mjs';

const UNDO = 'g032-undo-worth.json';
const DRY = process.argv.includes('--dry-run');
const want = new Map();
for (const r of ['g032a', 'g032b']) {
  const dir = path.join(ROOT, 'data/pipeline/generated', r);
  let names = []; try { names = readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { continue; }
  for (const n of names) for (const it of JSON.parse(readFileSync(path.join(dir, n), 'utf8')).items) if (!it.question.discarded && it.question.score?.worth) want.set(it.seedId, it.question.score.worth);
}
const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, 'g032 worth undo');
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query('update questions set worth=$2 where id=$1 and not is_active and worth is not distinct from $3', [id, o.before, o.after])).rowCount;
    if (DRY) { await c.query('rollback'); console.log(`[g032 worth undo] 확인만 — 옛 값으로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); }
    else { await c.query('commit'); console.log(`[g032 worth] 되돌렸다 ${n}`); }
  } else {
    const { rows } = await c.query(`select id, source_ref, worth, is_active from questions where source_ref ~ '#g032[ab]-'`);
    const todo = []; let done = 0; const active = []; const missing = [];
    for (const r of rows) {
      if (r.is_active) { active.push(r.id); continue; }
      const v = want.get(r.source_ref); if (!v) { missing.push(r.source_ref); continue; }
      if (r.worth === v) { done++; continue; }
      todo.push({ id: r.id, ref: r.source_ref, before: r.worth, after: v });
    }
    console.log(`[g032 worth] g032 행 ${rows.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 활성(건드리지 않음) ${active.length} · 파일에 없음 ${missing.length}`);
    if (MODE !== 'apply') console.log('[g032 worth] 확인만 — 쓰려면 --apply');
    else if (todo.length) {
      const at = await guardNoOpenGames(c, 'g032 worth');
      const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G032', note: 'pending 새 문항 worth 옛 값 — --undo', items: {} };
      for (const t of todo) undo.items[t.id] = { ref: t.ref, before: t.before, after: t.after };
      (undo.writes ??= []).push({ at, n: todo.length }); writeJson(UNDO, undo);
      await c.query('begin'); let n = 0;
      for (const t of todo) n += (await c.query('update questions set worth=$2 where id=$1 and not is_active and worth is not distinct from $3', [t.id, t.after, t.before])).rowCount;
      if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length} — 되돌림`); process.exit(1); }
      await c.query('commit'); console.log(`[g032 worth] 썼다 ${n} · ${at}`);
    }
  }
} finally { await c.end().catch(() => {}); }
