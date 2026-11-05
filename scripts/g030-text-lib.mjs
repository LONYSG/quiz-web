// =============================================================================
// G030 — 글 반영 공용(g030-apply-read.mjs · g030-apply-hints12.mjs) — g029-apply-v032.mjs 꼴(멱등 · --dry-run 기본 · --apply · --undo)
//   입력  data/pipeline/audit/g030-plan-text.json 의 part(GEN 최종 — before · after · why)
//   적용 직전 다시: 지금 DB 값 = before(또는 이미 우리 after) · 열 화이트리스트 · 등급 제한 · 힌트 checkHint 막힘 0 · 해설 겹침 0 · 빈칸 0 · 120자
//                   · 질문 240자 · 질문에 정답·변형 글자 없음(normalizeAnswer · 낱말 경계 아님 — 더 엄하게) · 판 열림 0
//   general_hint_version · difficulty_score · worth · is_active 는 건드리지 않는다
// =============================================================================
import { connect, guardNoOpenGames, activeCount, readJson, writeJson, exists, len, MODE } from './g023-common.mjs';
import { checkHint } from './hint-check.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const COLS = ['general_hint', 'explanation', 'question_text'];

/** opts: { part, undoFile, tag, cols(쓸 수 있는 열), grades(허용 등급 배열 | null) } */
export async function runText({ part, undoFile, tag, cols, grades }) {
  const DRY = process.argv.includes('--dry-run');
  const plan = readJson('g030-plan-text.json')[part];
  if (!plan) { console.error(`plan part '${part}' 없음`); process.exit(1); }
  const c = await connect();
  try {
    if (MODE === 'undo') {
      const u = readJson(undoFile); if (!DRY) await guardNoOpenGames(c, `${tag} undo`);
      await c.query('begin'); let n = 0;
      for (const [id, o] of Object.entries(u.items)) {
        n += (await c.query(`update questions set general_hint=$2, explanation=$3, question_text=$4, updated_at=now()
            where id=$1 and general_hint is not distinct from $5 and explanation is not distinct from $6 and question_text is not distinct from $7`,
        [id, ...COLS.map((k) => o.before[k]), ...COLS.map((k) => o.after[k])])).rowCount;
      }
      if (DRY) { await c.query('rollback'); console.log(`[${tag} undo] 확인만 — 옛 값으로 돌아갈 행 ${n}/${Object.keys(u.items).length}`); }
      else { await c.query('commit'); console.log(`[${tag}] 되돌렸다 ${n}`); }
      return;
    }
    const ids = Object.keys(plan);
    const { rows } = await c.query(`select q.id, q.is_active, q.difficulty_score g, q.display_answer, q.question_text, q.general_hint, q.explanation,
        coalesce((select array_agg(answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants from questions q where q.id = any($1::bigint[])`, [ids]);
    const D = new Map(rows.map((r) => [String(r.id), r]));
    const undo = exists(undoFile) ? readJson(undoFile) : { round: 'G030', note: '옛 general_hint · explanation · question_text — --undo', items: {} };
    const todo = []; const skipped = []; let done = 0;
    for (const id of ids) {
      const r = D.get(id); const p = plan[id];
      if (!r?.is_active) { skipped.push([id, '활성 아님']); continue; }
      if (grades && !grades.includes(r.g)) { skipped.push([id, `등급 ${r.g} — 허용 ${grades.join('·')} 아님`]); continue; }
      const extra = Object.keys(p.after).filter((k) => !cols.includes(k));
      if (extra.length) { skipped.push([id, `허용 밖 열 ${extra.join(',')}`]); continue; }
      const cur = Object.fromEntries(COLS.map((k) => [k, r[k]]));
      const after = Object.fromEntries(COLS.map((k) => [k, k in p.after ? p.after[k] : r[k]]));
      if (COLS.every((k) => cur[k] === after[k])) { done++; continue; }
      const prevAfter = undo.items[id]?.after;
      const sameBefore = COLS.every((k) => !(k in p.after) || cur[k] === p.before[k]);
      const sameOurs = prevAfter && COLS.every((k) => cur[k] === prevAfter[k]);
      if (!sameBefore && !sameOurs) { skipped.push([id, '지금 값이 계획 때와 다름']); continue; }
      const bad = [];
      if (after.general_hint) {
        const ck = checkHint({ hint: after.general_hint, answer: r.display_answer, variants: r.variants, question: after.question_text, explanation: after.explanation ?? '' });
        if (ck.block.length) bad.push('힌트 막힘 ' + JSON.stringify(ck.block));
        const exw = ck.warn.find((w) => w.kind === 'explain'); if (exw && ('general_hint' in p.after || 'explanation' in p.after)) bad.push('해설 겹침 ' + exw.shared.join('/'));
        if (ck.warn.some((w) => w.kind === 'blank')) bad.push('빈칸 ○');
        if (len(after.general_hint) > 120 || /[\r\n]/.test(after.general_hint)) bad.push(`힌트 ${len(after.general_hint)}자`);
      }
      if (len(after.question_text) > 240) bad.push(`질문 ${len(after.question_text)}자`);
      if ('question_text' in p.after) {
        const qn = normalizeAnswer(after.question_text).replace(/\s+/g, '');
        for (const a of [r.display_answer, ...r.variants]) {
          const n = normalizeAnswer(a).replace(/\s+/g, '');
          if (!n) continue;
          const wasIn = normalizeAnswer(cur.question_text).replace(/\s+/g, '').includes(n);
          if (qn.includes(n) && !wasIn) bad.push(`질문에 정답·변형 '${a}'`);
        }
        if (/[\r\n]/.test(after.question_text)) bad.push('질문 줄바꿈');
      }
      if (after.explanation != null && !String(after.explanation).trim()) bad.push('해설 빈 글');
      if (bad.length) { skipped.push([id, bad.join(' · ')]); continue; }
      todo.push({ id, answer: r.display_answer, before: undo.items[id]?.before ?? cur, after, cur, why: p.why });
    }
    console.log(`[${tag}] 대상 ${ids.length} · 쓸 것 ${todo.length} · 이미 됨 ${done} · 건너뜀 ${skipped.length}`);
    for (const t of todo) console.log(`  쓸 것 #${t.id} ${t.answer} · ${COLS.filter((k) => t.cur[k] !== t.after[k]).join('+')}`);
    for (const s of skipped) console.log('  건너뜀', ...s);
    if (MODE !== 'apply') { console.log(`[${tag}] 확인만 — 쓰려면 --apply`); return; }
    if (!todo.length) return;
    const at = await guardNoOpenGames(c, tag); const a0 = await activeCount(c);
    for (const t of todo) undo.items[t.id] = { answer: t.answer, part, before: t.before, after: t.after, why: t.why };
    (undo.writes ??= []).push({ at, part, n: todo.length }); writeJson(undoFile, undo);
    await c.query('begin'); let n = 0;
    for (const t of todo) n += (await c.query(`update questions set general_hint=$2, explanation=$3, question_text=$4, updated_at=now()
        where id=$1 and is_active and general_hint is not distinct from $5 and explanation is not distinct from $6 and question_text is not distinct from $7`,
    [t.id, ...COLS.map((k) => t.after[k]), ...COLS.map((k) => t.cur[k])])).rowCount;
    if (n !== todo.length) { await c.query('rollback'); console.error(`★ ${n}/${todo.length} — 되돌림`); process.exit(1); }
    await c.query('commit'); console.log(`[${tag}] 썼다 ${n} · 활성 ${a0} → ${await activeCount(c)} · ${at}`);
  } finally { await c.end().catch(() => {}); }
}
