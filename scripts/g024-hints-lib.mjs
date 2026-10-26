// =============================================================================
// G024 C · D — 힌트 반영 공용 (g024-apply-hints.mjs · g024-apply-h9.mjs 가 쓴다)
//   새 힌트 = audit/g024-raw/<pre>-NN.out.json · blind 뒤 다시 쓴 것 <pre>-NN.redo-out.json 이 이긴다
//   적용 직전 다시: checkHint 막힘 0 · 120자 · 지금 DB 힌트가 계획 때와 같음(아니면 건너뜀) · 판 열림 0
//   general_hint_version = 'hint-v6' · 되돌리기 파일에 옛 힌트 · 옛 version (null 도)
// =============================================================================
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { AUDIT, connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';

const RAW = path.join(AUDIT, 'g024-raw');
const J = (f) => JSON.parse(readFileSync(path.join(RAW, f), 'utf8'));
export const VERSION = 'hint-v6';

/** pre('h' | 'r') 묶음의 최종 힌트 — id → { hint, from, keep?, keepWhy? } */
export function finalHints(pre) {
  const m = new Map();
  const fs = existsSync(RAW) ? readdirSync(RAW) : [];
  for (const f of fs.filter((x) => x.startsWith(`${pre}-`) && x.endsWith('.out.json') && !x.includes('redo') && !x.includes('blind')).sort())
    for (const o of J(f)) m.set(String(o.ref), { hint: o.hint ?? null, from: f, keep: !!o.keep, keepWhy: o.keepWhy, why: o.why, hintBasis: o.hintBasis, hintSources: o.hintSources });
  for (const f of fs.filter((x) => x.startsWith(`${pre}-`) && x.endsWith('.redo-out.json')).sort())
    for (const o of J(f)) if (o.hint) m.set(String(o.ref), { ...m.get(String(o.ref)), hint: o.hint, from: f, redo: true, hintBasis: o.hintBasis ?? m.get(String(o.ref))?.hintBasis, hintSources: o.hintSources ?? m.get(String(o.ref))?.hintSources });
  return m;
}

/** task: 'hint' | 'h9' · undoFile · tag */
export async function run({ task, pre, undoFile, tag }) {
  const plan = readJson('g024-plan.json');
  const DRY = process.argv.includes('--dry-run');
  const c = await connect();
  try {
    if (MODE === 'undo') {
      const u = readJson(undoFile); if (!DRY) await guardNoOpenGames(c, `${tag} undo`);
      await c.query('begin'); let n = 0;
      for (const [id, o] of Object.entries(u.items))
        n += (await c.query('update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and general_hint is not distinct from $4', [id, o.before.hint, o.before.version, o.after])).rowCount;
      if (DRY) { await c.query('rollback'); console.log(`[${tag} undo] 확인만 — 옛 힌트로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); return; }
      await c.query('commit'); console.log(`[${tag}] 되돌렸다 ${n}`); return;
    }
    const F = finalHints(pre);
    const ids = Object.entries(plan.items).filter(([, it]) => it.tasks.includes(task)).map(([id]) => id);
    const { rows } = await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version, q.is_active,
        coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants
        from questions q where q.id = any($1::bigint[])`, [ids]);
    const DB = new Map(rows.map((r) => [String(r.id), r]));
    const todo = []; const left = []; const kept = []; const skipped = []; let done = 0;
    for (const id of ids) {
      const r = DB.get(id); const it = plan.items[id]; const f = F.get(id);
      if (!r?.is_active) { skipped.push(`${id} 활성 아님`); continue; }
      if (!f) { left.push({ id: Number(id), answer: it.answer, why: '아직 안 씀(묶음 출력 없음)' }); continue; }
      if (f.keep) { kept.push({ id: Number(id), answer: it.answer, hint: r.general_hint, keepWhy: f.keepWhy }); continue; }
      if (!f.hint) { left.push({ id: Number(id), answer: it.answer, v2: it.v2, why: f.why ?? '비움(H8)' }); continue; }
      if (r.general_hint === f.hint) { done++; continue; }
      if ((r.general_hint ?? null) !== (it.hint ?? null)) { skipped.push(`${id} 지금 힌트가 계획 때와 다름`); continue; }
      const ck = checkHint({ hint: f.hint, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation ?? '' });
      if (ck.block.length || len(f.hint) > 120 || /[\r\n]/.test(f.hint)) { skipped.push(`${id} 검사 막힘 ${JSON.stringify(ck.block)} · ${len(f.hint)}자`); continue; }
      todo.push({ id, answer: r.display_answer, before: { hint: r.general_hint, version: r.general_hint_version }, after: f.hint, from: f.from });
    }
    console.log(`[${tag}] 대상 ${ids.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 비움/아직 ${left.length} · 둠(keep) ${kept.length} · 건너뜀 ${skipped.length}`);
    for (const s of skipped) console.log('  건너뜀', s);
    if (MODE !== 'apply') { console.log(`[${tag}] 확인만 — 쓰려면 --apply`); return { todo, left, kept }; }
    const at = await guardNoOpenGames(c, tag); const a0 = await activeCount(c);
    const undo = exists(undoFile) ? readJson(undoFile) : { round: 'G024', step: task === 'hint' ? 'C' : 'D', note: '옛 general_hint · general_hint_version(null 도) — --undo', items: {} };
    for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = { answer: t.answer, before: t.before, after: t.after };
    for (const t of todo) undo.items[t.id].after = t.after;
    undo.writtenAt = at; writeJson(undoFile, undo);
    await c.query('begin'); let n = 0;
    for (const t of todo) n += (await c.query('update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and general_hint is not distinct from $4', [t.id, t.after, VERSION, t.before.hint])).rowCount;
    if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length}`); process.exit(1); }
    await c.query('commit'); console.log(`[${tag}] 썼다 ${n} · 활성 ${a0} → ${await activeCount(c)}`);
    return { todo, left, kept };
  } finally { await c.end().catch(() => {}); }
}
