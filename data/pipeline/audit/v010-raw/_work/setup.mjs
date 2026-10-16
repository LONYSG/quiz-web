// V010 setup — 대상 고정(DB 읽기 전용) · 원칙 7 확인 · blind 판정자 입력 8조각 · 두 번째 채점자 120 · (나) 힌트 14
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg');
process.loadEnvFile('C:/work/quiz-web/.env');
const SC = process.env.V10SC;
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v010-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = `select q.id, q.question_text, q.display_answer, q.explanation, q.difficulty_score dif, q.difficulty_why, q.score_version, q.source_id, q.source_ref,
  to_char(q.created_at,'YYYY-MM-DD') cd, q.general_hint, q.general_hint_version, c3.key c3key, c3.name_ko c3name, c2.key c2key, c2.name_ko c2name, c1.key c1key, c1.name_ko c1name, c1.game_topic gt, c2.game_topic g2
  from questions q join categories c3 on c3.id=q.category_id left join categories c2 on c2.id=c3.parent_id left join categories c1 on c1.id=c2.parent_id
  where q.is_active`;
const all = (await c.query(q)).rows;
const ans = (await c.query(`select a.question_id, a.answer_text, a.is_primary from question_answers a join questions q on q.id=a.question_id where q.is_active`)).rows;
await c.end();
const variantsOf = new Map(); for (const a of ans) if (!a.is_primary) { const k = Number(a.question_id); if (!variantsOf.has(k)) variantsOf.set(k, []); variantsOf.get(k).push(a.answer_text); }
const top = all.filter((r) => r.dif >= 4);
const g003 = top.filter((r) => /#g003-/.test(r.source_ref || ''));
const g005 = all.filter((r) => /#g005-/.test(r.source_ref || ''));
const targets = top.filter((r) => !/#g003-|#g005-/.test(r.source_ref || ''));
const roundOf = (r) => { const m = (r.source_ref || '').match(/#(r030g|r030n|g001|g002|g003|g004|g005)-/); if (m) return m[1]; if (r.source_id === 'gemini-gen') return 'gemini-gen'; if (r.source_id === 'manual') return 'manual'; return 'legacy-' + r.cd; };
const manualMap = { literature: 'arts', tech: 'science', history: 'history', geography: 'history' };
const topicOf = (r) => r.g2 || r.gt || (r.c1key || '').replace(/^L1:/, '') || manualMap[r.c3key] || '?';
const summary = {
  activeDb: all.length, activeTop: top.length, g003Top: g003.length, g005InDb: g005.length, targets: targets.length,
  difDist: cnt(targets, (r) => r.dif), scoreVersion: cnt(targets, (r) => r.score_version), source: cnt(targets, (r) => r.source_id),
  round: cnt(targets, roundOf), topic: cnt(targets, topicOf), c1: cnt(targets, (r) => r.c1key + ':' + r.c1name), subs: new Set(targets.map((r) => r.c3key)).size,
  withHint: targets.filter((r) => r.general_hint).length, g003Active: all.filter((r) => /#g003-/.test(r.source_ref || '')).length,
};
const g006 = J(A + '/g006-fixes.json'); const g006Gen = g006.rows.filter((r) => r.by === 'gen');
const expect14 = [3005, 3949, 671, 1029, 626, 728, 1316, 2226, 2384, 3248, 3719, 3814, 3898, 3990];
summary.g006Gen = { n: g006Gen.length, ids: g006Gen.map((r) => r.id), sameAsBrief: JSON.stringify(g006Gen.map((r) => r.id).sort((a, b) => a - b)) === JSON.stringify([...expect14].sort((a, b) => a - b)) };
const byId = new Map(all.map((r) => [Number(r.id), r]));
summary.g006GenDbEqual = g006Gen.map((r) => [r.id, byId.get(r.id)?.general_hint === r.after]).filter((z) => !z[1]).map((z) => z[0]);
fs.writeFileSync(SC + '/targets.json', JSON.stringify(targets.map((r) => ({ id: Number(r.id), dif: r.dif, round: roundOf(r), topic: topicOf(r), c3key: r.c3key, c3name: r.c3name, c2name: r.c2name, c1name: r.c1name, question: r.question_text, answer: r.display_answer, variants: variantsOf.get(Number(r.id)) || [], explanation: r.explanation, scoreVersion: r.score_version, source: r.source_id, ref: r.source_ref, created: r.cd, difWhy: r.difficulty_why, hasHint: !!r.general_hint })), null, 1));
// 고정된 id 목록(저장소에 남긴다 — G007 이 도중에 g005 행을 넣어도 대상은 이 목록)
fs.writeFileSync(RAW + '/targets-ids.json', JSON.stringify({ frozenAt: new Date().toISOString(), n: targets.length, ids: targets.map((r) => Number(r.id)).sort((a, b) => a - b) }));
const t = J(SC + '/targets.json');

// ── 조각 8 (id 해시로 섞음 — 묶음·소분류·라운드 편중 없이)
const hash = (n) => (Math.imul(n, 2654435761) >>> 0);
const sorted = [...t].sort((a, b) => hash(a.id) - hash(b.id));
const pcs = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => ['p' + i, []])); sorted.forEach((x, i) => pcs['p' + ((i % 8) + 1)].push(x));
for (const k of Object.keys(pcs)) pcs[k].sort((a, b) => a.id - b.id);
const fmt = (x) => [`### #${x.id}  [${[x.c1name, x.c2name, x.c3name].filter(Boolean).join(' › ')}]`, `Q: ${one(x.question)}`, `A: ${x.answer}${x.variants.length ? '   변형: ' + x.variants.join(' | ') : ''}`, `E: ${one(x.explanation)}`, ''].join('\n');
const manifest = {};
for (const [k, arr] of Object.entries(pcs)) {
  fs.writeFileSync(`${RAW}/_work/${k}.txt`, arr.map(fmt).join('\n'));
  fs.writeFileSync(`${RAW}/_work/${k}.refs.json`, JSON.stringify(arr.map((x) => String(x.id))));
  manifest[k] = { n: arr.length, topic: cnt(arr, (x) => x.topic) };
}
// ── 두 번째 채점자 120 (조각당 15) — 같은 형식
let seed = 20261017; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const r2 = []; for (const [k, arr] of Object.entries(pcs)) { const s = [...arr]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } r2.push(...s.slice(0, 15)); }
const r2m = [...r2]; for (let i = r2m.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r2m[i], r2m[j]] = [r2m[j], r2m[i]]; }
fs.writeFileSync(`${RAW}/_work/r2.txt`, r2m.map(fmt).join('\n')); fs.writeFileSync(`${RAW}/_work/r2.refs.json`, JSON.stringify(r2m.map((x) => String(x.id))));
// ── (나) 14
const hintItems = g006Gen.map((r) => { const d = byId.get(r.id); return { id: r.id, answer: d.display_answer, variants: variantsOf.get(r.id) || [], dif: d.dif, question: d.question_text, explanation: d.explanation, before: r.before, after: r.after, why: r.why, sources: r.sources || [] }; });
fs.writeFileSync(SC + '/hint14.json', JSON.stringify(hintItems, null, 1));
fs.writeFileSync(RAW + '/_work/summary.json', JSON.stringify(summary, null, 1));
fs.writeFileSync(RAW + '/_work/manifest.json', JSON.stringify({ ...manifest, r2: { n: r2m.length } }, null, 1));
console.log(JSON.stringify(summary, null, 1)); console.log(JSON.stringify(manifest));
for (const k of Object.keys(manifest)) console.log(k, fs.statSync(`${RAW}/_work/${k}.txt`).size);
