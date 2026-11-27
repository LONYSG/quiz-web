// G117 — 재료의 중분류마다 소분류 목록(번호 = key 끝 #n) · 카드 정답 · 질문 앞부분 — 소분류 고르기 참고(읽기만)
import pg from 'pg';
import { loadCards } from './cards.mjs';
process.loadEnvFile?.(new URL('../../../../.env', import.meta.url));
const u = new URL(process.env.DATABASE_URL); u.pathname = '/' + (process.argv[2] || 'quizweb');
const c = new pg.Client({ connectionString: u.toString() }); await c.connect();
const t = (await c.query(`select c.id::int, c.key, c.name_ko, c.parent_id::int, c.level, (select count(*)::int from questions q where q.category_id=c.id and q.is_active) n from categories c`)).rows;
const by = new Map(t.map((r) => [r.id, r]));
const L = loadCards();
console.log(`cards ${L.cards.length} · fix ${JSON.stringify(L.fix)} · need ${JSON.stringify(L.notReady)}`);
const mids = new Map();
for (const x of L.cards) { const k = `${x.mat.major}>${x.mat.mid}`; (mids.get(k) ?? mids.set(k, []).get(k)).push(x); }
for (const [k, xs] of mids) {
  const mid = t.find((r) => r.level === 2 && `${by.get(r.parent_id).name_ko}>${r.name_ko}` === k);
  console.log(`\n## ${k} (${mid?.key})`);
  for (const r of t.filter((r) => r.parent_id === mid?.id).sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }))) console.log(`   ${r.key.split('#')[1]} ${r.name_ko} (${r.n})`);
  for (const x of xs) console.log(`  ${x.key} ${x.card.answer} — ${x.card.question.slice(0, 70)}`);
}
await c.end();
