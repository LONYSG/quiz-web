// =============================================================================
// ★★★ R116 (D-373 · docs/24 3-8 · 9절) — 사람 신고 · 개인 차단 (공방과 같이 · 스위치 GONGBANG 을 켰을 때만)
//
//   POST   /api/people/report        { targetAccountId, reason, text? } → { ok, id }
//          ★ 같은 방에 있는 사람만 · 서버가 그 방의 최근 채팅 30줄(시스템 줄 빼고)을 같이 붙여 app_reports(kind 'user')에 남긴다.
//            채팅 원문을 DB 에 남기는 것은 **신고 때만**이다(01 9장에 한 줄).
//   GET    /api/people/blocks        → { ok, blocks: [{ accountId, nickname }] }
//   PUT    /api/people/blocks/:id    → 차단(내 화면에서만 그 사람의 채팅 · 이모티콘을 가린다 · 정답자는 가리지 않는다 — 화면이 거른다)
//   DELETE /api/people/blocks/:id    → 풀기
//   ★ 서버 방송은 그대로다(판정 경로를 안 건드린다).
// =============================================================================

import { Router } from 'express';
import { config } from '../config.js';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { query } from '../db/pool.js';
import { getRoomOfAccount } from '../rooms/registry.js';

export const peopleRouter = Router();

export const PERSON_REPORT_REASONS = ['abuse', 'spam', 'nickname', 'picture', 'drawing', 'other'] as const;
const REASON_LABEL: Record<(typeof PERSON_REPORT_REASONS)[number], string> = {
  abuse: '욕설 · 괴롭힘',
  spam: '도배',
  nickname: '부적절한 닉네임',
  picture: '부적절한 사진',
  drawing: '부적절한 그림',
  other: '기타',
};
const CHAT_LINES = 30;
const recent = new Map<string, number[]>();

async function sessionOf(cookie: string | undefined) {
  return resolveSession(readSessionToken(cookie));
}
const idOk = (v: unknown): v is string => typeof v === 'string' && /^\d{1,18}$/.test(v);

peopleRouter.use((_req, res, next) => {
  if (!config.gongbang) {
    res.status(404).json({ ok: false, message: '아직 열리지 않았어요.' });
    return;
  }
  next();
});

peopleRouter.post('/report', async (req, res) => {
  const session = await sessionOf(req.headers.cookie);
  if (!session) return void res.status(401).json({ ok: false });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const target = typeof body.targetAccountId === 'number' ? String(body.targetAccountId) : body.targetAccountId;
  const reason = body.reason as (typeof PERSON_REPORT_REASONS)[number];
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
  if (!idOk(target) || target === session.accountId || !PERSON_REPORT_REASONS.includes(reason)) {
    return void res.status(400).json({ ok: false, message: '신고 형식이 올바르지 않아요.' });
  }
  // 10분에 5번(한 사람이 줄줄이 신고하는 것만 막는다)
  const now = Date.now();
  const list = (recent.get(session.accountId) ?? []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 5) return void res.status(429).json({ ok: false, message: '신고를 너무 많이 했어요. 잠시 뒤 다시 해 주세요.' });
  const room = getRoomOfAccount(session.accountId);
  if (!room || !room.players.has(target)) return void res.status(400).json({ ok: false, message: '같은 방에 있는 사람만 신고할 수 있어요.' });
  list.push(now);
  recent.set(session.accountId, list);
  const chat = room.chat
    .filter((c) => !c.system)
    .slice(-CHAT_LINES)
    .map((c) => ({ at: new Date(c.ts).toISOString(), accountId: c.accountId, nickname: c.nickname, text: c.rawNfc, emojiId: c.emojiId ?? null }));
  const r = await query<{ id: string }>(
    `INSERT INTO app_reports (account_id, kind, text, reasons, screen, room_id, target_account_id, chat_excerpt)
     VALUES ($1, 'user', $2, $3, 'person', $4, $5, $6) RETURNING id::text`,
    [session.accountId, text || REASON_LABEL[reason], [reason], room.id, target, JSON.stringify(chat)],
  );
  console.log(`[people] 신고 #${r.rows[0]!.id} ${session.accountId} → ${target} (${reason}) · 방 ${room.id} · 채팅 ${chat.length}줄`);
  res.json({ ok: true, id: r.rows[0]!.id });
});

peopleRouter.get('/blocks', async (req, res) => {
  const session = await sessionOf(req.headers.cookie);
  if (!session) return void res.status(401).json({ ok: false });
  const r = await query<{ id: string; nickname: string }>(
    `SELECT b.blocked_id::text AS id, a.nickname FROM account_blocks b JOIN accounts a ON a.id = b.blocked_id
      WHERE b.account_id = $1 ORDER BY b.created_at DESC`,
    [session.accountId],
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, blocks: r.rows.map((x) => ({ accountId: x.id, nickname: x.nickname })) });
});

peopleRouter.put('/blocks/:id', async (req, res) => {
  const session = await sessionOf(req.headers.cookie);
  if (!session) return void res.status(401).json({ ok: false });
  const id = req.params.id;
  if (!idOk(id) || id === session.accountId) return void res.status(400).json({ ok: false });
  const n = await query<{ n: number }>(`SELECT count(*)::int AS n FROM account_blocks WHERE account_id = $1`, [session.accountId]);
  if ((n.rows[0]?.n ?? 0) >= 500) return void res.status(400).json({ ok: false, message: '더 가릴 수 없어요(500명).' });
  await query(`INSERT INTO account_blocks (account_id, blocked_id) SELECT $1, id FROM accounts WHERE id = $2 ON CONFLICT DO NOTHING`, [session.accountId, id]);
  res.json({ ok: true });
});

peopleRouter.delete('/blocks/:id', async (req, res) => {
  const session = await sessionOf(req.headers.cookie);
  if (!session) return void res.status(401).json({ ok: false });
  const id = req.params.id;
  if (!idOk(id)) return void res.status(400).json({ ok: false });
  await query(`DELETE FROM account_blocks WHERE account_id = $1 AND blocked_id = $2`, [session.accountId, id]);
  res.json({ ok: true });
});
