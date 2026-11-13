#!/usr/bin/env node
// =============================================================================
// 재료 묶음(보낼것/재료-NNN.json) — GEN 끝 손질(gen.md H-3): ① variants(DB 정답 변형 전부) 붙이기 ② 기계 검사 ③ done 확인
//   검사: id 100 · 카드-NNN.txt 와 순서 같음 · fact_id / extra_id 유일 · check 값(맞음 · 틀림 · 못 엶 · 상식 · 엇갈림)
//         맞음 · 틀림 · extra 에 url · quote · 틀림 · 엇갈림 에 fixed · meta.difficulty.now = DB 등급
//   걸리면: done 을 떼고(false) 저장 — VERIFY · gpt 가 읽지 않게 · 통과면 variants 만 붙여 다시 저장(done 그대로)
//   사용  node scripts/tone-material-check.mjs 018 019 … [--dry]   (DB 읽기만 · --dry = 파일 안 씀)
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const OUT = path.join(ROOT, 'web-desk/tone/보낼것');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const CHECKS = new Set(['맞음', '틀림', '못 엶', '상식', '엇갈림']);
const DRY = process.argv.includes('--dry');
for (const n of process.argv.slice(2).filter((x) => x !== '--dry')) {
  const fp = path.join(OUT, `재료-${n}.json`);
  const j = JSON.parse(readFileSync(fp, 'utf8').replace(/^﻿/, ''));
  const order = [...readFileSync(path.join(OUT, `카드-${n}.txt`), 'utf8').matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
  const err = [];
  if (j.done !== true) err.push('done 없음');
  const ids = (j.items ?? []).map((x) => Number(x.id));
  if (ids.length !== order.length || ids.some((id, i) => id !== order[i])) err.push(`id 순서 · 수가 원문과 다름 (${ids.length} / ${order.length})`);
  const rows = (await c.query(`select q.id::int, q.difficulty_score::int difficulty_level,
    coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
    from questions q where q.id = any($1::bigint[])`, [ids])).rows;
  const D = Object.fromEntries(rows.map((r) => [r.id, r]));
  const seen = new Set(); const st = { facts: 0, 틀림: 0, '못 엶': 0, 엇갈림: 0, extra: 0, hold: 0, angle: 0, diffProp: 0 };
  for (const it of j.items ?? []) {
    const d = D[it.id]; if (!d) { err.push(`#${it.id} DB 에 없음`); continue; }
    it.variants = d.variants;
    if (it.hold) st.hold++; if (it.angle) st.angle++;
    if (it.meta?.difficulty?.now !== d.difficulty_level) err.push(`#${it.id} difficulty.now ${it.meta?.difficulty?.now} ≠ DB ${d.difficulty_level}`);
    if (it.meta?.difficulty && it.meta.difficulty.propose !== it.meta.difficulty.now) st.diffProp++;
    for (const f of it.facts ?? []) {
      st.facts++; if (f.check in st) st[f.check]++;
      if (!f.fact_id || seen.has(f.fact_id)) err.push(`#${it.id} fact_id 빠짐/겹침 ${f.fact_id}`); seen.add(f.fact_id);
      if (!CHECKS.has(f.check)) err.push(`${f.fact_id} check '${f.check}'`);
      if ((f.check === '맞음' || f.check === '틀림') && (!f.url || !f.quote)) err.push(`${f.fact_id} url · quote 없음`);
      if ((f.check === '틀림' || f.check === '엇갈림') && !f.fixed) err.push(`${f.fact_id} fixed 없음`);
    }
    for (const e of it.extra ?? []) {
      st.extra++;
      if (!e.extra_id || seen.has(e.extra_id)) err.push(`#${it.id} extra_id 빠짐/겹침 ${e.extra_id}`); seen.add(e.extra_id);
      if (!e.url || !e.quote) err.push(`${e.extra_id} url · quote 없음`);
    }
  }
  if (err.length) j.done = false;
  // done 을 맨 위 가까이 두는 꼴 유지
  const { chunk, done, version, items, ...rest } = j;
  if (!DRY) writeFileSync(fp, JSON.stringify({ chunk, done, version, ...rest, items }, null, 2) + '\n');
  console.log(`재료-${n}`, err.length ? `걸림 ${err.length} → done 뗌` : '통과', JSON.stringify(st));
  for (const e of err.slice(0, 15)) console.log('  ', e);
}
await c.end();
