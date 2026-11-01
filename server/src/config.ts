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
import { NEAR_MISS_SKIP_LOGIN, RULES } from '@quiz/shared';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  // .env 가 없어도 동작한다. 환경 변수를 직접 주입하는 경우가 있다.
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
    /** ★ R068 — 정답 공개 평가 1P 를 주지 않을 login_id 정규식(기본 = 봇 · 검사 계정 — 근접 오답과 같은 값). **검사용** 덮어쓰기 — 봇 rate 가 한 봇에만 주게 둔다 */
    rateSkipLogin: process.env.RATE_SKIP_LOGIN || NEAR_MISS_SKIP_LOGIN,
    /**
     * ★ R071 (D-313) — 평가 요청 문항을 무작위 대신 이 순번으로(쉼표 · 예 "1,2,4"). **검사용** — 봇 rate 가 어느 문항이 요청인지 알고 돈다.
     *   ★ 실제 서버에 두지 않는다(없으면 판마다 무작위 ceil(n/3) 개).
     */
    rateAskForce: (() => {
      const v = (process.env.RATE_ASK_FORCE ?? '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
      return v.length > 0 ? v : null;
    })(),
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
