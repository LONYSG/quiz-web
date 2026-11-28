#!/usr/bin/env node
// =============================================================================
// G121 — gpt 가 고친 기존 카드 싣기(V120 ok 만) + 다시 매긴 등급 · 알가치 + 새 카드 12 + 인정 답 + #5024 표기
//   판정 = data/pipeline/audit/v120-fix.json(done) · 고친 글 = web-desk/tone/받은것/기존-고침-01-p01~p08.json
//   고치기 전 = web-desk/tone/보낼것/기존-고침-01-p01~p08.json(card)
//   1-1 기존 ok 카드: V120 changedReal 칸만 고친 글로(q → question_text · hint → general_hint · exp → explanation) · 다른 칸 안 건드림
//       지금 DB 글(질문 · 정답 · 힌트 · 해설)이 보낼것 card 와 다르면 싣지 않는다
//   1-2 V120 이 등급을 준 카드(질문 바뀐 29 + needsRegrade 로 다시 본 2): 등급 규칙 G119 — 올림 전부 · 내림 한 단계까지 ·
//       영상 카드(회차.json)는 등급 그대로 · 알가치 = V120 · 장부 grade-judged.json(at "V120") · 질문 바뀌었는데 V120 등급 없으면 안 싣는다
//   1-3 새 카드(n 번호 · V116 fix → gpt 고침 → V120 ok 12): 아직 안 실림 → g118-apply 꼴로 새로 싣는다(꼬리표 '#g121-')
//       소분류 = g121-raw/leaf.txt(GEN 판단) · 등급 · 알가치 = V120
//   1-4 V120 add(블라인드 같은 대상 다른 표기) → 인정 답(note '#g121') · 다른 카드 정답과 겹치거나 질문 · 힌트에 걸리면 안 넣음
//   1-5 #5024: 정답 우르크(작품 표기) · 인정 답 우루크(V120 spelling) — 질문 글에 정답 표기가 없어 등급 그대로
//   1-6 게이트: 힌트 검사 · 질문에 정답 드러남 · 질문 꼴(바뀐 질문만) · 같은 정답 겹침(새 카드 · 정답 바뀜) — 막히면 안 싣고 계획 파일에
//   사용 node scripts/g121-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만 · 계획 audit/g121-plan-<db>.json)
//   ★ 멱등: 이미 고친 글 · 같은 값이면 건너뛴다 · 되돌리기 audit/g121-undo-<db>.json(처음 옛 값을 지킨다) ·
//     --undo = 옛 글 · 등급 · 정답 + 인정 답(note '#g121') 걷기 + 새 카드(#g121-) 지우기/끄기 + 장부 옛 줄
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
const TAG = 'G121';
const NOTE = 'G121 인정어(V120 블라인드 표기) #g121';
const NOTE_SP = 'G121 표기(V120 spelling) #g121';
const MARK = '#g121-';
const SV = 'v120';
const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
const J = (f) => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, ''));
const key = (s) => normalizeAnswer(s).replace(/[^\p{L}\p{N}]/gu, '');
const L = (s) => [...(s ?? '')].length;
const band = (g) => (g <= 2 ? 'easy' : g === 3 ? 'medium' : 'hard');
const cli = async (name) => { const u = new URL(process.env.DATABASE_URL); u.pathname = '/' + name; const c = new pg.Client({ connectionString: u.toString() }); await c.connect(); return c; };
const FIELD = { q: 'question_text', hint: 'general_hint', exp: 'explanation' };
const GOTF = { q: 'question', hint: 'hint', exp: 'explanation' };

const V = J('data/pipeline/audit/v120-fix.json');
if (V.done !== true) { console.log('V120 기다림'); process.exit(0); }
const SEND = new Map(), GOT = new Map();
for (let i = 1; i <= 8; i++) {
  const p = `0${i}`;
  for (const x of J(`web-desk/tone/보낼것/기존-고침-01-p${p}.json`).items) SEND.set(String(x.key), { ...x, part: p });
  const g = J(`web-desk/tone/받은것/기존-고침-01-p${p}.json`); if (g.done !== true) throw new Error(`받은것 p${p} done 아님`);
  for (const x of g.cards) GOT.set(String(x.key), x);
}
const EP = J('web-desk/vscript/회차.json').episodes;
const V116 = new Map(J('data/pipeline/audit/v116-newcards.json').cards.map((r) => [r.key, r]));
const LEAF = new Map(readFileSync(AUD('g121-raw/leaf.txt'), 'utf8').split(/\r?\n/).filter((l) => /^n\d{4} /.test(l)).map((l) => { const [k, n, q] = l.split(/\s+/); return [k, { n: Number(n), odd: q === '?' }]; }));
const VIDEO = new Set([...JSON.stringify(J('web-desk/vscript/회차.json')).matchAll(/"answer":"([^"]+)"/g)].map((x) => x[1]).concat(['에펠탑', '플로지스톤', '노시보 효과', '청진기']).map(key));

const R = await cli('quizweb');
const c = dbName === 'quizweb' ? R : await cli(dbName);
console.log(`[${TAG}] DB ${dbName} · ${mode}`);
const UNDO = AUD(`g121-undo-${dbName}.json`);
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
  const del = (await c.query('delete from question_answers where note in ($1,$2)', [NOTE, NOTE_SP])).rowCount;
  for (const x of u.answerRows ?? []) await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,$4,$5) on conflict do nothing`, [x.question_id, x.answer_text, x.answer_norm, x.is_primary, x.note]);
  const rows = (await c.query(`select q.id::int,
      exists(select 1 from game_questions g where g.question_id=q.id) or exists(select 1 from answer_events e where e.question_id=q.id)
      or exists(select 1 from question_feedback f where f.question_id=q.id) or exists(select 1 from near_misses n where n.question_id=q.id)
      or exists(select 1 from play_events p where p.question_id=q.id) used
    from questions q where q.source_id='seed-gen' and q.source_ref like $1`, [`%${MARK}%`])).rows;
  let delQ = 0, off = 0;
  for (const r of rows) {
    if (r.used) { off += (await c.query(`update questions set is_active=false, inactive_reason='g121_undo', updated_at=now() where id=$1`, [r.id])).rowCount; continue; }
    delQ += (await c.query('delete from questions where id=$1', [r.id])).rowCount;
  }
  await c.query('commit');
  if (dbName === 'quizweb' && u.ledger) {
    const Lg = ledgerRead();
    for (const [id, e] of Object.entries(u.ledger)) { if (e) Lg.items[id] = e; else delete Lg.items[id]; }
    Lg.updatedAt = new Date().toISOString();
    writeFileSync(LEDGER, JSON.stringify(Lg, null, 0).replace(/\},"/g, '},\n"') + '\n');
  }
  console.log(`[${TAG} undo] 옛 값 ${n}행 · 인정 답 걷음 ${del} · 되살린 정답 줄 ${(u.answerRows ?? []).length} · 새 카드 지움 ${delQ} · 끔 ${off} · 장부 ${Object.keys(u.ledger ?? {}).length}`);
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
const loadedRef = new Map();
for (const q of allQ) { if (q.source_ref?.includes(MARK)) { loadedRef.set(q.source_ref.split(MARK)[1], q.id); continue; } own(q.display_answer, q.id); }
for (const x of QA) if (x.note !== NOTE && x.note !== NOTE_SP && !qById.get(x.qid)?.source_ref?.includes(MARK)) own(x.answer_text, x.qid);
const who = (ids) => [...ids].map((id) => { const q = qById.get(id); return `#${id} ${q.display_answer}${q.is_active ? '' : '(꺼짐)'}`; }).join(' · ');

// 영상 카드(실 id) — g119 와 같다
const VID = new Map();
const realActive = [...realAll.values()].filter((r) => r.is_active);
for (const e of EP) for (const q of e.questions ?? []) {
  if (q.id != null) { VID.set(String(q.id), e.no); continue; }
  for (const r of realActive) if (key(r.display_answer) === key(q.answer)) VID.set(String(r.id), e.no);
}

const out = { round: TAG, db: dbName, at: new Date().toISOString(), counts: {}, notLoaded: [], devSkip: [], fields: { q: 0, hint: 0, exp: 0 }, grade: [], worth: [], video: [], alias: { add: [], skipped: [] }, spelling: null, newCards: [], skippedVerdict: {} };

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
  if (k.startsWith('n')) continue;
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
  if (ch.includes('q') && !hasG) fail.push('질문 바뀜 · V120 등급 없음');
  if (fail.length) { (c === R ? out.notLoaded : out.devSkip).push({ id: k, answer: ans, why: fail.join(' / '), gate: true }); continue; }
  const after = {}; const before = Object.fromEntries(TCOLS.map((x) => [x, r[x]]));
  for (const f of ch) after[FIELD[f]] = fixed[f];
  let led = null;
  if (hasG) {
    const was = cd.grade; let gg = v.grade, why = `${v.gradeWhy} — #g121`;
    const vid = VID.get(k);
    if (vid != null) { gg = r.difficulty_score; why = r.difficulty_why; gradeMove.video++; out.video.push({ id: +k, ep: vid, answer: ans, grade: r.difficulty_score, v120: v.grade }); }
    else if (gg > was) gradeMove.up++;
    else if (gg === was) gradeMove.same++;
    else if (was - gg === 1) gradeMove.down1++;
    else { why = `${was - 1} — V120 은 ${gg}(두 단계 넘는 내림은 한 단계만 · G119) · ${v.gradeWhy} — #g121`; gg = was - 1; gradeMove.down2++; }
    if (c !== R && vid == null) { /* dev 도 같은 값 */ }
    Object.assign(after, { difficulty_score: gg, difficulty: band(gg), difficulty_why: why, score_version: SV, worth: v.worth, worth_why: `${v.worthKind} — ${v.worthWhy}` });
    out.grade.push({ id: +k, answer: ans, q: ch.includes('q'), was, v120: v.grade, now: gg, video: vid != null || undefined });
    if ((cd.worth ?? null) !== v.worth) out.worth.push({ id: +k, was: cd.worth, now: v.worth });
    led = { id: k, question: fixed.q, grade: gg, worth: v.worth, at: 'V120' };
  }
  for (const f of ch) out.fields[f]++;
  const same = Object.entries(after).every(([x, val]) => r[x] === val);
  todo.push({ id: r.id, rid: k, ch, before, after, same, led });
}

// ── 1-4 인정 답(기존 카드) · 1-5 #5024 ────────────────────────────────────────
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
// #5024
let sp = null;
{
  const [id, s] = Object.entries(V.spelling ?? {})[0] ?? [];
  const r = id ? rowOf(id) : null;
  if (r) {
    const rows = VAR.get(r.id) ?? [];
    const fail = [];
    const hit = [...(OWN.get(key(s.answer)) ?? [])].filter((x) => x !== r.id); if (hit.length) fail.push(`겹침 ${who(hit)}`);
    if (key(r.question_text).includes(key(s.answer)) || s.also.some((x) => key(r.question_text).includes(key(x)))) fail.push('질문에 표기 드러남');
    if (r.general_hint) { const hc = checkHint({ hint: r.general_hint, answer: s.answer, variants: s.also, question: r.question_text, explanation: r.explanation ?? '' }); if (hc.block.length) fail.push(`힌트 막힘 ${hc.block.map((b) => b.frag).join('·')}`); }
    const done = r.display_answer === s.answer && rows.some((x) => x.is_primary && x.answer_text === s.answer) && s.also.every((x) => rows.some((y) => !y.is_primary && y.answer_text === x));
    sp = { id: r.id, rid: id, from: r.display_answer, to: s.answer, also: s.also, fail, done, before: Object.fromEntries(TCOLS.map((x) => [x, r[x]])), rows };
    out.spelling = { id: +id, from: r.display_answer, to: s.answer, also: s.also, fail, done };
  } else out.spelling = { id, why: '이 DB 에 짝 없음' };
}

// ── 1-3 새 카드 ───────────────────────────────────────────────────────────────
const tree = (await c.query('select id::int, key, name_ko, parent_id::int, level from categories')).rows;
const byId = new Map(tree.map((r) => [r.id, r]));
const midOf = new Map(tree.filter((r) => r.level === 2).map((r) => [`${byId.get(r.parent_id).name_ko}>${r.name_ko}`, r]));
const leafByKey = new Map(tree.filter((r) => r.level === 3).map((r) => [r.key, r]));
const newPlan = [];
for (const [k, v] of Object.entries(V.cards)) {
  if (!k.startsWith('n')) continue;
  if (v.verdict !== 'ok') { out.skippedVerdict['new-' + v.verdict] = (out.skippedVerdict['new-' + v.verdict] ?? 0) + 1; continue; }
  const s = SEND.get(k), g = GOT.get(k); const cd = s.card, m = s.material, r6 = V116.get(k);
  const ch = v.changedReal ?? [];
  const q = ch.includes('q') ? g.question : cd.question, h = ch.includes('hint') ? g.hint : cd.hint, e = ch.includes('exp') ? g.explanation : cd.explanation;
  const ans = cd.answer;
  const fail = [];
  const hit = OWN.get(key(ans)); if (hit) fail.push(`① 정답 겹침 ${who(hit)}`);
  const mid = midOf.get(`${m.major}>${m.mid}`); const lf = LEAF.get(k);
  const leaf = mid && lf ? leafByKey.get(`L3:${mid.key.slice(3)}#${lf.n}`) : null;
  if (!leaf || leaf.parent_id !== mid.id) fail.push(`분류 없음 ${m.major}>${m.mid} #${lf?.n}`);
  let variants = [...new Set([...(cd.also ?? []), ...(s.alsoAdd ?? r6?.alsoAdd ?? []), ...(v.add ? [v.addText] : [])])].filter((x) => x && x.trim() && x !== ans);
  const cut = [];
  variants = variants.filter((x) => {
    if (key(x) === key(ans)) { cut.push({ v: x, why: '정답과 같은 열쇠' }); return false; }
    const hh = OWN.get(key(x)); if (hh) { cut.push({ v: x, why: `다른 문항과 겹침 ${who(hh)}` }); return false; }
    return true;
  });
  const ga = checkAnswerSet(q, ans, variants, normalizeAnswer, {});
  if (ga.blocked.some((b) => b.answer === ans)) fail.push(`② 질문에 정답 "${ans}"`);
  for (const b of ga.blocked.filter((b) => b.answer !== ans)) cut.push({ v: b.answer, why: '질문에 드러남' });
  for (const d of ga.dropped) cut.push({ v: d.answer, why: `${d.kind} — ${d.why}` });
  const cs = new Set(cut.map((x) => x.v)); variants = variants.filter((x) => !cs.has(x));
  if (!h?.trim() || !e?.trim()) fail.push('⑤ 힌트 · 해설 빔');
  if (h?.trim()) {
    let hc = checkHint({ hint: h, answer: ans, variants, question: q, explanation: e });
    const byVar = hc.block.filter((b) => b.of && b.of !== ans && variants.includes(b.of));
    if (byVar.length) { const d = new Set(byVar.map((b) => b.of)); for (const x of d) cut.push({ v: x, why: '힌트 막힘(인정어 조각)' }); variants = variants.filter((x) => !d.has(x)); hc = checkHint({ hint: h, answer: ans, variants, question: q, explanation: e }); }
    if (hc.block.length) fail.push(`③ 힌트 막힘 ${[...new Set(hc.block.map((b) => b.frag))].join('·')}`);
    if (L(h) > 120) fail.push(`③ 힌트 ${L(h)}자`);
  }
  fail.push(...qGate(q, ans));
  if (!(v.grade >= 1 && v.grade <= 5)) fail.push(`등급 ${v.grade}`);
  const vh = [ans, ...variants].filter((x) => VIDEO.has(key(x))); if (vh.length) fail.push(`⑥ 영상 정답과 겹침 ${vh.join('·')}`);
  if (v.add) { if (variants.includes(v.addText)) out.alias.add.push({ id: k, v: v.addText, newCard: true }); else out.alias.skipped.push({ id: k, v: v.addText, why: cut.find((x) => x.v === v.addText)?.why ?? '?' }); }
  if (fail.length) { out.notLoaded.push({ id: k, answer: ans, why: fail.join(' / '), gate: true }); continue; }
  const already = loadedRef.get(k) ?? null;
  const ref = `${mid.key.slice(3)}/${lf.n}${MARK}${k}`;
  newPlan.push({ key: k, already, ref, chunk: r6?.chunk, answer: ans, variants, cut, grade: v.grade, gradeWhy: v.gradeWhy, worth: v.worth, worthWhy: `${v.worthKind} — ${v.worthWhy}`, leafId: leaf.id, cat: `${m.major} > ${m.mid} > ${leaf.name_ko}`, odd: lf.odd, question: q, hint: h, explanation: e, ch, v, r6, m });
  out.newCards.push({ key: k, id: already ?? undefined, answer: ans, grade: v.grade, worth: v.worth, cat: `${m.major} > ${m.mid} > ${leaf.name_ko}`, changed: ch, variants, cut: cut.length ? cut : undefined });
}

const W = todo.filter((t) => !t.same);
out.counts = {
  v120: Object.keys(V.cards).length, okOld: todo.length + out.notLoaded.filter((x) => !String(x.id).startsWith('n')).length + out.devSkip.length, toWriteOld: W.length, alreadyOld: todo.length - W.length,
  notLoaded: out.notLoaded.length, devSkip: out.devSkip.length, fields: out.fields, fieldSum: out.fields.q + out.fields.hint + out.fields.exp,
  graded: out.grade.length, qChanged: todo.filter((t) => t.ch.includes('q')).length, gradeMove, worthChanged: out.worth.length,
  newCards: newPlan.length, newToWrite: newPlan.filter((p) => !p.already).length, alias: aliasTodo.length, aliasSkipped: out.alias.skipped.length, skippedVerdict: out.skippedVerdict,
};
writeFileSync(AUD(`g121-plan-${dbName}.json`), JSON.stringify({ ...out, todo: todo.map((t) => ({ id: t.id, rid: t.rid, ch: t.ch, same: t.same || undefined, after: Object.fromEntries(Object.entries(t.after).filter(([x]) => !['question_text', 'general_hint', 'explanation'].includes(x))) })) }, null, 1) + '\n');
console.log(`[${TAG}] ${JSON.stringify(out.counts)}`);
for (const x of out.notLoaded) console.log(`  ✗ ${x.id} ${x.answer ?? ''}: ${x.why}`);
for (const x of out.devSkip.slice(0, 30)) console.log(`  dev 건너뜀 ${x.id}: ${x.why}`);
for (const x of out.alias.skipped) console.log(`  인정 답 안 넣음 ${x.id} ${x.v}: ${x.why}`);
console.log(`  #5024 ${JSON.stringify(out.spelling)}`);

if (mode !== 'apply') { console.log(`[${TAG}] 확인만 — 쓰려면 --apply`); await R.end(); if (c !== R) await c.end(); process.exit(0); }

// ── 쓰기(한 트랜잭션) ─────────────────────────────────────────────────────────
const at = await guardNoOpenGames(c, TAG);
const undo = existsSync(UNDO) ? J(path.relative(ROOT, UNDO)) : { round: TAG, db: dbName, note: `옛 값 — node scripts/g121-apply.mjs${dbName === 'quizweb' ? '' : ' --db ' + dbName} --undo`, items: {}, answerRows: [], ledger: {} };
for (const t of W) if (!undo.items[t.id]) undo.items[t.id] = t.before;
if (sp && !sp.done && !sp.fail.length) {
  if (!undo.items[sp.id]) undo.items[sp.id] = sp.before;
  if (!undo.answerRows.length) undo.answerRows = sp.rows.map((x) => ({ question_id: x.qid, answer_text: x.answer_text, answer_norm: x.answer_norm, is_primary: x.is_primary, note: x.note }));
}
const Lg0 = ledgerRead().items;
const ledRows = todo.filter((t) => t.led).map((t) => t.led);
if (dbName === 'quizweb') for (const l of ledRows) if (!(l.id in undo.ledger)) undo.ledger[l.id] = Lg0[l.id] ?? null;
undo.writtenAt = at;
writeFileSync(UNDO, JSON.stringify(undo, null, 0).replace(/\},"/g, '},\n"') + '\n');
const ids = {};
await c.query('begin');
try {
  let n = 0;
  for (const t of W) {
    const ks = Object.keys(t.after);
    n += (await c.query(`update questions set ${ks.map((x, i) => `${x}=$${i + 2}`).join(', ')}${ks.includes('difficulty_score') ? ', scored_at=now()' : ''}, updated_at=now() where id=$1 and is_active`, [t.id, ...ks.map((x) => t.after[x])])).rowCount;
  }
  if (n !== W.length) throw new Error(`쓴 수 ${n}/${W.length}`);
  for (const x of aliasTodo) await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing`, [x.id, x.v, normalizeAnswer(x.v), x.note]);
  if (sp && !sp.done && !sp.fail.length) {
    await c.query(`update questions set display_answer=$2, hint_answer=$2, updated_at=now() where id=$1`, [sp.id, sp.to]);
    await c.query(`delete from question_answers where question_id=$1 and (answer_norm=$2 or answer_norm = any($3))`, [sp.id, normalizeAnswer(sp.to), sp.also.map(normalizeAnswer)]);
    await c.query(`update question_answers set is_primary=false where question_id=$1 and is_primary`, [sp.id]);
    await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,true,$4)`, [sp.id, sp.to, normalizeAnswer(sp.to), NOTE_SP]);
    for (const x of sp.also) await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing`, [sp.id, x, normalizeAnswer(x), NOTE_SP]);
  }
  for (const p of newPlan.filter((x) => !x.already)) {
    const id = (await c.query(
      `insert into questions (question_type, question_text, display_answer, hint_answer, answer_lang, category_id, difficulty, explanation,
         source_id, source_ref, license, status, is_active, approved_at, difficulty_score, difficulty_why, score_version, scored_at, general_hint, general_hint_version, worth, worth_why)
       values ('short_answer',$1,$2,$2,'ko',$3,$4,$5,'seed-gen',$6,null,'approved',true,now(),$7,$8,$9,now(),$10,'card-v1',$11,$12) returning id::int`,
      [p.question, p.answer, p.leafId, band(p.grade), p.explanation, p.ref, p.grade, `${p.gradeWhy} — V120 · ${TAG}`, SV, p.hint, p.worth, p.worthWhy])).rows[0].id;
    ids[p.key] = id;
    await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,true,$4)`, [id, p.answer, normalizeAnswer(p.answer), `${TAG} 정답`]);
    for (const x of p.variants) await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing`, [id, x, normalizeAnswer(x), p.v.add && x === p.v.addText ? NOTE : `${TAG} 인정어`]);
    await c.query(`insert into review_queue (question_id, ai_model, ai_confidence, ai_flags, backcheck_answer, backcheck_result, rule_flags, reviewer_note, reviewed_at)
       values ($1,$2,null,$3,$4,$5,$6,$7, now()) on conflict (question_id) do nothing`,
      [id, 'gpt(Codex) 카드 · Claude V116 사실 확인 → gpt 기존-고침-01 → Claude V120',
        JSON.stringify({ v116: { verdict: p.r6?.verdict, why: p.r6?.why }, v120: { verdict: p.v.verdict, changedReal: p.ch, blind: p.v.blind, blindAnswer: p.v.blindAnswer }, key: p.key, material: p.chunk ? `새재료-${p.chunk}` : null }),
        p.v.blindAnswer ?? null, p.v.blind === 'match' || p.v.blind === '정답' ? 'pass' : p.v.blind === 'same' ? 'ambiguous' : 'mismatch',
        JSON.stringify({ round: 'g121', leafOdd: p.odd || undefined }),
        `${TAG} 새 카드 ${p.key} · 재료 새재료-${p.chunk} · V116 fix → gpt 고침(${p.ch.join('·')}) → V120 ok`]);
  }
  await c.query('commit');
} catch (err) { await c.query('rollback'); console.error(`★ 되돌렸다 — ${err.message}`); await R.end(); if (c !== R) await c.end(); process.exit(1); }
console.log(`[${TAG}] 썼다 — 기존 ${W.length} · 인정 답 ${aliasTodo.length} · #5024 ${sp && !sp.done && !sp.fail.length ? '바꿈' : '그대로'} · 새 카드 ${Object.keys(ids).length} · ${at}`);
if (Object.keys(ids).length) {
  const SRC = AUD('g121-sources.json');
  const src = existsSync(SRC) ? J(path.relative(ROOT, SRC)) : { round: TAG, note: '새 카드 출처 — 재료(새재료)의 core · story · hintIdea · ids = DB 별 문항 id', items: {} };
  for (const p of newPlan.filter((x) => ids[x.key])) {
    const it = (src.items[p.key] ??= { answer: p.answer, ids: {}, core: p.m.core, story: p.m.story, hintIdea: p.m.hintIdea ?? null });
    it.ids[dbName] = ids[p.key];
    it.urls = [...new Set([p.m.core?.url, ...(p.m.story ?? []).map((s) => s.url), p.m.hintIdea?.url].filter(Boolean))];
  }
  writeFileSync(SRC, JSON.stringify(src, null, 1) + '\n');
}
if (dbName === 'quizweb') {
  const newLed = newPlan.filter((p) => ids[p.key]).map((p) => ({ id: ids[p.key], question: p.question, grade: p.grade, worth: p.worth, at: 'V120' }));
  for (const l of newLed) if (!(String(l.id) in undo.ledger)) undo.ledger[String(l.id)] = null;
  writeFileSync(UNDO, JSON.stringify(undo, null, 0).replace(/\},"/g, '},\n"') + '\n');
  console.log(`[${TAG}] 장부 ${ledgerPut([...ledRows, ...newLed], 'quizweb')}줄`);
}
await R.end(); if (c !== R) await c.end();
