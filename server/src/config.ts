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
import { RULES } from '@quiz/shared';

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
    /** ★ 채팅 rate limit 윈도 (Q-84). 기본 1초 */
    chatRateWindowMs: positiveInt('CHAT_RATE_WINDOW_MS', RULES.CHAT_RATE_WINDOW_MS),
    /** ★ 그 윈도 안의 최대 개수 (Q-84). 기본 20개 */
    chatRateMax: positiveInt('CHAT_RATE_MAX', RULES.CHAT_RATE_MAX),
  },
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;

export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
