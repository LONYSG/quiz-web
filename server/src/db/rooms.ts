// =============================================================================
// 방 레코드 (DB)
//
// ★ DB에는 방 레코드만 둔다. 참가자 목록과 게임 상태는 메모리에만 있다.
//   근거는 docs/07-DECISIONS.md D-008.
//
// ★ 이 파일의 함수는 await 를 포함한다. rooms/registry.ts 의 동기 함수와 분리되어 있다.
//   이 분리를 유지하는 것이 "판정 블록에 await 를 넣지 않는다" 를 지키는 실질적 장치다.
// =============================================================================

import { query } from './pool.js';

export interface RoomRow {
  id: string;
  title: string;
  host_account_id: string;
  created_by: string;
  created_at: Date;
  closed_at: Date | null;
}

export type InsertRoomResult = { ok: true } | { ok: false; reason: 'already_has_open_room' };

/**
 * 방 레코드 삽입.
 *
 * ★ "이미 열린 방이 있는지" 를 먼저 SELECT 해서 확인하지 않는다.
 *   INSERT 를 시도하고 부분 UNIQUE 인덱스 위반을 잡는다.
 *   확인과 삽입 사이에 다른 요청이 끼어드는 race 를 피하기 위함이다. DB 제약이 유일한 진실이다.
 */
export async function insertRoom(
  id: string,
  title: string,
  accountId: string,
): Promise<InsertRoomResult> {
  try {
    await query(
      `INSERT INTO rooms (id, title, host_account_id, created_by) VALUES ($1, $2, $3, $3)`,
      [id, title, accountId],
    );
    return { ok: true };
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code === '23505' && e.constraint === 'rooms_one_open_per_owner_idx') {
      return { ok: false, reason: 'already_has_open_room' };
    }
    throw err;
  }
}

export async function closeRoom(roomId: string): Promise<void> {
  await query(`UPDATE rooms SET closed_at = now() WHERE id = $1 AND closed_at IS NULL`, [roomId]);
}

/**
 * 방 조회.
 *
 * ★ guide 49절이 "존재하지 않는 방" 과 "이미 종료된 방" 을 각각 다르게 안내하라고 요구한다.
 *   그래서 closed_at 을 함께 돌려주고 호출자가 구분하게 한다.
 */
export async function findRoom(roomId: string): Promise<RoomRow | null> {
  const result = await query<RoomRow>(
    `SELECT id, title, host_account_id, created_by, created_at, closed_at
       FROM rooms WHERE id = $1`,
    [roomId],
  );
  return result.rows[0] ?? null;
}

export async function findOpenRoomOfAccount(accountId: string): Promise<RoomRow | null> {
  const result = await query<RoomRow>(
    `SELECT id, title, host_account_id, created_by, created_at, closed_at
       FROM rooms WHERE created_by = $1 AND closed_at IS NULL`,
    [accountId],
  );
  return result.rows[0] ?? null;
}
