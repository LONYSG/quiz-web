// V018 setup — 활성 난이도 1 전수 (DB 읽기 전용) → 조각 b01.. (50건)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v018-raw/a';
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query('select id, question_text, display_answer, explanation, general_hint, difficulty_score d, source_ref from questions where is_active order by id')).rows;
const ans = (await c.query('select a.question_id, a.answer_text, a.answer_norm, a.is_primary from question_answers a join questions q on q.id=a.question_id where q.is_active')).rows;
await c.end();
const byId = new Map(rows.map((r) => [Number(r.id), r]));
const variants = new Map(); const primNorm = new Map();
for (const a of ans) { const k = Number(a.question_id); if (a.is_primary) { if (!primNorm.has(a.answer_norm)) primNorm.set(a.answer_norm, []); primNorm.get(a.answer_norm).push(k); } else { if (!variants.has(k)) variants.set(k, []); variants.get(k).push(a.answer_text); } }
const v13 = new Set();
const pool = rows.filter((r) => Number(r.d) === 1);
const ids = pool.map((r) => Number(r.id)).filter((id) => !v13.has(id)).sort((a, b) => a - b);
const grp = (r) => { const m = (r.source_ref || '').match(/#(g\d+|r\d+[a-z]*|\d+)/i); return m ? (/^g|^r/i.test(m[1]) ? m[1].toLowerCase() : 'legacy#') : (r.source_ref || '').startsWith('manual') ? 'manual' : 'other'; };
const dist = {}; for (const id of ids) { const g = grp(byId.get(id)); dist[g] = (dist[g] || 0) + 1; }
const sameOf = (id) => { const r = byId.get(id); const n = normalizeAnswer(r.display_answer); return (primNorm.get(n) || []).filter((x) => x !== id).map((x) => { const y = byId.get(x); return { id: x, question: one(y.question_text), explanation: one(y.explanation), hint: one(y.general_hint), d: Number(y.d) }; }); };
const items = ids.map((id) => { const r = byId.get(id); return { id, answer: r.display_answer, variants: variants.get(id) || [], question: one(r.question_text), explanation: one(r.explanation), hint: one(r.general_hint), source: r.source_ref, same: sameOf(id) }; });
fs.writeFileSync(RAW + '/targets-ids.json', JSON.stringify({ frozenAt: new Date().toISOString(), poolSize: pool.length, activeDb: rows.length, v013: v13.size, ids, dist }));
fs.writeFileSync(RAW + '/_work/items.json', JSON.stringify(items, null, 1));
const fmt = (x) => { const L = [`### #${x.id}  A=${x.answer}${x.variants.length ? ' 변형: ' + x.variants.join(' | ') : ''}  [${x.source}]`, `Q: ${x.question}`, `E: ${x.explanation}`, `H: ${x.hint}`]; for (const y of x.same) L.push(`  sameAnswerActive #${y.id} (난이도 ${y.d}): Q: ${y.question} | E: ${y.explanation} | H: ${y.hint}`); L.push(''); return L.join('\n'); };
const pieces = []; const n = Math.ceil(items.length / 50);
for (let i = 0; i < n; i++) { const a = items.slice(i * 50, i * 50 + 50); const name = 'e' + String(i + 1).padStart(2, '0'); fs.writeFileSync(`${RAW}/_work/${name}.txt`, `## 활성 난이도 1 조각 ${name} (${a.length}건)\n\n` + a.map(fmt).join('\n')); fs.writeFileSync(`${RAW}/_work/${name}.refs.json`, JSON.stringify(a.map((x) => String(x.id)))); pieces.push(name); }
fs.writeFileSync(RAW + '/_work/pieces.json', JSON.stringify(pieces));
console.log(JSON.stringify({ activeDb: rows.length, pool: pool.length, v13: v13.size, target: ids.length, pieces: pieces.length, dist, withSame: items.filter((x) => x.same.length).length }));
