#!/usr/bin/env node
// =============================================================================
// G029 C — 변형 한 번에(CV-128 (a)): V030 accept 2,800 · V031 accept 27 · V032 accept 40(add 46) → question_answers 행 추가(is_primary false)
//   사용  node scripts/g029-apply-variants.mjs --part v030|v031|v032 [--dry-run | --apply | --undo [--dry-run]] [--list]
//   넣는 글: v030 = items[].v (final.verdict accept — verdict 와 같음 · 2,800) · v031 = guess 의 괄호 앞(돌리 줌(버티고 효과) → 돌리 줌) · v032 = add[]
//   충돌 검사(넣기 전 전부 · normalizeAnswer):
//     ⓐ 그 문항의 정답·변형과 같음 → 건너뜀(이미)
//     ⓑ 다른 활성 문항의 대표 정답과 같음 → audit/g029-variants-b.json 의 판단(same = 같은 대상 → 넣음 · diff = 다른 대상 → 안 넣음 · 7절) · 판단 없으면 안 넣음(결정 필요)
//     ⓒ 다른 문항의 변형과만 같음 → 넣음
//   비활성 문항 · 빈 정규화 · 같은 묶음 안 중복은 건너뜀. 쓰기 직전 열린 판 0 · 되돌리기 audit/g029-undo-variants-<part>.json(넣은 행 id)
// =============================================================================
import { readJson, writeJson, exists, connect, guardNoOpenGames, MODE } from './g023-common.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';

const pi = process.argv.indexOf('--part');
const PART = pi > 0 ? process.argv[pi + 1] : null;
if (!['v030', 'v031', 'v032'].includes(PART)) { console.error('--part v030|v031|v032'); process.exit(1); }
const DRY = process.argv.includes('--dry-run'); const LIST = process.argv.includes('--list');
const UNDO = `g029-undo-variants-${PART}.json`;
const TAG = `g029 C ${PART}`;
const NOTE = { v030: 'G029 V030 변형', v031: 'G029 V031 변형', v032: 'G029 V032 변형' }[PART];
const arr = (o) => (Array.isArray(o) ? o : Object.values(o));
export const beforeParen = (s) => String(s ?? '').replace(/\s*[(（].*$/, '').trim();

function candidates() {
  if (PART === 'v030') return arr(readJson('v030-variants.json').items).filter((x) => (x.final?.verdict ?? x.verdict) === 'accept').map((x) => ({ id: String(x.id), text: String(x.v).trim(), rule: x.final?.rule ?? x.rule }));
  if (PART === 'v031') return arr(readJson('v031-variants.json').items).filter((x) => x.verdict === 'accept').map((x) => ({ id: String(x.id), text: beforeParen(x.guess), rule: 'V031' }));
  return readJson('v032-variants.json').items.filter((x) => x.verdict === 'accept').flatMap((x) => (x.add ?? []).map((t) => ({ id: String(x.id), text: String(t).trim(), rule: x.rule })));
}

const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, `${TAG} undo`);
    await c.query('begin'); let n = 0;
    for (const r of u.items) n += (await c.query('delete from question_answers where id=$1 and question_id=$2 and answer_text=$3 and not is_primary', [r.rowId, r.id, r.text])).rowCount;
    if (DRY) { await c.query('rollback'); console.log(`[${TAG} undo] 확인만 — 지울 행 ${n}/${u.items.length}`); } else { await c.query('commit'); console.log(`[${TAG}] 지웠다 ${n}`); }
  } else {
    const B = exists('g029-variants-b.json') ? readJson('g029-variants-b.json').items : {};
    const qa = (await c.query(`select a.question_id::text qid, a.answer_text, a.answer_norm, a.is_primary, q.is_active, q.display_answer from question_answers a join questions q on q.id=a.question_id`)).rows;
    const mine = new Map(); const primOf = new Map(); const varOf = new Map(); const active = new Map();
    for (const r of qa) {
      (mine.get(r.qid) ?? mine.set(r.qid, new Set()).get(r.qid)).add(r.answer_norm); active.set(r.qid, { a: r.is_active, d: r.display_answer });
      if (!r.is_active) continue;
      const m = r.is_primary ? primOf : varOf; (m.get(r.answer_norm) ?? m.set(r.answer_norm, []).get(r.answer_norm)).push(r.qid);
    }
    const t = { 후보: 0, 넣음: 0, a_이미: 0, b_같은대상: 0, b_다른대상: 0, b_결정필요: 0, c_변형과만: 0, 비활성: 0, 빈글: 0, 묶음중복: 0 };
    const todo = []; const bList = []; const seen = new Set();
    for (const v of candidates()) {
      t.후보++;
      const norm = normalizeAnswer(v.text); const key = `${v.id}|${norm}`;
      if (!norm) { t.빈글++; continue; }
      if (!active.get(v.id)?.a) { t.비활성++; continue; }
      if (seen.has(key)) { t.묶음중복++; continue; } seen.add(key);
      if (mine.get(v.id)?.has(norm)) { t.a_이미++; continue; }
      const others = (primOf.get(norm) ?? []).filter((q) => q !== v.id);
      if (others.length) {
        const dec = B[key]?.decision;
        const row = { key, id: v.id, answer: active.get(v.id).d, text: v.text, others: others.map((q) => `#${q} ${active.get(q).d}`), decision: dec ?? '결정 필요', why: B[key]?.why ?? null };
        bList.push(row);
        if (dec === 'same') { t.b_같은대상++; todo.push(v); } else if (dec === 'diff') t.b_다른대상++; else t.b_결정필요++;
        continue;
      }
      if ((varOf.get(norm) ?? []).some((q) => q !== v.id)) t.c_변형과만++;
      todo.push(v);
    }
    // ★ H2 막힘 가드(G029 GEN 판단): 새 변형이 그 문항의 지금 힌트에 조각으로 들어 있어 checkHint 막힘이 새로 생기면 넣지 않는다
    //   (등급 1·2 힌트는 V033 판정 중 · 4·5 힌트는 이 라운드 대상 밖이라 힌트를 고칠 수 없다 → audit/g029-variants-<part>-check.json h2 목록 · 7절 → 다음 라운드)
    const ids = [...new Set(todo.map((v) => v.id))];
    const Q = new Map((await c.query(`select q.id::text id, q.difficulty_score g, q.display_answer, q.question_text, q.general_hint, q.explanation,
        coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants from questions q where q.id = any($1::bigint[])`, [ids])).rows.map((r) => [r.id, r]));
    const h2 = []; const keep = [];
    for (const v of todo) {
      const r = Q.get(v.id);
      if (r?.general_hint) {
        const base = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation ?? '' }).block.length;
        const ck = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: [...r.variants, v.text], question: r.question_text, explanation: r.explanation ?? '' });
        if (ck.block.length > base) { h2.push({ id: v.id, grade: r.g, answer: r.display_answer, text: v.text, block: ck.block.map((b) => b.frag), hint: r.general_hint }); continue; }
      }
      keep.push(v);
    }
    todo.length = 0; todo.push(...keep); t.h2막힘 = h2.length;
    t.넣음 = todo.length;
    console.log(`[${TAG}] ${JSON.stringify(t)}`);
    for (const b of bList) console.log(`  ⓑ ${b.decision} · #${b.id} ${b.answer} + '${b.text}' = ${b.others.join(' · ')}${b.why ? ' · ' + b.why : ''}`);
    if (LIST) for (const v of todo) console.log(`  넣음 #${v.id} ${active.get(v.id).d} + '${v.text}' (${v.rule})`);
    writeJson(`g029-variants-${PART}-check.json`, { round: 'G029', part: PART, at: new Date().toISOString(), counts: t, b: bList, h2 });
    if (MODE !== 'apply') console.log(`[${TAG}] 확인만 — 쓰려면 --apply`);
    else if (todo.length) {
      if (bList.some((b) => b.decision === '결정 필요')) { console.error(`[${TAG}] ★ ⓑ 결정 필요가 남아 쓰지 않는다`); process.exit(2); }
      const at = await guardNoOpenGames(c, TAG);
      const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G029', part: PART, note: '넣은 question_answers 행 — --undo 가 지운다', items: [] };
      await c.query('begin');
      for (const v of todo) { const r = await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) returning id', [v.id, v.text, normalizeAnswer(v.text), NOTE]); undo.items.push({ id: v.id, text: v.text, rowId: Number(r.rows[0].id), at }); }
      await c.query('commit'); writeJson(UNDO, undo); console.log(`[${TAG}] 넣었다 ${todo.length} · ${at}`);
    }
  }
} finally { await c.end().catch(() => {}); }
