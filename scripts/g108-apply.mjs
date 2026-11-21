#!/usr/bin/env node
// =============================================================================
// G108 — 새 카드 싣기 (G107 재료 → gpt 카드 → V109 사실 확인 → gpt 고침 → 이 스크립트)
//   카드 = web-desk/tone/받은것/새카드-01~15.json 의 status ready 가운데
//          V109(data/pipeline/audit/v109-newcards.json) ok → 그 카드 그대로 · fix → 받은것/새카드-고침.json 의 카드(drop 은 싣지 않음)
//   ★ 카드 글(question · hint · explanation)은 한 글자도 고치지 않는다 — 게이트에 걸리면 싣지 않고 계획 파일에 적는다
//   문항: short_answer · 글 = 카드 그대로 · difficulty_score = 카드 grade · 분류 = 재료 major > mid 의 소분류(GEN 이 고름 — audit/g108-raw/leaf.txt)
//         정답 = 카드 answer → display_answer · 주 답 줄 · hint_answer 셋이 같게 · 인정어 = 카드 also + V109 alsoAdd
//         상태 approved · 활성 · general_hint_version card-v1 · score_version card-new-v1 · worth = null(판정 전 — 서버는 2 로 친다)
//         source_id seed-gen · source_ref '<중분류키>/<소분류번호>#g108-<key>' (라운드 꼬리표 = #g108-)
//         검수 기록 review_queue = V109 판정(verdict · 블라인드 · 둘째 문서) · 출처 = audit/g108-sources.json (재료 core · story · hintIdea 주소 + V109 둘째 문서 · 문항 id)
//   게이트(걸리면 그 카드 싣지 않음): ① 정답 겹침(DB 활성 + 꺼진 문항의 정답 · 인정어 / 이번 묶음 안 · normalizeAnswer + 기호 뺌 · 숫자 정답은 예외 D9)
//          ② 질문에 정답 · 인정어가 낱말로(checkAnswerSet blocked) ③ 힌트 막힘(checkHint) ④ 빈칸 · 길이(question-checks) · 200자 · ~까요? · 질문 형태(formHit)
//          ⑤ 힌트 · 해설 빔 · 등급 3~5 인데 힌트 없음(H0) ⑥ 설계 보류(n0814 정답 표기 갈림)
//   인정어 줄만 빼는 것: 다른 문항의 정답 · 인정어와 겹침 · checkAnswerSet dropped(latin B4 · hanja · kana · redundant)
//   사용 node scripts/g108-apply.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만 · 계획 audit/g108-plan-<db>.json)
//   ★ 멱등: 이미 실린 key(source_ref)는 건너뛴다 — 다시 돌려도 안전 · --undo = 이번 꼬리표 문항을 걷는다(판에 쓰인 문항은 지우지 않고 끈다)
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

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const db = url.pathname.slice(1);
const TAG = 'G108';
const MARK = '#g108-';
const AUD = (f) => path.join(ROOT, 'data/pipeline/audit', f);
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const key = (s) => normalizeAnswer(s).replace(/[^\p{L}\p{N}]/gu, '');
const L = (s) => [...(s ?? '')].length;
const HOLD = new Map([['n0814', '정답 표기 갈림 — 해설의 래퍼 이름 카드 "도이치" ↔ 재료 "도치"(V109 5절 · 설계가 정한다)']]);
const PARTIAL = new Set(['n0027', 'n0110', 'n0209']); // V109 second 부분 일치 — 싣되 표시(다시 판정하지 않는다)
// 넓은 말 · 다른 개념(찬종 2026-11-19 "같은 개념만 같은 말만") — 그 인정어 줄만 뺀다 · GEN 판단(되돌리기 쉽다)
const BROAD = new Map(Object.entries({
  n0121: ['도로 표지병', '반사 표지병'], n0205: ['성 니콜라스', '성 니콜라우스'], n0308: ['병목 현상'], n0413: ['비뚤어진 인센티브'],
  n0420: ['베블런재'], n0510: ['환상통', '환지통', '환상지통'], n0514: ['전식'], n0527: ['독극물 스티커'], n1003: ['연필심'],
  n1007: ['후드집업'], n1111: ['마녀'], n1208: ['당구장'], n1210: ['접합유리', '강화유리'],
}));
// B10(기준서 — 원제 · 상표가 영어인 작품 · 제품의 영문 표기는 인정어로 둔다) · GEN 판단: 영어가 공식 원제 · 상표인 것만(일본 · 한국 · 폴란드 원제 작품은 넣지 않음)
const B10 = new Map(Object.entries({
  n0104: ['Spam'], n0702: ['Undertale'], n0703: ['Hollow Knight'], n0704: ['Dota 2'], n0707: ['Roblox'], n0711: ['Pokémon GO', 'Pokemon GO'],
  n0712: ['Steam'], n0713: ['Twitch'], n0715: ['Nintendo DS'], n0722: ['Stardew Valley'], n0816: ["Rollin'", 'Rollin'],
  n0901: ['Moonlight'], n0902: ['The Blair Witch Project'], n0903: ['Get Out'], n0907: ['Once'], n0908: ['Birdman'], n0909: ['The Social Network'],
  n0910: ['12 Years a Slave', 'Twelve Years a Slave'], n0911: ['The Revenant'], n0913: ['Everything Everywhere All at Once'], n0914: ['Dunkirk'],
  n1402: ['Portal'], n1404: ['Terraria'], n1406: ['Tomb Raider'], n1407: ['Dark Souls'], n1408: ['Apex Legends'], n1409: ["Baldur's Gate 3"],
  n1410: ['God of War'], n1413: ['Cuphead'], n1414: ['Red Dead Redemption 2'], n1416: ['Sekiro: Shadows Die Twice'], n1417: ['The Last of Us'], n1419: ['Death Stranding'],
}));

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
    if (r.used) { off += (await c.query(`update questions set is_active=false, inactive_reason='g108_undo', updated_at=now() where id=$1`, [r.id])).rowCount; continue; }
    del += (await c.query('delete from questions where id=$1', [r.id])).rowCount; // 정답 · 검수 기록 · 경험은 cascade
  }
  await c.query('commit');
  console.log(`[${TAG} undo] 지움 ${del} · 판에 쓰여 끔 ${off}`);
  await c.end(); process.exit(0);
}

// ── 카드 모으기 ───────────────────────────────────────────────────────────────
const mat = new Map(), card = new Map();
for (let i = 1; i <= 15; i++) {
  const n = String(i).padStart(2, '0');
  const m = J(`web-desk/tone/보낼것/새재료-${n}.json`); if (m.done !== true) throw new Error(`새재료-${n} done 아님`);
  for (const x of m.items) mat.set(x.key, { ...x, chunk: n });
  const cd = J(`web-desk/tone/받은것/새카드-${n}.json`); if (cd.done !== true) throw new Error(`새카드-${n} done 아님`);
  for (const x of cd.cards) card.set(x.key, { ...x, chunk: n });
}
const V = J('data/pipeline/audit/v109-newcards.json'); if (V.done !== true) throw new Error('V109 done 아님');
const ver = new Map(V.results.map((r) => [r.key, r]));
const fixPath = 'web-desk/tone/받은것/새카드-고침.json';
const FIX = existsSync(path.join(ROOT, fixPath)) ? J(fixPath) : null;
const fixed = FIX?.done === true ? new Map(FIX.cards.map((x) => [x.key, x])) : null;

const tree = (await c.query(`select c.id::int, c.key, c.name_ko, c.parent_id::int, c.level from categories c`)).rows;
const byId = new Map(tree.map((r) => [r.id, r]));
const midOf = new Map(tree.filter((r) => r.level === 2).map((r) => [`${byId.get(r.parent_id).name_ko}>${r.name_ko}`, r]));
const leafByKey = new Map(tree.filter((r) => r.level === 3).map((r) => [r.key, r]));
const LEAF = new Map(readFileSync(AUD('g108-raw/leaf.txt'), 'utf8').split(/\r?\n/).filter((l) => /^n\d{4} /.test(l)).map((l) => { const [k, n, q] = l.split(/\s+/); return [k, { n: Number(n), odd: q === '?' }]; }));

const out = { round: TAG, db, at: new Date().toISOString(), counts: {}, load: [], already: [], notLoaded: [], fixWait: [], drop: [], need: [], dupOff: [], variantCut: [], partial: [], leafOdd: [], warn: { assert: [], frag: [], hintWarn: [], substring: [] } };
const todo = [];
for (const [k, cd] of card) {
  if (cd.status !== 'ready') { out.need.push({ key: k, answer: cd.answer }); continue; }
  const r = ver.get(k); if (!r) throw new Error(`V109 에 없음 ${k}`);
  let use = cd, from = `새카드-${cd.chunk}`;
  if (r.verdict === 'fix') {
    if (!fixed) { out.fixWait.push({ key: k, answer: cd.answer }); continue; }
    const f = fixed.get(k); if (!f) throw new Error(`고침본에 없음 ${k}`);
    if (f.status === 'drop') { out.drop.push({ key: k, answer: cd.answer, why: f.note }); continue; }
    if (f.status !== 'ready') throw new Error(`고침본 status ${f.status} ${k}`);
    use = { ...cd, ...f }; from = '새카드-고침';
  } else if (r.verdict !== 'ok') { out.notLoaded.push({ key: k, answer: cd.answer, why: `V109 ${r.verdict}` }); continue; }
  todo.push({ key: k, from, card: use, mat: mat.get(k), ver: r });
}

// ── DB 의 정답 열쇠(활성 + 꺼진 · 정답 + 인정어) ───────────────────────────────
const Q = (await c.query(`select id::int, is_active, inactive_reason, display_answer, source_ref from questions`)).rows;
const QA = (await c.query(`select question_id::int qid, answer_text from question_answers`)).rows;
const qById = new Map(Q.map((q) => [q.id, q]));
const OWN = new Map(); // 열쇠 → Set(id)
const own = (s, id) => { const kk = key(s); if (!kk) return; if (!OWN.has(kk)) OWN.set(kk, new Set()); OWN.get(kk).add(id); };
const loadedRef = new Map();
for (const q of Q) { if (q.source_ref?.includes(MARK)) { loadedRef.set(q.source_ref.split(MARK)[1], q.id); continue; } own(q.display_answer, q.id); }
for (const r of QA) if (!qById.get(r.qid)?.source_ref?.includes(MARK)) own(r.answer_text, r.qid);
const isNum = (s) => /^[\d\s.,]+$/.test(s);
const who = (ids) => [...ids].map((id) => { const q = qById.get(id); return `#${id} ${q.display_answer}${q.is_active ? '' : `(꺼짐 ${q.inactive_reason ?? ''})`}`; }).join(' · ');

// 이번 묶음 안 겹침(정답끼리 · 정답 ↔ 인정어)
const BATCH = new Map();
for (const t of todo) for (const s of [t.card.answer, ...(t.card.also ?? []), ...(t.ver.alsoAdd ?? [])]) { const kk = key(s); if (!BATCH.has(kk)) BATCH.set(kk, new Set()); BATCH.get(kk).add(t.key); }

const plan = [];
for (const t of todo) {
  const { card: cd, mat: m, ver: r } = t;
  const fail = [];
  const ans = cd.answer;
  const q = cd.question, h = cd.hint ?? '', e = cd.explanation ?? '';
  if (HOLD.has(t.key)) fail.push(`설계 보류: ${HOLD.get(t.key)}`);
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
  const fh = formHit(q); if (fh) fail.push(`④ 질문 형태(~는, ~은) '${fh}'`);
  if (!(cd.grade >= 1 && cd.grade <= 5)) fail.push(`등급 ${cd.grade}`);
  for (const tx of [q, e]) for (const aw of assertiveWords(tx)) out.warn.assert.push({ key: t.key, words: aw.words.join('·'), sentence: aw.sentence.slice(0, 70) });
  const fr = answerFragments(q, ans); if (fr.length) out.warn.frag.push({ key: t.key, answer: ans, frags: fr.map((x) => x.frag).join(',') });
  if (cut.length) out.variantCut.push({ key: t.key, answer: ans, cut });
  if (fail.length) { out.notLoaded.push({ key: t.key, answer: ans, why: fail.join(' / ') }); continue; }
  const already = loadedRef.get(t.key) ?? null; // 이미 실린 key — 계획 목록에는 남기고 쓰지 않는다(멱등)
  if (already) out.already.push({ key: t.key, id: already });
  if (PARTIAL.has(t.key)) out.partial.push({ key: t.key, answer: ans, note: r.second?.note ?? r.why ?? '' });
  if (lf.odd) out.leafOdd.push({ key: t.key, answer: ans, cat: `${m.major} > ${m.mid} > ${leaf.name_ko}` });
  const ref = `${mid.key.slice(3)}/${lf.n}${MARK}${t.key}`;
  plan.push({ key: t.key, already, ref, from: t.from, chunk: t.mat.chunk, answer: ans, variants, grade: cd.grade, gradeGuess: m.gradeGuess, leafId: leaf.id, cat: `${m.major} > ${m.mid} > ${leaf.name_ko}`, question: q, hint: h, explanation: e, ver: r, mat: m });
}
out.load = plan.map((p) => ({ key: p.key, id: p.already ?? undefined, answer: p.answer, grade: p.grade, cat: p.cat, from: p.from, variants: p.variants }));
out.counts = { cards: card.size, ready: [...card.values()].filter((x) => x.status === 'ready').length, need: out.need.length, v109: { ok: V.results.filter((r) => r.verdict === 'ok').length, fix: V.results.filter((r) => r.verdict === 'fix').length }, fixFile: fixed ? 'done' : (FIX ? 'not-done' : 'none'), drop: out.drop.length, fixWait: out.fixWait.length, planned: plan.length, toWrite: plan.filter((p) => !p.already).length, already: out.already.length, notLoaded: out.notLoaded.length, variantRows: plan.reduce((s, p) => s + p.variants.length, 0), variantCut: out.variantCut.reduce((s, x) => s + x.cut.length, 0) };
writeFileSync(AUD(`g108-plan-${db}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(`[${TAG}] ${JSON.stringify(out.counts)} → audit/g108-plan-${db}.json`);
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
      [p.question, p.answer, p.leafId, band(p.grade), p.explanation, p.ref, p.grade, `gpt 카드 등급 ${p.grade}(재료 어림 ${p.gradeGuess}) — G108`, p.hint])).rows[0].id;
    ids[p.key] = id;
    await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,true,$4)`, [id, p.answer, normalizeAnswer(p.answer), `${TAG} 정답`]);
    for (const v of p.variants) await c.query(`insert into question_answers (question_id, answer_text, answer_norm, is_primary, note) values ($1,$2,$3,false,$4) on conflict do nothing`,
      [id, v, normalizeAnswer(v), (B10.get(p.key) ?? []).includes(v) ? 'B10 원제·상표 영문 표기 (G108)' : (r.alsoAdd ?? []).includes(v) ? `${TAG} 인정어(V109 alsoAdd)` : `${TAG} 인정어`]);
    await c.query(`insert into review_queue (question_id, ai_model, ai_confidence, ai_flags, backcheck_answer, backcheck_result, rule_flags, reviewer_note, reviewed_at)
       values ($1,$2,null,$3,$4,$5,$6,$7, now()) on conflict (question_id) do nothing`,
      [id, 'gpt(Codex) 카드 · Claude V109 사실 확인',
        JSON.stringify({ v109: { verdict: r.verdict, blind: r.blind, second: r.second, why: r.why, claims: (r.claims ?? []).length, alsoAdd: r.alsoAdd ?? [] }, from: p.from, material: `새재료-${p.chunk}`, key: p.key }),
        r.blind ?? null, r.blind === '정답' ? 'pass' : (r.alsoAdd ?? []).includes(r.blind) ? 'ambiguous' : 'mismatch', // 블라인드: 정답 = pass · 표기만 다름(alsoAdd 로 받음) = ambiguous · 다른 답(fix 로 고침) = mismatch
        JSON.stringify({ round: 'g108', partialSecond: PARTIAL.has(p.key) || undefined }),
        `G108 새 카드 ${p.key} · 재료 G107 새재료-${p.chunk} · 카드 ${p.from} · 사실 확인 V109 ${r.verdict}${r.verdict === 'fix' ? ' → 새카드-고침' : ''}`]);
  }
  await c.query('commit');
} catch (err) { await c.query('rollback'); console.error(`★ 되돌렸다 — ${err.message}`); await c.end(); process.exit(1); }
console.log(`[${TAG}] 썼다 — 문항 ${W.length} · 인정어 ${W.reduce((s, p) => s + p.variants.length, 0)} · ${at}`);

// 출처(문항의 출처 칸 — 카드 다시 쓰기 때처럼 파일) · 두 DB 의 id 를 함께 둔다
const SRC = AUD('g108-sources.json');
const src = existsSync(SRC) ? JSON.parse(readFileSync(SRC, 'utf8')) : { round: TAG, note: '새 카드 출처 — 재료(G107)의 core · story · hintIdea 와 V109 둘째 문서 · ids = DB 별 문항 id', items: {} };
for (const p of W) {
  const m = p.mat;
  const it = (src.items[p.key] ??= { answer: p.answer, ids: {}, core: m.core, story: m.story, hintIdea: m.hintIdea ?? null, second: p.ver.second ?? null });
  it.ids[db] = ids[p.key];
  it.urls = [...new Set([m.core?.url, ...(m.story ?? []).map((s) => s.url), m.hintIdea?.url, p.ver.second?.url].filter(Boolean))];
}
writeFileSync(SRC, JSON.stringify(src, null, 1) + '\n');
console.log(`[${TAG}] 출처 → audit/g108-sources.json`);
await c.end();
