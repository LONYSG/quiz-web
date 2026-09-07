// =============================================================================
// 비밀번호 해시
//
// argon2id 를 쓴다 (R001 8-11 자체 판단, 승인됨).
// @node-rs/argon2 는 사전 빌드된 바이너리를 제공해 Windows에서 node-gyp 빌드가 필요 없다.
//
// 정책 (docs/01-GAME-RULES.md 2장)
//   · 최소 4자 (Q-04 개정. 고정 URL을 포기해 브라우저 자동완성이 안 되므로 완화했다)
//   · 상한 72바이트
//   · ★ 복구 기능을 만들지 않는다. 운영자가 scripts/reset-password.mjs 로 직접 재설정한다
// =============================================================================

import { hash, verify, Algorithm } from '@node-rs/argon2';
import { RULES } from '@quiz/shared';

export interface PasswordCheck {
  ok: boolean;
  reason?: string;
}

/**
 * 비밀번호 형식 검증.
 * ★ 바이트 길이로 상한을 재는 이유: 한글은 UTF-8에서 3바이트라 글자 수로 재면
 *   72바이트 제약을 넘길 수 있다.
 */
export function checkPassword(password: unknown): PasswordCheck {
  if (typeof password !== 'string') return { ok: false, reason: '비밀번호를 입력해 주세요.' };
  if (password.length < RULES.PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: `비밀번호는 ${RULES.PASSWORD_MIN_LENGTH}자 이상이어야 합니다.` };
  }
  if (Buffer.byteLength(password, 'utf8') > RULES.PASSWORD_MAX_BYTES) {
    return { ok: false, reason: '비밀번호가 너무 깁니다.' };
  }
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: Algorithm.Argon2id });
}

/**
 * 비밀번호 검증.
 * ★ 저장된 해시가 손상되어 verify 가 예외를 던지더라도 false 를 반환하고 넘어간다.
 *   예외가 상위로 올라가면 500이 되어 "아이디가 존재한다"는 사실이 노출된다.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
