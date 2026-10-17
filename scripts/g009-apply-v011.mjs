#!/usr/bin/env node
// =============================================================================
// G009 A — V011 반영 (CV-21~24 설계 판단 2026-10-17 · #14 해설 낡은 메모)
//   입력  data/pipeline/audit/v011-results.json (cv20[id].proposal · pairs["id↔id"].proposal) + 아래 ROWS(before = 반영 전 DB 값)
//   출력  data/pipeline/audit/g009-fixes.json  rows (ref · id · field · before · after · why · sources · note)
//   ★ 기본은 확인만(--apply) · 한 트랜잭션 · 대상 행의 지금 값이 before 와 같은 행만(after 와 같으면 이미 됨 — 멱등 · 다르면 건너뛰고 목록)
//   ★ 파일 단계 검사: 새 질문 + 정답 묶음 checkAnswerSet(막힘 0 · 정규화 중복 변형은 뺀다) · blankCheck · checkHint(새 질문과 이어 읽기)
//   ★ 쓰는 칸: question_text · explanation · general_hint(+version) · question_answers 의 비대표 행(넣기 · 빼기)만
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const APPLY = process.argv.includes('--apply');
const V = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/v011-results.json'), 'utf8'));
const P = (id) => V.cv20[id].proposal;
const PP = (k) => V.pairs[k].proposal;
const src = (id) => (V.cv20[id].facts ?? []).map((f) => f.source).filter(Boolean);
const srcP = (k) => [`v011-results pairs["${k}"]`];

// ── 바꿀 것 (질문 · 해설 · 힌트) ───────────────────────────────────────────────
const TEXT = [
  { ref: 'CV-20 #1783', id: 1783, field: 'question_text', before: '임의의 각을 셋으로 나누는 고대 그리스의 작도 문제는 무엇일까요? 눈금 없는 자와 컴퍼스만으로는 할 수 없다는 것이 19세기에 증명되었습니다.', after: P(1783).question, why: 'CV-21 — V011 fix [expose · readable]: 질문이 정답의 정의 문장 → 3대 작도 문제 중 나머지 하나를 묻는 꼴', sources: src(1783) },
  { ref: 'CV-20 #1783', id: 1783, field: 'general_hint', before: '원적 문제·배적 문제와 함께 고대 그리스의 3대 작도 문제로 꼽힌다.', after: '자와 컴퍼스 대신 종이접기를 쓰면 쉽게 해낼 수 있고, 60도 각으로 하면 20도가 나와야 한다.', version: 'hint-v5', why: 'GEN 판단 — 새 질문(3대 작도 문제 중 나머지)이 옛 힌트와 같은 사실(checkHint question 87%) · 15 §4-1 H4 각주 "질문의 단서를 바꾸면 해설·힌트를 새 질문과 이어 읽는다" → hint-v5 로 새로 씀', sources: ['https://en.wikipedia.org/wiki/Angle_trisection'], note: 'en 위키: "can easily be accomplished by the operations of paper folding" · "an angle of measure 60° cannot be trisected" · "impossible to construct a 20° angle"' },
  { ref: 'CV-20 #2187', id: 2187, field: 'question_text', before: '피겨스케이팅의 점프 이름이 여럿인 것은, 무엇이 서로 다르기 때문입니까?', after: P(2187).question, why: 'CV-21 — V011 fix [not-unique · scope]: 회전수도 답이 됨 → "여섯 가지 · 회전수가 아니라" 한정', sources: src(2187) },
  { ref: 'CV-20 #3680', id: 3680, field: 'question_text', before: '주인공이 결국 고구마 밭 주인 왕 서방의 손에 죽고, 남편은 돈을 받고 그 죽음을 병으로 덮어 버리는 단편 소설은?', after: P(3680).question, why: 'CV-21 — V011 fix [fact-error]: 원문은 "채마 밭에 감자(고구마)" — "고구마 밭" 단정을 뺌', sources: src(3680) },
  { ref: 'CV-20 #3680', id: 3680, field: 'explanation', before: "김동인의 작품으로, 제목은 평안도 말로 '고구마'를 가리킨다고 풀이됩니다.", after: P(3680).explanation, why: 'CV-21 — V011 fix [assertive]: "평안도 말" 근거 없음 → 원문 표기 "감자(고구마)" + "풀이가 있습니다" 한정', sources: src(3680) },
  { ref: 'CV-22 K1-17', id: 4973, field: 'question_text', before: '비문은 이경석이 짓고 글씨는 오준이 썼습니다. 1895년 땅속에 묻혔다가 1913년 다시 세워진 이 비는 흔히 무엇이라 부를까요?', after: '비문은 이경석이 짓고 글씨는 오준이 썼습니다. 1895년 자취를 감췄다가 1913년 다시 세워진 이 비는 흔히 무엇이라 부를까요?', why: 'CV-22 — 1895년 처리가 문서마다 "땅속에 묻음"(서울시 미디어허브 · 경향 · en 위키) / "강물에 수장(전해진다)"(ko 위키)로 엇갈림 → 어느 쪽도 단정하지 않는 "자취를 감췄다가"', sources: ['https://ko.wikipedia.org/wiki/삼전도비', 'https://en.wikipedia.org/wiki/Samjeondo_Monument'] },
  { ref: 'CV-24 L1-24', id: 4848, field: 'explanation', before: '그 자동차 회사는 볼보로, 볼린은 1959년 이 발명으로 첫 특허를 받았다.', after: PP('4848↔903').explanation, why: 'CV-24 — 특허는 1959.8 출원 · 1962.7 등록(V011 3-B)', sources: srcP('4848↔903') },
  { ref: 'CV-24 H2-07', id: 5176, field: 'general_hint', before: '이 탑에는 프랑스 과학자·기술자·수학자 72명의 이름이 새겨져 있다.', after: PP('5176↔295').hint, version: 'hint-v5', why: "CV-24 — '이 탑'이 정답 끝 낱말 한 글자 조각(H2) → '이 건축물'", sources: srcP('5176↔295') },
  { ref: 'CV-24 S1-05', id: 4760, field: 'general_hint', before: '이 자리에서 가장 많은 경기를 뛴 선수로는 2014년 프랭크 토머스가 처음 명예의 전당에 올랐다.', after: PP('4760↔791').hint, version: 'hint-v5', why: 'CV-24 — 최다 경기 보유자로 읽힘 → 문서 문구("다른 어느 자리보다 더 많은 경기")', sources: ['https://en.wikipedia.org/wiki/Frank_Thomas_(designated_hitter)'] },
  { ref: 'CV-24 S1-13', id: 2106, field: 'general_hint', before: '브루클린 다저스에서 뛰며 첫해 신인왕을 받았고, 대학 시절에는 네 종목에서 활약했다.', after: PP('4768↔2106').hint, version: 'hint-v5', why: 'CV-24 — 1회차 힌트 둘째 절이 2회차(#4768) 질문 첫 단서와 같은 사실(H12) → 1949 타격왕 · MVP', sources: srcP('4768↔2106') },
  { ref: 'CV-24 L3-17', id: 99, field: 'general_hint', before: '17세기 네덜란드에서 약용 술로 시작해 영국에서 크게 유행했으며, 칵테일 마티니의 기본 술이다.', after: PP('4861↔99').hint, version: 'hint-v5', why: 'CV-24 — 1회차 힌트의 영국 유행 절이 2회차(#4861) 질문 배경과 같은 사실(H12) → 그 절만 뺌', sources: srcP('4861↔99') },
  { ref: 'V011 4절 #14', id: 14, field: 'explanation', before: '★ 1글자 정답. Q-37에 따라 힌트를 만들지 않아야 한다.', after: '포르쉐 로고는 옛 뷔르템베르크 자유인민국의 문장을 바탕으로 하고, 가운데에는 회사가 자리한 슈투트가르트의 문장이 들어 있습니다.', why: 'V011 4절 — 해설 칸이 낡은 작업 메모뿐(H7 과 어긋남) → 15 §4 E1~E4 에 맞는 한 줄을 새로 씀(힌트의 "도시 이름 유래" 와 다른 사실 — H4)', sources: ['https://en.wikipedia.org/wiki/Porsche'], note: 'en 위키 Porsche 로고 단락: "stems from the coat of arms of the Free People\'s State of Württemberg" · "The arms of Stuttgart appear in the middle of the logo as an inescutcheon"' },
];
// ── 변형 (넣기 · 빼기) ────────────────────────────────────────────────────────
//   #2887 'R/P' · 'R/P 비' · 'R/P 비율' 은 15 A5(특수문자를 쓰지 않는다)라 넣지 않는다 — 브리핑 CV-21 "슬래시는 A5 가 막으면 빼고 '채굴 가능 연수' 는 꼭" (GEN 판단)
const A5 = (v) => /[^\p{L}\p{N} ]/u.test(v);
const VAR = [
  { ref: 'CV-20 #1783', id: 1783, add: P(1783).variants, remove: [] },
  { ref: 'CV-20 #2187', id: 2187, add: P(2187).variants, remove: [] },
  { ref: 'CV-20 #2262', id: 2262, add: P(2262).variants, remove: ['탄소 배출량'] },
  { ref: 'CV-20 #2412', id: 2412, add: P(2412).variants, remove: [] },
  { ref: 'CV-20 #2887', id: 2887, add: P(2887).variants, remove: [] },
  { ref: 'CV-20 #3072', id: 3072, add: P(3072).variants, remove: [] },
];

const pre = [];
for (const r of TEXT) {
  if (!r.after) pre.push(`${r.id} ${r.field}: 빈 값`);
  else if (/[\r\n]/.test(r.after)) pre.push(`${r.id} ${r.field}: 줄바꿈`);
  if (r.field === 'general_hint' && [...(r.after ?? '')].length > 120) pre.push(`${r.id}: 힌트 120자 초과`);
}
if (pre.length) { for (const p of pre) console.error('★', p); process.exit(1); }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
try {
  const ids = [...new Set([...TEXT, ...VAR].map((r) => r.id))];
  const { rows: db } = await c.query(`select q.id, q.is_active, q.question_text, q.display_answer, q.explanation, q.general_hint,
    coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
    from questions q where q.id = any($1::bigint[])`, [ids]);
  const D = new Map(db.map((r) => [Number(r.id), r]));
  const out = []; const todoT = []; const todoV = []; const skipped = []; const problems = []; let done = 0;
  // 반영 뒤 모습(질문 · 해설 · 변형)으로 검사한다
  const after = new Map(ids.map((id) => [id, { ...D.get(id), variants: [...(D.get(id)?.variants ?? [])] }]));
  for (const r of TEXT) {
    const d = D.get(r.id); const col = r.field;
    if (!d?.is_active) { problems.push(`${r.id}: 활성 아님`); continue; }
    out.push({ ref: r.ref, id: r.id, field: col, before: r.before, after: r.after, why: r.why, sources: r.sources, note: r.note ?? null, ...(r.version ? { version: r.version } : {}) });
    if (d[col] === r.after) { done++; after.get(r.id)[col] = r.after; continue; }
    if (d[col] !== r.before) { skipped.push(`${r.id} ${col}: DB 값이 before 와 다름 — 건너뜀`); continue; }
    after.get(r.id)[col] = r.after; todoT.push(r);
  }
  for (const r of VAR) {
    const a = after.get(r.id); const d = D.get(r.id);
    const add = []; const dropped = [];
    for (const v of r.add) {
      if (A5(v)) { dropped.push({ answer: v, why: '15 A5 — 특수문자' }); continue; }
      if (a.variants.includes(v)) { done++; continue; }
      add.push(v);
    }
    const remove = r.remove.filter((v) => a.variants.includes(v));
    const nextVars = [...a.variants.filter((v) => !remove.includes(v)), ...add];
    const g = checkAnswerSet(a.question_text, a.display_answer, nextVars, normalizeAnswer);
    for (const x of g.dropped) { dropped.push({ answer: x.answer, why: `게이트 ${x.kind} — ${x.why}` }); }
    const finalAdd = add.filter((v) => !g.dropped.some((x) => x.answer === v));
    if (g.blocked.length) problems.push(`${r.id}: 정답 묶음 막힘 ${JSON.stringify(g.blocked)}`);
    for (const w of g.warned) console.log(`  (경고) ${r.id}: ${w.answer} — ${w.why}`);
    a.variants = [...a.variants.filter((v) => !remove.includes(v)), ...finalAdd];
    for (const v of finalAdd) out.push({ ref: r.ref, id: r.id, field: 'question_answers', before: null, after: v, why: 'CV-21 — V011 변형 추가 제안', sources: src(r.id), note: null });
    for (const v of remove) out.push({ ref: r.ref, id: r.id, field: 'question_answers', before: v, after: null, why: "CV-21 — '탄소 배출량' 은 양 자체라 단위량당 값(질문)과 다른 개념", sources: src(r.id), note: null });
    for (const x of dropped) out.push({ ref: r.ref, id: r.id, field: 'question_answers', before: null, after: null, why: `넣지 않음: ${x.answer} — ${x.why}`, sources: [], note: 'not-applied' });
    if (finalAdd.length || remove.length) todoV.push({ id: r.id, add: finalAdd, remove, d });
  }
  // 새 질문 · 해설과 이어 읽기 — 빈칸 · 힌트
  const hintWarn = [];
  for (const id of ids) {
    const a = after.get(id);
    if (!blankCheck(a.question_text, a.display_answer).ok) problems.push(`${id}: 빈칸 수`);
    const g = checkAnswerSet(a.question_text, a.display_answer, a.variants, normalizeAnswer);
    if (g.blocked.length) problems.push(`${id}: 정답 묶음 막힘 ${JSON.stringify(g.blocked)}`);
    const k = checkHint({ hint: a.general_hint, answer: a.display_answer, variants: a.variants, question: a.question_text, explanation: a.explanation ?? '' });
    if (k.block.length) problems.push(`${id}: checkHint 막힘 ${JSON.stringify(k.block)}`);
    if (k.warn.length) hintWarn.push({ id, warn: k.warn });
  }
  for (const w of hintWarn) console.log(`  (힌트 경고) ${w.id}: ${JSON.stringify(w.warn)}`);
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g009-fixes.json'), JSON.stringify({ round: 'G009', note: 'A — V011 반영(CV-21~24 · #14 해설). 되돌리기는 rows[].before (question_answers 는 after 행 지우기 · before 행 되살리기) · note "not-applied" 는 넣지 않은 변형', hintWarn, skipped, rows: out }, null, 1) + '\n');
  console.log(`[g009-a] 칸 ${TEXT.length} · 변형 묶음 ${VAR.length} · 할 일 칸 ${todoT.length} · 변형 ${todoV.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
  for (const s of skipped) console.log('  ', s);
  if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
  if (!APPLY || (!todoT.length && !todoV.length)) { console.log(APPLY ? '[g009-a] 할 일 0' : '[g009-a] 확인만 했다 — 쓰려면 --apply'); process.exit(0); }
  await c.query('begin');
  let n = 0; let want = 0;
  for (const r of todoT) {
    want++;
    if (r.field === 'general_hint') n += (await c.query('update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and is_active and general_hint=$4', [r.id, r.after, r.version, r.before])).rowCount;
    else n += (await c.query(`update questions set ${r.field}=$2, updated_at=now() where id=$1 and is_active and ${r.field}=$3`, [r.id, r.after, r.before])).rowCount;
  }
  for (const v of todoV) {
    for (const a of v.add) { want++; n += (await c.query('insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing', [v.id, a, normalizeAnswer(a), 'G009 V011 변형 추가(CV-21)'])).rowCount; }
    for (const a of v.remove) { want++; n += (await c.query('delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary', [v.id, a])).rowCount; }
  }
  if (n !== want) { await c.query('rollback'); console.error(`★ 쓴 수 ${n}/${want} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[g009-a] 썼다 — ${n}행`);
} finally { await c.end(); }
