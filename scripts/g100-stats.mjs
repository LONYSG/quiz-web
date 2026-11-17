#!/usr/bin/env node
// G100 — 등급별 활성 수(일반 상식 = 카드 묶음 7,147장 중 활성 · 전체 주관식) · 세부 분야별 4·5 · 단계(docs/19 §5) 필요 수 — 읽기만
//   사용 node scripts/g100-stats.mjs [--db quizweb_dev]
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';
const a = process.argv.slice(2);
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const OUT = path.join(ROOT, 'web-desk/tone/보낼것'); const U = new Set();
for (const f of readdirSync(OUT).filter((f) => /^카드-\d{3}\.txt$/.test(f))) for (const l of readFileSync(path.join(OUT, f), 'utf8').split(/\r?\n/)) { const h = l.match(/^\[(\d+)\]/); if (h) U.add(Number(h[1])); }
const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
const rows = (await c.query(`select q.id::int, q.difficulty_score s, coalesce(q.worth,2) w, t.major_name ma, t.mid_name mi from questions q left join category_tree t on t.category_id=q.category_id where q.is_active`)).rows;
await c.end();
const dist = (xs) => [1, 2, 3, 4, 5].map((s) => `${s}:${xs.filter((r) => r.s === s).length}`).join(' · ') + ` (합 ${xs.length})`;
const gen = rows.filter((r) => U.has(r.id));
console.log(`${url.pathname.slice(1)}`);
console.log(`  일반 상식 등급별 ${dist(gen)}`);
console.log(`  전체 활성 등급별 ${dist(rows)}`);
const w3 = (s) => rows.filter((r) => r.s === s && r.w === 3).length;
console.log(`  전체 알가치 3: 등급 4 ${w3(4)} · 등급 5 ${w3(5)} · 등급 3 ${w3(3)}`);
const mid = new Map();
for (const r of rows) { const k = `${r.ma ?? '-'}/${r.mi ?? '-'}`; const o = mid.get(k) ?? { n: 0, g45: 0, g5: 0 }; o.n++; if (r.s >= 4) o.g45++; if (r.s === 5) o.g5++; mid.set(k, o); }
const z = [...mid].filter(([, o]) => o.g45 === 0); const z5 = [...mid].filter(([, o]) => o.g5 === 0);
console.log(`  세부 분야(중분류) ${mid.size} · 4·5 가 0 인 곳 ${z.length}${z.length ? ' — ' + z.map(([k, o]) => `${k}(${o.n})`).join(' · ') : ''}`);
console.log(`  등급 5 가 0 인 곳 ${z5.length}${z5.length ? ' — ' + z5.map(([k, o]) => `${k}(${o.n})`).join(' · ') : ''}`);
