#!/usr/bin/env node
// =============================================================================
// G023 D — 찬종 제보 문항 6 (CV-103 + #67 — v028-rerate meta.reported suggest · 브리핑 D 글자 그대로)
//   3813 국화 분야 → L3:world-geo#1(176 국가·수도) · 1619 지열 발전 질문 첫 문장만 + 힌트 신설 · 2096 테니스 명시 · 1438 민화 문장
//   500 독일어 낱말 밝힘 + v2 3 → 2 + 변형 독일 · 독어 · 1941 볼보 정답 "특허"(주 답 행 고침) + 질문 + 변형 셋(옛 주 답은 변형으로)
//   출력  audit/g023-undo-reported.json (옛 question_text · display_answer · general_hint(+version) · category_id · 점수 · 주 답 행 · 넣은 변형 행 id)
//   사용  node scripts/g023-apply-reported.mjs [--dry-run | --apply | --undo]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../pipeline/lib/question-checks.mjs';
import { checkHint } from './hint-check.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const UNDO = 'g023-undo-reported.json';
const NOTE = 'G023 제보 반영';
const D = {
  3813: { category_id: 176 },
  1619: { question_text: '땅속의 뜨거운 증기나 열수를 끌어올려 터빈을 돌리는 발전 방식은 무엇일까요?', general_hint: '아이슬란드는 전력과 난방의 대부분을 이 방식으로 해결합니다.' },
  2096: { question_text: '테니스에서 한 세트의 게임 점수가 6 대 6이 되었을 때, 경기가 끝없이 길어지는 것을 막으려고 치르는 방식을 무엇이라 합니까?' },
  1438: { question_text: '서민들이 집을 꾸미고 복을 빌려고 그린 그림이 있습니다. 대부분 누가 그렸는지 이름이 전해지지 않습니다. 이 그림은 무엇일까요?' },
  500: { question_text: "'아르바이트'는 한국에서는 시간제로 하는 일을 가리키지만, 원래 언어에서는 '노동' 전반을 뜻하는 흔한 낱말입니다. 이 말은 어느 나라 말에서 왔나요?",
    score: 2, why: '2 — G023 제보 #62 반영: 낱말(아르바이트)을 밝혀 건너기 한 번(설계 택일 · 판정자 3)', add: ['독일', '독어'] },
  1941: { question_text: '어깨와 허리를 함께 잡는 3점식 안전띠를 만든 볼보는, 더 많은 생명을 구하려고 이 기술의 무엇을 다른 회사들도 쓸 수 있게 공개했습니까?',
    display_answer: '특허', add: ['특허권', '특허 공개', '특허를 공개했다'] },
};
const band = (s) => (s <= 2 ? 'easy' : s === 3 ? 'medium' : 'hard');

const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); await guardNoOpenGames(c, 'g023 D undo');
    await c.query('begin');
    for (const [id, o] of Object.entries(u.items)) {
      await c.query('delete from question_answers where id = any($1::bigint[])', [o.inserted]);
      await c.query(`update questions set question_text=$2, display_answer=$3, general_hint=$4, general_hint_version=$5, category_id=$6, difficulty_score=$7, difficulty=$8, difficulty_why=$9, updated_at=now() where id=$1`,
        [id, o.before.question_text, o.before.display_answer, o.before.general_hint, o.before.general_hint_version, o.before.category_id, o.before.difficulty_score, o.before.difficulty, o.before.difficulty_why]);
      if (o.primary) await c.query('update question_answers set answer_text=$2, answer_norm=$3, note=$4 where id=$1', [o.primary.id, o.primary.answer_text, o.primary.answer_norm, o.primary.note]);
    }
    await c.query('commit'); console.log(`[g023 D] 되돌렸다 ${Object.keys(u.items).length} 문항`); process.exit(0);
  }
  const { rows } = await c.query(`select q.id, q.question_text, q.display_answer, q.general_hint, q.general_hint_version, q.category_id, q.difficulty_score, q.difficulty, q.difficulty_why, q.explanation,
      (select json_agg(json_build_object('id',a.id,'answer_text',a.answer_text,'answer_norm',a.answer_norm,'is_primary',a.is_primary,'note',a.note) order by a.id) from question_answers a where a.question_id=q.id) ans
      from questions q where q.is_active and q.id = any($1::bigint[])`, [Object.keys(D)]);
  const DB = new Map(rows.map((r) => [String(r.id), r]));
  const plan = []; const problems = [];
  for (const [id, d] of Object.entries(D)) {
    const r = DB.get(id); if (!r) { problems.push(`${id} 활성 아님`); continue; }
    const after = { question_text: d.question_text ?? r.question_text, display_answer: d.display_answer ?? r.display_answer, general_hint: d.general_hint ?? r.general_hint };
    const variants = r.ans.filter((a) => !a.is_primary).map((a) => a.answer_text);
    const have = new Set([normalizeAnswer(after.display_answer), ...variants.map(normalizeAnswer)]);
    const add = (d.add ?? []).filter((v) => !have.has(normalizeAnswer(v)));
    const g = checkAnswerSet(after.question_text, after.display_answer, [...variants, ...add], normalizeAnswer);
    if (g.blocked.length) problems.push(`${id} 정답 낱말 노출 ${JSON.stringify(g.blocked)}`);
    for (const x of g.dropped) if (add.includes(x.answer)) problems.push(`${id} 변형 ${x.answer} 게이트 ${x.kind}`);
    if (len(after.question_text) > 200) problems.push(`${id} 200자 초과`);
    if (!blankCheck(after.question_text, after.display_answer).ok) problems.push(`${id} 빈칸`);
    if (after.general_hint) { const k = checkHint({ hint: after.general_hint, answer: after.display_answer, variants: [...variants, ...add], question: after.question_text, explanation: r.explanation ?? '' }); if (k.block.length) problems.push(`${id} 힌트 막힘 ${JSON.stringify(k.block)}`); if (k.warn.length) console.log(`  (힌트 경고) ${id} ${JSON.stringify(k.warn)}`); }
    const changes = [];
    for (const f of ['question_text', 'display_answer', 'general_hint']) if (d[f] !== undefined && r[f] !== d[f]) changes.push(f);
    if (d.category_id !== undefined && r.category_id !== d.category_id) changes.push('category_id');
    if (d.score !== undefined && r.difficulty_score !== d.score) changes.push('score');
    plan.push({ id, r, d, add, changes });
    console.log(`#${id} ${r.display_answer}${d.display_answer ? ` → ${d.display_answer}` : ''} · 바꿀 칸 [${changes.join(', ')}] · 변형 추가 [${add.join(', ')}]`);
    if (d.question_text) console.log(`   전: ${r.question_text}\n   후: ${d.question_text}`);
    if (d.general_hint !== undefined) console.log(`   힌트 전: ${r.general_hint} → 후: ${d.general_hint}`);
    if (d.category_id) console.log(`   분야 ${r.category_id} → ${d.category_id}`);
    if (d.score) console.log(`   점수 ${r.difficulty_score} → ${d.score}`);
  }
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (MODE !== 'apply') { console.log('[g023 D] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g023 D'); const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G023', step: 'D', note: '제보 6 옛 값 — node scripts/g023-apply-reported.mjs --undo', items: {} };
  await c.query('begin');
  for (const p of plan) {
    if (!p.changes.length && !p.add.length) continue;
    const { r, d } = p;
    const u = undo.items[p.id] ?? { before: { question_text: r.question_text, display_answer: r.display_answer, general_hint: r.general_hint, general_hint_version: r.general_hint_version, category_id: r.category_id, difficulty_score: r.difficulty_score, difficulty: r.difficulty, difficulty_why: r.difficulty_why }, inserted: [], primary: null };
    await c.query(`update questions set question_text=$2, display_answer=$3, general_hint=$4, general_hint_version=$5, category_id=$6, difficulty_score=$7, difficulty=$8, difficulty_why=$9, updated_at=now() where id=$1`,
      [p.id, d.question_text ?? r.question_text, d.display_answer ?? r.display_answer, d.general_hint ?? r.general_hint, d.general_hint !== undefined && d.general_hint !== r.general_hint ? 'hint-v5' : r.general_hint_version,
        d.category_id ?? r.category_id, d.score ?? r.difficulty_score, d.score ? band(d.score) : r.difficulty, d.why ?? r.difficulty_why]);
    if (d.display_answer && d.display_answer !== r.display_answer) {
      const pr = r.ans.find((a) => a.is_primary); if (!u.primary) u.primary = pr;
      await c.query('update question_answers set answer_text=$2, answer_norm=$3, note=$4 where id=$1', [pr.id, d.display_answer, normalizeAnswer(d.display_answer), `${NOTE} — 대표 정답 바꿈(전 ${pr.answer_text})`]);
    }
    for (const v of p.add) {
      const { rows: ins } = await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing returning id', [p.id, v, normalizeAnswer(v), `${NOTE} 변형`]);
      if (ins[0]) u.inserted.push(Number(ins[0].id));
    }
    undo.items[p.id] = u;
  }
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('commit');
  console.log(`[g023 D] 썼다 · 활성 ${a0} → ${await activeCount(c)}`);
} finally { await c.end(); }
