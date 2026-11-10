#!/usr/bin/env node
// =============================================================================
// G058 E — 이모지 문항(source_ref '…#g057-…' · is_active true)의 questions.worth 를 2 로 쓴다 — g032-apply-worth.mjs 꼴
//   ★ 이 라운드 행만(source_ref 가 g057 꼴) · 기존 활성은 건드리지 않는다 · worth 2 = 출제 가중 가운데(19 §9 · 이모지는 재미 문항)
//   ★ DB 는 DATABASE_URL — quizweb_dev 는 DATABASE_URL 을 바꿔 한 번 더(되돌리기 파일이 DB 이름별로 따로)
//   출력  audit/g058-undo-worth-<db>.json (id → 옛 값)
//   사용  node scripts/g058-apply-worth.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { connect, guardNoOpenGames, readJson, writeJson, exists, MODE } from './g023-common.mjs';

const WORTH = 2;
const DRY = process.argv.includes('--dry-run');
const c = await connect();
const db = (await c.query('select current_database() d')).rows[0].d;
const UNDO = `g058-undo-worth-${db}.json`;
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, `g058 worth undo ${db}`);
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query(`update questions set worth=$2 where id=$1 and source_ref ~ '#g057-' and worth is not distinct from $3`, [id, o.before, o.after])).rowCount;
    if (DRY) { await c.query('rollback'); console.log(`[g058 worth undo ${db}] 확인만 — 옛 값으로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); }
    else { await c.query('commit'); console.log(`[g058 worth ${db}] 되돌렸다 ${n}`); }
  } else {
    const { rows } = await c.query(`select id, source_ref, worth, is_active from questions where source_ref ~ '#g057-'`);
    const todo = rows.filter((r) => r.is_active && r.worth !== WORTH).map((r) => ({ id: r.id, ref: r.source_ref, before: r.worth, after: WORTH }));
    const done = rows.filter((r) => r.is_active && r.worth === WORTH).length;
    console.log(`[g058 worth ${db}] g057 행 ${rows.length} · 활성 ${rows.filter((r) => r.is_active).length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 옛 값 ${JSON.stringify(todo.reduce((a, t) => (a[t.before] = (a[t.before] ?? 0) + 1, a), {}))}`);
    if (MODE !== 'apply') console.log('[g058 worth] 확인만 — 쓰려면 --apply');
    else if (todo.length) {
      const at = await guardNoOpenGames(c, `g058 worth ${db}`);
      const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G058', db, note: '이모지 문항 worth 옛 값 — --undo', items: {} };
      for (const t of todo) undo.items[t.id] = { ref: t.ref, before: t.before, after: t.after };
      (undo.writes ??= []).push({ at, n: todo.length }); writeJson(UNDO, undo);
      await c.query('begin'); let n = 0;
      for (const t of todo) n += (await c.query(`update questions set worth=$2 where id=$1 and is_active and source_ref ~ '#g057-' and worth is not distinct from $3`, [t.id, t.after, t.before])).rowCount;
      if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length} — 되돌림`); process.exit(1); }
      await c.query('commit'); console.log(`[g058 worth ${db}] 썼다 ${n} · ${at}`);
    }
  }
} finally { await c.end().catch(() => {}); }
