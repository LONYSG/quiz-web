#!/usr/bin/env node
// =============================================================================
// 기존 문제의 대표 정답을 소재 저장소의 usedAnswers 초기값으로 넣는다 (R017 작업 A)
//
// ★★ DB 는 **읽기만** 한다. 쓰지 않는다 (R017 0장).
//
// ★ usedAnswers 는 자동 금지 목록이 아니다.
//   "이 답이 이미 있으니 knowledgePoint 를 특히 주의해서 비교하라" 는 신호일 뿐이다.
//   그래서 이 스크립트는 아무것도 걸러내지 않고 목록만 채운다.
//
// ★ 소분류를 알 수 없는 문제(level 0 플랫 카테고리에 달린 시드 53건 + OpenTDB 10건)는
//   건너뛴다. 소분류별 금지 목록에 넣을 방법이 없다. 그 사실을 보고에 남긴다.
//
// 사용법
//   node scripts/seeds-init-from-db.mjs            전체
//   node scripts/seeds-init-from-db.mjs --only kr-language/1,art/1
// =============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { subIdOf } from '../pipeline/lib/subid.mjs';
import { seedUsedAnswersFromDb } from '../pipeline/lib/seedstore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;

const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb',
});
await client.connect();

try {
  const rows = (
    await client.query(`
      SELECT q.id, q.display_answer, q.status, q.is_active, q.source_id,
             t.mid_key, t.sub_name
        FROM questions q
        LEFT JOIN category_tree t ON q.category_id = t.category_id
       ORDER BY q.id`)
  ).rows;

  let mapped = 0;
  let skipped = 0;
  const bySub = new Map();

  for (const r of rows) {
    if (!r.mid_key || !r.sub_name) {
      skipped += 1;
      continue;
    }
    const midKey = r.mid_key.replace(/^L2:/, '');
    let subId;
    try {
      subId = subIdOf(midKey, r.sub_name);
    } catch {
      skipped += 1;
      continue;
    }
    if (ONLY && !ONLY.has(subId)) continue;
    const arr = bySub.get(subId) ?? [];
    arr.push({
      answer: r.display_answer,
      origin: `db:${r.id}`,
      // ★ is_active=false 인 것도 넣는다. 비활성이어도 "이미 만든 것" 이기 때문이다
      note: `${r.source_id}/${r.status}${r.is_active ? '' : '/inactive'}`,
    });
    bySub.set(subId, arr);
    mapped += 1;
  }

  let added = 0;
  for (const [subId, entries] of [...bySub].sort()) {
    const n = await seedUsedAnswersFromDb(subId, entries);
    added += n;
    console.log(`  ${subId.padEnd(24)} +${n}  ${entries.map((e) => e.answer).join(' / ')}`);
  }

  console.log(`\n[db] 문제 ${rows.length}건 중 소분류 매핑 ${mapped}건 / 소분류 없음 ${skipped}건`);
  console.log(`[store] usedAnswers 신규 ${added}건 (소분류 ${bySub.size}개)`);
} finally {
  await client.end();
}
