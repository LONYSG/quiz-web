#!/usr/bin/env node
// =============================================================================
// G103 — 정답 표기 고치기 (찬종 2026-11-18 · 기준 = 표준국어대사전 표제어가 정답 · 옛 표기와 위키 표기는 변형)
//   A  web-desk/decide/_spelling-apply.json items[] {answer, ids, to, action}
//      change  : display_answer = to · 주 답(question_answers is_primary) = to · 옛 정답은 변형으로 · hint_answer 가 옛 정답이면 to
//                질문 · 힌트 · 해설의 옛 표기(낱말 그대로 · 조사 맞춤)를 to 로 — 낱말의 한 부분이면 바꾸지 않고 목록
//      variant : to 를 변형에 · keep : 손대지 않음
//   B  data/pipeline/audit/g101-spelling.json verdict 'variant' → to 를 변형에
//      단 how 'trim' · to 가 정답보다 짧고 · to 가 사전 표제어(dict-check)면 넣지 않고 목록("넓은 말")
//   게이트(걸리면 건너뛰고 목록) ① 활성 · 지금 정답 = answer ② 새 정답 · 변형이 다른 활성 카드의 정답 · 변형과 겹치지 않음(정규화 · 기호 뺌)
//          ③ 질문(checkAnswerSet blocked) · 힌트(checkHint block)에 드러나지 않음 ④ B4(classifyVariant drop) 변형은 넣지 않음
//   쓰기 = 한 트랜잭션 · 열린 판 0 · 되돌리기 audit/g103-undo-<db>.json(만지는 문항의 questions 칸 + question_answers 행 통째 사본)
//   사용 node scripts/g103-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만 · 계획 audit/g103-plan-<db>.json)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, guardNoOpenGames } from './g023-common.mjs';
import { checkAnswerSet, classifyVariant } from '../pipeline/lib/answer-rules.mjs';
import { checkHint } from './hint-check.mjs';
import { dictCheck } from './dict-check.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const db = url.pathname.slice(1);
const NOTE = 'G103 표기';
const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
const UNDO = AUD(`g103-undo-${db}.json`);
const PLAN = AUD(`g103-plan-${db}.json`);
const key = (s) => normalizeAnswer(s).replace(/[^\p{L}\p{N}]/gu, '');
const glen = (s) => [...String(s).replace(/\s/g, '')].length;

const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
console.log(`[G103] DB ${db} · ${mode}`);

// ── 조사 맞춤 · 낱말 경계 바꾸기 ───────────────────────────────────────────────
const isH = (ch) => !!ch && ch >= '가' && ch <= '힣';
const jong = (ch) => (isH(ch) ? (ch.charCodeAt(0) - 0xac00) % 28 : -1); // -1 = 한글 아님
const BOUND = /[\s.,!?'"()[\]{}·~:;/‘’“”–—\-「」『』<>]/;
const JOSA = ['으로', '에서', '에게', '이라', '부터', '까지', '처럼', '보다', '마다', '이다', '입니다', '이며', '이고', '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '로', '도', '만', '라'];
function fitJosa(j, last) {
  const jj = jong(last);
  if (jj < 0) return j; // 한글이 아니면 그대로
  const has = jj > 0; const rieul = jj === 8;
  const P = { 은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'], 이라: ['이라', '라'], 라: ['이라', '라'], 이다: ['이다', '다'], 입니다: ['입니다', '입니다'], 이며: ['이며', '이며'], 이고: ['이고', '이고'] };
  if (j === '으로' || j === '로') return has && !rieul ? '으로' : '로';
  const p = P[j]; if (!p) return j;
  return has ? p[0] : p[1];
}
/** text 안의 old 를 to 로 — {text, changes[], parts[]} */
function replaceWord(text, old, to) {
  if (!text || !text.includes(old)) return { text, changes: [], parts: [] };
  const suffix = to.startsWith(old) ? to.slice(old.length).trim() : null;
  let out = ''; let i = 0; const changes = []; const parts = [];
  for (;;) {
    const at = text.indexOf(old, i);
    if (at < 0) { out += text.slice(i); break; }
    out += text.slice(i, at);
    const before = at === 0 ? '' : text[at - 1];
    const rest = text.slice(at + old.length);
    const ctx = text.slice(Math.max(0, at - 8), Math.min(text.length, at + old.length + 8));
    if (suffix && rest.replace(/^\s/, '').startsWith(suffix)) { out += old; i = at + old.length; continue; } // 이미 긴 꼴
    if (isH(before)) { parts.push(ctx); out += old; i = at + old.length; continue; }
    if (rest === '' || !isH(rest[0])) { out += to; changes.push(ctx); i = at + old.length; continue; }
    const j = JOSA.find((x) => rest.startsWith(x) && (rest.length === x.length || !isH(rest[x.length]) || BOUND.test(rest[x.length])));
    if (!j) { parts.push(ctx); out += old; i = at + old.length; continue; }
    out += to + fitJosa(j, to[to.length - 1]); changes.push(ctx); i = at + old.length + j.length;
  }
  return { text: out, changes, parts };
}

// ── 되돌리기 ──────────────────────────────────────────────────────────────────
if (mode === 'undo') {
  if (!existsSync(UNDO)) { console.log('[G103 undo] 되돌릴 것 없음'); await c.end(); process.exit(0); }
  const u = JSON.parse(readFileSync(UNDO, 'utf8'));
  await guardNoOpenGames(c, 'G103 undo');
  await c.query('begin'); let n = 0;
  for (const s of u.snaps) {
    await c.query('update questions set display_answer=$2, hint_answer=$3, question_text=$4, general_hint=$5, explanation=$6, updated_at=now() where id=$1', [s.id, s.q.display_answer, s.q.hint_answer, s.q.question_text, s.q.general_hint, s.q.explanation]);
    await c.query('delete from question_answers where question_id=$1', [s.id]);
    for (const r of s.qa) await c.query('insert into question_answers (id, question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,$4,$5,$6)', [r.id, s.id, r.answer_text, r.answer_norm, r.is_primary, r.note]);
    n++;
  }
  await c.query('commit'); u.snaps = []; writeFileSync(UNDO, JSON.stringify(u, null, 1) + '\n');
  console.log(`[G103 undo] 문항 ${n} 되돌림`); await c.end(); process.exit(0);
}

// ── 읽기 ──────────────────────────────────────────────────────────────────────
const A = JSON.parse(readFileSync(path.join(ROOT, 'web-desk/decide/_spelling-apply.json'), 'utf8')).items;
const B = JSON.parse(readFileSync(AUD('g101-spelling.json'), 'utf8')).items.filter((x) => x.verdict === 'variant');
const Q = new Map((await c.query(`select id::int, is_active, question_text, display_answer, hint_answer, general_hint, explanation from questions`)).rows.map((r) => [r.id, r]));
const QA = new Map();
for (const r of (await c.query('select id::int, question_id::int qid, answer_text, answer_norm, is_primary, note from question_answers order by id')).rows) {
  if (!QA.has(r.qid)) QA.set(r.qid, []); QA.get(r.qid).push(r);
}
// 활성 카드의 정답 · 변형 열쇠 → id 들
const OWN = new Map();
const own = (k, id) => { if (!k) return; if (!OWN.has(k)) OWN.set(k, new Set()); OWN.get(k).add(id); };
for (const [id, q] of Q) if (q.is_active) { own(key(q.display_answer), id); for (const r of QA.get(id) ?? []) own(key(r.answer_text), id); }
const clash = (s, ids) => [...(OWN.get(key(s)) ?? [])].filter((x) => !ids.includes(x));

const out = { round: 'G103', db, at: new Date().toISOString(), change: [], variantA: [], variantB: [], skipped: [], broad: [], clash: [], bodyEdits: [], bodyParts: [], hintAnswerOther: [], otherGames: [] };
const writes = []; // {id, display?, hintAnswer?, texts?{col:after}, primarySwap?:{old,to}, addVariants:[]}
const W = new Map(); const w = (id) => { if (!W.has(id)) { const o = { id, addVariants: [] }; W.set(id, o); writes.push(o); } return W.get(id); };
const skip = (part, it, id, why) => out.skipped.push({ part, answer: it.answer, to: it.to, id, why });

// 게이트 ③ ④ — 한 카드의 최종 꼴(display · 변형 · 질문 · 힌트)
function gate34(q, display, variants, newOnes, question, hint) {
  const why = [];
  const g = checkAnswerSet(question, display, variants, normalizeAnswer);
  for (const b of g.blocked) if ([display, ...newOnes].includes(b.answer)) why.push(`③ 질문에 드러남 "${b.answer}"`);
  for (const d of g.dropped) if (newOnes.includes(d.answer) && d.kind !== 'redundant') why.push(`④ ${d.kind} "${d.answer}"`);
  if (hint) {
    const h = checkHint({ hint, answer: display, variants, question, explanation: q.explanation ?? '' });
    if (h.block.length) why.push(`③ 힌트 막힘 ${JSON.stringify(h.block)}`);
  }
  return why;
}

// ── A ────────────────────────────────────────────────────────────────────────
for (const it of A) {
  if (it.action === 'keep') continue;
  for (const id of it.ids) {
    const q = Q.get(id);
    if (!q) { skip('A', it, id, '없음'); continue; }
    if (!q.is_active) { skip('A', it, id, '① 비활성'); continue; }
    const vs = (QA.get(id) ?? []).filter((r) => !r.is_primary).map((r) => r.answer_text);
    if (it.action === 'variant') {
      if (q.display_answer !== it.answer) { skip('A', it, id, `① 지금 정답 "${q.display_answer}"`); continue; }
      if (vs.some((v) => key(v) === key(it.to))) { out.variantA.push({ id, answer: it.answer, to: it.to, already: true }); continue; }
      const cl = clash(it.to, it.ids); if (cl.length) { out.clash.push({ part: 'A variant', id, answer: it.answer, s: it.to, with: cl }); skip('A', it, id, `② 겹침 #${cl.join(',#')}`); continue; }
      const why = gate34(q, q.display_answer, [...vs, it.to], [it.to], q.question_text, q.general_hint);
      if (why.length) { skip('A', it, id, why.join(' · ')); continue; }
      w(id).addVariants.push(it.to); own(key(it.to), id); out.variantA.push({ id, answer: it.answer, to: it.to });
      continue;
    }
    // change
    if (q.display_answer === it.to) { out.change.push({ id, answer: it.answer, to: it.to, already: true }); continue; }
    if (q.display_answer !== it.answer) { skip('A', it, id, `① 지금 정답 "${q.display_answer}"`); continue; }
    const cl = clash(it.to, it.ids); if (cl.length) { out.clash.push({ part: 'A change', id, answer: it.answer, s: it.to, with: cl }); skip('A', it, id, `② 겹침 #${cl.join(',#')}`); continue; }
    const texts = {}; const edits = []; const parts = [];
    for (const col of ['question_text', 'general_hint', 'explanation']) {
      const r = replaceWord(q[col], it.answer, it.to);
      if (r.changes.length) { texts[col] = r.text; edits.push({ id, col, before: q[col], after: r.text }); }
      for (const p of r.parts) parts.push({ id, col, ctx: p });
    }
    const newVs = [...vs.filter((v) => key(v) !== key(it.to)), ...(key(it.answer) !== key(it.to) ? [it.answer] : [])];
    const why = gate34(q, it.to, newVs, key(it.answer) !== key(it.to) ? [it.answer] : [], texts.question_text ?? q.question_text, texts.general_hint ?? q.general_hint);
    if (why.length) { skip('A', it, id, why.join(' · ')); continue; }
    let hintAnswer;
    if (q.hint_answer === it.answer) hintAnswer = it.to;
    else if (q.hint_answer != null && q.hint_answer !== it.to) out.hintAnswerOther.push({ id, hint_answer: q.hint_answer, answer: it.answer, to: it.to });
    const o = w(id); o.display = it.to; o.primarySwap = { old: it.answer, to: it.to }; o.texts = texts; if (hintAnswer) o.hintAnswer = hintAnswer;
    own(key(it.to), id);
    out.change.push({ id, answer: it.answer, to: it.to, hintAnswer: hintAnswer ?? null, edits: edits.length });
    out.bodyEdits.push(...edits); out.bodyParts.push(...parts);
  }
}

// ── B ────────────────────────────────────────────────────────────────────────
const shorter = B.filter((x) => x.how === 'trim' && glen(x.to) < glen(x.answer));
const dict = new Map((await dictCheck([...new Set(shorter.map((x) => x.to))])).map((r) => [r.word, r]));
// 찬종 2026-11-19 "같은 개념만 같은 말만" — GEN 이 다른 개념으로 가른 짝(id|to)은 넣지 않고 목록
const OTHER = new Set(JSON.parse(readFileSync(AUD('g103-b-otherconcept.json'), 'utf8')).items.map((x) => `${x.id}|${x.to}`));
out.otherConcept = [];
for (const it of B) {
  if (it.ids.every((id) => OTHER.has(`${id}|${it.to}`))) { out.otherConcept.push({ answer: it.answer, to: it.to, ids: it.ids }); continue; }
  if (it.how === 'trim' && glen(it.to) < glen(it.answer) && dict.get(it.to)?.found) { out.broad.push({ answer: it.answer, to: it.to, ids: it.ids, headword: dict.get(it.to).headword }); continue; }
  for (const id of it.ids) {
    const q = Q.get(id);
    if (!q) { skip('B', it, id, '없음'); continue; }
    if (!q.is_active) { skip('B', it, id, '① 비활성'); continue; }
    const disp = W.get(id)?.display ?? q.display_answer;
    if (q.display_answer !== it.answer) { skip('B', it, id, `① 지금 정답 "${q.display_answer}"`); continue; }
    const vs = [...(QA.get(id) ?? []).filter((r) => !r.is_primary).map((r) => r.answer_text), ...(W.get(id)?.addVariants ?? [])];
    if (key(it.to) === key(disp) || vs.some((v) => key(v) === key(it.to))) { out.variantB.push({ id, answer: it.answer, to: it.to, already: true }); continue; }
    const cl = clash(it.to, it.ids); if (cl.length) { out.clash.push({ part: 'B', id, answer: it.answer, s: it.to, with: cl }); skip('B', it, id, `② 겹침 #${cl.join(',#')}`); continue; }
    const why = gate34(q, disp, [...vs, it.to], [it.to], q.question_text, q.general_hint);
    if (why.length) { skip('B', it, id, why.join(' · ')); continue; }
    w(id).addVariants.push(it.to); own(key(it.to), id); out.variantB.push({ id, answer: it.answer, to: it.to });
  }
}

// ── 다른 놀이에 옛 표기(change 의 answer)가 남은 수 — 읽기만 ───────────────────
const olds = [...new Set(A.filter((x) => x.action === 'change').map((x) => x.answer))];
const ti = (await c.query('select id, topic, name, label, variants, active from topic_items')).rows;
const mi = (await c.query('select item_id, game, payload::text p, active from minigame_items')).rows;
for (const o of olds) {
  const k = key(o);
  const t = ti.filter((r) => [r.name, r.label, ...(Array.isArray(r.variants) ? r.variants : [])].some((s) => typeof s === 'string' && key(s) === k));
  const m = mi.filter((r) => r.p.includes(`"${o}"`));
  if (t.length || m.length) out.otherGames.push({ old: o, topicItems: t.map((r) => `${r.topic}:${r.name}${r.active ? '' : '(꺼짐)'}`), minigame: m.map((r) => `${r.game}:${r.item_id}${r.active ? '' : '(꺼짐)'}`) });
}

const cnt = (arr) => ({ new: arr.filter((x) => !x.already).length, already: arr.filter((x) => x.already).length });
out.summary = { change: cnt(out.change), variantA: cnt(out.variantA), variantB: cnt(out.variantB), skipped: out.skipped.length, broad: out.broad.length, otherConcept: out.otherConcept.length, clash: out.clash.length, bodyEdits: out.bodyEdits.length, bodyParts: out.bodyParts.length, otherGames: out.otherGames.length, cards: writes.length };
writeFileSync(PLAN, JSON.stringify(out, null, 1) + '\n');
console.log(`[G103] ${JSON.stringify(out.summary)} → ${path.relative(ROOT, PLAN)}`);
if (mode !== 'apply' || !writes.length) { if (mode !== 'apply') console.log('[G103] 확인만 — 쓰려면 --apply'); await c.end(); process.exit(0); }

// ── 쓰기 ──────────────────────────────────────────────────────────────────────
const at = await guardNoOpenGames(c, 'G103');
const u = existsSync(UNDO) ? JSON.parse(readFileSync(UNDO, 'utf8')) : { round: 'G103', db, note: '만진 문항의 쓰기 전 사본 — --undo 는 questions 칸과 question_answers 행을 통째로 되돌린다', snaps: [] };
const snapped = new Set(u.snaps.map((s) => s.id));
for (const x of writes) if (!snapped.has(x.id)) {
  const q = Q.get(x.id);
  u.snaps.push({ id: x.id, q: { display_answer: q.display_answer, hint_answer: q.hint_answer, question_text: q.question_text, general_hint: q.general_hint, explanation: q.explanation }, qa: (QA.get(x.id) ?? []).map(({ id, answer_text, answer_norm, is_primary, note }) => ({ id, answer_text, answer_norm, is_primary, note })) });
}
u.writtenAt = at; writeFileSync(UNDO, JSON.stringify(u, null, 1) + '\n');
await c.query('begin');
try {
  for (const x of writes) {
    const q = Q.get(x.id);
    if (x.primarySwap) {
      const { old, to } = x.primarySwap;
      const n1 = (await c.query('update questions set display_answer=$2, hint_answer=coalesce($3, hint_answer), question_text=$4, general_hint=$5, explanation=$6, updated_at=now() where id=$1 and display_answer=$7',
        [x.id, to, x.hintAnswer ?? null, x.texts.question_text ?? q.question_text, x.texts.general_hint ?? q.general_hint, x.texts.explanation ?? q.explanation, old])).rowCount;
      if (n1 !== 1) throw new Error(`#${x.id} display_answer 바뀜`);
      await c.query('delete from question_answers where question_id=$1 and not is_primary and answer_norm=$2', [x.id, normalizeAnswer(to)]); // 변형에 이미 있던 새 정답은 주 답으로 올라가므로 지운다
      const n2 = (await c.query('update question_answers set answer_text=$2, answer_norm=$3, note=$4 where question_id=$1 and is_primary', [x.id, to, normalizeAnswer(to), NOTE])).rowCount;
      if (n2 !== 1) throw new Error(`#${x.id} 주 답 행 ${n2}`);
      if (normalizeAnswer(old) !== normalizeAnswer(to)) await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [x.id, old, normalizeAnswer(old), `${NOTE} 옛 정답`]);
    }
    for (const v of x.addVariants) await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [x.id, v, normalizeAnswer(v), `${NOTE} 변형`]);
  }
  await c.query('commit');
} catch (e) { await c.query('rollback'); console.error('★ 되돌렸다 —', e.message); process.exitCode = 1; await c.end(); process.exit(1); }
console.log(`[G103] 썼다 — 문항 ${writes.length}`);
await c.end();
