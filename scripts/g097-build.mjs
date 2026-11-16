#!/usr/bin/env node
// =============================================================================
// G097 — 카드 마무리 적용 json 만들기 (파일만 쓴다 · DB 읽기만)
//   A 같은 정답: tmp/g097/result-NN.json(Sonnet 판정) + data/pipeline/tone/g097-same-answer.json → 끄는 쪽 same_answer:#남긴id
//   B 근거 없음: data/pipeline/tone/g097-no-source.json + #2128(gpt 카드 힌트가 비어 서지 않음 — GEN 판단) → no_source_20261116
//   D #2365 ambiguous_answer · #7744 emoji_indistinct · #4189 그대로
//   E-② V104 표본 fix(data/pipeline/audit/v104-tone.json · 이번 라운드에 살아남는 카드만) → items
//   출력 data/pipeline/tone/g097-apply.json(tone-apply.mjs 가 읽음) · g097-same-answer-result.json
//   사용 node scripts/g097-build.mjs
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const SA = J('data/pipeline/tone/g097-same-answer.json');
const NS = J('data/pipeline/tone/g097-no-source.json');

// ── A 판정 모으기
const res = {};
for (const f of readdirSync(path.join(ROOT, 'tmp/g097')).filter((f) => /^result-\d+\.json$/.test(f))) Object.assign(res, J(`tmp/g097/${f}`));
const miss = SA.groups.filter((g) => !res[g.gid]).map((g) => g.gid);
if (miss.length) { console.error('★ 판정 없는 묶음', miss.length, miss.slice(0, 20).join(',')); process.exit(2); }
const ASK = existsSync(path.join(ROOT, 'tmp/g097/ask-result.json')) ? J('tmp/g097/ask-result.json') : {};
const off = new Map(); // id → reason
const groups = []; const cnt = { one: 0, keep_all: 0, ask: 0, off: 0 };
for (const g of SA.groups) {
  const r = res[g.gid]; cnt[r.verdict]++;
  const ids = g.cards.map((x) => x.id);
  const gOff = [];
  if (r.verdict === 'one') {
    if (!ids.includes(r.keep)) { console.error('★ keep 이 묶음 밖', g.gid, r.keep); process.exit(2); }
    for (const id of ids) if (id !== r.keep) { off.set(id, `same_answer:#${r.keep}`); gOff.push(id); }
  }
  // ask 2차(같은 존재끼리 나눈 부분 묶음 — 2장 이상인 부분 묶음은 한 장만)
  const sub = r.verdict === 'ask' ? ASK[g.gid] : null;
  if (r.verdict === 'ask') {
    if (!sub) { console.error('★ ask 2차 판정 없음', g.gid); process.exit(2); }
    const seen = sub.subsets.flatMap((s) => s.ids);
    if (seen.length !== ids.length || ids.some((x) => !seen.includes(x))) { console.error('★ ask 부분 묶음이 묶음과 다름', g.gid); process.exit(2); }
    for (const s of sub.subsets) if (s.ids.length > 1) {
      if (!s.ids.includes(s.keep)) { console.error('★ ask keep 이 부분 묶음 밖', g.gid); process.exit(2); }
      for (const id of s.ids) if (id !== s.keep) { off.set(id, `same_answer:#${s.keep}`); gOff.push(id); }
    }
    if (gOff.length) cnt.askSplit = (cnt.askSplit ?? 0) + 1; else cnt.askHomonym = (cnt.askHomonym ?? 0) + 1;
  }
  groups.push({ gid: g.gid, answer: g.answer, verdict: r.verdict, keep: r.keep ?? null, off: gOff, ...(sub ? { subsets: sub.subsets, why2: sub.why } : {}), why: r.why,
    cards: g.cards.map((x) => ({ id: x.id, answer: x.answer, grade: x.grade, gptWorth: x.gptWorth, question: x.question })) });
}
cnt.off = off.size;
// ── B · D
const B = [...NS.items.map((x) => x.id), 2128];
for (const id of B) off.set(id, 'no_source_20261116');
off.set(2365, 'ambiguous_answer'); off.set(7744, 'emoji_indistinct');

// ── E-② V104 표본 fix
const items = []; const fixSkip = [];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
const V = existsSync(path.join(ROOT, 'data/pipeline/audit/v104-tone.json')) ? J('data/pipeline/audit/v104-tone.json') : {};
const fixes = Object.values(V).filter((v) => v.verdict === 'fix' && v.fixed);
const rows = Object.fromEntries((await c.query(`select q.id::int, q.is_active, q.question_text, q.display_answer, q.general_hint, q.explanation,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
  from questions q where q.id = any($1::bigint[])`, [[...fixes.map((v) => v.id), ...off.keys()]])).rows.map((r) => [r.id, r]));
await c.end();
const COL = { question: 'question_text', hint: 'general_hint', explanation: 'explanation' };
for (const v of fixes) {
  const d = rows[v.id];
  if (off.has(v.id)) { fixSkip.push({ id: v.id, why: `이번 라운드에 끔(${off.get(v.id)})` }); continue; }
  if (!d?.is_active) { fixSkip.push({ id: v.id, why: '비활성' }); continue; }
  const now = { question_text: d.question_text, general_hint: d.general_hint, explanation: d.explanation };
  for (const [k, col] of Object.entries(COL)) if (v.fixed[k]) now[col] = v.fixed[k];
  const fail = [];
  for (const x of [d.display_answer, ...d.variants]) if (findAnswerInQuestion(now.question_text, x) === 'word' && findAnswerInQuestion(d.question_text, x) !== 'word') fail.push(`질문에 정답 '${x}'`);
  const ckN = checkHint({ hint: now.general_hint, answer: d.display_answer, variants: d.variants, question: now.question_text, explanation: now.explanation });
  const ckO = checkHint({ hint: d.general_hint, answer: d.display_answer, variants: d.variants, question: d.question_text, explanation: d.explanation });
  const oldB = new Set(ckO.block.map((b) => b.frag)); const nb = ckN.block.filter((b) => !oldB.has(b.frag));
  if (nb.length) fail.push(`힌트 막힘 ${nb.map((b) => b.frag).join('·')}`);
  if (v.fixed.question && !/까요\?\s*$/.test(now.question_text)) fail.push('질문 끝');
  if (fail.length) { fixSkip.push({ id: v.id, why: fail.join(' · ') }); continue; }
  const o = { id: v.id, answer: d.display_answer, src: `카드 V104 sample fix`, file: v.file };
  for (const [k, col] of Object.entries(COL)) if (v.fixed[k] && v.fixed[k] !== d[col]) o[col] = { before: d[col], after: v.fixed[k], kind: 'rewrite', fixedBy: 'v104-tone.json' };
  items.push(o);
}
const deactivate = [...off].filter(([id]) => rows[id]?.is_active !== false).map(([id, why]) => ({ id, answer: rows[id]?.display_answer, deactivate: why }));
const byWhy = {}; for (const x of deactivate) { const k = x.deactivate.startsWith('same_answer') ? 'same_answer' : x.deactivate; byWhy[k] = (byWhy[k] ?? 0) + 1; }
writeFileSync(path.join(ROOT, 'data/pipeline/tone/g097-same-answer-result.json'), JSON.stringify({ round: 'G097', counts: { groups: groups.length, ...cnt }, groups }, null, 1) + '\n');
writeFileSync(path.join(ROOT, 'data/pipeline/tone/g097-apply.json'), JSON.stringify({ round: 'G097', db_snapshot: db, note: '카드 마무리 — 같은 정답 한 장 · 근거 없는 카드 빼기 · 낱개 · V104 표본 fix', counts: { items: items.length, deactivate: deactivate.length, byWhy, fixSkip }, items, deactivate }, null, 1) + '\n');
console.log(db, 'A', JSON.stringify(cnt), '· 끄기', deactivate.length, JSON.stringify(byWhy), '· V104 fix', items.length, '건너뜀', JSON.stringify(fixSkip));
