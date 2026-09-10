// =============================================================================
// 출제 풀 로드 (Phase 3)
//
// ★★ 왜 게임 시작 때 한 번에 읽는가 (04-PROTOCOL 3장 / D-054)
//   문제 선정은 매 문제마다 일어나고, 그 절차는 **30초 타이머가 시작되기 전에**
//   끝나야 한다. 매 문제마다 DB 를 다시 읽으면 그 절차가 느려진다.
//   ★ 그리고 정답 중복 검사(Q-76)는 정답 집합의 교집합 연산이다.
//     문자열 Set 교집합은 메모리에서 즉시 끝난다. 수천 건이어도 문제되지 않는다.
//
// ★ 출제 대상의 정의는 db/questions.ts 와 **같아야 한다.**
//   ★ 조건이 어긋나면 "출제 가능 수" 검증을 통과했는데 선정에서 못 찾는 일이 생긴다.
//   → POOL_WHERE 를 그 파일에서 가져온다. 문자열을 복사하지 않는다.
//
// ★ 판정에 쓰는 정규화 정답은 DB 의 question_answers.answer_norm 을 그대로 쓴다.
//   ★ 적재 시점에 shared/normalizeAnswer() 로 만든 값이다. 서버가 다시 계산하지 않는다.
//     ★ 다시 계산하면 정규화 버전이 바뀌었을 때 DB 와 메모리가 조용히 갈라진다.
// =============================================================================

import { query } from './pool.js';
import { POOL_WHERE } from './questions.js';

/**
 * 출제 풀의 문제 하나.
 *
 * ★ 이 구조체가 게임 진행 중 메모리에 상주한다. 필드를 늘릴 때 주의한다.
 *   10,000 건 × 참가자 10명 규모를 가정한다.
 */
export interface PoolQuestion {
  id: string;
  text: string;
  /** ★ 화면에 보여줄 카테고리. **대분류**다 (R012 3-3 확정: 소분류 이름은 힌트가 된다) */
  categoryName: string;
  displayAnswer: string;
  /** 힌트 생성 기준. null 이면 displayAnswer 를 쓴다 */
  hintAnswer: string | null;
  explanation: string | null;
  /** ★ 판정에 쓰는 정규화 정답 집합 */
  answersNorm: string[];
  /** ★ 마스킹에 쓰는 원문 표기 (Phase 6) */
  answersRaw: string[];
}

/**
 * 출제 대상 전체를 읽는다.
 *
 * ★ 카테고리 이름은 대분류를 쓴다.
 *   ★ 0003 마이그레이션의 category_tree 뷰가 있으면 그것으로 대분류를 찾고,
 *     없으면(레거시 플랫 카테고리) 그 카테고리 이름을 그대로 쓴다.
 *   ★ 뷰가 없다고 게임이 멈추면 안 되므로 두 경로를 모두 둔다.
 */
export async function loadQuestionPool(): Promise<PoolQuestion[]> {
  const viewCheck = await query<{ n: number }>(
    `SELECT 1 AS n FROM information_schema.views WHERE table_name = 'category_tree'`,
  );
  const hasTree = (viewCheck.rowCount ?? 0) > 0;

  // ★ 대분류 이름을 고르는 식.
  //   ★ category_tree 뷰(0003)는 리프(level 3)에 대해 major_name 을 준다.
  //     조인 키는 category_id 다 (id 가 아니다 — 실측에서 이것 때문에 한 번 깨졌다).
  //   ★ 레거시 플랫 카테고리(level 0)는 뷰에 없으므로 자기 이름을 쓴다.
  const categoryExpr = hasTree ? `coalesce(t.major_name, c.name_ko)` : `c.name_ko`;
  const treeJoin = hasTree
    ? `LEFT JOIN category_tree t ON t.category_id = q.category_id`
    : '';

  const rows = await query<{
    id: string;
    question_text: string;
    category_name: string;
    display_answer: string;
    hint_answer: string | null;
    explanation: string | null;
    answers_norm: string[];
    answers_raw: string[];
  }>(
    `SELECT q.id::text                        AS id,
            q.question_text,
            ${categoryExpr}                   AS category_name,
            q.display_answer,
            q.hint_answer,
            q.explanation,
            -- ★ 정답을 한 번의 쿼리로 모은다. 문제마다 따로 조회하면 N+1 이 된다
            coalesce(a.norms, '{}')           AS answers_norm,
            coalesce(a.raws,  '{}')           AS answers_raw
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       ${treeJoin}
       LEFT JOIN (
         SELECT question_id,
                array_agg(answer_norm) AS norms,
                array_agg(answer_text) AS raws
           FROM question_answers
          GROUP BY question_id
       ) a ON a.question_id = q.id
      WHERE ${POOL_WHERE}`,
  );

  const out: PoolQuestion[] = [];
  for (const r of rows.rows) {
    // ★ 정답이 하나도 없는 문제는 출제하지 않는다.
    //   ★ 아무도 맞힐 수 없고, 시간 종료로만 끝난다. 조용히 넣으면 원인을 찾기 어렵다.
    const norms = (r.answers_norm ?? []).filter((s) => typeof s === 'string' && s.length > 0);
    if (norms.length === 0) {
      console.warn(`[pool] ★ 정답이 없는 문제를 제외했다: #${r.id} ${r.question_text}`);
      continue;
    }
    out.push({
      id: r.id,
      text: r.question_text,
      categoryName: r.category_name ?? '기타',
      displayAnswer: r.display_answer,
      hintAnswer: r.hint_answer,
      explanation: r.explanation,
      answersNorm: norms,
      answersRaw: (r.answers_raw ?? []).filter((s) => typeof s === 'string' && s.length > 0),
    });
  }
  return out;
}

/**
 * 계정별 경험한 문제 id 집합.
 *
 * ★ 문제 선정(전원 미경험 / 1명 이상 미경험)과 경험자 배지에 둘 다 쓴다.
 * ★ 출제 대상인 문제만 담는다. 비활성 문제의 경험은 선정에 영향을 주지 않는다.
 *
 * ★ 중간 참가자가 들어오면 그 사람 것만 따로 불러 합친다.
 *   ★ 그 호출은 join 핸들러에서 일어난다. 판정 블록이 아니므로 await 가 허용된다.
 */
export async function loadExperienced(
  accountIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const id of accountIds) out.set(id, new Set());
  if (accountIds.length === 0) return out;

  const rows = await query<{ account_id: string; question_id: string }>(
    `SELECT qe.account_id::text AS account_id, qe.question_id::text AS question_id
       FROM question_experiences qe
       JOIN questions q ON q.id = qe.question_id
      WHERE qe.account_id = ANY($1::bigint[])
        AND ${POOL_WHERE}`,
    [accountIds],
  );
  for (const r of rows.rows) {
    let set = out.get(r.account_id);
    if (!set) {
      set = new Set();
      out.set(r.account_id, set);
    }
    set.add(r.question_id);
  }
  return out;
}
