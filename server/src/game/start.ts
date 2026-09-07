// =============================================================================
// 게임 시작과 카운트다운 (guide 8·9절 / docs/04-PROTOCOL.md T01~T04)
//
// 이 파일이 담당하는 전이
//   T01  LOBBY → COUNTDOWN         방장 game.start (startMode=countdown)
//   T02  LOBBY → QUESTION_ACTIVE   방장 game.start (startMode=instant)
//   T03  COUNTDOWN → LOBBY         방장 game.cancelCountdown
//   T04  COUNTDOWN → QUESTION_ACTIVE  now >= countdownEndsAt (전역 tick 이 호출)
//
// ★★ 지켜야 할 순서 두 가지
//
//   (1) 검증(await 포함) → 동기 상태 전이 → DB 기록(await)
//       상태 전이 자체는 반드시 동기 블록 하나로 끝낸다.
//       중간에 await 가 있으면 그 사이 tick 이나 다른 이벤트가 끼어들어
//       같은 게임이 두 번 시작되거나, 취소된 카운트다운이 시작되어 버린다.
//
//   (2) ★ await 뒤에는 상태를 다시 확인한다.
//       조회를 기다리는 동안 방장이 취소했거나, 사람이 다 나갔거나,
//       다른 경로로 이미 게임이 시작되었을 수 있다.
//       "검증했으니 지금도 유효하다"는 가정이 이 프로젝트에서 가장 위험한 가정이다.
//
// ★★ 임시 코드 표시
//   Phase 2에는 문제 출제(Phase 3)가 없다. 게임 레코드를 만들고 상태를
//   QUESTION_ACTIVE 로 올리는 데서 멈춘다.
//   Phase 3에서 반드시 제거·교체해야 할 자리에 TEMP-P3-nn 를 달아 두었다.
//   목록은 docs/05-STATUS.md "Phase 3에서 제거해야 할 임시 코드" 에 있다.
// =============================================================================

import { validateRoomSettings } from '@quiz/shared';
import { countAvailableQuestions } from '../db/questions.js';
import { insertGame, insertGamePlayers } from '../db/games.js';
import { emitRoom } from '../rooms/emit.js';
import { activeCount } from '../rooms/registry.js';
import { participantIds } from '../lobby/info.js';
import type { Room } from '../rooms/types.js';

export type StartFailure =
  | { reason: 'busy' }
  | { reason: 'invalid_state' }
  | { reason: 'settings'; message: string }
  | { reason: 'no_active' }
  | { reason: 'not_enough'; available: number; wanted: number };

export type StartResult = { ok: true } | ({ ok: false } & StartFailure);

/** 부족 안내 문구. 서버와 봇 테스트가 같은 문구를 본다 */
export function notEnoughMessage(available: number, wanted: number): string {
  return `출제할 수 있는 문제가 ${available}개뿐입니다. 문제 수를 ${available}개 이하로 줄여 주세요. (요청 ${wanted}개)`;
}

/**
 * 게임 시작 요청 (T01 / T02). 방장의 game.start 가 호출한다.
 *
 * startMode 에 따라 카운트다운을 걸거나 즉시 시작한다.
 */
export async function requestStart(room: Room): Promise<StartResult> {
  // ── 동기 게이트. await 앞에서 세운다.
  if (room.startingGame) return { ok: false, reason: 'busy' };
  if (room.state !== 'LOBBY' || room.settingsLocked || room.game !== null) {
    return { ok: false, reason: 'invalid_state' };
  }
  room.startingGame = true;

  try {
    // ── 1. 설정값 재검증 (guide 44절: 클라이언트 검증만 믿지 않는다)
    const valid = validateRoomSettings(room.settings);
    if (!valid.ok) return { ok: false, reason: 'settings', message: valid.message };

    if (activeCount(room) < 1) return { ok: false, reason: 'no_active' };

    // ── 2. ★ 출제 가능 수 재검증 (Q-21). 캐시를 믿지 않고 지금 조회한다.
    const wanted = room.settings.questionCount;
    const available = await countAvailableQuestions(participantIds(room));
    room.availableQuestionCount = available;

    // ★ await 뒤 상태 재확인. 조회 중에 방이 바뀔 수 있다.
    if (room.state !== 'LOBBY' || room.game !== null) {
      return { ok: false, reason: 'invalid_state' };
    }
    if (available < wanted) {
      // 화면에 최신 상한을 알려 준다. 안내 없이 거부하면 이유를 알 수 없다.
      emitRoom(room, 'lobby.settingsUpdated', {
        settings: { ...room.settings },
        settingsLocked: room.settingsLocked,
        availableQuestionCount: available,
      });
      return { ok: false, reason: 'not_enough', available, wanted };
    }

    // ── 3. 전이
    if (room.settings.startMode === 'countdown') {
      // T01. 여기는 동기 블록이다.
      room.state = 'COUNTDOWN';
      room.settingsLocked = true;
      room.countdownEndsAt = Date.now() + room.settings.countdownSec * 1000;
      console.log(
        `[game] ${room.id} 카운트다운 시작 ${room.settings.countdownSec}초 (문제 ${wanted}개 / 가능 ${available}개)`,
      );
      emitRoom(room, 'game.countdownStarted', {
        endsAt: room.countdownEndsAt,
        state: room.state,
        settingsLocked: true,
        settings: { ...room.settings },
      });
      return { ok: true };
    }

    // T02. 즉시 시작.
    await beginGame(room, available);
    return { ok: true };
  } finally {
    room.startingGame = false;
  }
}

/**
 * 카운트다운 취소 (T03).
 *
 * ★ 게임 레코드는 아직 만들어지지 않았다. 카운트다운 중에는 games 행이 없다.
 *   T01에서 미리 만들었다면 취소마다 버려진 행이 남는다.
 */
export function cancelCountdown(room: Room): boolean {
  if (room.state !== 'COUNTDOWN') return false;
  room.state = 'LOBBY';
  room.settingsLocked = false;
  room.countdownEndsAt = null;
  console.log(`[game] ${room.id} 카운트다운 취소`);
  emitRoom(room, 'game.countdownCancelled', {
    state: room.state,
    settingsLocked: false,
    settings: { ...room.settings },
  });
  return true;
}

/**
 * 카운트다운 만료 (T04). 전역 tick 이 호출한다.
 *
 * ★ tick 은 await 하지 않는다. 이 함수는 동기적으로 상태를 전이시킨 뒤
 *   DB 기록만 비동기로 남긴다. 호출자는 결과를 기다리지 않아도 된다.
 */
export async function startFromCountdown(room: Room): Promise<StartResult> {
  if (room.startingGame) return { ok: false, reason: 'busy' };
  if (room.state !== 'COUNTDOWN' || room.game !== null) {
    return { ok: false, reason: 'invalid_state' };
  }
  room.startingGame = true;

  try {
    // ★ 카운트다운 중 신규 입장이 허용되므로(Q-11) 참가자 집합이 바뀌었을 수 있다.
    //   출제 가능 수를 다시 확인한다. 사람이 늘면 수가 늘고, 나가면 줄어든다.
    const wanted = room.settings.questionCount;
    const available = await countAvailableQuestions(participantIds(room));
    room.availableQuestionCount = available;

    // ★ await 뒤 재확인. 조회 중에 방장이 취소했을 수 있다.
    if (room.state !== 'COUNTDOWN' || room.game !== null) {
      return { ok: false, reason: 'invalid_state' };
    }
    if (activeCount(room) < 1) return { ok: false, reason: 'no_active' };

    if (available < wanted) {
      // ★ 명세에 없는 경로다 (자체 판단, D-025).
      //   카운트다운 중 사람이 나가 출제 가능 수가 줄어든 경우다.
      //   게임을 빈 상태로 시작하는 것보다 로비로 되돌리고 이유를 알려주는 것이 낫다.
      room.state = 'LOBBY';
      room.settingsLocked = false;
      room.countdownEndsAt = null;
      emitRoom(room, 'game.countdownCancelled', {
        state: room.state,
        settingsLocked: false,
        settings: { ...room.settings },
        reason: 'not_enough_questions',
      });
      emitRoom(room, 'error', {
        code: 'NOT_ENOUGH_QUESTIONS',
        message: notEnoughMessage(available, wanted),
        detail: null,
      });
      return { ok: false, reason: 'not_enough', available, wanted };
    }

    await beginGame(room, available);
    return { ok: true };
  } finally {
    room.startingGame = false;
  }
}

/**
 * 실제 게임 시작. T02 / T04 가 공통으로 쓴다.
 *
 * ★ 앞부분(상태 전이)은 동기다. 뒷부분(DB)만 await 한다.
 */
async function beginGame(room: Room, availableAtStart: number): Promise<void> {
  const now = Date.now();
  const settings = { ...room.settings };

  // ── 동기 전이 구간. 여기에 await 를 넣지 않는다.
  room.state = 'QUESTION_ACTIVE';
  room.settingsLocked = true;
  room.countdownEndsAt = null;
  room.lastGameSettings = settings; // "다시 하기" 에서 복원한다 (Q-31)
  for (const player of room.players.values()) player.score = 0;
  room.game = {
    gameId: null,
    totalQuestions: settings.questionCount,
    availableAtStart,
    startedAt: now,
    questionIndex: 0,
    epoch: 0,
  };
  const roster = [...room.players.values()].map((p) => ({
    accountId: p.accountId,
    colorIndex: p.colorIndex,
    // 시작 시점 참가자는 전원 중간 참가가 아니다 (guide 32절)
    isMidgameJoin: false,
  }));
  console.log(
    `[game] ${room.id} 게임 시작 — 문제 ${settings.questionCount}개 / 참가자 ${roster.length}명 / 가능 ${availableAtStart}개`,
  );
  // ── 동기 구간 끝.

  // ── DB 기록. 실패해도 상태는 이미 전이되어 있다.
  try {
    const gameId = await insertGame({
      roomId: room.id,
      settingQuestionCount: settings.questionCount,
      settingStartMode: settings.startMode,
      settingCountdownSec: settings.startMode === 'countdown' ? settings.countdownSec : null,
      plannedQuestionCount: availableAtStart,
    });
    // ★ 그 사이 방이 사라졌거나 게임이 교체되었으면 덮어쓰지 않는다.
    if (room.game && room.game.gameId === null) room.game.gameId = gameId;
    await insertGamePlayers(gameId, roster);
    console.log(`[game] ${room.id} 레코드 생성 games.id=${gameId} / 참가자 ${roster.length}행`);
  } catch (err) {
    // ★ Phase 3에서는 이것이 치명적이다. game_questions / answer_events 가 붙을 곳이 없어진다.
    //   Phase 2에서는 진행할 문제가 없으므로 게임을 되돌리지 않고 기록만 남긴다.
    //   ★ TEMP-P3-03: Phase 3에서 "레코드 생성 실패 시 게임을 시작하지 않는다" 로 바꿔야 한다.
    console.error(`[game] ★ ${room.id} 게임 레코드 생성 실패:`, (err as Error).message);
  }

  emitRoom(room, 'game.started', {
    gameId: room.game?.gameId ?? null,
    totalQuestions: settings.questionCount,
    state: room.state,
  });

  // ★★ TEMP-P3-01 — 여기에 Phase 3의 [문제 시작 공통 절차]가 붙는다.
  //   (docs/04-PROTOCOL.md 3장 "[문제 시작 공통 절차]" 1~9단계)
  //   지금은 문제를 내지 않으므로 QUESTION_ACTIVE 이면서 currentQuestion 이 null 이다.
  //   ★ 클라이언트는 그 조합을 보고 "Phase 3 예정" 안내를 띄운다 (Lobby.tsx 의 같은 표시).
  //   ★ Phase 3 착수 시 이 주석과 클라이언트의 임시 안내를 함께 제거해야 한다.
}
