#!/usr/bin/env node
// =============================================================================
// G006 — 같은 정답 활성 문항 쌍의 힌트 겹침 검사 (DB 읽기만)
//   같은 정답(answer_norm)의 활성 문항 A · B 마다
//     ① A 힌트 ↔ B 질문·해설 — 한글·숫자 4글자 구절 · 숫자(2자리 이상) 겹침
//     ② A 힌트 ↔ B 힌트 — 같은 문장(공백·문장부호를 뺀 글자열이 같거나 한쪽이 다른 쪽을 품음)
//   --override <json>  { "<id>": "새 힌트" } — 반영 전에 바꿀 힌트로 미리 돌려 본다
//   --only <json>      검사 결과 가운데 이 id 들이 낀 쌍만 보인다 (G006 반영분)
//   출력: 쌍마다 { a, b, kind, shared } · 끝줄에 합계. 막힘은 없다 — 사람이 읽고 사유를 단다
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OV = arg('--override') ? JSON.parse(readFileSync(arg('--override'), 'utf8')) : {};
const ONLY = arg('--only') ? new Set(JSON.parse(readFileSync(arg('--only'), 'utf8')).map(String)) : null;
const g4 = (s) => { const t = (s ?? '').replace(/[^가-힣0-9]/g, ''); const o = new Set(); for (let i = 0; i + 4 <= t.length; i++) o.add(t.slice(i, i + 4)); return o; };
const nums = (s) => new Set(((s ?? '').match(/\d[\d,.]*\d|\d{2,}/g) ?? []).map((x) => x.replace(/,/g, '')));
const flat = (s) => (s ?? '').replace(/[^가-힣A-Za-z0-9]/g, '');
// 질문·해설에 흔한 틀 구절 — 사실이 아니라 말투라 뺀다
const STOP = new Set(['무엇일까요', '무엇입니까', '무엇인가요', '는무엇일', '은무엇일', '이름은무', '름은무엇', '은무엇인', '는무엇인']);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const { rows } = await c.query(`select q.id, q.question_text q, q.explanation e, q.general_hint h, a.answer_norm n
  from questions q join question_answers a on a.question_id = q.id and a.is_primary where q.is_active`);
await c.end();
for (const r of rows) if (OV[r.id] !== undefined) r.h = OV[r.id];
const by = new Map(); for (const r of rows) { if (!by.has(r.n)) by.set(r.n, []); by.get(r.n).push(r); }
const out = [];
for (const g of by.values()) if (g.length > 1) for (const A of g) for (const B of g) {
  if (A.id === B.id || !A.h) continue;
  if (ONLY && !ONLY.has(String(A.id)) && !ONLY.has(String(B.id))) continue;
  const hg = g4(A.h); const sh = [...g4(`${B.q} ${B.e ?? ''}`)].filter((x) => hg.has(x) && !STOP.has(x));
  const hn = nums(A.h); const sn = [...nums(`${B.q} ${B.e ?? ''}`)].filter((x) => hn.has(x));
  if (sh.length || sn.length) out.push({ a: Number(A.id), b: Number(B.id), kind: 'hint↔other', shared: [...sh.slice(0, 6), ...sn.map((x) => `#${x}`)] });
  if (B.h && Number(A.id) < Number(B.id)) { const fa = flat(A.h), fb = flat(B.h); if (fa === fb || (fa.length > 12 && fb.includes(fa)) || (fb.length > 12 && fa.includes(fb))) out.push({ a: Number(A.id), b: Number(B.id), kind: 'hint=hint', shared: [] }); }
}
for (const o of out) console.log(JSON.stringify(o));
console.log(`[g006-pair-check] 쌍 겹침 ${out.filter((o) => o.kind === 'hint↔other').length} · 힌트=힌트 같은 문장 ${out.filter((o) => o.kind === 'hint=hint').length}${ONLY ? ` (반영분 ${ONLY.size} 이 낀 쌍만)` : ''}`);
