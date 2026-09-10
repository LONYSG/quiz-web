// =============================================================================
// 문제 진행 (Phase 3) — [문제 시작 공통 절차] / 문제 종료 / 다음 문제
//
// 담당 전이 (docs/04-PROTOCOL.md 3장)
//   [문제 시작 공통 절차]  T02 / T04 / T15 가 공통으로 수행
//   T06  정답자 발생        → QUESTION_RESOLVED
//   T07  시간 종료          → QUESTION_RESOLVED
//   T08  스킵 투표 통과     → QUESTION_RESOLVED
//   T09  방장 강제 스킵     → QUESTION_RESOLVED
//   T10  ★ 마지막 문제면 위 네 경로 모두 → GAME_RESULT (5초 대기 없이)
//   T15  5초 경과           → 다음 문제
//   T16  다음 문제 없음     → GAME_RESULT (no_questions)
//
// ★★★ 이 파일에서 절대 지켜야 할 것
//
//   (1) resolveQuestionSync 안에 **await 를 넣지 않는다.**
//       ★ 그 함수의 첫 두 줄이 장치 A 다 —
//           if (q.resolved) return false;
//           q.resolved = true;
//         ★ 두 줄 사이에 await 가 없으므로 두 번째 요청이 끼어들 수 없다.
//         ★ await 한 줄을 넣는 순간 두 명이 동시에 정답자가 될 수 있다.
//           에러가 나지 않고, 평소에는 정상 동작하고, 재현이 매우 어렵다.
//
//   (2) beginQuestion 도 동기다.
//       ★ tick 이 부른다. tick 에서 await 하면 "정확히 30초" 가 깨진다.
//       ★ 그래서 문제 풀과 경험 기록을 게임 시작 때 메모리로 올려 둔다.
//
//   (3) DB 쓰기는 전부 void 로 띄운다. 실패해도 게임은 진행된다.
// =============================================================================

import { RULES, computeRanking, generateHint, skipThreshold } from '@quiz/shared';
import type { GameEndReason, QuestionResolution } from '@quiz/shared';
import { endGame } from '../db/games.js';
import {
  finalizeScores,
  insertAnswerEvent,
  insertGameQuestion,
  recordExperiences,
  resolveGameQuestion,
} from '../db/gameQuestions.js';
import { emitRoom, emitRoomPerPlayer } from '../rooms/emit.js';
import { activeCount } from '../rooms/registry.js';
import { toPlayerView } from '../rooms/snapshot.js';
import { selectNextQuestion } from './select.js';
import type { CurrentQuestion, GameResultData, Player, Room } from '../rooms/types.js';

/** DB 쓰기 실패를 조용히 삼키지 않는다 */
function fireAndForget(label: string, p: Promise<unknown>): void {
  void p.catch((err) => console.error(`[game] ★ ${label} 기록 실패:`, (err as Error).message));
}

/** 현재 참가자의 계정 id. ★ 접속 여부와 무관하다 (슬롯을 가진 사람 전원) */
export function participantIdsOf(room: Room): string[] {
  return [...room.players.keys()];
}

// ─────────────────────────────────────────────────────────────────────────────
// [문제 시작 공통 절차]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ★★ 다음 문제를 시작한다. **동기 함수다.**
 *
 * 순서 (04-PROTOCOL 3장. 순서가 중요하다)
 *   1. 문제 선정 (3단계 알고리즘, 이미 출제한 문제 제외, 이미 쓴 정답 제외)
 *   2. 정답 집합 로드 + ★ usedAnswerNorms 에 이 문제의 정답 전부 합치기 (Q-76)
 *   3. 마스킹용 원문 표기 적재
 *   4. 힌트 미리 계산
 *   5. 경험자 집합 계산
 *   6. ★ epoch += 1, resolved=false, skipVotes 초기화, hintPushed=false
 *   7. startedAt = now, endsAt = startedAt + 30000
 *   8. game_questions INSERT (★ 비동기로 띄운다)
 *   9. question.started 브로드캐스트 (개인별 selfExperienced 포함)
 *
 * ★ 1~5 는 메모리 연산이다. 풀과 경험 기록이 이미 로드되어 있다.
 *
 * @returns 시작했으면 true. 출제할 문제가 없으면 false (호출자가 T16 으로 간다)
 */
export function beginQuestion(room: Room): boolean {
  const game = room.game;
  if (!game) return false;

  const participantIds = participantIdsOf(room);

  // ── 1. 선정
  const picked = selectNextQuestion({
    pool: game.pool,
    usedQuestionIds: game.usedQuestionIds,
    usedAnswerNorms: game.usedAnswerNorms,
    participantIds,
    experienced: game.experienced,
  });
  if (!picked) return false;

  const q = picked.question;

  // ── 6. 세대 번호와 진행 번호를 올린다. ★ 여기가 epoch 가 증가하는 유일한 자리다
  game.epoch += 1;
  game.questionIndex += 1;
  game.usedQuestionIds.add(q.id);
  // ── 2. ★ 이 문제의 정답 전부를 "이미 쓴 정답" 에 합친다 (Q-76 / D-054).
  //   ★ 대표 정답만 넣지 않는다. 판정이 answer_norm 전체로 이루어지므로 기준을 같게 한다.
  for (const norm of q.answersNorm) game.usedAnswerNorms.add(norm);
  if (picked.stage === 3) game.stage3Count += 1;

  const now = Date.now();
  const current: CurrentQuestion = {
    epoch: game.epoch,
    index: game.questionIndex,
    questionId: q.id,
    text: q.text,
    categoryName: q.categoryName,
    // ── 2. 판정용 정답 집합
    answersNorm: new Set(q.answersNorm),
    displayAnswer: q.displayAnswer,
    // ── 3. 마스킹용 원문 표기 (Phase 6)
    answersRaw: [...q.answersRaw],
    // ── 4. ★ 힌트를 미리 계산해 둔다. 보내지는 않는다
    hint: generateHint(q.hintAnswer ?? q.displayAnswer),
    hintPushed: false,
    explanation: q.explanation,
    // ── 5. 경험자 집합
    experiencedAccountIds: picked.experiencedAccountIds,
    // ── 7. 시각
    startedAt: now,
    endsAt: now + RULES.QUESTION_DURATION_MS,
    resolved: false,
    skipVotes: new Set(),
    selectionStage: picked.stage,
  };

  room.currentQuestion = current;
  room.state = 'QUESTION_ACTIVE';
  game.resolution = null;

  console.log(
    `[game] ${room.id} 문제 ${current.index}/${game.totalQuestions} epoch=${current.epoch} ` +
      `#${q.id} (선정 ${picked.stage}단계 / 미경험 ${picked.unexperiencedCount}명 / ` +
      `경험자 ${current.experiencedAccountIds.size}명)`,
  );

  // ── 8. DB 기록. ★ 기다리지 않는다
  if (game.gameId) {
    fireAndForget(
      'game_questions',
      insertGameQuestion({
        gameId: game.gameId,
        questionIndex: current.index,
        questionId: q.id,
        epoch: current.epoch,
        startedAt: current.startedAt,
        selectionStage: current.selectionStage,
      }),
    );
  }

  // ── 9. 브로드캐스트.
  //   ★★ 정답·힌트·해설을 담지 않는다. QUESTION_ACTIVE 중에 정답을 보내지 않는다.
  //   ★ selfExperienced 는 수신자마다 다르므로 개별 emit 한다.
  broadcastQuestionStarted(room, current);
  return true;
}

/** 경험자 닉네임 목록. ★ guide 28절 폐기 후 전원 공개다 (D-011) */
function experiencedNicknames(room: Room, current: CurrentQuestion): string[] {
  const out: string[] = [];
  for (const id of current.experiencedAccountIds) {
    const p = room.players.get(id);
    if (p) out.push(p.nickname);
  }
  return out;
}

function broadcastQuestionStarted(room: Room, current: CurrentQuestion): void {
  const base = {
    epoch: current.epoch,
    index: current.index,
    total: room.game?.totalQuestions ?? 0,
    text: current.text,
    categoryName: current.categoryName,
    startedAt: current.startedAt,
    endsAt: current.endsAt,
    experiencedNicknames: experiencedNicknames(room, current),
    selfExperienced: false,
    state: room.state,
  };
  emitRoomPerPlayer(room, 'question.started', base, (player) =>
    current.experiencedAccountIds.has(player.accountId) ? { selfExperienced: true } : null,
  );
}

/** ★ 경험자 목록이 바뀌었을 때 다시 알린다 (중간 참가자가 들어온 경우) */
export function broadcastExperiencedUpdated(room: Room): void {
  const current = room.currentQuestion;
  if (!current) return;
  const base = {
    epoch: current.epoch,
    experiencedNicknames: experiencedNicknames(room, current),
    selfExperienced: false,
  };
  emitRoomPerPlayer(room, 'question.experiencedUpdated', base, (player) =>
    current.experiencedAccountIds.has(player.accountId) ? { selfExperienced: true } : null,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 힌트 push (tick)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ★★ 활성 0명 동안 문제 타이머를 멈춘다 (R014 실측으로 추가).
 *
 * ★★ 왜 필요한가 — 실행해 보고 찾은 결함이다
 *   ★ 게임 중에는 퇴장해도 슬롯을 유지한다(01-GAME-RULES 13장).
 *     ★ 그래서 전원이 나가도 방과 게임이 남는다.
 *   ★★ 그 상태에서 tick 이 계속 돌면 **아무도 없는 게임이 끝까지 진행된다.**
 *     문제가 하나씩 소진되고, 경험 기록은 아무에게도 남지 않는다.
 *     ★ 사람이 돌아왔을 때 게임은 이미 끝나 있다.
 *
 * ★ 확정 규칙은 "활성 0명이면 즉시 PAUSED" 다 (T21 / Q-30 개정).
 *   ★ PAUSED 는 Phase 5 다. 이유는 D-023 에 있다.
 *   → ★ Phase 2 가 COUNTDOWN 에서 한 것과 **같은 방식**으로 근사한다 —
 *     상태를 바꾸지 않고 **타이머만 보류**한다.
 *
 * ★ 최종 규칙과 다른 점 (명시한다)
 *   · PAUSED 상태를 브로드캐스트하지 않는다. 화면에 "일시정지" 가 뜨지 않는다
 *   · 30분 초과 시 abandoned 로 끝나는 경로가 없다.
 *     ★ 대신 활성 0명 10분이면 방이 삭제되고 그때 게임이 abandoned 로 닫힌다 (Q-14)
 *   · 방장 재개 버튼이 없다. 사람이 돌아오면 자동으로 이어진다
 *
 * ★ 멈추는 방식: **종료 시각을 흐른 만큼 밀어 준다.**
 *   ★ 근거: 그냥 tick 을 건너뛰면 endsAt 이 과거가 되어, 사람이 돌아온 순간
 *     문제가 즉시 시간 종료된다. ★ 그 문제는 30초를 받지 못한다.
 *   ★ 밀어 주면 문제의 **실제 진행 시간**이 30초로 유지된다. guide 10절의 의도에 맞다.
 *
 * @returns 멈췄으면 true (호출자는 이후 검사를 건너뛴다)
 */
export function freezeIfNoActive(room: Room, now: number): boolean {
  if (room.state !== 'QUESTION_ACTIVE' && room.state !== 'QUESTION_RESOLVED') return false;
  if (activeCount(room) > 0) {
    room.frozenAt = null;
    return false;
  }

  // ★ 처음 비었으면 시각만 기록하고 이번 tick 은 넘긴다
  if (room.frozenAt === null) {
    room.frozenAt = now;
    console.log(`[game] ${room.id} ★ 활성 0명 — 문제 타이머를 멈춘다 (Phase 5 의 PAUSED 근사)`);
    return true;
  }

  // ★ 흐른 만큼 종료 시각을 밀어 준다
  const delta = now - room.frozenAt;
  room.frozenAt = now;
  if (delta <= 0) return true;
  const q = room.currentQuestion;
  if (q) {
    q.startedAt += delta;
    q.endsAt += delta;
  }
  const r = room.game?.resolution;
  if (r && r.nextAt !== null) r.nextAt += delta;
  return true;
}

/**
 * 남은 10초에 힌트를 보낸다 (guide 11절).
 *
 * ★ 문제와 함께 미리 보내지 않는다. 개발자 도구로 30초 시점에 볼 수 있기 때문이다.
 * ★ hintPushed 로 정확히 한 번만 보낸다.
 * ★ 힌트가 null 이어도 push 한다 — 클라이언트가 "이 문제는 힌트가 없습니다" 를 띄운다.
 */
export function pushHintIfDue(room: Room, now: number): void {
  const current = room.currentQuestion;
  if (!current || current.hintPushed || current.resolved) return;
  if (room.state !== 'QUESTION_ACTIVE') return;
  if (current.endsAt - now > RULES.HINT_REVEAL_AT_MS) return;

  current.hintPushed = true;
  emitRoom(room, 'question.hint', { epoch: current.epoch, hint: current.hint });
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★ 문제 종료 — 장치 A
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ★★★ 문제를 끝낸다. **동기 함수다. 이 안에 await 를 넣지 말 것.**
 *
 * 함수 이름에 Sync 를 박아 둔 이유가 그것이다 (04-PROTOCOL 1장 / D-001).
 *
 * ★ 첫 두 줄이 장치 A 다. 그 사이에 await 가 없으므로 문제당 정확히 한 번만 실행된다.
 *   정답 / 시간 종료 / 스킵 투표 / 강제 스킵 이 모두 이 함수를 부르고,
 *   ★ 먼저 도착한 하나만 성공한다.
 *
 * @returns 이 호출이 실제로 문제를 끝냈으면 true. 이미 끝나 있었으면 false
 */
export function resolveQuestionSync(
  room: Room,
  reason: QuestionResolution,
  winnerAccountId: string | null,
): boolean {
  const current = room.currentQuestion;
  const game = room.game;
  if (!current || !game) return false;

  // ★★ 장치 A. 이 두 줄 사이에 await 가 없다
  if (current.resolved) return false;
  current.resolved = true;

  const now = Date.now();
  const isLast = current.index >= game.totalQuestions;

  // ── 점수 (guide 14절: 정답자에게 +1)
  if (reason === 'correct' && winnerAccountId) {
    const winner = room.players.get(winnerAccountId);
    if (winner) winner.score += 1;
  }

  // ── ★★ 경험 기록 (Q-23/24/47): 정답이 공개되는 순간 **접속 중인** 사람 전원
  //   ★ "문제 진행 중에 연결이 끊긴 사람은 그 문제의 기록을 남기지 않는다" (01-GAME-RULES 12장)
  //   ★ 이 계산은 동기다. DB 쓰기만 뒤에서 한다
  const witnesses: string[] = [];
  for (const p of room.players.values()) {
    if (p.connected) witnesses.push(p.accountId);
  }
  // ★ 메모리의 경험 기록도 즉시 갱신한다.
  //   ★ 그러지 않으면 다음 문제 선정이 방금 본 문제를 미경험으로 취급한다
  for (const id of witnesses) {
    let set = game.experienced.get(id);
    if (!set) {
      set = new Set();
      game.experienced.set(id, set);
    }
    set.add(current.questionId);
  }

  game.endedQuestionCount += 1;

  // ── 상태 전이. ★ 마지막 문제는 5초를 기다리지 않는다 (Q-17 / T10)
  const nextAt = isLast ? null : now + RULES.RESOLVED_WAIT_MS;
  game.resolution = {
    epoch: current.epoch,
    reason,
    winnerAccountId,
    displayAnswer: current.displayAnswer,
    explanation: current.explanation,
    nextAt,
  };
  room.state = isLast ? 'GAME_RESULT' : 'QUESTION_RESOLVED';

  console.log(
    `[game] ${room.id} 문제 ${current.index} 종료 (${reason}` +
      `${winnerAccountId ? ` / 정답자 ${room.players.get(winnerAccountId)?.nickname ?? winnerAccountId}` : ''})` +
      `${isLast ? ' ★ 마지막 문제 — 5초 대기 없이 결과로' : ''}`,
  );
  // ── 동기 구간 끝. 여기서부터 브로드캐스트와 DB 다.

  emitRoom(room, 'question.resolved', {
    epoch: current.epoch,
    reason,
    winnerAccountId,
    displayAnswer: current.displayAnswer,
    explanation: current.explanation,
    scores: [...room.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => ({ accountId: p.accountId, score: p.score })),
    nextAt,
    state: room.state,
  });

  // ── DB 기록. ★ 기다리지 않는다
  if (game.gameId) {
    fireAndForget(
      'game_questions 종료',
      resolveGameQuestion({
        gameId: game.gameId,
        questionIndex: current.index,
        resolution: reason,
        winnerAccountId,
        skipVotesAtEnd: current.skipVotes.size,
        activeAtEnd: activeCount(room),
      }),
    );
    fireAndForget(
      '경험 기록',
      recordExperiences({
        accountIds: witnesses,
        questionId: current.questionId,
        gameId: game.gameId,
      }),
    );
  }

  // ★ 마지막 문제였으면 그 자리에서 결과로 간다 (T10)
  if (isLast) finishGame(room, 'completed', null);
  return true;
}

/**
 * ★ 정답을 공개하지 않고 문제를 중단한다 (T11 / T13 / server_restart).
 *
 * ★★ 경험 기록을 남기지 않는다. 정답을 보지 않았기 때문이다 (Q-25 / Q-47).
 *   ★ 그것이 이 함수가 resolveQuestionSync 와 분리되어 있는 이유다.
 *     한 함수에 플래그로 합치면 언젠가 그 플래그가 잘못 전달된다.
 */
export function abortQuestionSync(room: Room): void {
  const current = room.currentQuestion;
  const game = room.game;
  if (!current || !game) return;
  if (current.resolved) return;
  current.resolved = true;
  game.endedQuestionCount += 1;

  if (game.gameId) {
    fireAndForget(
      'game_questions 중단',
      resolveGameQuestion({
        gameId: game.gameId,
        questionIndex: current.index,
        resolution: 'aborted',
        winnerAccountId: null,
        skipVotesAtEnd: current.skipVotes.size,
        activeAtEnd: activeCount(room),
      }),
    );
  }
  console.log(`[game] ${room.id} 문제 ${current.index} 중단 (정답 미공개 / 경험 미기록)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 다음 문제 / 게임 종료
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 5초 경과 → 다음 문제 (T15) 또는 조기 종료 (T16). tick 이 부른다.
 *
 * ★ 동기다. beginQuestion 이 동기이기 때문에 가능하다.
 */
export function advanceAfterResolved(room: Room, now: number): void {
  const game = room.game;
  if (!game || room.state !== 'QUESTION_RESOLVED') return;
  const nextAt = game.resolution?.nextAt;
  if (nextAt === null || nextAt === undefined) return;
  if (now < nextAt) return;

  if (beginQuestion(room)) return;

  // ★ T16 — 다음 문제를 선정할 수 없다 (Q-22)
  finishGame(
    room,
    'no_questions',
    '출제할 수 있는 문제가 모두 소진되어 조기 종료되었습니다. ' +
      '참가자 전원이 이미 경험한 문제만 남았습니다.',
  );
}

/** 시간 종료 (T07). tick 이 부른다 */
export function checkQuestionTimeout(room: Room, now: number): void {
  const current = room.currentQuestion;
  if (!current || room.state !== 'QUESTION_ACTIVE') return;
  if (current.resolved) return;
  if (now < current.endsAt) return;
  resolveQuestionSync(room, 'timeout', null);
}

/**
 * 게임을 끝낸다 (T10 / T11 / T16 …).
 *
 * ★ 결과 데이터를 만들어 room.result 에 넣고 GAME_RESULT 로 전이한다.
 * ★★ Phase 4 가 결과 화면을 만든다. Phase 3 는 데이터와 이벤트까지다 (TEMP-P4-01).
 */
export function finishGame(
  room: Room,
  endReason: GameEndReason,
  abortedNote: string | null,
): void {
  const game = room.game;
  if (!game) return;
  // ★ 두 번 끝내지 않는다. 강제 종료와 마지막 문제가 겹칠 수 있다
  if (room.result) return;

  const ranked = computeRanking(
    [...room.players.values()].map((p) => ({
      accountId: p.accountId,
      nickname: p.nickname,
      colorIndex: p.colorIndex,
      score: p.score,
      connected: p.connected,
    })),
  );

  const current = room.currentQuestion;
  // ★ 마지막 문제의 정답을 결과 화면에 담는다 (Q-17).
  //   ★ 정답을 공개한 경로에서만 담는다. 강제 종료는 공개하지 않았으므로 담지 않는다
  const revealed =
    current && current.resolved && game.resolution && game.resolution.reason !== 'aborted';

  const result: GameResultData = {
    gameId: game.gameId,
    endReason,
    ranking: ranked.map((r) => ({
      rank: r.rank,
      accountId: r.accountId,
      nickname: r.nickname,
      colorIndex: r.colorIndex,
      score: r.score,
      connected: r.connected,
    })),
    lastQuestionReveal: revealed
      ? {
          index: current.index,
          text: current.text,
          displayAnswer: current.displayAnswer,
          explanation: current.explanation,
          winnerAccountId: game.resolution?.winnerAccountId ?? null,
        }
      : null,
    abortedNote,
    endedQuestionCount: game.endedQuestionCount,
    totalQuestions: game.totalQuestions,
  };

  room.state = 'GAME_RESULT';
  room.result = result;
  room.currentQuestion = null;
  game.resolution = null;

  console.log(
    `[game] ${room.id} 게임 종료 (${endReason}) — ${game.endedQuestionCount}/${game.totalQuestions}문제` +
      `${game.stage3Count > 0 ? ` / ★ 정답 중복 허용 출제 ${game.stage3Count}건` : ''}`,
  );

  emitRoom(room, 'game.result', result);

  // ── DB 기록
  if (game.gameId) {
    fireAndForget(
      'final_score',
      finalizeScores(
        game.gameId,
        result.ranking.map((r) => ({
          accountId: r.accountId,
          score: r.score,
          rank: r.rank,
          connected: r.connected,
        })),
      ),
    );
    fireAndForget('games 종료', endGame(game.gameId, endReason, game.endedQuestionCount));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 스킵 투표
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 스킵 투표 현황을 알린다.
 *
 * ★★ 투표자 명단을 보내지 않는다 (guide 22절).
 *   ★ 누가 투표했는지 알려주면 경험자 추정에 쓰일 수 있고, 규칙이 금지한다.
 */
export function broadcastSkipVotes(room: Room): void {
  const current = room.currentQuestion;
  if (!current) return;
  const active = activeCount(room);
  emitRoom(room, 'skip.voteUpdated', {
    epoch: current.epoch,
    votes: current.skipVotes.size,
    threshold: skipThreshold(active),
    activeCount: active,
  });
}

/**
 * ★★ 스킵 임계값을 재평가하고, 도달했으면 **그 자리에서** 스킵한다 (T08).
 *
 * ★ 인원 변동 이벤트 처리 블록 **안에서 동기적으로** 불러야 한다 (04-PROTOCOL 4장).
 *   ★ 다음 tick 으로 미루면 그 사이 도착한 정답과 순서가 불명확해진다.
 *
 * ★ 분모는 현재 활성 플레이어 전체다. 경험 여부와 무관하다.
 *   ★ 경험자를 분모에서 빼면 투표 수로 경험자 수가 역산되어 정보가 샌다.
 */
export function evaluateSkip(room: Room): void {
  const current = room.currentQuestion;
  if (!current || room.state !== 'QUESTION_ACTIVE' || current.resolved) return;

  // ★ 이미 나간 사람의 표는 세지 않는다. 활성 인원이 분모이므로 분자도 같아야 한다
  for (const id of [...current.skipVotes]) {
    const p = room.players.get(id);
    if (!p || !p.connected) current.skipVotes.delete(id);
  }

  const active = activeCount(room);
  const threshold = skipThreshold(active);
  if (threshold === null) return; // 활성 1명이면 투표 불가 (guide 23절)
  if (current.skipVotes.size < threshold) return;

  resolveQuestionSync(room, 'skip_vote', null);
}

// ─────────────────────────────────────────────────────────────────────────────
// 정답 판정에서 쓰는 보조
// ─────────────────────────────────────────────────────────────────────────────

/** answer_events 기록. ★ 정답 문자열과 일치한 메시지만 부른다 (Q-52) */
export function recordAnswerEvent(
  room: Room,
  player: Player,
  input: {
    seq: number;
    receivedAt: number;
    accepted: boolean;
    wasEligible: boolean;
    rejectReason: import('@quiz/shared').AnswerRejectReason | null;
    questionIndex: number;
    questionId: string;
    startedAt: number;
  },
): void {
  const game = room.game;
  if (!game?.gameId) return;
  fireAndForget(
    'answer_events',
    insertAnswerEvent({
      gameId: game.gameId,
      questionIndex: input.questionIndex,
      questionId: input.questionId,
      accountId: player.accountId,
      submittedSeq: input.seq,
      responseMs: Math.max(0, input.receivedAt - input.startedAt),
      matched: true,
      wasEligible: input.wasEligible,
      accepted: input.accepted,
      rejectReason: input.rejectReason,
    }),
  );
}

/** 점수판 갱신 브로드캐스트 */
export function broadcastPlayers(room: Room): void {
  const now = Date.now();
  emitRoom(room, 'room.playersUpdated', {
    players: [...room.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => toPlayerView(room, p, now)),
    activeCount: activeCount(room),
  });
}
