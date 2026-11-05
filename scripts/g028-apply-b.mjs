#!/usr/bin/env node
// =============================================================================
// G028 B — V031 반영 ① · 사실 ② · G025 글·L3 ③ · 제보 ⑤ (g027-apply-hints.mjs 꼴 · 멱등)
//   사용  node scripts/g028-apply-b.mjs --part v031|facts|g025|variants [--dry-run | --apply | --undo [--dry-run]]
//   입력  data/pipeline/audit/g028-b-plan.json (GEN 최종 — 지금 값 before · 새 값 after)
//   쓰는 열(브리핑 그대로): v031 = general_hint · general_hint_version(그대로 'hint-v7') · explanation
//                          facts = question_text · explanation   g025 = question_text · category_id(3312 · 3970)
//                          variants = question_answers 행 추가(is_primary false)
//   적용 직전 다시: 지금 DB 값 = before(아니면 건너뜀) · 힌트 checkHint 막힘 0 · 해설 겹침 0 · 120자 · 등급 4·5(v031) · 질문 240자 · 변형 충돌 표시 · 판 열림 0
//   되돌리기 audit/g028-undo-<part>.json
// =============================================================================
import { AUDIT, connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const pi = process.argv.indexOf('--part');
const PART = pi > 0 ? process.argv[pi + 1] : null;
if (!['v031', 'facts', 'g025', 'variants'].includes(PART)) { console.error('--part v031|facts|g025|variants'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
const UNDO = `g028-undo-${PART}.json`;
const TAG = `g028 B ${PART}`;
const plan = readJson('g028-b-plan.json')[PART];
const COLS = { v031: ['general_hint', 'explanation'], facts: ['question_text', 'explanation'], g025: ['question_text', 'category_id'] };

const c = await connect();
try {
  if (PART === 'variants') {
    if (MODE === 'undo') {
      const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, `${TAG} undo`);
      await c.query('begin'); let n = 0;
      for (const r of u.items) n += (await c.query('delete from question_answers where id=$1 and question_id=$2 and answer_text=$3 and not is_primary', [r.rowId, r.id, r.text])).rowCount;
      if (DRY) { await c.query('rollback'); console.log(`[${TAG} undo] 확인만 — 지울 행 ${n}/${u.items.length}`); } else { await c.query('commit'); console.log(`[${TAG}] 지웠다 ${n}`); }
    } else {
      const todo = [];
      for (const v of plan) {
        const norm = normalizeAnswer(v.text);
        const have = (await c.query('select 1 from question_answers where question_id=$1 and answer_norm=$2', [v.id, norm])).rowCount;
        const clash = (await c.query(`select a.question_id, a.answer_text, a.is_primary, q.display_answer from question_answers a join questions q on q.id=a.question_id and q.is_active where a.answer_norm=$1 and a.question_id<>$2`, [norm, v.id])).rows;
        console.log(`  #${v.id} '${v.text}' (${norm}) · 이미 ${have ? '있음' : '없음'} · 같아지는 다른 활성 문항 ${clash.map((x) => `#${x.question_id} ${x.display_answer}(${x.is_primary ? '정답' : '변형'} '${x.answer_text}')`).join(' · ') || '없음'}`);
        if (!have) todo.push({ ...v, norm });
      }
      console.log(`[${TAG}] 넣을 것 ${todo.length}/${plan.length}`);
      if (MODE === 'apply' && todo.length) {
        const at = await guardNoOpenGames(c, TAG);
        const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G028', part: PART, note: '넣은 question_answers 행 — --undo 가 지운다', items: [] };
        await c.query('begin');
        for (const t of todo) { const r = await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) returning id', [t.id, t.text, t.norm, t.note]); undo.items.push({ id: t.id, text: t.text, rowId: Number(r.rows[0].id), at }); }
        await c.query('commit'); writeJson(UNDO, undo); console.log(`[${TAG}] 넣었다 ${todo.length} · ${at}`);
      } else if (MODE !== 'apply') console.log(`[${TAG}] 확인만 — 쓰려면 --apply`);
    }
  } else if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, `${TAG} undo`);
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) {
      const sets = COLS[PART].map((k, i) => `${k}=$${i + 2}`).join(', ');
      const conds = COLS[PART].map((k, i) => `${k} is not distinct from $${i + 2 + COLS[PART].length}`).join(' and ');
      n += (await c.query(`update questions set ${sets}, updated_at=now() where id=$1 and ${conds}`, [id, ...COLS[PART].map((k) => o.before[k]), ...COLS[PART].map((k) => o.after[k])])).rowCount;
    }
    if (DRY) { await c.query('rollback'); console.log(`[${TAG} undo] 확인만 — 옛 값으로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); }
    else { await c.query('commit'); console.log(`[${TAG}] 되돌렸다 ${n}`); }
  } else {
    const ids = Object.keys(plan);
    const { rows } = await c.query(`select q.id, q.is_active, q.difficulty_score g, q.display_answer, q.question_text, q.general_hint, q.general_hint_version, q.explanation, q.category_id,
        coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants from questions q where q.id = any($1::bigint[])`, [ids]);
    const D = new Map(rows.map((r) => [String(r.id), r]));
    const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G028', part: PART, note: `옛 ${COLS[PART].join(' · ')} — --undo`, items: {} };
    const todo = []; const skipped = []; let done = 0;
    for (const id of ids) {
      const r = D.get(id); const p = plan[id];
      const after = Object.fromEntries(COLS[PART].map((k) => [k, k in p.after ? p.after[k] : (k === 'category_id' ? Number(r.category_id) : r[k])]));
      const cur = Object.fromEntries(COLS[PART].map((k) => [k, k === 'category_id' ? Number(r[k]) : r[k]]));
      if (!r?.is_active) { skipped.push([id, '활성 아님']); continue; }
      if (PART === 'v031' && !(r.g >= 4)) { skipped.push([id, `등급 ${r.g} — 4·5 아님(V032)`]); continue; }
      if (COLS[PART].every((k) => cur[k] === after[k])) { done++; continue; }
      const prevAfter = undo.items[id]?.after;
      const sameBefore = COLS[PART].every((k) => cur[k] === p.before[k]);
      const sameOurs = prevAfter && COLS[PART].every((k) => cur[k] === prevAfter[k]);
      if (!sameBefore && !sameOurs) { skipped.push([id, '지금 값이 계획 때와 다름']); continue; }
      const q = after.question_text ?? r.question_text; const ex = after.explanation ?? r.explanation; const h = after.general_hint ?? r.general_hint;
      const ck = h ? checkHint({ hint: h, answer: r.display_answer, variants: r.variants, question: q, explanation: ex ?? '' }) : { block: [], warn: [] };
      const exw = ck.warn.find((w) => w.kind === 'explain');
      const bad = [];
      if (ck.block.length) bad.push('힌트 막힘 ' + JSON.stringify(ck.block));
      if (exw && (PART === 'v031' || p.after.explanation != null)) bad.push('해설 겹침 ' + exw.shared.join('/'));
      if (h && (len(h) > 120 || /[\r\n]/.test(h))) bad.push(`힌트 ${len(h)}자`);
      if (len(q) > 240) bad.push(`질문 ${len(q)}자`);
      if (ex != null && !String(ex).trim()) bad.push('해설 빈 글');
      if (bad.length) { skipped.push([id, bad.join(' · ')]); continue; }
      const warn = ck.warn.filter((w) => w.kind !== 'explain').map((w) => w.kind + (w.frag ? ':' + w.frag : ''));
      todo.push({ id, answer: r.display_answer, before: undo.items[id]?.before ?? cur, after, cur, warn });
    }
    console.log(`[${TAG}] 대상 ${ids.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
    for (const t of todo) console.log(`  쓸 것 #${t.id} ${t.answer} · ${COLS[PART].filter((k) => t.cur[k] !== t.after[k]).join('+')}${t.warn.length ? ' · 경고 ' + t.warn.join(',') : ''}`);
    for (const s of skipped) console.log('  건너뜀', ...s);
    if (MODE !== 'apply') console.log(`[${TAG}] 확인만 — 쓰려면 --apply`);
    else if (todo.length) {
      const at = await guardNoOpenGames(c, TAG); const a0 = await activeCount(c);
      for (const t of todo) undo.items[t.id] = { answer: t.answer, before: t.before, after: t.after };
      (undo.writes ??= []).push({ at, n: todo.length }); writeJson(UNDO, undo);
      await c.query('begin'); let n = 0;
      for (const t of todo) {
        const sets = COLS[PART].map((k, i) => `${k}=$${i + 2}`).join(', ');
        const conds = COLS[PART].map((k, i) => `${k} is not distinct from $${i + 2 + COLS[PART].length}`).join(' and ');
        n += (await c.query(`update questions set ${sets}, updated_at=now() where id=$1 and is_active and ${conds}`, [t.id, ...COLS[PART].map((k) => t.after[k]), ...COLS[PART].map((k) => t.cur[k])])).rowCount;
      }
      if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length} — 되돌림`); process.exit(1); }
      await c.query('commit'); console.log(`[${TAG}] 썼다 ${n} · 활성 ${a0} → ${await activeCount(c)} · ${at}`);
    }
  }
} finally { await c.end().catch(() => {}); }
