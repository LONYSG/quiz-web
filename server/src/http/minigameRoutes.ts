// =============================================================================
// ★★ 미니게임 그림 (R052 · D-239)
//   GET /api/minigame/image/:imageId — 퀴즈류 미니게임 그림(DB minigame_images · bytea). ★ 로그인한 사람만 · 캐시 하루(사람별 — private)
// =============================================================================

import { Router } from 'express';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { loadMinigameImage } from '../db/minigameItems.js';

export const minigameRouter = Router();

minigameRouter.get('/image/:imageId', async (req, res) => {
  const id = String(req.params.imageId ?? '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    res.status(400).end();
    return;
  }
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).end();
    return;
  }
  const img = await loadMinigameImage(id);
  if (!img) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', img.mime);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(img.data);
});
