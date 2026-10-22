#!/usr/bin/env node
// =============================================================================
// ★★ 보너스 포인트 지급 (R059 · D-254) — 월 최다 채택 · 수동 지급. 가짜 미니게임 판 방식은 폐기(0023 이 옮겼다)
//
//   npm run db:backup
//   npm run points:grant -- --login yuja0218 --points 30 --reason feedback_monthly_top --note "2026-10 최다 채택" --yes
//   npm run points:grant -- --login 123qwe --points 50 --reason admin --note "이벤트" --yes
//
// ★ --yes 가 없으면 무엇을 할지만 찍고 멈춘다(쓰기 0). 받은 사람은 다음 로그인 때 토스트를 한 번 본다(seen_at).
// ★ 거부: 없는 계정 · 봇 · 검사 계정(검사 DB 에서만 --allow-bot) · 포인트 1~1000 밖 · reason 이 둘 밖 · 메모 200자 넘음.
// =============================================================================
import pg from 'pg';
import { adminDb, die, isBotLogin } from './points-admin-lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const login = opt('--login', null);
const points = Number(opt('--points', NaN));
const reason = opt('--reason', null);
const note = opt('--note', null);
const yes = args.includes('--yes');
if (!login || !reason) die('사용: npm run points:grant -- --login <login_id> --points N --reason feedback_monthly_top|admin [--note "..."] --yes');
if (!['feedback_monthly_top', 'admin'].includes(reason)) die('--reason 은 feedback_monthly_top 또는 admin (채택은 npm run feedback:adopt)');
if (!Number.isInteger(points) || points < 1 || points > 1000) die('--points 는 1~1000 정수');
if (note && [...note].length > 200) die('--note 는 200자까지');

const { url, isTest } = adminDb();
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  const a = (await db.query(`SELECT id::text, login_id, nickname FROM accounts WHERE login_id = $1`, [login])).rows[0];
  if (!a) die(`계정 ${login} 이 없다`);
  if (isBotLogin(a.login_id) && !(isTest && args.includes('--allow-bot'))) die(`봇 · 검사 계정(${a.login_id})에는 지급하지 않는다`);
  const what = `${a.nickname}(${a.login_id}) +${points}P · ${reason === 'admin' ? '운영자 지급' : '이달의 제보왕'}${note ? ` — ${note}` : ''}`;
  if (!yes) {
    console.log(`[grant] 지급할 것: ${what}`);
    console.log('[grant] ★ 먼저 npm run db:backup · 맞으면 --yes 를 붙여 다시(지금은 쓰지 않았다)');
    process.exit(2);
  }
  const g = (await db.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, $2, $3, $4) RETURNING id::text`, [a.id, points, reason, note])).rows[0];
  console.log(`[grant] ✔ ${what} · 지급 #${g.id}`);
} finally {
  await db.end();
}
