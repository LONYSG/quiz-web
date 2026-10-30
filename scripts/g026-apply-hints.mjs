#!/usr/bin/env node
// =============================================================================
// G026 C — 등급 4·5 힌트 다시 쓰기 반영 (hint-v7 · D-311 · g024-hints-lib.mjs 꼴)
//   새 힌트·해설 = audit/g026-raw/h-NN.out.json · blind 뒤 다시 쓴 것 h-NN.redo-out.json 이 이긴다(해설 null 이면 처음 것)
//   한 행에서 함께: general_hint · general_hint_version='hint-v7' · explanation=COALESCE(새 해설, 지금 해설)
//   적용 직전 다시: checkHint 막힘 0 · 120자 · 한 줄 · 새 힌트 ↔ 해설 4글자 겹침 0 · 지금 DB 힌트·해설이 계획 때(또는 앞서 G026 이 쓴 값)와 같음(아니면 건너뜀) · 판 열림 0
//   되돌리기 audit/g026-undo-hints.json — id → { before: { hint, version, explanation }, after: { hint, explanation } }
//   건너뜀 · 비움 → audit/g026-skipped.json
//   사용  node scripts/g026-apply-hints.mjs [--dry-run | --apply | --undo [--dry-run]] [--upto h-NN]
// =============================================================================
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { AUDIT, connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';

const RAW = path.join(AUDIT, 'g026-raw');
const J = (f) => JSON.parse(readFileSync(path.join(RAW, f), 'utf8'));
const VERSION = 'hint-v7';
const UNDO = 'g026-undo-hints.json';
const TAG = 'g026 C';
const DRY = process.argv.includes('--dry-run');
const ui = process.argv.indexOf('--upto');
const UPTO = ui > 0 ? process.argv[ui + 1] : null;

/** 묶음 출력의 최종 힌트·해설 — id → { hint, explanation(null = 그대로), from, batch } */
function finalHints() {
  const m = new Map();
  const fs = existsSync(RAW) ? readdirSync(RAW) : [];
  const inRange = (f) => !UPTO || f.slice(0, 4) <= UPTO;
  for (const f of fs.filter((x) => /^h-\d\d\.out\.json$/.test(x) && inRange(x)).sort())
    for (const o of J(f)) m.set(String(o.ref), { hint: o.hint ?? null, explanation: o.explanation ?? null, from: f, batch: f.slice(0, 4) });
  for (const f of fs.filter((x) => /^h-\d\d\.redo-out\.json$/.test(x) && inRange(x)).sort())
    for (const o of J(f)) if (o.hint) { const p = m.get(String(o.ref)); m.set(String(o.ref), { ...p, hint: o.hint, explanation: o.explanation ?? p?.explanation ?? null, from: f, redo: true }); }
  return m;
}

const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, `${TAG} undo`);
    await c.query('begin'); let n = 0, ex = 0;
    for (const [id, o] of Object.entries(u.items)) {
      const r = await c.query('update questions set general_hint=$2, general_hint_version=$3, explanation=$4, updated_at=now() where id=$1 and general_hint is not distinct from $5 returning (explanation is distinct from $6) exch',
        [id, o.before.hint, o.before.version, o.before.explanation, o.after.hint, o.after.explanation]);
      n += r.rowCount; if (o.before.explanation !== o.after.explanation) ex += r.rowCount;
    }
    if (DRY) { await c.query('rollback'); console.log(`[${TAG} undo] 확인만 — 옛 힌트·버전·해설로 돌아갈 행 ${n}/${Object.keys(u.items).length} (그 가운데 해설도 돌아감 ${ex})`); }
    else { await c.query('commit'); console.log(`[${TAG}] 되돌렸다 ${n} (해설 ${ex})`); }
  } else {
    const plan = readJson('g026-plan.json');
    const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G026', step: 'C', note: '옛 general_hint · general_hint_version · explanation — --undo', items: {} };
    const F = finalHints();
    const ids = Object.keys(plan.items);
    const { rows } = await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version, q.is_active, q.difficulty_score,
        coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants
        from questions q where q.id = any($1::bigint[])`, [ids]);
    const DB = new Map(rows.map((r) => [String(r.id), r]));
    const todo = []; const left = []; const skipped = []; let done = 0, notYet = 0;
    for (const id of ids) {
      const r = DB.get(id); const it = plan.items[id]; const f = F.get(id);
      if (!r?.is_active || ![4, 5].includes(r.difficulty_score)) { skipped.push({ id: Number(id), answer: it.answer, why: '활성 아님 · 등급 4·5 아님' }); continue; }
      if (!f) { notYet++; continue; }
      if (!f.hint) { left.push({ id: Number(id), answer: it.answer, why: '비움(H8)' }); continue; }
      const newEx = f.explanation ?? (undo.items[id]?.before.explanation ?? it.explanation);
      if (r.general_hint === f.hint && r.general_hint_version === VERSION && (r.explanation ?? null) === (newEx ?? null)) { done++; continue; }
      const prev = undo.items[id]?.after;
      const sameAsPlan = (r.general_hint ?? null) === (it.hint ?? null) && (r.explanation ?? null) === (it.explanation ?? null);
      const sameAsOurs = prev && (r.general_hint ?? null) === prev.hint && (r.explanation ?? null) === (prev.explanation ?? null);
      if (!sameAsPlan && !sameAsOurs) { skipped.push({ id: Number(id), answer: it.answer, why: '지금 힌트·해설이 계획 때와 다름' }); continue; }
      const ck = checkHint({ hint: f.hint, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: newEx ?? '' });
      const exw = ck.warn.find((w) => w.kind === 'explain');
      if (ck.block.length || exw || len(f.hint) > 120 || /[\r\n]/.test(f.hint) || !(newEx ?? '').trim()) { skipped.push({ id: Number(id), answer: it.answer, why: `검사 막힘 ${JSON.stringify(ck.block)} ${exw ? '해설 겹침 ' + exw.shared.join('/') : ''} · ${len(f.hint)}자` }); continue; }
      todo.push({ id, answer: r.display_answer, before: undo.items[id]?.before ?? { hint: r.general_hint, version: r.general_hint_version, explanation: r.explanation }, after: { hint: f.hint, explanation: newEx }, cur: { hint: r.general_hint, explanation: r.explanation }, from: f.from, batch: f.batch, exChanged: (newEx ?? null) !== (it.explanation ?? null) });
    }
    const exN = todo.filter((t) => t.exChanged).length;
    console.log(`[${TAG}] 대상 ${ids.length} · 쓸 것 ${todo.length}(해설도 바뀜 ${exN}) · 이미 됨 ${done} · 아직 안 씀 ${notYet} · 비움 ${left.length} · 건너뜀 ${skipped.length}${UPTO ? ` · --upto ${UPTO}` : ''}`);
    for (const s of skipped) console.log('  건너뜀', s.id, s.answer, s.why);
    writeJson('g026-skipped.json', { round: 'G026', step: 'C', note: '건너뜀(활성 아님 · 계획 뒤 바뀜 · 검사 막힘) · 비움(H8)', at: new Date().toISOString(), skipped, left });
    if (MODE !== 'apply') { console.log(`[${TAG}] 확인만 — 쓰려면 --apply`); }
    else if (todo.length) {
      const at = await guardNoOpenGames(c, TAG); const a0 = await activeCount(c);
      for (const t of todo) undo.items[t.id] = { answer: t.answer, batch: t.batch, before: t.before, after: t.after };
      (undo.writes ??= []).push({ at, n: todo.length, explanation: exN, upto: UPTO });
      writeJson(UNDO, undo);
      await c.query('begin'); let n = 0;
      for (const t of todo) n += (await c.query(`update questions set general_hint=$2, general_hint_version=$3, explanation=$4, updated_at=now()
          where id=$1 and is_active and general_hint is not distinct from $5 and explanation is not distinct from $6`, [t.id, t.after.hint, VERSION, t.after.explanation, t.cur.hint, t.cur.explanation])).rowCount;
      if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length} — 되돌림`); process.exit(1); }
      await c.query('commit'); console.log(`[${TAG}] 썼다 ${n}(해설 ${exN}) · 활성 ${a0} → ${await activeCount(c)} · ${at}`);
    }
  }
} finally { await c.end().catch(() => {}); }
