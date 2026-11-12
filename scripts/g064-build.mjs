#!/usr/bin/env node
// G064 — 말투 첫 적용: 문장 고르기(재구성-01 > V052/V053 고친 문장 > 결과-06~12 rewrite) + DB 지금 값(before) 사진
//   쓰는 파일 data/pipeline/tone/g064-plan.json (힌트 · 해설 끝말 작업 전 단계 — g064-apply.json 은 g064-finish.mjs 가 만든다)
//   사용 node scripts/g064-build.mjs   (DB 읽기만 · DATABASE_URL)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const J = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const TONE = 'web-desk/tone/받은것';
const REBUILD = [5463, 3992, 7089, 1, 2, 3, 4, 9, 10, 19, 30, 34, 50, 128, 202, 285, 2931, 2040, 2246];
const SKIP_REBUILD2 = [4167, 7256, 1924, 242, 3725, 305, 1525, 1904, 86, 1623, 2132, 1715, 5014, 549, 6293, 3704, 2346, 6630, 1064, 2420, 6319];
const OFF = { 4183: '세바퀴', 2532: '색약 배려 설계', 22: '사과(Apple)' };
const v52 = J('data/pipeline/audit/v052-tone.json');
const v53 = J('data/pipeline/audit/v053-tone.json');
const items = {}; // id → { id, src, lane, question?, hint?, explanation?, form }
const keep = []; const notLoaded = []; const res = {};
for (const n of ['06', '07', '08', '09', '10', '11', '12']) for (const r of J(`${TONE}/결과-${n}.json`).results) res[r.id] = { ...r, chunk: n };
// 1 재구성-01
const rb = Object.fromEntries(J(`${TONE}/재구성-01.json`).results.map((r) => [r.id, r]));
for (const id of REBUILD) {
  const r = rb[id]; if (!r) throw new Error(`재구성-01 에 ${id} 없음`);
  const it = { id, src: '재구성-01', lane: 'rebuild', question: r.question, hint: r.hint, explanation: r.explanation, claims: r.claims };
  const f = v53[id]?.fixed;
  if (f) { for (const k of ['question', 'hint', 'explanation']) if (f[k]) it[k] = f[k]; it.src = '재구성-01 + V053 fixed(' + Object.keys(f).join('·') + ')'; }
  items[id] = it;
}
// 2 V052 / V053 고친 문장
for (const id of [546, 3909, 4893, 1973, 1487, 363, 3825]) items[id] = { id, src: `V052 fixed_question (${v52[id].verdict})`, lane: 'polish', question: v52[id].fixed_question, chunk: v52[id].chunk };
for (const id of [5547, 6030]) items[id] = { id, src: 'V053 fixed.question', lane: 'polish', question: v53[id].fixed.question, chunk: v53[id].chunk };
for (const id of [368, 1515, 2636]) {
  const w = v53[id].why; const m = w.match(/다듬기:\s*(.+?\?)/) ?? w.match(/—\s*(.+?\?)/);
  if (!m) throw new Error(`${id} 다듬기 문장 못 찾음: ${w}`);
  items[id] = { id, src: 'V053 why 다듬기', lane: 'polish', question: m[1].trim(), chunk: v53[id].chunk };
}
// 3 결과 rewrite / keep / rebuild
const cnt = { rewrite: 0, keep: 0, rebuildSkip: 0, overridden: 0 };
for (const r of Object.values(res)) {
  if (items[r.id]) { cnt.overridden++; continue; }
  if (SKIP_REBUILD2.includes(r.id)) { notLoaded.push({ id: r.id, why: '재구성-02 대상', verdict: r.verdict }); cnt.rebuildSkip++; continue; }
  if (OFF[r.id]) { notLoaded.push({ id: r.id, why: '비활성 3', verdict: r.verdict }); continue; }
  if (r.verdict === 'rewrite') { items[r.id] = { id: r.id, src: `결과-${r.chunk} rewrite`, lane: 'polish', question: r.question, form: r.form, chunk: r.chunk }; cnt.rewrite++; }
  else if (r.verdict === 'keep') { keep.push(r.id); cnt.keep++; }
  else { notLoaded.push({ id: r.id, why: `결과 ${r.verdict} — 목록 밖`, verdict: r.verdict }); }
}
const ids = [...new Set([...Object.keys(items).map(Number), ...keep, ...Object.keys(OFF).map(Number)])];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
const rows = (await c.query(`select q.id::int, q.is_active, q.status, q.inactive_reason, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version,
  coalesce((select array_agg(answer_text order by id) from question_answers x where x.question_id=q.id and not x.is_primary),'{}') variants
  from questions q where q.id = any($1::bigint[])`, [ids])).rows;
await c.end();
const D = Object.fromEntries(rows.map((r) => [r.id, r]));
writeFileSync(path.join(ROOT, `data/pipeline/tone/g064-plan.json`), JSON.stringify({ db, cnt, items, keep, off: OFF, notLoaded, dbRows: D }, null, 1) + '\n');
console.log(db, JSON.stringify(cnt), 'items', Object.keys(items).length, 'keep', keep.length, 'notLoaded', notLoaded.length, 'db rows', rows.length, '/', ids.length);
console.log('inactive among items:', Object.values(items).filter((x) => D[x.id] && !D[x.id].is_active).map((x) => x.id).join(' '));
console.log('inactive among keep:', keep.filter((x) => D[x] && !D[x].is_active).join(' '));
console.log('missing:', ids.filter((x) => !D[x]).join(' '));
console.log('notLoaded:', JSON.stringify(notLoaded));
