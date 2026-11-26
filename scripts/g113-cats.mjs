#!/usr/bin/env node
// =============================================================================
// G113 2 — 분류 다듬기 (G112 3-2 표 55장 + 이번에 실은 n4401 하나)
//   · 대분류는 바꾸지 않는다 · 출제 묶음(category_game_topics)이 바뀌는 옮김은 막는다(검사)
//   · 새 소분류 11 = G025 꼴(key `L3:<L2>#n` · sort = 부모 끝 +10 · pipeline/src/categories.ts subs 맨 뒤에 같은 이름)
//   · 옮기기 전 category_id → data/pipeline/audit/g113-raw/category-before.json (DB 별)
//   사용 node scripts/g113-cats.mjs [--db quizweb_dev] [--apply | --undo]   (기본 = 확인만)
//   --undo = before 파일대로 category_id 를 되돌리고, 문항이 남지 않은 새 소분류를 지운다
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';

try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const a = process.argv.slice(2);
const mode = a.includes('--undo') ? 'undo' : a.includes('--apply') ? 'apply' : 'dry';
const url = new URL(process.env.DATABASE_URL);
if (a.includes('--db')) url.pathname = '/' + a[a.indexOf('--db') + 1];
const db = url.pathname.slice(1);
const BEFORE = path.join(ROOT, 'data/pipeline/audit/g113-raw/category-before.json');

// 새 소분류: [L2 key, 이름]
const NEW = [
  ['computer', '인공지능'], ['computer', '영상 매체'], ['architecture', '도시 계획'],
  ['world-language', '인공어'], ['world-language', '언어 심리'], ['drinks', '칵테일'],
  ['war-history', '근대 전쟁'], ['war-history', '양차 대전 사이'],
  ['kr-food', '과자'], ['kr-food', '아이스크림'], ['kr-language', '말 유래'],
];
// 옮김: key → [L2 key, 소분류 이름]  (그 밖의 표 줄은 그대로 — 보고 표에 적는다)
const MOVE = {
  n3703: ['computer', '인공지능'], n4409: ['computer', '인공지능'], n5408: ['computer', '영상 매체'],
  n5405: ['architecture', '도시 계획'],
  n4107: ['world-language', '인공어'], n4109: ['world-language', '인공어'],
  n4112: ['world-language', '언어 심리'], n5104: ['world-language', '언어 심리'], n5116: ['world-language', '언어 심리'],
  n4601: ['drinks', '칵테일'], n4608: ['drinks', '칵테일'], n4609: ['drinks', '칵테일'],
  n3905: ['war-history', '근대 전쟁'], n3906: ['war-history', '근대 전쟁'], n3904: ['war-history', '양차 대전 사이'],
  n5001: ['kr-food', '과자'], n5009: ['kr-food', '과자'], n5010: ['kr-food', '과자'], n5008: ['kr-food', '아이스크림'],
  n4706: ['kr-language', '말 유래'],
  // 지금 있는 소분류 중 더 맞는 곳
  n4413: ['invention', '20세기 이후 발명'], n5609: ['world-lit', '고전(고대~18세기)'], n5903: ['world-language', '외래어 어원'],
  n4907: ['olympic', '종목·규정'], n4913: ['combat-athletics', '수영·수상 종목'],
  n4401: ['biology', '분류·진화'], // G113 에서 실은 여섯 장 중 하나(G112 leaf '?')
};
const MARKS = ['#g112-', '#g113-'];

const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
console.log(`[G113 cats] DB ${db} · ${mode}`);

const before = existsSync(BEFORE) ? JSON.parse(readFileSync(BEFORE, 'utf8')) : {};

if (mode === 'undo') {
  const b = before[db]; if (!b) { console.log('되돌릴 기록 없음'); await c.end(); process.exit(0); }
  await c.query('begin');
  let n = 0;
  for (const [id, cid] of Object.entries(b.questions)) n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1', [Number(id), cid])).rowCount;
  let gone = 0;
  for (const id of b.created) gone += (await c.query('delete from categories c where c.id=$1 and not exists(select 1 from questions q where q.category_id=c.id)', [id])).rowCount;
  await c.query('commit');
  delete before[db]; writeFileSync(BEFORE, JSON.stringify(before, null, 1) + '\n');
  console.log(`[G113 cats undo] 되돌린 문항 ${n} · 지운 소분류 ${gone}`);
  await c.end(); process.exit(0);
}

const tree = async () => (await c.query(`select c.id::int, c.key, c.name_ko, c.parent_id::int, c.level, c.sort_order from categories c`)).rows;
let T = await tree();
const l2 = (k) => T.find((r) => r.key === `L2:${k}`);
const leafOf = (k, name) => { const p = l2(k); return T.find((r) => r.level === 3 && r.parent_id === p.id && r.name_ko === name); };

// 새 소분류 계획
const create = [];
for (const [k, name] of NEW) {
  const p = l2(k); if (!p) throw new Error(`L2 없음 ${k}`);
  if (leafOf(k, name)) continue;
  const sibs = T.filter((r) => r.parent_id === p.id);
  const nums = sibs.map((r) => Number(r.key.split('#')[1]));
  const n = Math.max(...nums) + 1 + create.filter((x) => x.k === k).length;
  const sort = Math.max(...sibs.map((r) => r.sort_order)) + 10 * (1 + create.filter((x) => x.k === k).length);
  create.push({ k, name, key: `L3:${k}#${n}`, parent: p.id, sort });
}

// 문항
const Q = (await c.query(`select q.id::int, q.source_ref, q.display_answer, q.category_id::int cid, t.game_topic topic, g.id::int major
  from questions q join category_game_topics t on t.category_id=q.category_id join categories l on l.id=q.category_id join categories m on m.id=l.parent_id join categories g on g.id=m.parent_id
  where q.source_ref like '%#g11_-n____'`)).rows;
const byKey = new Map();
for (const q of Q) for (const mk of MARKS) if (q.source_ref.includes(mk)) byKey.set(q.source_ref.split(mk)[1], q);
const majorOfL2 = (k) => l2(k).parent_id;
const topicOf = (k) => (c.query(`select coalesce(p.game_topic, g.game_topic) t from categories p join categories g on g.id=p.parent_id where p.key=$1`, [`L2:${k}`]));
const plan = [], fail = [];
for (const [key, [k, name]] of Object.entries(MOVE)) {
  const q = byKey.get(key); if (!q) { fail.push(`${key} 문항 없음`); continue; }
  if (majorOfL2(k) !== q.major) fail.push(`${key} 대분류가 바뀐다`);
  const tp = (await topicOf(k)).rows[0].t;
  if (tp !== q.topic) fail.push(`${key} 출제 묶음이 바뀐다 ${q.topic} → ${tp}`);
  const lf = leafOf(k, name);
  if (!lf && !create.some((x) => x.k === k && x.name === name)) fail.push(`${key} 소분류 없음 ${k}/${name}`);
  plan.push({ key, id: q.id, answer: q.display_answer, from: q.cid, to: lf?.id ?? null, k, name });
}
console.log(`[G113 cats] 새 소분류 ${create.length} · 옮김 ${plan.length} · 막힘 ${fail.length}`);
for (const x of create) console.log(`  + ${x.key} ${x.name} (부모 ${x.parent} · sort ${x.sort})`);
for (const f of fail) console.log(`  ✗ ${f}`);
if (fail.length) { await c.end(); process.exit(1); }
if (mode !== 'apply') { console.log('확인만 — 쓰려면 --apply'); await c.end(); process.exit(0); }
if (before[db]) { console.log('★ 이미 옮긴 기록이 있다(멱등) — 먼저 --undo 하거나 그대로 둔다'); await c.end(); process.exit(0); }

await c.query('begin');
try {
  const created = [];
  for (const x of create) {
    const id = (await c.query(`insert into categories (key, name_ko, sort_order, is_active, parent_id, level) values ($1,$2,$3,true,$4,3) returning id::int`, [x.key, x.name, x.sort, x.parent])).rows[0].id;
    created.push(id);
  }
  T = await tree();
  const rec = { at: new Date().toISOString(), created, questions: {} };
  let n = 0;
  for (const p of plan) {
    const to = leafOf(p.k, p.name).id;
    rec.questions[p.id] = p.from;
    n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1', [p.id, to])).rowCount;
  }
  await c.query('commit');
  before[db] = rec; writeFileSync(BEFORE, JSON.stringify(before, null, 1) + '\n');
  console.log(`[G113 cats] 썼다 — 새 소분류 ${created.length}(${created.join(',')}) · 옮긴 문항 ${n}`);
} catch (err) { await c.query('rollback'); console.error(`★ 되돌렸다 — ${err.message}`); await c.end(); process.exit(1); }
await c.end();
