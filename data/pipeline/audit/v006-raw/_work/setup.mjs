// V006 setup — 대상 확인 · checkHint 전수(A) · DB 읽기 전용 대조 · 같은 정답 묶기 · 조각 나누기
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v6';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v006-raw';
fs.mkdirSync(RAW, { recursive: true });
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const T = J('C:/work/quiz-web/data/pipeline/audit/r047-verify-targets.json');
const H = T.midHints.targets;
const F = J('C:/work/quiz-web/data/pipeline/audit/r032-fixes.json');

// ── 원칙 7: 건수
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const ids = new Set(H.map(x => x.id));
const summary = {
  midHints: H.length, uniqueIds: ids.size, path: cnt(H, x => x.path), gen: H.filter(x => x.gen != null).map(x => x.id),
  variantsEmpty: H.filter(x => !x.variants || !x.variants.length).length, noExplanation: H.filter(x => !x.explanation).length, blind: H.filter(x => x.blind).length,
  r032: { edits: F.edits.length, variants: F.variants.length, deactivate: F.deactivate.length, kind: cnt(F.edits, e => e.kind), overlap: F.edits.filter(e => ids.has(e.id)).map(e => e.id),
    changed: cnt(F.edits, e => { const q = e.after?.question != null, x = e.after?.explanation != null; return q && x ? 'both' : q ? 'question' : 'explanation'; }),
    srcKind: cnt(F.edits, e => /단정어/.test(e.src) ? '단정어' : /한정어/.test(e.src) ? '한정어' : /시간/.test(e.src) ? '시간' : /기준서/.test(e.src) ? '기준서' : '기타') },
};

// ── A. checkHint 전수
const mech = {};
let blocks = 0; const warnKinds = {};
for (const x of H) {
  const r = checkHint({ hint: x.hint, answer: x.answer, variants: x.variants || [], question: x.question, explanation: x.explanation || '' });
  mech[x.id] = r;
  blocks += r.block.length;
  for (const w of r.warn) warnKinds[w.kind] = (warnKinds[w.kind] || 0) + 1;
}
summary.hintCheck = { blocks, warnItems: Object.values(mech).filter(r => r.warn.length).length, warnKinds };
fs.writeFileSync(SC + '/mech.json', JSON.stringify(mech, null, 1));
let wtxt = '';
for (const x of H) { const r = mech[x.id]; if (!r.block.length && !r.warn.length) continue; wtxt += `## #${x.id} [${x.path}] A=${x.answer} ${x.variants?.length ? 'V=' + x.variants.join('|') : ''}\n Q: ${x.question.replace(/\n/g, ' ')}\n H: ${x.hint}\n E: ${(x.explanation || '').replace(/\n/g, ' ')}\n CHK: ${JSON.stringify([...r.block.map(b => ({ block: b })), ...r.warn])}\n\n`; }
fs.writeFileSync(SC + '/warnings.txt', wtxt);

// ── DB 읽기 전용 대조
const c = new pg.Client({ connectionString: 'postgresql://USER:PASSWORD@localhost:5434/quizweb' });
await c.connect();
const allIds = [...ids, ...F.edits.map(e => e.id), ...F.variants.map(v => v.id), ...F.deactivate.map(d => d.id), 3930];
const r = await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version, q.difficulty_score, q.is_active
  from questions q where q.id = any($1::int[])`, [allIds]);
const va = await c.query(`select question_id, answer_text from question_answers where question_id = any($1::int[])`, [allIds]);
const act = await c.query(`select count(*)::int as n from questions where is_active`);
await c.end();
const db = {}; for (const row of r.rows) db[row.id] = row;
const vmap = {}; for (const v of va.rows) (vmap[v.question_id] ||= []).push(v.answer_text);
const diff = [];
for (const x of H) {
  const d = db[x.id];
  if (!d) { diff.push({ id: x.id, what: 'missing' }); continue; }
  if (d.general_hint !== x.hint) diff.push({ id: x.id, what: 'hint' });
  if (d.question_text !== x.question) diff.push({ id: x.id, what: 'question' });
  if ((d.explanation || '') !== (x.explanation || '')) diff.push({ id: x.id, what: 'explanation' });
  if (!d.is_active) diff.push({ id: x.id, what: 'inactive' });
  if (d.difficulty_score !== 3) diff.push({ id: x.id, what: 'dif ' + d.difficulty_score });
  if (d.general_hint_version !== 'hint-v3') diff.push({ id: x.id, what: 'ver ' + d.general_hint_version });
}
summary.db = { active: act.rows[0].n, diff: diff.length, diffList: diff.slice(0, 20) };
// R032 after == DB now?
const r032db = { editsMatch: 0, editsMismatch: [], variantsPresent: [], deactivated: null };
for (const e of F.edits) {
  const d = db[e.id]; let ok = true;
  if (e.after?.question != null && d.question_text !== e.after.question) ok = false;
  if (e.after?.explanation != null && (d.explanation || '') !== e.after.explanation) ok = false;
  if (ok) r032db.editsMatch++; else r032db.editsMismatch.push(e.id);
}
for (const v of F.variants) r032db.variantsPresent.push({ id: v.id, add: v.add, present: (vmap[v.id] || []).some(a => normalizeAnswer(a) === normalizeAnswer(v.add)) });
r032db.deactivated = F.deactivate.map(d => ({ id: d.id, is_active: db[d.id]?.is_active }));
summary.r032db = r032db;
fs.writeFileSync(SC + '/db-rows.json', JSON.stringify({ db, vmap }, null, 1));

// ── 같은 정답 묶기
const groups = {};
for (const x of H) { const k = normalizeAnswer(x.answer); (groups[k] ||= []).push(x.id); }
const multi = Object.entries(groups).filter(([, v]) => v.length >= 2);
summary.sameAnswer = { groups: multi.length, items: multi.reduce((s, [, v]) => s + v.length, 0), dist: cnt(multi, ([, v]) => v.length) };
fs.writeFileSync(SC + '/groups.json', JSON.stringify(Object.fromEntries(multi), null, 1));

// ── 조각 나누기 (같은 정답은 한 조각에) — 13 조각 × ~102
const N = 13;
const byId = [...H].sort((a, b) => a.id - b.id);
const seen = new Set(); const units = [];
for (const x of byId) { if (seen.has(x.id)) continue; const k = normalizeAnswer(x.answer); const g = groups[k]; const members = g.map(id => H.find(h => h.id === id)).sort((a, b) => a.id - b.id); members.forEach(m => seen.add(m.id)); units.push(members); }
const target = Math.ceil(H.length / N);
const chunks = []; let cur = [];
for (const u of units) { if (cur.length && cur.length + u.length > target) { chunks.push(cur); cur = []; } cur.push(...u); }
if (cur.length) chunks.push(cur);
summary.chunks = chunks.map(c => c.length);
const strip = (x) => ({ id: x.id, question: x.question, answer: x.answer, variants: x.variants || [], explanation: x.explanation || null, hint: x.hint, path: x.path, gen: x.gen ?? null, sameAnswerIn: (groups[normalizeAnswer(x.answer)].length > 1 ? groups[normalizeAnswer(x.answer)] : undefined), hintCheck: (mech[x.id].block.length || mech[x.id].warn.length) ? mech[x.id] : undefined });
chunks.forEach((ch, i) => {
  const name = 'c' + String(i + 1).padStart(2, '0');
  fs.writeFileSync(`${SC}/${name}.json`, JSON.stringify(ch.map(strip), null, 1));
  let t = '';
  for (const x of ch) t += `## #${x.id} [${x.path}]${x.gen ? ' GEN표시: ' + x.gen : ''}${groups[normalizeAnswer(x.answer)].length > 1 ? ' 같은정답: ' + groups[normalizeAnswer(x.answer)].join(',') : ''}\nQ: ${x.question.replace(/\n/g, ' / ')}\nA: ${x.answer}${x.variants?.length ? '  (변형: ' + x.variants.join(' | ') + ')' : ''}\nE: ${(x.explanation || '(없음)').replace(/\n/g, ' ')}\nH: ${x.hint}\n\n`;
  fs.writeFileSync(`${SC}/${name}.txt`, t);
});
fs.writeFileSync(SC + '/summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
