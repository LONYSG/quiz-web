// V018 ② setup — 힌트 점검 88 = G011 새 힌트 28 + V014 "애매 ok" 176 중 시드 고정 60 (DB 읽기 전용)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v018-raw/b'; const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const dec = J(A + '/g011-decisions.json').items; const newRefs = Object.keys(dec).filter((k) => dec[k].newHint);
const v14 = J(A + '/v014-results.json').items; const amb = Object.values(v14).filter((x) => x.verdict === 'ok' && /^애매/.test(x.note || '')).map((x) => x.ref).filter((r) => !newRefs.includes(r));
let seed = 20261019; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const sh = [...amb]; for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
const sample = sh.slice(0, 60);
const tg = Object.fromEntries(J(A + '/g009a-verify-targets.json').targets.map((x) => [x.ref, x]));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query('select id, question_text, display_answer, explanation, general_hint, difficulty_score d, source_ref, is_active from questions where is_active')).rows;
await c.end();
const byRef = new Map(); for (const r of rows) { const m = (r.source_ref || '').match(/#g009a-([A-Z0-9]+-\d+)/); if (m) byRef.set(m[1], r); }
const primNorm = new Map(); for (const r of rows) { const n = normalizeAnswer(r.display_answer); if (!primNorm.has(n)) primNorm.set(n, []); primNorm.get(n).push(r); }
const items = [];
for (const [grp, refs] of [['newHint', newRefs], ['ambiguous', sample]]) for (const ref of refs) {
  const r = byRef.get(ref); const t = tg[ref]; if (!r) { items.push({ ref, grp, missing: true }); continue; }
  const same = (primNorm.get(normalizeAnswer(r.display_answer)) || []).filter((x) => x.id !== r.id).map((x) => ({ id: Number(x.id), question: one(x.question_text), explanation: one(x.explanation), hint: one(x.general_hint), d: x.d }));
  const chk = r.general_hint ? checkHint({ hint: r.general_hint, answer: r.display_answer, variants: t?.variants || [], question: r.question_text, explanation: r.explanation || '' }) : null;
  items.push({ ref, grp, id: Number(r.id), d: r.d, question: one(r.question_text), answer: r.display_answer, variants: t?.variants || [], explanation: one(r.explanation), hint: one(r.general_hint), hintBasis: t?.hintBasis, hintSources: dec[ref]?.hintSources || t?.hintSources || [], hintNote: one(dec[ref]?.hintNote || t?.hintNote), v014Note: grp === 'ambiguous' ? one(v14[ref]?.note) : '', first: t?.first || null, same, warn: chk ? { block: chk.block.map((w) => w.kind), warn: chk.warn.map((w) => w.kind) } : null });
}
fs.writeFileSync(RAW + '/_work/items.json', JSON.stringify(items, null, 1));
const fmt = (x) => {
  if (x.missing) return `### ${x.ref} [${x.grp}] DB 에 없음\n`;
  const L = [`### ${x.ref}  #${x.id} [${x.grp === 'newHint' ? 'G011 새 힌트' : 'V014 애매 ok 표본'}]  난이도 ${x.d}`, `Q: ${x.question}`, `A: ${x.answer}${x.variants.length ? '   변형: ' + x.variants.join(' | ') : ''}`, `E: ${x.explanation}`, `H: ${x.hint}   hintBasis=${x.hintBasis}   hintSources: ${x.hintSources.join(' ; ')}   hintNote: ${x.hintNote}`];
  if (x.v014Note) L.push(`V014 판정자 메모: ${x.v014Note}`);
  if (x.first) L.push(`  1회차 #${x.first.id}: Q: ${one(x.first.question)} | E: ${one(x.first.explanation)} | H: ${one(x.first.hint) || '(없음)'}`);
  for (const s of x.same) L.push(`  sameAnswerActive #${s.id}: Q: ${s.question} | E: ${s.explanation} | H: ${s.hint || '(없음)'}`);
  L.push(`hint-check: block=[${x.warn?.block.join(',') ?? ''}] warn=[${x.warn?.warn.join(',') ?? ''}]`, '');
  return L.join('\n');
};
const NP = 2; const per = Math.ceil(items.length / NP); const pieces = [];
for (let i = 0; i < NP; i++) { const a = items.slice(i * per, i * per + per); const name = 'h' + (i + 1); fs.writeFileSync(`${RAW}/_work/${name}.txt`, `## 힌트 점검 조각 ${name} (${a.length}건)\n\n` + a.map(fmt).join('\n')); fs.writeFileSync(`${RAW}/_work/${name}.refs.json`, JSON.stringify(a.map((x) => x.ref))); pieces.push(name); }
fs.writeFileSync(RAW + '/_work/pieces.json', JSON.stringify(pieces));
console.log(JSON.stringify({ newRefs: newRefs.length, ambiguous: amb.length, sample: sample.length, items: items.length, missing: items.filter((x) => x.missing).length, pieces }));
