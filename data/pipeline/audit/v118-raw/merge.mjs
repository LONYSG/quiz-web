// V118 merge — uNNN.out.json · bNNN.out.json + meta → data/pipeline/audit/v118-cards.json (+ 요약 stdout)
// 검사를 통과한 묶음만 chunks 에 들어간다. 실패는 "BAD" 로 나온다. done 은 모든 묶음이 통과했을 때만 true.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'v118-cards.json');
const readJ = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const exists = (f) => fs.existsSync(f) && fs.statSync(f).size > 2;
const names = fs.readdirSync(HERE).filter((n) => /^[ub]\d{3}\.meta\.json$/.test(n)).map((n) => n.slice(0, 4)).sort();
const state = { done: false, chunks: [], anchors: {}, cards: {} };
const bad = [], pending = [];
const VERD = new Set(['ok', 'fix', 'drop']), BL = new Set(['wide', 'same', 'near', 'miss']);
for (const name of names) {
  const of = path.join(HERE, name + '.out.json');
  if (!exists(of)) { pending.push(name); continue; }
  const meta = readJ(path.join(HERE, name + '.meta.json'));
  let out;
  try { out = readJ(of); } catch (e) { bad.push([name, 'json ' + e.message.slice(0, 60)]); continue; }
  const byKey = new Map(out.map((r) => [r.key, r]));
  const missing = meta.order.filter((k) => !byKey.has(k));
  if (out.length !== meta.order.length || missing.length) { bad.push([name, `개수 ${out.length}/${meta.order.length} 빠진 ${missing.slice(0, 5)}`]); continue; }
  let badRow = null;
  for (const r of out) {
    if (meta.kind === 'u') {
      if (!VERD.has(r.verdict)) { badRow = r.key + ' verdict'; break; }
      if (r.verdict === 'fix' && !(Array.isArray(r.fix) && r.fix.length)) { badRow = r.key + ' fix 비어 있음'; break; }
      if (r.fix && r.fix.some((x) => !['q', 'hint', 'exp'].includes(x.field) || !x.span)) { badRow = r.key + ' fix 꼴'; break; }
    }
    if (r.blind != null && !BL.has(r.blind)) { badRow = r.key + ' blind'; break; }
  }
  if (badRow) { bad.push([name, '값 이상 ' + badRow]); continue; }
  if (meta.kind === 'u') {
    state.anchors[name] = meta.anchors.map((a) => {
      const g = byKey.get(a.key);
      return { key: a.key, id: a.id, gold: a.kind, got: g.verdict, same: a.kind === g.verdict || (a.kind === 'fix' && g.verdict === 'drop') };
    });
  }
  for (const c of meta.cards) {
    const r = byKey.get(c.key);
    const o = {};
    if (meta.kind === 'u') {
      o.verdict = r.verdict;
      if (r.fix?.length) o.fix = r.fix;
      if (r.web?.length) o.web = r.web;
    }
    if (r.blind) o.blind = r.blind;
    for (const k of ['lack', 'add', 'addText']) if (r[k] != null && r[k] !== '') o[k] = r[k];
    for (const k of ['read', 'blank', 'variantBad']) if (Array.isArray(r[k]) && r[k].length) o[k] = r[k];
    if (r.needsRegrade) o.needsRegrade = true;
    o.unit = name; o.grade = c.grade;
    state.cards[String(c.id)] = o;
  }
  state.chunks.push(name);
}
state.done = pending.length === 0 && bad.length === 0;
fs.writeFileSync(OUT, JSON.stringify(state));
const cs = Object.values(state.cards);
const v = { ok: 0, fix: 0, drop: 0 }, bl = { wide: 0, same: 0, near: 0, miss: 0 };
let read = 0, blank = 0, vb = 0, nr = 0, web = 0;
for (const c of cs) { if (c.verdict) v[c.verdict]++; if (c.blind) bl[c.blind]++; if (c.read) read++; if (c.blank) blank++; if (c.variantBad) vb++; if (c.needsRegrade) nr++; if (c.web) web++; }
const an = Object.values(state.anchors).flat();
console.log(JSON.stringify({ chunksDone: state.chunks.length, of: names.length, cards: cs.length, verdict: v, blind: bl, readCards: read, blankCards: blank, variantBadCards: vb, needsRegrade: nr, webCards: web, anchors: `${an.filter((a) => a.same).length}/${an.length}`, bad, pendingN: pending.length }));
