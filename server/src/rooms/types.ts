// =============================================================================
// 메모리 방 모델
//
// ★★ 이 구조 위에 Phase 3의 게임 상태가 얹힌다. 뼈대를 잘못 세우면 전부 뜯어야 한다.
//
// 왜 메모리인가 (docs/07-DECISIONS.md D-008)
//   guide 48절이 "진행 중인 실시간 게임 상태는 서버 메모리와 DB를 적절히 조합해 구현할 수 있다"고
//   명시적으로 허용한다. 참가자 접속 상태는 초 단위로 바뀌므로 DB에 반영하면 DB를 계속 깨워 둔다.
//   그리고 서버가 재시작되면 소켓이 전부 끊기므로 참가자 목록을 복원해도 의미가 없다.
//   DB에는 rooms 레코드만 둔다.
//
// ★ Phase 3에서 여기에 추가될 것 (지금은 자리만 비워 둔다)
//   game / currentQuestion / skipVotes / scores / paused
//   필드를 미리 선언해 두면 Phase 3에서 채우기만 하면 되고,
//   스냅샷 생성 함수(snapshot.ts)도 구조를 바꿀 필요가 없다.
// =============================================================================

import type { RoomState } from '@quiz/shared';

export interface Player {
  accountId: string;
  nickname: string;
  /** 색상 팔레트 인덱스. 게임 세션 동안 유지되고 재접속해도 같다 (guide 35절) */
  colorIndex: number;
  /** 입장 순서. 방장 이전 순서를 결정한다 (입장이 가장 빠른 활성 플레이어) */
  joinOrder: number;
  /** 현재 소켓이 붙어 있는가 */
  connected: boolean;
  socketId: string | null;
  /**
   * 끊긴 시각. null이면 접속 중.
   * ★ 점수판의 "접속 종료" 표시는 끊긴 뒤 5초가 지나야 나타난다 (Q-15 보완).
   *   새로고침은 보통 1~3초라 즉시 표시하면 표기가 깜빡여 사용자 경험이 나쁘다.
   *   ★ 단 스킵 분모와 활성 인원 판정은 끊김 즉시 반영한다 (Q-29). 두 축을 분리한다.
   */
  disconnectedAt: number | null;
  /** 현재 게임에서의 점수. Phase 3에서 사용한다 */
  score: number;
}

export interface RoomSettings {
  questionCount: number;
  startMode: 'instant' | 'countdown';
  countdownSec: number;
}

/**
 * 진행 중인 게임 (Phase 2에서 도입).
 *
 * ★ Phase 2 범위는 "게임이 시작되기 직전 상태까지" 다.
 *   레코드를 만들고 상태를 QUESTION_ACTIVE 로 올리는 것까지 하고, 문제는 내지 않는다.
 *   questionIndex 와 epoch 는 Phase 3에서 [문제 시작 공통 절차]가 올린다.
 */
export interface ActiveGame {
  /**
   * games.id. ★ null 인 구간이 존재한다.
   *   상태 전이는 동기로 즉시 끝내고 DB INSERT 는 그 뒤에 await 하기 때문이다.
   *   순서를 뒤집으면 INSERT 를 기다리는 사이에 tick 이 한 번 더 돌아
   *   같은 게임이 두 번 시작될 수 있다.
   *   ★ Phase 3에서 game_questions INSERT 는 이 값이 채워진 뒤에만 해야 한다.
   */
  gameId: string | null;
  /** 진행할 문제 수. 설정값과 같다 (출제 가능 수는 이미 검증되었다) */
  totalQuestions: number;
  /** 시작 시점 출제 가능 수 (Q-21 검증 결과). games.planned_question_count 와 같다 */
  availableAtStart: number;
  startedAt: number;
  /** 1-based. 0 이면 아직 첫 문제 전이다. ★ Phase 3에서 올린다 */
  questionIndex: number;
  /** 문제 세대 번호 (R003 2-3 장치 B). ★ Phase 3에서 올린다 */
  epoch: number;
}

export interface Room {
  id: string;
  title: string;
  /** 현재 방장. 이전되면 바뀐다 (rooms.host_account_id 는 생성 당시 값으로 고정) */
  hostAccountId: string;
  createdBy: string;
  createdAt: number;

  state: RoomState;

  /** 입장 순서를 보존하기 위해 Map 을 쓴다 (JS Map 은 삽입 순서를 보장한다) */
  players: Map<string, Player>;
  nextJoinOrder: number;

  settings: RoomSettings;
  settingsLocked: boolean;

  /**
   * 카운트다운 종료 시각. COUNTDOWN 상태에서만 값이 있다 (Q-11).
   * ★ 서버 시각 기준 절대 시각이다. 클라이언트는 시계 오프셋으로 남은 시간을 그린다.
   *   "남은 초" 를 보내면 네트워크 지연만큼 어긋나고, 재접속하면 복구할 수 없다.
   */
  countdownEndsAt: number | null;

  /**
   * ★ 게임 시작 처리 중 플래그.
   *   game.start 와 카운트다운 만료는 둘 다 DB 조회(await)를 포함한다.
   *   그 사이에 tick 이 다시 돌거나 방장이 버튼을 두 번 누르면 게임이 두 번 시작된다.
   *   await 앞에서 이 플래그를 동기적으로 세우는 것이 유일한 방어다.
   */
  startingGame: boolean;

  /**
   * 출제 가능 문제 수 (Q-21). 참가자 변동 시점에만 갱신한다.
   * ★ 주기적으로 다시 계산하지 않는다. DB를 계속 깨워 두지 않기 위함이다.
   * ★ 게임 시작 직전에는 이 캐시를 믿지 않고 반드시 다시 조회한다.
   */
  availableQuestionCount: number | null;

  /** 참가자별 경험률 (Q-12). 참가자 변동 시점에만 갱신한다 */
  experienceRates: ExperienceRate[] | null;

  /** 직전 게임 설정. "다시 하기"에서 복원한다 (Q-31) */
  lastGameSettings: RoomSettings | null;

  /**
   * 채팅 버퍼. 최근 CHAT_BUFFER_SIZE 개.
   * ★ 마스킹은 브로드캐스트 시점에 확정하고 여기에 원문과 치환본을 함께 저장한다.
   *   스냅샷에서 재계산하면 문제가 바뀔 때 과거 메시지의 마스킹이 흔들린다 (R003 3-4).
   */
  chat: ChatEntry[];

  /**
   * 방장 이전 유예 만료 시각. null이면 유예 중이 아니다 (Q-29, 30초).
   * ★ 활성 0명 동안에는 이 타이머를 정지한다. 이전할 대상이 없기 때문이다.
   */
  hostGraceUntil: number | null;

  /**
   * 활성 인원이 0명이 된 시각. 방 삭제 타이머(10분)의 기준이다 (Q-14).
   * ★ PAUSED 중에는 이 타이머를 정지한다. 그러지 않으면 10분 뒤 방이 사라져
   *   일시정지가 무의미해진다. (Phase 5에서 PAUSED 도입 시 적용)
   */
  emptySince: number | null;

  /** 진행 중인 게임. LOBBY 에서는 null 이다 */
  game: ActiveGame | null;

  // ── Phase 3~5에서 채운다. 지금은 항상 null 이다.
  currentQuestion: null;
  paused: null;
}

/** 참가자 한 명의 경험률 (guide 6절 표기: "1,234문제 중 153문제 (12.4%)") */
export interface ExperienceRate {
  accountId: string;
  experienced: number;
  /** 분모. 전체 활성 문제 수 */
  total: number;
}

export interface ChatEntry {
  id: string;
  seq: number;
  accountId: string;
  nickname: string;
  colorIndex: number;
  /** NFC 정규화된 원문. 발신자 본인에게 보낼 값 */
  rawNfc: string;
  /** 마스킹된 텍스트. 마스킹이 없었으면 null (Phase 6에서 사용) */
  maskedText: string | null;
  ts: number;
  /** 시스템 메시지(입퇴장, 게임 시작 구분선 등)면 true */
  system: boolean;
}
