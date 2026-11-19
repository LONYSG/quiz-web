#!/usr/bin/env node
// =============================================================================
// G105 B — gpt 형태 묶음(add · move · rejoin) 게이트 → data/pipeline/tone/g105-apply.json (DB 읽기만 · tone-apply.mjs 가 싣는다)
//   입력 받은것/형태-NN.json("done": true 만) ↔ 보낼것/형태-NN.json · --files 06,07,…,20 (기본 06~19 + 20)
//   공통 ① 활성 · 바꾸는 칸의 지금 DB 글 = 보낼것 글
//   add    ② 해설만(질문 · 힌트 · 정답 칸이 오면 건너뜀) ③ 새 해설의 숫자 · 영문/한자 · 따옴표 글이 두 카드 글 + facts 안에 있음
//            (새 한글 명사는 newWords 로 적고 GEN 이 읽어 이름이면 --hold) ④ 힌트 막힘 새로 없음 · 해설 겹침 경고는 목록
//          ⑤ 해설 180자 이하 · "~다." 반말 끝 없음
//   move   질문 · 힌트 · 해설 — ③ 를 세 칸에(근거 = 카드 글 + core + sibling_question + facts) · ④ · ⑤(해설) · 질문 ~까요? · 형태 꼴 없음 · 정답 새로 드러남 없음 · 200자
//   rejoin 질문만 — G102 형태 게이트(tone-build --form ⑦ 사실 낱말 · 숫자 같음 · 정답 · ~까요? · 200자 · formHit) + "~며 + 명사" 꼴 남음
//   사용 node scripts/g105-gate.mjs [--files 06,07] [--hold 123:까닭,456]
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet, findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';
import { formHit } from './form-scan.mjs';

process.loadEnvFile?.(path.join(ROOT, '.env'));
const a = process.argv.slice(2);
const FILES = a.includes('--files') ? a[a.indexOf('--files') + 1].split(',').map((x) => x.padStart(2, '0'))
  : ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
const HOLD = new Map((a.includes('--hold') ? a[a.indexOf('--hold') + 1].split(',') : []).filter(Boolean).map((x) => [Number(x.split(':')[0]), x.split(':')[1] ?? 'GEN 보류']));
const J = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const L = (s) => [...(s ?? '')].length;
const IN = path.join(ROOT, 'web-desk/tone/받은것'), OUT = path.join(ROOT, 'web-desk/tone/보낼것');

// ── 읽기 ──────────────────────────────────────────────────────────────────────
const src = []; const waiting = []; const absent = [];
for (const n of FILES) {
  const f = `형태-${n}.json`;
  if (!existsSync(path.join(OUT, f))) continue;
  if (!existsSync(path.join(IN, f))) { absent.push(f); continue; }
  const r = J(path.join(IN, f)); if (r.done !== true) { waiting.push(f); continue; }
  const s = J(path.join(OUT, f)); const sm = new Map(s.cards.map((x) => [x.id, x]));
  for (const x of r.cards) src.push({ file: f.slice(0, -5), got: x, sent: sm.get(x.id) });
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
const D = Object.fromEntries((await c.query(`select q.id::int, q.is_active, q.inactive_reason, q.question_text, q.general_hint, q.explanation, q.display_answer,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
  from questions q where q.id = any($1::bigint[])`, [src.map((x) => x.got.id)])).rows.map((r) => [r.id, r]));
await c.end();

// ── 낱말 도구 ────────────────────────────────────────────────────────────────
const QT = /['"‘’“”「」『』《》〈〉]/g;
const quoted = (s) => [...(s ?? '').matchAll(/['‘"“「『《〈]([^'’"”」』》〉]+)['’"”」』》〉]/g)].map((m) => m[1].trim());
const nums = (s) => (s ?? '').match(/\d+(?:[.,]\d+)*/g) ?? [];
const foreign = (s) => (s ?? '').match(/[A-Za-z][A-Za-z0-9&.\-]*|[㐀-鿿]+/g) ?? [];
const hw = (s) => ((s ?? '').replace(QT, ' ').match(/[가-힣]+/g) ?? []).filter((w) => w.length > 2);
const JOSA = /(에서는|에게서|으로는|에서|에게|으로|이라는|라는|이라고|라고|까지|부터|처럼|보다|이나|와는|과는|은|는|이|가|을|를|의|에|와|과|로|도|만|들)$/;
const COMMON = new Set(['이후', '당시', '처음', '이름', '사람', '때문', '하나', '가장', '이야기', '다른', '같은', '모두', '이것', '그것', '자신', '실제', '결국', '오늘날', '지금', '사실', '뒤에', '이때', '그때', '덕분', '세계', '최초', '정도', '무렵', '나중', '전해집니다', '알려져']);
/** 새 글에서 근거 글에 없는 숫자 · 영문/한자 · 따옴표 글(막힘)과 한글 명사꼴(목록) */
function factCheck(text, base) {
  const block = [];
  for (const n of nums(text)) if (!nums(base).includes(n) && !base.includes(n)) block.push(`숫자 ${n}`);
  for (const t of foreign(text)) if (!base.includes(t)) block.push(`낱말 ${t}`);
  for (const t of quoted(text)) if (!base.includes(t)) block.push(`따옴표 '${t}'`);
  const words = [];
  for (const raw of (text.replace(QT, ' ').match(/[가-힣]+/g) ?? [])) {
    if (!JOSA.test(raw) && raw.length < 2) continue;
    const stem = raw.replace(JOSA, '');
    if (stem.length < 2 || COMMON.has(stem)) continue;
    if (/(습니다|니다|었|였|했|하는|하던|하고|하며|되어|되었|된|한|인|던|지만|으며|면서)$/.test(raw)) continue; // 서술어 꼴
    if (!base.includes(stem.slice(0, Math.min(stem.length, 3))) && !base.includes(stem.slice(0, 2))) words.push(stem);
  }
  return { block, words: [...new Set(words)] };
}
const banmal = (e) => (e ?? '').split(/(?<=[.!?])\s+/).some((s) => /다\.\s*$/.test(s) && !/니다\.\s*$/.test(s));
// "~며 + 명사"(지시서 그대로 — "~며" 뒤에 서술어 없이 명사가 옴): 마지막 문장의 "~며( ,)" 뒤 끝 낱말 앞까지 꾸밈꼴 동사(…는 · …ㄴ · …던)가 하나도 없으면 걸림
const VMOD = /(는|던|한|된|난|간|온|운|진|친|린|킨|낸|른|든|큰|긴|센|은|붙은|뚫린)$/;
function meoNoun(q) {
  const s = q.split(/(?<=[.!?])\s+/).pop();
  const m = s.match(/[가-힣]+며,?\s+([^,]+?)\s*(누구|무엇|어디|몇|어느|언제)/);
  if (!m) return null;
  const ws = m[1].split(/\s+/); ws.pop();
  return ws.some((w) => VMOD.test(w)) ? null : m[0];
}

// ── 게이트 ────────────────────────────────────────────────────────────────────
const gate = { notSent: [], missing: [], inactive: [], beforeDiff: [], otherCols: [], fact: [], hintBlock: [], answerSet: [], newAnswer: [], length: [], banmal: [], ending: [], form: [], meo: [], hold: [] };
const warn = { newWords: [], explainOverlap: [] };
const keep = []; const items = []; const notes = {};
for (const { file, got, sent } of src) {
  if (!sent) { gate.notSent.push({ id: got.id, file }); continue; }
  const job = sent.job; notes[got.note ?? '(없음)'] = (notes[got.note ?? '(없음)'] ?? 0) + 1;
  const d = D[got.id];
  if (!d) { gate.missing.push({ id: got.id, file }); continue; }
  const changed = ['question', 'hint', 'explanation'].filter((k) => got[k] != null && got[k].trim() !== (sent[k] ?? '').trim());
  if (!changed.length) { keep.push({ id: got.id, file, job, note: got.note }); continue; }
  if (!d.is_active) { gate.inactive.push({ id: got.id, file, why: d.inactive_reason }); continue; }
  const COL = { question: 'question_text', hint: 'general_hint', explanation: 'explanation' };
  const bd = changed.filter((k) => (d[COL[k]] ?? '') !== (sent[k] ?? ''));
  if (bd.length) { gate.beforeDiff.push({ id: got.id, file, cols: bd }); continue; }
  const allowed = { add: ['explanation'], move: ['question', 'hint', 'explanation'], rejoin: ['question'] }[job] ?? [];
  const extra = changed.filter((k) => !allowed.includes(k));
  if (extra.length) { gate.otherCols.push({ id: got.id, file, job, cols: extra }); continue; }
  const now = { q: d.question_text, h: d.general_hint, e: d.explanation };
  if (changed.includes('question')) now.q = got.question.trim();
  if (changed.includes('hint')) now.h = got.hint.trim();
  if (changed.includes('explanation')) now.e = got.explanation.trim();
  const fail = []; // [key, msg]
  const base = [sent.question, sent.hint, sent.explanation, sent.sibling_question, sent.sibling_explanation, sent.core, sent.original, ...(sent.facts ?? [])].filter(Boolean).join(' \n ');
  // ③ 사실
  if (job === 'rejoin') {
    const q0 = sent.question, q = now.q; const f7 = [];
    const n0 = nums(q0), n1 = nums(q);
    for (const n of n0) if (!n1.includes(n)) f7.push(`숫자 빠짐 ${n}`);
    for (const n of n1) if (!n0.includes(n)) f7.push(`숫자 새로 ${n}`);
    for (const t of quoted(q0)) if (!q.includes(t)) f7.push(`따옴표 글 빠짐 '${t}'`);
    for (const t of quoted(q)) if (!q0.includes(t)) f7.push(`따옴표 글 새로 '${t}'`);
    for (const t of foreign(q0)) if (!q.includes(t)) f7.push(`낱말 빠짐 ${t}`);
    for (const t of foreign(q)) if (!q0.includes(t)) f7.push(`낱말 새로 ${t}`);
    const p1 = new Set((q.match(/[가-힣]+/g) ?? []).map((w) => w.slice(0, 2)));
    const lost = [...new Set(hw(q0).filter((w) => !p1.has(w.slice(0, 2))))];
    const added = [...new Set(hw(q).filter((w) => !q0.includes(w.slice(0, 2))))];
    if (lost.length > 2) f7.push(`한글 낱말 빠짐 ${lost.join('·')}`);
    if (added.length > 2) f7.push(`한글 낱말 새로 ${added.join('·')}`);
    if (f7.length) fail.push(['fact', f7.join(' / ')]);
    const mn = meoNoun(q); if (mn) fail.push(['meo', `"~며 + 명사" 남음: ${mn}`]);
  } else {
    for (const k of changed) {
      const r = factCheck(k === 'question' ? now.q : k === 'hint' ? now.h : now.e, base);
      if (r.block.length) fail.push(['fact', `${k}: ${r.block.join(' / ')}`]);
      if (r.words.length) warn.newWords.push({ id: got.id, file, job, col: k, words: r.words });
    }
  }
  // ④ 정답 · 힌트
  const ans = [d.display_answer, ...d.variants];
  if (changed.includes('question')) for (const x of ans) if (findAnswerInQuestion(now.q, x) === 'word' && findAnswerInQuestion(sent.question, x) !== 'word') fail.push(['newAnswer', `질문에 정답 '${x}'`]);
  const ckN = checkHint({ hint: now.h, answer: d.display_answer, variants: d.variants, question: now.q, explanation: now.e ?? '' });
  const ckO = checkHint({ hint: sent.hint, answer: d.display_answer, variants: d.variants, question: sent.question, explanation: sent.explanation ?? '' });
  const oldB = new Set(ckO.block.map((b) => b.frag)); const nb = ckN.block.filter((b) => !oldB.has(b.frag));
  if (nb.length) fail.push(['hintBlock', `힌트 막힘 ${nb.map((b) => b.frag).join('·')}`]);
  const g = checkAnswerSet(now.q, d.display_answer, d.variants, normalizeAnswer), go = checkAnswerSet(sent.question, d.display_answer, d.variants, normalizeAnswer);
  if (g.blocked.length > go.blocked.length) fail.push(['answerSet', `정답 묶음 막힘 ${JSON.stringify(g.blocked)}`]);
  for (const kind of ['explain', 'question']) { const wn = ckN.warn.find((w) => w.kind === kind), wo = ckO.warn.find((w) => w.kind === kind); if (wn && !wo) warn.explainOverlap.push({ id: got.id, kind, shared: wn.shared ?? wn.share }); }
  // ⑤ 해설 길이 · 반말
  if (changed.includes('explanation')) {
    if (L(now.e) > 180) fail.push(['length', `해설 ${L(now.e)}자`]);
    if (banmal(now.e)) fail.push(['banmal', '해설 "~다." 끝']);
  }
  if (changed.includes('question')) {
    if (L(now.q) > 200) fail.push(['length', `질문 ${L(now.q)}자`]);
    if (!/까요\?\s*$/.test(now.q)) fail.push(['ending', '질문 끝이 ~까요? 아님']);
    if (formHit(now.q)) fail.push(['form', `질문 형태 '${formHit(now.q)}'`]);
  }
  if (HOLD.has(got.id)) fail.push(['hold', `GEN 보류: ${HOLD.get(got.id)}`]);
  if (fail.length) { gate[fail[0][0]].push({ id: got.id, file, job, answer: d.display_answer, fail: fail.map((x) => x[1]), before: Object.fromEntries(changed.map((k) => [k, sent[k]])), after: Object.fromEntries(changed.map((k) => [k, got[k]])) }); continue; }
  const o = { id: got.id, answer: d.display_answer, src: file, file, job, note: got.note };
  if (changed.includes('question')) o.question_text = { before: d.question_text, after: now.q, kind: job };
  if (changed.includes('hint')) o.general_hint = { before: d.general_hint, after: now.h, kind: job };
  if (changed.includes('explanation')) o.explanation = { before: d.explanation, after: now.e, kind: job, ...(sent.sibling_id ? { sibling: sent.sibling_id } : {}) };
  items.push(o);
}
const byJob = (arr) => arr.reduce((m, x) => ((m[x.job ?? '?'] = (m[x.job ?? '?'] ?? 0) + 1), m), {});
const counts = { got: src.length, keep: keep.length, keepByJob: byJob(keep), items: items.length, itemsByJob: byJob(items), gate: Object.fromEntries(Object.entries(gate).map(([k, v]) => [k, v.length])), waiting, absent };
writeFileSync(path.join(ROOT, 'data/pipeline/tone/g105-plan.json'), JSON.stringify({ round: 'G105', db, mode: 'shape', counts, notes, keep, gate, warn, hold: Object.fromEntries(HOLD) }, null, 1) + '\n');
writeFileSync(path.join(ROOT, 'data/pipeline/tone/g105-apply.json'), JSON.stringify({ round: 'G105', db_snapshot: db, note: '해설 옮기기(add) · 토막 상식 내리기(move) · 잇기 다시(rejoin) — 형태-NN', counts, items, deactivate: [] }, null, 1) + '\n');
console.log(db, JSON.stringify(counts));
for (const [k, v] of Object.entries(gate)) for (const x of v) console.log(' ', k, x.id, x.job ?? '', JSON.stringify(x.fail ?? x.cols ?? x.why ?? ''));
console.log('newWords', warn.newWords.length, '· explainOverlap', warn.explainOverlap.length);
