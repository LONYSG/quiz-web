#!/usr/bin/env node
// =============================================================================
// G120 — gpt 고침 묶음 web-desk/tone/보낼것/기존-고침-01.json 만들기(DB 읽기만 · 카드 글은 안 바꾼다)
//   꼴 = 새카드-고침-8.json(done · note · items[{ key, from, why, … card, material }])
//   넣는 카드(겹치면 한 장 · why 에 걸린 것 전부):
//     V118 fix 74(fix[] 칸 · 구절 · 재료 줄) · V118 blind wide 7(lack) · V118 read 199(걸린 갈래)
//     앞 판 고침이 DB 에 안 들어간 카드(PRIOR · 까닭 찾은 것) · V116 fix 14(새 카드 · 키 = n 번호 · 카드 = 받은것/새카드-NN)
//   재료 = 보낼것/재료-NNN.json 의 사실 + 재료 판정(audit/v0NN-material*.json) · 재료 없는 옛 묶음 = 카드 파일의 claims
//   needsRegrade = V118 값 + 질문 칸 fix · wide · 힌트가질문보다좋음 · 꼬임 · 대표사실없음(질문을 건드려야 함) · 새 카드는 실을 때 매긴다
//   사용 node scripts/g120-pack.mjs   (지금 활성 아닌 카드는 넣지 않고 수만 적는다)
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const A = path.join(ROOT, 'data/pipeline/audit/'), P = path.join(ROOT, 'data/pipeline/tone/'), T = path.join(ROOT, 'web-desk/tone/');
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const ls = (d, re) => fs.readdirSync(d).filter((f) => re.test(f)).sort();
const OUT = T + '보낼것/기존-고침-01.json';

const V = read(A + 'v118-cards.json').cards;
const V7 = read(A + 'v117-regrade.json').cards;
const V6 = read(A + 'v116-newcards.json').cards;

// 앞 판 고침이 DB 에 안 들어간 카드 — 설계가 든 5장의 까닭(G120 이 기록에서 찾음)
const PRIOR_FOUND = {
  3626: { in: false, why: 'G097 에서 같은 정답(#2323)으로 꺼짐 — 고침은 그 판에서 건너뜀(fixSkip) · 지금 활성 아님 → 넣지 않음' },
  2085: { in: false, why: '고친 힌트가 G093~G096 힌트 검사에 막힘(정답 글 "시민"이 힌트에) · 그 뒤 같은 정답(#3415)으로 꺼짐 · 지금 활성 아님 → 넣지 않음' },
  2929: { in: false, why: '고침은 G086 이 실었다 — 뒤에 G102 형태-02 가 문장 꼴만 바꿔(독일에 패함 · 힌트 UEFA 그대로) 글자 대조로 다르게 보였을 뿐 → 넣지 않음' },
  825: { in: false, why: '고침은 G096 이 실었다 — G097 이 끄고 G099 가 켠 뒤 G102 형태-01 이 문장 꼴만 바꿈(내용은 고친 그대로) → 넣지 않음' },
  3180: { in: true, round: 'V093', why: '고친 힌트가 G091~G096 힌트 검사에 막혀 못 실음(고친 힌트에 정답 "강박장애"가 들어 있음) — 일부러 뺀 것 아님 · 고친 힌트를 그대로 쓰지 말고 재료(베컴 · 냉장고 대칭)로 정답 말 없이 새로' },
};

// ── 카드 파일 · 재료 찾기 ──
const applied = new Map();
for (const f of ls(P, /^g0\d+-apply\.json$/)) { const j = read(P + f); for (const it of (j && j.items) || []) { const s = String(it.src || it.file || ''); if (s.startsWith('카드-')) applied.set(String(it.id), s.replace('.json', '').split(' ')[0]); } }
const prior = new Map();
for (const f of ls(A, /^v\d+-tone\.json$/)) { const j = read(A + f); if (j) for (const [k, v] of Object.entries(j)) if (v && v.verdict) prior.set(String(v.id ?? k), { round: v.round, why: v.why, fixed: v.fixed, file: v.file }); }
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

// ── 넣을 카드 · why ──
const items = new Map(); // key → { why[], src Set, needsRegrade }
const add = (key, src, why, nr = false) => { const it = items.get(key) ?? { why: [], src: new Set(), needsRegrade: false }; it.why.push(why); it.src.add(src); it.needsRegrade ||= nr; items.set(key, it); };
const Q_READ = /^(힌트가질문보다좋음|꼬임|대표사실없음)/;
const cnt = { fix: 0, wide: 0, read: 0, prior: 0, v116: 0, readKind: {} };
for (const [id, x] of Object.entries(V)) {
  if (x.verdict === 'fix') {
    cnt.fix++;
    for (const f of x.fix) add(id, 'V118 fix', { kind: 'fix', field: f.field, span: f.span, why: f.why, material: f.material, ...(id === '4462' ? { mark: 'VERIFY 확인 뒤 — 재료가 틀렸다는 판정(서천군 마서면)은 웹 요약으로만 본 것 · VERIFY V119 결과가 오면 설계가 맞춘다' } : {}) }, f.field === 'q' || !!x.needsRegrade);
  }
  if (x.blind === 'wide') { cnt.wide++; add(id, 'V118 wide', { kind: 'wide', lack: x.lack, blindAnswer: V7[id]?.blindAnswer ?? null }, true); }
  for (const r of x.read ?? []) {
    const k = r.split(':')[0].trim(); cnt.readKind[k] = (cnt.readKind[k] ?? 0) + 1;
    add(id, 'V118 read', { kind: 'read', what: k, note: r.slice(r.indexOf(':') + 1).trim() }, Q_READ.test(k));
  }
  if (x.read?.length) cnt.read++;
  if (x.needsRegrade && items.has(id)) items.get(id).needsRegrade = true;
}
for (const [id, p] of Object.entries(PRIOR_FOUND)) if (p.in) {
  cnt.prior++;
  const pr = prior.get(id);
  add(id, `앞 판 ${p.round} fix`, { kind: 'prior', round: p.round, why: pr.why, fixed: pr.fixed, notIn: p.why }, !!pr.fixed?.question);
}

// ── DB ──
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const cats = new Map((await db.query('select id,name_ko,parent_id from categories')).rows.map((r) => [r.id, r]));
const catPath = (id) => { const o = []; let c = cats.get(id); while (c) { o.unshift(c.name_ko); c = c.parent_id ? cats.get(c.parent_id) : null; } return o.join(' > '); };
const ids = [...items.keys()].map(Number);
const rows = new Map((await db.query('select id::int,is_active,category_id,question_text,display_answer,general_hint,explanation,difficulty_score,worth,worth_why from questions where id = any($1)', [ids])).rows.map((r) => [String(r.id), r]));
const ans = (await db.query('select question_id::int qid,answer_text,is_primary from question_answers where question_id = any($1) order by is_primary desc, id', [ids])).rows;
const varOf = (id, a) => [...new Set(ans.filter((x) => x.qid === +id && x.answer_text !== a).map((x) => x.answer_text))];
await db.end();

const out = [], skipped = [];
for (const [id, it] of [...items].sort((a, b) => +a[0] - +b[0])) {
  const r = rows.get(id);
  if (!r?.is_active) { skipped.push({ id: +id, why: '지금 활성 아님' }); continue; }
  const material = materialOf(id);
  const why = it.why;
  if (material.state.includes('빼는 쪽')) why.push({ kind: 'note', note: '재료로는 빼는 쪽 — 새 사실을 더하는 고침은 못 한다 · 지금 글 안에서 빼거나 고쳐 되면 고치고, 안 되면 drop' });
  out.push({ key: id, from: [...it.src].join(' · '), why, needsRegrade: it.needsRegrade,
    card: { id: +id, field: catPath(r.category_id), question: r.question_text, answer: r.display_answer, also: varOf(id, r.display_answer), hint: r.general_hint, explanation: r.explanation, grade: r.difficulty_score, worth: r.worth, worthWhy: r.worth_why, cardFile: applied.get(id) ?? null },
    material });
}

// ── V116 fix 14(새 카드) ──
for (const [k, x] of Object.entries(V6)) {
  if (x.verdict !== 'fix') continue;
  cnt.v116++;
  const card = read(`${T}받은것/새카드-${x.chunk}.json`)?.cards?.find((c) => c.key === x.key);
  const mat = read(`${T}보낼것/새재료-${x.chunk}.json`)?.items?.find((c) => c.key === x.key);
  if (!card || !mat) throw new Error(`${x.key} 카드 · 재료를 못 찾음`);
  out.push({ key: x.key, from: `V116 fix · web-desk/tone/받은것/새카드-${x.chunk}.json`, why: [{ kind: 'v116', why: x.why, claims: x.claims, quotesNotConfirmed: x.quotesNotConfirmed }], needsRegrade: true, blind: x.blind ?? null, alsoAdd: x.alsoAdd ?? [], second: x.second ?? null, card, material: mat });
}

// 갈래별 장수(겹침 뺀 수)
const by = {}; for (const o of out) for (const s of new Set(o.why.map((w) => w.kind === 'read' ? 'read:' + w.what : w.kind))) by[s] = (by[s] ?? 0) + 1;
const summary = { cards: out.length, old: out.filter((o) => !o.key.startsWith('n')).length, new: out.filter((o) => o.key.startsWith('n')).length, needsRegrade: out.filter((o) => o.needsRegrade).length,
  byKind: by, sourceCounts: cnt, skippedInactive: skipped, materialState: out.reduce((m, o) => { const s = o.material.state ?? '새 카드 재료'; m[s] = (m[s] ?? 0) + 1; return m; }, {}), prior5: PRIOR_FOUND };
const doc = { done: true, note: 'G120 · 기존 카드 고침 1차 — V118 fix · wide · read + 앞 판 고침 못 실은 1장(#3180) + V116 fix 14(새 카드 · 키 n 번호) · 키 = 실 DB id · 재료에 없는 사실은 쓰지 않는다 · needsRegrade = 질문이 바뀌면 실을 때 등급 · 알가치 다시 매김 · #4462 는 VERIFY V119 뒤', summary, items: out };
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 1));
