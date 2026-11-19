#!/usr/bin/env node
// =============================================================================
// G105 A — gpt 묶음 만들기(기계 · DB 읽기만 · quizweb)
//   job add  : web-desk/pick/_swap.json 중 on 활성 · off 비활성 + 찬종이 짚은 두 쌍(#5770←#5077 · #3453←#2152)
//   job move : web-desk/check/_tidbit.json 8장 중 활성
//   facts    : 그 카드 재료(보낼것/재료-NNN.json)의 extra(판정 drop 뺌 · fix 면 판정 글) 5개까지
//   core     : 재료 core(판정 core_fix 가 있으면 그것)
//   출력 web-desk/tone/보낼것/형태-06.json ~ (50장씩 · 묶음마다 job 하나) · 형태-06~.txt 한 줄 요약
//   사용 node scripts/g105-build.mjs
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';

const P = (...x) => path.join(ROOT, ...x);
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const SEND = P('web-desk/tone/보낼것');

// ── 재료 · 판정 색인 ─────────────────────────────────────────────────────────
const MAT = new Map(); // id → {item, chunk}
for (const f of readdirSync(SEND).filter((f) => /^재료-\d+\.json$/.test(f)).sort()) {
  const s = J(path.join(SEND, f));
  for (const it of s.items) MAT.set(it.id, { item: it, chunk: f.match(/\d+/)[0] });
}
const AUD = P('data/pipeline/audit');
const VFACT = new Map(); // ref → {verdict, text}
const CFIX = new Map();
for (const f of readdirSync(AUD).filter((f) => /^v\d+-material.*\.json$/.test(f))) {
  let s; try { s = J(path.join(AUD, f)); } catch { continue; }
  for (const x of s.facts ?? []) if (x.ref) VFACT.set(x.ref, x);
  for (const x of s.core_fix ?? []) CFIX.set(x.id, x.core);
}
function extras(id) {
  const m = MAT.get(id); if (!m) return [];
  const out = [];
  for (const e of m.item.extra ?? []) {
    const v = VFACT.get(e.extra_id);
    if (v?.verdict === 'drop') continue;
    out.push(v?.verdict === 'fix' && v.text ? v.text : e.text);
  }
  return out.slice(0, 5);
}
const core = (id) => CFIX.get(id) ?? MAT.get(id)?.item.core ?? null;

// ── DB ───────────────────────────────────────────────────────────────────────
process.loadEnvFile?.(P('.env'));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const Q = new Map((await c.query('select id::int, is_active, display_answer, question_text, general_hint, explanation from questions')).rows.map((r) => [r.id, r]));
await c.end();

// ── add ──────────────────────────────────────────────────────────────────────
const swap = J(P('web-desk/pick/_swap.json'));
const pairs = swap.map((s) => ({ on: s.on, off: s.off, key: s.key }));
for (const [on, off] of [[5770, 5077], [3453, 2152]]) if (!pairs.some((p) => p.on === on && p.off === off)) pairs.push({ on, off, key: '찬종' });
const add = [], addSkip = [];
for (const p of pairs) {
  const a = Q.get(p.on), b = Q.get(p.off);
  if (!a?.is_active) { addSkip.push({ ...p, why: 'on 비활성' }); continue; }
  if (!b || b.is_active) { addSkip.push({ ...p, why: 'off 활성' }); continue; }
  if (add.some((x) => x.id === p.on)) { addSkip.push({ ...p, why: 'on 겹침' }); continue; }
  add.push({ id: a.id, job: 'add', answer: a.display_answer, question: a.question_text, hint: a.general_hint, explanation: a.explanation,
    sibling_id: b.id, sibling_question: b.question_text, sibling_explanation: b.explanation, facts: extras(a.id) });
}

// ── move ─────────────────────────────────────────────────────────────────────
const tid = J(P('web-desk/check/_tidbit.json')).items;
const move = [], moveSkip = [];
for (const t of tid) {
  const q = Q.get(t.id);
  if (!q?.is_active) { moveSkip.push({ id: t.id, why: '비활성' }); continue; }
  const sib = swap.find((s) => s.on === t.id);
  const sq = sib ? Q.get(sib.off) : null;
  const facts = (MAT.get(t.id)?.item.facts ?? []).filter((f) => ['맞음', '상식'].includes(f.check)).map((f) => VFACT.get(f.fact_id)?.verdict === 'fix' && VFACT.get(f.fact_id).text ? VFACT.get(f.fact_id).text : f.text);
  move.push({ id: q.id, job: 'move', answer: q.display_answer, question: q.question_text, hint: q.general_hint, explanation: q.explanation,
    core: core(q.id), ...(sq ? { sibling_question: sq.question_text } : {}), facts: [...facts, ...extras(q.id)], why: t.why });
}

// ── 묶음 쓰기 ────────────────────────────────────────────────────────────────
const NOTE = {
  add: 'job=add — 꺼진 카드(sibling_*)의 일화를 남은 카드 해설로(지시서-형태.md v1.1). 남은 해설에 이미 이야기가 있으면 note "그대로". 질문 · 힌트는 고치지 않는다. facts = 그 카드 재료의 쓰지 않은 사실(판정 통과).',
  move: 'job=move — 질문의 토막 상식을 해설로 내리고 질문은 core(대표 사실)로(지시서-형태.md). facts = 그 카드 재료의 확인된 사실 + 쓰지 않은 사실. why = 웹이 짚은 까닭(읽기용).',
};
const made = [];
let n = 6;
for (const [job, list] of [['add', add], ['move', move]]) {
  for (let i = 0; i < list.length; i += 50) {
    const name = `형태-${String(n).padStart(2, '0')}`;
    if (n === 20) throw new Error('형태-20 은 rejoin 자리 — 번호가 모자람');
    const cards = list.slice(i, i + 50);
    const f = path.join(SEND, `${name}.json`);
    if (existsSync(path.join(ROOT, 'web-desk/tone/받은것', `${name}.json`))) throw new Error(`${name} 받은것이 이미 있음`);
    writeFileSync(f, JSON.stringify({ bundle: name, made: '2026-11-19', count: cards.length, note: NOTE[job], cards }, null, 1) + '\n');
    made.push({ name, job, count: cards.length });
    n++;
  }
}
const line = `G105 A (2026-11-19) — ${made.map((m) => `${m.name} ${m.job} ${m.count}`).join(' · ')} · 합 ${add.length + move.length}장 (add ${add.length} · move ${move.length}) · 뺀 것 add ${addSkip.length} · move ${moveSkip.length}`;
writeFileSync(path.join(SEND, `형태-06~.txt`), line + '\n');
writeFileSync(P('data/pipeline/audit/g105-build.json'), JSON.stringify({ made, addSkip, moveSkip, factsEmpty: add.filter((x) => !x.facts.length).length }, null, 1) + '\n');
console.log(line);
console.log('add 뺀 까닭', addSkip.reduce((o, x) => ((o[x.why] = (o[x.why] ?? 0) + 1), o), {}), '· move 뺀 것', moveSkip, '· facts 빈 add', add.filter((x) => !x.facts.length).length);
