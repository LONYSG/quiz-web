// =============================================================================
// 프로필 사진 (R039 / D-184)
//
//   GET    /api/avatar/:accountId   사진 (없으면 404). 주소에 ?v=<버전> 을 붙여 부르므로 오래 캐시한다
//   PUT    /api/avatar              내 사진 올리기 (본문 = 이미지 바이트, Content-Type = image/webp|jpeg|png)
//   DELETE /api/avatar              내 사진 지우기 (이름 첫 글자 아바타로 돌아간다)
//
// ★ 브라우저가 원형으로 자르고 256×256 으로 줄여 올린다. 서버는 **형식(앞머리 바이트)·크기**를 다시 본다 (guide 44절 — 화면을 믿지 않는다).
// ★ 바꾸기는 닉네임과 같은 규칙 — **로비(또는 방 밖)에서만** (게임 중 불가).
// ★ 바꾸면 방 안 사람들에게 바로 알린다(참여자 목록에 사진 버전이 실린다).
// =============================================================================

import express, { Router } from 'express';
import { query } from '../db/pool.js';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { getRoomOfAccount } from '../rooms/registry.js';
import { broadcastPlayers } from '../game/question.js';

export const avatarRouter = Router();

/** 서버가 받는 상한 (DB CHECK 와 같다) */
export const AVATAR_MAX_BYTES = 200 * 1024;
const MIMES = ['image/webp', 'image/jpeg', 'image/png'] as const;

/** 앞머리 바이트로 실제 형식을 본다 — Content-Type 만 믿지 않는다 */
export function sniffImage(buf: Buffer): (typeof MIMES)[number] | null {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  return null;
}

avatarRouter.get('/:accountId', async (req, res) => {
  const id = req.params.accountId;
  if (!/^\d{1,19}$/.test(id)) {
    res.status(400).end();
    return;
  }
  const r = await query<{ image: Buffer; mime: string }>(`SELECT image, mime FROM account_avatars WHERE account_id = $1`, [id]);
  const row = r.rows[0];
  if (!row) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', row.mime);
  // ★ 주소에 버전(?v=)이 붙는다 → 바뀌면 주소가 바뀌므로 오래 캐시해도 된다
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(row.image);
});

const raw = express.raw({ type: [...MIMES], limit: AVATAR_MAX_BYTES });

avatarRouter.put('/', raw, async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const room = getRoomOfAccount(session.accountId);
  if (room && room.state !== 'LOBBY') {
    res.status(409).json({ ok: false, message: '게임 중에는 사진을 바꿀 수 없습니다.' });
    return;
  }
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const mime = sniffImage(buf);
  if (!mime || buf.length === 0) {
    res.status(400).json({ ok: false, message: 'webp · jpeg · png 사진만 올릴 수 있습니다.' });
    return;
  }
  if (buf.length > AVATAR_MAX_BYTES) {
    res.status(413).json({ ok: false, message: '사진이 너무 큽니다.' });
    return;
  }
  const r = await query<{ v: string }>(
    `INSERT INTO account_avatars (account_id, image, mime, bytes, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (account_id) DO UPDATE SET image = EXCLUDED.image, mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, updated_at = now()
     RETURNING (extract(epoch from updated_at) * 1000)::bigint::text AS v`,
    [session.accountId, buf, mime, buf.length],
  );
  const avatarV = Number(r.rows[0]?.v ?? Date.now());
  applyToRoom(session.accountId, avatarV);
  res.json({ ok: true, avatarV });
});

avatarRouter.delete('/', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const room = getRoomOfAccount(session.accountId);
  if (room && room.state !== 'LOBBY') {
    res.status(409).json({ ok: false, message: '게임 중에는 사진을 바꿀 수 없습니다.' });
    return;
  }
  await query(`DELETE FROM account_avatars WHERE account_id = $1`, [session.accountId]);
  applyToRoom(session.accountId, null);
  res.json({ ok: true, avatarV: null });
});

/** 방 안 메모리의 사진 버전을 바꾸고 참여자 목록을 다시 보낸다 */
function applyToRoom(accountId: string, avatarV: number | null): void {
  const room = getRoomOfAccount(accountId);
  const player = room?.players.get(accountId);
  if (room && player) {
    player.avatarV = avatarV;
    broadcastPlayers(room);
  }
}
