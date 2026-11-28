// =============================================================================
// ★★★ R125 C2 (R116 · R117 이 남긴 것) — 공방 목록에서 서로 가린 사람의 방을 뺀다.
//   한 사람의 "안 볼 방장" = 내가 가린 사람(account_blocks.account_id = 나) ∪ 나를 가린 사람(blocked_id = 나).
//   목록을 볼 때(directory.watch · peek) 한 번 읽어 메모리에 두고 · 가리기 · 풀기(PUT · DELETE /api/people/blocks)마다 두 사람 다 다시 읽는다.
//   ★ 목록 방송은 묶음 하나(1초) — 안 볼 방장이 있는 사람만 따로 만들어 보낸다(gongbang/index directoryTick).
// =============================================================================

import { query } from '../db/pool.js';

const hides = new Map<string, ReadonlySet<string>>();
const EMPTY: ReadonlySet<string> = new Set();

/** 메모리에 든 값(아직 안 읽었으면 빈 집합 — 처음 watch 가 읽는다) */
export function hidesOf(accountId: string): ReadonlySet<string> {
  return hides.get(accountId) ?? EMPTY;
}

export async function loadHides(accountId: string): Promise<ReadonlySet<string>> {
  try {
    const r = await query<{ id: string }>(
      `SELECT blocked_id::text AS id FROM account_blocks WHERE account_id = $1
       UNION SELECT account_id::text AS id FROM account_blocks WHERE blocked_id = $1`,
      [accountId],
    );
    const set = new Set(r.rows.map((x) => x.id));
    hides.set(accountId, set);
    return set;
  } catch (err) {
    console.error('[gongbang] 가린 사람 읽기 실패:', (err as Error).message);
    return hidesOf(accountId);
  }
}

/** 가리기 · 풀기 뒤 — 두 사람 다(읽은 적이 있는 사람만 · 아직 목록을 안 본 사람은 볼 때 읽는다) */
export function refreshHides(a: string, b: string): void {
  for (const id of [a, b]) if (hides.has(id)) void loadHides(id);
}
