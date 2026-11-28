// =============================================================================
// ★★★ R125 B1 — 공방 목록 세 종류를 HTTP 로 한 번(앱이 켜질 때 계정과 같이 받는다 → PC 로비의 목록 칸 · 모바일 목록 화면이 첫 그림부터 다 그려짐).
//   소켓 directory.peek 과 같은 값(가린 사람 방 빼기 포함) · 그 뒤 바뀌는 것은 소켓 구독(directory.watch)이 그대로 보낸다.
// =============================================================================

import { Router } from 'express';
import { ROOM_KINDS } from '@quiz/shared';
import { config } from '../config.js';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { siteOf } from '../site.js';
import { buildList } from './index.js';
import { loadHides } from './hides.js';

export const gongbangRouter = Router();

gongbangRouter.get('/lists', async (req, res) => {
  if (!config.gongbang) return void res.status(404).json({ ok: false });
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) return void res.status(401).json({ ok: false });
  const site = siteOf(req);
  const hide = await loadHides(session.accountId);
  const lists = Object.fromEntries(ROOM_KINDS.map((k) => [k, buildList(site, k, session.accountId, hide)]));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, lists });
});
