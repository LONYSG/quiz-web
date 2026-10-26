#!/usr/bin/env node
// =============================================================================
// G024 F — 끝 점검(hint-check-active)에서 막힌 옛 힌트 2 고침
//   G023 H 가 넣은 변형(537 'SD' · 1876 '엠티브이')이 옛 힌트 글자와 겹쳐 H2 막힘이 됐다(G024 가 쓴 힌트 아님)
//   → 문서로 확인한 두 번째 줄 사실로 바꾼다 · general_hint_version = 'hint-v6'
//   출력  audit/g024-undo-hintfix.json (옛 힌트 · 옛 version)
//   사용  node scripts/g024-apply-hintfix.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { connect, guardNoOpenGames, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';

const UNDO = 'g024-undo-hintfix.json';
const FIX = {
  537: { hint: "피카소는 '아비뇽의 처녀들'을 그릴 때, 고대 이베리아 조각과 아프리카 조각이 지닌 분방한 이 기법에서 실마리를 얻었다고 본다.",
    source: 'https://ko.wikipedia.org/wiki/아비뇽의_처녀들 — "이들 원시 미술이 가진 분방한 데포르메와 충실된 양감은 … 피카소를 경탄하게 하였고 매혹시켰다."' },
  1876: { hint: '1984년 6월 워너는 이 방송을 니켈로디언과 함께 떼어 내 새 상장 회사로 만들었다.',
    source: 'https://en.wikipedia.org/wiki/MTV — "On June 25, 1984, Warner Communications spun-off Nickelodeon and MTV into a new public corporation"' },
};
const DRY = process.argv.includes('--dry-run');
const c = await connect();
try {
  if (MODE === 'undo') {
    const u = readJson(UNDO); if (!DRY) await guardNoOpenGames(c, 'g024 F undo');
    await c.query('begin'); let n = 0;
    for (const [id, o] of Object.entries(u.items)) n += (await c.query('update questions set general_hint=$2, general_hint_version=$3, updated_at=now() where id=$1 and general_hint=$4', [id, o.before.hint, o.before.version, o.after])).rowCount;
    if (DRY) { await c.query('rollback'); console.log(`[g024 F undo] 확인만 — 옛 힌트로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); process.exit(0); }
    await c.query('commit'); console.log(`[g024 F] 되돌렸다 ${n}`); process.exit(0);
  }
  const { rows } = await c.query(`select q.id, q.question_text, q.display_answer, q.explanation, q.general_hint, q.general_hint_version,
      coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants
      from questions q where q.is_active and q.id = any($1::bigint[])`, [Object.keys(FIX)]);
  const todo = [];
  for (const r of rows) {
    const f = FIX[r.id]; if (r.general_hint === f.hint) continue;
    const ck = checkHint({ hint: f.hint, answer: r.display_answer, variants: r.variants, question: r.question_text, explanation: r.explanation ?? '' });
    console.log(`  ${r.id} ${r.display_answer}\n    전: ${r.general_hint}\n    후: ${f.hint} (${len(f.hint)}자 · 막힘 ${ck.block.length} · 경고 ${ck.warn.map((w) => w.kind).join(',') || '없음'})`);
    if (ck.block.length || len(f.hint) > 120) process.exit(1);
    todo.push({ id: r.id, answer: r.display_answer, before: { hint: r.general_hint, version: r.general_hint_version }, after: f.hint, source: f.source });
  }
  console.log(`[g024 F] 쓸 것 ${todo.length}`);
  if (MODE !== 'apply') { console.log('[g024 F] 확인만 — 쓰려면 --apply'); process.exit(0); }
  const at = await guardNoOpenGames(c, 'g024 F');
  const undo = exists(UNDO) ? readJson(UNDO) : { round: 'G024', step: 'F', note: '옛 general_hint · version — --undo', items: {} };
  for (const t of todo) if (!undo.items[t.id]) undo.items[t.id] = t;
  undo.writtenAt = at; writeJson(UNDO, undo);
  await c.query('begin'); let n = 0;
  for (const t of todo) n += (await c.query("update questions set general_hint=$2, general_hint_version='hint-v6', updated_at=now() where id=$1 and general_hint=$3", [t.id, t.after, t.before.hint])).rowCount;
  if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length}`); process.exit(1); }
  await c.query('commit'); console.log(`[g024 F] 썼다 ${n}`);
} finally { await c.end().catch(() => {}); }
