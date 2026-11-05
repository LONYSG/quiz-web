#!/usr/bin/env node
// =============================================================================
// G030 ④ 변형 — question_answers 행 추가(is_primary false) · g029-apply-variants.mjs 꼴
//   사용  node scripts/g030-apply-variants.mjs --part rest|guard|b [--dry-run | --apply | --undo [--dry-run]]
//   입력  data/pipeline/audit/g030-variants.json 의 part 배열 [{ id, text, why, hint?: { before, after, why } }]
//     rest  = V033 accept 중 남은 4(CV-135 (a))
//     guard = G029 H2 막힘 가드 131 — checkHint 새 규칙(대표 정답을 품은 변형) 뒤 다시 검사 · 여전히 막히면 hint(힌트 고침)를 함께 쓰거나 목록에서 뺀다(7절)
//     b     = ⓑ 다른 대상 2 — 설계 결정: 표기 변형이면 넣는다(앨버트로스 → #771 · 캐논 → #1531 · DG-068) · ⓑ 충돌은 알고 넣는다
//   충돌 검사(normalizeAnswer): ⓐ 그 문항의 정답·변형과 같음 → 건너뜀 · ⓑ 다른 활성 문항의 대표 정답과 같음 → rest·guard 는 안 넣음(결정 필요) · b 는 넣음
//     ⓒ 다른 문항의 변형과만 같음 → 넣음 · 넣은 뒤 그 문항 힌트 checkHint 막힘 0(아니면 안 넣음)
//   쓰기 직전 열린 판 0 · 되돌리기 audit/g030-undo-variants-<part>.json(넣은 행 id · 힌트 전후)
// =============================================================================
import { readJson, writeJson, exists, connect, guardNoOpenGames, len, MODE } from './g023-common.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';

const pi = process.argv.indexOf('--part');
const PART = pi > 0 ? process.argv[pi + 1] : null;
if (!['rest', 'guard', 'b'].includes(PART)) { console.error('--part rest|guard|b'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
const UNDO = `g030-undo-variants-${PART}.json`;
const TAG = `g030 variants ${PART}`;
const NOTE = { rest: 'G030 V033 변형', guard: 'G030 G029 H2 가드 변형', b: 'G030 ⓑ 표기 변형' }[PART];

const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, `${TAG} undo`);
    await c.query('begin'); let n = 0; let h = 0;
    for (const r of u.items) n += (await c.query('delete from question_answers where id=$1 and question_id=$2 and answer_text=$3 and not is_primary', [r.rowId, r.id, r.text])).rowCount;
    for (const [id, o] of Object.entries(u.hints ?? {})) h += (await c.query('update questions set general_hint=$2, updated_at=now() where id=$1 and general_hint=$3', [id, o.before, o.after])).rowCount;
    if (DRY) { await c.query('rollback'); console.log(`[${TAG} undo] 확인만 — 지울 행 ${n}/${u.items.length} · 힌트 되돌림 ${h}/${Object.keys(u.hints ?? {}).length}`); }
    else { await c.query('commit'); console.log(`[${TAG}] 지웠다 ${n} · 힌트 되돌림 ${h}`); }
  } else {
    const list = readJson('g030-variants.json')[PART];
    const qa = (await c.query(`select a.question_id::text qid, a.answer_norm, a.is_primary, q.is_active, q.display_answer from question_answers a join questions q on q.id=a.question_id`)).rows;
    const mine = new Map(); const primOf = new Map(); const varOf = new Map(); const active = new Map();
    for (const r of qa) {
      (mine.get(r.qid) ?? mine.set(r.qid, new Set()).get(r.qid)).add(r.answer_norm); active.set(r.qid, { a: r.is_active, d: r.display_answer });
      if (!r.is_active) continue;
      const m = r.is_primary ? primOf : varOf; (m.get(r.answer_norm) ?? m.set(r.answer_norm, []).get(r.answer_norm)).push(r.qid);
    }
    const ids = [...new Set(list.map((v) => String(v.id)))];
    const Q = new Map((await c.query(`select q.id::text id, q.difficulty_score g, q.display_answer, q.question_text, q.general_hint, q.explanation,
        coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants from questions q where q.id = any($1::bigint[])`, [ids])).rows.map((r) => [r.id, r]));
    const t = { 후보: 0, 넣음: 0, a_이미: 0, b_다른대상_넣음: 0, b_결정필요: 0, c_변형과만: 0, 힌트고침: 0, h2막힘: 0, 비활성: 0 };
    const todo = []; const notes = []; const seen = new Set(); const hintNew = new Map(); const pend = new Map();
    for (const v0 of list) {
      const v = { ...v0, id: String(v0.id) }; t.후보++;
      const norm = normalizeAnswer(v.text); const key = `${v.id}|${norm}`;
      if (!active.get(v.id)?.a) { t.비활성++; continue; }
      if (seen.has(key) || mine.get(v.id)?.has(norm)) { t.a_이미++; notes.push(`ⓐ 이미 #${v.id} '${v.text}'`); continue; } seen.add(key);
      const others = (primOf.get(norm) ?? []).filter((q) => q !== v.id);
      if (others.length) {
        const o = others.map((q) => `#${q} ${active.get(q).d}`).join(' · ');
        if (PART === 'b') { t.b_다른대상_넣음++; notes.push(`ⓑ 넣음(설계 결정) #${v.id} '${v.text}' = ${o}`); }
        else { t.b_결정필요++; notes.push(`ⓑ 안 넣음 #${v.id} '${v.text}' = ${o}`); continue; }
      } else if ((varOf.get(norm) ?? []).some((q) => q !== v.id)) t.c_변형과만++;
      const r = Q.get(v.id);
      if (v.hint) {
        const cur = hintNew.get(v.id) ?? r.general_hint;
        if (cur !== v.hint.before && cur !== v.hint.after) { notes.push(`건너뜀 #${v.id} 힌트가 계획 때와 다름`); continue; }
        hintNew.set(v.id, v.hint.after);
      }
      const variants = [...r.variants, ...(pend.get(v.id) ?? []), v.text];
      const hint = hintNew.get(v.id) ?? r.general_hint;
      if (hint) {
        const ck = checkHint({ hint, answer: r.display_answer, variants, question: r.question_text, explanation: r.explanation ?? '' });
        const bad = [];
        if (ck.block.length) bad.push('막힘 ' + JSON.stringify(ck.block.map((b) => b.frag)));
        if (v.hint) { if (ck.warn.some((w) => w.kind === 'explain')) bad.push('해설 겹침'); if (len(hint) > 120) bad.push(`힌트 ${len(hint)}자`); }
        if (bad.length) { t.h2막힘++; notes.push(`안 넣음 #${v.id} '${v.text}' ${bad.join(' · ')} | ${hint}`); if (v.hint) hintNew.delete(v.id); continue; }
      }
      (pend.get(v.id) ?? pend.set(v.id, []).get(v.id)).push(v.text);
      todo.push(v);
    }
    const hintTodo = [...hintNew.entries()].filter(([id]) => todo.some((v) => v.id === id)).map(([id, after]) => ({ id, before: Q.get(id).general_hint, after }));
    t.힌트고침 = hintTodo.filter((h) => h.before !== h.after).length; t.넣음 = todo.length;
    console.log(`[${TAG}] ${JSON.stringify(t)}`);
    for (const n of notes) console.log('  ' + n);
    for (const v of todo) console.log(`  넣음 #${v.id} ${active.get(v.id).d} + '${v.text}'${v.hint ? ' (힌트 함께)' : ''}`);
    writeJson(`g030-variants-${PART}-check.json`, { round: 'G030', part: PART, at: new Date().toISOString(), counts: t, notes, add: todo.map((v) => ({ id: v.id, text: v.text })), hints: hintTodo });
    if (MODE !== 'apply') console.log(`[${TAG}] 확인만 — 쓰려면 --apply`);
    else if (todo.length) {
      const at = await guardNoOpenGames(c, TAG);
      const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G030', part: PART, note: '넣은 question_answers 행 · 고친 힌트 — --undo 가 되돌린다', items: [], hints: {} };
      await c.query('begin');
      for (const h of hintTodo) {
        if (h.before === h.after) continue;
        const n = (await c.query('update questions set general_hint=$2, updated_at=now() where id=$1 and is_active and general_hint=$3', [h.id, h.after, h.before])).rowCount;
        if (n !== 1) { await c.query('rollback'); console.error(`★ 힌트 #${h.id} 못 씀 — 되돌림`); process.exit(1); }
        undo.hints[h.id] = { before: h.before, after: h.after, at };
      }
      for (const v of todo) { const r = await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) returning id', [v.id, v.text, normalizeAnswer(v.text), NOTE]); undo.items.push({ id: v.id, text: v.text, rowId: Number(r.rows[0].id), at }); }
      await c.query('commit'); writeJson(UNDO, undo); console.log(`[${TAG}] 넣었다 ${todo.length} · 힌트 ${t.힌트고침} · ${at}`);
    }
  }
} finally { await c.end().catch(() => {}); }
