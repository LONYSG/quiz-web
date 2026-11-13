#!/usr/bin/env node
// =============================================================================
// G068 G-1 — 이모지 2차(조각 21~40) 살피기 (★ 쓰기 0 · DB 읽기만) → tmp/g068e/scan.json
//   입력  web-desk/emoji/받은것/결과-21~33 · 35~37 · 살림-38 · 39 · 40 (결과-34 빔 · 결과-38~40 · _버림-* 은 안 씀)
//   본다  ① 새 묶음 안 같은 정답(정답 · 변형) ② 활성 이모지 문항과 같은 정답 ③ 이모지 줄이 활성 줄과 3개 이상 같은 순서
//         ④ 국기 · 글자 이모지 · 숫자 이모지 ⑤ 힌트 H2 막힘
//   사용  node scripts/g068e-emoji-scan.mjs
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer, flexCanon } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
export const INPUTS = [...Array.from({ length: 13 }, (_, i) => `결과-${21 + i}.json`), '결과-35.json', '결과-36.json', '결과-37.json', '살림-38.json', '살림-39.json', '살림-40.json'];
const J = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const C = (s) => flexCanon(normalizeAnswer(String(s ?? '')));
const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
export const graphemes = (s) => [...seg.segment(s)].map((x) => x.segment);
const base = (g) => g.replace(/[️\u{1F3FB}-\u{1F3FF}]/gu, '');
const isFlag = (g) => /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(g) || /\u{1F3F4}\u{E0067}/u.test(g);
const isLetter = (g) => /[\u{1F170}-\u{1F189}\u{1F18E}\u{1F191}-\u{1F19A}\u{1F1E6}-\u{1F1FF}ℹⓂ\u{1F520}-\u{1F524}]/u.test(g) && !isFlag(g) || /[A-Za-z0-9가-힣]/.test(g.replace(/[0-9#*]️?⃣/g, ''));
const isNum = (g) => /[0-9#*]️?⃣|\u{1F51F}/u.test(g);
function lcs(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0)); for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[m][n]; }

const items = [];
for (const f of INPUTS) {
  const j = J(path.join(ROOT, 'web-desk/emoji/받은것', f));
  j.results.forEach((x, k) => items.push({ ref: `${j.chunk}-${String(k + 1).padStart(2, '0')}`, chunk: j.chunk, field: j.field, file: f, ...x }));
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const act = (await c.query(`select q.id::int, q.question_text, q.display_answer, coalesce((select array_agg(answer_text) from question_answers x where x.question_id=q.id),'{}') ans
  from questions q where q.is_active and q.question_text like '%이모지가 나타내는%'`)).rows;
await c.end();
for (const r of act) { r.line = r.question_text.split(' — ')[0]; r.g = graphemes(r.line).map(base); r.genre = r.question_text.split('나타내는 ')[1]?.replace(/[은는]\?$/, ''); }
const actKey = new Map(); for (const r of act) for (const a of [r.display_answer, ...r.ans]) { const k = C(a); if (!actKey.has(k)) actKey.set(k, []); actKey.get(k).push(r); }

const out = { n: items.length, items: [], groups: [], sameActive: [], similar: [], flags: [], letters: [], numbers: [], hintBlock: [] };
const keyOf = new Map();
for (const x of items) {
  const ks = [x.answer, ...(x.alt ?? [])].map(C);
  for (const k of ks) { if (!keyOf.has(k)) keyOf.set(k, new Set()); keyOf.get(k).add(x.ref); }
  const hit = [...new Set(ks.flatMap((k) => actKey.get(k) ?? []))];
  if (hit.length) out.sameActive.push({ ref: x.ref, answer: x.answer, emoji: x.emoji, active: hit.map((r) => ({ id: r.id, answer: r.display_answer, q: r.question_text })) });
  const g = graphemes(x.emoji);
  if (g.some(isFlag)) out.flags.push({ ref: x.ref, answer: x.answer, emoji: x.emoji });
  if (g.some(isLetter)) out.letters.push({ ref: x.ref, answer: x.answer, emoji: x.emoji });
  if (g.some(isNum)) out.numbers.push({ ref: x.ref, answer: x.answer, emoji: x.emoji });
  const gb = g.map(base);
  for (const r of act) { const l = lcs(gb, r.g); if (l >= 3) out.similar.push({ ref: x.ref, answer: x.answer, emoji: x.emoji, id: r.id, activeAnswer: r.display_answer, activeLine: r.line, common: l }); }
  const hc = checkHint({ hint: x.hint, answer: x.answer, variants: x.alt ?? [], question: x.emoji, explanation: '' });
  if (hc.block.length) out.hintBlock.push({ ref: x.ref, answer: x.answer, hint: x.hint, frag: hc.block.map((b) => b.frag) });
  out.items.push({ ref: x.ref, file: x.file, field: x.field, emoji: x.emoji, answer: x.answer, alt: x.alt, hint: x.hint, why: x.why, diff: x.diff, year: x.year });
}
// 새 묶음 안 같은 정답(정답 · 변형 키를 잇는 묶음)
const parent = new Map(items.map((x) => [x.ref, x.ref])); const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
for (const s of keyOf.values()) { const a = [...s]; for (const b of a.slice(1)) parent.set(find(b), find(a[0])); }
const grp = new Map(); for (const x of items) { const r = find(x.ref); if (!grp.has(r)) grp.set(r, []); grp.get(r).push(x); }
for (const g of grp.values()) if (g.length > 1) out.groups.push(g.map((x) => ({ ref: x.ref, field: x.field, answer: x.answer, emoji: x.emoji, why: x.why })));
// 새 묶음 안 비슷한 줄
out.similarNew = [];
for (let i = 0; i < items.length; i++) for (let k = i + 1; k < items.length; k++) { const l = lcs(graphemes(items[i].emoji).map(base), graphemes(items[k].emoji).map(base)); if (l >= 3 && find(items[i].ref) !== find(items[k].ref)) out.similarNew.push({ a: items[i].ref + ' ' + items[i].answer + ' ' + items[i].emoji, b: items[k].ref + ' ' + items[k].answer + ' ' + items[k].emoji, common: l }); }
mkdirSync(path.join(ROOT, 'tmp/g068e'), { recursive: true });
writeFileSync(path.join(ROOT, 'tmp/g068e/scan.json'), JSON.stringify(out, null, 1));
console.log(`항목 ${items.length} · 활성 이모지 ${act.length} · 새 묶음 같은 정답 묶음 ${out.groups.length} · 활성과 같은 정답 ${out.sameActive.length} · 활성과 비슷한 줄 ${out.similar.length} · 새 묶음 안 비슷한 줄 ${out.similarNew.length} · 국기 ${out.flags.length} · 글자 ${out.letters.length} · 숫자 ${out.numbers.length} · 힌트 막힘 ${out.hintBlock.length}`);
