// =============================================================================
// ★★ 업적 — 달성 순간 (R054 · D-243) · 표시만(포인트 · 꾸미기 보상 없음)
//
// ★ 기존 표로 판정한다(판정 SQL — db/achievementsSql.ts) · achievements (account_id, key) UNIQUE 로 한 번만.
// ★ 부르는 곳: 문제 정답 공개(맞힌 사람) · 미니게임 판 끝(참가자) · 뽑기(조용히 — 방 밖일 수 있다).
//   DB 기록(answer_events · minigame_results)이 fire-and-forget 이라 조금 기다렸다 판정한다.
// ★ 새로 얻으면: 본인에게 achievement.earned(토스트) + 방 채팅 한 줄("🏅 닉네임 — 업적") — 이모티콘 로그 꼴.
// =============================================================================

import { achievementDef } from '@quiz/shared';
import { AWARD_SQL } from './db/achievementsSql.js';
import { query } from './db/pool.js';
import { emitToPlayer } from './rooms/emit.js';
import { broadcastSystem } from './rooms/systemChat.js';
import type { Room } from './rooms/types.js';

/** DB 기록이 들어갈 때까지 기다리는 시간 */
const SETTLE_MS = 1500;

export function checkAchievements(room: Room | null, accountIds: readonly string[], delayMs = SETTLE_MS): void {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return;
  setTimeout(() => {
    void query<{ account_id: string; key: string }>(AWARD_SQL, [ids, false])
      .then((r) => {
        for (const row of r.rows) {
          const def = achievementDef(row.key);
          console.log(`[achievement] ${row.account_id} ★ ${row.key}`);
          const p = room?.players.get(row.account_id);
          if (!room || !p) continue;
          emitToPlayer(p, 'achievement.earned', { key: row.key, name: def.name, desc: def.desc });
          broadcastSystem(room, `🏅 ${p.nickname} — ${def.name}`);
        }
      })
      .catch((err) => console.error('[achievement] ★ 판정 실패:', (err as Error).message));
  }, delayMs);
}

export async function listAchievements(accountId: string): Promise<{ key: string; earnedAt: string }[]> {
  const r = await query<{ key: string; earned_at: Date }>(`SELECT key, earned_at FROM achievements WHERE account_id = $1 ORDER BY earned_at`, [accountId]);
  return r.rows.map((x) => ({ key: x.key, earnedAt: x.earned_at.toISOString() }));
}
