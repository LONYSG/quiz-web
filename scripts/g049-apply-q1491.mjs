#!/usr/bin/env node
// =============================================================================
// G049 F — 문항 #1491 부루마불 변형(근접 오답 8건 — dev 제보 · 브리핑 gen.md) — question_answers 행 추가(is_primary false) · 멱등
//   대상 DB = DATABASE_URL(quizweb 과 quizweb_dev 둘 다 같은 것을 돌린다)
//   변형: 부루마블(이미 있음) · 부르마블 · 브루마블 · 블루마블
//   ★ 블루마블 = #6891 대표 정답 '블루 마블'(아폴로 17호 지구 사진)과 정규화가 같다 — 보드게임 문항에서는 철자 실수라 뜻이 겹치지 않아 넣는다(GEN 판단 · #6891 은 안 바뀜)
//   쓰기 직전 열린 판 0 · 되돌리기 audit/g049-undo-q1491-<db>.json
// 사용: DATABASE_URL=… node scripts/g049-apply-q1491.mjs [--apply | --undo]
// =============================================================================
import { readJson, writeJson, exists, connect, guardNoOpenGames, MODE } from './g023-common.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const QID = 1491;
const ADD = ['부루마블', '부르마블', '브루마블', '블루마블'];
const NOTE = 'G049 근접 오답 변형(부루마불)';
const c = await connect();
const db = (await c.query('select current_database() d')).rows[0].d;
const UNDO = `g049-undo-q1491-${db}.json`;
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); await guardNoOpenGames(c, `g049 q1491 undo ${db}`);
    let n = 0; for (const r of u.items) n += (await c.query('delete from question_answers where id=$1 and question_id=$2 and not is_primary', [r.rowId, QID])).rowCount;
    console.log(`[${db}] 지웠다 ${n}`);
  } else {
    const q = (await c.query('select display_answer, is_active from questions where id=$1', [QID])).rows[0];
    if (q?.display_answer !== '부루마불') throw new Error(`#${QID} 정답이 다름: ${q?.display_answer}`);
    const have = new Set((await c.query('select answer_norm from question_answers where question_id=$1', [QID])).rows.map((r) => r.answer_norm));
    const todo = ADD.filter((t) => !have.has(normalizeAnswer(t)));
    console.log(`[${db}] #${QID} ${q.display_answer} · 있음 ${ADD.length - todo.length}(${ADD.filter((t) => have.has(normalizeAnswer(t))).join(' · ')}) · 넣을 것 ${todo.join(' · ') || '없음'}`);
    if (MODE === 'apply' && todo.length) {
      const at = await guardNoOpenGames(c, `g049 q1491 ${db}`);
      const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G049', db, items: [] };
      await c.query('begin');
      for (const t of todo) { const r = await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) returning id', [QID, t, normalizeAnswer(t), NOTE]); undo.items.push({ text: t, rowId: Number(r.rows[0].id), at }); }
      await c.query('commit'); writeJson(UNDO, undo); console.log(`[${db}] 넣었다 ${todo.length}`);
    } else if (MODE !== 'apply') console.log('확인만 — --apply');
  }
} finally { await c.end().catch(() => {}); }
