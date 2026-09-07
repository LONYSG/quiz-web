// =============================================================================
// 서버 부팅 시 정리 절차
//
// ★ 왜 필요한가 (R004 D-3에서 발견한 설계 결함)
//
//   rooms 테이블에는 다음 제약이 있다.
//       CREATE UNIQUE INDEX rooms_one_open_per_owner_idx
//         ON rooms (created_by) WHERE closed_at IS NULL;
//   Q-14("1인당 동시 보유 방 1개")를 DB가 강제하도록 한 것이다.
//
//   그런데 방 삭제는 서버 메모리에서 일어나고, 그때 closed_at 을 기록한다.
//   서버 프로세스가 죽으면 그 절차가 실행되지 않아 closed_at 이 NULL 인 방이 DB에 남는다.
//   메모리에는 없으므로 그 방은 영원히 닫히지 않고, 그 방을 만든 사람은
//   UNIQUE 제약에 걸려 다시는 방을 만들 수 없다.
//
//   ★ 이 프로젝트는 건우 PC를 서버로 쓰고 필요할 때만 켜는 구조다(R004 0장).
//     즉 프로세스 종료가 예외가 아니라 일상이므로 이 문제가 반드시, 자주 발생한다.
//     클라우드 상시 가동이었다면 드물게 발생했을 문제가 여기서는 매번 발생한다.
//
// ★ 네트워크 단절과 프로세스 종료는 다르다 (docs/02-ARCHITECTURE.md 표 참조)
//   · 서버 PC 네트워크 단절 → 프로세스 생존 → 메모리 유지 → PAUSED 로 이어하기 가능
//   · 서버 프로세스 종료     → 메모리 소실 → 이어하기 불가 → 이 정리 절차가 방과 게임을 닫는다
//
// ★ 이미 기록된 question_experiences 는 절대 삭제하지 않는다 (guide 25절 강한 금지).
//   그 문제들은 실제로 정답이 공개되어 사람들이 화면에서 본 것이므로 기록이 옳다.
// =============================================================================

import { query } from './pool.js';

export interface BootCleanupResult {
  closedRooms: number;
  endedGames: number;
}

export async function runBootCleanup(): Promise<BootCleanupResult> {
  // (2) 먼저 게임을 닫는다. games.room_id 가 rooms 를 참조하므로 순서는 중요하지 않지만,
  //     로그를 읽을 때 "게임이 먼저 끝나고 방이 닫혔다"가 자연스럽다.
  const games = await query(
    `UPDATE games
        SET ended_at   = now(),
            end_reason = 'server_restart'
      WHERE ended_at IS NULL
      RETURNING id`,
  );

  // (1) 닫히지 않은 방을 전부 닫는다.
  const rooms = await query(
    `UPDATE rooms
        SET closed_at = now()
      WHERE closed_at IS NULL
      RETURNING id`,
  );

  return { closedRooms: rooms.rowCount ?? 0, endedGames: games.rowCount ?? 0 };
}
