#!/usr/bin/env node
// =============================================================================
// G120 — V118 뒤처리: 블라인드 표기(alias) 인정 답 넣기 + 잘못 든 인정 답(variantBad) 걷기
//   값 = data/pipeline/audit/v118-cards.json(키 = 실 DB id) · 후보 글 = addText(없으면 v117-regrade.json 의 blindAnswer)
//   ★ 카드 글(질문 · 힌트 · 해설)은 한 글자도 고치지 않는다 — 쓰는 줄 = question_answers 만
//   넣기: V118 blind "same" + add true 142장 → GEN 눈(아래 ADD_NO = 안 넣음 · 까닭) → 다른 카드 정답 · 인정 답과 겹치거나
//         질문에 드러나거나 힌트 막힘이 늘면 넣지 않는다(G119 와 같은 눈) · 이미 같은 정규화 글이 있으면 건너뜀
//   걷기: V118 variantBad 26장 → GEN 눈(아래 BAD_KEEP = 애매해서 둠) → 나머지 = 정답과 다른 대상 → 줄을 지운다(옛 줄은 undo 파일)
//   dev(quizweb_dev)는 실 카드의 source_ref(둘 다 하나뿐)로 짝을 맞춘다
//   사용 node scripts/g120-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만 · 계획 audit/g120-plan-<db>.json)
//   ★ 멱등 · 되돌리기 파일 audit/g120-undo-<db>.json · --undo = 넣은 줄(note '#g120') 걷기 + 걷은 줄 되살리기
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { ROOT, guardNoOpenGames } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const dbName = a.includes('--db') ? a[a.indexOf('--db') + 1] : 'quizweb';
const TAG = 'G120';
const NOTE = 'G120 인정어(V118 블라인드 표기) #g120';
const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const key = (s) => normalizeAnswer(s).replace(/[^\p{L}\p{N}]/gu, '');
const cli = async (name) => { const u = new URL(process.env.DATABASE_URL); u.pathname = '/' + name; const c = new pg.Client({ connectionString: u.toString() }); await c.connect(); return c; };

// ── GEN 눈 ────────────────────────────────────────────────────────────────────
// 넣지 않는 후보(같은 대상의 다른 표기가 아님)
const ADD_NO = {
  2044: '좁은 말 — 제2우주속도는 지구 탈출 속도뿐(질문은 천체 일반)',
  2826: '틀린 옮김 — Rams 를 라무스로 적은 것(쓰이는 표기 아님)',
  4995: '넓은 말 — 아주높임에는 하십시오체도 든다',
  5284: '틀린 옮김 — Geesink 를 헤이스링크로 적은 것',
  6175: '다른 대상 — 윌리는 인물 · 정답은 그림책 제목',
  7002: '다른 대상 — 큐피드는 로마 신화 이름(질문이 그리스 신화로 묻는다)',
  8744: '틀린 옮김 — Roche 를 로시로 적은 것',
  9479: '망가진 줄임 — 월 사운드는 쓰이지 않는 이름',
};
// 판정자가 다른 대상이라 했지만 애매해서 두는 인정 답(카드 id → { 글: 까닭 })
const BAD_KEEP = {
  1364: { '표어문자': '한자 같은 글자를 표어문자로도 부른다 — 같은 대상으로 볼 여지' },
  1640: { '자주색': '티리언 퍼플은 붉은 보라 — 자주로도 옮긴다', '자주': '위와 같음' },
  1821: { '골든 리트리버': '리트리버의 한 품종 — 물어 오는 개로 맞는 답', '래브라도 리트리버': '위와 같음', '래브라도': '위와 같음' },
  1977: { '지리적 표시제': 'EU 원산지 보호(PDO · PGI)를 통틀어 지리적 표시로 부른다', '지리적 표시': '위와 같음', '지리적 표시제도': '위와 같음' },
  2559: { '보급': '병참의 일을 가리키는 말로 흔히 쓴다 — 애매' },
  2846: { '약주': '맑은 우리 술을 약주로도 부른다 — 애매' },
  4532: { '산수경석': '영화 속 그 돌의 이름이 산수경석 — 같은 물건' },
  5286: { '오이초마게': '스모 선수가 은퇴식에서 자르는 상투 그 자체 — 같은 대상' },
};
const BAD_WHY = {
  537: 'SD 는 데포르메의 한 갈래(질문이 슈퍼 형태를 단서로 줌)',
  634: '유엔 결의는 고대 전통과 다른 대상',
  669: '주의 진행은 신호의 뜻 — 도로교통법의 서행과 다름',
  1400: '질문은 좌석 등급에 빗댄 별명을 묻는다 — 병 이름은 다른 답',
  1503: '색채 상표권은 상표권의 한 갈래',
  2164: '기체 용해도는 용해도의 한 갈래',
  2255: '보호무역은 다른 개념',
  2422: '영국 · 미국 갈래 하나씩 — 질문은 둘을 묶은 체계',
  2589: '아삭함은 질문이 든 보기 — 식감의 한 예',
  2595: '질량은 달에서 그대로 — 다른 물리량',
  2653: '무엇을 바탕으로 주나의 답 — 질문은 누구에게 주나',
  4375: '경사 부정합은 부정합의 한 갈래',
  5082: '마장마술은 승마의 한 종목',
  5132: '모래 만다라는 만다라의 한 갈래(질문은 그림)',
  5352: '질문이 앞면 · 뒷면이라 했다 — 추첨 · 제비뽑기는 다른 방법',
  5480: '감투는 다른 쓰개',
  5593: '신구빈법은 1834년의 다른 법',
  6493: '질문은 종의 별명 — 엘리자베스 타워는 탑 이름',
};

const V = J(AUD('v118-cards.json'));
if (!V.done) throw new Error('v118-cards.json 이 다 되지 않았다');
const V7 = J(AUD('v117-regrade.json')).cards;
const G119 = J(AUD('g119-alias.json'));
const g119Has = new Set(G119.added.map((x) => `${x.id}|${x.v}`));

const R = await cli('quizweb');
const c = dbName === 'quizweb' ? R : await cli(dbName);
console.log(`[${TAG}] DB ${dbName} · ${mode}`);
const UNDO = AUD(`g120-undo-${dbName}.json`);

if (mode === 'undo') {
  await guardNoOpenGames(c, `${TAG} undo`);
  const u = J(UNDO);
  await c.query('begin');
  const del = (await c.query('delete from question_answers where note=$1', [NOTE])).rowCount;
  let back = 0;
  for (const x of u.removed) back += (await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,$4,$5) on conflict do nothing`, [x.question_id, x.answer_text, x.answer_norm, x.is_primary, x.note])).rowCount;
  await c.query('commit');
  console.log(`[${TAG} undo] 넣은 줄 걷음 ${del} · 걷은 줄 되살림 ${back}/${u.removed.length}`);
  await R.end(); if (c !== R) await c.end(); process.exit(0);
}

const COLS = 'id::int, source_ref, question_text, display_answer, general_hint, explanation, is_active';
const realRows = (await R.query(`select ${COLS} from questions`)).rows;
const real = new Map(realRows.map((r) => [String(r.id), r]));
let pair; // 실 id → 이 DB 행
if (c === R) pair = (rid) => real.get(rid);
else {
  const d = (await c.query(`select ${COLS} from questions`)).rows;
  const byRef = new Map(); for (const x of d) { if (!byRef.has(x.source_ref)) byRef.set(x.source_ref, []); byRef.get(x.source_ref).push(x); }
  pair = (rid) => { const r = real.get(rid); const m = r ? byRef.get(r.source_ref) ?? [] : []; return m.length === 1 ? m[0] : null; };
}

const QA = (await c.query(`select a.question_id::int qid, a.answer_text, a.answer_norm, a.is_primary, a.note from question_answers a`)).rows;
const allQ = (await c.query(`select id::int, display_answer from questions where is_active`)).rows;
const activeIds = new Set(allQ.map((q) => q.id));
const OWN = new Map(); const own = (s, id) => { const k = key(s); if (!k) return; if (!OWN.has(k)) OWN.set(k, new Set()); OWN.get(k).add(id); };
for (const q of allQ) own(q.display_answer, q.id);
const VAR = new Map();
for (const x of QA) { if (x.note !== NOTE && activeIds.has(x.qid)) own(x.answer_text, x.qid); if (!VAR.has(x.qid)) VAR.set(x.qid, []); VAR.get(x.qid).push(x); }

const out = { round: TAG, db: dbName, at: new Date().toISOString(), counts: {}, add: [], already: [], notAdd: [], remove: [], keep: [], notFound: [] };

// ── 넣기 ──────────────────────────────────────────────────────────────────────
const addTodo = [];
for (const [rid, x] of Object.entries(V.cards)) {
  if (!(x.blind === 'same' && x.add)) continue;
  const v = (x.addText ?? V7[rid]?.blindAnswer ?? '').trim();
  const base = { id: +rid, v };
  if (!v) { out.notAdd.push({ ...base, why: '후보 글 없음' }); continue; }
  if (ADD_NO[rid]) { out.notAdd.push({ ...base, why: ADD_NO[rid] }); continue; }
  const r = pair(rid);
  if (!r) { out.notAdd.push({ ...base, why: '이 DB 에 짝 없음' }); continue; }
  if (!r.is_active) { out.notAdd.push({ ...base, why: '활성 아님' }); continue; }
  base.answer = r.display_answer;
  const vars = VAR.get(r.id) ?? [];
  if (vars.some((y) => y.note === NOTE && y.answer_text === v)) { out.add.push({ ...base, dbId: r.id, done: true }); continue; }
  if (g119Has.has(`${rid}|${v}`)) { out.already.push({ ...base, why: 'G119 가 넣음' }); continue; }
  if (normalizeAnswer(v) === normalizeAnswer(r.display_answer) || vars.some((y) => normalizeAnswer(y.answer_text) === normalizeAnswer(v))) { out.already.push({ ...base, why: '같은 정규화 글이 이미 있음' }); continue; }
  const hit = [...(OWN.get(key(v)) ?? [])].filter((y) => y !== r.id);
  if (hit.length) { out.notAdd.push({ ...base, why: `다른 카드와 겹침 ${hit.map((y) => '#' + y).join(',')}` }); continue; }
  if (key(r.question_text).includes(key(v))) { out.notAdd.push({ ...base, why: '질문에 드러남' }); continue; }
  if (r.general_hint) {
    const vt = vars.map((y) => y.answer_text);
    const hc = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: [...vt, v], question: r.question_text, explanation: r.explanation ?? '' });
    const hc0 = checkHint({ hint: r.general_hint, answer: r.display_answer, variants: vt, question: r.question_text, explanation: r.explanation ?? '' });
    if (hc.block.length > hc0.block.length) { out.notAdd.push({ ...base, why: `힌트 막힘 ${hc.block.map((b) => b.frag).join('·')}` }); continue; }
  }
  addTodo.push({ ...base, dbId: r.id });
}

// ── 걷기 ──────────────────────────────────────────────────────────────────────
const delTodo = [];
for (const [rid, x] of Object.entries(V.cards)) {
  if (!x.variantBad) continue;
  const r = pair(rid);
  for (const v of x.variantBad) {
    const kp = BAD_KEEP[rid]?.[v];
    if (kp) { out.keep.push({ id: +rid, v, why: kp }); continue; }
    if (!r) { out.notFound.push({ id: +rid, v, why: '이 DB 에 짝 없음' }); continue; }
    const rows = (VAR.get(r.id) ?? []).filter((y) => y.answer_text === v && !y.is_primary);
    if (!rows.length) { out.notFound.push({ id: +rid, v, why: '그 인정 답 줄이 없음(이미 걷었거나 없음)' }); continue; }
    if (!BAD_WHY[rid]) throw new Error(`#${rid} 걷는 까닭이 없다`);
    for (const y of rows) delTodo.push({ question_id: r.id, answer_text: y.answer_text, answer_norm: y.answer_norm, is_primary: y.is_primary, note: y.note, rid: +rid, answer: r.display_answer, why: BAD_WHY[rid] });
  }
}
out.remove = delTodo.map(({ rid, answer, answer_text, why }) => ({ id: rid, answer, v: answer_text, why }));

out.counts = { addCand: Object.values(V.cards).filter((x) => x.blind === 'same' && x.add).length, add: addTodo.length, addDone: out.add.filter((x) => x.done).length, already: out.already.length, notAdd: out.notAdd.length,
  badCards: Object.values(V.cards).filter((x) => x.variantBad).length, remove: delTodo.length, keep: out.keep.length, notFound: out.notFound.length };
out.add.push(...addTodo);
writeFileSync(AUD(`g120-plan-${dbName}.json`), JSON.stringify(out, null, 1) + '\n');
// 실 DB 기록(넣은 것 · 안 넣은 것 · 걷은 것 · 둔 것) — 걷은 줄은 undo 파일(이미 걷었으면 계획에는 안 나온다)
if (c === R) {
  const removedNow = existsSync(UNDO) ? J(UNDO).removed : [];
  const rm = [...removedNow, ...delTodo.filter((d) => !removedNow.some((y) => y.question_id === d.question_id && y.answer_text === d.answer_text))]
    .map((d) => ({ id: d.question_id, answer: real.get(String(d.question_id))?.display_answer, v: d.answer_text, why: BAD_WHY[d.question_id] ?? '' }));
  const added = out.add.map(({ id, answer, v }) => ({ id, answer, v }));
  writeFileSync(AUD('g120-alias.json'), JSON.stringify({ round: TAG, note: `V118 블라인드 표기 인정 답 넣기 + variantBad 걷기 — id = 실 DB · added = note "${NOTE}" · notAdd = 안 넣음(까닭) · removed = 걷은 인정 답(되살리기 = --undo) · keep = 판정자가 다른 대상이라 했지만 애매해 둠`,
    counts: { added: added.length, already: out.already.length, notAdd: out.notAdd.length, removed: rm.length, keep: out.keep.length }, added, already: out.already, notAdd: out.notAdd, removed: rm, keep: out.keep }, null, 1) + '\n');
}
console.log(`[${TAG}] ${JSON.stringify(out.counts)}`);
for (const x of out.notAdd) console.log(`  안 넣음 #${x.id} ${x.v}: ${x.why}`);

if (mode !== 'apply') { console.log(`[${TAG}] 확인만 — 쓰려면 --apply`); await R.end(); if (c !== R) await c.end(); process.exit(0); }
if (!addTodo.length && !delTodo.length) { console.log(`[${TAG}] 쓸 것 없음`); await R.end(); if (c !== R) await c.end(); process.exit(0); }

const at = await guardNoOpenGames(c, TAG);
const undo = existsSync(UNDO) ? J(UNDO) : { round: TAG, db: dbName, note: `node scripts/g120-apply.mjs${dbName === 'quizweb' ? '' : ' --db ' + dbName} --undo — 넣은 줄(note #g120) 걷기 + removed 되살리기`, removed: [] };
for (const d of delTodo) if (!undo.removed.some((y) => y.question_id === d.question_id && y.answer_text === d.answer_text)) undo.removed.push({ question_id: d.question_id, answer_text: d.answer_text, answer_norm: d.answer_norm, is_primary: d.is_primary, note: d.note });
undo.writtenAt = at;
writeFileSync(UNDO, JSON.stringify(undo, null, 1) + '\n');
await c.query('begin');
try {
  let ins = 0, del = 0;
  for (const x of addTodo) ins += (await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing`, [x.dbId, x.v, normalizeAnswer(x.v), NOTE])).rowCount;
  for (const d of delTodo) del += (await c.query(`delete from question_answers where question_id=$1 and answer_text=$2 and not is_primary`, [d.question_id, d.answer_text])).rowCount;
  if (del !== delTodo.length) throw new Error(`걷은 수 ${del}/${delTodo.length}`);
  await c.query('commit');
  console.log(`[${TAG}] 썼다 — 인정 답 넣음 ${ins}/${addTodo.length} · 걷음 ${del} · ${at}`);
} catch (err) { await c.query('rollback'); console.error(`★ 되돌렸다 — ${err.message}`); await R.end(); if (c !== R) await c.end(); process.exit(1); }
await R.end(); if (c !== R) await c.end();
