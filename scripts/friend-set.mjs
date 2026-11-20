#!/usr/bin/env node
// =============================================================================
// ★★★ R109 (D-369) — 베타(지인) 주소 표시 켜기 / 끄기 (accounts.is_friend · 0039)
//
//   node scripts/friend-set.mjs --login "a1,b2 c3" --on          (보여 주기만 — 쓰기 0 · exit 2)
//   node scripts/friend-set.mjs --login "a1,b2 c3" --on --yes    (쓰기)
//   node scripts/friend-set.mjs --login a1 --off --yes
//   node scripts/friend-set.mjs --list                           (지인 표시 켜진 계정 · 꺼진 계정 수)
//
// ★ 켜진 계정만 베타 주소(FRIEND_HOSTNAME)에 들어간다. 끄면 그 사람의 베타 주소 로그인이 다음 요청부터 막힌다(기록은 그대로).
// ★ 실 DB(quizweb)가 기본 · DATABASE_URL 로 바꾼다. 한 명 실패(없는 계정)가 나머지를 막지 않는다 · 하나라도 실패면 exit 1.
// ops 메뉴 21 이 이 스크립트를 부른다(아이디 여러 개 · 보여 주기 → 확인 → 실행).
// =============================================================================
import pg from 'pg';
import { adminDb } from './points-admin-lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const die = (m) => {
  console.error(`[friend] ✘ ${m}`);
  process.exit(1);
};
const login = opt('--login', null);
const on = args.includes('--on');
const off = args.includes('--off');
const yes = args.includes('--yes');
const list = args.includes('--list');
if (!list && (!login || on === off)) die('사용: node scripts/friend-set.mjs --login <아이디들> --on|--off [--yes]  ·  --list');

const { url } = adminDb();
const db = new pg.Client({ connectionString: url });
await db.connect();
let fails = 0;
try {
  if (list) {
    const r = await db.query(`SELECT login_id, nickname FROM accounts WHERE is_friend ORDER BY created_at`);
    const n = (await db.query(`SELECT count(*)::int n FROM accounts WHERE NOT is_friend`)).rows[0].n;
    console.log(`[friend] 지인 표시 켜짐 ${r.rows.length}명 · 꺼짐 ${n}명`);
    for (const a of r.rows) console.log(`[friend]   ${a.nickname}(${a.login_id})`);
  } else {
    const logins = [...new Set(login.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    if (!logins.length) die('--login 이 비었다');
    for (const lg of logins) {
      const a = (await db.query(`SELECT id::text, login_id, nickname, is_friend FROM accounts WHERE login_id = $1`, [lg])).rows[0];
      if (!a) {
        fails += 1;
        console.error(`[friend] ✘ 계정 ${lg} 이 없다`);
        continue;
      }
      const what = `${a.nickname}(${a.login_id}) 지금 ${a.is_friend ? '켜짐' : '꺼짐'} → ${on ? '켜기' : '끄기'}`;
      if (!yes) {
        console.log(`[friend] 할 것: ${what}`);
        continue;
      }
      await db.query(`UPDATE accounts SET is_friend = $2 WHERE id = $1`, [a.id, on]);
      console.log(`[friend] ✔ ${what}`);
    }
    if (!yes) {
      console.log('[friend] ★ 맞으면 --yes 를 붙여 다시(지금은 쓰지 않았다)');
      process.exitCode = 2;
    }
  }
} finally {
  await db.end();
}
if (fails) process.exitCode = 1;
