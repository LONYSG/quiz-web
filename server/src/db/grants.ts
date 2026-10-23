// =============================================================================
// ★★ 포인트 지급 (R059 · D-254) — point_grants(0023)
//
//   claimUnseenGrants — 아직 알리지 않은 지급을 한 번에 읽고 seen_at 을 적는다(로그인 뒤 토스트 한 번).
//   ★ 운영자 메모(note)는 돌려주지 않는다(내부 기록).
//   지급 자체는 사람이 스크립트로만 한다(npm run feedback:adopt · points:grant) — 서버는 쓰지 않는다.
// =============================================================================

import { query } from './pool.js';

export interface GrantNotice {
  id: string;
  amount: number;
  reason: 'feedback_adopted' | 'feedback_monthly_top' | 'admin' | 'signup';
  /** 채택된 설문의 문제 질문 앞 30자 */
  question: string | null;
}

export async function claimUnseenGrants(accountId: string): Promise<GrantNotice[]> {
  const r = await query<{ id: string; amount: number; reason: GrantNotice['reason']; question: string | null }>(
    `WITH g AS (
       UPDATE point_grants SET seen_at = now()
        WHERE account_id = $1 AND seen_at IS NULL
        RETURNING id, amount, reason, ref_type, ref_id, created_at
     )
     SELECT g.id::text, g.amount, g.reason, left(q.question_text, 30) AS question
       FROM g LEFT JOIN question_feedback f ON g.ref_type = 'question_feedback' AND f.id = g.ref_id
              LEFT JOIN questions q ON q.id = f.question_id
      ORDER BY g.created_at`,
    [accountId],
  );
  return r.rows;
}
