#!/usr/bin/env node
// =============================================================================
// G029 B — V032 반영(① 힌트·해설 · ② 사실 · ③ 제보 읽기 · ④ 평가) — g028-apply-b.mjs 꼴(멱등 · --dry-run 기본)
//   사용  node scripts/g029-apply-v032.mjs --part hints|explain|read|feedback [--dry-run | --apply | --undo [--dry-run]]
//   입력  data/pipeline/audit/g029-plan.json (GEN 최종 — before · after · why)
//   쓰는 열: general_hint · explanation · question_text(read · feedback 목록 id 만) — general_hint_version 은 그대로
//   적용 직전 다시: 지금 DB 값 = before(아니면 건너뜀) · 힌트 checkHint 막힘 0 · 해설 겹침 0 · 120자 · hints/explain 은 등급 3 만(V033 이 등급 1·2 판정 중)
//                   · 질문 240자 · 질문에 정답·변형 글자 없음 · 판 열림 0
//   되돌리기 audit/g029-undo-v032-<part>.json (read 는 g029-undo-read.json)
// =============================================================================
import { connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const pi = process.argv.indexOf('--part');
const PART = pi > 0 ? process.argv[pi + 1] : null;
if (!['hints', 'explain', 'read', 'feedback'].includes(PART)) { console.error('--part hints|explain|read|feedback'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
const UNDO = PART === 'read' ? 'g029-undo-read.json' : `g029-undo-v032-${PART}.json`;
const TAG = `g029 B ${PART}`;
const COLS = ['general_hint', 'explanation', 'question_text'];
const plan = readJson('g029-plan.json')[PART];

const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, `${TAG} undo`);
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) {
      n += (await c.query(`update questions set general_hint=$2, explanation=$3, question_text=$4, updated_at=now()
          where id=$1 and general_hint is not distinct from $5 and explanation is not distinct from $6 and question_text is not distinct from $7`,
      [id, ...COLS.map((k) => o.before[k]), ...COLS.map((k) => o.after[k])])).rowCount;
    }
    if (DRY) { await c.query('rollback'); console.log(`[${TAG} undo] 확인만 — 옛 값으로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); }
    else { await c.query('commit'); console.log(`[${TAG}] 되돌렸다 ${n}`); }
  } else {
    const ids = Object.keys(plan);
    const { rows } = await c.query(`select q.id, q.is_active, q.difficulty_score g, q.display_answer, q.question_text, q.general_hint, q.explanation,
        coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants from questions q where q.id = any($1::bigint[])`, [ids]);
    const D = new Map(rows.map((r) => [String(r.id), r]));
    const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G029', part: PART, note: '옛 general_hint · explanation · question_text — --undo', items: {} };
    const todo = []; const skipped = []; let done = 0;
    for (const id of ids) {
      const r = D.get(id); const p = plan[id];
      if (!r?.is_active) { skipped.push([id, '활성 아님']); continue; }
      if ((PART === 'hints' || PART === 'explain') && r.g !== 3) { skipped.push([id, `등급 ${r.g} — 3 아님`]); continue; }
      const cur = Object.fromEntries(COLS.map((k) => [k, r[k]]));
      const after = Object.fromEntries(COLS.map((k) => [k, k in p.after ? p.after[k] : r[k]]));
      if (COLS.every((k) => cur[k] === after[k])) { done++; continue; }
      const prevAfter = undo.items[id]?.after;
      const sameBefore = COLS.every((k) => !(k in p.after) || cur[k] === p.before[k]);
      const sameOurs = prevAfter && COLS.every((k) => cur[k] === prevAfter[k]);
      if (!sameBefore && !sameOurs) { skipped.push([id, '지금 값이 계획 때와 다름']); continue; }
      const bad = [];
      if (after.general_hint) {
        const ck = checkHint({ hint: after.general_hint, answer: r.display_answer, variants: r.variants, question: after.question_text, explanation: after.explanation ?? '' });
        if (ck.block.length) bad.push('힌트 막힘 ' + JSON.stringify(ck.block));
        const exw = ck.warn.find((w) => w.kind === 'explain'); if (exw) bad.push('해설 겹침 ' + exw.shared.join('/'));
        if (ck.warn.some((w) => w.kind === 'blank')) bad.push('빈칸 ○');
        if (len(after.general_hint) > 120 || /[\r\n]/.test(after.general_hint)) bad.push(`힌트 ${len(after.general_hint)}자`);
      }
      if (len(after.question_text) > 240) bad.push(`질문 ${len(after.question_text)}자`);
      if ('question_text' in p.after) { const qn = normalizeAnswer(after.question_text); for (const a of [r.display_answer, ...r.variants]) { const n = normalizeAnswer(a); if (n && qn.includes(n)) bad.push(`질문에 정답·변형 '${a}'`); } }
      if (after.explanation != null && !String(after.explanation).trim()) bad.push('해설 빈 글');
      if (bad.length) { skipped.push([id, bad.join(' · ')]); continue; }
      todo.push({ id, answer: r.display_answer, before: undo.items[id]?.before ?? cur, after, cur, why: p.why });
    }
    console.log(`[${TAG}] 대상 ${ids.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
    for (const t of todo) console.log(`  쓸 것 #${t.id} ${t.answer} · ${COLS.filter((k) => t.cur[k] !== t.after[k]).join('+')}`);
    for (const s of skipped) console.log('  건너뜀', ...s);
    if (MODE !== 'apply') console.log(`[${TAG}] 확인만 — 쓰려면 --apply`);
    else if (todo.length) {
      const at = await guardNoOpenGames(c, TAG); const a0 = await activeCount(c);
      for (const t of todo) undo.items[t.id] = { answer: t.answer, before: t.before, after: t.after, why: t.why };
      (undo.writes ??= []).push({ at, n: todo.length }); writeJson(UNDO, undo);
      await c.query('begin'); let n = 0;
      for (const t of todo) n += (await c.query(`update questions set general_hint=$2, explanation=$3, question_text=$4, updated_at=now()
          where id=$1 and is_active and general_hint is not distinct from $5 and explanation is not distinct from $6 and question_text is not distinct from $7`,
      [t.id, ...COLS.map((k) => t.after[k]), ...COLS.map((k) => t.cur[k])])).rowCount;
      if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length} — 되돌림`); process.exit(1); }
      await c.query('commit'); console.log(`[${TAG}] 썼다 ${n} · 활성 ${a0} → ${await activeCount(c)} · ${at}`);
    }
  }
} finally { await c.end().catch(() => {}); }
