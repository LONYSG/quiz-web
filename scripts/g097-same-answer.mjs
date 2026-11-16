#!/usr/bin/env node
// =============================================================================
// G097 A-1 · B — 같은 정답 묶음 만들기 + 근거 없는 카드 목록 (파일만 쓴다 · DB 읽기만)
//   대상 = 카드 통째로 다시 쓰기의 7,147장(web-desk/tone/보낼것/카드-NNN.txt 의 id) 중 지금 활성
//   "새 글 실림" = data/pipeline/tone/g0*-apply.json 의 items 중 src 가 '카드-' 로 시작하는 마지막 항목이 되돌림이 아닌 것
//   B(근거 없음) = 활성인데 새 글이 실리지 않은 것 — 예외 KEEP(찬종 · D) · D 에서 따로 처리하는 것은 뺀다
//   A 묶음 = B 를 뺀 나머지 활성 카드끼리(B 는 어차피 끄므로 남길 쪽 후보가 될 수 없다 · GEN 판단)
//     정답 + question_answers 변형을 정규화(공백 · 기호 · 대소문자 제거)해 하나라도 겹치면 같은 묶음(union-find)
//   출력 data/pipeline/tone/g097-same-answer.json · g097-no-source.json · tmp/g097/chunk-NN.json(하위 에이전트 입력)
//   사용 node scripts/g097-same-answer.mjs
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const OUT = 'web-desk/tone/보낼것', IN = 'web-desk/tone/받은것';
const KEEP_OLD = new Set([4189]); // D: 옛 글 그대로 활성
const D_SEPARATE = new Set([2365, 2128]); // D: 따로 처리(끄기 · 정답 고치기)
const norm = (s) => normalizeAnswer(s).replace(/[^\p{L}\p{N}]/gu, '');

// ── 7,147장 + 묶음 · 등급
const U = new Map();
for (const f of readdirSync(path.join(ROOT, OUT)).filter((f) => /^카드-\d{3}\.txt$/.test(f)).sort()) {
  const chunk = f.slice(3, 6); let cur = null;
  for (const line of readFileSync(path.join(ROOT, OUT, f), 'utf8').split(/\r?\n/)) {
    const h = line.match(/^\[(\d+)\](?:\s*등급\s*(\d+))?/); if (h) { cur = Number(h[1]); U.set(cur, { chunk, grade: h[2] ? Number(h[2]) : null }); }
  }
}
// ── 새 글 실림
const last = new Map();
for (const f of readdirSync(path.join(ROOT, 'data/pipeline/tone')).filter((f) => /^g0\d\d-apply\.json$/.test(f) && f !== 'g097-apply.json').sort()) {
  for (const it of J(`data/pipeline/tone/${f}`).items ?? []) if (String(it.src ?? '').startsWith('카드-'))
    last.set(it.id, { round: f.slice(0, 4), restore: !!it.restore || String(it.src).includes('되돌림'), sampleFix: (last.get(it.id)?.sampleFix ?? false) || String(it.src).includes('sample fix') });
}
// ── gpt 카드(worth · status · note) — 묶음 파일이 시범(카드-18)을 이긴다
const gpt = new Map();
const cf = readdirSync(path.join(ROOT, IN)).filter((f) => /^카드-(18|\d{3})\.json$/.test(f)).sort((x, y) => (x === '카드-18.json' ? -1 : y === '카드-18.json' ? 1 : x.localeCompare(y)));
for (const f of cf) { let r; try { r = J(`${IN}/${f}`).results ?? []; } catch { continue; } for (const x of r) if (!gpt.has(x.id) || x.status === 'ready' || f !== '카드-18.json') gpt.set(x.id, { status: x.status, worth: x.worth ?? null, note: x.note ?? '' }); }
// ── 재료 angle · hold
const mat = new Map();
for (const f of readdirSync(path.join(ROOT, OUT)).filter((f) => /^재료-\d{3}\.json$/.test(f))) {
  let j; try { j = J(`${OUT}/${f}`); } catch { continue; }
  for (const x of j.items ?? []) mat.set(x.id, { angle: x.angle ?? null, hold: x.hold ?? false, hold_why: x.hold_why ?? x.why ?? null });
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
const rows = (await c.query(`select q.id::int, q.is_active, q.inactive_reason, q.question_text, q.display_answer, q.general_hint, q.explanation, q.difficulty_score, q.worth, cat.name_ko category,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
  from questions q left join categories cat on cat.id=q.category_id where q.id = any($1::bigint[])`, [[...U.keys()]])).rows;
await c.end();

const cards = []; const noSource = [];
for (const r of rows) {
  if (!r.is_active) continue;
  const l = last.get(r.id); const applied = !!l && !l.restore;
  const g = gpt.get(r.id) ?? {}; const m = mat.get(r.id) ?? {};
  const card = { id: r.id, chunk: U.get(r.id).chunk, grade: U.get(r.id).grade, difficulty_score: r.difficulty_score, category: r.category, answer: r.display_answer, variants: r.variants,
    question: r.question_text, hint: r.general_hint, explanation: r.explanation, applied, sampleFix: !!l?.sampleFix, gptStatus: g.status ?? null, gptWorth: g.worth ?? null, gptNote: g.note || null, angle: m.angle ?? null };
  if (!applied && !KEEP_OLD.has(r.id) && !D_SEPARATE.has(r.id)) { noSource.push({ ...card, why: g.status && g.status !== 'ready' ? `gpt ${g.status}` : m.hold ? '재료 hold' : 'ready 였으나 못 실음(게이트 · drop · 판정 대기)' }); continue; }
  cards.push(card);
}
// ── union-find
const par = new Map(cards.map((x) => [x.id, x.id]));
const find = (x) => (par.get(x) === x ? x : (par.set(x, find(par.get(x))), par.get(x)));
const byNorm = new Map();
for (const x of cards) for (const a of [x.answer, ...x.variants]) { const n = norm(a); if (!n) continue; if (byNorm.has(n)) par.set(find(x.id), find(byNorm.get(n))); else byNorm.set(n, x.id); }
const groups = new Map();
for (const x of cards) (groups.get(find(x.id)) ?? groups.set(find(x.id), []).get(find(x.id))).push(x);
const multi = [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a.id - b.id))
  .sort((a, b) => a[0].id - b[0].id).map((g, i) => ({ gid: `S${String(i + 1).padStart(4, '0')}`, answer: g[0].answer, size: g.length, cards: g }));
const sizes = {}; for (const g of multi) sizes[g.size] = (sizes[g.size] ?? 0) + 1;
writeFileSync(path.join(ROOT, 'data/pipeline/tone/g097-same-answer.json'), JSON.stringify({ round: 'G097', db, note: '같은 정답 묶음(활성 · 근거 없는 카드 B 를 뺀 나머지) — 정답 · 변형 정규화가 하나라도 겹치면 같은 묶음', counts: { active: cards.length + noSource.length, pool: cards.length, groups: multi.length, cardsInGroups: multi.reduce((s, g) => s + g.size, 0), sizes }, groups: multi }, null, 1) + '\n');
writeFileSync(path.join(ROOT, 'data/pipeline/tone/g097-no-source.json'), JSON.stringify({ round: 'G097', db, note: 'B 근거 없는 카드 — 활성인데 새 글이 실리지 않은 것(예외 #4189 옛 글 그대로 · #2365 · #2128 은 D 에서)', count: noSource.length, items: noSource.map(({ id, answer, chunk, why, gptStatus, gptNote, question }) => ({ id, answer, chunk, why, gptStatus, gptNote, question })) }, null, 1) + '\n');
// ── 하위 에이전트 입력(150 묶음씩)
const dir = path.join(ROOT, 'tmp/g097'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const N = 150; let k = 0;
for (let i = 0; i < multi.length; i += N) {
  k++; const part = multi.slice(i, i + N).map((g) => ({ gid: g.gid, answer: g.answer, cards: g.cards.map(({ id, grade, answer, variants, question, hint, explanation, applied, sampleFix, gptWorth, gptNote, angle }) => ({ id, grade, answer, variants, question, hint, explanation, applied, sampleFix, gptWorth, ...(gptNote ? { gptNote } : {}), ...(angle ? { angle } : {}) })) }));
  writeFileSync(path.join(dir, `chunk-${String(k).padStart(2, '0')}.json`), JSON.stringify(part, null, 1) + '\n');
}
console.log(db, 'active', cards.length + noSource.length, 'noSource', noSource.length, 'pool', cards.length, 'groups', multi.length, 'cards', multi.reduce((s, g) => s + g.size, 0), 'sizes', JSON.stringify(sizes), 'chunks', k);
const why = {}; for (const x of noSource) why[x.why] = (why[x.why] ?? 0) + 1; console.log('noSource why', JSON.stringify(why));
for (const g of multi.filter((g) => g.size >= 4)) console.log(' big', g.gid, g.size, [...new Set(g.cards.flatMap((x) => [x.answer, ...x.variants]))].slice(0, 12).join('/'));
