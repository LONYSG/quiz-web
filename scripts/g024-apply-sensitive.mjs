#!/usr/bin/env node
// =============================================================================
// G024 B — 민감 문항 4 (찬종 결정 2026-10-26 "권장대로")
//   6686 한공주   is_active=false · inactive_reason (글·힌트는 그대로 — D-051)
//   5466 봄날     explanation — 세월호 해석 대신 문서로 확인한 다른 사실(en.wikipedia Spring_Day_(song))
//   6813 잭 더 리퍼 explanation — 신체 언급("콩팥 반쪽이 든 상자와 함께")을 뺀다
//   6563 정당방위  question_text 한 구절만 절제한 서술로 (해설·힌트 그대로)
//   ★ 바꾸는 칸마다 where 칸 = 옛 값 · 되돌리기 audit/g024-undo-sensitive.json(네 문항의 옛 explanation · question_text · is_active · inactive_reason)
//   사용  node scripts/g024-apply-sensitive.mjs [--dry-run | --apply | --undo]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck, QUESTION_MAX } from '../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const UNDO = 'g024-undo-sensitive.json';
const REASON = '민감 — 실제 집단 성폭행 사건(2004 밀양)이 소재 · 찬종 결정 2026-10-26 · G024';
const Q6563_OLD = '골목으로 끌려가 강제로 입맞춤을 당하던 32살 주부가 남자의 혀를 깨물어 잘랐습니다';
const Q6563_NEW = '골목으로 끌려가 성폭행 위협을 받던 32살 주부가 남자의 혀를 깨물어 다치게 했습니다';
const CHANGES = {
  6686: { is_active: false, inactive_reason: REASON },
  5466: { explanation: "뮤직비디오는 룸펜스의 최용석 감독이 연출해 화성·양주·강릉에서 찍었고, 이 곡은 2017년 멜론 뮤직 어워드에서 올해의 노래상을 받았습니다." },
  6813: { explanation: "범인이 보냈다고 주장하는 '지옥에서' 편지는 1888년 10월 16일 화이트채플 자경단장 조지 러스크에게 배달되었습니다." },
  6563: { question_text: (old) => old.replace(Q6563_OLD, Q6563_NEW) },
};
const SOURCES = { 5466: 'https://en.wikipedia.org/wiki/Spring_Day_(song) — "directed by YongSeok Choi of Lumpens" · "Filming … took place in Hwaseong, Yangju, and Gangneung" · "won the Song of the Year award at the 2017 Melon Music Awards"' };
const COLS = ['question_text', 'explanation', 'is_active', 'inactive_reason'];

const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO);
    if (!process.argv.includes('--dry-run')) await guardNoOpenGames(c, 'g024 B undo');
    const a0 = await activeCount(c);
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) {
      const { rows: [cur] } = await c.query(`select ${COLS.join(',')} from questions where id=$1`, [id]);
      const diff = COLS.filter((k) => cur[k] !== o.before[k]);
      console.log(`  ${id}: 옛 값으로 ${diff.join(' · ') || '(이미 옛 값)'}`);
      if (diff.length) n += (await c.query(`update questions set ${diff.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() where id=$1`, [id, ...diff.map((k) => o.before[k])])).rowCount;
    }
    if (process.argv.includes('--dry-run')) { await c.query('rollback'); console.log(`[g024 B undo] 확인만 — 되돌릴 행 ${n}`); process.exit(0); }
    await c.query('commit'); console.log(`[g024 B] 되돌렸다 ${n} · 활성 ${a0} → ${await activeCount(c)}`); process.exit(0);
  }
  const { rows } = await c.query(`select id, display_answer, ${COLS.join(',')}, coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants from questions q where id = any($1::bigint[])`, [Object.keys(CHANGES)]);
  const todo = []; let done = 0;
  for (const r of rows) {
    const want = {}; for (const [k, v] of Object.entries(CHANGES[r.id])) want[k] = typeof v === 'function' ? v(r[k]) : v;
    const before = Object.fromEntries(COLS.map((k) => [k, r[k]]));
    const diff = Object.keys(want).filter((k) => r[k] !== want[k]);
    if (r.id === '6563' && diff.length) {
      if (want.question_text === r.question_text) { console.error('★ 6563 옛 구절을 못 찾음'); process.exit(1); }
      const q = want.question_text; const g = checkAnswerSet(q, r.display_answer, r.variants, normalizeAnswer); const b = blankCheck(q, r.display_answer);
      const leak = [r.display_answer, ...r.variants].some((a) => normalizeAnswer(q).includes(normalizeAnswer(a)));
      console.log(`  6563 검사: 길이 ${len(q)}/${QUESTION_MAX} · 정답 글자 ${leak ? '있음 ★' : '없음'} · 게이트 막힘 ${g.blocked.length} 뺌 ${g.dropped.length} · 빈칸 ${JSON.stringify(b)}`);
      if (len(q) > QUESTION_MAX || leak || g.blocked.length) process.exit(1);
    }
    if (!diff.length) { done++; continue; }
    todo.push({ id: r.id, answer: r.display_answer, before, after: Object.fromEntries(diff.map((k) => [k, want[k]])) });
  }
  console.log(`[g024 B] 쓸 것 ${todo.length} · 이미 됨 ${done}`);
  for (const t of todo) for (const [k, v] of Object.entries(t.after)) console.log(`  ${t.id} ${t.answer} ${k}\n    전: ${t.before[k]}\n    후: ${v}`);
  if (MODE !== 'apply') { console.log('[g024 B] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g024 B'); const a0 = await activeCount(c);
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G024', step: 'B', note: '네 문항의 옛 question_text · explanation · is_active · inactive_reason — --undo', sources: SOURCES, items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = { answer: t.answer, before: t.before, after: t.after };
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) {
    const ks = Object.keys(t.after);
    n += (await c.query(`update questions set ${ks.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() where id=$1 and ${ks.map((k, i) => `${k} is not distinct from $${i + 2 + ks.length}`).join(' and ')}`,
      [t.id, ...ks.map((k) => t.after[k]), ...ks.map((k) => t.before[k])])).rowCount;
  }
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length}`); process.exit(1); }
  await c.query('commit'); console.log(`[g024 B] 썼다 ${n} · 활성 ${a0} → ${await activeCount(c)}`);
} finally { await c.end().catch(() => {}); }
