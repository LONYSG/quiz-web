// =============================================================================
// ★★★ 지난 판 문제 목록 (R056 문제 평가 → ★ R099 평가 입력 없앰)
//
//   GET  /api/feedback/game/:gameId/mine { ok, gameId, items:[{ questionId, index, text, full, answer }] }
//   GET  /api/feedback/last-game         { ok, gameId|null }  — 로비 "지난 판 문제" 링크용(내가 참가한 마지막 끝난 판)
//
// ★★★ R099 (찬종 2026-11-12 #127 "평가 버튼 그냥 빼자. 평가는 나만 할게 — 제보로. 다른 애들은 포인트 벌 생각밖에 없어.") —
//   POST /api/feedback/question(👍 😐 👎 · 공개 중 1P · 평가 요청 문항)을 뺐다. 목록은 남긴다 — 줄마다 제보(📝) 버튼이 그 문항을 채운다.
//   옛 표(question_feedback · point_grants 'rate')는 그대로 — feedback:report 가 지난 기록을 읽는다(새 입력 없음).
// ★ 받는 조건: 로그인 · 그 계정이 그 판(game_players)에 있었다.
// =============================================================================

import { Router } from 'express';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { query } from '../db/pool.js';

export const feedbackRouter = Router();

/** 질문 앞 몇 글자를 보낼까 (결과 화면 목록 — 전체 지문은 누르면) */
const TEXT_HEAD = 60;

feedbackRouter.get('/game/:gameId/mine', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const gameId = req.params.gameId;
  if (!/^\d{1,19}$/.test(gameId)) {
    res.status(400).json({ ok: false });
    return;
  }
  const member = await query(`SELECT 1 FROM game_players WHERE game_id = $1 AND account_id = $2`, [gameId, session.accountId]);
  if (member.rowCount === 0) {
    res.status(403).json({ ok: false, message: '내가 푼 판만 볼 수 있어요.' });
    return;
  }
  // ★ 정답을 공개하지 않고 멈춘 문제(aborted)는 뺀다
  const r = await query<{ question_id: string; question_index: number; text: string; answer: string }>(
    `SELECT gq.question_id, gq.question_index, q.question_text AS text, q.display_answer AS answer
       FROM game_questions gq
       JOIN questions q ON q.id = gq.question_id
      WHERE gq.game_id = $1 AND gq.resolution IS DISTINCT FROM 'aborted' AND gq.resolved_at IS NOT NULL
      ORDER BY gq.question_index`,
    [gameId],
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    gameId,
    items: r.rows.map((x) => ({
      questionId: String(x.question_id),
      index: x.question_index,
      // ★ 60자 넘으면 "…"
      text: [...x.text].length > TEXT_HEAD ? `${[...x.text].slice(0, TEXT_HEAD).join('')}…` : x.text,
      // ★ R063 (D-257) — 줄을 누르면 전체 질문(정답 공개가 끝난 문제라 알려도 된다 · 모바일은 앞 28자만 보이고 눌러 펼친다)
      full: x.text,
      answer: x.answer,
    })),
  });
});

feedbackRouter.get('/last-game', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  // ★ 내가 참가한 마지막 **끝난** 판 중 정답을 공개한 문제가 하나라도 있는 판
  const r = await query<{ id: string }>(
    `SELECT g.id
       FROM games g
       JOIN game_players p ON p.game_id = g.id AND p.account_id = $1
      WHERE g.ended_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM game_questions gq WHERE gq.game_id = g.id AND gq.resolved_at IS NOT NULL AND gq.resolution IS DISTINCT FROM 'aborted')
      ORDER BY g.ended_at DESC
      LIMIT 1`,
    [session.accountId],
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, gameId: r.rows[0] ? String(r.rows[0].id) : null });
});
