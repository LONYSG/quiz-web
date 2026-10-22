// =============================================================================
// ★ /api/me — 로그인한 나에 관한 것 (R048)
//
//   GET /api/me/points   { ok, earned, correct, rewards, grants(R059), spent, balance }
//   ★ R059 POST /api/me/grants/claim  { ok, grants: [{ id, amount, reason, note, question }] } — 아직 알리지 않은 지급(제보 채택 등)을 읽고 본 것으로 적는다(토스트 한 번)
//   ★ R054 GET /api/me/stats  전적(퀴즈 · 미니게임 · 포인트) + 업적 — 기존 표에서 읽기만 (D-242 · D-243)   ★ 포인트 = 맞힌 문제 수 + 미니게임 보상(R050) − 쓴 포인트 (D-229 · D-234)
// =============================================================================

import { Router } from 'express';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { getPoints } from '../db/points.js';
import { claimUnseenGrants } from '../db/grants.js';
import { getStats } from '../db/stats.js';
import { listAchievements } from '../achievements.js';

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

// ★★ R054 — 전적 · 업적 (읽기만 · 연습 판 제외)
meRouter.get('/stats', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const [stats, achievements] = await Promise.all([getStats(session.accountId), listAchievements(session.accountId)]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, ...stats, achievements });
});

// =============================================================================
// ★★ R056 — 다른 사람 업적 보기 (D-248)
//   GET /api/profile/:accountId/achievements  { ok, achievements:[{ key, earnedAt }] } — 로그인한 사람만 · 표시만(업적은 공개 정보로 본다)
// =============================================================================
export const profileRouter = Router();

profileRouter.get('/:accountId/achievements', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const id = req.params.accountId;
  if (!/^\d{1,19}$/.test(id)) {
    res.status(400).json({ ok: false });
    return;
  }
  const achievements = await listAchievements(id);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, achievements });
});

// ★★ R059 (D-254) — 제보 채택 · 지급 알림: 한 번만(seen_at)
meRouter.post('/grants/claim', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const grants = await claimUnseenGrants(session.accountId);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, grants });
});
