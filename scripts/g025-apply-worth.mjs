#!/usr/bin/env node
// =============================================================================
// G025 B — 알가치(worth 1~3) 6,506 을 questions.worth 에 쓴다 (V029 최종 = audit/v029-worth.json + V029.txt 3절 재독 9)
//   입력  audit/g025-plan.json final(id → 값 · 활성만 · 6686 등 비활성은 NULL 그대로)
//   출력  audit/g025-undo-worth.json (id → 옛 값 — NULL 도 기록)
//   ★ kind(종류)는 열이 없어 쓰지 않는다 — 정본은 audit/v029-worth.json
//   ★ 라이브 서버 재시작 없음: 출제 풀은 게임 시작 때마다 loadQuestionPool 이 q.worth 를 읽는다(캐시 없음)
//   사용  node scripts/g025-apply-worth.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, MODE } from './g023-common.mjs';

const UNDO = 'g025-undo-worth.json';
const DRY = process.argv.includes('--dry-run');
const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, 'g025 B undo');
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query('update questions set worth=$2 where id=$1 and worth is not distinct from $3', [id, o.before, o.after])).rowCount;
    if (DRY) { await c.query('rollback'); console.log(`[g025 B undo] 확인만 — 옛 값으로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); process.exit(0); }
    await c.query('commit'); console.log(`[g025 B] 되돌렸다 ${n}`); process.exit(0);
  }
  const plan = readJson('g025-plan.json');
  const { rows } = await c.query('select id, worth from questions where is_active');
  const todo = []; let done = 0; const missing = [];
  for (const r of rows) {
    const v = plan.final[r.id];
    if (!v) { missing.push(r.id); continue; }
    if (r.worth === v) { done++; continue; }
    todo.push({ id: r.id, before: r.worth, after: v });
  }
  const d = { 1: 0, 2: 0, 3: 0 }; for (const t of todo) d[t.after]++;
  console.log(`[g025 B] 활성 ${rows.length} · 쓸 것 ${todo.length} (1:${d[1]} · 2:${d[2]} · 3:${d[3]}) · 이미 됨 ${done} · 계획에 없음 ${missing.length}`);
  if (missing.length) { console.error('★ 계획에 없는 활성', missing.slice(0, 10)); process.exit(1); }
  if (MODE !== 'apply') { console.log('[g025 B] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g025 B'); const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G025', step: 'B', note: '옛 worth(NULL 포함) — node scripts/g025-apply-worth.mjs --undo', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = { before: t.before, after: t.after };
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) n += (await c.query('update questions set worth=$2 where id=$1 and is_active and worth is not distinct from $3', [t.id, t.after, t.before])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  const { rows: s } = await c.query('select worth, count(*)::int n from questions where is_active group by 1 order by 1');
  console.log(`[g025 B] 썼다 ${n} · ${at} · 활성 ${a0} → ${await activeCount(c)} · 분포 ${JSON.stringify(s)}`);
} finally { await c.end().catch(() => {}); }
