// =============================================================================
// Socket 프로토콜 타입
//
// 명세 원본: R003 3장 + R004 0장(PAUSED 도입)
// 현재 유효 명세: docs/04-PROTOCOL.md
//
// ★ Phase 0에서는 이 중 time.ping / time.pong / heartbeat 만 실제로 구현되어 있다.
//   나머지는 타입만 먼저 확정해 두어, Phase 1 이후 구현이 명세에서 벗어나지 않게 한다.
//   구현 상태는 docs/05-STATUS.md 를 본다.
// =============================================================================

/** 게임 상태. guide 9절의 5종 + PAUSED (Q-30 개정, R004 0장) */
export type RoomState =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'QUESTION_ACTIVE'
  | 'QUESTION_RESOLVED'
  | 'PAUSED'
  | 'GAME_RESULT';

/**
 * 게임 종료 사유.
 * guide 9절의 FORCE_ENDED는 별도 상태가 아니라 이 값으로 남는다 (Q-31 확정).
 */
export type GameEndReason =
  | 'completed' // 설정한 문제 수를 모두 진행 (guide 38절)
  | 'force_ended' // 방장 강제 종료 (guide 25절)
  | 'no_questions' // 출제 가능 문제 소진으로 조기 종료 (Q-22)
  | 'abandoned' // PAUSED 30분 초과 (Q-30 개정)
  | 'server_restart'; // 서버 프로세스 재시작으로 이어하기 불가 (R004 D-3)

/** 문제가 끝난 사유. aborted는 정답을 공개하지 않고 중단된 경우다. */
export type QuestionResolution = 'correct' | 'timeout' | 'skip_vote' | 'host_skip' | 'aborted';

/** 정답 문자열과 일치했으나 정답자가 되지 못한 이유. answer_events에 기록한다. */
export type AnswerRejectReason =
  | 'already_resolved'
  | 'experienced'
  | 'epoch_mismatch'
  | 'past_deadline'
  | 'not_connected';

// -----------------------------------------------------------------------------
// 게임 규칙 상수
// ★ 이 값들은 guide 또는 확정된 Q 항목에서 온 것이다. 임의로 바꾸지 않는다.
//   바꿀 때는 docs/07-DECISIONS.md에 근거를 남긴다.
// -----------------------------------------------------------------------------

export const RULES = {
  /** 방 최대 인원. guide 4절 */
  MAX_PLAYERS: 10,
  /** 문제 제한시간. guide 10절 "정확히 30초" */
  QUESTION_DURATION_MS: 30_000,
  /** 힌트 노출 시작 시점(남은 시간). guide 11절 */
  HINT_REVEAL_AT_MS: 10_000,
  /** 정답 공개 후 대기. guide 19절. ★ 마지막 문제는 이 대기를 생략한다 (Q-17) */
  RESOLVED_WAIT_MS: 5_000,
  /** 문제 수 입력 범위. Q-10 */
  QUESTION_COUNT_MIN: 1,
  QUESTION_COUNT_MAX: 200,
  /** 카운트다운 초 범위. Q-11 */
  COUNTDOWN_SEC_MIN: 3,
  COUNTDOWN_SEC_MAX: 60,
  /** 채팅 최대 길이. Q-18 */
  CHAT_MAX_LENGTH: 100,
  /** 채팅 rate limit. Q-18: 3초 이동 윈도 10개 */
  CHAT_RATE_WINDOW_MS: 3_000,
  CHAT_RATE_MAX: 10,
  /** 서버가 방마다 유지하는 채팅 개수 / 스냅샷으로 보내는 개수. Q-19 */
  CHAT_BUFFER_SIZE: 500,
  CHAT_SNAPSHOT_SIZE: 200,
  /** 접속 종료 표시 유예. R004 0장(Q-15 보완). 새로고침 깜빡임을 막는다 */
  DISCONNECT_DISPLAY_GRACE_MS: 5_000,
  /** 방장 권한 이전 유예. Q-29 */
  HOST_TRANSFER_GRACE_MS: 30_000,
  /** ★ PAUSED 포기 시각. R004 0장(Q-30 개정) */
  PAUSE_ABANDON_MS: 30 * 60_000,
  /** 활성 0명인 방을 삭제하기까지의 시간. Q-14. ★ PAUSED 중에는 이 타이머가 정지한다 */
  ROOM_IDLE_DELETE_MS: 10 * 60_000,
  /** 서버 tick 주기. R003 2-4 */
  TICK_INTERVAL_MS: 100,
  /** 세션 유지 기간. Q-07 */
  SESSION_TTL_MS: 30 * 24 * 60 * 60_000,
  /** 비밀번호 길이. Q-04 개정(8자 → 4자, R004 0장). 상한은 해시 알고리즘 제약 */
  PASSWORD_MIN_LENGTH: 4,
  PASSWORD_MAX_BYTES: 72,
  /** 클라이언트 heartbeat 주기. R004 0장에서 목적이 재검토되었다 */
  HEARTBEAT_INTERVAL_MS: 30_000,
  /** 시계 오프셋 재측정 주기. R003 2-4 */
  TIME_SYNC_INTERVAL_MS: 30_000,
  /** 오프셋 채택에 사용하는 최근 측정 개수. R003 2-4 */
  TIME_SYNC_SAMPLE_SIZE: 5,
} as const;

// -----------------------------------------------------------------------------
// Phase 0에서 실제로 구현된 이벤트
// -----------------------------------------------------------------------------

export interface TimePingPayload {
  /** 클라이언트가 보낸 시각 (클라이언트 기준 epoch ms) */
  t0: number;
}

export interface TimePongPayload {
  /** 요청에 담겨 온 t0을 그대로 되돌려준다 */
  t0: number;
  /** 서버 시각 (서버 기준 epoch ms) */
  tServer: number;
}

export interface ServerHelloPayload {
  serverTime: number;
  /** 서버 프로세스 기동 시각. 클라이언트가 재시작을 감지할 수 있다 */
  bootedAt: number;
  /** Phase 0 여부 등 진단용 */
  phase: string;
}

/** 클라이언트 → 서버 */
export interface ClientToServerEvents {
  'time.ping': (payload: TimePingPayload) => void;
  heartbeat: () => void;
}

/** 서버 → 클라이언트 */
export interface ServerToClientEvents {
  'server.hello': (payload: ServerHelloPayload) => void;
  'time.pong': (payload: TimePongPayload) => void;
}
