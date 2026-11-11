// =============================================================================
// ★★ 미니게임 그림 (R052 · D-239)
//   GET /api/minigame/image/:imageId — 퀴즈류 미니게임 그림(DB minigame_images · bytea). ★ 로그인한 사람만 · 캐시 하루(사람별 — private)
// =============================================================================

import { Router } from 'express';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { loadMinigameImage } from '../db/minigameItems.js';
import { drawTopics, liarTopics, loadTopicStore } from '../db/topics.js';
import { loadSongMetas, saveSongRate } from '../song/mode.js';
import { getRoomOfAccount } from '../rooms/registry.js';
import { FEEDBACK_RATE, parseSongFeedbackInput } from '@quiz/shared';

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

/**
 * ★★★ R096 (D-353 · 브리프 C-2 ⑦) — 노래 평가(공개 화면 👍 😐 👎 · 👎 사유 노래용) — 한 사람 한 곡 하나(나중 것이 이긴다)
 *   받는 조건: 로그인 · 지금 그 사람이 있는 방의 노래 판(gameId 같음)에서 이미 공개된 곡(판 안 순번이 있다) · 포인트 없음(1차)
 *   저장 = minigame_results.input.rate(round_index = 판 안 곡 순번) — 퀴즈 question_feedback 은 questions FK 라 못 쓴다
 */
const songRateRecent = new Map<string, number[]>();
minigameRouter.post('/song-rate', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const now = Date.now();
  const list = (songRateRecent.get(session.accountId) ?? []).filter((t) => now - t < FEEDBACK_RATE.windowMs);
  if (list.length >= FEEDBACK_RATE.max) {
    res.status(429).json({ ok: false, message: '너무 빨라요. 잠시 뒤에 다시 눌러 주세요.' });
    return;
  }
  list.push(now);
  songRateRecent.set(session.accountId, list);
  const parsed = parseSongFeedbackInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ ok: false, message: parsed.error });
    return;
  }
  const { gameId, songId, vote, reasons } = parsed.value;
  const room = getRoomOfAccount(session.accountId);
  const run = room?.game?.gameId === gameId ? room.game.song : null;
  const index = run ? [...run.rounds.entries()].find(([, id]) => id === songId)?.[0] : undefined;
  const revealed = !!room && index !== undefined && (index < (room.currentQuestion?.index ?? 0) || room.state !== 'QUESTION_ACTIVE');
  if (!run || index === undefined || !revealed || !room?.players.has(session.accountId)) {
    res.status(403).json({ ok: false, message: '방금 들은 노래만 평가할 수 있어요.' });
    return;
  }
  if (!run.runId) {
    res.status(503).json({ ok: false, message: '저장하지 못했어요.' });
    return;
  }
  try {
    await saveSongRate(run.runId, index, session.accountId, vote, reasons);
    res.json({ ok: true, vote, reasons });
  } catch (err) {
    console.error('[song] 평가 저장 실패', (err as Error).message);
    res.status(500).json({ ok: false, message: '저장하지 못했어요.' });
  }
});
