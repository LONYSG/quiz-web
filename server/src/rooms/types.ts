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

import type { QuestionResolution, RoomState } from '@quiz/shared';
import type { PoolQuestion } from '../db/questionPool.js';
import type { SelectionStage } from '../game/select.js';

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
  /** 1-based. 0 이면 아직 첫 문제 전이다 */
  questionIndex: number;
  /**
   * 문제 세대 번호 (R003 2-3 장치 B).
   *
   * ★★ 이것이 이 게임에서 가장 중요한 안전 장치다.
   *   QUESTION_RESOLVED 구간(5초)에 친 메시지가 네트워크 지연으로 다음 문제 시작
   *   직후 도착하면, 상태 검사는 통과한다(이미 QUESTION_ACTIVE 다).
   *   ★ 그 메시지가 우연히 새 문제의 정답과 같으면 정답 처리된다.
   *   ★ guide 20절이 명시적으로 금지한 상황이다.
   *   → 클라이언트가 보고 있던 epoch 를 함께 보내고, 다르면 판정하지 않는다.
   *
   * ★ 증가 시점은 **새 문제를 시작할 때뿐**이다.
   *   ★ 재개(PAUSED → 원래 상태)에서는 증가시키지 않는다. 같은 문제를 이어서 한다.
   */
  epoch: number;

  // ── ★ Phase 3에서 추가한 것들
  /**
   * ★ 출제 대상 전체. 게임 시작 때 한 번 읽어 둔다 (D-054 성능 항목).
   *   ★ 매 문제마다 DB 를 다시 읽으면 문제 시작 절차가 느려지고,
   *     그 절차는 30초 타이머 시작 전에 끝나야 한다.
   */
  pool: PoolQuestion[];
  /** ★ 계정 → 경험한 문제 id. 선정과 경험자 배지에 쓴다 */
  experienced: Map<string, Set<string>>;
  /** 이 게임에서 이미 출제한 문제 id. ★ guide 20절 */
  usedQuestionIds: Set<string>;
  /**
   * ★★ 이 게임에서 이미 쓴 정규화 정답 (Q-76 / D-054).
   *   ★ 대표 정답이 아니라 **복수 정답 배열 전체**를 넣는다.
   *     근거: 판정이 answer_norm 전체로 이루어지므로 중복 기준도 같아야 한다.
   */
  usedAnswerNorms: Set<string>;
  /** 정답 공개 뒤 5초 대기 구간의 정보. QUESTION_RESOLVED 에서만 값이 있다 */
  resolution: Resolution | null;
  /**
   * ★ 실제로 끝난 문제 수. games.ended_question_count 에 기록한다.
   *   ★ questionIndex 와 다를 수 있다 — 진행 중인 문제는 아직 끝나지 않았다.
   */
  endedQuestionCount: number;
  /** ★ 3단계 선정이 발동한 횟수. 운영자용 관측값이다 (D-054) */
  stage3Count: number;
}

/**
 * 진행 중인 문제 (Phase 3).
 *
 * ★★ 판정에 필요한 모든 것이 여기 메모리에 있다. 그것이 설계의 핵심이다.
 *   ★ 정답 판정 블록에 await 가 필요 없어지려면 정답 집합·경험자·힌트가
 *     문제 시작 시점에 이미 로드되어 있어야 한다 (04-PROTOCOL 1장).
 */
export interface CurrentQuestion {
  /** 이 문제의 세대 번호. game.epoch 와 같다 */
  epoch: number;
  /** 1-based */
  index: number;
  questionId: string;
  text: string;
  /** ★ 화면에 보여줄 카테고리. **대분류**다 (소분류 이름은 힌트가 된다) */
  categoryName: string;

  /** ★★ 판정에 쓰는 정규화 정답 집합. 이것만으로 판정한다 */
  answersNorm: Set<string>;
  /** 정답 공개 화면용 대표 표기. ★ 판정에 쓰지 않는다 */
  displayAnswer: string;
  /** 마스킹용 원문 표기 (Phase 6) */
  answersRaw: string[];

  /**
   * 미리 계산한 힌트. null 이면 힌트를 만들 수 없는 정답이다.
   * ★ 문제와 함께 보내지 않는다. 남은 10초에 서버가 push 한다.
   *   ★ 미리 보내면 개발자 도구로 30초 시점에 볼 수 있다.
   */
  hint: string | null;
  /** 힌트를 이미 보냈는가. ★ 중복 push 를 막는다 */
  hintPushed: boolean;
  explanation: string | null;

  /** ★ 이 문제를 이미 경험한 참가자. 판정 제외 + 배지 + 마스킹 대상 */
  experiencedAccountIds: Set<string>;

  startedAt: number;
  /** ★★ 정답 인정 경계다. tick 오차가 아니라 이 시각이 기준이다 */
  endsAt: number;

  /**
   * ★★ 장치 A — 이미 끝난 문제인가.
   *   ★ 상태 전환 함수의 첫 줄에서 동기적으로 확인·설정한다.
   *     그 두 줄 사이에 await 가 없으므로 두 번째 요청이 끼어들 수 없다.
   */
  resolved: boolean;

  /** 스킵에 찬성한 계정. ★ 누가 투표했는지는 클라이언트에 보내지 않는다 */
  skipVotes: Set<string>;

  /** ★ 선정이 몇 단계에서 성공했는가 (Q-76). 화면에는 표시하지 않는다 */
  selectionStage: SelectionStage;
}

/** 정답 공개 뒤 5초 대기 구간 */
export interface Resolution {
  epoch: number;
  reason: QuestionResolution;
  winnerAccountId: string | null;
  displayAnswer: string;
  explanation: string | null;
  /** 다음 문제 시작 시각. ★ 마지막 문제면 null 이고 그 즉시 결과로 간다 */
  nextAt: number | null;
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

  /** 진행 중인 문제. ★ QUESTION_ACTIVE / QUESTION_RESOLVED 에서 값이 있다 */
  currentQuestion: CurrentQuestion | null;

  /**
   * ★ 게임 결과. GAME_RESULT 에서만 값이 있다.
   *   ★ Phase 4 가 결과 화면을 만든다. Phase 3 는 데이터만 만들어 둔다 (TEMP-P4-01).
   */
  result: GameResultData | null;

  /**
   * ★ 활성 0명이 되어 문제 타이머를 멈춘 시각. null 이면 멈추지 않았다.
   *
   * ★★ Phase 5 의 PAUSED 를 대신하는 최소 장치다 (R014 실측으로 추가).
   *   ★ 근거와 최종 규칙과의 차이는 game/question.ts 의 freezeIfNoActive 주석에 있다.
   *   ★ Phase 5 에서 PAUSED 를 구현할 때 이 필드를 pausedAt/remainingMs 로 교체한다.
   */
  frozenAt: number | null;

  // ── Phase 5에서 채운다. 지금은 항상 null 이다.
  paused: null;

  /** 계정별 채팅 rate limit 타임스탬프 (Q-18: 3초 이동 윈도 10개) */
  chatTimestamps: Map<string, number[]>;
}

/** 게임 결과 (guide 38·39절). ★ Phase 4 가 화면을 만든다 */
export interface GameResultData {
  gameId: string | null;
  endReason: import('@quiz/shared').GameEndReason;
  ranking: {
    rank: number;
    accountId: string;
    nickname: string;
    colorIndex: number;
    score: number;
    connected: boolean;
  }[];
  /** ★ 마지막 문제의 정답. 5초 대기를 생략했으므로 여기서 보여준다 (Q-17) */
  lastQuestionReveal: {
    index: number;
    text: string;
    displayAnswer: string;
    explanation: string | null;
    winnerAccountId: string | null;
  } | null;
  /** 조기 종료·강제 종료 사유 안내 */
  abortedNote: string | null;
  endedQuestionCount: number;
  totalQuestions: number;
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
