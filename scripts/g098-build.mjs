#!/usr/bin/env node
// =============================================================================
// G098 A — 찬종이 표본 20 에서 짚은 다섯 건 → data/pipeline/tone/g098-apply.json (파일만 쓴다 · DB 읽기만)
//   하마 #724 끔(form_20261116) · #5248 켬 / 미라 #1814 끔(form_20261116) · #3768 켬
//   3M #3453 켬 · #2152 끔(same_answer:#3453) / 루지 #5770 켬 · #5077 끔(same_answer:#5770)
//   폭스바겐 #3252 질문 한 문장
//   켜는 카드 확인(기계): 새 글이 실린 카드(카드-NNN apply · card-v1) · 힌트 막힘 없음 · 정답 낱말이 질문 · 힌트에 없음 → 아니면 켜지 않고 짝도 끄지 않는다
//   사용 node scripts/g098-build.mjs  → 그다음 node scripts/tone-apply.mjs --round g098 [--db quizweb_dev --skip-diff] [--apply]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { formHit } from './form-scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));

const PAIRS = [
  { name: '하마', on: 5248, off: 724, why: 'form_20261116' },
  { name: '미라', on: 3768, off: 1814, why: 'form_20261116' },
  { name: '3M', on: 3453, off: 2152, why: 'same_answer:#3453' },
  { name: '루지', on: 5770, off: 5077, why: 'same_answer:#5770' },
];
const VW = { id: 3252, after: '독일어로 회사 이름이 ‘국민차’라는 뜻이며, ‘골프’라는 이름의 자동차를 만드는 회사는 어디일까요?' };

// 새 글 실림 = 앞 라운드 apply 의 카드-NNN 항목(되돌림이 아닌 것)
const newText = new Map();
for (const f of readdirSync(path.join(ROOT, 'data/pipeline/tone')).filter((f) => /^g0\d\d-apply\.json$/.test(f) && f !== 'g098-apply.json').sort())
  for (const it of J(`data/pipeline/tone/${f}`).items ?? []) if (String(it.src ?? '').startsWith('카드-')) newText.set(it.id, !it.restore && !String(it.src).includes('되돌림'));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
const ids = [...PAIRS.flatMap((p) => [p.on, p.off]), VW.id];
const rows = Object.fromEntries((await c.query(`select q.id::int, q.is_active, q.inactive_reason, q.general_hint_version, q.question_text, q.display_answer, q.general_hint, q.explanation,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
  from questions q where q.id = any($1::bigint[])`, [ids])).rows.map((r) => [r.id, r]));
await c.end();

const activate = [], deactivate = [], checks = [];
for (const p of PAIRS) {
  const d = rows[p.on]; const fail = [];
  if (!newText.get(p.on) || d.general_hint_version !== 'card-v1') fail.push('새 글이 실린 카드가 아님');
  for (const x of [d.display_answer, ...d.variants]) {
    if (findAnswerInQuestion(d.question_text, x) === 'word') fail.push(`질문에 정답 '${x}'`);
    if (findAnswerInQuestion(d.general_hint, x) === 'word') fail.push(`힌트에 정답 '${x}'`);
  }
  const ck = checkHint({ hint: d.general_hint, answer: d.display_answer, variants: d.variants, question: d.question_text, explanation: d.explanation });
  if (ck.block.length) fail.push(`힌트 막힘 ${ck.block.map((b) => `${b.rule ?? ''}:${b.frag}`).join('·')}`);
  const fh = formHit(d.question_text); if (fh) fail.push(`질문 형태(~는, ~은) '${fh}'`);
  checks.push({ name: p.name, on: p.on, off: p.off, ok: !fail.length, fail, warn: ck.warn?.map((w) => w.frag ?? w) ?? [] });
  if (fail.length) continue;
  activate.push({ id: p.on, answer: d.display_answer, was: d.inactive_reason, hintVersion: 'card-v1', why: `G098 ${p.name} — 찬종 표본 20` });
  deactivate.push({ id: p.off, answer: rows[p.off].display_answer, deactivate: p.why, ifActivated: p.on });
}
// 폭스바겐 한 문장
const v = rows[VW.id]; const vf = [];
for (const x of [v.display_answer, ...v.variants]) if (findAnswerInQuestion(VW.after, x) === 'word') vf.push(`질문에 정답 '${x}'`);
if (!/까요\?\s*$/.test(VW.after)) vf.push('질문 끝');
if (formHit(VW.after)) vf.push('질문 형태');
const ckV = checkHint({ hint: v.general_hint, answer: v.display_answer, variants: v.variants, question: VW.after, explanation: v.explanation });
if (ckV.block.length) vf.push(`힌트 막힘 ${ckV.block.map((b) => b.frag).join('·')}`);
checks.push({ name: '폭스바겐', id: VW.id, ok: !vf.length, fail: vf });
const items = vf.length ? [] : [{ id: VW.id, answer: v.display_answer, src: 'G098 찬종 표본 20 — 골프 풀어 쓰기', question_text: { before: v.question_text, after: VW.after, kind: 'rewrite' } }];
if (v.question_text === VW.after) items[0].question_text.before = J('data/pipeline/tone/g098-apply.json').items.find((x) => x.id === VW.id).question_text.before;

writeFileSync(path.join(ROOT, 'data/pipeline/tone/g098-apply.json'), JSON.stringify({ round: 'G098', db_snapshot: db, note: '찬종 표본 20 에서 짚은 다섯 건 — 켜기 4 · 끄기 4 · 질문 1', checks, items, activate, deactivate }, null, 1) + '\n');
console.log(db, JSON.stringify(checks, null, 1));
