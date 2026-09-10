// =============================================================================
// 정답 판정 (Phase 3 / guide 12·16·18·44절)
//
// ★★★ 이 파일이 이 프로젝트에서 가장 조심해야 할 곳이다.
//
//   판정과 상태 전환은 **하나의 동기 실행 블록**에서 수행한다.
//   ★ 그 블록 안에 await 를 절대 넣지 않는다.
//
//   ★ 왜 — Node 는 단일 스레드 이벤트 루프다. 하나의 핸들러가 await 없이 끝까지
//     실행되는 동안 다른 이벤트가 끼어들 수 없다. 그 성질이 별도의 락 없이
//     "한 문제의 정답자는 정확히 한 명" 을 보장한다 (guide 18절).
//
//   ★★ 누군가 "여기서 경험 여부를 한 번 더 확인하자" 며 await 한 줄을 넣는 순간
//     그 지점에서 다른 이벤트가 끼어들 수 있게 되어 **두 명이 정답자가 될 수 있다.**
//       · 에러가 나지 않는다
//       · 평소에는 정상 동작한다
//       · 동시 입력이 정확히 겹치는 순간에만 발생한다
//       · 재현이 매우 어렵다
//
//   → ★ 그래서 이 파일의 판정 함수는 **async 가 아니다.** 타입이 그것을 강제한다.
//     DB 기록이 필요하면 void 로 띄운다 (question.ts 의 recordAnswerEvent).
//
// ★★ 판정 조건 (04-PROTOCOL 2장. 전부 만족해야 정답이다)
//   state = QUESTION_ACTIVE
//   AND resolved = false
//   AND ★ epoch 일치            ← 장치 B
//   AND ★ 수신 시각 ≤ endsAt     ← tick 오차가 판정에 영향을 주지 않게 한다
//   AND 발신자 connected
//   AND ★ 미경험자
//   AND 정규화 일치
//
// ★ 마스킹과는 완전히 분리되어 있다 (04-PROTOCOL 5장).
//   판정은 **항상 클라이언트가 보낸 원문**을 입력으로 받고 마스킹 결과를 참조하지 않는다.
// =============================================================================

import { normalizeAnswer } from '@quiz/shared';
import type { AnswerRejectReason } from '@quiz/shared';
import type { Player, Room } from '../rooms/types.js';

export interface JudgeInput {
  /** ★ 클라이언트가 보낸 원문. 마스킹 전이다 */
  rawText: string;
  /** ★ 클라이언트가 보고 있던 문제 세대 번호. 없으면 판정하지 않는다 */
  epoch: number | null;
  /** 서버 수신 시각 */
  receivedAt: number;
}

export interface JudgeOutcome {
  /** ★ 정답 문자열과 일치했는가. answer_events 기록 대상 판단에 쓴다 (Q-52) */
  matched: boolean;
  /** 이 사람이 판정 자격이 있었는가 (경험자면 false) */
  wasEligible: boolean;
  /** 최종적으로 정답자가 되었는가 */
  accepted: boolean;
  /** 왜 정답이 되지 못했는가 */
  rejectReason: AnswerRejectReason | null;
  /** 판정 대상 문제의 정보. answer_events 기록에 쓴다 */
  question: {
    index: number;
    questionId: string;
    startedAt: number;
  } | null;
}

const NO_QUESTION: JudgeOutcome = {
  matched: false,
  wasEligible: false,
  accepted: false,
  rejectReason: null,
  question: null,
};

/**
 * ★★★ 정답 판정. **동기 함수다. 이 안에 await 를 넣지 말 것.**
 *
 * ★ 이 함수는 **판정만** 한다. 상태 전환(resolveQuestionSync)은 호출자가 한다.
 *   ★ 근거 (04-PROTOCOL 5장): 정답이 확정되면 question.resolved 를 보내야 하는데,
 *     그보다 먼저 chat.message 가 나가야 화면에 "철수: 훈민정음" 다음에
 *     "정답! 철수" 가 뜬다. 그래서 판정과 emit 을 분리한다.
 *   ★ 원자성은 resolved 플래그가 보장하므로 분리해도 안전하다.
 *
 * ★ 반환값의 accepted=true 이면 호출자가 resolveQuestionSync('correct', accountId) 를
 *   부른다. ★ 그 사이에도 await 가 없어야 한다.
 */
export function judgeAnswer(room: Room, player: Player, input: JudgeInput): JudgeOutcome {
  const current = room.currentQuestion;
  if (!current) return NO_QUESTION;

  const q = {
    index: current.index,
    questionId: current.questionId,
    startedAt: current.startedAt,
  };

  // ── ★ 먼저 문자열 일치를 본다.
  //   ★ 근거: matched 여부가 answer_events 기록 대상을 정한다 (Q-52).
  //     ★ 자격이 없어도 "정답 문자열과 일치했다" 는 기록해야 한다 —
  //       guide 18절의 순서 추적과 동시 정답 사후 검증의 근거다.
  const matched = current.answersNorm.has(normalizeAnswer(input.rawText));
  if (!matched) {
    // ★ 일치하지 않으면 그냥 일반 채팅이다. "오답입니다" 를 보내지 않는다 (guide 15절)
    return { ...NO_QUESTION, question: q };
  }

  const fail = (rejectReason: AnswerRejectReason, wasEligible: boolean): JudgeOutcome => ({
    matched: true,
    wasEligible,
    accepted: false,
    rejectReason,
    question: q,
  });

  // ── 상태. ★ QUESTION_RESOLVED / GAME_RESULT / PAUSED 에서는 판정하지 않는다
  if (room.state !== 'QUESTION_ACTIVE') return fail('already_resolved', true);

  // ── 장치 A. 이미 끝난 문제
  if (current.resolved) return fail('already_resolved', true);

  // ── ★★ 장치 B — epoch (guide 20절)
  //   ★ RESOLVED 구간에 친 메시지가 다음 문제 시작 직후 도착해 우연히 새 정답과
  //     일치하는 경우를 여기서 막는다. 상태 검사만으로는 절대 막을 수 없다.
  //   ★ epoch 가 없는 요청(옛 클라이언트)도 여기서 걸린다. 조용히 통과시키지 않는다.
  if (input.epoch !== current.epoch) return fail('epoch_mismatch', true);

  // ── ★ 정답 인정 경계는 endsAt 이다 (guide 18절)
  //   ★ tick 이 100ms 주기라 만료 후 최대 100ms 동안 상태가 아직 ACTIVE 다.
  //     ★ 그 사이 도착한 늦은 답을 시각으로 잘라낸다. tick 오차가 판정에 영향을 주지 않는다.
  if (input.receivedAt > current.endsAt) return fail('past_deadline', true);

  // ── 발신자가 접속 중인가
  //   ★ disconnect 가 먼저 처리되었으면 미접속 플레이어의 메시지다
  if (!player.connected) return fail('not_connected', true);

  // ── ★ 경험자는 판정에서 제외된다 (guide 28·29절 / 01-GAME-RULES 12장)
  //   ★ wasEligible=false 로 기록한다. 자격 자체가 없었다는 뜻이다
  if (current.experiencedAccountIds.has(player.accountId)) return fail('experienced', false);

  // ── ★ 통과. 정답자다
  return {
    matched: true,
    wasEligible: true,
    accepted: true,
    rejectReason: null,
    question: q,
  };
}

/**
 * 채팅 rate limit (Q-18: 3초 이동 윈도 10개).
 *
 * ★ 동기다. 판정 경로 앞에 있으므로 await 가 있으면 안 된다.
 * ★★ 정상적인 연타(초당 3개 수준)를 막지 않아야 한다 (04-PROTOCOL 4장).
 *   ★ 이 게임은 정답을 맹렬히 타이핑하는 게임이다. 3초에 10개는 초당 3.3개를 허용한다.
 *
 * @returns 허용되면 null. 막히면 다시 시도할 수 있는 시각까지의 ms
 */
export function checkChatRate(room: Room, accountId: string, now: number, limits: {
  windowMs: number;
  max: number;
}): number | null {
  let stamps = room.chatTimestamps.get(accountId);
  if (!stamps) {
    stamps = [];
    room.chatTimestamps.set(accountId, stamps);
  }
  const cutoff = now - limits.windowMs;
  // ★ 윈도 밖의 기록을 버린다. 배열이 무한히 자라지 않게 한다
  while (stamps.length > 0 && stamps[0]! <= cutoff) stamps.shift();

  if (stamps.length >= limits.max) {
    // ★ 가장 오래된 기록이 윈도를 벗어나는 시점까지 기다려야 한다
    return Math.max(1, stamps[0]! + limits.windowMs - now);
  }
  stamps.push(now);
  return null;
}
