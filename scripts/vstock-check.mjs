#!/usr/bin/env node
// =============================================================================
// vstock-check — 영상 문제 재료 후보 점검 (G102 B · 읽기만 · DB 쓰기 0 · 후보 글은 고치지 않는다)
//   입력  web-desk/vstock/받은것/결과-NN.json(items[]) + web-desk/vnews/받은것/결과-*.json(items[] · sensitive)
//   후보마다 ① 표준국어대사전 표제어(scripts/dict-check.mjs · answer · altSpelling) — 사전 표기가 altSpelling 쪽이면 swap
//            ② 우리 DB(quizweb) 정답 · 변형과 겹침(활성 · 꺼진 것 모두 · normalizeAnswer · 꼬리 효과/현상 … 뗀 것도)
//            ③ 후보끼리 같은 것(띄어쓰기 · 꼬리 뗌) ④ 글자 수 · legend 인데 단정문 · 질문 꼴(formHit · ~까요? · 정답 드러남)
//   출력  web-desk/vstock/_check.json
//   사용  node scripts/vstock-check.mjs
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { dictCheck, stats } from './dict-check.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';
import { formHit } from './form-scan.mjs';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const L = (s) => [...(s ?? '')].length;
const TAIL = /(효과|현상|법칙|이론|증후군|원리|효과설)$/;
const key = (s) => normalizeAnswer(String(s ?? '').replace(/\s+/g, '')).replace(TAIL, '') || normalizeAnswer(s);

const cand = [];
for (const f of readdirSync(path.join(ROOT, 'web-desk/vstock/받은것')).filter((f) => /^결과-\d\d\.json$/.test(f)).sort())
  for (const x of J(`web-desk/vstock/받은것/${f}`).items ?? []) cand.push({ chunk: 'vstock/' + f.slice(3, 5), ...x });
for (const f of readdirSync(path.join(ROOT, 'web-desk/vnews/받은것')).filter((f) => /^결과-.*\.json$/.test(f)).sort())
  for (const x of J(`web-desk/vnews/받은것/${f}`).items ?? []) cand.push({ chunk: 'vnews/' + f.slice(3, -5), topic: x.field, level: x.level ?? null, ...x });

// ① 사전
const words = [...new Set(cand.flatMap((x) => [x.answer, ...(x.altSpelling ?? [])]).filter((w) => /[가-힣]/.test(w ?? '')))];
const dict = new Map((await dictCheck(words)).map((r) => [r.word, r]));

// ② DB 겹침
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
const rows = (await c.query(`select q.id::int, q.is_active, q.inactive_reason, q.difficulty, q.question_text, q.display_answer, a.answer_text
  from question_answers a join questions q on q.id=a.question_id`)).rows;
await c.end();
const byKey = new Map();
for (const r of rows) for (const k of new Set([normalizeAnswer(r.answer_text), key(r.answer_text)])) {
  if (!k) continue; const m = byKey.get(k) ?? new Map(); m.set(r.id, r); byKey.set(k, m);
}

// ③ 후보끼리
const ck = cand.map((x) => new Set([x.answer, ...(x.altSpelling ?? [])].map(key).filter(Boolean)));

const items = cand.map((x, i) => {
  const warn = [];
  const sp = [x.answer, ...(x.altSpelling ?? [])];
  const dAns = dict.get(x.answer), dAlt = (x.altSpelling ?? []).map((w) => dict.get(w)).filter((r) => r?.found);
  const dictOut = dAns?.found ? { found: true, headword: dAns.headword, def: dAns.def } : dAlt.length ? { found: false, altFound: dAlt[0].word, headword: dAlt[0].headword, def: dAlt[0].def } : { found: false };
  const swap = !dAns?.found && dAlt.length > 0;
  const hit = new Map();
  for (const w of sp) for (const k of new Set([normalizeAnswer(w), key(w)])) for (const [id, r] of byKey.get(k) ?? []) hit.set(id, r);
  const dbHit = [...hit.values()].sort((p, q) => q.is_active - p.is_active || p.id - q.id)
    .map((r) => ({ id: r.id, active: r.is_active, ...(r.is_active ? {} : { why: r.inactive_reason }), answer: r.display_answer, difficulty: r.difficulty, question: r.question_text }));
  const dupWith = cand.map((y, j) => (j !== i && [...ck[i]].some((k) => ck[j].has(k)) ? `${y.chunk} ${y.answer}` : null)).filter(Boolean);
  const lq = L(x.question), lh = L(x.hint), le = L(x.explanation);
  if (x.legend === true && !/(전해집니다|전해지|라고 합니다|다고 합니다|고 합니다|알려져 있습니다|이야기가 있습니다)/.test(x.explanation ?? '')) warn.push('legend 인데 해설이 단정문');
  if (formHit(x.question)) warn.push(`질문 형태 '${formHit(x.question)}'`);
  if (!/까요\?\s*$/.test(x.question ?? '')) warn.push('질문 끝이 ~까요? 아님');
  for (const w of sp) if (w && findAnswerInQuestion(x.question ?? '', w) === 'word') warn.push(`질문에 정답 '${w}'`);
  if (lq > 200) warn.push(`질문 ${lq}자`);
  if (x.sensitive) warn.push('sensitive: ' + String(x.sensitive).slice(0, 60));
  return { chunk: x.chunk, topic: x.topic, level: x.level, difficulty: x.difficulty, answer: x.answer, altSpelling: x.altSpelling ?? [], dict: dictOut, swap, dbHit, dupWith, len: { question: lq, hint: lh, explanation: le }, legend: !!x.legend, warn };
});
const summary = {
  candidates: items.length, dictFound: items.filter((x) => x.dict.found).length, dictNone: items.filter((x) => !x.dict.found && !x.swap).length, swap: items.filter((x) => x.swap).length,
  dbHit: items.filter((x) => x.dbHit.length).length, dbHitActive: items.filter((x) => x.dbHit.some((h) => h.active)).length, dupPairs: items.filter((x) => x.dupWith.length).length,
  legendFlat: items.filter((x) => x.warn.includes('legend 인데 해설이 단정문')).length, warned: items.filter((x) => x.warn.length).length, dictCalls: stats.calls, dictCached: stats.cached,
};
writeFileSync(path.join(ROOT, 'web-desk/vstock/_check.json'), JSON.stringify({ done: true, round: 'G102', db, at: new Date().toISOString(), note: '읽기만 — 후보 글은 고치지 않았다 · 무엇을 영상에 쓸지는 찬종이 고른다', summary, items }, null, 1) + '\n');
console.log(db, JSON.stringify(summary));
for (const x of items) if (x.swap || !x.dict.found || x.dbHit.length || x.dupWith.length || x.warn.length)
  console.log(`${x.chunk} | ${x.answer} | 사전 ${x.dict.found ? 'O' : x.swap ? 'alt:' + x.dict.altFound : 'X'} | DB ${x.dbHit.map((h) => `#${h.id}${h.active ? '' : '(꺼짐)'}`).join(',') || '-'} | 겹 ${x.dupWith.join(',') || '-'} | ${x.warn.join(' / ')}`);
