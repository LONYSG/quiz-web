#!/usr/bin/env node
// =============================================================================
// G023 G — 분야 오분류 적용: 판정자 suggest 가 L3 name_ko(같은 이름이 둘이면 부모 L2 도) 또는 key 와 정확히 맞는 것만(g023-plan 이 고름)
//   나머지는 audit/g023-category-pending.json · 3813 은 D 몫
//   출력  audit/g023-undo-category.json (id → 옛 category_id)
//   사용  node scripts/g023-apply-category.mjs [--dry-run | --apply | --undo]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, loadPlan, readJson, writeJson, exists, MODE } from './g023-common.mjs';

const UNDO = 'g023-undo-category.json';
const plan = loadPlan();
const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); await guardNoOpenGames(c, 'g023 G undo'); await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1 and category_id=$3', [id, o.before, o.after])).rowCount;
    await c.query('commit'); console.log(`[g023 G] 되돌렸다 ${n}`); process.exit(0);
  }
  const sel = Object.entries(plan.items).filter(([, it]) => it.category?.action === 'apply');
  const { rows } = await c.query('select id, category_id from questions where is_active and id = any($1::bigint[])', [sel.map(([id]) => id)]);
  const DB = new Map(rows.map((r) => [String(r.id), r.category_id]));
  const todo = []; let done = 0; const skipped = [];
  for (const [id, it] of sel) {
    const cur = DB.get(id);
    if (cur === it.category.to.id) { done++; continue; }
    if (cur !== it.category.before.id) { skipped.push(`${id} 지금 분야가 계획과 다름`); continue; }
    todo.push({ id, before: cur, after: it.category.to.id, beforeName: it.category.before.name, afterName: it.category.to.name });
  }
  console.log(`[g023 G] 계획 ${sel.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length} · 대기(pending) ${readJson('g023-category-pending.json').n}`);
  for (const t of todo) console.log(`  ${t.id}: ${t.beforeName} → ${t.afterName}`);
  for (const s of skipped) console.log('  건너뜀', s);
  if (MODE !== 'apply') { console.log('[g023 G] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g023 G'); const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G023', step: 'G', note: '옛 category_id — --undo', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = t;
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1 and category_id=$3', [t.id, t.after, t.before])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length}`); process.exit(1); }
  await c.query('commit'); console.log(`[g023 G] 썼다 ${n} · 활성 ${a0} → ${await activeCount(c)}`);
} finally { await c.end(); }
