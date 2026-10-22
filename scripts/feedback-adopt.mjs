#!/usr/bin/env node
// =============================================================================
// ★★ 제보 채택 → 보너스 포인트 (R059 · D-254) — 찬종이 직접 돌리는 명령(세션은 사람에게 묻지 않는다)
//
//   npm run feedback:report -- --no-bots                  ← 먼저 설문을 본다(f#번호)
//   npm run db:backup                                     ← 먼저 백업
//   npm run feedback:adopt -- --id 12 --yes               ← 설문 #12 채택 · 5P
//   npm run feedback:adopt -- --id 12 --points 10 --note "정답 오류 제보" --yes
//
// ★ --yes 가 없으면 무엇을 할지만 찍고 멈춘다(쓰기 0).
// ★ 한 트랜잭션: point_grants(reason feedback_adopted · ref question_feedback) + question_feedback.adopted_at · adopted_grant_id.
// ★ 거부: 없는 번호 · 이미 채택 · 봇 · 검사 계정(검사 DB 에서만 --allow-bot) · 포인트 1~1000 밖 · 메모 200자 넘음.
// =============================================================================
import pg from 'pg';
import { adminDb, die, isBotLogin, short } from './points-admin-lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const sh = await import('../shared/dist/feedback.js').catch(() => ({ FEEDBACK_ADOPT_POINTS: 5 }));
const id = opt('--id', null);
const points = Number(opt('--points', sh.FEEDBACK_ADOPT_POINTS));
const note = opt('--note', null);
const yes = args.includes('--yes');
if (!id || !/^\d+$/.test(id)) die('사용: npm run feedback:adopt -- --id <설문 번호> [--points 5] [--note "..."] --yes');
if (!Number.isInteger(points) || points < 1 || points > 1000) die('--points 는 1~1000 정수');
if (note && [...note].length > 200) die('--note 는 200자까지');

const { url, isTest } = adminDb(args);
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  await db.query('BEGIN');
  const f = (
    await db.query(
      `SELECT f.id::text, f.vote, f.reasons, f.comment, f.adopted_at, a.id::text AS account_id, a.login_id, a.nickname, q.id::text AS qid, q.question_text
         FROM question_feedback f JOIN accounts a ON a.id = f.account_id JOIN questions q ON q.id = f.question_id
        WHERE f.id = $1 FOR UPDATE OF f`,
      [id],
    )
  ).rows[0];
  if (!f) die(`설문 #${id} 가 없다`);
  if (f.adopted_at) die(`설문 #${id} 는 이미 채택됐다(${new Date(f.adopted_at).toISOString()})`);
  if (isBotLogin(f.login_id) && !(isTest && args.includes('--allow-bot'))) die(`봇 · 검사 계정(${f.login_id})의 설문은 채택하지 않는다`);
  const what = `${f.nickname} +${points}P (문제 #${f.qid} ${short(f.question_text, 40)})${f.comment ? ` — 의견 "${short(f.comment, 40)}"` : ''}`;
  if (!yes) {
    await db.query('ROLLBACK');
    console.log(`[adopt] 채택할 것: ${what}`);
    console.log('[adopt] ★ 먼저 npm run db:backup · 맞으면 --yes 를 붙여 다시(지금은 쓰지 않았다)');
    process.exit(2);
  }
  const g = (
    await db.query(
      `INSERT INTO point_grants (account_id, amount, reason, ref_type, ref_id, note) VALUES ($1, $2, 'feedback_adopted', 'question_feedback', $3, $4) RETURNING id::text`,
      [f.account_id, points, id, note],
    )
  ).rows[0];
  await db.query(`UPDATE question_feedback SET adopted_at = now(), adopted_grant_id = $2 WHERE id = $1`, [id, g.id]);
  await db.query('COMMIT');
  console.log(`[adopt] ✔ ${what} · 지급 #${g.id}`);
} catch (err) {
  await db.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  await db.end();
}
