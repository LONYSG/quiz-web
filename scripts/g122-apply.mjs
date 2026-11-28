#!/usr/bin/env node
// =============================================================================
// G122 — gpt 가 두 번째로 고친 기존 카드 싣기(V121 ok 만) + 다시 매긴 등급 · 알가치 + 인정 답  (g121-apply 를 옮김)
//   판정 = data/pipeline/audit/v121-fix.json(done) · 고친 글 = web-desk/tone/받은것/기존-고침-02-p01.json
//   고치기 전 = web-desk/tone/보낼것/기존-고침-02-p01.json(card)
//   1-1 기존 ok 카드: V121 changedReal 칸만 고친 글로(q → question_text · hint → general_hint · exp → explanation) · 다른 칸 안 건드림
//       지금 DB 글(질문 · 정답 · 힌트 · 해설)이 보낼것 card 와 다르면 싣지 않는다
//   1-2 V121 이 등급을 준 카드: 등급 규칙 G119 — 올림 전부 · 내림 한 단계까지 · 영상 카드(회차.json)는 등급 그대로 ·
//       알가치 = V121 · 장부 grade-judged.json(at "V121") · 질문 바뀌었는데 V121 등급 없으면 안 싣는다
//   1-3 새 카드 n6887: 싣지 않는다(V121 등급 5 · 알가치 1 — 설계 G122 지시) · n 번호는 전부 건너뛴다
//   1-4 V121 add → 인정 답(note '#g122') · 다른 카드 정답과 겹치거나 질문 · 힌트에 걸리면 안 넣음
//   1-5 게이트: 힌트 검사 · 질문에 정답 드러남 · 질문 꼴(바뀐 질문만) — 막히면 안 싣고 계획 파일에
//   사용 node scripts/g122-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만 · 계획 audit/g122-plan-<db>.json)
//   ★ 멱등 · 되돌리기 audit/g122-undo-<db>.json(처음 옛 값을 지킨다) · --undo = 옛 글 · 등급 + 인정 답(note '#g122') 걷기 + 장부 옛 줄
//   dev(quizweb_dev)는 실 카드의 source_ref 로 짝 · dev 글이 보낼것과 다르면 그 카드는 dev 에서 건너뛴다
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { ROOT, guardNoOpenGames } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { checkHint } from './hint-check.mjs';
import { blankCheck, lengthCheck } from '../pipeline/lib/question-checks.mjs';
import { formHit } from './form-scan.mjs';
import { ledgerPut, ledgerRead, LEDGER } from './grade-ledger.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const dbName = a.includes('--db') ? a[a.indexOf('--db') + 1] : 'quizweb';
const TAG = 'G122';
const NOTE = 'G122 인정어(V121 블라인드 표기) #g122';
const SV = 'v121';
const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
const J = (f) => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, ''));
const key = (s) => normalizeAnswer(s).replace(/[^\p{L}\p{N}]/gu, '');
const L = (s) => [...(s ?? '')].length;
const band = (g) => (g <= 2 ? 'easy' : g === 3 ? 'medium' : 'hard');
const cli = async (name) => { const u = new URL(process.env.DATABASE_URL); u.pathname = '/' + name; const c = new pg.Client({ connectionString: u.toString() }); await c.connect(); return c; };
const FIELD = { q: 'question_text', hint: 'general_hint', exp: 'explanation' };
const GOTF = { q: 'question', hint: 'hint', exp: 'explanation' };

const V = J('data/pipeline/audit/v121-fix.json');
if (V.done !== true) { console.log('V121 기다림'); process.exit(0); }
const SEND = new Map(), GOT = new Map();
for (let i = 1; i <= 1; i++) {
  const p = `0${i}`;
  for (const x of J(`web-desk/tone/보낼것/기존-고침-02-p${p}.json`).items) SEND.set(String(x.key), { ...x, part: p });
  const g = J(`web-desk/tone/받은것/기존-고침-02-p${p}.json`); if (g.done !== true) throw new Error(`받은것 p${p} done 아님`);
  for (const x of g.cards) GOT.set(String(x.key), x);
}
const EP = J('web-desk/vscript/회차.json').episodes;

const R = await cli('quizweb');
const c = dbName === 'quizweb' ? R : await cli(dbName);
console.log(`[${TAG}] DB ${dbName} · ${mode}`);
const UNDO = AUD(`g122-undo-${dbName}.json`);
const TCOLS = ['question_text', 'general_hint', 'explanation', 'display_answer', 'hint_answer', 'difficulty_score', 'difficulty', 'difficulty_why', 'score_version', 'scored_at', 'worth', 'worth_why'];

// ── 되돌리기 ──────────────────────────────────────────────────────────────────
if (mode === 'undo') {
  await guardNoOpenGames(c, `${TAG} undo`);
  const u = J(path.relative(ROOT, UNDO));
  await c.query('begin');
  let n = 0;
  for (const [id, o] of Object.entries(u.items)) {
    n += (await c.query(`update questions set ${TCOLS.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() where id=$1`, [id, ...TCOLS.map((k) => o[k])])).rowCount;
  }
  const del = (await c.query('delete from question_answers where note = $1', [NOTE])).rowCount;
  await c.query('commit');
  if (dbName === 'quizweb' && u.ledger) {
    const Lg = ledgerRead();
    for (const [id, e] of Object.entries(u.ledger)) { if (e) Lg.items[id] = e; else delete Lg.items[id]; }
    Lg.updatedAt = new Date().toISOString();
    writeFileSync(LEDGER, JSON.stringify(Lg, null, 0).replace(/\},"/g, '},\n"') + '\n');
  }
  console.log(`[${TAG} undo] 옛 값 ${n}행 · 인정 답 걷음 ${del} · 장부 ${Object.keys(u.ledger ?? {}).length}`);
  await R.end(); if (c !== R) await c.end(); process.exit(0);
}

// ── 이 DB 의 행 ───────────────────────────────────────────────────────────────
const COLS = `id::int, source_ref, is_active, ${TCOLS.join(', ')}`;
const realAll = new Map((await R.query(`select ${COLS} from questions`)).rows.map((r) => [String(r.id), r]));
const realRef = (id) => realAll.get(String(id))?.source_ref;
let rowOf; // 실 id → 이 DB 행
if (c === R) rowOf = (id) => { const r = realAll.get(String(id)); return r?.is_active ? r : null; };
else {
  const byRef = new Map();
  for (const x of (await c.query(`select ${COLS} from questions where is_active`)).rows) { if (!byRef.has(x.source_ref)) byRef.set(x.source_ref, []); byRef.get(x.source_ref).push(x); }
  rowOf = (id) => { const m = byRef.get(realRef(id)) ?? []; return m.length === 1 ? m[0] : null; };
}
const QA = (await c.query('select id::int rid, question_id::int qid, answer_text, answer_norm, is_primary, note from question_answers')).rows;
const allQ = (await c.query('select id::int, is_active, inactive_reason, display_answer, source_ref from questions')).rows;
const qById = new Map(allQ.map((q) => [q.id, q]));
const VAR = new Map(); for (const x of QA) { if (!VAR.has(x.qid)) VAR.set(x.qid, []); VAR.get(x.qid).push(x); }
const varsOf = (id, ans) => [...new Set((VAR.get(id) ?? []).map((x) => x.answer_text).filter((s) => s !== ans))];
const OWN = new Map(); const own = (s, id) => { const k = key(s); if (!k) return; if (!OWN.has(k)) OWN.set(k, new Set()); OWN.get(k).add(id); };
for (const q of allQ) own(q.display_answer, q.id);
for (const x of QA) if (x.note !== NOTE) own(x.answer_text, x.qid);
const who = (ids) => [...ids].map((id) => { const q = qById.get(id); return `#${id} ${q.display_answer}${q.is_active ? '' : '(꺼짐)'}`; }).join(' · ');

// 영상 카드(실 id) — g119 와 같다
const VID = new Map();
const realActive = [...realAll.values()].filter((r) => r.is_active);
for (const e of EP) for (const q of e.questions ?? []) {
  if (q.id != null) { VID.set(String(q.id), e.no); continue; }
  for (const r of realActive) if (key(r.display_answer) === key(q.answer)) VID.set(String(r.id), e.no);
}

const out = { round: TAG, db: dbName, at: new Date().toISOString(), counts: {}, notLoaded: [], devSkip: [], fields: { q: 0, hint: 0, exp: 0 }, grade: [], worth: [], video: [], alias: { add: [], skipped: [] }, newSkipped: [], skippedVerdict: {} };

// 질문 꼴 게이트(바뀐 질문 · 새 카드)
const qGate = (q, ans) => {
  const f = [];
  const bc = blankCheck(q, ans); if (!bc.ok) f.push(`④ 빈칸 ${bc.blanks} ≠ ${bc.answerLength}`);
  const lc = lengthCheck(q); if (!lc.ok) f.push(`④ 질문 ${lc.length}자`);
  if (L(q) > 200) f.push(`④ 질문 ${L(q)}자 > 200`);
  if (!/까요\?\s*$/.test(q)) f.push('④ 질문 끝이 ~까요? 아님');
  const fh = formHit(q); if (fh) f.push(`④ 질문 형태 '${fh}'`);
  return f;
};

// ── 1-1 · 1-2 기존 카드 ───────────────────────────────────────────────────────
const todo = []; // { id, rid, before, after, ledger? }
const gradeMove = { up: 0, same: 0, down1: 0, down2: 0, video: 0 };
for (const [k, v] of Object.entries(V.cards)) {
  if (k.startsWith('n')) { out.newSkipped.push({ key: k, why: `안 실음(등급 ${v.grade} · 알가치 ${v.worth}) — 설계 G122 1-3` }); continue; }
  if (v.verdict !== 'ok') { out.skippedVerdict[v.verdict] = (out.skippedVerdict[v.verdict] ?? 0) + 1; continue; }
  const s = SEND.get(k), g = GOT.get(k);
  if (!s || !g || g.status !== 'ready') throw new Error(`보낼것 · 받은것 없음 ${k}`);
  const r = rowOf(k);
  if (!r) { (c === R ? out.notLoaded : out.devSkip).push({ id: k, why: c === R ? '지금 활성 아님' : 'dev 짝 없음' }); continue; }
  const cd = s.card;
  const cur = { q: r.question_text, hint: r.general_hint ?? '', exp: r.explanation ?? '' };
  const nt = { q: cd.question, hint: cd.hint ?? '', exp: cd.explanation ?? '' };
  const ch = v.changedReal ?? [];
  const fixed = { ...nt }; for (const f of ch) fixed[f] = g[GOTF[f]];
  const already = ch.every((f) => cur[f] === fixed[f]) && Object.keys(nt).filter((f) => !ch.includes(f)).every((f) => cur[f] === nt[f]);
  if (!already && (r.display_answer !== cd.answer || Object.keys(nt).some((f) => cur[f] !== nt[f]))) {
    const diff = ['q', 'hint', 'exp'].filter((f) => cur[f] !== nt[f]).concat(r.display_answer !== cd.answer ? ['answer'] : []);
    (c === R ? out.notLoaded : out.devSkip).push({ id: k, why: `지금 DB 글이 보낼것과 다름(${diff.join('·')})` });
    continue;
  }
  // 게이트
  const ans = r.display_answer, vars = varsOf(r.id, ans);
  const fail = [];
  for (const f of ch) if (!String(fixed[f] ?? '').trim()) fail.push(`⑤ ${f} 빔`);
  if (fixed.hint.trim()) {
    const hc = checkHint({ hint: fixed.hint, answer: ans, variants: vars, question: fixed.q, explanation: fixed.exp });
    if (hc.block.length) fail.push(`③ 힌트 막힘 ${[...new Set(hc.block.map((b) => b.frag))].join('·')}`);
    if (L(fixed.hint) > 120) fail.push(`③ 힌트 ${L(fixed.hint)}자 > 120`);
  }
  if (ch.includes('q')) {
    const ga = checkAnswerSet(fixed.q, ans, vars, normalizeAnswer, {});
    if (ga.blocked.length) fail.push(`② 질문에 정답 드러남 ${ga.blocked.map((b) => b.answer).join('·')}`);
    fail.push(...qGate(fixed.q, ans));
  }
  // 등급
  const hasG = v.grade != null;
  if (ch.includes('q') && !hasG) fail.push('질문 바뀜 · V121 등급 없음');
  if (fail.length) { (c === R ? out.notLoaded : out.devSkip).push({ id: k, answer: ans, why: fail.join(' / '), gate: true }); continue; }
  const after = {}; const before = Object.fromEntries(TCOLS.map((x) => [x, r[x]]));
  for (const f of ch) after[FIELD[f]] = fixed[f];
  let led = null;
  if (hasG) {
    const was = cd.grade; let gg = v.grade, why = `${v.gradeWhy} — #g122`;
    const vid = VID.get(k);
    if (vid != null) { gg = r.difficulty_score; why = r.difficulty_why; gradeMove.video++; out.video.push({ id: +k, ep: vid, answer: ans, grade: r.difficulty_score, v121: v.grade }); }
    else if (gg > was) gradeMove.up++;
    else if (gg === was) gradeMove.same++;
    else if (was - gg === 1) gradeMove.down1++;
    else { why = `${was - 1} — V121 은 ${gg}(두 단계 넘는 내림은 한 단계만 · G119) · ${v.gradeWhy} — #g122`; gg = was - 1; gradeMove.down2++; }
    if (c !== R && vid == null) { /* dev 도 같은 값 */ }
    Object.assign(after, { difficulty_score: gg, difficulty: band(gg), difficulty_why: why, score_version: SV, worth: v.worth, worth_why: `${v.worthKind} — ${v.worthWhy}` });
    out.grade.push({ id: +k, answer: ans, q: ch.includes('q'), was, v121: v.grade, now: gg, video: vid != null || undefined });
    if ((cd.worth ?? null) !== v.worth) out.worth.push({ id: +k, was: cd.worth, now: v.worth });
    led = { id: k, question: fixed.q, grade: gg, worth: v.worth, at: 'V121' };
  }
  for (const f of ch) out.fields[f]++;
  const same = Object.entries(after).every(([x, val]) => r[x] === val);
  todo.push({ id: r.id, rid: k, ch, before, after, same, led });
}

// ── 1-4 인정 답(기존 카드) ────────────────────────────────────────
const aliasTodo = [];
const aliasGate = (r, v, qText, hint, exp, selfKeys = []) => {
  const vars = varsOf(r?.id ?? -1, r?.display_answer);
  if (vars.includes(v)) return 'already';
  const hit = [...(OWN.get(key(v)) ?? [])].filter((x) => x !== r?.id && !selfKeys.includes(x));
  if (hit.length) return `다른 카드와 겹침 ${who(hit)}`;
  if (key(qText).includes(key(v))) return '질문에 드러남';
  if (hint) {
    const h1 = checkHint({ hint, answer: r?.display_answer ?? '', variants: [...vars, v], question: qText, explanation: exp ?? '' });
    const h0 = checkHint({ hint, answer: r?.display_answer ?? '', variants: vars, question: qText, explanation: exp ?? '' });
    if (h1.block.length > h0.block.length) return `힌트 막힘 ${h1.block.map((b) => b.frag).join('·')}`;
  }
  return null;
};
for (const [k, v] of Object.entries(V.cards)) {
  if (!v.add || k.startsWith('n') || v.verdict !== 'ok') continue;
  const t = todo.find((x) => x.rid === k); const r = rowOf(k);
  if (!t || !r) { out.alias.skipped.push({ id: k, v: v.addText, why: '카드를 싣지 않음' }); continue; }
  const q = t.after.question_text ?? r.question_text, h = t.after.general_hint ?? r.general_hint, e = t.after.explanation ?? r.explanation;
  const why = aliasGate(r, v.addText, q, h, e);
  if (why === 'already') { out.alias.add.push({ id: k, v: v.addText, already: true }); continue; }
  if (why) { out.alias.skipped.push({ id: k, v: v.addText, why }); continue; }
  aliasTodo.push({ id: r.id, rid: k, v: v.addText, note: NOTE });
  out.alias.add.push({ id: k, v: v.addText });
}

const W = todo.filter((t) => !t.same);
out.counts = {
  v121: Object.keys(V.cards).length, okOld: todo.length + out.notLoaded.filter((x) => !String(x.id).startsWith('n')).length + out.devSkip.length, toWriteOld: W.length, alreadyOld: todo.length - W.length,
  notLoaded: out.notLoaded.length, devSkip: out.devSkip.length, fields: out.fields, fieldSum: out.fields.q + out.fields.hint + out.fields.exp,
  graded: out.grade.length, qChanged: todo.filter((t) => t.ch.includes('q')).length, gradeMove, worthChanged: out.worth.length,
  alias: aliasTodo.length, aliasSkipped: out.alias.skipped.length, skippedVerdict: out.skippedVerdict,
};
writeFileSync(AUD(`g122-plan-${dbName}.json`), JSON.stringify({ ...out, todo: todo.map((t) => ({ id: t.id, rid: t.rid, ch: t.ch, same: t.same || undefined, after: Object.fromEntries(Object.entries(t.after).filter(([x]) => !['question_text', 'general_hint', 'explanation'].includes(x))) })) }, null, 1) + '\n');
console.log(`[${TAG}] ${JSON.stringify(out.counts)}`);
for (const x of out.notLoaded) console.log(`  ✗ ${x.id} ${x.answer ?? ''}: ${x.why}`);
for (const x of out.devSkip.slice(0, 30)) console.log(`  dev 건너뜀 ${x.id}: ${x.why}`);
for (const x of out.alias.skipped) console.log(`  인정 답 안 넣음 ${x.id} ${x.v}: ${x.why}`);

if (mode !== 'apply') { console.log(`[${TAG}] 확인만 — 쓰려면 --apply`); await R.end(); if (c !== R) await c.end(); process.exit(0); }

// ── 쓰기(한 트랜잭션) ─────────────────────────────────────────────────────────
const at = await guardNoOpenGames(c, TAG);
const undo = existsSync(UNDO) ? J(path.relative(ROOT, UNDO)) : { round: TAG, db: dbName, note: `옛 값 — node scripts/g122-apply.mjs${dbName === 'quizweb' ? '' : ' --db ' + dbName} --undo`, items: {}, ledger: {} };
for (const t of W) if (!undo.items[t.id]) undo.items[t.id] = t.before;
const Lg0 = ledgerRead().items;
const ledRows = todo.filter((t) => t.led).map((t) => t.led);
if (dbName === 'quizweb') for (const l of ledRows) if (!(l.id in undo.ledger)) undo.ledger[l.id] = Lg0[l.id] ?? null;
undo.writtenAt = at;
writeFileSync(UNDO, JSON.stringify(undo, null, 0).replace(/\},"/g, '},\n"') + '\n');
await c.query('begin');
try {
  let n = 0;
  for (const t of W) {
    const ks = Object.keys(t.after);
    n += (await c.query(`update questions set ${ks.map((x, i) => `${x}=$${i + 2}`).join(', ')}${ks.includes('difficulty_score') ? ', scored_at=now()' : ''}, updated_at=now() where id=$1 and is_active`, [t.id, ...ks.map((x) => t.after[x])])).rowCount;
  }
  if (n !== W.length) throw new Error(`쓴 수 ${n}/${W.length}`);
  for (const x of aliasTodo) await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing`, [x.id, x.v, normalizeAnswer(x.v), x.note]);
  await c.query('commit');
} catch (err) { await c.query('rollback'); console.error(`★ 되돌렸다 — ${err.message}`); await R.end(); if (c !== R) await c.end(); process.exit(1); }
console.log(`[${TAG}] 썼다 — 기존 ${W.length} · 인정 답 ${aliasTodo.length} · ${at}`);
if (dbName === 'quizweb') console.log(`[${TAG}] 장부 ${ledgerPut(ledRows, 'quizweb')}줄`);
await R.end(); if (c !== R) await c.end();
