// =============================================================================
// 일시정지 (Phase 5 / R015) — T20 / T21 / T22 / T23 / T14
//
// 담당 전이 (docs/04-PROTOCOL.md 3장)
//   T20  COUNTDOWN        → PAUSED   활성 0명. 즉시. 유예 없음
//   T21  QUESTION_ACTIVE  → PAUSED   활성 0명
//   T22  QUESTION_RESOLVED→ PAUSED   활성 0명
//   T23  PAUSED → pausedFrom         ★★ **방장 game.resume 만.** 자동 재개 없음
//   T14  PAUSED → 방 폭파            ★ pauseAbandonMs(기본 5분) 초과 (Q-82 개정)
//
// ★★★ R014 의 근사 구현(D-061)에서 달라진 점 — 이것이 이 파일의 존재 이유다
//
//   ┌──────────────┬────────────────────────┬──────────────────────────────┐
//   │ 항목         │ R014 근사 (D-061)      │ ★ R015 정식                  │
//   ├──────────────┼────────────────────────┼──────────────────────────────┤
//   │ 상태         │ QUESTION_ACTIVE 유지   │ ★ PAUSED 로 전이             │
//   │ 화면         │ 아무 표시 없음         │ ★ "일시정지" 화면            │
//   │ ★★ 재개      │ ★★ **자동** (사람이    │ ★★★ **방장이 눌러야 한다**   │
//   │              │ 돌아오면 바로 진행)    │                              │
//   │ 타이머 보존  │ endsAt 을 밀어 준다    │ ★ remainingMs 로 저장        │
//   │ 만료         │ 없음 (방 삭제 10분)    │ ★ 5분 → 방 폭파 (Q-82)       │
//   └──────────────┴────────────────────────┴──────────────────────────────┘
//
//   ★★ **자동 재개를 없앤 것이 가장 중요하다.** Q-30 확정 규칙의 근거가 이것이었다 —
//     "자동 재개로 하면 친구 한 명이 먼저 접속한 순간 게임이 돌아가서,
//      나머지가 새 URL 을 입력하는 동안 문제가 소모된다."
//   ★★ 이 프로젝트는 터널 URL 이 매번 바뀐다. 터널이 끊겨 새 링크를 뿌리면
//     **정확히 그 상황이 벌어진다.** 근사 구현으로는 막을 수 없었다.
//
// ★ tick 은 PAUSED 방의 게임 타이머를 건너뛴다. 이 파일의 checkAbandon 만 돈다.
// =============================================================================

import { RULES } from '@quiz/shared';
import { config } from '../config.js';
import { emitRoom } from '../rooms/emit.js';
import { activeCount } from '../rooms/registry.js';
import type { PausedState, Room } from '../rooms/types.js';
import { abortQuestionSync } from './question.js';

/** PAUSED 로 갈 수 있는 상태인가 */
function pausableFrom(room: Room): PausedState['pausedFrom'] | null {
  if (room.state === 'COUNTDOWN') return 'COUNTDOWN';
  if (room.state === 'QUESTION_ACTIVE') return 'QUESTION_ACTIVE';
  if (room.state === 'QUESTION_RESOLVED') return 'QUESTION_RESOLVED';
  // ★ LOBBY 와 GAME_RESULT 는 PAUSED 로 가지 않는다 (04-PROTOCOL 3장).
  //   ★ 타이머가 없으므로 멈출 것이 없고, 기존 방 삭제 경로(활성 0명 10분)를 그대로 탄다.
  return null;
}

/**
 * ★ 지금 멈추면 남은 시간이 얼마인가.
 *
 * ★ 0 아래로 내려가지 않게 한다.
 *   ★ 근거: 이미 지난 것을 음수로 저장하면 재개하는 순간 즉시 만료된다.
 *     ★ 그 문제는 30초를 받지 못한 채 끝난다.
 */
function remainingOf(room: Room, from: PausedState['pausedFrom'], now: number): number {
  if (from === 'COUNTDOWN') return Math.max(0, (room.countdownEndsAt ?? now) - now);
  if (from === 'QUESTION_ACTIVE') return Math.max(0, (room.currentQuestion?.endsAt ?? now) - now);
  return Math.max(0, (room.game?.resolution?.nextAt ?? now) - now);
}

/**
 * ★★ 활성 0명이면 즉시 일시정지한다 (T20 / T21 / T22).
 *
 * ★ **유예가 없다.** 확정 규칙이 "즉시" 다 (Q-30 개정).
 *   ★ 근거: 유예를 두면 그 사이에 타이머가 흐른다. 그것이 막으려던 것이다.
 *
 * @returns 이미 PAUSED 이거나 방금 PAUSED 가 되었으면 true (호출자는 게임 tick 을 건너뛴다)
 */
export function pauseIfNoActive(room: Room, now: number): boolean {
  if (room.paused) return true;
  if (activeCount(room) > 0) return false;

  const from = pausableFrom(room);
  if (!from) return false;

  const remainingMs = remainingOf(room, from, now);
  room.paused = {
    pausedFrom: from,
    pausedAt: now,
    remainingMs,
    abandonAt: now + config.tuning.pauseAbandonMs,
  };
  room.state = 'PAUSED';

  console.log(
    `[pause] ${room.id} ★ 일시정지 (${from} / 남은 ${Math.round(remainingMs / 1000)}초 / ` +
      `${Math.round(config.tuning.pauseAbandonMs / 60000)}분 뒤 폭파)`,
  );

  // ★ 아무도 없으므로 이 브로드캐스트를 받는 사람은 없다.
  //   ★ 그래도 보낸다 — 마지막 소켓이 아직 닫히는 중일 수 있고,
  //     ★ 무엇보다 재접속자는 스냅샷으로 같은 정보를 받는다 (snapshot.ts).
  emitRoom(room, 'game.paused', {
    state: room.state,
    pausedFrom: from,
    remainingMs,
    pausedAt: now,
    abandonAt: room.paused.abandonAt,
  });
  return true;
}

export type ResumeResult =
  | { ok: true }
  | { ok: false; reason: 'not_paused' | 'no_active' | 'no_game' };

/**
 * ★★★ 재개 (T23). **방장이 눌러야만 실행된다.**
 *
 * ★ 호출자(소켓 핸들러)가 방장 권한을 검사한다. 이 함수는 상태만 본다.
 * ★★ **자동으로 부르는 코드가 어디에도 없다.** tick 이 이 함수를 부르지 않는다.
 *   ★ 그것이 Q-30 확정 규칙의 구현이다. 근거는 이 파일 헤더에 있다.
 *
 * ★ epoch 를 증가시키지 않는다. 같은 문제를 이어서 하기 때문이다.
 *   ★★ 증가시키면 재개 직후 모든 클라이언트의 epoch 가 낡은 것이 되어
 *     한 문제 동안 아무도 정답을 낼 수 없게 된다.
 */
export function resumeGame(room: Room): ResumeResult {
  const paused = room.paused;
  if (!paused) return { ok: false, reason: 'not_paused' };
  // ★ 아무도 없는데 재개하면 그 순간 다시 PAUSED 가 된다. 무의미하다
  if (activeCount(room) < 1) return { ok: false, reason: 'no_active' };

  const now = Date.now();
  const { pausedFrom, remainingMs } = paused;

  // ── 동기 전이 구간. ★ 여기에 await 를 넣지 않는다
  room.paused = null;
  room.state = pausedFrom;

  if (pausedFrom === 'COUNTDOWN') {
    room.countdownEndsAt = now + remainingMs;
  } else if (pausedFrom === 'QUESTION_ACTIVE') {
    if (!room.currentQuestion) return { ok: false, reason: 'no_game' };
    // ★ 종료 시각만 다시 잡는다. startedAt 은 건드리지 않는다 —
    //   ★ DB 의 game_questions.started_at 과 어긋나면 안 된다
    room.currentQuestion.endsAt = now + remainingMs;
  } else {
    if (!room.game?.resolution) return { ok: false, reason: 'no_game' };
    room.game.resolution.nextAt = now + remainingMs;
  }

  console.log(
    `[pause] ${room.id} ★ 재개 (${pausedFrom} / 남은 ${Math.round(remainingMs / 1000)}초)`,
  );

  // ★★ 새 종료 시각을 반드시 담는다. 클라이언트가 스스로 계산하면 어긋난다
  emitRoom(room, 'game.resumed', {
    state: room.state,
    epoch: room.currentQuestion?.epoch ?? null,
    endsAt: pausedFrom === 'QUESTION_ACTIVE' ? room.currentQuestion?.endsAt ?? null : null,
    nextAt: pausedFrom === 'QUESTION_RESOLVED' ? room.game?.resolution?.nextAt ?? null : null,
    countdownEndsAt: pausedFrom === 'COUNTDOWN' ? room.countdownEndsAt : null,
  });
  return { ok: true };
}

/**
 * ★ 복귀 현황이 바뀌었음을 알린다.
 *
 * ★ PAUSED 중에 사람이 돌아오면 화면의 "N/M 복귀" 가 바뀌어야 한다.
 *   ★★ 그렇다고 게임이 재개되지는 않는다. 방장이 눌러야 한다.
 */
export function broadcastPauseStatus(room: Room): void {
  if (!room.paused) return;
  emitRoom(room, 'game.pauseStatus', {
    returned: activeCount(room),
    total: room.players.size,
    abandonAt: room.paused.abandonAt,
  });
}

/**
 * ★★ 일시정지가 너무 길어졌는가 (T14 / Q-82 개정). tick 이 부른다.
 *
 * ★ 확정 규칙이 "5분 동안 아무도 안 돌아오면 **방 폭파**" 다.
 *   ★ R004 명세는 "30분 초과 시 GAME_RESULT(abandoned)" 였다.
 *     ★★ Q-82 에서 시간과 결과가 모두 바뀌었다 — 5분이고, 결과 화면이 아니라 폭파다.
 *   ★ 근거: 아무도 없는 방에 결과 화면을 띄워 둘 이유가 없다. 볼 사람이 없다.
 *
 * ★ 정답을 공개하지 않는다. 따라서 경험 기록도 남지 않는다 (Q-47 기준으로 자동 충족).
 *
 * @returns 폭파해야 하면 true (호출자가 방을 삭제한다)
 */
export function checkAbandon(room: Room, now: number): boolean {
  const paused = room.paused;
  if (!paused) return false;
  // ★ 한 명이라도 돌아왔으면 만료 시계를 멈춘다.
  //   ★★ 다시 비면 그때부터 새로 센다 — abandonAt 을 다시 잡는다.
  //     ★ 근거: "5분 동안 **아무도 안 돌아오면**" 이 규칙의 문구다.
  //       한 번 돌아왔다 다시 나간 것은 처음부터 다시 세는 것이 맞다.
  if (activeCount(room) > 0) {
    paused.abandonAt = now + config.tuning.pauseAbandonMs;
    return false;
  }
  if (now < paused.abandonAt) return false;

  console.log(
    `[pause] ${room.id} ★★ 일시정지 ${Math.round(config.tuning.pauseAbandonMs / 60000)}분 초과 — 방을 폭파한다`,
  );
  // ★ 진행 중이던 문제를 중단 기록한다. 정답을 공개하지 않으므로 경험 기록은 없다
  if (paused.pausedFrom === 'QUESTION_ACTIVE') abortQuestionSync(room);
  return true;
}

/**
 * ★ PAUSED 중 방 삭제 타이머(Q-14)를 적용하지 않는다는 것을 한 곳에서 표현한다.
 *
 * ★★ 두 타이머가 동시에 도는 상황을 만들지 않는다 (D-066).
 *   · PAUSED         → pauseAbandonMs (기본 5분) **하나만**
 *   · LOBBY / RESULT → ROOM_IDLE_DELETE_MS (10분) **하나만**
 *   ★ 상태가 배타적이므로 "어느 것이 이기는가" 를 따질 일이 없다.
 */
export function idleDeleteApplies(room: Room): boolean {
  return room.state !== 'PAUSED';
}

/** 화면에 보여줄 일시정지 요약 */
export function pauseView(room: Room): {
  pausedFrom: string;
  remainingMs: number;
  pausedAt: number;
  abandonAt: number;
  returned: number;
  total: number;
} | null {
  if (!room.paused) return null;
  return {
    pausedFrom: room.paused.pausedFrom,
    remainingMs: room.paused.remainingMs,
    pausedAt: room.paused.pausedAt,
    abandonAt: room.paused.abandonAt,
    returned: activeCount(room),
    total: room.players.size,
  };
}

/** ★ 재개 직후 힌트가 이미 지나 있으면 tick 이 바로 push 한다. 그 조건을 여기서 설명한다 */
export const HINT_AFTER_RESUME_NOTE =
  `★ 재개 직후 남은 시간이 ${RULES.HINT_REVEAL_AT_MS / 1000}초 이하이고 hintPushed 가 false 이면 ` +
  'tick 이 곧바로 힌트를 push 한다. pushHintIfDue 가 시각만 보므로 별도 처리가 필요 없다.';
