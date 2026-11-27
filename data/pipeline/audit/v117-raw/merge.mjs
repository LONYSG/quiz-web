// V117 merge — cNNN.out.json(판정) + bNN.out.json(블라인드) → data/pipeline/audit/v117-regrade.json (+ 요약 stdout)
// 묶음은 판정 · 블라인드가 둘 다 있고 검사를 통과해야 chunks 에 들어간다. 검사 실패는 stdout 에 "BAD" 로 나온다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnswer } from '../../../../shared/dist/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'v117-regrade.json');
const readJ = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const exists = (f) => fs.existsSync(f) && fs.statSync(f).size > 2;

// 블라인드 답 모으기
const blind = new Map();
for (const f of fs.readdirSync(HERE).filter((n) => /^b\d+\.out\.json$/.test(n))) {
  try { for (const r of readJ(path.join(HERE, f))) blind.set(r.key, String(r.answer ?? '').trim()); } catch (e) { console.log('BAD', f, e.message); }
}

const prev = exists(OUT) ? readJ(OUT) : { done: false, chunks: [], anchors: {}, cards: {} };
const names = fs.readdirSync(HERE).filter((n) => /^c\d{3}\.meta\.json$/.test(n)).map((n) => n.slice(0, 4)).sort();
const state = { done: false, chunks: [], anchors: {}, cards: {}, blindDone: [] };
const bad = [];
for (const name of names) {
  const of = path.join(HERE, name + '.out.json');
  if (!exists(of)) continue;
  const meta = readJ(path.join(HERE, name + '.meta.json'));
  let out;
  try { out = readJ(of); } catch (e) { bad.push([name, 'json ' + e.message]); continue; }
  const byKey = new Map(out.map((r) => [r.key, r]));
  const missing = meta.order.filter((k) => !byKey.has(k));
  if (out.length !== meta.order.length || missing.length) { bad.push([name, `개수 ${out.length}/${meta.order.length} 빠진 ${missing.slice(0, 5)}`]); continue; }
  let badRow = null;
  for (const r of out) {
    if (!Number.isInteger(r.grade) || r.grade < 1 || r.grade > 5 || ![1, 2, 3].includes(r.worth) || !r.kind) { badRow = r.key; break; }
  }
  if (badRow) { bad.push([name, '값 이상 ' + badRow]); continue; }
  const haveBlind = meta.cards.every((c) => blind.has(c.key));
  if (!haveBlind) { bad.push([name, '블라인드 없음']); continue; }
  // 눈금 맞춤
  const g = meta.anchors.filter((a) => a.kind === 'grade');
  const w = meta.anchors.filter((a) => a.kind === 'worth');
  const gIn = g.filter((a) => Math.abs(byKey.get(a.key).grade - a.gold) <= 1).length;
  const gEq = g.filter((a) => byKey.get(a.key).grade === a.gold).length;
  const wEq = w.filter((a) => byKey.get(a.key).worth === a.gold).length;
  state.anchors[name] = { grade: `${gIn}/${g.length}`, gradeSame: `${gEq}/${g.length}`, worth: `${wEq}/${w.length}`,
    detail: meta.anchors.map((a) => `${a.key}:${a.kind}:gold${a.gold}->${a.kind === 'grade' ? byKey.get(a.key).grade : byKey.get(a.key).worth}`) };
  for (const c of meta.cards) {
    const r = byKey.get(c.key);
    const given = blind.get(c.key);
    const accepted = [c.a, ...(c.variants ?? [])].map((x) => normalizeAnswer(x));
    const gn = normalizeAnswer(given);
    let bl = 'other';
    if (given && accepted.includes(gn)) bl = 'match';
    else if (given && gn.length >= 2 && accepted.some((x) => x.length >= 2 && (x.includes(gn) || gn.includes(x)))) bl = 'alias';
    const card = { grade: r.grade, gradeWhy: r.gradeWhy, worth: r.worth, worthKind: r.kind, worthWhy: r.worthWhy, blind: bl, blindAnswer: given, was: { grade: c.grade, worth: c.worth } };
    if (bl === 'alias') card.alsoAdd = [given];
    state.cards[String(c.id)] = card;
  }
  state.chunks.push(name);
}
fs.writeFileSync(OUT, JSON.stringify(state));
// 요약
const n = Object.keys(state.cards).length;
const dg = {}; // 지금 → 새
let up = 0, down = 0, same = 0;
const wd = {};
const bl = { match: 0, alias: 0, other: 0 };
for (const c of Object.values(state.cards)) {
  const k = `${c.was.grade}->${c.grade}`; dg[k] = (dg[k] ?? 0) + 1;
  if (c.grade > c.was.grade) up++; else if (c.grade < c.was.grade) down++; else same++;
  const wk = `${c.was.worth ?? 'null'}->${c.worth}`; wd[wk] = (wd[wk] ?? 0) + 1;
  bl[c.blind]++;
}
console.log(JSON.stringify({ chunksDone: state.chunks.length, cards: n, harder: up, easier: down, same, blind: bl, bad }));
console.log('anchors', JSON.stringify(Object.fromEntries(Object.entries(state.anchors).map(([k, v]) => [k, `g±1 ${v.grade} g= ${v.gradeSame} w ${v.worth}`]))));
