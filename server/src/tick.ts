// =============================================================================
// 전역 tick 루프
//
// ★ 방마다 setTimeout / setInterval 을 두지 않는다 (R003 2-4 확정).
//   타이머 핸들이 방 생명주기와 엉키면 누수와 중복 실행이 생긴다.
//   전역 tick 하나면 상태 검사가 한 곳에 모이고,
//   "tick 안에서는 다른 이벤트가 끼어들지 않는다" 는 성질을 그대로 활용할 수 있다.
//
// ★ Phase 3 에서 검사 항목이 늘었다 (R014). 순서가 중요하다.
//     · COUNTDOWN 만료 → 첫 문제 시작
//     · ★ 남은 10초 → 힌트 push (hintPushed 로 1회만)
//     · ★ 문제 종료 시각 도달 → 시간 종료 처리 (T07)
//     · ★ QUESTION_RESOLVED 5초 경과 → 다음 문제 (T15) 또는 조기 종료 (T16)
//     · ★★ 활성 0명 → **즉시 PAUSED** (Phase 5 / R015)
//     · ★ PAUSED 5분 초과 → 방 폭파 (Q-82 개정. 30분 → 5분, 결과 화면 → 폭파)
//
// ★★ "정확히 30초" 에 대하여 (04-PROTOCOL 6장)
//   setTimeout(30000) 단독은 이벤트 루프가 바쁘면 지연되고 보정되지 않는다.
//   ★ 그래서 절대 시각(endsAt)을 저장하고 100ms tick 에서 비교한다.
//   ★★ 중요한 것은 **정답 인정 경계가 tick 이 아니라 endsAt 이라는 점**이다.
//     tick 이 최대 100ms 늦어도 그 사이 도착한 답은 answer.ts 가 시각으로 잘라낸다.
//     ★ 즉 tick 오차가 게임 판정에 영향을 주지 않는다.
//
// ★ tick 콜백 안에서 await 를 쓰지 않는다.
//   DB 쓰기가 필요하면 void 로 띄우고 결과를 기다리지 않는다.
//   그러지 않으면 tick 이 밀려 "정확히 30초" 가 깨진다.
// =============================================================================

import { RULES } from '@quiz/shared';
import { config } from './config.js';
import { startFromCountdown } from './game/start.js';
import { advanceAfterResolved, checkQuestionTimeout, pushHintIfDue } from './game/question.js';
import { checkAbandon, idleDeleteApplies, pauseIfNoActive } from './game/pause.js';
import { emitRoom } from './rooms/emit.js';
import { activeCount, allRooms, nextHostCandidate } from './rooms/registry.js';
import { destroyRoom } from './rooms/lifecycle.js';
import { toPlayerView } from './rooms/snapshot.js';
import type { Room } from './rooms/types.js';

let handle: NodeJS.Timeout | null = null;

/** 표시용 connected 가 바뀌는 순간을 잡기 위해, 방별 마지막 표시 상태를 기억한다 */
const lastDisplayState = new Map<string, string>();

export function startTick(): void {
  if (handle) return;
  handle = setInterval(tick, RULES.TICK_INTERVAL_MS);
  // 프로세스 종료를 막지 않게 한다
  handle.unref?.();
}

export function stopTick(): void {
  if (!handle) return;
  clearInterval(handle);
  handle = null;
}

function tick(): void {
  const now = Date.now();
  const toDelete: { roomId: string; why: string }[] = [];

  for (const room of allRooms()) {
    try {
      // ★★ Phase 5 — 일시정지 (R015)
      //   ★ 활성 0명이면 **즉시** PAUSED 로 간다. 유예가 없다 (Q-30 확정).
      //   ★★ 재개는 여기서 하지 않는다. **방장이 눌러야 한다.**
      //     ★ tick 이 resumeGame 을 부르는 코드가 어디에도 없는 것이 그 구현이다.
      //     ★ R014 의 근사 구현은 자동 재개였다. 그것이 이번에 바뀐 핵심이다.
      if (pauseIfNoActive(room, now)) {
        // ★ PAUSED 방에서 도는 것은 두 가지뿐이다 — 만료 검사와 방장 이전.
        //   ★★ 방장 이전이 필요한 이유: 방장이 끊긴 채 다른 사람만 돌아오면
        //     이전하지 않는 한 **아무도 재개할 수 없다.** 5분 뒤 방이 폭파된다.
        if (checkAbandon(room, now)) {
          toDelete.push({
            roomId: room.id,
            why: `★ 일시정지 ${Math.round(config.tuning.pauseAbandonMs / 60000)}분 초과 (Q-82)`,
          });
          continue;
        }
        checkHostTransfer(room, now);
        checkDisconnectDisplay(room, now);
        continue;
      }

      // 순서가 중요하다: 게임 상태 전이 → 방장 이전 → 표시 갱신 → 방 삭제
      checkCountdown(room, now);
      // ★★ Phase 3 — 문제 진행 (R014)
      //   ★ 순서: 힌트 → 시간 종료 → 다음 문제.
      //     ★ 힌트를 먼저 보는 이유: 같은 tick 에서 종료되더라도 남은 10초 시점의
      //       힌트는 이미 지나갔으므로 순서가 결과를 바꾸지 않는다. 반대로 두면
      //       종료 처리 뒤에 힌트가 나가는 순간이 생길 수 있다.
      pushHintIfDue(room, now);
      checkQuestionTimeout(room, now);
      advanceAfterResolved(room, now);
      checkHostTransfer(room, now);
      checkDisconnectDisplay(room, now);
      if (shouldDeleteRoom(room, now)) {
        toDelete.push({
          roomId: room.id,
          why: `활성 0명 ${RULES.ROOM_IDLE_DELETE_MS / 60000}분 경과 (Q-14)`,
        });
      }
    } catch (err) {
      // ★ 한 방의 오류가 다른 방의 tick 을 멈추게 하지 않는다.
      console.error(`[tick] 방 ${room.id} 처리 중 오류:`, (err as Error).message);
    }
  }

  for (const { roomId, why } of toDelete) {
    // ★★ 방 폭파는 destroyRoom 하나만 쓴다 (R015).
    //   ★ 근거: R007 에서 삭제 경로가 games 를 닫지 않아 부팅 정리가 잘못 기록한 적이 있다.
    //     ★ 경로가 셋이 되었으므로 한 곳으로 모으는 것이 더 중요해졌다.
    destroyRoom(roomId, 'abandoned', why);
    lastDisplayState.delete(roomId);
  }
}

/**
 * 카운트다운 만료 (T04, Q-11).
 *
 * ★ 방마다 setTimeout 을 두지 않는 이유가 여기서 드러난다.
 *   카운트다운은 취소될 수 있고(T03), 활성 0명이면 멈춰야 하고, 방이 사라질 수도 있다.
 *   타이머 핸들로 관리하면 취소·정지·해제를 매 경로에서 빼먹지 않아야 하지만,
 *   전역 tick 은 "지금 상태" 만 보면 되므로 빼먹을 것이 없다.
 *
 * ★ await 하지 않는다. startFromCountdown 이 동기적으로 상태를 전이시키고
 *   DB 기록만 뒤에서 처리한다. 여기서 기다리면 tick 이 밀린다.
 */
function checkCountdown(room: Room, now: number): void {
  if (room.state !== 'COUNTDOWN' || room.countdownEndsAt === null) return;

  // ★★ Phase 5 자리 — T20 (COUNTDOWN → PAUSED)
  //   확정 규칙은 "활성 0명이 되면 즉시 PAUSED, remainingMs = countdownEndsAt − now" 다
  //   (docs/04-PROTOCOL.md T20, Q-30 개정).
  //   ★ Phase 2에서는 PAUSED 를 구현하지 않는다. 이유는 07-DECISIONS.md D-023 에 있다.
  //     요약: PAUSED 는 30분 초과 시 GAME_RESULT 로 가야 하는데 그 상태가 아직 없고,
  //     PAUSED 중에는 방 삭제 타이머가 멈추므로 어중간하게 넣으면 방이 영구히 남는다.
  //   ★ 그래서 지금은 T04 의 확정 조건("활성 ≥ 1")만 지켜 만료를 보류한다.
  //     사람이 돌아오면 그때 시작된다. remainingMs 재계산이 없다는 점만 최종 규칙과 다르다.
  //   ★ Phase 5 에서 이 자리를 PAUSED 전이로 교체한다.
  if (activeCount(room) === 0) return;

  if (now < room.countdownEndsAt) return;

  void startFromCountdown(room).catch((err) =>
    console.error(`[tick] 방 ${room.id} 카운트다운 시작 처리 실패:`, (err as Error).message),
  );
}

/**
 * 방장 이전 (Q-29).
 *
 * ★ 활성 0명 동안에는 이 타이머를 정지한다. 이전할 대상이 없기 때문이다.
 *   R004 2-2 (4)에서 발견한 문제다. 정지하지 않으면 타이머만 만료되고 아무 일도 일어나지 않거나
 *   구현에 따라 오류가 난다.
 * ★ 30초 유예를 두는 이유: 새로고침(1~3초)으로 방장이 넘어가는 것을 막는다.
 */
/**
 * ★★ R015 — PAUSED 중에도 이 검사가 돌아야 한다.
 *   ★ 근거: 방장이 끊긴 채로 다른 사람만 돌아오면, 방장을 이전하지 않으면
 *     ★★ **아무도 재개 버튼을 누를 수 없다.** 게임이 5분 뒤 폭파된다.
 *   ★ 활성 0명인 동안에는 이전하지 않는다 (이전할 대상이 없다). 그 조건은 그대로다.
 */
function checkHostTransfer(room: Room, now: number): void {
  const host = room.players.get(room.hostAccountId);

  // 방장이 접속 중이면 유예를 해제한다
  if (host?.connected) {
    room.hostGraceUntil = null;
    return;
  }

  // ★ 활성 0명이면 타이머를 정지한다 (설정하지도, 만료시키지도 않는다)
  if (activeCount(room) === 0) return;

  if (room.hostGraceUntil === null) {
    room.hostGraceUntil = now + RULES.HOST_TRANSFER_GRACE_MS;
    return;
  }
  if (now < room.hostGraceUntil) return;

  const candidate = nextHostCandidate(room, room.hostAccountId);
  if (!candidate) {
    // 후보가 없으면 유예를 유지한다
    return;
  }

  const previous = room.hostAccountId;
  room.hostAccountId = candidate.accountId;
  room.hostGraceUntil = null;

  console.log(`[tick] 방 ${room.id} 방장 이전: ${previous} → ${candidate.accountId}`);
  emitRoom(room, 'room.hostChanged', {
    hostAccountId: candidate.accountId,
    nickname: candidate.nickname,
  });
  // ★ 원래 방장이 돌아와도 돌려주지 않는다 (Q-15 확정).
  //   여기서 previous 를 기억해 두지 않는 것이 그 구현이다.
}

/**
 * 접속 종료 표시 갱신 (Q-15 보완).
 *
 * 끊긴 뒤 5초가 지나면 점수판에 "접속 종료" 가 나타나야 한다.
 * 그 순간을 이벤트로 알려야 클라이언트가 갱신할 수 있다.
 *
 * ★ 매 tick 마다 브로드캐스트하지 않는다. 표시 상태가 실제로 바뀔 때만 보낸다.
 *   100ms 마다 10명분을 보내면 의미 없는 트래픽이 된다.
 */
function checkDisconnectDisplay(room: Room, now: number): void {
  let signature = '';
  for (const player of room.players.values()) {
    const shown = toPlayerView(room, player, now).connected;
    signature += `${player.accountId}:${shown ? 1 : 0};`;
  }

  const previous = lastDisplayState.get(room.id);
  if (previous === signature) return;
  lastDisplayState.set(room.id, signature);
  if (previous === undefined) return; // 첫 계산은 알리지 않는다

  emitRoom(room, 'room.playersUpdated', {
    players: [...room.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => toPlayerView(room, p, now)),
    activeCount: activeCount(room),
  });
}

/**
 * 방 삭제 조건 (Q-14).
 *
 * ★ PAUSED 중에는 이 타이머를 정지한다.
 *   그러지 않으면 10분 뒤 방이 사라져 일시정지가 무의미해진다.
 *   R004 2-2 (5)에서 확인한 결정적 항목이다.
 *   Phase 1에는 PAUSED 상태가 없지만 조건을 미리 넣어 둔다.
 */
function shouldDeleteRoom(room: Room, now: number): boolean {
  // ★★ PAUSED 는 pauseAbandonMs(기본 5분)가 담당한다. 여기서 세지 않는다 (D-066).
  //   ★ 두 타이머가 같은 상황에 동시에 돌면 "어느 것이 이기는가" 를 매번 따져야 하고,
  //     ★ 값을 바꿀 때 한쪽만 고치는 사고가 난다. 상태로 배타적으로 나눴다.
  if (!idleDeleteApplies(room)) return false;
  if (activeCount(room) > 0) return false;
  if (room.emptySince === null) {
    room.emptySince = now;
    return false;
  }
  return now - room.emptySince >= RULES.ROOM_IDLE_DELETE_MS;
}
