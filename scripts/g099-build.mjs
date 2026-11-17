#!/usr/bin/env node
// =============================================================================
// G099 — 작은 고침 둘 + 웹이 다시 고른 "같은 정답 한 장" 맞바꾸기 → data/pipeline/tone/g099-apply.json (파일만 쓴다 · DB 읽기만)
//   1) #4528 끔(political_20261117) · #5387 구미 질문 · 해설(설계 창 문장 그대로 · 힌트 그대로)
//   2) web-desk/pick/_swap.json 227건 − 빼는 묶음 5(G098 에서 처리) → 묶음마다 기계 게이트 ①~④ → 통과한 것만
//      켜기 activate(on) · 끄기 deactivate(off · ifActivated) · 이름 고치기 relabel(그 묶음의 다른 카드 same_answer:#off → #on · ifActivated)
//   사용 node scripts/g099-build.mjs [--db quizweb_dev]  → 그다음 node scripts/tone-apply.mjs --round g099 [--db quizweb_dev --skip-diff] [--apply]
//   (계획 파일은 실 DB 기준으로 만든다 — dev 는 tone-apply 의 --skip-diff 가 before 다른 것을 건너뛴다)
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { formHit } from './form-scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const norm = (s) => normalizeAnswer(s ?? '').replace(/[^\p{L}\p{N}]/gu, '');

const SKIP_KEYS = new Set(['S0173', 'S0439', 'S0537', 'S0800', 'S0745']); // G098 에서 찬종의 말대로 처리 — DB 그대로
const GUMI = {
  id: 5387,
  question: '전자·반도체 산업이 발달한 국가산업단지가 있으며, 국내 신라면의 대부분을 만드는 라면 공장으로도 유명한 경북의 도시는 어디일까요?',
  explanation: '이 공장이 있는 것을 살려 2022년부터 해마다 라면 축제를 열고 있습니다.',
};

// 새 글 실림 = 앞 라운드 apply 의 카드-NNN 항목(되돌림이 아닌 것)
const newText = new Map();
for (const f of readdirSync(path.join(ROOT, 'data/pipeline/tone')).filter((f) => /^g0\d\d-apply\.json$/.test(f) && f !== 'g099-apply.json').sort())
  for (const it of J(`data/pipeline/tone/${f}`).items ?? []) if (String(it.src ?? '').startsWith('카드-')) newText.set(it.id, !it.restore && !String(it.src).includes('되돌림'));

// 카드 묶음 전체(일반 상식 7,147장) — ④ 같은 정답 활성 수를 세는 범위
const U = new Set();
const OUT = path.join(ROOT, 'web-desk/tone/보낼것');
for (const f of readdirSync(OUT).filter((f) => /^카드-\d{3}\.txt$/.test(f))) for (const l of readFileSync(path.join(OUT, f), 'utf8').split(/\r?\n/)) { const h = l.match(/^\[(\d+)\]/); if (h) U.add(Number(h[1])); }

const a = process.argv.slice(2);
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
const db = url.pathname.slice(1);
const rows = new Map((await c.query(`select q.id::int, q.is_active, q.inactive_reason, q.general_hint_version, q.question_text, q.display_answer, q.general_hint, q.explanation,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
  from questions q where q.id = any($1::bigint[])`, [[...U, 4528, 5387]])).rows.map((r) => [r.id, r]));
await c.end();

const activeByAns = new Map();
for (const r of rows.values()) if (r.is_active && U.has(r.id)) { const k = norm(r.display_answer); if (!activeByAns.has(k)) activeByAns.set(k, new Set()); activeByAns.get(k).add(r.id); }

function cardFail(d, question = d.question_text, explanation = d.explanation) {
  const fail = [];
  for (const x of [d.display_answer, ...d.variants]) {
    if (findAnswerInQuestion(question, x) === 'word') fail.push(`질문에 정답 '${x}'`);
    if (findAnswerInQuestion(d.general_hint, x) === 'word') fail.push(`힌트에 정답 '${x}'`);
  }
  const ck = checkHint({ hint: d.general_hint, answer: d.display_answer, variants: d.variants, question, explanation });
  if (ck.block.length) fail.push(`힌트 막힘 ${ck.block.map((b) => `${b.rule ?? ''}:${b.frag}`).join('·')}`);
  return { fail, warn: ck.warn?.map((w) => w.frag ?? w) ?? [] };
}

const items = [], activate = [], deactivate = [], relabel = [], checks = [];

// ── 1. 찬종이 짚은 둘
deactivate.push({ id: 4528, answer: rows.get(4528).display_answer, deactivate: 'political_20261117' });
{
  const d = rows.get(GUMI.id); const { fail, warn } = cardFail(d, GUMI.question, GUMI.explanation);
  if (!/까요\?\s*$/.test(GUMI.question)) fail.push('질문 끝');
  const fh = formHit(GUMI.question); if (fh) fail.push(`질문 형태(~는, ~은) '${fh}'`);
  checks.push({ name: '구미', id: GUMI.id, ok: !fail.length, fail, warn });
  const prev = (() => { try { return J('data/pipeline/tone/g099-apply.json').items.find((x) => x.id === GUMI.id); } catch { return null; } })();
  if (!fail.length) items.push({
    id: GUMI.id, answer: d.display_answer, src: 'G099 찬종 2026-11-17 — 박정희 빼고 라면 공장',
    question_text: { before: d.question_text === GUMI.question ? prev?.question_text.before : d.question_text, after: GUMI.question, kind: 'rewrite' },
    explanation: { before: d.explanation === GUMI.explanation ? prev?.explanation.before : d.explanation, after: GUMI.explanation, kind: 'rewrite' },
  });
}

// ── 2. 같은 정답 맞바꾸기
const swaps = J('web-desk/pick/_swap.json');
const applied = [], skipped = [], excluded = [];
for (const s of swaps) {
  if (SKIP_KEYS.has(s.key)) { excluded.push(s.key); continue; }
  const on = rows.get(s.on), off = rows.get(s.off); const fail = [];
  // ① off 활성 · on 이 same_answer: 로 꺼짐 (지금 이미 맞바뀌어 있으면 = 이미 됨 · 계획에는 넣어 멱등)
  const done = on.is_active && !off.is_active && off.inactive_reason === `same_answer:#${s.on}`;
  if (!done) {
    if (!off.is_active) fail.push(`① off #${s.off} 가 활성이 아님(${off.inactive_reason})`);
    if (on.is_active) fail.push(`① on #${s.on} 가 이미 활성`);
    else if (!String(on.inactive_reason).startsWith('same_answer:')) fail.push(`① on #${s.on} 꺼진 까닭이 같은 정답이 아님(${on.inactive_reason})`);
  }
  // ② 새 글
  if (!newText.get(s.on) || on.general_hint_version !== 'card-v1') fail.push(`② on #${s.on} 새 글이 아님(${on.general_hint_version})`);
  // ③ 정답 낱말 · 힌트 막힘
  const cf = cardFail(on); fail.push(...cf.fail.map((x) => `③ ${x}`));
  // ④ 적용 뒤 활성 = on 한 장
  const others = s.ids.filter((i) => i !== s.on && i !== s.off);
  const stillOn = [...(activeByAns.get(norm(on.display_answer)) ?? [])].filter((i) => i !== s.off && i !== s.on);
  if (stillOn.length) fail.push(`④ 적용 뒤에도 활성 ${stillOn.map((i) => '#' + i).join('·')}`);
  const fh = formHit(on.question_text);
  const rec = { key: s.key, answer: on.display_answer, on: s.on, off: s.off, why: s.why, flag: s.flag, form: fh, onQ: on.question_text, offQ: off.question_text, warn: cf.warn };
  if (fail.length) { skipped.push({ ...rec, fail }); continue; }
  applied.push(rec);
  activate.push({ id: s.on, answer: on.display_answer, was: done ? undefined : on.inactive_reason, hintVersion: 'card-v1', why: `G099 ${s.key} 웹 다시 고름 — ${s.why}` });
  deactivate.push({ id: s.off, answer: off.display_answer, deactivate: `same_answer:#${s.on}`, ifActivated: s.on });
  for (const i of others) {
    const r = rows.get(i);
    if (!r.is_active && r.inactive_reason === `same_answer:#${s.off}`) relabel.push({ id: i, answer: r.display_answer, was: r.inactive_reason, to: `same_answer:#${s.on}`, ifActivated: s.on });
  }
}

writeFileSync(path.join(ROOT, 'data/pipeline/tone/g099-apply.json'), JSON.stringify({
  round: 'G099', db_snapshot: db,
  note: '#4528 끔 · #5387 질문 · 해설 / 웹 다시 고른 같은 정답 맞바꾸기(web-desk/pick/_swap.json − 빼는 묶음 5)',
  counts: { swaps: swaps.length, excluded: excluded.length, applied: applied.length, skipped: skipped.length, relabel: relabel.length, onForm: applied.filter((x) => x.form).length },
  excluded, checks, skipped, applied, items, activate, deactivate, relabel,
}, null, 1) + '\n');
console.log(db, JSON.stringify({ swaps: swaps.length, excluded: excluded.length, applied: applied.length, skipped: skipped.length, relabel: relabel.length }), JSON.stringify(checks));
for (const s of skipped) console.log('건너뜀', s.key, s.answer, s.fail.join(' / '));
