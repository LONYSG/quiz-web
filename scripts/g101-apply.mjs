#!/usr/bin/env node
// =============================================================================
// G101 1 — 5222 "펄서" 에 맞는 답(변형) 더하기: "펄사" · "pulsar" (찬종 2026-11-18)
//   display_answer "펄서"(표준국어대사전 표제어)는 그대로 · question_answers INSERT 만(이미 있으면 건너뜀)
//   게이트: 활성 · 대표 답 = 펄서 · 정규화 중복 · 다른 활성 문항 주 답과 같지 않음 · checkAnswerSet
//   되돌리기 audit/g101-undo-<db>.json (넣은 행 id) · note 'G101 변형'
//   사용  node scripts/g101-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, guardNoOpenGames } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const ID = 5222; const ANSWER = '펄서'; const ADD = ['펄사', 'pulsar']; const NOTE = 'G101 변형';
const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const db = url.pathname.slice(1);
const UNDO = path.join(ROOT, `data/pipeline/audit/g101-undo-${db}.json`);
const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
console.log(`[G101] DB ${db} · ${mode}`);
try {
  if (mode === 'undo') {
    if (!existsSync(UNDO)) { console.log('[G101 undo] 되돌릴 것 없음'); process.exit(0); }
    const u = JSON.parse(readFileSync(UNDO, 'utf8')); await guardNoOpenGames(c, 'G101 undo');
    const n = (await c.query('delete from question_answers where id = any($1::bigint[]) and note = $2', [u.rows.map((r) => r.rowId), NOTE])).rowCount;
    u.rows = []; writeFileSync(UNDO, JSON.stringify(u, null, 1) + '\n'); console.log(`[G101 undo] 지웠다 ${n}행`); process.exit(0);
  }
  const q = (await c.query('select id, is_active, question_text, display_answer from questions where id=$1', [ID])).rows[0];
  if (!q?.is_active || q.display_answer !== ANSWER) { console.error(`★ #${ID} 활성 · 대표 '${ANSWER}' 아님 — 멈춤`, q); process.exit(1); }
  const vs = (await c.query('select answer_text, answer_norm from question_answers where question_id=$1', [ID])).rows;
  const have = new Set(vs.map((r) => r.answer_norm));
  const todo = []; const info = [];
  for (const v of ADD) {
    const nv = normalizeAnswer(v);
    if (have.has(nv)) { info.push(`${v} 이미 있음`); continue; }
    const other = (await c.query('select a.question_id from question_answers a join questions q on q.id=a.question_id where q.is_active and a.is_primary and a.answer_norm=$1 and a.question_id<>$2', [nv, ID])).rows;
    if (other.length) { info.push(`${v} 건너뜀 — 다른 문항 주 답 ${other.map((r) => r.question_id)}`); continue; }
    todo.push(v); have.add(nv);
  }
  if (todo.length) {
    const g = checkAnswerSet(q.question_text, q.display_answer, [...vs.filter((r) => r.answer_text !== ANSWER).map((r) => r.answer_text), ...todo], normalizeAnswer);
    for (const v of [...todo]) { const bad = g.dropped.find((x) => x.answer === v) ?? g.blocked.find((x) => x.answer === v); if (bad) { info.push(`${v} 게이트 ${bad.kind ?? 'blocked'}`); todo.splice(todo.indexOf(v), 1); } }
  }
  console.log(`[G101] #${ID} 지금 변형 ${JSON.stringify(vs.map((r) => r.answer_text))} · 넣을 것 ${JSON.stringify(todo)} · ${info.join(' · ') || '-'}`);
  if (mode !== 'apply' || !todo.length) { if (mode !== 'apply') console.log('[G101] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'G101');
  const undo = existsSync(UNDO) ? JSON.parse(readFileSync(UNDO, 'utf8')) : { round: 'G101', db, note: `넣은 question_answers 행 — --undo 는 note '${NOTE}' 행만 지운다`, rows: [] };
  await c.query('begin');
  for (const v of todo) {
    const r = (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing returning id', [ID, v, normalizeAnswer(v), NOTE])).rows[0];
    if (r) undo.rows.push({ rowId: Number(r.id), questionId: ID, v });
  }
  await c.query('commit');
  undo.writtenAt = at; writeFileSync(UNDO, JSON.stringify(undo, null, 1) + '\n');
  console.log(`[G101] 넣었다 ${undo.rows.length}행 ${JSON.stringify(undo.rows.map((r) => r.v))}`);
} finally { await c.end(); }
