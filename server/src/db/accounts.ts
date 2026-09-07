// =============================================================================
// 계정 조회·생성
//
// 규칙 (docs/01-GAME-RULES.md 2장)
//   · login_id  대소문자를 구분하지 않고 유일. 소문자로 정규화해 저장한다
//   · nickname  전역 유일이며 대소문자를 구분한다 (Player ≠ player)
//               PostgreSQL의 text UNIQUE 가 기본적으로 대소문자를 구분하므로
//               별도 처리가 필요 없다. citext나 lower() 인덱스를 쓰면 규칙을 깨뜨린다
// =============================================================================

import { query } from './pool.js';

export interface AccountRow {
  id: string; // bigint 는 pg 가 문자열로 준다
  login_id: string;
  password_hash: string;
  nickname: string;
  created_at: Date;
}

/** 아이디 정규화. 저장과 조회에 항상 같은 함수를 써야 한다. */
export function normalizeLoginId(loginId: string): string {
  return loginId.trim().toLowerCase();
}

export async function findAccountByLoginId(loginId: string): Promise<AccountRow | null> {
  const result = await query<AccountRow>(
    `SELECT id, login_id, password_hash, nickname, created_at
       FROM accounts WHERE login_id = $1`,
    [normalizeLoginId(loginId)],
  );
  return result.rows[0] ?? null;
}

export async function findAccountById(id: string): Promise<AccountRow | null> {
  const result = await query<AccountRow>(
    `SELECT id, login_id, password_hash, nickname, created_at
       FROM accounts WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export type CreateAccountResult =
  | { ok: true; account: AccountRow }
  | { ok: false; conflict: 'login_id' | 'nickname' };

/**
 * 계정 생성.
 *
 * ★ 중복 검사를 "먼저 SELECT 해서 확인" 하지 않고 INSERT 를 시도한 뒤
 *   UNIQUE 위반을 잡는다. 확인과 삽입 사이에 다른 요청이 끼어드는 race를 피하기 위함이다.
 *   DB 제약이 유일한 진실이다.
 */
export async function createAccount(
  loginId: string,
  passwordHash: string,
  nickname: string,
): Promise<CreateAccountResult> {
  try {
    const result = await query<AccountRow>(
      `INSERT INTO accounts (login_id, password_hash, nickname)
       VALUES ($1, $2, $3)
       RETURNING id, login_id, password_hash, nickname, created_at`,
      [normalizeLoginId(loginId), passwordHash, nickname],
    );
    return { ok: true, account: result.rows[0]! };
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code === '23505') {
      // 23505 = unique_violation
      if (e.constraint?.includes('nickname')) return { ok: false, conflict: 'nickname' };
      return { ok: false, conflict: 'login_id' };
    }
    throw err;
  }
}

export type UpdateNicknameResult = { ok: true } | { ok: false; conflict: 'nickname' };

export async function updateNickname(
  accountId: string,
  nickname: string,
): Promise<UpdateNicknameResult> {
  try {
    await query(`UPDATE accounts SET nickname = $2, updated_at = now() WHERE id = $1`, [
      accountId,
      nickname,
    ]);
    return { ok: true };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return { ok: false, conflict: 'nickname' };
    throw err;
  }
}

export async function updatePasswordHash(accountId: string, passwordHash: string): Promise<void> {
  await query(`UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1`, [
    accountId,
    passwordHash,
  ]);
}
