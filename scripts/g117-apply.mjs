#!/usr/bin/env node
// =============================================================================
// G117 — 새 카드 7차 싣기 (g116-apply.mjs 를 본뜸 · 값 · 게이트는 G116 그대로)
//   카드 = audit/g117-raw/cards.mjs 의 loadCards(): A 새카드-81~90 ready 가운데 V115 ok 47 · B 새카드-고침-7 가운데 V115 ok 15 = 62
//          (fix 3 n6484 · n6590 · n6182 와 n6543 need 는 싣지 않음)
//   소분류 = audit/g117-raw/leaf.txt · B10 = g117-raw/b10.json · 넓은 말 = g117-raw/broad.json (GEN 판단)
//   ★ 영상 정답(회차.json · 6~8회 포함)과 겹치면 싣지 않는다(G116 게이트 그대로)
//   사용 node scripts/g117-apply.mjs [--db quizweb_dev] [--apply | --undo]   (꼬리표 '#g117-')
// ── 아래는 G116 머리말(참고) ── G116 — 새 카드 6차 싣기
// ── 아래는 G115 머리말(참고) ── G115 — 새 카드 5차 싣기 (g114-apply.mjs 를 본뜸)
// ── 아래는 G114 머리말(참고) ──
// G114 — 새 카드 4차 싣기 + 실린 카드 해설 한 장 바꾸기 (g113-apply.mjs 를 본뜸 · 값 · 게이트는 G112 · G113 그대로)
// ── 아래는 G113 · G112 머리말(참고) ──
// G113 — G112 에서 못 실은 여섯 장 싣기 (g112-apply.mjs 를 본뜸 · 값 · 게이트 · 소분류는 G112 그대로)
// ── 아래는 G112 머리말(참고) ──
// G112 — 새 카드 3차 싣기 (G111 재료 → gpt 카드 → V111 사실 확인 → gpt 고침 → 이 스크립트) + 덧붙임 셋 + 인정어 하나
//   카드 = audit/g112-raw/cards.mjs 의 loadCards(): 새카드-35~59 ready 가운데 V111 ok → 그 카드 · fix → 받은것/새카드-고침-4.json(drop 은 싣지 않음)
//          + 덧붙임(G110 의 재료 · V110 판정 그대로): n1619 · n1916 = 새카드-고침-3(힌트만 새로) · n1802 = 새카드-고침-2(정답 "생일 축하 노래" — 설계가 정함)
//   + 인정어 "헛팔다리" → G108 n0510 환상지 문항(실 8787 · dev 8788 — audit/g108-sources.json 의 ids)
//   ★ 카드 글(question · hint · explanation)은 한 글자도 고치지 않는다 — 게이트에 걸리면 싣지 않고 계획 파일에 적는다
//   값 · 게이트 = G110 과 같다(scripts/g110-apply.mjs 머리말) · 소분류 = audit/g112-raw/leaf.txt(GEN 판단)
//   영상 정답(web-desk/vscript/회차.json + 4 · 5회 초안 에펠탑 · 플로지스톤 · 노시보 효과)과 겹치면 싣되 표시(video)
//   사용 node scripts/g112-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만 · 계획 audit/g112-plan-<db>.json)
//   ★ 멱등: 이미 실린 key(source_ref)는 건너뛴다 · --undo = 꼬리표 '#g112-' 문항 + 헛팔다리 줄을 걷는다(판에 쓰인 문항은 지우지 않고 끈다)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { ROOT, guardNoOpenGames } from './g023-common.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { checkHint } from './hint-check.mjs';
import { blankCheck, lengthCheck, assertiveWords, answerFragments } from '../pipeline/lib/question-checks.mjs';
import { formHit } from './form-scan.mjs';
import { loadCards } from '../data/pipeline/audit/g117-raw/cards.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const db = url.pathname.slice(1);
const TAG = 'G117';
const MARK = '#g117-';
const FORM_OK = new Set(); // G117 에는 예외 없음
const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const key = (s) => normalizeAnswer(s).replace(/[^\p{L}\p{N}]/gu, '');
const L = (s) => [...(s ?? '')].length;
// V115: n6504 는 재료 출처(olympics.com)가 판정 창에서 안 열렸는데 ok — 보고에 적는다
const PARTIAL = new Set(['n6504']);
// 넓은 말 · 다른 개념(찬종 2026-11-19 "같은 개념만 같은 말만") — 그 인정어 줄만 뺀다 · GEN 판단(되돌리기 쉽다)
const BROAD = new Map(Object.entries(JSON.parse(readFileSync(AUD('g117-raw/broad.json'), 'utf8'))));
// B10 — 영어가 공식 원제 · 상표인 작품 · 제품의 영문 표기는 인정어로 둔다(G108 · G110 과 같은 선)
const B10 = new Map(Object.entries(JSON.parse(readFileSync(AUD('g117-raw/b10.json'), 'utf8'))));
// 영상 정답(G117: 겹치면 싣지 않는다) — 회차.json + 4 · 5회 초안 · 4회 1번 청진기
const VIDEO = new Set([...JSON.stringify(J('web-desk/vscript/회차.json')).matchAll(/"answer":"([^"]+)"/g)].map((x) => x[1]).concat(['에펠탑', '플로지스톤', '노시보 효과', '청진기']).map(key));
const ADD1 = { note: '— G117 에는 없음 —' };

const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
console.log(`[${TAG}] DB ${db} · ${mode}`);

// ── 되돌리기 ──────────────────────────────────────────────────────────────────
if (mode === 'undo') {
  await guardNoOpenGames(c, `${TAG} undo`);
  const rows = (await c.query(`select q.id::int, q.source_ref,
      exists(select 1 from game_questions g where g.question_id=q.id) or exists(select 1 from answer_events e where e.question_id=q.id)
      or exists(select 1 from question_feedback f where f.question_id=q.id) or exists(select 1 from near_misses n where n.question_id=q.id)
      or exists(select 1 from play_events p where p.question_id=q.id) used
    from questions q where q.source_id='seed-gen' and q.source_ref like $1`, [`%${MARK}%`])).rows;
  await c.query('begin');
  let del = 0, off = 0;
  for (const r of rows) {
    if (r.used) { off += (await c.query(`update questions set is_active=false, inactive_reason='g117_undo', updated_at=now() where id=$1`, [r.id])).rowCount; continue; }
    del += (await c.query('delete from questions where id=$1', [r.id])).rowCount; // 정답 · 검수 기록 · 경험은 cascade
  }
  await c.query('commit');
  console.log(`[${TAG} undo] 지움 ${del} · 판에 쓰여 끔 ${off}`);
  await c.end(); process.exit(0);
}

// ── 카드 모으기 ───────────────────────────────────────────────────────────────
const LC = loadCards();
const V = LC.v;
const todo = LC.cards;
if (todo.length !== 62) throw new Error(`카드 ${todo.length} ≠ 62`);

const tree = (await c.query(`select c.id::int, c.key, c.name_ko, c.parent_id::int, c.level from categories c`)).rows;
const byId = new Map(tree.map((r) => [r.id, r]));
const midOf = new Map(tree.filter((r) => r.level === 2).map((r) => [`${byId.get(r.parent_id).name_ko}>${r.name_ko}`, r]));
const leafByKey = new Map(tree.filter((r) => r.level === 3).map((r) => [r.key, r]));
const LEAF = new Map(readFileSync(AUD('g117-raw/leaf.txt'), 'utf8').split(/\r?\n/).filter((l) => /^n\d{4} /.test(l)).map((l) => { const [k, n, q] = l.split(/\s+/); return [k, { n: Number(n), odd: q === '?' }]; }));

const out = { round: TAG, db, at: new Date().toISOString(), counts: {}, load: [], already: [], notLoaded: [], drop: LC.drop, need: LC.notReady, dupOff: [], variantCut: [], partial: [], leafOdd: [], video: [], gradeGap: [], spelling: [], add1: null, warn: { assert: [], frag: [], hintWarn: [], substring: [] } };

// ── DB 의 정답 열쇠(활성 + 꺼진 · 정답 + 인정어) — g108 · g110 으로 실린 것 포함 ─────────
const Q = (await c.query(`select id::int, is_active, inactive_reason, display_answer, source_ref, question_text from questions`)).rows;
const QA = (await c.query(`select question_id::int qid, answer_text, note from question_answers`)).rows;
const qById = new Map(Q.map((q) => [q.id, q]));
const OWN = new Map(); // 열쇠 → Set(id)
const own = (s, id) => { const kk = key(s); if (!kk) return; if (!OWN.has(kk)) OWN.set(kk, new Set()); OWN.get(kk).add(id); };
const loadedRef = new Map();
for (const q of Q) { if (q.source_ref?.includes(MARK)) { loadedRef.set(q.source_ref.split(MARK)[1], q.id); continue; } own(q.display_answer, q.id); }
for (const r of QA) if (!qById.get(r.qid)?.source_ref?.includes(MARK) && r.note !== ADD1.note) own(r.answer_text, r.qid);
const isNum = (s) => /^[\d\s.,]+$/.test(s);
const who = (ids) => [...ids].map((id) => { const q = qById.get(id); return `#${id} ${q.display_answer}${q.is_active ? '' : `(꺼짐 ${q.inactive_reason ?? ''})`}${/#g1\d\d-/.test(q.source_ref ?? '') ? ` [${q.source_ref.match(/#(g1\d\d)-/)[1]}]` : ''}`; }).join(' · ');

// 이번 묶음 안 겹침(정답끼리 · 정답 ↔ 인정어)
const BATCH = new Map();
for (const t of todo) for (const s of [t.card.answer, ...(t.card.also ?? []), ...(t.ver.alsoAdd ?? [])]) { const kk = key(s); if (!kk) continue; if (!BATCH.has(kk)) BATCH.set(kk, new Set()); BATCH.get(kk).add(t.key); }

const plan = [];
for (const t of todo) {
  const { card: cd, mat: m, ver: r } = t;
  const fail = [];
  const ans = cd.answer;
  const q = cd.question, h = cd.hint ?? '', e = cd.explanation ?? '';
  // ① 정답 겹침
  if (!isNum(ans)) {
    const hit = OWN.get(key(ans));
    if (hit) { fail.push(`① 정답 겹침 — ${who(hit)}`); if (m.dupOff) out.dupOff.push({ key: t.key, answer: ans, dupOff: m.dupOff, with: who(hit) }); }
    const inb = [...(BATCH.get(key(ans)) ?? [])].filter((x) => x !== t.key);
    if (inb.length) fail.push(`① 묶음 안 겹침 — ${inb.join(',')}`);
  }
  if (m.dupOff && !OWN.get(key(ans))) out.dupOff.push({ key: t.key, answer: ans, dupOff: m.dupOff, with: '지금 DB 에서는 겹침 없음' });
  // 분류
  const mid = midOf.get(`${m.major}>${m.mid}`);
  const lf = LEAF.get(t.key);
  const leaf = mid && lf ? leafByKey.get(`L3:${mid.key.slice(3)}#${lf.n}`) : null;
  if (!leaf || leaf.parent_id !== mid.id) fail.push(`분류 없음 ${m.major}>${m.mid} #${lf?.n}`);
  // 인정어: also + alsoAdd → 겹침 · B4 등은 줄만 뺀다
  let variants = [...new Set([...(cd.also ?? []), ...(r.alsoAdd ?? [])])].filter((v) => v && v.trim() && v !== ans);
  const cut = [];
  variants = variants.filter((v) => {
    if (key(v) === key(ans)) { cut.push({ v, why: 'redundant(정답과 같은 열쇠)' }); return false; }
    if ((BROAD.get(t.key) ?? []).includes(v)) { cut.push({ v, why: '넓은 말 · 다른 개념(GEN 판단)' }); return false; }
    const hit = OWN.get(key(v)); if (hit && !isNum(v)) { cut.push({ v, why: `다른 문항과 겹침 ${who(hit)}` }); return false; }
    const inb = [...(BATCH.get(key(v)) ?? [])].filter((x) => x !== t.key); if (inb.length) { cut.push({ v, why: `묶음 안 겹침 ${inb.join(',')}` }); return false; }
    return true;
  });
  const g = checkAnswerSet(q, ans, variants, normalizeAnswer, { originalTitles: B10.get(t.key) ?? [] });
  if (g.blocked.length) {
    const main = g.blocked.filter((b) => b.answer === ans);
    if (main.length) fail.push(`② 질문에 정답이 낱말로 "${ans}"`);
    for (const b of g.blocked.filter((b) => b.answer !== ans)) cut.push({ v: b.answer, why: '질문에 낱말로 드러남' });
  }
  for (const d of g.dropped) cut.push({ v: d.answer, why: `${d.kind} — ${d.why}` });
  const cutSet = new Set(cut.map((x) => x.v));
  variants = variants.filter((v) => !cutSet.has(v));
  for (const w of g.warned) out.warn.substring.push({ key: t.key, answer: w.answer });
  // ③ 힌트
  if (!h.trim() || !e.trim()) fail.push('⑤ 힌트 · 해설 빔');
  if (h.trim()) {
    if (L(h) > 120) fail.push(`③ 힌트 ${L(h)}자 > 120`);
    // 정답 자체가 힌트에 걸리면 카드를 싣지 않는다 · 인정어 조각 때문이면 그 인정어 줄만 뺀다
    let hc = checkHint({ hint: h, answer: ans, variants, question: q, explanation: e });
    const byVar = hc.block.filter((b) => b.of && b.of !== ans && variants.includes(b.of));
    if (byVar.length) {
      const drop = new Set(byVar.map((b) => b.of));
      for (const v of drop) cut.push({ v, why: `힌트 막힘(H2) — 인정어 조각 "${byVar.find((b) => b.of === v).frag}"이 힌트에 있다` });
      variants = variants.filter((v) => !drop.has(v));
      hc = checkHint({ hint: h, answer: ans, variants, question: q, explanation: e });
    }
    if (hc.block.length) fail.push(`③ 힌트 막힘(정답 조각) ${[...new Set(hc.block.map((b) => b.frag))].join('·')}`);
    for (const w of hc.warn) out.warn.hintWarn.push({ key: t.key, kind: w.kind, detail: w.frag ?? w.share ?? (w.shared ?? []).join('/') });
  }
  // ④ 질문 꼴
  const bc = blankCheck(q, ans); if (!bc.ok) fail.push(`④ 빈칸 ${bc.blanks} ≠ ${bc.answerLength}`);
  const lc = lengthCheck(q); if (!lc.ok) fail.push(`④ 질문 ${lc.length}자 (적재 게이트)`);
  if (L(q) > 200) fail.push(`④ 질문 ${L(q)}자 > 200`);
  if (!/까요\?\s*$/.test(q)) fail.push('④ 질문 끝이 ~까요? 아님');
  const fh = formHit(q); if (fh && FORM_OK.has(t.key)) out.warn.formOk = [...(out.warn.formOk ?? []), { key: t.key, hit: fh }]; else if (fh) fail.push(`④ 질문 형태(~는, ~은) '${fh}'`);
  if (!(cd.grade >= 1 && cd.grade <= 5)) fail.push(`등급 ${cd.grade}`);
  for (const tx of [q, e]) for (const aw of assertiveWords(tx)) out.warn.assert.push({ key: t.key, words: aw.words.join('·'), sentence: aw.sentence.slice(0, 70) });
  const fr = answerFragments(q, ans); if (fr.length) out.warn.frag.push({ key: t.key, answer: ans, frags: fr.map((x) => x.frag).join(',') });
  if (cut.length) out.variantCut.push({ key: t.key, answer: ans, cut });
  // ⑥ 영상 정답 겹침(G117 게이트 — 정답 · 인정어)
  const vh = [ans, ...variants].filter((s) => VIDEO.has(key(s)));
  if (vh.length) { fail.push(`⑥ 영상 정답과 겹침 ${vh.join('·')}`); out.video.push({ key: t.key, answer: ans, hit: vh }); }
  if (fail.length) { out.notLoaded.push({ key: t.key, answer: ans, why: fail.join(' / ') }); continue; }
  const already = loadedRef.get(t.key) ?? null; // 이미 실린 key — 계획 목록에는 남기고 쓰지 않는다(멱등)
  if (already) out.already.push({ key: t.key, id: already });
  if (PARTIAL.has(t.key)) out.partial.push({ key: t.key, answer: ans, note: r.why ?? '' });
  if (Math.abs(cd.grade - m.gradeGuess) > 2) out.gradeGap.push({ key: t.key, answer: ans, grade: cd.grade, gradeGuess: m.gradeGuess });
  if (m.answer !== ans) out.spelling.push({ key: t.key, card: ans, material: m.answer, spelling: m.spelling });
  if (lf.odd) out.leafOdd.push({ key: t.key, answer: ans, cat: `${m.major} > ${m.mid} > ${leaf.name_ko}` });
  const ref = `${mid.key.slice(3)}/${lf.n}${MARK}${t.key}`;
  plan.push({ key: t.key, extra: !!t.extra, already, ref, from: t.from, chunk: t.mat.chunk, answer: ans, variants, grade: cd.grade, gradeGuess: m.gradeGuess, leafId: leaf.id, cat: `${m.major} > ${m.mid} > ${leaf.name_ko}`, question: q, hint: h, explanation: e, ver: r, mat: m });
}
out.load = plan.map((p) => ({ key: p.key, id: p.already ?? undefined, answer: p.answer, grade: p.grade, cat: p.cat, from: p.from, extra: p.extra || undefined, variants: p.variants }));

out.fix = LC.fix;
out.counts = { cards: todo.length, v115: V.cards.length, fixSkipped: LC.fix.length, need: out.need.length, planned: plan.length, toWrite: plan.filter((p) => !p.already).length, already: out.already.length, notLoaded: out.notLoaded.length, variantRows: plan.reduce((s, p) => s + p.variants.length, 0), variantCut: out.variantCut.reduce((s, x) => s + x.cut.length, 0), video: out.video.length, leafOdd: out.leafOdd.length };
writeFileSync(AUD(`g117-plan-${db}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(`[${TAG}] ${JSON.stringify(out.counts)} → audit/g117-plan-${db}.json`);
if (out.warn.formOk) console.log(`[${TAG}] 형태 게이트 예외 ${JSON.stringify(out.warn.formOk)}`);
for (const x of out.notLoaded) console.log(`  ✗ ${x.key} ${x.answer}: ${x.why}`);
const W = plan.filter((p) => !p.already);
if (mode !== 'apply' || !W.length) { console.log(mode === 'apply' ? `[${TAG}] 실을 것 없음` : `[${TAG}] 확인만 — 쓰려면 --apply`); await c.end(); process.exit(0); }

// ── 쓰기(한 트랜잭션) ─────────────────────────────────────────────────────────
const at = await guardNoOpenGames(c, TAG);
const band = (g) => (g <= 2 ? 'easy' : g === 3 ? 'medium' : 'hard');
const ids = {};
await c.query('begin');
try {
  for (const p of W) {
    const r = p.ver;
    const id = (await c.query(
      `insert into questions (question_type, question_text, display_answer, hint_answer, answer_lang, category_id, difficulty, explanation,
         source_id, source_ref, license, status, is_active, approved_at, difficulty_score, difficulty_why, score_version, scored_at, general_hint, general_hint_version, worth)
       values ('short_answer',$1,$2,$2,'ko',$3,$4,$5,'seed-gen',$6,null,'approved',true,now(),$7,$8,'card-new-v1',now(),$9,'card-v1',null) returning id::int`,
      [p.question, p.answer, p.leafId, band(p.grade), p.explanation, p.ref, p.grade, `gpt 카드 등급 ${p.grade}(재료 어림 ${p.gradeGuess}) — ${TAG}`, p.hint])).rows[0].id;
    ids[p.key] = id;
    await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,true,$4)`, [id, p.answer, normalizeAnswer(p.answer), `${TAG} 정답`]);
    for (const v of p.variants) await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing`,
      [id, v, normalizeAnswer(v), (B10.get(p.key) ?? []).includes(v) ? `B10 원제·상표 영문 표기 (${TAG})` : (r.alsoAdd ?? []).includes(v) ? `${TAG} 인정어(${r.round} alsoAdd)` : `${TAG} 인정어`]);
    await c.query(`insert into review_queue (question_id, ai_model, ai_confidence, ai_flags, backcheck_answer, backcheck_result, rule_flags, reviewer_note, reviewed_at)
       values ($1,$2,null,$3,$4,$5,$6,$7, now()) on conflict (question_id) do nothing`,
      [id, `gpt(Codex) 카드 · Claude ${r.round} 사실 확인`,
        JSON.stringify({ [r.round.toLowerCase()]: { verdict: r.verdict, blind: r.blind, second: r.second, why: r.why, claims: (r.claims ?? []).length, alsoAdd: r.alsoAdd ?? [], spellingSeen: r.spellingSeen ?? null }, from: p.from, material: `새재료-${p.chunk}`, key: p.key, extra: p.extra || undefined }),
        r.blind ?? null, r.blind === '정답' ? 'pass' : (r.alsoAdd ?? []).includes(r.blind) ? 'ambiguous' : 'mismatch',
        JSON.stringify({ round: 'g117', leafOdd: LEAF.get(p.key)?.odd || undefined }),
        `${TAG} 새 카드 ${p.key} · 재료 새재료-${p.chunk} · 카드 ${p.from} · 사실 확인 ${r.round} ${r.verdict}`]);
  }
  await c.query('commit');
} catch (err) { await c.query('rollback'); console.error(`★ 되돌렸다 — ${err.message}`); await c.end(); process.exit(1); }
console.log(`[${TAG}] 썼다 — 문항 ${W.length} · 인정어 ${W.reduce((s, p) => s + p.variants.length, 0)} · ${at}`);

// 출처(문항의 출처 칸 — 카드 다시 쓰기 때처럼 파일) · 두 DB 의 id 를 함께 둔다
const SRC = AUD('g117-sources.json');
const src = existsSync(SRC) ? JSON.parse(readFileSync(SRC, 'utf8')) : { round: TAG, note: '새 카드 출처 — 재료(새재료-81~90 · 새카드-고침-7 의 material)의 core · story · hintIdea 와 V115 둘째 문서 · ids = DB 별 문항 id', items: {} };
for (const p of W) {
  const m = p.mat;
  const it = (src.items[p.key] ??= { answer: p.answer, ids: {}, core: m.core, story: m.story, hintIdea: m.hintIdea ?? null, second: p.ver.second ?? null });
  it.ids[db] = ids[p.key];
  it.urls = [...new Set([m.core?.url, ...(m.story ?? []).map((s) => s.url), m.hintIdea?.url, p.ver.second?.url].filter(Boolean))];
}
writeFileSync(SRC, JSON.stringify(src, null, 1) + '\n');
console.log(`[${TAG}] 출처 → audit/g117-sources.json`);
await c.end();
