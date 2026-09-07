#!/usr/bin/env node
// =============================================================================
// 비밀번호 재설정 (운영자 전용)
//
// ★ 왜 필요한가
//   Q-04에서 비밀번호 복구 기능을 만들지 않기로 확정했다.
//   이메일을 수집하지 않으므로 표준 재설정 메일을 보낼 수 없고,
//   친구들끼리 쓰는 서비스라 그런 기능을 만드는 것이 과설계다.
//   → 서버를 켜 주는 사람(운영자)이 직접 재설정하는 것이 유일한 수단이다.
//   → 그래서 이 스크립트가 반드시 있어야 한다. 없으면 잊은 사람은 계정을 버려야 하고,
//     그러면 문제 경험 기록(guide 26절의 장기 자산)이 끊긴다.
//
// 사용법
//   node scripts/reset-password.mjs --list
//   node scripts/reset-password.mjs --login-id chulsoo --password 1234
//   node scripts/reset-password.mjs --login-id chulsoo --generate
//
// ★ --generate 로 만든 비밀번호는 이 터미널에 한 번만 출력된다.
//   전달한 뒤 본인이 바꾸도록 안내하는 것을 권한다.
// ★ 이 스크립트는 세션을 함께 무효화한다. 남의 손에 넘어간 세션이 살아남지 않게 한다.
// =============================================================================

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? true) : null;
}

const LIST = args.includes('--list');
const loginId = flag('--login-id');
const password = flag('--password');
const generate = args.includes('--generate');

const MIN_LENGTH = 4;
const MAX_BYTES = 72;

function usage() {
  console.log(`
사용법
  node scripts/reset-password.mjs --list
  node scripts/reset-password.mjs --login-id <아이디> --password <새 비밀번호>
  node scripts/reset-password.mjs --login-id <아이디> --generate

  --list      계정 목록을 출력한다 (비밀번호 해시는 출력하지 않는다)
  --generate  안전한 비밀번호를 만들어 설정하고 한 번 출력한다
`);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  if (LIST) {
    const r = await client.query(
      `SELECT id, login_id, nickname, created_at FROM accounts ORDER BY id`,
    );
    if (r.rowCount === 0) {
      console.log('계정이 없습니다.');
    } else {
      console.log(`계정 ${r.rowCount}개`);
      for (const row of r.rows) {
        console.log(
          `  #${String(row.id).padStart(3)}  ${String(row.login_id).padEnd(20)} ${row.nickname}`,
        );
      }
    }
    process.exit(0);
  }

  if (!loginId || typeof loginId !== 'string') {
    usage();
    process.exit(1);
  }

  let newPassword;
  if (generate) {
    // 읽어 주기 쉬운 형태. 8자 base64url 은 48비트로 이 용도에 충분하다.
    newPassword = randomBytes(6).toString('base64url');
  } else if (typeof password === 'string') {
    newPassword = password;
  } else {
    console.error('--password 또는 --generate 중 하나가 필요합니다.');
    usage();
    process.exit(1);
  }

  if (newPassword.length < MIN_LENGTH) {
    console.error(`비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`);
    process.exit(1);
  }
  if (Buffer.byteLength(newPassword, 'utf8') > MAX_BYTES) {
    console.error('비밀번호가 너무 깁니다.');
    process.exit(1);
  }

  const normalized = loginId.trim().toLowerCase();
  const found = await client.query(`SELECT id, nickname FROM accounts WHERE login_id = $1`, [
    normalized,
  ]);
  if (found.rowCount === 0) {
    console.error(`계정을 찾을 수 없습니다: ${normalized}`);
    console.error('--list 로 목록을 확인하세요.');
    process.exit(1);
  }
  const accountId = found.rows[0].id;
  const nickname = found.rows[0].nickname;

  const passwordHash = await hash(newPassword, { algorithm: Algorithm.Argon2id });

  await client.query('BEGIN');
  await client.query(`UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1`, [
    accountId,
    passwordHash,
  ]);
  // ★ 기존 세션을 전부 무효화한다. 재설정의 목적상 남겨 둘 이유가 없다.
  const sessions = await client.query(`DELETE FROM sessions WHERE account_id = $1`, [accountId]);
  await client.query('COMMIT');

  console.log(`\n계정 ${normalized} (${nickname}) 의 비밀번호를 재설정했습니다.`);
  console.log(`기존 세션 ${sessions.rowCount}개를 무효화했습니다.`);
  if (generate) {
    console.log('\n  새 비밀번호:  ' + newPassword);
    console.log('\n★ 이 값은 다시 볼 수 없습니다. 전달한 뒤 본인이 바꾸도록 안내하세요.');
  }
} finally {
  await client.end();
}
