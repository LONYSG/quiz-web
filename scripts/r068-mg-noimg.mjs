#!/usr/bin/env node
// =============================================================================
// ★ R068 (찬종 10-26 ① "사진이 없는 미니게임 항목이 나온다") — 사진이 모자란 미니게임 항목 쉬게 하기(active=false)
//   대상: 서버 NEEDS_IMAGE 와 같은 규칙 — 얼마게요 · 사진 · 얼마나 1장 · 어느 쪽? 2장(양쪽) · 사진 연도 1장. 빅맥은 숫자 게임(그대로).
//   node scripts/r068-mg-noimg.mjs            ← 표만(dry-run)
//   node scripts/r068-mg-noimg.mjs --apply    ← 쓰기(★ 먼저 npm run db:backup) · data/pipeline/audit/r068-mg-noimg-undo.json 에 id 목록
//   node scripts/r068-mg-noimg.mjs --undo     ← 되돌리기(목록의 항목을 active=true 로)
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNDO = path.join(ROOT, 'data/pipeline/audit/r068-mg-noimg-undo.json');
const NEEDS_IMAGE = { price: 1, photo: 1, estimate: 1, which: 2, photoyear: 1 };
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
try {
  if (process.argv.includes('--undo')) {
    const ids = JSON.parse(readFileSync(UNDO, 'utf8')).ids;
    const r = await db.query(`UPDATE minigame_items SET active = true WHERE item_id = ANY($1) RETURNING item_id`, [ids]);
    console.log(`[undo] active=true ${r.rowCount}/${ids.length}`);
  } else {
    const rows = (await db.query(`SELECT item_id, game, coalesce(array_length(image_ids, 1), 0) AS n FROM minigame_items WHERE active ORDER BY item_id`)).rows;
    const off = rows.filter((r) => r.n < (NEEDS_IMAGE[r.game] ?? 0));
    const by = {};
    for (const r of off) by[`${r.game} 사진 ${r.n}장`] = (by[`${r.game} 사진 ${r.n}장`] ?? 0) + 1;
    console.log(`[r068] 사진 모자람 ${off.length} — ${JSON.stringify(by)}`);
    if (process.argv.includes('--apply') && off.length) {
      const ids = off.map((r) => r.item_id);
      writeFileSync(UNDO, JSON.stringify({ round: 'R068', at: new Date().toISOString(), rule: NEEDS_IMAGE, by, ids }, null, 1) + '\n');
      const r = await db.query(`UPDATE minigame_items SET active = false WHERE item_id = ANY($1) AND active RETURNING item_id`, [ids]);
      const after = await db.query(`SELECT game, count(*)::int n FROM minigame_items WHERE active GROUP BY game ORDER BY game`);
      console.log(`[apply] active=false ${r.rowCount} · 되돌리기: node scripts/r068-mg-noimg.mjs --undo · 활성 ${after.rows.map((x) => `${x.game} ${x.n}`).join(' · ')}`);
    }
  }
} finally {
  await db.end();
}
