// 중분류별 카드 목록 + 소분류 이름(소분류 고르기용 · 읽기만)
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { loadCards } from './cards.mjs';
process.loadEnvFile(new URL('../../../../.env', import.meta.url));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const tree = (await c.query('select id::int, key, name_ko, parent_id::int, level from categories')).rows; await c.end();
const byId = new Map(tree.map((r) => [r.id, r]));
const { cards, drop, notReady, reject } = loadCards();
const g = new Map();
for (const t of cards) { const k = `${t.mat.major}>${t.mat.mid}`; if (!g.has(k)) g.set(k, []); g.get(k).push(t); }
let s = '';
for (const [k, ts] of [...g].sort()) {
  const mid = tree.find((r) => r.level === 2 && `${byId.get(r.parent_id).name_ko}>${r.name_ko}` === k);
  const leaves = mid ? tree.filter((r) => r.parent_id === mid.id).map((r) => `${r.name_ko}#${r.key.split('#')[1]}`).join(' | ') : '★ 중분류 없음';
  s += `## ${k} [${mid?.key}] ${leaves}\n`;
  for (const t of ts) s += `  ${t.key} ${t.card.answer} :: ${t.card.question}\n`;
}
writeFileSync(new URL('./by-mid.txt', import.meta.url), s);
console.log(cards.length, 'drop', drop.length, 'need', notReady.length, 'reject', reject.length, 'mids', g.size);
