#!/usr/bin/env node
// =============================================================================
// G024 E — 분야 대기 150 (G023 이 기계로 못 맞춘 것 · audit/g023-category-pending.json)
//   GEN 이 150 전부 읽고 판정자 제안(tried[].suggest)을 L3 하나로 옮긴 결정 → audit/g024-category-decisions.json
//     apply: 뜻이 분명히 한 L3 를 가리킴 · 지금 분야가 옛 level 0 이면 가장 가까운 L3 · 꼭 맞는 L3 가 없으면 가장 가까운 L3(+ G024.txt 7절 "L3 신설 후보")
//     keep : 제안이 둘 이상 L3 에 걸침 · 지금 분야가 더 맞음 · 맞는 L3 없음 → audit/g024-category-pending.json(이유 한 줄)
//   출력  audit/g024-undo-category.json (id → 옛 category_id)
//   사용  node scripts/g024-apply-category.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, MODE } from './g023-common.mjs';

const UNDO = 'g024-undo-category.json';
const DEC = readJson('g024-category-decisions.json').items;
const plan = readJson('g024-plan.json');
const DRY = process.argv.includes('--dry-run');
const c = await connect();
try {
  const { rows: C } = await c.query('select id, key, name_ko, level, parent_id from categories');
  const cat = new Map(C.map((r) => [r.id, r]));
  const pathOf = (id) => { const p = []; let r = cat.get(id); while (r) { p.unshift(r.name_ko); r = cat.get(r.parent_id); } return p.join(' > '); };
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, 'g024 E undo');
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1 and category_id=$3', [id, o.before, o.after])).rowCount;
    if (DRY) { await c.query('rollback'); console.log(`[g024 E undo] 확인만 — 옛 분야로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); process.exit(0); }
    await c.query('commit'); console.log(`[g024 E] 되돌렸다 ${n}`); process.exit(0);
  }
  const ids = Object.keys(DEC);
  const { rows } = await c.query('select id, display_answer, category_id from questions where is_active and id = any($1::bigint[])', [ids]);
  const DB = new Map(rows.map((r) => [String(r.id), r]));
  const todo = []; const pending = []; let done = 0; const skipped = [];
  for (const id of ids) {
    const d = DEC[id]; const r = DB.get(id); const it = plan.items[id];
    if (!r) { skipped.push(`${id} 활성 아님`); continue; }
    if (d.action === 'keep') { pending.push({ id: Number(id), answer: r.display_answer, now: pathOf(r.category_id), tried: it.categoryTried.map((t) => `${t.from}: ${t.suggest}`), why: d.why }); continue; }
    const to = cat.get(d.to); if (!to || to.level !== 3) { console.error(`★ ${id} → ${d.to} 는 L3 아님`); process.exit(1); }
    if (r.category_id === d.to) { done++; continue; }
    if (r.category_id !== it.category.id) { skipped.push(`${id} 지금 분야가 계획과 다름`); continue; }
    todo.push({ id, answer: r.display_answer, before: r.category_id, after: d.to, beforeName: pathOf(r.category_id), afterName: pathOf(d.to), why: d.why });
  }
  writeJson('g024-category-pending.json', { round: 'G024', step: 'E', note: '그대로 둔 것 — 제안이 둘 이상 L3 에 걸치거나 · 지금 분야가 더 맞거나 · 맞는 L3 없음', n: pending.length, items: pending });
  console.log(`[g024 E] 결정 ${ids.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 그대로(pending) ${pending.length} · 건너뜀 ${skipped.length}`);
  for (const t of todo) console.log(`  ${t.id} ${t.answer}: ${t.beforeName} → ${t.afterName}`);
  for (const s of skipped) console.log('  건너뜀', s);
  if (MODE !== 'apply') { console.log('[g024 E] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g024 E'); const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G024', step: 'E', note: '옛 category_id — --undo', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = t;
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1 and category_id=$3', [t.id, t.after, t.before])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length}`); process.exit(1); }
  await c.query('commit'); console.log(`[g024 E] 썼다 ${n} · 활성 ${a0} → ${await activeCount(c)}`);
} finally { await c.end().catch(() => {}); }
