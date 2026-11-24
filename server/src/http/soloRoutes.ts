// =============================================================================
// ★★★ R118 (docs/24 4절 · 5-4) — 혼자 하기 · 띠 HTTP(로그인만 · 스위치 SOLO · BELT 가 꺼져 있으면 404 — 오늘과 같다)
//   GET /api/solo/me          → 내 최고 기록 · 판 수 · (BELT) 띠 칸 · 다음 칸까지 · 지금 도는 판이 있나(시작 화면 · 로비)
//   GET /api/solo/belt/:id    → (BELT) 그 사람의 띠 · 최고 기록 · 받은 날(사람 카드)
// =============================================================================

import { Router } from 'express';
import { beltNextNeed, type SoloMeView } from '@quiz/shared';
import { config } from '../config.js';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { readBeltCard, readSoloMe } from '../solo/db.js';
import { soloRunning } from '../solo/engine.js';

export const soloRouter = Router();

soloRouter.get('/me', async (req, res, next) => {
  try {
    if (!config.solo && !config.belt) return void res.status(404).json({ ok: false });
    const session = await resolveSession(readSessionToken(req.headers.cookie));
    if (!session) return void res.status(401).json({ ok: false });
    const me = await readSoloMe(session.accountId);
    const view: SoloMeView = {
      best: me.best,
      runs: me.runs,
      running: soloRunning(session.accountId),
      ...(config.belt ? { belt: me.belt, next: beltNextNeed(me.belt, me.best) } : {}),
    };
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ...view });
  } catch (err) {
    next(err);
  }
});

soloRouter.get('/belt/:id', async (req, res, next) => {
  try {
    if (!config.belt) return void res.status(404).json({ ok: false });
    const session = await resolveSession(readSessionToken(req.headers.cookie));
    if (!session) return void res.status(401).json({ ok: false });
    const id = req.params.id;
    if (!/^\d{1,18}$/.test(id)) return void res.status(400).json({ ok: false });
    const card = await readBeltCard(id);
    if (!card) return void res.status(404).json({ ok: false });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ...card });
  } catch (err) {
    next(err);
  }
});
