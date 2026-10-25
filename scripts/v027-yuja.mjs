// V027 — yuja 판 2(2146 · 2185) 문항별 결과: 엄격(브리핑: 진지14+yuja) / 포함(+ lonysg2 = 2185 판의 찬종 둘째 계정) — 읽기 전용
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query(`select gq.game_id, gq.question_index, gq.question_id, gq.resolution, a.login_id win, (select min(ae.response_ms) from answer_events ae where ae.game_id=gq.game_id and ae.question_index=gq.question_index and ae.account_id=gq.winner_account_id and ae.matched and ae.accepted) ms from game_questions gq left join accounts a on a.id=gq.winner_account_id where gq.game_id in (2146,2185) order by 1,2`)).rows;
await c.end();
const STRICT = new Set(['lonysg','yuja0218','hooni']);
const out = rows.map((r) => ({ game: +r.game_id, idx: r.question_index, qid: +r.question_id, resolution: r.resolution, winner: r.win, ms: r.ms, strictSolved: STRICT.has(r.win), inclSolved: !!r.win && (STRICT.has(r.win) || r.win === 'lonysg2') }));
fs.writeFileSync('C:/work/quiz-web/data/pipeline/audit/v027-yuja.json', JSON.stringify(out));
const s = (f) => out.filter(f).length; console.log({ n: out.length, strictUnsolved: s((x) => !x.strictSolved), inclUnsolved: s((x) => !x.inclSolved) });
