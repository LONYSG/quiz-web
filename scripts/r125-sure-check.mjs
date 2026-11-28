// ★★★ R125 — 혼자 하기 정답 지문 전수 대조(읽기만): node scripts/r125-sure-check.mjs <DB_URL>
//   실 DB 활성 카드마다 서버와 같은 정답 집합(answer_norm · answer_text) → makeSoloSure → 맞는 제출이 지문에 안 걸리는 것 0 · 틀린 제출이 걸리는 것 0 이어야 한다.
//   + 지문 만들기에 든 시간(문제 하나 · 서버 부하) · 상자 크기
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { answerTags, flexAnswerSet, flexMatch, makeSoloSure, normalizeAnswer, openSoloSure, sureHit } from '../shared/dist/index.js';
const c = new pg.Client({ connectionString: process.argv[2] });
await c.connect();
const r = await c.query(`SELECT q.id, q.display_answer, q.explanation, array_agg(qa.answer_text) raw, array_agg(qa.answer_norm) norm
  FROM questions q JOIN question_answers qa ON qa.question_id=q.id WHERE q.is_active GROUP BY q.id`);
let okSubs = 0, okMiss = [], wrongSubs = 0, wrongHit = [], openBad = 0, makeNs = 0n, boxLen = 0, maxBox = 0, keyCount = 0;
const allAns = r.rows.map((x) => x.raw[0]);
const variants = (a) => [a, a + '이다', a + '입니다!', ' ' + a + ' ', a.replace(/\s+/g, ''), a.toUpperCase(), a.toLowerCase(), a + '요', a + '임', a + '?', `(${a})`, a.replace(/[()]/g, ''), a.split(/[(（]/)[0] ?? a, a.replace(/[·.,]/g, ''), a.slice(0, -1), a + 'ㅋ', a.slice(1)];
for (const row of r.rows) {
  const norms = new Set(row.norm.filter((s) => typeof s === 'string' && s.length > 0));
  if (norms.size === 0) continue;
  const raws = row.raw.filter((s) => typeof s === 'string' && s.length > 0);
  const flex = flexAnswerSet(raws, norms);
  const t0 = process.hrtime.bigint();
  const sure = makeSoloSure(answerTags(norms, flex), { answer: row.display_answer, explanation: row.explanation }, (k) => randomBytes(k));
  makeNs += process.hrtime.bigint() - t0;
  boxLen += JSON.stringify(sure).length; maxBox = Math.max(maxBox, JSON.stringify(sure).length); keyCount += sure.keys.length;
  const ok = (t) => { const n = normalizeAnswer(t); return Boolean(n) && (norms.has(n) || flexMatch(t, norms, flex)); };
  const subs = new Set();
  for (const a of [...raws, ...norms]) for (const t of variants(a)) subs.add(t);
  for (let i = 0; i < 8; i++) subs.add(allAns[Math.floor(Math.random() * allAns.length)]);
  for (const t of subs) {
    const s = ok(t), h = sureHit(sure, t);
    if (s) { okSubs++; if (!h) okMiss.push([row.id, t]); else { const o = openSoloSure(sure, t); if (!o || o.answer !== row.display_answer || o.explanation !== row.explanation) openBad++; } }
    else { wrongSubs++; if (h) wrongHit.push([row.id, t]); }
  }
}
console.log(JSON.stringify({ questions: r.rows.length, acceptedSubs: okSubs, acceptedMissed: okMiss.length, missSample: okMiss.slice(0, 5), wrongSubs, wrongHit: wrongHit.length, wrongSample: wrongHit.slice(0, 5), openBad,
  makeUsPerQuestion: +(Number(makeNs) / 1000 / r.rows.length).toFixed(1), avgKeys: +(keyCount / r.rows.length).toFixed(2), avgSureBytes: Math.round(boxLen / r.rows.length), maxSureBytes: maxBox }));
await c.end();
