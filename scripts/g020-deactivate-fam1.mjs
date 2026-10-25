#!/usr/bin/env node
// =============================================================================
// G020 — 정답 친숙도 1 확정 비활성 (CV-68 · CV-71 (a) — 찬종 결정 2026-10-26)
//   대상  audit/v023-cross.json mid/top[id] 가운데 confirmed && !verifyLikely2 (확정 268 − "2 로 보임" 22 = 246)
//   ★ V027 이 보는 문항(audit/v027-targets.json items 의 id)은 건너뛴다(브리핑 — 겹침 수는 0절) · 경계(confirmed false) 182 는 그대로
//   출력  data/pipeline/audit/g020-undo-fam1.json  ★ 되돌리기 목록 — ids(비활성한 것) · skippedV027 · 되돌리기 SQL 한 줄
//   사용  node scripts/g020-deactivate-fam1.mjs [--apply]   (확인만이 기본 · 멱등 — 이미 같은 사유로 비활성이면 이미 됨)
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const APPLY = process.argv.includes('--apply');
const J = (f) => JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit', f), 'utf8'));
const REASON = '친숙도 1(V023)';
const cross = J('v023-cross.json');
const T = new Set(Object.keys(J('v027-targets.json').items).map(Number));
const all = [...Object.values(cross.mid), ...Object.values(cross.top)];
const confirmed = all.filter((x) => x.confirmed);
const likely2 = confirmed.filter((x) => x.verifyLikely2);
const target = confirmed.filter((x) => !x.verifyLikely2);
const skipV027 = target.filter((x) => T.has(x.id));
const todo = target.filter((x) => !T.has(x.id));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
try {
  const { rows } = await c.query('select id, is_active, inactive_reason from questions where id = any($1::bigint[])', [todo.map((x) => x.id)]);
  const D = new Map(rows.map((r) => [Number(r.id), r]));
  const done = todo.filter((x) => D.get(x.id) && !D.get(x.id).is_active && D.get(x.id).inactive_reason === REASON);
  const other = todo.filter((x) => D.get(x.id) && !D.get(x.id).is_active && D.get(x.id).inactive_reason !== REASON);
  const go = todo.filter((x) => D.get(x.id)?.is_active);
  const missing = todo.filter((x) => !D.get(x.id));
  const band = (xs) => xs.reduce((a, x) => (a[x.band ?? (cross.top[x.id] ? 'top' : 'mid')] = (a[x.band ?? (cross.top[x.id] ? 'top' : 'mid')] ?? 0) + 1, a), {});
  console.log(`[fam1] 확정 ${confirmed.length} · 2 로 보임 ${likely2.length} · 대상 ${target.length} · V027 겹침 건너뜀 ${skipV027.length} · 할 일 ${go.length} · 이미 됨 ${done.length} · 다른 사유로 비활성 ${other.length} · 없음 ${missing.length}`);
  console.log('  할 일 묶음', JSON.stringify(band(go)), '· 겹침', JSON.stringify(band(skipV027)));
  for (const x of other) console.log('  다른 사유', x.id, D.get(x.id).inactive_reason);
  if (missing.length) { console.error('★ 없는 id', missing.map((x) => x.id)); process.exit(1); }
  if (!APPLY) { console.log('[fam1] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const ids = [...done, ...go].map((x) => x.id).sort((a, b) => a - b);
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g020-undo-fam1.json'), JSON.stringify({ round: 'G020', at: new Date().toISOString(), reason: REASON,
    note: '친숙도 1 확정(v023-cross confirmed && !verifyLikely2) 비활성 목록. 되돌리기: update questions set is_active=true, inactive_reason=null, updated_at=now() where id = any(ids) and inactive_reason = \'친숙도 1(V023)\'',
    counts: { confirmed: confirmed.length, likely2: likely2.length, target: target.length, skippedV027: skipV027.length, deactivated: ids.length },
    ids, skippedV027: skipV027.map((x) => ({ id: x.id, answer: x.answer })), likely2Kept: likely2.map((x) => ({ id: x.id, answer: x.answer })),
    items: [...done, ...go].map((x) => ({ id: x.id, answer: x.answer, topic: x.topic, band: x.band ?? null, pct1: x.pct1, pct2: x.pct2 })) }, null, 1) + '\n');
  if (!go.length) { console.log('[fam1] 할 일 0'); process.exit(0); }
  await c.query('begin');
  const n = (await c.query('update questions set is_active=false, inactive_reason=$2, updated_at=now() where id = any($1::bigint[]) and is_active', [go.map((x) => x.id), REASON])).rowCount;
  if (n !== go.length) { await c.query('rollback'); console.error(`★ ${n}/${go.length} — 되돌렸다`); process.exit(1); }
  await c.query('commit');
  console.log(`[fam1] 썼다 — 비활성 ${n}`);
} finally { await c.end(); }
