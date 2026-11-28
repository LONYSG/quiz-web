#!/usr/bin/env node
// =============================================================================
// G121 — 다음 gpt 고침 묶음 web-desk/tone/보낼것/기존-고침-02.json 만들기(DB 읽기만 · g120-pack.mjs 를 고쳐 씀 · 꼴 = 기존-고침-01.json)
//   넣는 카드(겹치면 한 장 · why 에 걸린 것 전부):
//     ① V120 fix 15(기존 14 + 새 카드 n6887) — card = **지금 DB 글**(새 카드는 아직 안 실려 보낼것 card 그대로) ·
//        why = 01 의 why(V118 · V116 까닭) + V120 fix(칸 · 구절 · 까닭 · 재료) · tried = gpt 가 한 번 고쳤다 걸린 문장(참고)
//     ② V119 fix 8(#2592 · #2608 · #2820 · #2969 · #4462 · #4991 · #5012 · #7455) — v119-check.json cards[id].fix 의 구절 · 맞는 값 · 연 주소를
//        why 와 material.extra 에 · card = 지금 DB 글
//     ③ G121 싣기 1-6 에서 막힌 카드(audit/g121-plan-quizweb.json notLoaded gate) — why = 막힌 까닭 · tried = gpt 가 고친 글
//   재료 = 01 에 있던 카드는 01 의 material 그대로 · 없던 카드는 g120-pack 의 materialOf(재료-NNN + 재료 판정)
//   사용 node scripts/g121-pack.mjs   (지금 활성 아닌 기존 카드는 넣지 않고 수만 · 묶음이 비면 만들지 않는다)
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const A = path.join(ROOT, 'data/pipeline/audit/'), P = path.join(ROOT, 'data/pipeline/tone/'), T = path.join(ROOT, 'web-desk/tone/');
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const ls = (d, re) => fs.readdirSync(d).filter((f) => re.test(f)).sort();
const OUT = T + '보낼것/기존-고침-02.json';

const V120 = read(A + 'v120-fix.json'); if (V120?.done !== true) throw new Error('V120 done 아님');
const V119 = read(A + 'v119-check.json').cards;
const PLAN = read(A + 'g121-plan-quizweb.json'); if (!PLAN) throw new Error('g121-plan-quizweb.json 없음 — g121-apply 먼저');
const V119_FIX = ['2592', '2608', '2820', '2969', '4462', '4991', '5012', '7455'];
const SEND = new Map(), GOT = new Map();
for (let i = 1; i <= 8; i++) {
  for (const x of read(`${T}보낼것/기존-고침-01-p0${i}.json`).items) SEND.set(String(x.key), x);
  for (const x of read(`${T}받은것/기존-고침-01-p0${i}.json`).cards) GOT.set(String(x.key), x);
}
const GF = { q: 'question', hint: 'hint', exp: 'explanation' };

// ── 재료(g120-pack 그대로) ──
const applied = new Map();
for (const f of ls(P, /^g0\d+-apply\.json$/)) { const j = read(P + f); for (const it of (j && j.items) || []) { const s = String(it.src || it.file || ''); if (s.startsWith('카드-')) applied.set(String(it.id), s.replace('.json', '').split(' ')[0]); } }
const cache = new Map();
const once = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const matFile = (n) => once('m' + n, () => read(`${T}보낼것/재료-${n}.json`));
const cardFile = (n) => once('c' + n, () => read(`${T}받은것/카드-${n}.json`));
const judge = (n) => once('j' + n, () => { const m = new Map(); for (const f of ls(A, /^v\d+-material(-\d+)?\.json$/)) { const j = read(A + f); if (j && String(j.chunk) === n) for (const x of j.facts || []) m.set(x.ref, { verdict: x.verdict, why: x.why, fixed: x.fixed, round: j.round }); } return m; });
function materialOf(id) {
  const file = applied.get(id);
  if (!file) return { state: '재료 없음 — 다시 쓴 기록이 없는 카드 · 재료로는 빼는 쪽(지금 글에 있는 사실만으로 고치기)', facts: [] };
  const n = file.replace('카드-', '').padStart(3, '0');
  const mat = matFile(n); const item = mat?.items?.find((i) => String(i.id) === id);
  if (item) {
    const J = judge(n);
    const facts = (item.facts || []).map((f) => { const j = J.get(f.fact_id); return { id: f.fact_id, where: f.where, check: f.check, text: f.text, ...(f.fixed ? { fixed: f.fixed } : {}), url: f.url, quote: f.quote, ...(j ? { judge: j } : {}) }; });
    const extra = (item.extra || []).map((e) => { const j = J.get(e.extra_id); return { id: e.extra_id, text: e.text, url: e.url, quote: e.quote, ...(j ? { judge: j } : {}) }; });
    return { state: '재료 있음', file: `보낼것/재료-${n}.json`, core: item.core ?? null, facts, extra, note: item.note ?? null, hold: item.hold ?? false };
  }
  const r = cardFile(n)?.results?.find((x) => String(x.id) === id);
  if (r?.claims?.length) return { state: '옛 묶음 — 재료 파일 없음 · 카드 파일의 claims 만(판정 없음)', file: `받은것/카드-${n}.json`, claims: r.claims, note: r.note ?? null };
  return { state: '재료 없음(옛 묶음 · 카드 파일에 claims 도 없음) — 재료로는 빼는 쪽', file: `받은것/카드-${n}.json`, note: r?.note || null, facts: [] };
}

// ── 넣을 카드 ──
const items = new Map();
const add = (k, src, whys, nr, tried) => {
  const it = items.get(k) ?? { why: [], src: new Set(), needsRegrade: false, tried: null };
  it.why.push(...whys); it.src.add(src); it.needsRegrade ||= !!nr; if (tried) it.tried = { ...(it.tried ?? {}), ...tried }; items.set(k, it);
};
const triedOf = (k, fields) => { const g = GOT.get(k); if (!g) return null; const o = {}; for (const f of fields) o[GF[f]] = g[GF[f]]; o.gptWhy = g.why; return o; };
const cnt = { v120fix: 0, v119fix: 0, gate: 0 };
// ① V120 fix
for (const [k, v] of Object.entries(V120.cards)) {
  if (v.verdict !== 'fix') continue;
  cnt.v120fix++;
  const s = SEND.get(k);
  add(k, 'V120 fix', [...(s?.why ?? []).map((w) => ({ ...w, round: w.round ?? (k.startsWith('n') ? 'V116' : 'V118') })), ...v.fix.map((f) => ({ kind: 'v120', field: f.field, span: f.span, why: f.why, material: f.material, sort: f.kind, unsolved: v.unsolved || undefined }))],
    s?.needsRegrade || v.fix.some((f) => f.field === 'q') || (v.changedReal ?? []).includes('q'), triedOf(k, v.changedReal ?? []));
}
// ② V119 fix
const v119Extra = new Map();
for (const k of V119_FIX) {
  const x = V119[k]; if (x?.verdict !== 'fix') throw new Error(`V119 ${k} fix 아님`);
  cnt.v119fix++;
  add(k, 'V119 fix', x.fix.map((f) => ({ kind: 'v119', field: f.field, span: f.span, why: f.why, right: f.right, url: f.url, quote: f.quote, note: `${x.why}` })), x.fix.some((f) => f.field === 'q'), null);
  v119Extra.set(k, x.fix.map((f, i) => ({ id: `v119-${i + 1}`, text: f.right, url: f.url, quote: f.quote, judge: { round: 'V119', verdict: '맞는 값(웹으로 연 것)', why: f.why } })));
}
// ③ G121 게이트에 막힌 카드
for (const x of PLAN.notLoaded.filter((y) => y.gate)) {
  cnt.gate++;
  const k = String(x.id), v = V120.cards[k], s = SEND.get(k);
  add(k, 'G121 싣기 막힘', [...(s?.why ?? []), { kind: 'gate', why: `gpt 가 고친 글이 싣기 게이트에 막힘 — ${x.why} · 고친 칸을 정답 글(조각) 없이 다시` }], s?.needsRegrade, triedOf(k, v?.changedReal ?? []));
}

// ── DB(지금 글) ──
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const cats = new Map((await db.query('select id,name_ko,parent_id from categories')).rows.map((r) => [r.id, r]));
const catPath = (id) => { const o = []; let c = cats.get(id); while (c) { o.unshift(c.name_ko); c = c.parent_id ? cats.get(c.parent_id) : null; } return o.join(' > '); };
const ids = [...items.keys()].filter((k) => !k.startsWith('n')).map(Number);
const rows = new Map((await db.query('select id::int,is_active,category_id,question_text,display_answer,general_hint,explanation,difficulty_score,worth,worth_why from questions where id = any($1)', [ids])).rows.map((r) => [String(r.id), r]));
const ans = (await db.query('select question_id::int qid,answer_text,is_primary from question_answers where question_id = any($1) order by is_primary desc, id', [ids])).rows;
const varOf = (id, a) => [...new Set(ans.filter((x) => x.qid === +id && x.answer_text !== a).map((x) => x.answer_text))];
await db.end();

const out = [], skipped = [], spanGone = [];
for (const [k, it] of [...items].sort((a, b) => (a[0].startsWith('n') - b[0].startsWith('n')) || (parseInt(a[0].replace('n', '')) - parseInt(b[0].replace('n', ''))))) {
  const s = SEND.get(k);
  if (k.startsWith('n')) {
    out.push({ key: k, from: [...it.src].join(' · ') + ` · ${s.from}`, why: it.why, needsRegrade: true, tried: it.tried, blind: s.blind ?? null, alsoAdd: s.alsoAdd ?? [], second: s.second ?? null, card: s.card, material: s.material });
    continue;
  }
  const r = rows.get(k);
  if (!r?.is_active) { skipped.push({ id: +k, why: '지금 활성 아님' }); continue; }
  const material = s?.material ? structuredClone(s.material) : materialOf(k);
  if (v119Extra.has(k)) material.extra = [...(material.extra ?? []), ...v119Extra.get(k)];
  // V119 구절이 지금 글에 그대로 있는지(01 고침으로 이미 바뀐 카드가 있다)
  for (const w of it.why.filter((x) => x.kind === 'v119')) {
    const txt = { q: r.question_text, hint: r.general_hint, exp: r.explanation }[w.field] ?? '';
    if (!txt.includes(w.span)) { w.spanNow = '이 구절은 지금 글에 없다(01 고침으로 바뀜) — 지금 글에 같은 사실이 남았는지 보고 맞는 값으로'; spanGone.push(k); }
  }
  if (material.state?.includes('빼는 쪽') && !it.why.some((w) => w.kind === 'note')) it.why.push({ kind: 'note', note: '재료로는 빼는 쪽 — 새 사실을 더하는 고침은 못 한다 · 지금 글 안에서 빼거나 고쳐 되면 고치고, 안 되면 drop' });
  out.push({ key: k, from: [...it.src].join(' · '), why: it.why, needsRegrade: it.needsRegrade, ...(it.tried ? { tried: it.tried } : {}),
    card: { id: +k, field: catPath(r.category_id), question: r.question_text, answer: r.display_answer, also: varOf(k, r.display_answer), hint: r.general_hint, explanation: r.explanation, grade: r.difficulty_score, worth: r.worth, worthWhy: r.worth_why, cardFile: applied.get(k) ?? s?.card?.cardFile ?? null },
    material });
}
if (!out.length) { console.log('묶음이 비었다 — 만들지 않음'); process.exit(0); }
const by = {}; for (const o of out) for (const x of o.from.split(' · ')) if (/^(V120|V119|G121)/.test(x)) by[x] = (by[x] ?? 0) + 1;
const summary = { cards: out.length, old: out.filter((o) => !o.key.startsWith('n')).length, new: out.filter((o) => o.key.startsWith('n')).length, needsRegrade: out.filter((o) => o.needsRegrade).length, byKind: by, sourceCounts: cnt, skippedInactive: skipped, v119SpanGone: spanGone,
  materialState: out.reduce((m, o) => { const s = o.material?.state ?? '새 카드 재료'; m[s] = (m[s] ?? 0) + 1; return m; }, {}) };
const doc = { done: true, note: 'G121 · 기존 카드 고침 2차 — V120 fix 15(새 카드 n6887 포함) + V119 fix 8 + G121 싣기 게이트에 막힌 2 · 키 = 실 DB id(새 카드 n 번호) · card = 지금 DB 글 · tried = 1차에 gpt 가 고쳤다 걸린 문장(참고만 — 그대로 다시 내지 않는다) · 재료에 없는 사실은 쓰지 않는다 · needsRegrade = 질문이 바뀌면 실을 때 등급 · 알가치 다시 매김', summary, items: out };
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 1));
