#!/usr/bin/env node
// =============================================================================
// ★★ 보너스 포인트 지급 (R059 · D-254) — 월 최다 채택 · 수동 지급. 가짜 미니게임 판 방식은 폐기(0023 이 옮겼다)
//
//   npm run db:backup
//   npm run points:grant -- --login yuja0218 --points 30 --reason feedback_monthly_top --note "2026-10 최다 채택" --yes
//   npm run points:grant -- --login 123qwe --points 50 --reason admin --note "이벤트" --yes
//   npm run points:grant -- --login "a1,b2 c3" --points 50 --reason admin --note "이벤트" --yes   (R100 — 여러 명)
//
// ★ --yes 가 없으면 무엇을 할지만 찍고 멈춘다(쓰기 0). 받은 사람은 다음 로그인 때 토스트를 한 번 본다(seen_at).
// ★ 거부: 없는 계정 · 봇 · 검사 계정(검사 DB 에서만 --allow-bot) · 포인트 1~1000 밖 · reason 이 둘 밖 · 메모 200자 넘음.
// ★★ R100 (C · 찬종 2026-11-13 "아이디 여러 개 치는 상황도 있는데") — --login a,b,c (쉼표 · 공백) = 같은 포인트 · 같은 메모를 한 명씩 차례로.
//   한 명 실패(없는 계정 · 봇)가 나머지를 막지 않는다(한 명 = 한 줄 INSERT) · 끝에 "n명 지급 · 실패 m" · 하나라도 실패면 exit 1.
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

// 같은 아이디를 두 번 적으면 한 번만
const logins = [...new Set(login.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];
if (!logins.length) die('--login 이 비었다');

const { url, isTest } = adminDb();
const db = new pg.Client({ connectionString: url });
await db.connect();
let okN = 0;
const fails = [];
try {
  for (const lg of logins) {
    const a = (await db.query(`SELECT id::text, login_id, nickname FROM accounts WHERE login_id = $1`, [lg])).rows[0];
    if (!a) { fails.push(lg); console.error(`[points] ✘ 계정 ${lg} 이 없다`); continue; }
    if (isBotLogin(a.login_id) && !(isTest && args.includes('--allow-bot'))) { fails.push(lg); console.error(`[points] ✘ 봇 · 검사 계정(${a.login_id})에는 지급하지 않는다`); continue; }
    const what = `${a.nickname}(${a.login_id}) +${points}P · ${reason === 'admin' ? '운영자 지급' : '이달의 제보왕'}${note ? ` — ${note}` : ''}`;
    if (!yes) { console.log(`[grant] 지급할 것: ${what}`); continue; }
    try {
      const g = (await db.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, $2, $3, $4) RETURNING id::text`, [a.id, points, reason, note])).rows[0];
      okN += 1;
      console.log(`[grant] ✔ ${what} · 지급 #${g.id}`);
    } catch (e) {
      fails.push(lg);
      console.error(`[points] ✘ ${lg} 지급 실패: ${e.message}`);
    }
  }
} finally {
  await db.end();
}
if (!yes) {
  console.log('[grant] ★ 먼저 npm run db:backup · 맞으면 --yes 를 붙여 다시(지금은 쓰지 않았다)');
  process.exit(2);
}
if (logins.length > 1 || fails.length) console.log(`[grant] 요약 — ${okN}명 지급 · 실패 ${fails.length}${fails.length ? ` (${fails.join(', ')})` : ''}`);
process.exit(fails.length ? 1 : 0);
