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

import { query } from './pool.js';

/** 출제 대상 조건. ★ 이 문자열을 다른 곳에 복사하지 않는다 */
const POOL_WHERE = `q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'`;

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
): Promise<number> {
  const n = participantIds.length;
  if (n === 0) {
    // 참가자가 없으면 "전원 경험" 조건이 공허하게 참이 되어 0이 되어야 할지
    // 전체가 되어야 할지 애매하다. 참가자 0명인 방에서 게임을 시작할 수 없으므로
    // 전체 활성 문제 수를 돌려주는 것이 화면 안내에 자연스럽다.
    return countActiveQuestions();
  }
  const r = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM questions q
      WHERE ${POOL_WHERE}
        AND (SELECT count(*) FROM question_experiences qe
              WHERE qe.question_id = q.id
                AND qe.account_id = ANY($1::bigint[])) < $2`,
    [participantIds, n],
  );
  return r.rows[0]?.n ?? 0;
}
