// =============================================================================
// ★ /api/me — 로그인한 나에 관한 것 (R048)
//
//   GET /api/me/points   { ok, earned, spent, balance }   ★ 포인트 = 맞힌 문제 수 − 쓴 포인트 (D-229)
// =============================================================================

import { Router } from 'express';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { getPoints } from '../db/points.js';

export const meRouter = Router();

meRouter.get('/points', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const p = await getPoints(session.accountId);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, ...p });
});
