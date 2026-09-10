#!/usr/bin/env node
// =============================================================================
// 저장된 중복 판정을 DB 에 반영한다 (R014 작업 B)
//
// ★★ 왜 별도 스크립트인가
//   중복 판정은 이미 끝나 있다 — data/pipeline/dedupe/*.json 에 판정과 근거가 있다.
//   ★ R011 의 12쌍은 R012 에서 건우 판정과 **12/12 일치**했다 (D-047).
//   ★ 그것을 다시 LLM 으로 판정하면 Gemini 호출을 낭비하고, 결과가 달라질 수도 있다.
//   → 저장된 판정을 그대로 반영한다. **API 호출 0회다.**
//
// ★★★ 쌍 단위로 적용하면 안 된다 — R014 실행에서 발견한 결함
//
//   R011 판정에 **순환 쌍**이 있었다. 햄릿 문제 3건이 이렇게 얽혀 있다 —
//     p10  유지 #278 / 내림 #168
//     p11  유지 #168 / 내림 #311
//     p12  유지 #311 / 내림 #278
//   ★★ 쌍을 순서대로 적용하면 **셋 다 is_active 가 내려간다.**
//     p10 이 #168 을 내리고, p11 이 #311 을 내리고, p12 가 #278 을 내린다.
//     ★ 그 결과 그 문제는 출제 풀에서 완전히 사라진다. 중복 정리가 아니라 삭제다.
//
//   ★ 원인: LLM 이 쌍마다 독립적으로 "어느 쪽이 나은가" 를 판정했다.
//     ★ 쌍 판정은 **추이적으로 일관되지 않는다.** A>B, B>C, C>A 가 나올 수 있다.
//
//   → ★★ 연결 요소(중복 그룹)를 만들고 **그룹마다 정확히 하나를 남긴다.**
//     ★ 그룹에서 활성이 0이 되는 일은 코드가 막는다.
//
// ★★ 지우지 않는다 (11-DEPLOY 기존 원칙 / D-048)
//   · is_active 를 false 로 내린다
//   · ★ status 를 되돌리지 않는다. 검수 이력이 오염된다
//   · ★ review_queue.reviewer_note 에 이력을 남긴다 — 무엇과 중복이고 왜 내렸는지
//   · mergeAnswers 가 있으면 남기는 쪽의 정답 배열에 합친다
//
// 사용법
//   node scripts/pipeline-apply-dedupe.mjs --file data/pipeline/dedupe/R011-verify.json
//   node scripts/pipeline-apply-dedupe.mjs --file <경로> --apply
// =============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const FILE = opt('--file', null);
const APPLY = args.includes('--apply');
const LABEL = opt('--label', 'R011 중복 정리');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';

if (!FILE) {
  console.error('[dd] ★ --file 로 판정 파일을 지정한다.');
  console.error('[dd]   예: --file data/pipeline/dedupe/R011-verify.json');
  process.exit(1);
}

const spec = JSON.parse(await readFile(path.join(ROOT, FILE), 'utf8'));
const pairs = (spec.pairs ?? []).filter((p) => {
  // ★ 사람이 뒤집은 판정이 있으면 그것을 따른다
  const verdict = p.humanDecision ?? p.verdict;
  return verdict === 'same';
});
console.log(`[dd] 판정 파일: ${FILE}`);
console.log(`[dd] 전체 ${(spec.pairs ?? []).length}쌍 / ★ 중복으로 판정된 것 ${pairs.length}쌍`);
console.log(`[dd] 판정 모델: ${spec._meta?.judgeModel ?? '확인 불가'}`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // ── source_ref → question id
  const refs = [...new Set(pairs.flatMap((p) => [p.a.ref, p.b.ref]))];
  const rows = await client.query(
    `SELECT id, source_ref, is_active, status, display_answer
       FROM questions WHERE source_ref = ANY($1::text[])`,
    [refs],
  );
  const byRef = new Map(rows.rows.map((r) => [r.source_ref, r]));
  console.log(`[dd] DB 에서 찾은 문제 ${byRef.size}/${refs.length}건`);

  const missing = refs.filter((r) => !byRef.has(r));
  if (missing.length > 0) {
    // ★ 조용히 넘기지 않는다. 적재되지 않은 것을 정리할 수는 없다
    console.log(`[dd] ★ DB 에 없는 ref ${missing.length}건 (적재되지 않았다): ${missing.slice(0, 5).join(', ')}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ★★ 1. 연결 요소(중복 그룹)를 만든다. 쌍 단위로 적용하지 않는다
  // ─────────────────────────────────────────────────────────────────────────
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const usable = [];
  const skipped = [];
  for (const p of pairs) {
    if (!byRef.has(p.a.ref) || !byRef.has(p.b.ref)) {
      skipped.push({ pairId: p.pairId, reason: '한쪽이 DB 에 없다 (적재되지 않았다)' });
      continue;
    }
    usable.push(p);
    union(p.a.ref, p.b.ref);
  }

  const groups = new Map();
  for (const p of usable) {
    const root = find(p.a.ref);
    if (!groups.has(root)) groups.set(root, { refs: new Set(), pairs: [] });
    const g = groups.get(root);
    g.refs.add(p.a.ref);
    g.refs.add(p.b.ref);
    g.pairs.push(p);
  }
  console.log(`[dd] ★ 중복 그룹 ${groups.size}개 (쌍 ${usable.length}개를 연결 요소로 묶었다)`);

  // ─────────────────────────────────────────────────────────────────────────
  // ★★ 2. 그룹마다 정확히 하나를 남긴다
  //
  //   ★ 어느 것을 남기는가 — 순서대로 본다
  //     (1) 쌍 판정에서 "유지" 로 뽑힌 횟수가 가장 많은 것
  //         ★ 근거: LLM 판정을 버리지 않고 쓸 수 있는 만큼 쓴다
  //     (2) 동수면 정답 표기가 가장 많은 것
  //         ★ 근거: 표기가 많으면 플레이어가 맞힐 경로가 넓다. 게임에 유리하다
  //     (3) 그래도 동수면 id 가 가장 작은 것 (★ 결정적이어야 한다)
  //   ★★ 순환 쌍(A>B, B>C, C>A)에서는 (1)이 전부 동수가 된다. 그래서 (2)(3)이 필요하다
  // ─────────────────────────────────────────────────────────────────────────
  const answerCounts = new Map();
  {
    const ids = [...byRef.values()].map((r) => r.id);
    if (ids.length > 0) {
      const r = await client.query(
        `SELECT question_id, count(*)::int AS n FROM question_answers
          WHERE question_id = ANY($1::bigint[]) GROUP BY 1`,
        [ids],
      );
      for (const row of r.rows) answerCounts.set(String(row.question_id), row.n);
    }
  }

  let off = 0;
  let merged = 0;
  let already = 0;
  let cyclic = 0;

  for (const [root, g] of groups) {
    const refs = [...g.refs];
    const votes = new Map(refs.map((r) => [r, 0]));
    for (const p of g.pairs) {
      const keepRef = (p.humanKeep ?? p.keep) === 'b' ? p.b.ref : p.a.ref;
      votes.set(keepRef, (votes.get(keepRef) ?? 0) + 1);
    }
    const maxVote = Math.max(...refs.map((r) => votes.get(r) ?? 0));
    const isCyclic = refs.length > 2 && refs.every((r) => (votes.get(r) ?? 0) === maxVote);
    if (isCyclic) cyclic += 1;

    const ranked = [...refs].sort((x, y) => {
      const vx = votes.get(x) ?? 0;
      const vy = votes.get(y) ?? 0;
      if (vx !== vy) return vy - vx;
      const ax = answerCounts.get(String(byRef.get(x).id)) ?? 0;
      const ay = answerCounts.get(String(byRef.get(y).id)) ?? 0;
      if (ax !== ay) return ay - ax;
      return Number(byRef.get(x).id) - Number(byRef.get(y).id);
    });
    const keepRef = ranked[0];
    const keep = byRef.get(keepRef);
    const dropRefs = ranked.slice(1);

    console.log('');
    console.log(
      `  [그룹 ${root.slice(0, 8)}] ${refs.length}건 / 쌍 ${g.pairs.length}개` +
        (isCyclic ? '  ★★ 순환 쌍이다 (쌍 단위로 적용하면 전부 내려간다)' : ''),
    );
    console.log(
      `    유지  #${keep.id}  ${keep.display_answer}  (표기 ${answerCounts.get(String(keep.id)) ?? 0}개 / 유지표 ${votes.get(keepRef)})`,
    );
    for (const r of dropRefs) {
      const d = byRef.get(r);
      console.log(
        `    내림  #${d.id}  ${d.display_answer}  (표기 ${answerCounts.get(String(d.id)) ?? 0}개 / 유지표 ${votes.get(r)})${d.is_active ? '' : '  (이미 내려가 있다)'}`,
      );
    }
    // ★ 그룹의 mergeAnswers 를 모두 모아 남기는 쪽에 합친다
    const toMerge = new Set();
    for (const p of g.pairs) for (const m of p.mergeAnswers ?? []) toMerge.add(m);

    // ★★ 자체 판단 (R014) — 내리는 쪽의 정답 표기를 전부 남기는 쪽에 합친다.
    //
    //   ★ 왜 — 판정 파일의 mergeAnswers 는 LLM 이 "합칠 만하다" 고 본 것만 담고 있다.
    //     ★ 실측: 스우시 그룹에서 내리는 쪽(#111)이 표기 3개, 남기는 쪽(#306)이 2개였다.
    //       그대로 내리면 **플레이어가 맞힐 수 있었던 표기가 사라진다.**
    //   ★ guide 17절이 복수 정답을 요구하는 취지에 반한다.
    //   ★ 위험은 낮다 — 같은 문제로 판정된 것들이고(건우 판정과 12/12 일치),
    //     answer_norm UNIQUE 가 중복을 막는다.
    //   ★ 되돌리기 쉽다 — note 에 출처를 남기므로 어느 표기가 합쳐진 것인지 알 수 있다.
    const dropIds = dropRefs.map((r) => byRef.get(r).id);
    if (dropIds.length > 0) {
      const r = await client.query(
        `SELECT answer_text FROM question_answers WHERE question_id = ANY($1::bigint[])`,
        [dropIds],
      );
      for (const row of r.rows) toMerge.add(row.answer_text);
    }
    if (toMerge.size > 0) console.log(`    합칠 표기 후보: ${[...toMerge].join(', ')}`);

    if (!APPLY) continue;

    // ★★ 안전장치 — 남기는 쪽이 활성이 아니면 다시 올린다.
    //   ★ 이전 실행이 쌍 단위로 잘못 내렸을 수 있다. 그룹에 활성 0이 되게 두지 않는다
    await client.query('BEGIN');
    try {
      if (!keep.is_active) {
        await client.query(
          'UPDATE questions SET is_active = true, updated_at = now() WHERE id = $1',
          [keep.id],
        );
        console.log(`    ★★ 유지 대상이 내려가 있었다. 다시 올렸다 (#${keep.id})`);
      }
      for (const r of dropRefs) {
        const d = byRef.get(r);
        if (!d.is_active) {
          already += 1;
          continue;
        }
        await client.query(
          'UPDATE questions SET is_active = false, updated_at = now() WHERE id = $1',
          [d.id],
        );
        await client.query(
          `INSERT INTO review_queue (question_id, reviewer_note)
           VALUES ($1, $2)
           ON CONFLICT (question_id) DO UPDATE
             SET reviewer_note = coalesce(review_queue.reviewer_note || ' / ', '') || $2`,
          [
            d.id,
            `★ ${LABEL}: #${keep.id} 과 같은 문제로 판정되어 is_active 를 내렸다. ` +
              `판정=${spec._meta?.judgeModel ?? '?'}` +
              (isCyclic ? ' / ★ 순환 쌍 그룹이어서 그룹 대표를 코드가 골랐다' : ''),
          ],
        );
        off += 1;
      }
      for (const extra of toMerge) {
        const norm = normalizeAnswer(extra);
        if (!norm) continue;
        const r = await client.query(
          `INSERT INTO question_answers (question_id, answer_text, answer_norm, is_primary, note)
           VALUES ($1, $2, $3, false, $4)
           ON CONFLICT (question_id, answer_norm) DO NOTHING`,
          [keep.id, extra, norm, `★ ${LABEL}: 중복 그룹에서 합친 표기`],
        );
        merged += r.rowCount ?? 0;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`    ★ 실패: ${err.message}`);
      skipped.push({ pairId: root, reason: err.message });
    }
  }
  if (cyclic > 0) {
    console.log('');
    console.log(`[dd] ★★ 순환 쌍 그룹 ${cyclic}개를 만났다.`);
    console.log('[dd]   ★ 쌍 단위로 적용했다면 그 그룹의 문제가 **전부** 내려갔을 것이다.');
    console.log('[dd]   ★ 그룹마다 하나를 남기는 것으로 처리했다.');
  }

  console.log('');
  console.log('──────────────────────────────────────────');
  if (!APPLY) {
    console.log('[dd] ★ --apply 를 주지 않았다. 아무것도 바꾸지 않았다.');
  } else {
    console.log(`[dd] ★ is_active 를 내린 문제 ${off}건 / 합친 표기 ${merged}행`);
    console.log('[dd] ★ status 는 건드리지 않았다. 검수 이력을 오염시키지 않는다.');
    console.log('[dd] ★ review_queue.reviewer_note 에 이력을 남겼다.');
  }
  if (already > 0) console.log(`[dd] 이미 내려가 있던 것 ${already}건 (두 번 돌려도 안전하다)`);
  if (skipped.length > 0) {
    console.log(`[dd] ★ 건너뛴 쌍 ${skipped.length}개:`);
    for (const s of skipped) console.log(`     ${s.pairId} — ${s.reason}`);
  }

  const pool = await client.query(
    `SELECT count(*)::int AS n FROM questions
      WHERE status = 'approved' AND is_active AND question_type = 'short_answer'`,
  );
  console.log(`[dd] 현재 출제 가능 문제 수: ${pool.rows[0].n}건`);
} finally {
  await client.end();
}
