// =============================================================================
// 로비 정보 갱신 (경험률 Q-12 / 출제 가능 수 Q-21)
//
// ★ 갱신 시점을 이 파일이 정한다. 세 곳뿐이다.
//     · 로비 진입 (방 생성 / 입장 / 재접속)
//     · 참가자 변동 (퇴장 / 강제 퇴장)
//     · 게임 종료 후 로비 복귀 (Phase 4)
//   ★ 주기적으로 갱신하지 않는다. 타이머로 DB를 깨우는 코드를 만들지 않는다는
//     규칙과 직결된다 (docs/02-ARCHITECTURE.md "DB 접근 규칙").
//     경험 기록은 게임이 끝나야 늘어나므로 로비에 있는 동안 값이 바뀔 일이 없다.
//
// ★ 왜 캐시하는가
//   설정 변경(lobby.updateSettings)은 방장이 숫자를 고칠 때마다 발생한다.
//   그때마다 DB를 조회하면 입력 한 글자마다 쿼리가 나간다.
//   출제 가능 수는 설정값과 무관하고 참가자 집합에만 의존하므로 캐시가 정확하다.
//   ★ 단 게임 시작 직전에는 캐시를 믿지 않고 반드시 다시 조회한다 (Q-21).
// =============================================================================

import {
  countActiveQuestions,
  countAvailableQuestions,
  countExperiencedByAccount,
} from '../db/questions.js';
import { emitRoom } from '../rooms/emit.js';
import type { ExperienceRate, Room } from '../rooms/types.js';

/**
 * 게임 선정·경험률의 기준이 되는 참가자 목록.
 *
 * ★ 접속이 끊긴 참가자도 포함한다.
 *   로비에서 접속 종료자는 여전히 슬롯을 갖고 목록에 보이며, 방장이 명시적으로
 *   내보내지 않으면 그 게임에 참가한다. 따라서 문제 선정 대상에서 빼면
 *   "돌아온 사람이 이미 경험한 문제를 받는" 상황이 생긴다.
 *   ★ 자체 판단이다 (docs/07-DECISIONS.md D-024).
 */
export function participantIds(room: Room): string[] {
  return [...room.players.keys()];
}

/**
 * 로비 정보를 다시 계산하고 브로드캐스트한다.
 *
 * ★ 실패해도 방을 망가뜨리지 않는다. 값은 null 로 남고 화면에는 "—" 가 뜬다.
 *   DB가 잠깐 안 되는 것 때문에 로비에서 튕겨나가면 안 된다.
 */
export async function refreshLobbyInfo(room: Room): Promise<void> {
  const ids = participantIds(room);
  if (ids.length === 0) return;

  try {
    const [total, counts, available] = await Promise.all([
      countActiveQuestions(),
      countExperiencedByAccount(ids),
      countAvailableQuestions(ids),
    ]);

    // ★ 조회 중에 참가자가 바뀌었을 수 있다. 지금 방에 있는 사람만 남긴다.
    const byAccount = new Map(counts.map((c) => [c.accountId, c.experienced]));
    const rates: ExperienceRate[] = participantIds(room).map((accountId) => ({
      accountId,
      experienced: byAccount.get(accountId) ?? 0,
      total,
    }));

    room.availableQuestionCount = available;
    room.experienceRates = rates;

    // ★ 프로토콜에 있는 이벤트 두 개를 그대로 쓴다 (docs/04-PROTOCOL.md 8장).
    //   출제 가능 수는 lobby.settingsUpdated 에 실려 있다.
    emitRoom(room, 'lobby.experienceRates', { rates });
    emitRoom(room, 'lobby.settingsUpdated', {
      settings: { ...room.settings },
      settingsLocked: room.settingsLocked,
      availableQuestionCount: available,
    });
  } catch (err) {
    console.error(`[lobby] ${room.id} 정보 갱신 실패:`, (err as Error).message);
  }
}
