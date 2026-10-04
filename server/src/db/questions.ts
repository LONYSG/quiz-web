// =============================================================================
// 문제 풀 집계 (Q-12 경험률 / Q-21 출제 가능 수)
//
// ★ 출제 대상의 정의는 한 곳에만 둔다.
//   status='approved' AND is_active AND question_type='short_answer'
//   migrations/0001_init.sql 의 questions_pool_idx 가 이 조합을 위한 인덱스다.
//   ★ 이 조건이 파일마다 흩어지면 "경험률 분모"와 "출제 가능 수"가 다른 집합을 세게 된다.
//
// ★ 호출 시점 (docs/02-ARCHITECTURE.md "DB 접근 규칙")
//   로비 진입 / 참가자 변동 / 게임 시작 직전. 이 셋뿐이다.
//   ★ 주기적으로 조회하지 않는다. DB를 계속 깨워 두면 클라우드 전환 시 요금이 발생하고
//     Neon 같은 서버리스 DB는 스케일 투 제로가 영원히 발동하지 않는다.
// =============================================================================

import { difficultyScores, type DifficultyTier, type GameTopic } from '@quiz/shared';
import { query } from './pool.js';

/**
 * 출제 대상 조건. ★ 이 문자열을 다른 곳에 복사하지 않는다.
 *
 * ★ Phase 3 에서 db/questionPool.ts 가 이것을 가져다 쓴다 (export 로 바꿨다).
 *   ★ 근거 — "출제 가능 수" 검증과 "실제 선정 풀" 이 다른 집합을 세면
 *     시작 검증을 통과했는데 선정에서 문제를 못 찾는 일이 생긴다.
 */
export const POOL_WHERE = `q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'`;

/**
 * ★ 난이도 조건 (R025). `$n` 자리에 difficultyScores(...) 를 넘긴다.
 *
 * ★ 기준 열은 **difficulty_score(1~5 원점수)** 다. 옛 3단계 열(difficulty)이 아니다.
 *   ★ 근거: 옛 열은 원점수에서 파생된 값이다. 지금은 3,263건 전부 일치하지만(R025 실측),
 *     원점수만 다시 매기면 둘이 조용히 갈라진다.
 * ★ difficulty_score 가 NULL 인 문제는 **어떤 난이도에도 들지 않는다** (= 출제되지 않는다).
 *   ★ R025 실측 0건. 점수가 없는 문제는 선별 게이트(D-112)도 통과하지 못한 문제라 제외가 맞다.
 */
export function difficultyWhere(param: string): string {
  return `q.difficulty_score = ANY(${param}::int[])`;
}

/**
 * ★★ 분야 조건 (R034). `$n` 자리에 분야 키 배열(text[])을 넘긴다.
 *   ★ 묶음은 뷰 category_game_topics 가 계산한다 (migrations/0009). 설정은 categories.game_topic 한 곳이다.
 *   ★ 묶음이 없는(NULL) 카테고리의 문제는 어떤 분야에도 들지 않는다 — 0009 적용 시점 0건.
 */
export function topicWhere(param: string): string {
  return `q.category_id IN (SELECT category_id FROM category_game_topics WHERE game_topic = ANY(${param}::text[]))`;
}

/** 출제 범위 설정. 난이도 × 분야 (방 설정의 일부) */
export interface PoolFilter {
  difficulties: readonly DifficultyTier[];
  topics: readonly GameTopic[];
}

/**
 * ★★ 난이도 × 분야 조건을 한 번에. ★ 출제 가능 수와 출제 풀이 **이 함수 하나**를 쓴다.
 *   `$first` 가 난이도, `$first+1` 이 분야다. params 에 filterParams(filter) 를 그 자리에 펼친다.
 */
export function filterWhere(first: number): string {
  return `${difficultyWhere(`$${first}`)} AND ${topicWhere(`$${first + 1}`)}`;
}

export function filterParams(filter: PoolFilter): [number[], string[]] {
  return [difficultyScores(filter.difficulties), [...filter.topics]];
}

/** 경험률의 분모. 전체 활성 문제 수 (guide 6절: "분모는 전체 활성 문제 수") */
export async function countActiveQuestions(): Promise<number> {
  const r = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM questions q WHERE ${POOL_WHERE}`,
  );
  return r.rows[0]?.n ?? 0;
}

export interface ExperienceCount {
  accountId: string;
  experienced: number;
}

/**
 * 계정별 경험 문제 수.
 *
 * ★ 경험 기록이 있어도 그 문제가 비활성이면 세지 않는다.
 *   분모(활성 문제 수)와 같은 집합을 세야 한다. 그러지 않으면 100%를 넘는 값이 나온다.
 *
 * ★ 기록이 하나도 없는 계정도 0으로 반환한다.
 *   LEFT JOIN 이 그 역할이다. 결과에서 빠지면 화면에 "—" 가 뜬다.
 */
export async function countExperiencedByAccount(
  accountIds: readonly string[],
): Promise<ExperienceCount[]> {
  if (accountIds.length === 0) return [];
  const r = await query<{ account_id: string; experienced: number }>(
    `SELECT a.id::text AS account_id, count(q.id)::int AS experienced
       FROM accounts a
       LEFT JOIN question_experiences qe ON qe.account_id = a.id
       LEFT JOIN questions q ON q.id = qe.question_id AND ${POOL_WHERE}
      WHERE a.id = ANY($1::bigint[])
      GROUP BY a.id`,
    [accountIds],
  );
  return r.rows.map((row) => ({ accountId: row.account_id, experienced: row.experienced }));
}

/**
 * 출제 가능 문제 수 (Q-21).
 *
 * ★ 정의: 참가자 중 **한 명 이상이 아직 경험하지 않은** 활성 문제의 개수.
 *   문제 선정 규칙(Q-20)의 1단계 풀(전원 미경험)과 2단계 풀(1명 이상 미경험)의 합집합이
 *   정확히 이 집합이다. 1단계 풀은 2단계 풀의 부분집합이므로 2단계 조건 하나로 표현된다.
 *
 * ★ "전원이 경험한 문제"는 제외된다. 경험 규칙의 예외를 만들지 않는다는 것이
 *   guide 25·29절의 강한 금지 규칙이다. 제한을 풀어서 출제하는 일은 없다.
 *
 * ★ 게임 시작 시에는 개수만 검증한다 (Q-50 확정 (C)).
 *   실제 문제 선정은 매 문제마다 그 시점 참가자 기준으로 한다(Phase 3).
 *   그래서 시작 시 통과했더라도 중간 참가로 소진되어 조기 종료될 수 있다 (Q-22가 허용).
 */
export async function countAvailableQuestions(
  participantIds: readonly string[],
  filter: PoolFilter,
): Promise<number> {
  const n = participantIds.length;
  if (n === 0) {
    // 참가자가 없으면 "전원 경험" 조건이 공허하게 참이 되어 0이 되어야 할지
    // 전체가 되어야 할지 애매하다. 참가자 0명인 방에서 게임을 시작할 수 없으므로
    // (선택한 난이도의) 전체 활성 문제 수를 돌려주는 것이 화면 안내에 자연스럽다.
    const r0 = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM questions q WHERE ${POOL_WHERE} AND ${filterWhere(1)}`,
      filterParams(filter),
    );
    return r0.rows[0]?.n ?? 0;
  }
  // ★★ R025 / R034 — 선택한 난이도 × 분야의 문제만 센다. 출제 풀(loadQuestionPool)과 **같은 조건**이어야 한다
  const r = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM questions q
      WHERE ${POOL_WHERE}
        AND ${filterWhere(3)}
        AND (SELECT count(*) FROM question_experiences qe
              WHERE qe.question_id = q.id
                AND qe.account_id = ANY($1::bigint[])) < $2`,
    [participantIds, n, ...filterParams(filter)],
  );
  return r.rows[0]?.n ?? 0;
}
