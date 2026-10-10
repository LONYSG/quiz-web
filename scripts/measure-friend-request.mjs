// =============================================================================
// ★ R044 A-1 — "아이디로 친구 신청할 때 로딩이 길다" 를 **잰다** (추정하지 않는다)
//
//   node scripts/measure-friend-request.mjs [--url http://localhost:3000] [--n 5] [--idle 초]
//
// ★ 잰 것 (같은 신청을 n 번 — 매번 관계를 지우고 다시)
//   1) 소켓: friends.request 보냄 → friends.result 도착 (버튼 로딩이 풀리는 시점)
//   2) 소켓: → friends.state 도착 (보낸 신청 줄이 생기는 시점)
//   3) DB: 서버가 그 사이에 부르는 쿼리를 하나씩 같은 순서로 (pg 직접)
// ★ 테스트 계정(접두어 msr_)만 만들고 끝나면 지운다. 문제 데이터는 건드리지 않는다.
// =============================================================================

import pg from 'pg';
import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = opt('--url', 'http://localhost:3000');
const N = Number(opt('--n', '5'));
/** 요청마다 그 전에 쉬는 초 (서버 DB 풀이 유휴 연결을 닫은 뒤의 첫 요청을 재려고) */
const IDLE = Number(opt('--idle', '0'));
const DB = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const stamp = Date.now().toString(36).slice(-5);

async function auth(loginId, nickname) {
  const post = async (path, body) => {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ck = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('qw_session='));
    return { status: r.status, cookie: ck };
  };
  let r = await post('/api/auth/signup', { loginId, password: 'msr1234', nickname });
  if (r.status !== 200) r = await post('/api/auth/login', { loginId, password: 'msr1234' });
  return r.cookie;
}
const connect = (cookie) =>
  new Promise((res, rej) => {
    const s = io(BASE, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    s.on('connect', () => res(s));
    s.on('connect_error', rej);
  });
const once = (s, ev) => new Promise((r) => s.once(ev, r));
const ms = (t) => Math.round((performance.now() - t) * 10) / 10;

const a = `msr_a${stamp}`;
const b = `msr_b${stamp}`;
const ca = await auth(a, `측정A${stamp}`);
await auth(b, `측정B${stamp}`);
const sa = await connect(ca);
const db = new pg.Client({ connectionString: DB });
await db.connect();
const ids = (await db.query(`SELECT id::text, login_id FROM accounts WHERE login_id = ANY($1)`, [[a, b]])).rows;
const idA = ids.find((r) => r.login_id === a).id;
const idB = ids.find((r) => r.login_id === b).id;

const rows = [];
for (let i = 0; i < N; i += 1) {
  await db.query(`DELETE FROM friendships WHERE requester_id = $1 OR addressee_id = $1`, [idA]);
  await db.query(`DELETE FROM notifications WHERE account_id = $1 OR from_account_id = $1`, [idA]);
  if (IDLE > 0) await new Promise((r) => setTimeout(r, IDLE * 1000));
  const t0 = performance.now();
  const pRes = once(sa, 'friends.result').then(() => ms(t0));
  const pState = once(sa, 'friends.state').then(() => ms(t0));
  sa.emit('friends.request', { loginId: b });
  const [result, state] = await Promise.all([pRes, pState]);
  rows.push({ result, state });
}
// DB 쿼리 하나씩 (서버 순서: 아이디 찾기 → 관계 → 신청 줄 → 알림 줄 · 그 뒤 관계 바뀜 처리)
await db.query(`DELETE FROM friendships WHERE requester_id = $1 OR addressee_id = $1`, [idA]);
const q = async (label, sql, params) => {
  const t = performance.now();
  await db.query(sql, params);
  return [label, ms(t)];
};
const dbTimes = [
  await q('아이디 찾기', `SELECT id::text, nickname FROM accounts WHERE login_id = $1`, [b]),
  await q('관계 찾기', `SELECT requester_id::text, status FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`, [idA, idB]),
  await q('신청 줄 넣기', `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING`, [idA, idB]),
  await q('알림 넣기', `INSERT INTO notifications (account_id, kind, from_account_id) VALUES ($1, 'friend_request', $2)`, [idB, idA]),
];
console.log(JSON.stringify({ base: BASE, n: N, socket: rows, db: dbTimes }, null, 1));
sa.close();
await db.query(`DELETE FROM sessions WHERE account_id = ANY($1::bigint[])`, [[idA, idB]]);
await db.query(`DELETE FROM accounts WHERE login_id = ANY($1)`, [[a, b]]);
await db.end();
process.exit(0);
