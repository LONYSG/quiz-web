// V027 대상 — 진지 계정 14 + yuja0218 의 퀴즈 판 노출·사람 결과 (읽기 전용 · 시작 직후 한 번)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const OUT = 'C:/work/quiz-web/data/pipeline/audit/v027-targets.json';
const SER = ['lonysg','overfolding','sex','rlarudqls123','timer1346','overf','sexmaster','kcg961123','qwe','garlicbread','timer136','ghfj761','123qwe','hooni'];
const YU = 'yuja0218';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const accs = (await c.query('select id, login_id from accounts where login_id = any($1)', [[...SER, YU]])).rows;
const serIds = accs.filter((a) => SER.includes(a.login_id)).map((a) => Number(a.id));
const yuId = Number(accs.find((a) => a.login_id === YU).id);
const allIds = [...serIds, yuId];
const games = (await c.query(`select g.id, g.started_at, g.ended_at from games g where g.mode='quiz' and exists (select 1 from game_players gp where gp.game_id=g.id and gp.account_id = any($1)) order by g.id`, [allIds])).rows;
const gids = games.map((g) => Number(g.id));
const gp = (await c.query('select game_id, account_id from game_players where game_id = any($1) and account_id = any($2)', [gids, allIds])).rows;
const room = {}; for (const r of gp) (room[r.game_id] ||= new Set()).add(Number(r.account_id));
const gq = (await c.query(`select gq.game_id, gq.question_index, gq.question_id, gq.resolution, gq.winner_account_id, gq.started_at from game_questions gq where gq.game_id = any($1) order by gq.game_id, gq.question_index`, [gids])).rows;
const ev = (await c.query(`select game_id, question_index, question_id, account_id, response_ms, matched, accepted from answer_events where game_id = any($1) and account_id = any($2) and matched and accepted`, [gids, allIds])).rows;
const evk = {}; for (const e of ev) (evk[`${e.game_id}:${e.question_index}`] ||= []).push(e);
const exp = [];
for (const q of gq) {
  const k = `${q.game_id}:${q.question_index}`;
  const members = room[q.game_id] ? [...room[q.game_id]] : [];
  const evs = evk[k] || [];
  const w = q.winner_account_id ? Number(q.winner_account_id) : null;
  const winEv = evs.filter((e) => e.account_id === String(w) || Number(e.account_id) === w);
  const ms = winEv.length ? Math.min(...winEv.map((e) => e.response_ms)) : (evs.length ? Math.min(...evs.map((e) => e.response_ms)) : null);
  const solvedBySer = w !== null && allIds.includes(w);
  exp.push({ game: Number(q.game_id), idx: q.question_index, qid: Number(q.question_id), resolution: q.resolution, room: members.length, yuja: members.includes(yuId), solved: solvedBySer, ms: solvedBySer ? ms : null, winnerBot: w !== null && !solvedBySer });
}
const qids = [...new Set(exp.map((e) => e.qid))];
const rows = (await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.difficulty_score, q.is_active, ct.mid_name, ct.sub_name, ct.major_name, c.game_topic from questions q left join categories c on c.id=q.category_id left join category_tree ct on ct.category_id=q.category_id where q.id = any($1)`, [qids])).rows;
const vars = (await c.query('select question_id, answer_text, is_primary from question_answers where question_id = any($1)', [qids])).rows;
const activeCount = (await c.query('select count(*)::int n from questions where is_active')).rows[0].n;
await c.end();
const vmap = {}; for (const v of vars) (vmap[v.question_id] ||= []).push(v);
const byQ = {};
for (const e of exp) (byQ[e.qid] ||= []).push(e);
const items = {};
for (const r of rows) {
  const es = byQ[r.id] || [];
  const ser = es.filter((e) => !e.yuja), yu = es.filter((e) => e.yuja);
  const stat = (arr) => { const solved = arr.filter((e) => e.solved); const ms = solved.map((e) => e.ms).filter((x) => x != null);
    return { n: arr.length, solved: solved.length, fastestMs: ms.length ? Math.min(...ms) : null, rooms: arr.map((e) => e.room), msList: ms }; };
  const bandOf = (ms) => ms == null ? 'none' : ms < 10000 ? 'pre' : ms < 25000 ? 'hint1' : 'chosung';
  const all = stat(es);
  items[r.id] = { id: Number(r.id), active: r.is_active, question: r.question_text, answer: r.display_answer, variants: (vmap[r.id] || []).filter((v) => !v.is_primary).map((v) => v.answer_text), explanation: r.explanation, hint: r.general_hint, category: [r.major_name, r.mid_name, r.sub_name].filter(Boolean).join(' > '), gameTopic: r.game_topic, curDif: r.difficulty_score,
    human: { n: all.n, solved: all.solved, fastestMs: all.fastestMs, band: bandOf(all.fastestMs), msList: all.msList, rooms: all.rooms, yuja: yu.length ? { n: yu.length, solved: stat(yu).solved, fastestMs: stat(yu).fastestMs, band: bandOf(stat(yu).fastestMs) } : null, ser: stat(ser) } };
}
const act = Object.values(items).filter((x) => x.active);
const out = { builtAt: new Date().toISOString(), activeAtStart: activeCount, games: games.length, gameIds: gids, exposures: exp.length, questionsUnique: qids.length, activeTargets: act.length, inactiveTargets: qids.length - act.length, items };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log({ games: games.length, exposures: exp.length, unique: qids.length, active: act.length, inactive: qids.length - act.length, activeAtStart: activeCount, yujaExposures: exp.filter((e) => e.yuja).length, botWinner: exp.filter((e) => e.winnerBot).length });
