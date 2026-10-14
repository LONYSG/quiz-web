#!/usr/bin/env node
// =============================================================================
// G002 — V006 판정 반영 : 지금 게임에 나가는 중(3) 힌트 fix 484 + 목록 밖 5건
//
//   입력
//     data/pipeline/audit/g002-hint-decisions.json   항목마다 { status, hint, by, … } — A 단계(웹 확인) 결과
//         status: confirmed(제안 그대로 · 웹 확인) / rewritten(GEN 이 확인된 사실로 다시 씀) / web-v006(VERIFY 웹 근거 그대로)
//                 hold(못 닫음 — 지금 힌트 유지) / rejected(fix 를 받지 않음)
//     data/pipeline/audit/r047-verify-targets.json   midHints.targets — V006 이 판정한 힌트(before)
//     MISC (아래)                                     #85 질문 · #3930 힌트 · #1211 질문 · #1148 해설 · #741 힌트
//   출력
//     data/pipeline/audit/g002-fixes.json            행마다 id · field · before · after · by · reason · sources · categories
//                                                    ★ 되돌리기는 이 파일의 before 로
//
// ★ 안전장치
//   · 기본은 확인만 (--apply 로 쓴다). 한 트랜잭션 — 하나라도 어긋나면 전부 되돌린다
//   · DB 값이 before(V006 이 판정한 값)와 같을 때만 바꾼다. after 와 같으면 건너뛴다(멱등) · 둘 다 아니면 건너뛰고 보고
//   · 바꾸기 전 DB 값(질문·정답·변형·해설)으로 checkHint 를 다시 돌린다 — 막힘 · 120자 초과 · 줄바꿈 · 두 문장 이상이면 멈춘다
//   · 질문을 바꾸면 정답 노출(findAnswerInQuestion) · 정답 조각 · 빈칸 수를 본다
//   · 쓴 뒤: 활성 수 · 난이도 3~5 힌트 빈 칸 · 활성 전체 hint-check 막힘
//
// 사용법
//   node scripts/g002-apply-v006.mjs            확인만 (g002-fixes.json 은 쓴다)
//   node scripts/g002-apply-v006.mjs --apply    DB 에 쓴다
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';
import { findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { answerFragments, blankCheck } from '../pipeline/lib/question-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const APPLY = process.argv.includes('--apply');
const VER_V006 = 'hint-v3+v006'; // V006 판정으로 바꾼 힌트 (DG-006)
const VER_G002 = 'hint-v3+g002'; // V006 제안이 아니라 GEN 이 쓴 힌트 (#741)
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const DEC = J('data/pipeline/audit/g002-hint-decisions.json');
const V = J('data/pipeline/audit/v006-results.json');
const TGT = new Map(J('data/pipeline/audit/r047-verify-targets.json').midHints.targets.map((t) => [t.id, t]));

// ── 목록 밖 5건 (V006 2-3 · 2-4 · 2-5 · 4-2 c04) ───────────────────────────
const MISC = [
  { id: 85, field: 'question', by: 'gen', reason: "V006 2-4 fix — '패스를 받는 순간' 은 규칙 11조와 다르다(같은 팀 동료가 공을 건드리는 순간의 위치로 판단). 제안의 '상대 진영 · 플레이 관여' 는 해설이 이미 말해 질문에서 뺐다(GEN 문구)",
    before: '축구에서 공격팀 선수가 패스를 받는 순간, 공과 끝에서 두 번째 상대 선수보다 상대 골라인에 더 가까이 있을 때 선언되는 반칙은?',
    after: '축구에서 같은 팀 동료가 공을 건드리는 순간, 공격팀 선수가 공과 끝에서 두 번째 상대 선수보다 상대 골라인에 더 가까이 있을 때 선언되는 반칙은?',
    sources: ['https://en.wikipedia.org/wiki/Offside_(association_football)'] },
  { id: 3930, field: 'general_hint', by: 'verify', version: VER_V006, reason: 'V006 2-5 fix(H4 — 해설과 같은 사실 · C61) — 제안 그대로. 부댕 베이커리 1849 · 골드러시 때의 발효종을 지금도 씀(웹 확인)',
    before: '빵집마다 대를 이어 밀가루와 물을 주며 기르는 발효종이 있어, 수십 년 묵은 것을 자랑하기도 한다.',
    after: '빵집마다 대를 이어 기르는 발효종이 있어, 1849년 골드러시 때 만든 것을 지금도 쓴다고 내세우는 가게도 있다.',
    sources: ['https://en.wikipedia.org/wiki/Boudin_Bakery'], categories: ['explain-overlap'] },
  { id: 1211, field: 'question', by: 'gen', reason: "V006 2-3 ★ — '사흘간 열려 40만 명' 은 en Woodstock(1969.8.15~18 나흘 · 46만 명 이상)과 어긋남. 베설·낙농장은 같은 정답 #3842 해설이라 넣지 않았다(GEN 문구)",
    before: '1969년 미국 뉴욕주의 한 농장에서 사흘간 열려 40만 명이 모였고, 한 시대의 상징이 된 야외 음악 축제는?',
    after: '1969년 8월 미국 뉴욕주의 한 농장에서 열려 46만 명 넘게 모였고, 한 시대의 상징이 된 야외 음악 축제는?',
    sources: ['https://en.wikipedia.org/wiki/Woodstock'] },
  { id: 1148, field: 'explanation', by: 'gen', reason: 'V006 4-2 c04 — 2018 평창 은메달은 이상호의 평행대회전이라 하프파이프 해설로는 틀림. 평창 여자 하프파이프 금메달(클로이 김 · 부모가 한국에서 이민)로 바꿈(GEN 문구)',
    before: '국내에서는 2018년 평창 대회 은메달로 널리 알려졌습니다.',
    after: '2018년 평창 대회 여자부 금메달은 부모가 한국에서 이민한 미국 대표 클로이 김이 땄습니다.',
    sources: ['https://en.wikipedia.org/wiki/Snowboarding_at_the_2018_Winter_Olympics_–_Women%27s_halfpipe', 'https://en.wikipedia.org/wiki/Chloe_Kim'] },
  { id: 741, field: 'general_hint', by: 'gen', version: VER_G002, reason: "V006 2-4 참고(H3) — 상(4) hint-v2 힌트 '1932년 뉴욕 현대미술관 전시와 함께 나온 책 제목' 이 R032 가 고친 질문의 '1932년 뉴욕 현대미술관' 과 같은 정보. 전시를 꾸민 필립 존슨의 뒷이야기로(GEN 문구)",
    before: '1932년 뉴욕 현대미술관 전시와 함께 나온 책 제목에서 이름이 굳었다.',
    after: '그 전시를 함께 꾸민 필립 존슨은 뒷날 이 양식으로 직접 건물을 짓는 건축가가 되었다.',
    sources: ['https://en.wikipedia.org/wiki/International_Style'] },
];

// ── 행 만들기 ────────────────────────────────────────────────────────────────
const rows = [];
const notApplied = { hold: [], rejected: [] };
for (const [idStr, d] of Object.entries(DEC.items)) {
  const id = Number(idStr);
  const v = V.midHints[id];
  if (!v || v.verdict !== 'fix') throw new Error(`${id}: V006 fix 가 아니다`);
  if (d.status === 'hold' || d.status === 'rejected') { notApplied[d.status].push(id); continue; }
  const t = TGT.get(id);
  rows.push({ id, field: 'general_hint', before: t.hint, after: d.hint, by: d.status === 'rewritten' ? 'gen' : 'verify', status: d.status,
    version: VER_V006, reason: d.why, sources: d.sources ?? [], categories: v.categories });
}
for (const m of MISC) rows.push({ ...m, status: 'misc', categories: m.categories ?? [] });

// ── 미리 거르기 (파일 단계 — 줄바꿈 · 120자 · 문장 수) ───────────────────────
const pre = [];
for (const r of rows) {
  if (/[\r\n]/.test(r.after)) pre.push(`${r.id} ${r.field}: 줄바꿈`);
  if (r.field === 'general_hint') {
    if ([...r.after].length > 120) pre.push(`${r.id}: 120자 초과 (${[...r.after].length})`);
    if ((r.after.match(/[.!?](\s|$)/g) ?? []).length > 1) pre.push(`${r.id}: 두 문장 이상`);
  }
}
if (pre.length) { for (const p of pre) console.error('★', p); process.exit(1); }

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const { rows: dbRows } = await client.query(
    `select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.is_active, q.difficulty_score,
            coalesce((select array_agg(answer_text) from question_answers x where x.question_id = q.id and not x.is_primary), '{}') as variants
       from questions q where q.id = any($1::bigint[])`, [rows.map((r) => r.id)]);
  const db = new Map(dbRows.map((r) => [Number(r.id), r]));
  const col = { general_hint: 'general_hint', question: 'question_text', explanation: 'explanation' };
  const problems = [], warns = [], skipped = [], todo = [];
  let done = 0;
  for (const r of rows) {
    const d = db.get(r.id);
    if (!d) { problems.push(`${r.id}: DB 에 없다`); continue; }
    if (!d.is_active) warns.push(`${r.id}: 비활성`);
    const cur = d[col[r.field]] ?? '';
    if (cur === r.after) { done++; continue; }
    if (cur !== (r.before ?? '')) { skipped.push(`${r.id} ${r.field}: DB 값이 before 와 다르다 — 건너뜀`); continue; }
    // 바뀐 뒤의 문항으로 검사 — 같은 문항에 질문·해설을 함께 바꾸는 경우는 없다(이번 MISC 는 문항마다 한 칸)
    const q = r.field === 'question' ? r.after : d.question_text;
    const e = r.field === 'explanation' ? r.after : (d.explanation ?? '');
    const h = r.field === 'general_hint' ? r.after : d.general_hint;
    if (h) {
      const c = checkHint({ hint: h, answer: d.display_answer, variants: d.variants, question: q, explanation: e });
      if (c.block.length) problems.push(`${r.id}: hint-check 막힘 ${JSON.stringify(c.block)}`);
      if (c.warn.length) warns.push(`${r.id}: hint-check 경고 ${JSON.stringify(c.warn)}`);
    }
    if (r.field === 'question') {
      const f = findAnswerInQuestion(q, d.display_answer);
      if (f && f !== 'none') problems.push(`${r.id}: 질문에 정답 (${f})`);
      const fr = answerFragments(q, d.display_answer); if (fr.length) warns.push(`${r.id}: 정답 조각 ${JSON.stringify(fr)}`);
      if (!blankCheck(q, d.display_answer).ok) problems.push(`${r.id}: 빈칸 수`);
    }
    if (r.field === 'explanation' && findAnswerInQuestion(e, d.display_answer) === 'word') warns.push(`${r.id}: 해설에 정답 낱말`);
    todo.push(r);
  }
  // 기록 파일 — 확인만 할 때도 쓴다 (적용 대상 전부 · 되돌리기는 before 로)
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g002-fixes.json'), JSON.stringify({
    round: 'G002', note: 'V006 판정 반영 — 되돌리기는 before 로. by: verify(제안 그대로) / gen(GEN 문구). general_hint_version: hint-v3+v006(V006 판정) · hint-v3+g002(#741)',
    counts: { rows: rows.length, hint: rows.filter((r) => r.field === 'general_hint').length, question: rows.filter((r) => r.field === 'question').length, explanation: rows.filter((r) => r.field === 'explanation').length,
      byVerify: rows.filter((r) => r.by === 'verify').length, byGen: rows.filter((r) => r.by === 'gen').length, hold: notApplied.hold.length, rejected: notApplied.rejected.length },
    notApplied,
    rows: rows.map(({ id, field, before, after, by, status, version, reason, sources, categories }) => ({ id, field, before, after, by, status, version: version ?? null, reason, sources, categories })),
  }, null, 1) + '\n');

  console.log(`[g002] 행 ${rows.length} (힌트 ${rows.filter((r) => r.field === 'general_hint').length} · 질문 ${rows.filter((r) => r.field === 'question').length} · 해설 ${rows.filter((r) => r.field === 'explanation').length}) · 보류 ${notApplied.hold.length} · 받지 않음 ${notApplied.rejected.length}`);
  console.log(`[g002] 할 일 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
  for (const s of skipped) console.log('  (건너뜀)', s);
  for (const w of warns) console.log('  (경고)', w);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY) { console.log('[g002] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
  if (!todo.length) { console.log('[g002] 할 일 0'); process.exit(0); }

  await client.query('begin');
  let n = 0;
  for (const r of todo) {
    if (r.field === 'general_hint') n += (await client.query(
      `update questions set general_hint = $2, general_hint_version = $3, updated_at = now() where id = $1 and general_hint is not distinct from $4`, [r.id, r.after, r.version, r.before])).rowCount;
    else n += (await client.query(
      `update questions set ${col[r.field]} = $2, updated_at = now() where id = $1 and ${col[r.field]} is not distinct from $3`, [r.id, r.after, r.before])).rowCount;
  }
  if (n !== todo.length) { await client.query('rollback'); console.error(`★ 쓴 수 ${n} ≠ 할 일 ${todo.length} — 되돌렸다`); process.exit(1); }
  const { rows: [{ n: active }] } = await client.query(`select count(*)::int n from questions where is_active`);
  const { rows: [{ n: empty }] } = await client.query(`select count(*)::int n from questions where is_active and difficulty_score >= 3 and (general_hint is null or general_hint = '')`);
  if (empty !== 0) { await client.query('rollback'); console.error(`★ 난이도 3~5 힌트 빈 칸 ${empty} — 되돌렸다`); process.exit(1); }
  await client.query('commit');
  console.log(`[g002] 썼다 — ${n}행 · 활성 ${active} · 3~5 힌트 빈 칸 ${empty}`);
} finally {
  await client.end();
}
