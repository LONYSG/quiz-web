#!/usr/bin/env node
// =============================================================================
// G025 E — 분야 L3 신설(문항 ≥3 인 후보만) + 문항 재배치
//   입력  audit/g025-plan.json l3[]{name · parent · ids · create} · pending54
//   행 꼴  0003 그대로 — key `L3:<부모 L2 key 의 접미>#<다음 번호>` · sort_order = 부모의 마지막 L3 +10 · level 3 · is_active
//          game_topic 은 비움 — category_game_topics 는 **뷰**(0009 · 가장 가까운 조상의 값)라 형제 L3 와 같은 값을 저절로 받는다
//          ★ 정본 트리 pipeline/src/categories.ts 의 subs 맨 뒤에도 같은 이름을 붙였다(번호 = 순번 · 앞 key 안 밀림)
//   출력  audit/g025-undo-category.json (신설 행 id · 옮긴 문항의 옛 category_id) · audit/g025-category-pending.json
//   사용  node scripts/g025-apply-category.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, MODE } from './g023-common.mjs';

const UNDO = 'g025-undo-category.json';
const DRY = process.argv.includes('--dry-run');
const plan = readJson('g025-plan.json');
// 대기 54 가운데 신설 L3 로 옮기지 않는 것의 이유(GEN 이 다시 읽음 — G024 이유 그대로면 'G024 그대로')
const STAY = {
  3383: '디즈니 밖 극장 애니 L3 보류(슈렉 2 뿐) — 지금(디즈니·픽사 극장 애니메이션)이 가장 가까움',
  4856: '출판·그림책 L3 보류(2 뿐) — 지금(그래픽 디자인) 유지',
  6175: '출판·그림책 L3 보류(2 뿐) — 지금(퍼즐) 유지',
  6757: '세계 인물 L3 신설 없음(설계 결정) — 지금(인구·통계 개념)이 가장 가까움',
};
const c = await connect();
try {
  const { rows: C } = await c.query('select id, key, name_ko, level, parent_id, sort_order from categories');
  const cat = new Map(C.map((r) => [r.id, r]));
  const pathOf = (id) => { const p = []; let r = cat.get(id); while (r) { p.unshift(r.name_ko); r = cat.get(r.parent_id); } return p.join(' > '); };
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, 'g025 E undo');
    await c.query('begin'); let n = 0, d = 0;
    for (const [id, o] of Object.entries(u.moved)) n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1 and category_id=$3', [id, o.before, o.after])).rowCount;
    for (const r of u.created) d += (await c.query('delete from categories where id=$1 and key=$2 and not exists (select 1 from questions where category_id=$1)', [r.id, r.key])).rowCount;
    if (DRY) { await c.query('rollback'); console.log(`[g025 E undo] 확인만 — 옛 분야로 ${n}/${Object.keys(u.moved).length} · 지울 L3 ${d}/${u.created.length}`); process.exit(0); }
    await c.query('commit'); console.log(`[g025 E] 되돌렸다 문항 ${n} · L3 ${d}`); process.exit(0);
  }
  // 신설 계획: 부모마다 다음 번호 · 다음 sort_order
  const next = new Map();
  const rows = [];
  for (const x of plan.l3.filter((l) => l.create)) {
    const p = cat.get(x.parent);
    const kids = C.filter((r) => r.parent_id === x.parent && r.level === 3);
    const pre = p.key.replace(/^L2:/, '');
    const st = next.get(x.parent) ?? { no: Math.max(...kids.map((k) => Number(k.key.split('#')[1]))), so: Math.max(...kids.map((k) => k.sort_order)) };
    st.no += 1; st.so += 10; next.set(x.parent, st);
    const key = `L3:${pre}#${st.no}`;
    const have = C.find((r) => r.parent_id === x.parent && r.name_ko === x.name && r.level === 3);
    rows.push({ key, name: x.name, parent: x.parent, sort: st.so, have: have?.id ?? null, ids: x.ids });
  }
  const { rows: Q } = await c.query('select id, display_answer, category_id from questions where is_active and id = any($1::bigint[])', [rows.flatMap((r) => r.ids)]);
  const QA = new Map(Q.map((r) => [String(r.id), r]));
  console.log(`[g025 E] 신설 L3 ${rows.length} (이미 있음 ${rows.filter((r) => r.have).length})`);
  for (const r of rows) console.log(`  ${r.key} ${pathOf(r.parent)} > ${r.name} · sort ${r.sort} · 문항 ${r.ids.length}${r.have ? ` (이미 id ${r.have})` : ''}`);
  const movedIds = new Set(rows.flatMap((r) => r.ids.map(String)));
  const pending = plan.pending54.filter((p) => !movedIds.has(String(p.id))).map((p) => ({ ...p, why: STAY[p.id] ?? `G024 그대로 — ${p.why}` }));
  writeJson('g025-category-pending.json', { round: 'G025', step: 'E', note: 'G024 대기 54 가운데 신설 L3 로 옮기지 않은 것(이유) — 옮긴 것은 g025-undo-category.json', n: pending.length, items: pending });
  console.log(`[g025 E] 대기 54 → 옮김 ${plan.pending54.length - pending.length} · 그대로 ${pending.length}`);
  if (MODE !== 'apply') {
    for (const r of rows) for (const id of r.ids) { const q = QA.get(String(id)); console.log(`  ${id} ${q?.display_answer}: ${pathOf(q?.category_id)} → ${r.name}`); }
    console.log('[g025 E] 확인만 — 쓰려면 --apply'); process.exit(0);
  }
  const at = await guardNoOpenGames(c, 'g025 E'); const a0 = await activeCount(c);
  await c.query('begin');
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G025', step: 'E', note: '신설 L3 와 옮긴 문항의 옛 category_id — node scripts/g025-apply-category.mjs --undo', created: [], moved: {} };
  let made = 0, n = 0;
  for (const r of rows) {
    let id = r.have;
    if (!id) {
      id = (await c.query('insert into categories (key, name_ko, sort_order, is_active, parent_id, level) values ($1,$2,$3,true,$4,3) returning id', [r.key, r.name, r.sort, r.parent])).rows[0].id;
      undo.created.push({ id, key: r.key, name: r.name, parent: r.parent }); made++;
    }
    for (const q of r.ids) {
      const cur = QA.get(String(q)); if (!cur || cur.category_id === id) continue;
      n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1 and category_id=$3', [q, id, cur.category_id])).rowCount;
      undo.moved[q] ??= { answer: cur.display_answer, before: cur.category_id, after: id, beforeName: pathOf(cur.category_id), afterName: `${pathOf(r.parent)} > ${r.name}` };
    }
  }
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('commit');
  const l3 = (await c.query('select count(*)::int n from categories where is_active and level=3')).rows[0].n;
  const gt = (await c.query('select count(*)::int n, count(game_topic)::int t from category_game_topics')).rows[0];
  console.log(`[g025 E] 썼다 L3 ${made} · 문항 ${n} · ${at} · 활성 ${a0} → ${await activeCount(c)} · L3 ${l3} · category_game_topics ${gt.n}(topic 있음 ${gt.t})`);
} finally { await c.end().catch(() => {}); }
