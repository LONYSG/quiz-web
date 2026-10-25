// V027 끝 점검 — 고정 사본(v027-targets)과 지금 DB 비교 (읽기 전용)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const T = JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/v027-targets.json', 'utf8'));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const ids = Object.keys(T.items).filter((i) => T.items[i].active).map(Number);
const rows = (await c.query('select id, question_text, display_answer, explanation, general_hint, is_active from questions where id = any($1)', [ids])).rows;
const act = (await c.query('select count(*)::int n from questions where is_active')).rows[0].n;
const va = (await c.query('select question_id, answer_text from question_answers where question_id = any($1) and not is_primary', [ids])).rows;
await c.end();
const vm = {}; for (const v of va) (vm[v.question_id] ||= []).push(v.answer_text);
const diff = { question: [], answer: [], explanation: [], hint: [], variants: [], inactive: [], missing: [] };
const byId = new Map(rows.map((r) => [Number(r.id), r]));
for (const id of ids) { const r = byId.get(id); const t = T.items[id]; if (!r) { diff.missing.push(id); continue; }
  if (!r.is_active) diff.inactive.push(id); if (r.question_text !== t.question) diff.question.push(id); if (r.display_answer !== t.answer) diff.answer.push(id); if ((r.explanation ?? '') !== (t.explanation ?? '')) diff.explanation.push(id); if ((r.general_hint ?? '') !== (t.hint ?? '')) diff.hint.push(id);
  const a = [...(vm[id] || [])].sort().join('|'), b = [...(t.variants || [])].sort().join('|'); if (a !== b) diff.variants.push(id); }
const out = { activeNow: act, activeAtStart: T.activeAtStart, targets: ids.length, counts: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.length])), diff };
fs.writeFileSync('C:/work/quiz-web/data/pipeline/audit/v027-endcheck.json', JSON.stringify(out));
console.log(JSON.stringify({ activeNow: act, activeAtStart: T.activeAtStart, targets: ids.length, counts: out.counts }));
