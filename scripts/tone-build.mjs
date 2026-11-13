#!/usr/bin/env node
// =============================================================================
// 카드 적용 되풀이 라운드(G065~) — 1/2: 실을 카드 고르기 + 게이트 + 적용 json + VERIFY 묶음 (파일만 쓴다 · DB 읽기만)
//   입력  web-desk/tone/받은것/카드-18.json · 카드-NNN.json(비어 있지 않은 것) · 원문 보낼것/조각-18.txt · 카드-NNN.txt
//         VERIFY 판정 data/pipeline/audit/v0NN-tone.json(lane claims | sample 만 — v052 · v053 은 옛 다듬기 판정이라 안 씀)
//         이미 실은 카드 = data/pipeline/tone/g0*-apply.json 의 items 중 src 가 '카드-' 로 시작하는 id
//   출력  data/pipeline/tone/<round>-plan.json(고른 카드 · 원문 · DB 사진 · 게이트 결과)
//         data/pipeline/tone/<round>-apply.json(정본 — 칸마다 before/after · tone-apply.mjs 가 읽음)
//         data/pipeline/audit/<round>-verify-targets.json(claims 없는 카드 무작위 30 · 구조전환 절반 이상)
//   사용  node scripts/tone-build.mjs --round g065 [--hold 123,456]   (--hold = GEN 이 게이트 경고를 읽고 뺀 id · 사유는 보고서)
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet, findAnswerInQuestion } from '../pipeline/lib/answer-rules.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const a = process.argv.slice(2);
const ROUND = (a[a.indexOf('--round') + 1] ?? '').toLowerCase();
if (!/^g0\d\d$/.test(ROUND) || !a.includes('--round')) { console.error('--round g0NN 필요'); process.exit(1); }
const HOLD = new Map((a.includes('--hold') ? a[a.indexOf('--hold') + 1].split(',') : []).filter(Boolean).map((x) => [Number(x.split(':')[0]), x.split(':')[1] ?? 'GEN 보류']));
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const L = (s) => [...(s ?? '')].length;
const IN = 'web-desk/tone/받은것', OUT = 'web-desk/tone/보낼것';
const F3 = [['question', 'question_text'], ['hint', 'general_hint'], ['explanation', 'explanation']];

// ── 이미 실은 카드
const applied = new Map();
for (const f of readdirSync(path.join(ROOT, 'data/pipeline/tone')).filter((f) => /^g0\d\d-apply\.json$/.test(f) && !f.startsWith(ROUND))) {
  for (const it of J(`data/pipeline/tone/${f}`).items ?? []) if (String(it.src ?? '').startsWith('카드-')) applied.set(it.id, f.slice(0, 4));
}
// ── VERIFY 판정(카드용)
const verdict = {};
for (const f of readdirSync(path.join(ROOT, 'data/pipeline/audit')).filter((f) => /^v0\d\d-tone\.json$/.test(f)).sort()) {
  const j = J(`data/pipeline/audit/${f}`);
  for (const [id, v] of Object.entries(j)) if (v && (v.lane === 'claims' || v.lane === 'sample')) (verdict[id] ??= []).push({ ...v, vfile: f });
}
// ── 원문 묶음
function packet(file) {
  const t = readFileSync(path.join(ROOT, OUT, file), 'utf8');
  const m = {}; let cur = null; const order = [];
  for (const line of t.split(/\r?\n/)) {
    const h = line.match(/^\[(\d+)\]/); if (h) { cur = { id: Number(h[1]) }; m[cur.id] = cur; order.push(cur.id); continue; }
    if (!cur) continue;
    const k = line.match(/^(질문|정답|힌트|해설|메모): ?(.*)$/);
    if (k) cur[{ 질문: 'question', 정답: 'answer', 힌트: 'hint', 해설: 'explanation', 메모: 'memo' }[k[1]]] = k[2];
  }
  return { m, order };
}
const files = [];
if (statSync(path.join(ROOT, IN, '카드-18.json')).size) files.push({ card: '카드-18', json: '카드-18.json', pk: '조각-18.txt' });
for (const f of readdirSync(path.join(ROOT, IN)).filter((f) => /^카드-\d{3}\.json$/.test(f)).sort()) {
  if (statSync(path.join(ROOT, IN, f)).size) files.push({ card: f.slice(0, -5), json: f, pk: f.replace('.json', '.txt') });
}

const pick = []; const report = { files: [], notReady: [], waitVerify: [], rejected: [], alreadyApplied: 0, skippedFile: [] };
for (const fl of files) {
  let res; try { res = J(`${IN}/${fl.json}`).results; } catch (e) { report.skippedFile.push({ file: fl.json, why: 'json 못 읽음 ' + e.message }); continue; }
  const pk = packet(fl.pk);
  const ids = res.map((r) => r.id);
  if (ids.length !== pk.order.length || ids.some((id) => !pk.m[id])) { report.skippedFile.push({ file: fl.json, why: `수 · id 가 원문과 다름 (${ids.length} / ${pk.order.length})` }); continue; }
  const row = { file: fl.card, cards: res.length, ready: 0, free: 0, claims: 0, claimsOk: 0, claimsFix: 0, wait: 0, reject: 0, already: 0, sampleFix: 0 };
  for (const r of res) {
    if (r.status !== 'ready') { report.notReady.push({ file: fl.card, id: r.id, status: r.status, note: r.note }); continue; }
    row.ready++;
    const hasClaims = (r.claims?.length ?? 0) > 0 || F3.some(([k]) => r[k]?.verdict === 'rebuild');
    const vs = verdict[r.id] ?? [];
    const vc = vs.filter((v) => v.lane === 'claims').at(-1); const vsamp = vs.filter((v) => v.lane === 'sample').at(-1);
    const it = { id: r.id, file: fl.card, src: fl.card, worth: r.worth, hasClaims, claims: r.claims ?? [], note: r.note ?? '', before: pk.m[r.id], fields: {} };
    for (const [k] of F3) { const c = r[k]; if (c && c.verdict !== 'keep') it.fields[k] = { kind: c.verdict, text: c.text, from: c.from }; }
    if (hasClaims) {
      row.claims++;
      if (!vc) { row.wait++; report.waitVerify.push({ file: fl.card, id: r.id }); continue; }
      if (vc.verdict === 'reject') { row.reject++; report.rejected.push({ file: fl.card, id: r.id, why: vc.why, vfile: vc.vfile }); continue; }
      if (vc.verdict === 'fix') { row.claimsFix++; for (const [k] of F3) if (vc.fixed?.[k]) it.fields[k] = { ...(it.fields[k] ?? { kind: 'rewrite' }), text: vc.fixed[k], fixedBy: vc.vfile }; it.src += ` + ${vc.vfile.slice(0, 4).toUpperCase()} fix`; }
      else if (vc.verdict === 'ok') row.claimsOk++; else { row.wait++; report.waitVerify.push({ file: fl.card, id: r.id, why: `판정 ${vc.verdict}` }); continue; }
    } else row.free++;
    if (vsamp?.verdict === 'fix') { for (const [k] of F3) if (vsamp.fixed?.[k]) it.fields[k] = { ...(it.fields[k] ?? { kind: 'rewrite' }), text: vsamp.fixed[k], fixedBy: vsamp.vfile }; it.src += ` + ${vsamp.vfile.slice(0, 4).toUpperCase()} sample fix`; it.sampleFix = true; row.sampleFix++; }
    if (applied.has(r.id) && !it.sampleFix) { row.already++; report.alreadyApplied++; continue; }
    if (vsamp?.verdict === 'reject' && applied.has(r.id)) report.rejected.push({ file: fl.card, id: r.id, why: 'sample reject(이미 실음 — 그대로 둠) ' + vsamp.why });
    pick.push(it);
  }
  report.files.push(row);
}

// ── DB 사진
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
const rows = (await c.query(`select q.id::int, q.is_active, q.inactive_reason, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
  from questions q where q.id = any($1::bigint[])`, [pick.map((x) => x.id)])).rows;
await c.end();
const D = Object.fromEntries(rows.map((r) => [r.id, r]));

// ── 게이트
const gate = { inactive: [], beforeDiff: [], newAnswer: [], hintBlock: [], over200: [], ending: [], empty: [], answerSet: [], warnExplainNew: [], warnQuestionNew: [], hold: [] };
const items = []; const cnt = { question: 0, hint: 0, explanation: 0, hintNew: 0 };
for (const it of pick) {
  const d = D[it.id]; const fail = [];
  if (!d) { gate.inactive.push({ id: it.id, why: '없음' }); continue; }
  if (!d.is_active) { gate.inactive.push({ id: it.id, why: d.inactive_reason }); continue; }
  // ⑤ before = 지금 DB 값 (원문 묶음의 질문 · 정답 · 힌트 · 해설)
  const bd = [['question', 'question_text'], ['answer', 'display_answer'], ['hint', 'general_hint'], ['explanation', 'explanation']].filter(([k, col]) => (it.before[k] ?? '') !== (d[col] ?? ''));
  if (bd.length && !it.sampleFix) { gate.beforeDiff.push({ id: it.id, cols: bd.map((x) => x[0]) }); continue; }
  const now = { question_text: d.question_text, general_hint: d.general_hint, explanation: d.explanation };
  for (const [k, col] of F3) if (it.fields[k]) now[col] = it.fields[k].text;
  const q = now.question_text, h = now.general_hint, e = now.explanation;
  const ans = [d.display_answer, ...d.variants];
  // ① 정답 · 변형 새로 듦
  for (const x of ans) if (findAnswerInQuestion(q, x) === 'word' && findAnswerInQuestion(d.question_text, x) !== 'word') fail.push(`질문에 정답 '${x}'`);
  const ckN = checkHint({ hint: h, answer: d.display_answer, variants: d.variants, question: q, explanation: e ?? '' });
  const ckO = checkHint({ hint: d.general_hint, answer: d.display_answer, variants: d.variants, question: d.question_text, explanation: d.explanation ?? '' });
  const oldB = new Set(ckO.block.map((b) => b.frag));
  const nb = ckN.block.filter((b) => !oldB.has(b.frag)); if (nb.length) fail.push(`힌트 막힘 ${nb.map((b) => b.frag).join('·')}`);
  const g = checkAnswerSet(q, d.display_answer, d.variants, normalizeAnswer); const go = checkAnswerSet(d.question_text, d.display_answer, d.variants, normalizeAnswer);
  if (g.blocked.length > go.blocked.length) fail.push(`정답 묶음 막힘 ${JSON.stringify(g.blocked)}`);
  // ② 200자 ③ ~까요? ⑥ 빔
  if (L(q) > 200) fail.push(`질문 ${L(q)}자`);
  if (it.fields.question && !/까요\?\s*$/.test(q)) fail.push('질문 끝이 ~까요? 아님');
  if (!h?.trim() || !e?.trim()) fail.push('힌트 · 해설 빔');
  // ④ 겹침 경고(새로 생긴 것만) — GEN 이 읽고 --hold 로 뺄지 정한다
  for (const kind of ['explain', 'question']) {
    const wn = ckN.warn.find((w) => w.kind === kind), wo = ckO.warn.find((w) => w.kind === kind);
    if (wn && !wo) gate[kind === 'explain' ? 'warnExplainNew' : 'warnQuestionNew'].push({ id: it.id, shared: wn.shared ?? wn.share, q, h, e });
  }
  if (HOLD.has(it.id)) fail.push(`GEN 보류: ${HOLD.get(it.id)}`);
  if (fail.length) {
    const key = fail[0].startsWith('질문에') ? 'newAnswer' : fail[0].startsWith('힌트 막힘') ? 'hintBlock' : fail[0].startsWith('정답 묶음') ? 'answerSet' : fail[0].startsWith('질문 2') || /^질문 \d+자/.test(fail[0]) ? 'over200' : fail[0].startsWith('질문 끝') ? 'ending' : fail[0].startsWith('힌트 · 해설') ? 'empty' : 'hold';
    gate[key].push({ id: it.id, file: it.file, fail }); continue;
  }
  const o = { id: it.id, answer: d.display_answer, src: it.src, file: it.file, worth: it.worth, hasClaims: it.hasClaims, from: it.fields.question?.from ?? '' };
  if (it.claims.length) o.claims = it.claims;
  for (const [k, col] of F3) {
    const f = it.fields[k]; if (!f || f.text === d[col]) continue;
    o[col] = { before: d[col], after: f.text, kind: f.kind, ...(f.fixedBy ? { fixedBy: f.fixedBy } : {}) };
    cnt[k]++; if (k === 'hint' && f.kind !== 'ending') cnt.hintNew++;
  }
  if (o.question_text || o.general_hint || o.explanation) items.push(o);
}
const R = ROUND.toUpperCase();
// ── F 이모지 숫자 손질(emoji-number-fix.json 의 round 가 이번 라운드일 때만 합친다)
const EMO = path.join(ROOT, 'data/pipeline/tone/emoji-number-fix.json');
const emo = existsSync(EMO) ? J('data/pipeline/tone/emoji-number-fix.json') : null;
const emoMine = emo?.round === R;
if (emoMine) items.push(...emo.items);
const counts = { picked: pick.length, items: items.length, ...cnt, emoji: emoMine ? emo.items.length : 0, emojiOff: emoMine ? emo.deactivate.length : 0, drop_candidate: items.filter((x) => x.worth === 'drop_candidate').map((x) => x.id) };
writeFileSync(path.join(ROOT, `data/pipeline/tone/${ROUND}-plan.json`), JSON.stringify({ round: R, db, report, gate, hold: Object.fromEntries(HOLD), dbRows: D }, null, 1) + '\n');
writeFileSync(path.join(ROOT, `data/pipeline/tone/${ROUND}-apply.json`), JSON.stringify({ round: R, db_snapshot: db, note: '카드 적용 — 질문 · 힌트 · 해설(카드 통째)' + (emoMine ? ' + 이모지 숫자 손질' : ''), counts, items, deactivate: emoMine ? emo.deactivate : [] }, null, 1) + '\n');

// ── VERIFY 묶음: claims 없는 카드 무작위 30(파일마다 고루 · 구조전환 절반 이상)
let seed = Number(ROUND.slice(1)); const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const free = items.filter((x) => String(x.src).startsWith('카드-') && !x.hasClaims && !String(x.src).includes('fix'));
const N = Math.min(30, free.length); const byFile = {};
for (const x of free) (byFile[x.file] ??= { s: [], o: [] })[x.from.startsWith('구조전환') ? 's' : 'o'].push(x);
const tp = []; const fk = Object.keys(byFile);
const take = (arr) => arr.splice(Math.floor(rnd() * arr.length), 1)[0];
const wantS = Math.ceil(N / 2);
for (let i = 0; tp.filter((x) => x.from.startsWith('구조전환')).length < wantS && fk.some((f) => byFile[f].s.length); i++) { const f = fk[i % fk.length]; if (byFile[f].s.length) tp.push(take(byFile[f].s)); }
for (let i = 0; tp.length < N; i++) { const f = fk[i % fk.length]; const b = byFile[f]; if (b.o.length || b.s.length) tp.push(take(b.o.length && (rnd() < 0.6 || !b.s.length) ? b.o : b.s)); }
const targets = tp.map((o) => ({ id: o.id, file: o.file, answer: o.answer, from: o.from, check: ['sample — 블라인드 · 옮기면서 사실이 달라졌나 · §0 · §1'], question: o.question_text, hint: o.general_hint, explanation: o.explanation }));
if (emoMine) {
  for (const o of emo.items) targets.push({ id: o.id, file: 'emoji-number', answer: o.answer, from: '', check: ['emoji — 블라인드 추측(줄만 보고) · 그 작품 하나로 모이나 · 숫자 이모지 0 · 같은 분야 다른 줄과 겹침 · 설명이 이모지와 맞나'], question: o.question_text, explanation: o.explanation });
  for (const o of emo.deactivate) targets.push({ id: o.id, file: 'emoji-number', answer: o.answer, from: '', check: ['emoji 비활성 — 끈 이유가 맞나(살릴 줄이 있으면 why 에 제안)'], question: { before: o.name }, why: o.why });
}
writeFileSync(path.join(ROOT, `data/pipeline/audit/${ROUND}-verify-targets.json`), JSON.stringify({ round: R, note: 'claims 없는 카드 표본(무작위 · 구조전환 절반 이상) — lane: sample', targets }, null, 1) + '\n');

console.log(db, 'files', JSON.stringify(report.files));
console.log('skippedFile', JSON.stringify(report.skippedFile), 'notReady', report.notReady.length, 'waitVerify', report.waitVerify.length, 'rejected', report.rejected.length, 'already', report.alreadyApplied);
console.log('gate', JSON.stringify(Object.fromEntries(Object.entries(gate).map(([k, v]) => [k, v.length]))));
for (const k of ['inactive', 'beforeDiff', 'newAnswer', 'hintBlock', 'answerSet', 'over200', 'ending', 'empty', 'hold']) for (const x of gate[k]) console.log(' ', k, JSON.stringify(x));
console.log('counts', JSON.stringify(counts), 'verify targets', targets.length, '(구조전환', targets.filter((x) => x.from.startsWith('구조전환')).length + ')');
