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
// ★★ Phase 3 에서 바뀐 것 (R014)
//   · 임시 코드 01 제거 — beginGame 끝에 [문제 시작 공통 절차]가 붙었다
//   · 임시 코드 03 제거 — ★ 게임 레코드 생성이 실패하면 게임을 시작하지 않는다.
//     ★ 근거: game_questions / answer_events / question_experiences 가 붙을 곳이 없다.
//       Phase 2 에서는 진행할 문제가 없어 무해했지만, Phase 3 에서는 치명적이다 —
//       ★ 경험 기록이 남지 않으면 그 게임이 장기 자산(guide 26절)에 반영되지 않는다.
//   · ★ 출제 풀과 경험 기록을 게임 시작 때 메모리로 올린다 (D-054 성능 항목)
// =============================================================================

import { validateRoomSettings } from '@quiz/shared';
import { countAvailableQuestions } from '../db/questions.js';
import { loadExperienced, loadQuestionPool } from '../db/questionPool.js';
import { insertGame, insertGamePlayers } from '../db/games.js';
import { emitRoom } from '../rooms/emit.js';
import { activeCount } from '../rooms/registry.js';
import { participantIds } from '../lobby/info.js';
import { beginQuestion, finishGame } from './question.js';
import type { Room } from '../rooms/types.js';

export type StartFailure =
  | { reason: 'busy' }
  | { reason: 'invalid_state' }
  | { reason: 'settings'; message: string }
  | { reason: 'no_active' }
  | { reason: 'not_enough'; available: number; wanted: number }
  /** ★ Phase 3 신설 — 게임 레코드를 만들지 못했다 (옛 임시 코드 03 을 교체한 것) */
  | { reason: 'record_failed' };

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
    const ok = await beginGame(room, available);
    return ok ? { ok: true } : { ok: false, reason: 'record_failed' };
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

    const ok = await beginGame(room, available);
    return ok ? { ok: true } : { ok: false, reason: 'record_failed' };
  } finally {
    room.startingGame = false;
  }
}

/**
 * 실제 게임 시작. T02 / T04 가 공통으로 쓴다.
 *
 * ★★ 순서가 중요하다 (Phase 3 에서 바뀌었다)
 *   1. ★ DB 준비를 **먼저** 한다 — games INSERT + 출제 풀 + 경험 기록
 *      ★ 근거: 레코드 생성이 실패하면 게임을 시작하지 않아야 한다.
 *        시작한 뒤에 실패를 알면 되돌릴 수 없다.
 *   2. ★ await 뒤 상태 재확인. 조회 중에 방이 바뀔 수 있다
 *   3. 동기 전이 구간 — 여기에 await 를 넣지 않는다
 *   4. ★ [문제 시작 공통 절차] — 동기다 (beginQuestion)
 */
async function beginGame(room: Room, availableAtStart: number): Promise<boolean> {
  const settings = { ...room.settings };
  const roster = [...room.players.values()].map((p) => ({
    accountId: p.accountId,
    colorIndex: p.colorIndex,
    // 시작 시점 참가자는 전원 중간 참가가 아니다 (guide 32절)
    isMidgameJoin: false,
  }));

  // ── 1. ★ DB 준비. 실패하면 게임을 시작하지 않는다
  let gameId: string;
  try {
    gameId = await insertGame({
      roomId: room.id,
      settingQuestionCount: settings.questionCount,
      settingStartMode: settings.startMode,
      settingCountdownSec: settings.startMode === 'countdown' ? settings.countdownSec : null,
      plannedQuestionCount: availableAtStart,
    });
    await insertGamePlayers(gameId, roster);
  } catch (err) {
    // ★★ Phase 2 에서는 기록만 남기고 게임을 시작했다 (옛 임시 코드 표식 03).
    //   ★ Phase 3 에서는 시작하지 않는다. 근거는 이 파일 헤더에 있다.
    console.error(`[game] ★★ ${room.id} 게임 레코드 생성 실패 — 게임을 시작하지 않는다:`, (err as Error).message);
    return false;
  }

  // ── ★ 출제 풀과 경험 기록을 메모리로 올린다 (D-054 성능 항목).
  //   ★ 이것이 정답 판정 블록에서 await 가 필요 없어지는 근거다.
  let pool;
  let experienced;
  try {
    [pool, experienced] = await Promise.all([
      loadQuestionPool(),
      loadExperienced(participantIds(room)),
    ]);
  } catch (err) {
    console.error(`[game] ★★ ${room.id} 출제 풀 로드 실패 — 게임을 시작하지 않는다:`, (err as Error).message);
    return false;
  }

  // ── 2. ★ await 뒤 재확인. 조회 중에 방장이 취소했거나 사람이 다 나갔을 수 있다
  if (room.game !== null) {
    console.error(`[game] ★ ${room.id} 준비 중 다른 경로로 게임이 시작되었다. 중단한다.`);
    return false;
  }
  if (room.state !== 'QUESTION_ACTIVE' && room.state !== 'LOBBY' && room.state !== 'COUNTDOWN') {
    return false;
  }
  if (activeCount(room) < 1) return false;

  // ── 3. 동기 전이 구간. ★ 여기에 await 를 넣지 않는다.
  const now = Date.now();
  room.state = 'QUESTION_ACTIVE';
  room.settingsLocked = true;
  room.countdownEndsAt = null;
  room.result = null;
  room.currentQuestion = null;
  room.lastGameSettings = settings; // "다시 하기" 에서 복원한다 (Q-31)
  for (const player of room.players.values()) player.score = 0;
  room.chatTimestamps.clear();
  room.game = {
    gameId,
    totalQuestions: settings.questionCount,
    availableAtStart,
    startedAt: now,
    questionIndex: 0,
    epoch: 0,
    pool,
    experienced,
    usedQuestionIds: new Set(),
    usedAnswerNorms: new Set(),
    resolution: null,
    endedQuestionCount: 0,
    stage3Count: 0,
  };
  console.log(
    `[game] ${room.id} 게임 시작 — 문제 ${settings.questionCount}개 / 참가자 ${roster.length}명 / ` +
      `가능 ${availableAtStart}개 / 풀 ${pool.length}건 / games.id=${gameId}`,
  );

  emitRoom(room, 'game.started', {
    gameId,
    totalQuestions: settings.questionCount,
    state: room.state,
  });

  // ── 4. ★★ [문제 시작 공통 절차] (04-PROTOCOL 3장). 동기다
  if (!beginQuestion(room)) {
    // ★ 시작 검증(Q-21)을 통과했는데 선정에 실패했다.
    //   ★ 조회와 선정 사이에 문제가 비활성화되었거나, 정답 없는 문제가 걸러진 경우다.
    //   ★ 조용히 빈 게임으로 두지 않는다. 조기 종료로 끝낸다 (T16).
    console.error(`[game] ★★ ${room.id} 첫 문제 선정 실패 — 조기 종료한다`);
    finishGame(
      room,
      'no_questions',
      '출제할 수 있는 문제를 찾지 못해 게임을 시작하지 못했습니다.',
    );
    return false;
  }
  return true;
}
