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
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;

export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
