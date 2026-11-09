#!/usr/bin/env node
// =============================================================================
// ★★ 앱 제보 읽기 (R061 · D-255) — app_reports → 콘솔 + tmp/app-reports.md
//
//   npm run reports:report [-- --since 2026-10-23] [--no-bots] [--all]
//   기본은 처리 안 된 것(handled_at 이 빈 것)만 · --all 이면 전부. 최신순.
//   ★ 문항 제보(📝 · "#번호" 가 붙은 것)는 문항별로 묶어 한 번 더 보인다(번호 · 질문 앞 40자 · 정답 · 제보 글들).
//   처리 표시: npm run reports:handle -- --id N --note "R062 반영" --yes
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { short } from './points-admin-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1] !== undefined ? args[args.indexOf(n) + 1] : d);
const SINCE = opt('--since', null);
const NO_BOTS = args.includes('--no-bots');
const ALL = args.includes('--all');
if (SINCE && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
  console.error('--since 는 YYYY-MM-DD');
  process.exit(1);
}
let kindOf = (c) => c;
let reasonOf = (c) => c;
try {
  const sh = await import('../shared/dist/index.js');
  kindOf = sh.reportKindLabel;
  reasonOf = sh.feedbackReasonLabel;
} catch {
  /* 빌드 전 — 코드로 */
}
const kst = (d) => new Date(new Date(d).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
const where = ['true'];
const params = [];
if (!ALL) where.push('r.handled_at IS NULL');
if (SINCE) {
  params.push(SINCE);
  where.push(`r.created_at >= $${params.length}::date`);
}
if (NO_BOTS) where.push(`(a.login_id IS NULL OR a.login_id !~ '^(bot|uic|r10_)')`);
// ★ R086 (D-343) — 맥락 보강(읽기만 · 저장 칸은 그대로): 판 방식(mode · 팀전) · 미니게임 판의 그 시각 라운드(item_key — 주제 게임은 'topic:<slug>')
//   · 라이어 / 캐치마인드 판은 그 시각의 라운드(주제 · 제시어 · 라운드 번호 — 진행 중 라운드는 끝날 때 기록되므로 "제보 뒤 첫 기록 → 없으면 마지막")
//   표가 없는 옛 DB(0032 · 0033 전)에서도 돌게 to_regclass 로 고른다.
const has = async (t) => (await db.query('SELECT to_regclass($1) IS NOT NULL AS ok', [t])).rows[0].ok;
const roundAt = (t) =>
  `LEFT JOIN LATERAL (SELECT x.round, x.topic, x.keyword FROM ${t} x WHERE x.game_id = r.game_id
      ORDER BY (x.created_at >= r.created_at) DESC, CASE WHEN x.created_at >= r.created_at THEN x.created_at END ASC, x.created_at DESC LIMIT 1) ${t[0]}r ON true`;
const LIAR = await has('liar_rounds');
const DRAW = await has('draw_rounds');
const TEAM = (await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'team_mode'`)).rowCount > 0;
const rows = (
  await db.query(
    `SELECT r.id::text, r.created_at, r.kind, r.text, r.reasons, r.screen, r.game_id::text, r.question_id::text, r.question_index,
            r.minigame_key, r.minigame_run_id::text, r.minigame_item, r.device, r.handled_at, r.note,
            r.login_hint, r.ip_hash, coalesce(a.nickname, '(로그인 전)') AS nickname, coalesce(a.login_id ~ '^(bot|uic|r10_)', false) AS bot,
            left(q.question_text, 41) AS qtext, q.display_answer AS qanswer,
            g.mode AS game_mode, ${TEAM ? 'g.team_mode' : 'false'} AS team_mode, mr.item_key AS mg_round_key, mr.round_index AS mg_round,
            ${LIAR ? 'lr.round AS liar_round, lr.topic AS liar_topic, lr.keyword AS liar_keyword' : 'null AS liar_round, null AS liar_topic, null AS liar_keyword'},
            ${DRAW ? 'dr.round AS draw_round, dr.topic AS draw_topic, dr.keyword AS draw_keyword' : 'null AS draw_round, null AS draw_topic, null AS draw_keyword'}
       FROM app_reports r LEFT JOIN accounts a ON a.id = r.account_id LEFT JOIN questions q ON q.id = r.question_id
       LEFT JOIN games g ON g.id = r.game_id
       LEFT JOIN LATERAL (SELECT m.item_key, m.round_index FROM minigame_rounds m WHERE m.run_id = r.minigame_run_id AND m.started_at <= r.created_at
                           ORDER BY m.started_at DESC LIMIT 1) mr ON true
       ${LIAR ? roundAt('liar_rounds') : ''}
       ${DRAW ? roundAt('draw_rounds') : ''}
      WHERE ${where.join(' AND ')}
      ORDER BY r.created_at DESC`,
    params,
  )
).rows;
await db.end();

/** 모니터 해상도 — CSS px × 배율 = 실제 픽셀(1536×864 @1.25 → 1920×1080) */
const screenPx = (d) => {
  const [w, h] = String(d.screen).split('x').map(Number);
  return d.dpr && w && h ? `${Math.round(w * d.dpr)}×${Math.round(h * d.dpr)}` : String(d.screen).replace('x', '×');
};
const ctxOf = (r) =>
  [
    r.game_id && `판 #${r.game_id}${r.game_mode && r.game_mode !== 'quiz' ? `(${r.game_mode})` : ''}${r.team_mode ? '(팀전)' : ''}`,
    r.game_mode === 'liar' && r.liar_topic && `라이어 ${r.liar_round}라운드 · 주제 ${r.liar_topic} · 제시어 ${r.liar_keyword}`,
    r.game_mode === 'draw' && r.draw_topic && `캐치마인드 ${r.draw_round}번째 · 주제 ${r.draw_topic} · 제시어 ${r.draw_keyword}`,
    r.question_id && `문항 #${r.question_id}${r.question_index !== null ? `(${r.question_index}번째)` : ''}`,
    r.minigame_key && `미니게임 ${r.minigame_key}${r.minigame_run_id ? ` #${r.minigame_run_id}` : ''}`,
    r.minigame_item && `문항 ${r.minigame_item}`,
    !r.minigame_item && r.mg_round_key && `${r.mg_round + 1}라운드 ${r.mg_round_key}`,
    r.device?.mobile !== undefined && (r.device.mobile ? '모바일' : 'PC'),
    // ★ R063 — "1536×864 @1.25 · 모니터 1920×1080 · 밤"
    r.device?.viewport && `${r.device.viewport.replace('x', '×')}${r.device.dpr ? ` @${r.device.dpr}` : ''}${r.device.screen ? ` · 모니터 ${screenPx(r.device)}` : ''}`,
    r.device?.theme && r.device.theme !== 'pastel' && r.device.theme,
    r.login_hint && `로그인 전 · 아이디 칸 "${r.login_hint}"`,
    !r.login_hint && r.ip_hash && '로그인 전',
    r.device?.build && `빌드 ${r.device.build}`,
  ]
    .filter(Boolean)
    .join(' · ');
const bodyOf = (r) => [r.reasons.length ? `[${r.reasons.map(reasonOf).join(' · ')}]` : '', r.text].filter(Boolean).join(' ');
const head = `앱 제보 ${rows.length}${ALL ? '(전부)' : '(처리 안 된 것)'}${SINCE ? ` · ${SINCE} 부터` : ''}${NO_BOTS ? ' · 봇 뺌' : ''}`;
console.log(head);
for (const r of rows) {
  console.log(`\n#${r.id} · ${kst(r.created_at)} · ${r.nickname}${r.bot ? ' 🤖' : ''} · ${kindOf(r.kind)} · ${r.screen}${r.handled_at ? ` · ✔ ${r.note ?? '처리'}` : ''}`);
  const c = ctxOf(r);
  if (c) console.log(`  ${c}`);
  console.log(`  ${bodyOf(r).replace(/\n/g, '\n  ')}`);
}
// ★ 문항별 묶음
const byQ = new Map();
for (const r of rows.filter((x) => x.question_id)) {
  const g = byQ.get(r.question_id) ?? { text: r.qtext, answer: r.qanswer, list: [] };
  g.list.push(r);
  byQ.set(r.question_id, g);
}
console.log(`\n문항별 ${byQ.size}`);
for (const [id, g] of byQ) {
  console.log(`  #${id} · ${short(g.text, 40)} → ${g.answer}`);
  for (const r of g.list) console.log(`    - #${r.id} ${r.nickname} · ${bodyOf(r).replace(/\n/g, ' ')}`);
}

const cell = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const md = [
  `# ${head}`,
  '',
  `만든 시각 ${kst(new Date())} (한국) · 처리 표시: \`npm run reports:handle -- --id N --note "R0xx 반영" --yes\``,
  '',
  '| # | 시각 | 누가 | 종류 | 화면 | 맥락 | 글 | 처리 |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.id} | ${kst(r.created_at)} | ${cell(r.nickname)}${r.bot ? ' 🤖' : ''} | ${kindOf(r.kind)} | ${r.screen} | ${cell(ctxOf(r))} | ${cell(bodyOf(r))} | ${r.handled_at ? `✔ ${cell(r.note)}` : ''} |`,
  ),
  '',
  `## 문항별 ${byQ.size}`,
  '',
  ...[...byQ].flatMap(([id, g]) => [`- **#${id}** ${cell(short(g.text, 40))} → ${cell(g.answer)}`, ...g.list.map((r) => `  - #${r.id} ${cell(r.nickname)} · ${cell(bodyOf(r))}`)]),
  '',
].join('\n');
mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
writeFileSync(path.join(ROOT, 'tmp', 'app-reports.md'), md);
console.log('\n→ tmp/app-reports.md');
