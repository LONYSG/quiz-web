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
  /**
   * 문제 제한시간. guide 10절 "정확히 30초" → ★★ R034 건우 확정으로 **40초** (D-151).
   *   "문제 시간을 30초에서 40초로 늘린다."
   */
  QUESTION_DURATION_MS: 40_000,
  /**
   * 초성 힌트 노출 시점(남은 시간). guide 11절 10초 → ★★ R034 건우 확정 **남은 15초** (D-151).
   */
  HINT_REVEAL_AT_MS: 15_000,
  /**
   * ★★ 일반 힌트 공개 시점. R028 남은 20초 → ★★ R034 건우 확정 **남은 30초** (D-151).
   *   ★ 일반 힌트는 30초에 혼자 나오고, 15초부터 초성 힌트와 함께 보인다.
   *   ★ 힌트가 없는 문제는 30초에 아무것도 나오지 않는다.
   */
  GENERAL_HINT_REVEAL_AT_MS: 30_000,
  /**
   * 정답 공개 후 대기. guide 19절 5초 → ★★ R035 건우 확정 **8초** (D-161).
   *   "처음엔 정답·해설만 보여 주고, 3초 후에 '5초 후 다음 문제로 넘어간다' 는 문구를 표기하면서 넘어가자."
   * ★★ R034 (Q-17 개정) — **마지막 문제도** 이 대기 뒤에 결과로 간다 (D-152).
   */
  RESOLVED_WAIT_MS: 8_000,
  /**
   * ★ R035 — 정답 공개 화면에 "N초 후 다음 문제" 안내를 띄우는 시점(남은 시간). 8초 중 앞 3초는 정답·해설만.
   *   ★ 화면 표시용이다. 서버 상태 전이와 무관하다.
   */
  RESOLVED_NOTICE_AT_MS: 5_000,
  /**
   * ★★ R038 — 화면의 남은 시간 색. 막대·숫자가 **이 값들만** 본다 (시간을 또 바꿔도 화면이 따라온다).
   *   막대 색은 TIMER_FADE_MS 부터 서서히 주황으로, TIMER_WARN_MS 부터 서서히 빨강으로 (뚝 바뀌지 않게).
   */
  TIMER_FADE_MS: 15_000,
  TIMER_WARN_MS: 10_000,
  TIMER_URGENT_MS: 5_000,
  /** 문제 수 입력 범위. Q-10 */
  QUESTION_COUNT_MIN: 1,
  QUESTION_COUNT_MAX: 200,
  /**
   * ★★ 게임 시작 카운트다운 (R033 / Q-11 개정 / 건우 확정).
   *   "시작 방식은 무조건 '5초 후 시작' 만 하도록 해라. 카운트다운 선택은 필요 없다. 선택하는 칸도 필요 없다."
   *   ★ 즉시 시작은 없다. 방장 취소 · 카운트다운 중 입장 · 만료 재검증(D-025)은 그대로다.
   */
  START_COUNTDOWN_SEC: 5,
  /**
   * 채팅 최대 길이. Q-18 100자 → ★★ R038 건우 확정 **300자** (D-176).
   *   "친구들끼리 하는 거라 도배하는 것도 재미다. 세레머니 타임에도 재밌는 요소가 될 것이다."
   */
  CHAT_MAX_LENGTH: 300,
  /**
   * ★★ 뒷북 (R038 · 건우 확정) — 정답자가 나온 뒤 이 시간 안에 정답을 보낸 사람을 "뒷북" 명단에 올린다 (D-174).
   *   기준은 **서버 도착 시각**(고해상도 시계)이다. 각자의 네트워크 지연이 섞인다.
   */
  LATE_ANSWER_WINDOW_MS: 3_000,
  /**
   * ★★ 이모티콘 도배 제한 (R039 · 건우: "도배가 재미 요소다") — 채팅(Q-84 1초 20개)과 **같은 서버 보호 수준**을
   *   따로 센다(채팅을 치면서 이모티콘도 보낼 수 있게). 넘치면 본인에게만 조용히 버린다.
   */
  EMOJI_RATE_WINDOW_MS: 1_000,
  EMOJI_RATE_MAX: 20,
  /**
   * ★★ 채팅 rate limit. Q-84 확정으로 **크게 완화했다** (R015).
   *
   * ★ 건우 확정: "도배 제한 넉넉하게 해도 된다. ★ 도배하는 것도 나름 재밌는 포인트다.
   *   ★ 시스템에 부하 갈 정도로 도배하는 것만 막자."
   *
   * ★★ 기준이 **"예절" 에서 "서버 보호" 로** 바뀌었다.
   *   옛 값: 3초에 10개 (초당 3.3개)  ← 사람의 정상 연타도 걸릴 수 있었다
   *   새 값: ★ **1초에 20개** (초당 20개)
   *
   * ★ 20 을 고른 근거
   *   · ★ 사람이 Enter 연타로 낼 수 있는 상한은 초당 8~10개다 (한 글자 + Enter 반복).
   *     ★ 실제로는 입력창이 비워지므로 재입력이 필요해 초당 2~5개가 현실적이다.
   *     ★★ 20 은 그 상한의 2배 이상이다. **사람은 절대 걸리지 않는다**
   *   · ★ 10명 방에서 초당 20개면 브로드캐스트가 초당 200회다. Socket.IO 가 감당한다.
   *     ★ 초당 100개(=1000 브로드캐스트)부터 부담이 시작된다(추정. 근거: 이벤트 루프가
   *       판정 동기 블록을 그만큼 자주 돌려야 한다)
   *   · ★★ 그래서 "사람의 상한" 과 "서버의 부담 시작점" 사이에 둔다
   *
   * ★ 윈도를 3초 → 1초로 줄인 근거
   *   ★ 버스트 뒤 회복이 빠르다. 억제 안내가 오래 떠 있으면 그것이 방해가 된다.
   *
   * ★ 이 값은 **서버 설정으로 덮을 수 있다** (server/src/config.ts).
   *   ★ 실제로 겪어 보고 조정할 값이므로 코드를 고치지 않고 바꿀 수 있어야 한다.
   */
  CHAT_RATE_WINDOW_MS: 1_000,
  CHAT_RATE_MAX: 20,
  /** 서버가 방마다 유지하는 채팅 개수 / 스냅샷으로 보내는 개수. Q-19 */
  CHAT_BUFFER_SIZE: 500,
  CHAT_SNAPSHOT_SIZE: 200,
  /** 접속 종료 표시 유예. R004 0장(Q-15 보완). 새로고침 깜빡임을 막는다 */
  DISCONNECT_DISPLAY_GRACE_MS: 5_000,
  /** 방장 권한 이전 유예. Q-29 */
  HOST_TRANSFER_GRACE_MS: 30_000,
  /**
   * ★★ PAUSED 포기 시각. **Q-82 확정으로 30분 → 5분으로 단축했다** (R015).
   *
   * ★ 건우 확정: "★ 5분 동안 아무도 안 돌아오면 방 폭파."
   * ★ 근거: 건우 PC 네트워크가 1~2분 끊기는 것은 5분으로 충분히 커버된다.
   *   ★ 다만 터널이 죽어 새 URL 을 뿌리는 경우는 빠듯할 수 있다.
   *     ★★ 그래서 **서버 설정으로 덮을 수 있게** 했다 (server/src/config.ts).
   *     ★ 실제로 겪어 보고 조정할 값이다.
   */
  PAUSE_ABANDON_MS: 5 * 60_000,
  /**
   * 활성 0명인 방을 삭제하기까지의 시간. Q-14.
   *
   * ★★ R015 에서 적용 범위가 좁아졌다 — **LOBBY / GAME_RESULT 에서만 쓴다.**
   *   ★ 게임 중(COUNTDOWN / QUESTION_ACTIVE / QUESTION_RESOLVED)에 활성이 0이 되면
   *     즉시 PAUSED 로 가고, 그때부터는 PAUSE_ABANDON_MS(5분)가 이긴다.
   *   ★★ 두 타이머가 같은 상황에 동시에 걸리지 않게 한 것이다. 근거는 D-066 에 있다.
   */
  ROOM_IDLE_DELETE_MS: 10 * 60_000,
  /** 서버 tick 주기. R003 2-4 */
  TICK_INTERVAL_MS: 100,
  /** 세션 유지 기간. Q-07 (30일 슬라이딩) */
  SESSION_TTL_MS: 30 * 24 * 60 * 60_000,
  /**
   * 세션 슬라이딩 갱신 임계. 남은 기간이 이 값 미만일 때만 UPDATE 한다 (R003 4-1).
   * 매 요청마다 갱신하면 DB 쓰기가 폭증하고 DB를 계속 깨워 둔다.
   */
  SESSION_SLIDING_THRESHOLD_MS: 15 * 24 * 60 * 60_000,
  /** 비밀번호 길이. Q-04 개정(8자 → 4자, R004 0장). 상한은 해시 알고리즘 제약 */
  PASSWORD_MIN_LENGTH: 4,
  PASSWORD_MAX_BYTES: 72,
  /** 아이디 길이. 자체 판단 (R005 4-1) */
  LOGIN_ID_MIN_LENGTH: 3,
  LOGIN_ID_MAX_LENGTH: 20,
  /** 닉네임 길이. 자체 판단 (R005 4-1) */
  NICKNAME_MIN_LENGTH: 1,
  NICKNAME_MAX_LENGTH: 12,
  /** 방 제목 길이. R001 8-11 자체 판단(승인됨) */
  ROOM_TITLE_MIN_LENGTH: 1,
  ROOM_TITLE_MAX_LENGTH: 30,
  /**
   * 클라이언트 heartbeat 주기. Q-02 확정값은 4분이다.
   * ★ 원래 목적(무료 호스팅의 15분 슬립 방지)은 로컬 PC 서버로 바뀌며 사라졌으나,
   *   클라우드 전환 시 다시 필요해지므로 확정값을 그대로 유지한다.
   *   연결 생존 감지는 Socket.IO ping(15s/10s, Q-51)이 담당한다.
   */
  HEARTBEAT_INTERVAL_MS: 4 * 60_000,
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
