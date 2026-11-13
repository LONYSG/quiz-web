// =============================================================================
// ★★ 미니게임 그림 (R052 · D-239)
//   GET /api/minigame/image/:imageId — 퀴즈류 미니게임 그림(DB minigame_images · bytea). ★ 로그인한 사람만 · 캐시 하루(사람별 — private)
// =============================================================================

import { Router } from 'express';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { loadMinigameImage } from '../db/minigameItems.js';
import { drawTopics, liarTopics, loadTopicStore } from '../db/topics.js';
import { loadSongMetas } from '../song/mode.js';

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

/**
 * ★ R090 (D-347) — 라이어 · 캐치마인드 제시어 주제 목록(방장 주제 고르기 · 손님은 읽기만) — 로그인만
 *   { liar: [{ topic, nameKo, count, optIn }], draw: [...] } · count = 그 게임에 쓰는 단어 수
 */
minigameRouter.get('/topics', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).end();
    return;
  }
  try {
    const store = await loadTopicStore();
    const row = (kind: 'liar' | 'draw') => (s: ReturnType<typeof liarTopics>[number]) => ({ topic: s.topic, nameKo: s.nameKo, count: s.items.filter((x) => x[kind]).length, optIn: s.optIn });
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({ ok: true, liar: liarTopics(store).map(row('liar')), draw: drawTopics(store).map(row('draw')) });
  } catch {
    res.status(503).json({ ok: false });
  }
});

/**
 * ★★★ R096 (D-353) — 노래 맞히기 방식 설정 칩의 곡 수(로비) — 활성 곡의 고르기 칸만(제목 · 가수 없음 · 정답 아님)
 *   { ok, items: [{ category, genre, year, legend }] } · 화면이 shared songRangeCounts 로 칩마다 센다
 */
minigameRouter.get('/song-meta', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).end();
    return;
  }
  try {
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({ ok: true, items: await loadSongMetas() });
  } catch {
    res.status(503).json({ ok: false });
  }
});

