#!/usr/bin/env node
// =============================================================================
// G119 — V117 등급 · 알가치 싣기 + 블라인드 표기(alias) 인정 답 + 등급 장부(grade-judged.json)
//   값 = data/pipeline/audit/v117-regrade.json(cards 8,509 · 키 = 실 DB id) · 그때 문장 = v117-raw/targets.json
//   ★ 카드 글(질문 · 힌트 · 해설)은 한 글자도 고치지 않는다 — 쓰는 칸 = 등급(difficulty_score · difficulty · difficulty_why) ·
//     score_version · scored_at · 알가치(worth · worth_why) · 인정 답(question_answers 줄 더하기)
//   등급 규칙(설계 결정): 올림은 전부 · 한 단계 내림은 그대로 · 두 단계 넘는 내림은 지금 등급 − 1
//     ★ 영상에 나간 카드(web-desk/vscript/회차.json · id 있는 회차 + id 없는 회차는 정답 글이 같은 활성 카드)는 등급 그대로(찬종 11-28)
//   알가치 = V117 값 그대로(종류 열이 DB 에 없어 worth_why 앞에 "종류 — " 로 둔다)
//   alias = g119-raw/alias-pick.json(GEN 눈 · pick true 만) → 다른 카드 정답 · 인정 답과 겹치거나 질문 · 힌트에 걸리면 넣지 않는다
//   dev(quizweb_dev)는 id 가 달라 실 카드의 source_ref(둘 다 하나뿐)로 짝을 맞춘다 · 짝 없는 것은 수만
//   ★★ 규칙(G119 · docs/15 §6 끝): **기존 카드의 질문 글을 고치는 싣기는 같은 판에서 다시 매긴 등급 · 알가치가 없으면 싣지 않는다** ·
//     새 카드 싣기는 scripts/grade-ledger.mjs 의 ledgerPut 으로 장부에 줄을 더한다 · 검사 = scripts/grade-fresh-check.mjs
//   사용 node scripts/g119-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만 · 계획 audit/g119-plan-<db>.json)
//   ★ 멱등: 이미 같은 값이면 건너뛴다 · 되돌리기 파일 audit/g119-undo-<db>.json(처음 옛 값을 지킨다) · --undo = 옛 값 + 인정 답 줄(note '#g119') 걷기
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { ROOT, guardNoOpenGames } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';
import { ledgerPut } from './grade-ledger.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const dbName = a.includes('--db') ? a[a.indexOf('--db') + 1] : 'quizweb';
const TAG = 'G119';
const NOTE = 'G119 인정어(V117 블라인드 표기) #g119';
const SV = 'v117';
const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const key = (s) => normalizeAnswer(s).replace(/[^\p{L}\p{N}]/gu, '');
const band = (g) => (g <= 2 ? 'easy' : g === 3 ? 'medium' : 'hard');
const cli = async (name) => { const u = new URL(process.env.DATABASE_URL); u.pathname = '/' + name; const c = new pg.Client({ connectionString: u.toString() }); await c.connect(); return c; };

const V = J(AUD('v117-regrade.json'));
if (!V.done || Object.keys(V.cards).length !== 8509) throw new Error('v117-regrade.json 이 다 되지 않았다');
const T = new Map(J(AUD('v117-raw/targets.json')).map((t) => [String(t.id), t]));
const PICK = J(AUD('g119-raw/alias-pick.json')).items;
const EP = J(path.join(ROOT, 'web-desk/vscript/회차.json')).episodes;

const R = await cli('quizweb');
const c = dbName === 'quizweb' ? R : await cli(dbName);
console.log(`[${TAG}] DB ${dbName} · ${mode}`);
const UNDO = AUD(`g119-undo-${dbName}.json`);

// ── 되돌리기 ──────────────────────────────────────────────────────────────────
if (mode === 'undo') {
  await guardNoOpenGames(c, `${TAG} undo`);
  const u = J(UNDO);
  await c.query('begin');
  let n = 0;
  for (const [id, o] of Object.entries(u.items)) n += (await c.query(`update questions set difficulty_score=$2, difficulty=$3, difficulty_why=$4, score_version=$5, scored_at=$6, worth=$7, worth_why=$8, updated_at=now() where id=$1`,
    [id, o.difficulty_score, o.difficulty, o.difficulty_why, o.score_version, o.scored_at, o.worth, o.worth_why])).rowCount;
  const del = (await c.query('delete from question_answers where note=$1', [NOTE])).rowCount;
  await c.query('commit');
  console.log(`[${TAG} undo] 옛 값 ${n}행 · 인정 답 걷음 ${del}`);
  await R.end(); if (c !== R) await c.end(); process.exit(0);
}

// ── 실 DB 기준 대조 ───────────────────────────────────────────────────────────
const COLS = 'id::int, source_ref, question_text, display_answer, general_hint, explanation, is_active, difficulty_score, difficulty, difficulty_why, score_version, scored_at, worth, worth_why';
const realRows = (await R.query(`select ${COLS} from questions where is_active`)).rows;
const real = new Map(realRows.map((r) => [String(r.id), r]));
const out = { round: TAG, db: dbName, at: new Date().toISOString(), counts: {}, notLoaded: [], video: [], videoByAnswer: [], wasDiff: [], devNoPair: 0, devTextDiff: 0, alias: { added: [], skipped: [], notPicked: [] } };

// 영상 카드(실 id)
const VID = new Map(); // 실 id → 회차
for (const e of EP) for (const q of e.questions ?? []) {
  if (q.id != null) { VID.set(String(q.id), { ep: e.no, answer: q.answer, by: 'id' }); continue; }
  for (const r of realRows) if (key(r.display_answer) === key(q.answer)) VID.set(String(r.id), { ep: e.no, answer: q.answer, by: 'answer' });
}

const plan = []; // { rid, grade, why, worth, worthWhy, at, video? }
const move = { up: 0, down1: 0, down2: 0, same: 0, video: 0 };
for (const [id, v] of Object.entries(V.cards)) {
  const t = T.get(id), r = real.get(id);
  if (!r) { out.notLoaded.push({ id, why: '지금 활성 아님' }); continue; }
  if (r.question_text !== t.q) { out.notLoaded.push({ id, why: '질문 글이 판정 때와 다름' }); continue; }
  // ★ 기준 = V117 이 본 그때 등급(was) — 지금 DB 값으로 하면 다시 돌릴 때 한 단계씩 더 내려간다(멱등)
  const cur = v.was.grade;
  if (r.difficulty_score !== cur) out.wasDiff.push({ id, was: cur, now: r.difficulty_score });
  let g = v.grade, why = `${v.gradeWhy} — #g119`;
  const vid = VID.get(id);
  if (vid) {
    out.video.push({ id: +id, ep: vid.ep, by: vid.by, answer: r.display_answer, grade: cur, v117: v.grade });
    g = cur; why = r.difficulty_why; move.video++;
  } else if (g > cur) move.up++;
  else if (g === cur) move.same++;
  else if (cur - g === 1) move.down1++;
  else { why = `${cur - 1} — V117 은 ${g}(두 단계 넘는 내림은 한 단계만 · G119) · ${v.gradeWhy} — #g119`; g = cur - 1; move.down2++; }
  plan.push({ rid: id, grade: g, why, worth: v.worth, worthWhy: `${v.worthKind} — ${v.worthWhy}`, at: vid ? 'video' : 'V117', q: r.question_text });
}

// ── 이 DB 의 짝 ───────────────────────────────────────────────────────────────
let target; // Map rid → 이 DB 행
if (c === R) target = new Map(plan.map((p) => [p.rid, real.get(p.rid)]));
else {
  const d = (await c.query(`select ${COLS} from questions where is_active`)).rows;
  const byRef = new Map(); for (const x of d) { if (!byRef.has(x.source_ref)) byRef.set(x.source_ref, []); byRef.get(x.source_ref).push(x); }
  target = new Map();
  for (const p of plan) {
    const m = byRef.get(real.get(p.rid).source_ref) ?? [];
    if (m.length !== 1) { out.devNoPair++; continue; }
    if (m[0].question_text !== p.q) out.devTextDiff++;
    target.set(p.rid, m[0]);
  }
}

// ── 바꿀 것 ───────────────────────────────────────────────────────────────────
const todo = [];
const dist = { before: {}, after: {} };
let wNullBefore = 0;
for (const p of plan) {
  const r = target.get(p.rid); if (!r) continue;
  dist.before[r.difficulty_score] = (dist.before[r.difficulty_score] ?? 0) + 1;
  // dev 는 dev 의 지금 등급이 실과 다를 수 있다 — 실에 싣는 값을 그대로 싣는다(같은 값)
  const g = p.at === 'video' ? r.difficulty_score : p.grade;
  const why = p.at === 'video' ? r.difficulty_why : p.why;
  dist.after[g] = (dist.after[g] ?? 0) + 1;
  if (r.worth == null) wNullBefore++;
  const after = { difficulty_score: g, difficulty: band(g), difficulty_why: why, score_version: SV, worth: p.worth, worth_why: p.worthWhy };
  if (Object.entries(after).every(([k, x]) => r[k] === x)) continue;
  todo.push({ id: r.id, rid: p.rid, before: { difficulty_score: r.difficulty_score, difficulty: r.difficulty, difficulty_why: r.difficulty_why, score_version: r.score_version, scored_at: r.scored_at, worth: r.worth, worth_why: r.worth_why }, after });
}

// ── alias ─────────────────────────────────────────────────────────────────────
const QA = (await c.query(`select a.question_id::int qid, a.answer_text, a.note from question_answers a`)).rows;
const allQ = (await c.query(`select id::int, display_answer from questions`)).rows;
const OWN = new Map(); const own = (s, id) => { const k = key(s); if (!k) return; if (!OWN.has(k)) OWN.set(k, new Set()); OWN.get(k).add(id); };
for (const q of allQ) own(q.display_answer, q.id);
const VAR = new Map(); // id → 인정 답들
for (const x of QA) { if (x.note !== NOTE) own(x.answer_text, x.qid); if (!VAR.has(x.qid)) VAR.set(x.qid, []); VAR.get(x.qid).push(x.answer_text); }
const aliasTodo = [];
for (const [rid, pk] of Object.entries(PICK)) {
  if (!pk.pick) { out.alias.notPicked.push({ id: +rid, v: pk.v, why: pk.why }); continue; }
  const r = target.get(rid) ?? (c === R ? real.get(rid) : null);
  if (!r) { out.alias.skipped.push({ id: +rid, v: pk.v, why: '이 DB 에 짝 없음' }); continue; }
  const vars = VAR.get(r.id) ?? [];
  if (vars.includes(pk.v)) { out.alias.added.push({ id: r.id, rid: +rid, answer: r.display_answer, v: pk.v, already: true }); continue; }
  const hit = [...(OWN.get(key(pk.v)) ?? [])].filter((x) => x !== r.id);
  if (hit.length) { out.alias.skipped.push({ id: +rid, v: pk.v, why: `다른 카드와 겹침 ${hit.map((x) => '#' + x).join(',')}` }); continue; }
  if (key(r.question_text).includes(key(pk.v))) { out.alias.skipped.push({ id: +rid, v: pk.v, why: '질문에 드러남' }); continue; }
  if (r.general_hint) {
    const hc = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: [...vars, pk.v], question: r.question_text, explanation: r.explanation ?? '' });
    const hc0 = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: vars, question: r.question_text, explanation: r.explanation ?? '' });
    if (hc.block.length > hc0.block.length) { out.alias.skipped.push({ id: +rid, v: pk.v, why: `힌트 막힘 ${hc.block.map((b) => b.frag).join('·')}` }); continue; }
  }
  aliasTodo.push({ id: r.id, rid: +rid, answer: r.display_answer, v: pk.v, why: pk.why });
}

out.counts = { cards: Object.keys(V.cards).length, planned: plan.length, notLoaded: out.notLoaded.length, ...move, wasDiff: out.wasDiff.length, paired: target.size, devNoPair: out.devNoPair, devTextDiff: out.devTextDiff,
  toWrite: todo.length, worthNullBefore: wNullBefore, aliasAdd: aliasTodo.length, aliasAlready: out.alias.added.length, aliasSkipped: out.alias.skipped.length, aliasNotPicked: out.alias.notPicked.length };
out.dist = dist;
out.aliasTodo = aliasTodo;
writeFileSync(AUD(`g119-plan-${dbName}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(`[${TAG}] ${JSON.stringify(out.counts)}`);
console.log(`[${TAG}] 등급 앞 ${JSON.stringify(dist.before)} → 뒤 ${JSON.stringify(dist.after)}`);
for (const x of out.notLoaded.slice(0, 20)) console.log(`  ✗ ${x.id} ${x.why}`);
for (const x of out.alias.skipped) console.log(`  alias 안 넣음 #${x.id} ${x.v}: ${x.why}`);

const writeLedger = () => {
  if (c !== R) return 0;
  return ledgerPut(plan.map((p) => ({ id: p.rid, question: p.q, grade: p.at === 'video' ? real.get(p.rid).difficulty_score : p.grade, worth: p.worth, at: p.at })), 'quizweb');
};

if (mode !== 'apply') { console.log(`[${TAG}] 확인만 — 쓰려면 --apply`); await R.end(); if (c !== R) await c.end(); process.exit(0); }
if (!todo.length && !aliasTodo.length) { console.log(`[${TAG}] 쓸 것 없음`); console.log(`[${TAG}] 장부 ${writeLedger()}줄`); await R.end(); if (c !== R) await c.end(); process.exit(0); }

// ── 쓰기(한 트랜잭션) ─────────────────────────────────────────────────────────
const at = await guardNoOpenGames(c, TAG);
const undo = existsSync(UNDO) ? J(UNDO) : { round: TAG, db: dbName, note: `옛 값 — node scripts/g119-apply.mjs${dbName === 'quizweb' ? '' : ' --db ' + dbName} --undo`, items: {} };
for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = t.before;
undo.writtenAt = at;
writeFileSync(UNDO, JSON.stringify(undo, null, 0).replace(/\},"/g, '},\n"') + '\n');
await c.query('begin');
try {
  let n = 0;
  for (const t of todo) {
    const x = t.after;
    n += (await c.query(`update questions set difficulty_score=$2, difficulty=$3, difficulty_why=$4, score_version=$5, scored_at=now(), worth=$6, worth_why=$7, updated_at=now() where id=$1 and is_active`,
      [t.id, x.difficulty_score, x.difficulty, x.difficulty_why, x.score_version, x.worth, x.worth_why])).rowCount;
  }
  if (n !== todo.length) throw new Error(`쓴 수 ${n}/${todo.length}`);
  for (const x of aliasTodo) await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing`, [x.id, x.v, normalizeAnswer(x.v), NOTE]);
  await c.query('commit');
  console.log(`[${TAG}] 썼다 — 문항 ${n} · 인정 답 ${aliasTodo.length} · ${at}`);
} catch (err) { await c.query('rollback'); console.error(`★ 되돌렸다 — ${err.message}`); await R.end(); if (c !== R) await c.end(); process.exit(1); }
console.log(`[${TAG}] 장부 ${writeLedger()}줄`);
await R.end(); if (c !== R) await c.end();
