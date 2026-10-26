#!/usr/bin/env node
// =============================================================================
// G023 B — 난이도 v2 적용: questions.difficulty_score ← plan v2 · difficulty(옛 3단계)는 1·2 easy / 3 medium / 4·5 hard
//   ★ GEN 판단(되돌리기 쉽다): difficulty_why 도 v2 근거 한 줄로(15 §5 머리글 "점수마다 근거 한 줄") · score_version 은 그대로(세 축 공용)
//   입력  audit/g023-plan.json   출력  audit/g023-undo-score.json (id → {score · difficulty · why}) · audit/g023-hintless.json
//   사용  node scripts/g023-apply-score.mjs [--dry-run | --apply | --undo]
//   ★ 멱등 — 지금 값이 이미 v2 면 건너뜀 · 되돌리기 파일이 있으면 그 옛 값을 지킨다(두 번 apply 해도 옛 값이 덮이지 않는다)
// =============================================================================
import { connect, guardNoOpenGames, activeCount, loadPlan, readJson, writeJson, exists, MODE } from './g023-common.mjs';

const UNDO = 'g023-undo-score.json';
const band = (s) => (s <= 2 ? 'easy' : s === 3 ? 'medium' : 'hard');
const plan = loadPlan();
const c = await connect();
try {
  const { rows } = await c.query('select id, difficulty_score, difficulty, difficulty_why, general_hint from questions where is_active');
  const DB = new Map(rows.map((r) => [String(r.id), r]));
  if (MODE === 'undo') {
    const u = readJson(UNDO); await guardNoOpenGames(c, 'g023 B undo');
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query('update questions set difficulty_score=$2, difficulty=$3, difficulty_why=$4, updated_at=now() where id=$1', [id, o.score, o.difficulty, o.why])).rowCount;
    await c.query('commit'); console.log(`[g023 B] 되돌렸다 ${n}행`); process.exit(0);
  }
  const todo = []; let done = 0;
  const move = {}; const dist = {};
  for (const [id, it] of Object.entries(plan.items)) {
    const r = DB.get(id); if (!r) { console.error(`★ ${id} 활성 아님`); process.exit(1); }
    const k = `${r.difficulty_score}>${it.v2}`; move[k] = (move[k] ?? 0) + 1;
    dist[it.v2] = (dist[it.v2] ?? 0) + 1;
    if (r.difficulty_score === it.v2 && r.difficulty === band(it.v2) && r.difficulty_why === it.why) { done++; continue; }
    todo.push({ id, before: { score: r.difficulty_score, difficulty: r.difficulty, why: r.difficulty_why }, after: { score: it.v2, difficulty: band(it.v2), why: it.why } });
  }
  const tab = [1, 2, 3, 4, 5].map((a) => `${a}: ` + [1, 2, 3, 4, 5].map((b) => move[`${a}>${b}`] ?? 0).join(' '));
  console.log(`[g023 B] 대상 ${Object.keys(plan.items).length} · 바꿀 것 ${todo.length} · 이미 됨 ${done}`);
  console.log(`  v2 분포 ${JSON.stringify(dist)} · 하 ${(dist[1] ?? 0) + (dist[2] ?? 0)} · 중 ${dist[3] ?? 0} · 상 ${(dist[4] ?? 0) + (dist[5] ?? 0)}`);
  console.log(`  이동(지금 → v2 1~5)\n   ${tab.join('\n   ')}`);
  const hintless = Object.entries(plan.items).filter(([id, it]) => it.v2 >= 3 && !DB.get(id).general_hint).map(([id, it]) => ({ id: +id, v2: it.v2 }));
  console.log(`  힌트 없는 v2 3+ ${hintless.length} (3:${hintless.filter((h) => h.v2 === 3).length} · 4:${hintless.filter((h) => h.v2 === 4).length} · 5:${hintless.filter((h) => h.v2 === 5).length})`);
  if (MODE !== 'apply') { console.log('[g023 B] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g023 B');
  const before = await activeCount(c);
  // 되돌리기 파일 — 이미 있으면 처음 옛 값을 지킨다
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G023', step: 'B', note: '옛 값 — node scripts/g023-apply-score.mjs --undo', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = t.before;
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) n += (await c.query('update questions set difficulty_score=$2, difficulty=$3, difficulty_why=$4, updated_at=now() where id=$1 and is_active', [t.id, t.after.score, t.after.difficulty, t.after.why])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${todo.length} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  const after = await activeCount(c);
  writeJson('g023-hintless.json', { round: 'G023', note: '힌트 없는 v2 3+ — G026 힌트 라운드 재료(CV-101)', builtAt: new Date().toISOString(), n: hintless.length, items: hintless });
  console.log(`[g023 B] 썼다 ${n}행 · 활성 ${before} → ${after}`);
} finally { await c.end(); }
