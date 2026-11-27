// =============================================================================
// 환경 변수
//
// ★ 플랫폼 중립 규칙 (docs/02-ARCHITECTURE.md 3장)
//   접속 정보는 전부 환경 변수로만 받는다. 코드에 호스트명이나 플랫폼 이름을 넣지 않는다.
//   그래서 나중에 클라우드로 옮길 때 애플리케이션 코드를 고칠 필요가 없다.
//
// ★ 비밀값 취급 (docs/02-ARCHITECTURE.md "비밀값 관리")
//   비밀값을 로그·에러 메시지·응답에 출력하지 않는다.
//   아래 어디에도 값을 찍는 코드가 없다. 없을 때만 "없다"고 알린다.
// =============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEAR_MISS_SKIP_LOGIN, NO_TRIM, RULES, TRIM } from '@quiz/shared';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

// ★ R110 — .env 를 읽기 전에 이미 있던 변수(검사 도구가 직접 넣은 값)를 기억한다
const PRESET_ENV = new Set(Object.keys(process.env));
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  // .env 가 없어도 동작한다. 환경 변수를 직접 주입하는 경우가 있다.
}
// ★★ R110 — 검사 서버(봇 · ui-check · smoke · 부하)는 .env 의 실 주소 · 자리 설정을 물려받지 않는다.
//   2026-11-20 밤 개발 트리 .env 에 PUBLIC_HOSTNAME 이 들어가자 검사 서버도 자리를 갈라(localhost = 베타 · 가입 막힘) 봇이 줄줄이 깨졌다.
//   검사가 자리를 시험할 때는 env 로 직접 넣는다(봇 site · siteclosed — SCENARIO_ENV) → 그 값은 그대로 쓴다.
if (process.env.QUIZ_TEST_SERVER === '1') {
  // ★ R121 — GONGBANG · SOLO · BELT 도(개발 트리 .env 에 켜 두면 "끈 서버" 검사 gongbangoff · solooff · 옛 로비 ui-check 가 깨진다 · 켤 검사는 SCENARIO_ENV 로 직접 준다)
  for (const k of ['PUBLIC_HOSTNAME', 'FRIEND_HOSTNAME', 'SITE_FORCE', 'PUBLIC_OPEN', 'SITE_ONE', 'YOUTUBE_URL', 'GONGBANG', 'SOLO', 'BELT']) {
    if (!PRESET_ENV.has(k)) delete process.env[k];
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // ★ 값이 아니라 이름만 알린다.
    throw new Error(
      `${name} 환경 변수가 없습니다. .env.example 을 .env 로 복사한 뒤 값을 채우세요.`,
    );
  }
  return value;
}

/**
 * ★ 양의 정수 환경 변수. 없거나 이상하면 기본값을 쓴다.
 *
 * ★★ 조용히 0 이나 NaN 이 되게 두지 않는다.
 *   ★ 근거: rate limit 이 0 이 되면 아무도 채팅을 못 하고,
 *     pauseAbandonMs 가 0 이 되면 일시정지가 즉시 방을 폭파한다.
 *   ★ 설정 실수가 게임을 망가뜨리면 안 된다. 알리고 기본값으로 간다.
 */
function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`[config] ★ ${name} 값이 올바르지 않다. 기본값 ${fallback} 을 쓴다.`);
    return fallback;
  }
  return Math.floor(n);
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /**
   * ★★ R107 (D-364) — 듣는 주소. 기본 127.0.0.1 = 이 PC 안에서만(터널 cloudflared 도 루프백으로 들어온다).
   *   같은 공유기의 다른 기기에서 직접 붙는 길을 막는다. 꼭 열어야 하면 HOST=0.0.0.0.
   */
  host: process.env.HOST || '127.0.0.1',
  /**
   * ★ R107 — 고정 주소(Cloudflare 이름 붙인 터널)의 호스트 이름(예: quizdojang.com). 없으면 임시 주소(trycloudflare)를 쓴다.
   *   서버는 소켓 Origin 허용 목록에만 쓴다(터널 실행기 scripts/dev-tunnel.mjs 가 TUNNEL_NAME 과 함께 읽는다).
   */
  publicHostname: (process.env.PUBLIC_HOSTNAME ?? '').trim().toLowerCase() || null,
  /**
   * ★★★ R109 (D-369) — 베타(지인) 자리의 호스트 이름(찬종 2026-11-19 = beta.quizdojang.com). 이 주소로 들어온 요청 = 지인 자리.
   *   ★ PUBLIC_HOSTNAME 이 없으면(임시 주소 · localhost — 오늘까지의 쓰임) 자리를 가르지 않는다 = 전부 지인 자리 · 계정 검사도 없다(오늘과 같다).
   */
  friendHostname: (process.env.FRIEND_HOSTNAME ?? '').trim().toLowerCase() || null,
  /** ★ R109 — 검사용: 모든 요청을 한 자리로(dev 3001 에서 양쪽 시험) · 'public' | 'friend' · 그 밖의 값은 없는 것으로 */
  siteForce: ((v) => (v === 'public' || v === 'friend' ? v : null))((process.env.SITE_FORCE ?? '').trim().toLowerCase()) as 'public' | 'friend' | null,
  /**
   * ★★ R111 (D-371) — 공개 자리를 여는가(찬종 2026-11-21 "퀴즈 사이트는 좀 더 정비하고 올리는 걸로"). '1' = 열림 · 없거나 그 밖 = 닫힘.
   *   ★ 자리를 가를 때(siteSplit)만 본다 — PUBLIC_HOSTNAME 이 없으면 이 값은 아무 일도 하지 않는다. 닫힌 동안 공개 주소 = "준비 중" 한 장.
   */
  publicOpen: (process.env.PUBLIC_OPEN ?? '').trim() === '1',
  /**
   * ★★★ R119 — 한 주소 운영(찬종 2026-11-25 "beta 는 도메인만 남기고 main 에다가 다 운영 · 듀얼 운영은 철수"). '1' = 켬 · 없거나 그 밖 = 오늘과 같다.
   *   켜면 어느 Host 든 지금 베타와 같은 내용(숨김 없음) · 누구나 가입 · 로그인 · 준비 중 없음 · beta 화면 요청은 https://PUBLIC_HOSTNAME 로 301.
   *   두 자리 코드(R109 · R111)는 지우지 않는다 — 스위치를 끄면 다시 두 자리.
   */
  siteOne: (process.env.SITE_ONE ?? '').trim() === '1',
  /**
   * ★★★ R116 (D-373 · docs/24 3-9) — 공방 스위치. '1' = 켬(방 종류 · 정원 · 잠금 · 목록 · 빠른 입장 · 모드 바꾸기 알림 · 미니게임 기본 퀴즈형 ·
   *   문제 고르기 2단계 "가장 많은 사람이 안 본 묶음부터" · 방 제목 · 닉네임 금칙어). 없거나 그 밖 = 오늘과 같다(목록 이벤트는 거절).
   */
  gongbang: (process.env.GONGBANG ?? '').trim() === '1',
  /**
   * ★★★ R118 (docs/24 4절 · 5절) — 혼자 하기(솔로) · 띠 스위치. '1' = 켬. 없거나 그 밖 = 오늘과 같다(solo.* 이벤트 거절 · /api/solo 404 · 띠 칸 없음).
   *   BELT 는 SOLO 와 같이 켤 때만 뜻이 있다(띠 = 솔로 최고 기록) — SOLO 없이 BELT 만 켜면 띠 칸만 보인다(전부 띠 없음 · 오를 일이 없다).
   */
  solo: (process.env.SOLO ?? '').trim() === '1',
  /** ★★ R123 — 콘텐츠 줄이기(shared TRIM) · 검사 서버만 TRIM_OFF=1 로 끈다(미니게임만 방식으로 미니게임을 시험하는 검사) */
  trim: process.env.QUIZ_TEST_SERVER === '1' && (process.env.TRIM_OFF ?? '').trim() === '1' ? NO_TRIM : TRIM,
  belt: (process.env.BELT ?? '').trim() === '1',
  /**
   * ★ R118 — 솔로 시간 식(docs/24 4-4 · 베타에서 "시간 끝으로 틀린 비율"을 보고 맞춘다) · 검사용 값.
   *   SOLO_TIME_* = 식의 숫자(shared SOLO_TIME 덮어쓰기) · ★ 검사용(실 서버에 두지 않는다): SOLO_TEST_TIME_MS = 모든 문제 시간 고정 ·
   *   SOLO_TEST_RAMP_SHIFT = 등급을 셀 때 맞힌 개수에 더하는 수(등급 5 를 빨리 본다) · SOLO_TEST_NEXT_MS = 다음 문제까지(맞힘 · 틀림 둘 다) ·
   *   SOLO_TEST_RECONNECT_MS = 끊긴 뒤 끝까지
   */
  soloTime: {
    baseMs: positiveInt('SOLO_TIME_BASE_MS', 8_000),
    textFree: positiveInt('SOLO_TIME_TEXT_FREE', 30),
    perTenTextMs: positiveInt('SOLO_TIME_PER_TEN_TEXT_MS', 500),
    answerFree: positiveInt('SOLO_TIME_ANSWER_FREE', 5),
    perAnswerCharMs: positiveInt('SOLO_TIME_PER_ANSWER_CHAR_MS', 400),
    minMs: positiveInt('SOLO_TIME_MIN_MS', 8_000),
    maxMs: positiveInt('SOLO_TIME_MAX_MS', 13_000),
  },
  soloTest: {
    timeMs: Number(process.env.SOLO_TEST_TIME_MS ?? 0) > 0 ? Math.floor(Number(process.env.SOLO_TEST_TIME_MS)) : 0,
    rampShift: Number(process.env.SOLO_TEST_RAMP_SHIFT ?? 0) > 0 ? Math.floor(Number(process.env.SOLO_TEST_RAMP_SHIFT)) : 0,
    nextMs: Number(process.env.SOLO_TEST_NEXT_MS ?? 0) > 0 ? Math.floor(Number(process.env.SOLO_TEST_NEXT_MS)) : 0,
    reconnectMs: Number(process.env.SOLO_TEST_RECONNECT_MS ?? 0) > 0 ? Math.floor(Number(process.env.SOLO_TEST_RECONNECT_MS)) : 0,
  },
  /**
   * ★★ R116 (docs/24 6-2 나 · 찬종 ⑥ 30일) — 본 문제 유효 기간(일). 0 · 없음 = 지금처럼 영원히. 켜면 마지막으로 본 지 N일 지난 문제는 "안 본 것".
   */
  experienceDays: ((v) => (Number.isInteger(v) && v > 0 && v <= 3650 ? v : 0))(Number((process.env.EXPERIENCE_DAYS ?? '').trim() || 0)),
  /** ★ R111 — 준비 중 한 장 맨 아래 유튜브 채널 링크(없으면 그 줄을 안 그린다 · https:// 로 시작할 때만) */
  youtubeUrl: ((v) => (/^https:\/\/[^\s"'<>]+$/.test(v) ? v : null))((process.env.YOUTUBE_URL ?? '').trim()),
  /**
   * ★★ R107 (D-365) — 공개 대비 한도. 전부 메모리에서 센다(DB 를 주기적으로 건드리지 않는다 — docs/02 3장).
   *   ★ IP 기준 한도는 넉넉하게(한 집 · 회사 · PC방이 같은 IP) · 계정 기준을 먼저. 값의 정본 = docs/21-SECURITY.md
   *   ★ "이 PC 자신"(루프백 + CF-Connecting-IP 없음 — 봇 · ui-check · 찬종이 localhost 로)은 IP 기준 한도 · 방 만들기 한도에서 뺀다.
   *     터널로 들어온 요청은 cloudflared 가 늘 CF-Connecting-IP 를 붙이므로 여기에 걸리지 않는다. 검사에서 끄려면 SEC_LOCAL_EXEMPT=0.
   */
  security: {
    localExempt: process.env.SEC_LOCAL_EXEMPT !== '0',
    /** 로그인 실패 — 아이디마다 n회 / 창 → 잠금 */
    loginFailPerId: positiveInt('SEC_LOGIN_FAIL_PER_ID', 5),
    loginFailWindowMs: positiveInt('SEC_LOGIN_FAIL_WINDOW_MS', 10 * 60_000),
    loginLockMs: positiveInt('SEC_LOGIN_LOCK_MS', 15 * 60_000),
    /** 로그인 실패 — IP 마다 n회 / 같은 창 */
    loginFailPerIp: positiveInt('SEC_LOGIN_FAIL_PER_IP', 30),
    /** 가입 — IP 마다 시간 · 하루 */
    signupPerIpHour: positiveInt('SEC_SIGNUP_PER_IP_HOUR', 5),
    signupPerIpDay: positiveInt('SEC_SIGNUP_PER_IP_DAY', 20),
    /** 비밀번호 계산(argon2) 동시 실행 · 대기 줄 */
    hashConcurrency: positiveInt('SEC_HASH_CONCURRENCY', 2),
    hashQueue: positiveInt('SEC_HASH_QUEUE', 20),
    /** 소켓 동시 연결 — IP · 계정 */
    socketPerIp: positiveInt('SEC_SOCKET_PER_IP', 40),
    socketPerAccount: positiveInt('SEC_SOCKET_PER_ACCOUNT', 8),
    /** 로그인 안 된 소켓은 이 시간 안에 끊는다 */
    anonSocketMs: positiveInt('SEC_ANON_SOCKET_MS', 10_000),
    /** 소켓당 이벤트 — 초당 n개(꾸준히) · 한꺼번에 최대 burst 개. 넘으면 그 소켓만 끊는다 */
    socketEventsPerSec: positiveInt('SEC_SOCKET_EVENTS_PER_SEC', 30),
    socketEventBurst: positiveInt('SEC_SOCKET_EVENT_BURST', 90),
    /** 소켓 메시지 하나의 최대 바이트(가장 큰 정상 메시지 = 그림 조각 · 원 그리기 점 — 실측 docs/21) */
    socketMaxBytes: positiveInt('SEC_SOCKET_MAX_BYTES', 64 * 1024),
    /** 방 만들기 — 계정마다 n개 / 창 */
    roomCreatePerAccount: positiveInt('SEC_ROOM_CREATE_PER_ACCOUNT', 5),
    roomCreateWindowMs: positiveInt('SEC_ROOM_CREATE_WINDOW_MS', 10 * 60_000),
  },
  nodeEnv: process.env.NODE_ENV ?? 'development',
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },
  get sessionSecret(): string {
    return required('SESSION_SECRET');
  },
  /**
   * ★ 선택 사항이며 없어도 정상 동작한다.
   *   초대 링크는 방장 브라우저의 window.location.origin 으로 만드는 것이 기본 방식이다.
   *   서버 환경 변수로 만들면 터널 URL이 바뀔 때마다 서버를 재시작해야 하고,
   *   그러면 메모리의 게임이 날아가 일시정지 기능이 무의미해진다. (R004 0장)
   */
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? null,

  /**
   * ★★ 실측 후 조정할 게임 운영 값들 (R015).
   *
   * ★ 왜 환경 변수로 뺐는가 — 건우 확정 사항에 "★ 설정값으로 둔다" 가 두 번 나온다.
   *   ★ 둘 다 **실제로 겪어 보고 조정할 값**이기 때문이다 (Q-82 의 5분 / Q-84 의 도배 한도).
   *   ★ 코드를 고쳐 재배포하면 메모리의 게임이 날아간다. 그러면 조정 자체가 부담이 된다.
   *
   * ★ 기본값은 shared/RULES 의 값이다. 규칙의 정본은 그쪽이고 여기는 덮어쓰기다.
   * ★★ 값을 바꾸면 docs/01-GAME-RULES.md 도 함께 고쳐야 한다. 문서가 정본이다.
   */
  tuning: {
    /** ★ PAUSED 포기까지 (Q-82). 기본 5분 */
    pauseAbandonMs: positiveInt('PAUSE_ABANDON_MS', RULES.PAUSE_ABANDON_MS),
    /** ★ 채팅 도배 윈도 (R048 개정 — 기본 5초) */
    chatRateWindowMs: positiveInt('CHAT_RATE_WINDOW_MS', RULES.CHAT_RATE_WINDOW_MS),
    /** ★ 그 윈도 안의 최대 개수 (R048 — 기본 5개. 6번째부터 잠근다) */
    chatRateMax: positiveInt('CHAT_RATE_MAX', RULES.CHAT_RATE_MAX),
    /** ★ R048 — 넘었을 때 잠그는 시간 (기본 5초) */
    chatRateLockMs: positiveInt('CHAT_RATE_LOCK_MS', RULES.CHAT_RATE_LOCK_MS),
    /**
     * ★★★ R071 (D-314 · 찬종 2026-11-01 "도배 제한 완전히 없애 · 나중에 원복할 수도") — 이모티콘 도배 제한 스위치. **기본 꺼짐.**
     *   ★ 복원 한 줄: `EMOJI_RATE_LIMIT=1` → 아래 옛 값(표준 5초 8회 · 특별 5초 5회 · 넘으면 5초 잠금 · 본인 안내)이 그대로 돈다.
     *   꺼져 있으면 서버가 창 · 횟수 · 잠금을 전부 건너뛰고 chat.throttled(kind emoji · special)를 보내지 않는다 → 화면도 잠금 표시 · 안내가 없다.
     */
    emojiRateLimit: process.env.EMOJI_RATE_LIMIT === '1',
    /** ★ 옛 값(R064 D-269 · R066 D-273) — emojiRateLimit 일 때만 쓴다 */
    emojiRateWindowMs: positiveInt('EMOJI_RATE_WINDOW_MS', 5_000),
    emojiRateMax: positiveInt('EMOJI_RATE_MAX', 8),
    emojiRateLockMs: positiveInt('EMOJI_RATE_LOCK_MS', 5_000),
    specialEmojiRateWindowMs: positiveInt('SPECIAL_EMOJI_RATE_WINDOW_MS', 5_000),
    specialEmojiRateMax: positiveInt('SPECIAL_EMOJI_RATE_MAX', 5),
    specialEmojiRateLockMs: positiveInt('SPECIAL_EMOJI_RATE_LOCK_MS', 5_000),
    /** ★★ R071 (D-314) — 기계적 폭주 방어: 한 소켓 1초에 이만큼 넘게 보낸 이모티콘은 조용히 버린다(스위치와 상관없이 늘) */
    emojiFloodPerSec: positiveInt('EMOJI_FLOOD_PER_SEC', RULES.EMOJI_FLOOD_PER_SEC),
    /**
     * ★ R049 — 뽑기 값 덮어쓰기 (검사용 · 0 = DB 의 emoji_themes.price 를 쓴다). 봇 shop 이 자기 서버에서 10 으로 두고 27번 뽑는다.
     *   ★ 실제 서버에서는 두지 않는다 — .env 에 넣지 말 것.
     */
    shopPriceOverride: Number(process.env.SHOP_PRICE_OVERRIDE ?? 0) > 0 ? Number(process.env.SHOP_PRICE_OVERRIDE) : 0,
    /**
     * ★ R050 — 정답 공개 대기(기본 8초 · RULES). **검사용** — 봇 minigame 이 200문제 판을 빨리 넘기려고 줄인다. 실제 서버에 두지 않는다
     */
    resolvedWaitMs: positiveInt('RESOLVED_WAIT_MS', RULES.RESOLVED_WAIT_MS),
    /**
     * ★ R050 — 미니게임의 "판 진행 외" 단계(깜짝 연출 · 규칙 · 준비 · 판 결과 · 최종 · 복귀) 길이 배율. **검사용**(0 < x ≤ 5 · 기본 1).
     *   봇은 줄이고(0.05) 화면 검사는 늘린다(그림을 여러 크기로 찍을 틈). ★ 판 진행(play) 시간은 바꾸지 않는다 — 케이크 타이밍 · 균형 10초는 그대로다
     */
    minigamePhaseScale: (() => {
      const v = Number(process.env.MINIGAME_PHASE_SCALE ?? 1);
      return Number.isFinite(v) && v > 0 && v <= 5 ? v : 1;
    })(),
    /**
     * ★ R058 (D-252) — 근접 오답을 남기지 않을 login_id 정규식(기본 봇 · 검사 계정 — shared NEAR_MISS_SKIP_LOGIN). **검사용** 덮어쓰기 — 봇 near 가 한 봇만 거르게 둔다
     */
    nearMissSkipLogin: process.env.NEAR_MISS_SKIP_LOGIN || NEAR_MISS_SKIP_LOGIN,
    /** ★ R046 — 끊긴 사람이 빠지기까지 (기본 60초). 테스트에서 줄인다 */
    disconnectRemoveMs: positiveInt('DISCONNECT_REMOVE_MS', RULES.DISCONNECT_REMOVE_MS),
    /** ★ 방장 이전 유예 (Q-29 · 기본 30초). 테스트에서 줄인다 */
    hostTransferGraceMs: positiveInt('HOST_TRANSFER_GRACE_MS', RULES.HOST_TRANSFER_GRACE_MS),
  },
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;

export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

/**
 * ★ R039 — 표준 이모티콘 그림(Twemoji SVG). 서버 패키지 의존성(@twemoji/svg)에 들어 있다.
 *   ★ 파일 하나가 1~3KB. 화면에 나온 것만 받는다 (외부 CDN 을 쓰지 않는다 — 터널 너머 외부 의존을 피한다).
 */
export const TWEMOJI_DIR = path.join(ROOT, 'node_modules', '@twemoji', 'svg');
