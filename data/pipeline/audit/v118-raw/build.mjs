// V118 build — DB(읽기만) + 카드 파일 + 재료 + 재료 판정 → targets.json · uNNN.txt(판정 입력) · uNNN.meta.json · bNNN.txt(블라인드만)
// 실행: node data/pipeline/audit/v118-raw/build.mjs   (이미 있는 묶음 파일은 덮어쓰지 않는다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const A = 'data/pipeline/audit/', P = 'data/pipeline/tone/', T = 'web-desk/tone/';
const UNIT = 50;
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const ls = (d, re) => fs.readdirSync(d).filter((f) => re.test(f)).sort();
const trunc = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
const cats = new Map((await db.query('select id,name_ko,parent_id from categories')).rows.map((r) => [r.id, r]));
const catPath = (id) => { const o = []; let c = cats.get(id); while (c) { o.unshift(c.name_ko); c = c.parent_id ? cats.get(c.parent_id) : null; } return o.join(' > '); };
const EMO = /[\u{1F300}-\u{1FAFF}☀-➿]/u;

async function loadCards(where, params = []) {
  const qs = (await db.query(`select id,question_text,display_answer,general_hint,explanation,category_id,difficulty_score from questions where ${where}`, params)).rows;
  const ids = qs.map((q) => q.id);
  const an = (await db.query('select question_id,answer_text,is_primary from question_answers where question_id = any($1) order by is_primary desc, id', [ids])).rows;
  const by = new Map();
  for (const a of an) { if (!by.has(a.question_id)) by.set(a.question_id, []); by.get(a.question_id).push(a); }
  return qs.map((q) => {
    const list = by.get(q.id) ?? [];
    const prim = list.find((a) => a.is_primary)?.answer_text ?? q.display_answer;
    const variants = [...new Set(list.map((a) => a.answer_text).filter((t) => t !== prim && t !== q.display_answer))];
    return { id: q.id, cat: catPath(q.category_id), q: q.question_text, a: q.display_answer, variants, hint: q.general_hint, exp: q.explanation, grade: q.difficulty_score };
  });
}

// ── 기록 모으기 ──
const applied = new Map();
for (const f of ls(P, /^g0\d+-apply\.json$/)) { const j = read(P + f); for (const it of (j && j.items) || []) if (String(it.src || it.file || '').startsWith('카드-')) applied.set(String(it.id), String(it.file || it.src).replace('.json', '').split(' ')[0]); }
const prior = new Map(); // id → {verdict, why, fixed, file}
for (const f of ls(A, /^v\d+-tone\.json$/)) { const j = read(A + f); if (j) for (const [k, v] of Object.entries(j)) if (v && v.verdict && String(v.file || '').startsWith('카드-')) prior.set(String(v.id ?? k), { verdict: v.verdict, why: v.why, fixed: v.fixed, file: String(v.file).replace('.json', ''), round: v.round }); }
const regrade = read(A + 'v117-regrade.json');
const blindOf = (id) => regrade.cards[String(id)];

// ── 목록(얼림) ──
const TF = path.join(HERE, 'targets.json');
let tg;
if (fs.existsSync(TF)) tg = read(TF);
else {
  const all = await loadCards("status='approved' and is_active");
  const target = [], blindOnly = [];
  let alreadySeen = 0, emojiN = 0;
  for (const c of all) {
    const id = String(c.id);
    const emoji = EMO.test(c.q);
    const bl = blindOf(id);
    const isOther = bl && bl.blind === 'other';
    if (applied.has(id)) {
      if (prior.has(id)) { alreadySeen++; if (isOther && !emoji) blindOnly.push({ ...c, blindAnswer: bl.blindAnswer, why: 'seen' }); continue; }
      if (emoji) emojiN++;
      target.push({ ...c, file: applied.get(id), emoji, blindAnswer: isOther && !emoji ? bl.blindAnswer : null });
    } else if (isOther && !emoji) blindOnly.push({ ...c, blindAnswer: bl.blindAnswer, why: 'notRewritten' });
  }
  target.sort((x, y) => (x.grade ?? 9) - (y.grade ?? 9) || x.id - y.id);
  blindOnly.sort((x, y) => (x.grade ?? 9) - (y.grade ?? 9) || x.id - y.id);
  tg = { target, blindOnly, counts: { active: all.length, rewritten: all.filter((c) => applied.has(String(c.id))).length, alreadySeen, emojiN } };
  fs.writeFileSync(TF, JSON.stringify(tg));
}

// ── 재료 · 판정 ──
const chunkOf = (file) => file.replace('카드-', '');
const matCache = new Map(), judgeCache = new Map(), cardFileCache = new Map();
const materialOf = (n) => { if (!matCache.has(n)) matCache.set(n, read(`${T}보낼것/재료-${n}.json`)); return matCache.get(n); };
const cardFileOf = (n) => { if (!cardFileCache.has(n)) cardFileCache.set(n, read(`${T}받은것/카드-${n}.json`)); return cardFileCache.get(n); };
const judgeOf = (n) => {
  if (judgeCache.has(n)) return judgeCache.get(n);
  const m = new Map();
  for (const f of ls(A, /^v\d+-material(-\d+)?\.json$/)) { const j = read(A + f); if (j && String(j.chunk) === n) for (const x of j.facts || []) m.set(x.ref, { ...x, round: j.round }); }
  judgeCache.set(n, m); return m;
};

function materialText(c, n) {
  const mat = materialOf(n);
  const item = mat && mat.items.find((i) => String(i.id) === String(c.id));
  const L = [];
  if (!item) {
    const cf = cardFileOf(n); const r = cf && cf.results.find((x) => String(x.id) === String(c.id));
    L.push('-- 재료: 이 묶음엔 재료 파일이 없다(옛 묶음) — 카드 파일이 적은 claims(근거 주장 + 출처)와 메모만 있다 --');
    if (r) { for (const cl of r.claims || []) L.push(` · claim: ${cl.text}${cl.url ? ' (' + cl.url + ')' : ''}`); if (r.note) L.push(` · 메모: ${trunc(r.note, 300)}`); }
    else L.push(' · (카드 파일에서도 못 찾음)');
    return L.join('\n');
  }
  const J = judgeOf(n);
  L.push('-- 재료 (재료 판정 반영) --');
  if (item.core) L.push(`핵심: ${item.core}`);
  for (const f of item.facts) {
    const j = J.get(f.fact_id);
    let line = ` · ${f.fact_id.split('-')[1]} [${f.where}] ${f.check}: ${f.text}`;
    if (f.fixed) line += `\n     → 고친 값: ${f.fixed}${j ? ` (판정 ${j.verdict}${j.verdict === 'fix' && j.fixed ? ' → ' + j.fixed : ''})` : ''}`;
    else if (j && j.verdict === 'fix') line += `\n     → 판정 fix: ${j.fixed ?? ''}`;
    if (f.quote) line += `\n     인용: ${trunc(f.quote, 150)}`;
    L.push(line);
  }
  for (const e of item.extra || []) {
    const j = J.get(e.extra_id);
    L.push(` · ${e.extra_id.split('-')[1]} [extra] ${e.text}${j && j.verdict === 'fix' ? `\n     → 판정 fix: ${j.fixed ?? ''}` : ''}\n     인용: ${trunc(e.quote, 150)}`);
  }
  if (item.note) L.push(`재료 메모: ${trunc(item.note, 200)}`);
  return L.join('\n');
}

const answerLine = (c) => `정답: ${c.a}${c.variants?.length ? '  (인정 답: ' + c.variants.join(' / ') + ')' : ''}`;
function block(key, c, mat, extra) {
  return [`### ${key}`, `분야: ${c.cat}`, `질문: ${c.q}`, answerLine(c), `힌트: ${c.hint ?? '(없음)'}`, `해설: ${c.exp ?? '(없음)'}`,
    ...(extra ? [extra] : []), mat, ''].join('\n');
}

// 앵커(눈금) — 앞 판 판정이 있는 카드(카드 파일의 글 · 판정 그대로)
const cardFileText = (id, file) => {
  const n = chunkOf(file); const cf = cardFileOf(n); const r = cf && cf.results.find((x) => String(x.id) === String(id));
  if (!r || r.status !== 'ready') return null;
  return { q: r.question.text, hint: r.hint.text, exp: r.explanation.text };
};
const anchors = { ok: [], fix: [] };
{
  const dbmap = new Map((await loadCards('id = any($1)', [[...prior.keys()].map(Number)])).map((c) => [String(c.id), c]));
  for (const [id, p] of prior) {
    if (!applied.has(id) || !dbmap.has(id)) continue;
    const t = cardFileText(id, p.file); if (!t || !t.q) continue;
    const mat = materialOf(chunkOf(p.file)); if (!mat) continue;
    const cat = p.verdict === 'ok' ? 'ok' : p.verdict === 'fix' && p.why && p.fixed ? 'fix' : null;
    if (!cat) continue;
    anchors[cat].push({ id, file: p.file, verdict: p.verdict, why: p.why, fixed: p.fixed, card: { ...dbmap.get(id), q: t.q, hint: t.hint, exp: t.exp } });
  }
  for (const k of ['ok', 'fix']) anchors[k].sort((a, b) => a.id - b.id);
  console.log('anchor pool', anchors.ok.length, anchors.fix.length);
}

function writeUnit(name, cards, kind) {
  const f = path.join(HERE, name + '.txt');
  if (fs.existsSync(f)) return false;
  const idx = parseInt(name.slice(1), 10) - 1;
  const items = cards.map((c, j) => ({ key: `${name}-${String(j + 1).padStart(3, '0')}`, id: c.id, card: c }));
  const blocks = [], order = [], anchorMeta = [];
  let merged = items.map((it) => ({ ...it, anchor: false }));
  if (kind === 'u') {
    const nOk = idx % 2 === 0 ? 2 : 1, nFix = idx % 2 === 0 ? 1 : 2;
    const pick = (arr, n, off) => Array.from({ length: n }, (_, k) => arr[(off + k * 37) % arr.length]);
    const as = [...pick(anchors.ok, nOk, idx * 7).map((a) => ({ ...a, kind: 'ok' })), ...pick(anchors.fix, nFix, idx * 5).map((a) => ({ ...a, kind: 'fix' }))];
    as.forEach((a, k) => {
      const key = `${name}-g${k + 1}`;
      merged.splice(Math.min(merged.length, (k * 13 + (idx % 7) * 3 + 5) % (merged.length + 1)), 0, { key, id: a.id, card: a.card, anchor: true, file: a.file });
      anchorMeta.push({ key, id: a.id, kind: a.kind, gold: a.verdict, why: a.why, fixed: a.fixed });
    });
  }
  for (const m of merged) {
    if (kind === 'u') {
      const fileN = chunkOf(m.anchor ? m.file : m.card.file);
      let extra = null;
      if (!m.anchor && m.card.emoji) extra = '※ 이모지 문제 — 재료 대조만(블라인드 갈래는 안 본다)';
      else if (!m.anchor && m.card.blindAnswer) extra = `블라인드 답(질문만 보고 푼 사람): ${m.card.blindAnswer}`;
      blocks.push(block(m.key, m.card, materialText(m.card, fileN), extra));
    } else {
      blocks.push([`### ${m.key}`, `분야: ${m.card.cat}`, `질문: ${m.card.q}`, answerLine(m.card), `블라인드 답(질문만 보고 푼 사람): ${m.card.blindAnswer}`, ''].join('\n'));
    }
    order.push(m.key);
  }
  const head = kind === 'u' ? `## V118 ${name} (${merged.length}건)\n\n` : `## V118 ${name} 블라인드 갈래만 (${merged.length}건 — 재료 대조 없음)\n\n`;
  fs.writeFileSync(f, head + blocks.join('\n'));
  fs.writeFileSync(path.join(HERE, name + '.meta.json'), JSON.stringify({
    name, kind, order,
    cards: items.map((it) => ({ key: it.key, id: it.id, a: it.card.a, variants: it.card.variants, file: it.card.file ?? null, emoji: !!it.card.emoji, blindAnswer: it.card.blindAnswer ?? null, grade: it.card.grade })),
    anchors: anchorMeta,
  }));
  return true;
}
let made = 0;
const nU = Math.ceil(tg.target.length / UNIT);
for (let i = 0; i < nU; i++) if (writeUnit('u' + String(i + 1).padStart(3, '0'), tg.target.slice(i * UNIT, (i + 1) * UNIT), 'u')) made++;
const nB = Math.ceil(tg.blindOnly.length / 100);
for (let i = 0; i < nB; i++) if (writeUnit('b' + String(i + 1).padStart(3, '0'), tg.blindOnly.slice(i * 100, (i + 1) * 100), 'b')) made++;
console.log(JSON.stringify({ ...tg.counts, target: tg.target.length, blindOnly: tg.blindOnly.length, units: nU, blindUnits: nB, made }));
await db.end();
