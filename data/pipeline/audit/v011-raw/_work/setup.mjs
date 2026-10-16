// V011 setup — 대상 고정(DB 읽기 전용) · 원칙 7 · 판정자 입력 2조각(가+나 · 다)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg');
process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const SC = process.env.V11SC;
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v011-raw';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

const g7 = J(A + '/g007-fixes.json'); const gen = g7.rows.filter((r) => r.by === 'gen');
const v9 = J(A + '/v009-results.json'); const v10 = J(A + '/v010-results.json');
const tg = Object.fromEntries(J(A + '/g005-verify-targets.json').targets.map((x) => [x.ref, x]));
const cv20 = [1783, 2187, 2262, 2412, 2574, 2887, 2910, 3072, 3466, 3555, 3609, 3680, 3934];
const paired = Object.values(v9.items).filter((x) => x.method === '가' && x.verdict !== 'drop').map((x) => x.ref);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version, q.difficulty_score dif, q.source_ref from questions q where q.is_active`)).rows;
const ans = (await c.query(`select a.question_id, a.answer_text, a.answer_norm, a.is_primary from question_answers a join questions q on q.id=a.question_id where q.is_active`)).rows;
await c.end();
const byId = new Map(rows.map((r) => [Number(r.id), r]));
const byRef = new Map(); for (const r of rows) { const m = (r.source_ref || '').match(/#g005-(.+)$/); if (m) byRef.set(m[1], r); }
const variantsOf = new Map(); for (const a of ans) if (!a.is_primary) { const k = Number(a.question_id); if (!variantsOf.has(k)) variantsOf.set(k, []); variantsOf.get(k).push(a.answer_text); }
const primNorm = new Map(); for (const a of ans) if (a.is_primary) { if (!primNorm.has(a.answer_norm)) primNorm.set(a.answer_norm, []); primNorm.get(a.answer_norm).push(Number(a.question_id)); }
const sameOf = (id) => { const r = byId.get(id); const n = normalizeAnswer(r.display_answer); return (primNorm.get(n) || []).filter((x) => x !== id).map((x) => { const y = byId.get(x); return { id: x, question: y.question_text, explanation: y.explanation }; }); };
const row = (r) => r && { id: Number(r.id), answer: r.display_answer, variants: variantsOf.get(Number(r.id)) || [], question: r.question_text, explanation: r.explanation, hint: r.general_hint, hintVersion: r.general_hint_version };

const summary = { activeDb: rows.length, g005InDb: byRef.size, genRows: gen.length, genFields: cnt(gen, (r) => r.field), genRefs: [...new Set(gen.map((r) => r.ref))].length, knowledge: g7.knowledge.map((k) => k.ref), cv20: cv20.length, cv20InV10: v10.items ? cv20.filter((id) => v10.items[id]).length : null, paired: paired.length, pairedDropped: Object.values(v9.items).filter((x) => x.method === '가' && x.verdict === 'drop').length, pairedInDb: paired.filter((r) => byRef.has(r)).length };

// ── (가) 24 + 지식 5
const gaItems = [];
for (const r of gen) {
  const d = byRef.get(r.ref); const cur = r.field === 'hint' ? d?.general_hint : r.field === 'question' ? d?.question_text : d?.explanation;
  gaItems.push({ key: `${r.ref}:${r.field}`, ref: r.ref, field: r.field, id: d ? Number(d.id) : null, before: r.before, after: r.after, dbNow: cur, dbEqualsAfter: cur === r.after, why: r.why, sources: r.sources || [], row: row(d), same: d ? sameOf(Number(d.id)) : [], target: tg[r.ref] ? { facts: tg[r.ref].facts.map((f) => ({ where: f.where, claim: f.claim, url: f.url, note: one(f.note).slice(0, 160) })) } : null });
}
summary.gaDbNotEqual = gaItems.filter((x) => !x.dbEqualsAfter).map((x) => x.key);
const kn = g7.knowledge.map((k) => { const d = byRef.get(k.ref); return { key: `${k.ref}:knowledge`, ref: k.ref, id: d ? Number(d.id) : null, claims: k.claims, hintClaim: k.hint, row: row(d), same: d ? sameOf(Number(d.id)) : [], target: tg[k.ref] ? { facts: tg[k.ref].facts.map((f) => ({ where: f.where, claim: f.claim, url: f.url, note: one(f.note).slice(0, 160) })) } : null }; });
// ── (나)
const cv = cv20.map((id) => { const d = byId.get(id); const note = v10.items[id]?.note; return { key: String(id), id, row: row(d), note, same: sameOf(id) }; });
// ── (다)
const pr = paired.map((ref) => { const d = byRef.get(ref); const pid = Number(tg[ref].pairedWith); const p = byId.get(pid); return { key: ref, ref, id: d ? Number(d.id) : null, row: row(d), pairedId: pid, pairedRow: row(p), pairedActive: !!p, same: d ? sameOf(Number(d.id)).filter((s) => s.id !== pid) : [] }; });
summary.pairedActiveMissing = pr.filter((x) => !x.pairedActive).map((x) => x.ref);
fs.writeFileSync(SC + '/ga.json', JSON.stringify(gaItems, null, 1)); fs.writeFileSync(SC + '/kn.json', JSON.stringify(kn, null, 1)); fs.writeFileSync(SC + '/cv.json', JSON.stringify(cv, null, 1)); fs.writeFileSync(SC + '/pr.json', JSON.stringify(pr, null, 1));
fs.writeFileSync(RAW + '/targets-ids.json', JSON.stringify({ frozenAt: new Date().toISOString(), ga: gaItems.map((x) => ({ key: x.key, id: x.id })), knowledge: kn.map((x) => ({ ref: x.ref, id: x.id })), cv20, pairs: pr.map((x) => ({ ref: x.ref, id: x.id, pairedId: x.pairedId })) }));

// ── 입력 txt
const fmtGa = (x) => {
  const r = x.row; const L = [`### ${x.key}  id=#${x.id}  A=${r.answer}${r.variants.length ? ' 변형: ' + r.variants.join(' | ') : ''}`, `Q: ${one(r.question)}`, `E: ${one(r.explanation)}`, `H(지금 DB): ${one(r.hint)}`];
  if (x.field === 'hint') L.push(`before(GEN 이 바꾸기 전 힌트): ${one(x.before)}`, `AFTER(지금 DB 힌트 — 판정 대상, GEN 이 쓴 문구): ${one(x.after)}`);
  else L.push(`before(GEN 이 바꾸기 전 ${x.field}): ${one(x.before)}`, `AFTER(지금 DB ${x.field} — 판정 대상, GEN 이 쓴 문구): ${one(x.after)}`);
  L.push(`GEN 사유: ${one(x.why)}   sources: ${x.sources.join(' ; ')}`);
  if (x.target) L.push('facts(G005 생성 때 연 문서): ' + x.target.facts.map((f) => `[${f.where}] ${one(f.claim)} <${f.url}> «${f.note}»`).join(' || '));
  for (const s of x.same) L.push(`  sameAnswerActive #${s.id}: Q: ${one(s.question)} | E: ${one(s.explanation)}`);
  L.push(''); return L.join('\n');
};
const fmtKn = (x) => { const r = x.row; const L = [`### ${x.key}  id=#${x.id}  A=${r.answer}${r.variants.length ? ' 변형: ' + r.variants.join(' | ') : ''}`, `Q: ${one(r.question)}`, `E: ${one(r.explanation)}`, `H: ${one(r.hint)}`, `G007 이 '지식 근거'로 적재한 주장(문서로 못 닫았다): ${x.claims.map((c) => '«' + c + '»').join(' ')}  ${x.hintClaim ? '(힌트의 주장)' : '(질문/해설의 주장)'}`]; if (x.target) L.push('facts(G005): ' + x.target.facts.map((f) => `[${f.where}] ${one(f.claim)} <${f.url}>`).join(' || ')); L.push(''); return L.join('\n'); };
const fmtCv = (x) => { const r = x.row; const L = [`### ${x.key}  A=${r.answer}${r.variants.length ? ' 변형: ' + r.variants.join(' | ') : ''}`, `Q: ${one(r.question)}`, `E: ${one(r.explanation)}`, `V010 note: ${one(x.note)}`]; for (const s of x.same) L.push(`  sameAnswerActive #${s.id}: Q: ${one(s.question)} | E: ${one(s.explanation)}`); L.push(''); return L.join('\n'); };
const fmtPr = (x) => { const r = x.row, p = x.pairedRow; return [`### ${x.key}  2회차 id=#${x.id}  A=${r.answer}${r.variants.length ? ' 변형: ' + r.variants.join(' | ') : ''}`, `2회차 Q: ${one(r.question)}`, `2회차 E: ${one(r.explanation)}`, `2회차 H: ${one(r.hint)}`, `1회차 #${x.pairedId} (활성) A=${p.answer}`, `1회차 Q: ${one(p.question)}`, `1회차 E: ${one(p.explanation)}`, `1회차 H: ${one(p.hint)}`, ...x.same.map((s) => `  다른 sameAnswerActive #${s.id}: Q: ${one(s.question)} | E: ${one(s.explanation)}`), ''].join('\n'); };
const hdr = (t) => `\n## ${t}\n\n`;
fs.writeFileSync(`${RAW}/_work/q1.txt`, hdr('(가) G007 에서 GEN 이 쓴 문구 24') + gaItems.map(fmtGa).join('\n') + hdr('(가-2) 지식 근거로 적재한 주장 5 — 다른 문서로 한 번 더') + kn.map(fmtKn).join('\n') + hdr('(나) CV-20 질문 품질 note 13') + cv.map(fmtCv).join('\n'));
fs.writeFileSync(`${RAW}/_work/q1.refs.json`, JSON.stringify([...gaItems.map((x) => x.key), ...kn.map((x) => x.key), ...cv.map((x) => x.key)]));
fs.writeFileSync(`${RAW}/_work/q2.txt`, hdr('(다) 2회차 25 ↔ 1회차 (양방향)') + pr.map(fmtPr).join('\n'));
fs.writeFileSync(`${RAW}/_work/q2.refs.json`, JSON.stringify(pr.map((x) => x.key)));
fs.writeFileSync(RAW + '/_work/summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1)); for (const k of ['q1', 'q2']) console.log(k, fs.statSync(`${RAW}/_work/${k}.txt`).size);
