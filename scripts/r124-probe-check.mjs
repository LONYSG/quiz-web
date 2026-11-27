// ★★ R124 — 혼자 하기 "분명히 틀린 답" 미리 보기 전수 대조(읽기만): node scripts/r124-probe-check.mjs <DB_URL> — 맞는 제출이 통에 안 드는 것 0 이어야 한다 · 틀린 답 중 서버를 기다리는 비율
import pg from 'pg';
import { answerProbeKeys, flexAnswerSet, flexMatch, normalizeAnswer, probeBucket } from '../shared/dist/index.js';
const c = new pg.Client({ connectionString: process.argv[2] }); await c.connect();
const r = await c.query(`SELECT q.id, array_agg(qa.answer_text) raw, array_agg(qa.answer_norm) norm FROM questions q JOIN question_answers qa ON qa.question_id=q.id WHERE q.is_active GROUP BY q.id`);
let checked = 0, bad = [], wrongTried = 0, wrongMaybe = 0;
const allAns = r.rows.map((x) => x.raw[0]);
for (const row of r.rows) {
  const norms = new Set(row.norm.filter(Boolean)); const flex = flexAnswerSet(row.raw, norms);
  const salt = (Math.random() * 2 ** 32) >>> 0;
  const B = new Set([...norms, ...flex].map((k) => probeBucket(salt, k)));
  const maybe = (t) => answerProbeKeys(t).some((k) => B.has(probeBucket(salt, k)));
  const ok = (t) => { const n = normalizeAnswer(t); return Boolean(n) && (norms.has(n) || flexMatch(t, norms, flex)); };
  for (const a of row.raw) for (const t of [a, a + '이다', a + '입니다!', ' ' + a + ' ', a.replace(/\s+/g, ''), a.toUpperCase(), a + '요']) {
    if (!ok(t)) continue; checked++; if (!maybe(t)) bad.push([row.id, t]);
  }
  for (let i = 0; i < 5; i++) { const t = allAns[Math.floor(Math.random() * allAns.length)]; if (ok(t)) continue; wrongTried++; if (maybe(t)) wrongMaybe++; }
}
console.log(JSON.stringify({ questions: r.rows.length, acceptedSubs: checked, missed: bad.length, sample: bad.slice(0, 5), wrongTried, wrongWaitServer: wrongMaybe, rate: +(wrongMaybe / wrongTried * 100).toFixed(2) }));
await c.end();
