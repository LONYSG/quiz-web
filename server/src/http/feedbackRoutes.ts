// =============================================================================
// ★★★ 문제 평가(설문) (R056 / D-246)
//
//   POST /api/feedback/question          { questionId, gameId, vote: 1|-1|null, reasons[], comment } → { ok, feedback|null }
//   GET  /api/feedback/game/:gameId/mine { ok, gameId, items:[{ questionId, index, text, answer, vote, reasons, comment }] }
//   GET  /api/feedback/last-game         { ok, gameId|null }  — 로비 "지난 판 문제 평가" 링크용(내가 참가한 마지막 끝난 판)
//
// ★ 받는 조건(장난 방지의 최소선): 로그인 · **그 계정이 그 판(game_players)에 있었고 그 문제가 그 판(game_questions)에 나왔다**.
//   공개 직후 누를 수 있어야 하므로 resolved_at 은 보지 않는다(문제 번호는 정답 공개 때만 클라에 간다).
// ★ 한 사람 한 문제 한 평가 — upsert(나중 것이 이긴다 · game_id 는 최근 판) · vote null = 취소 = 행 삭제.
// ★ 사유 ⊂ shared 상수 · 의견 trim ≤200 — parseFeedbackInput(단위 테스트와 같은 함수). 속도 제한 10초 20번.
// ★ 포인트 보상 없음(장난 유인 — 찬종 "독려할게").
// =============================================================================

import { Router } from 'express';
import { FEEDBACK_RATE, parseFeedbackInput } from '@quiz/shared';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { query } from '../db/pool.js';

export const feedbackRouter = Router();

/** 질문 앞 몇 글자를 보낼까 (결과 화면 목록 — 전체 지문은 안 보낸다) */
const TEXT_HEAD = 60;

// ★ 계정별 최근 요청 시각 — 메모리 (서버가 하나뿐이다)
const recent = new Map<string, number[]>();
function rateOk(accountId: string, now = Date.now()): boolean {
  const list = (recent.get(accountId) ?? []).filter((t) => now - t < FEEDBACK_RATE.windowMs);
  if (list.length >= FEEDBACK_RATE.max) {
    recent.set(accountId, list);
    return false;
  }
  list.push(now);
  recent.set(accountId, list);
  return true;
}

interface Row {
  vote: number;
  reasons: string[];
  comment: string | null;
}

feedbackRouter.post('/question', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  if (!rateOk(session.accountId)) {
    res.status(429).json({ ok: false, message: '너무 빨라요. 잠시 뒤에 다시 눌러 주세요.' });
    return;
  }
  const parsed = parseFeedbackInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ ok: false, message: parsed.error });
    return;
  }
  const { questionId, gameId, vote, reasons, comment } = parsed.value;
  // ★ 그 판에 있었고 · 그 문제가 그 판에 나왔다
  const seen = await query<{ ok: number }>(
    `SELECT 1 AS ok
       FROM game_players p
       JOIN game_questions q ON q.game_id = p.game_id
      WHERE p.game_id = $1 AND p.account_id = $2 AND q.question_id = $3
      LIMIT 1`,
    [gameId, session.accountId, questionId],
  );
  if (seen.rowCount === 0) {
    res.status(403).json({ ok: false, message: '내가 푼 판의 문제만 평가할 수 있어요.' });
    return;
  }
  if (vote === null) {
    await query(`DELETE FROM question_feedback WHERE question_id = $1 AND account_id = $2`, [questionId, session.accountId]);
    res.json({ ok: true, feedback: null });
    return;
  }
  const r = await query<Row>(
    `INSERT INTO question_feedback (question_id, account_id, game_id, vote, reasons, comment)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (question_id, account_id) DO UPDATE
       SET game_id = EXCLUDED.game_id, vote = EXCLUDED.vote, reasons = EXCLUDED.reasons,
           comment = EXCLUDED.comment, updated_at = now()
     RETURNING vote, reasons, comment`,
    [questionId, session.accountId, gameId, vote, reasons, comment],
  );
  const row = r.rows[0]!;
  res.json({ ok: true, feedback: { vote: row.vote, reasons: row.reasons, comment: row.comment } });
});

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
  // ★ 정답을 공개하지 않고 멈춘 문제(aborted)는 뺀다 — 정답을 모르는 문제를 평가하지 않는다
  const r = await query<{ question_id: string; question_index: number; text: string; answer: string } & Partial<Row>>(
    `SELECT gq.question_id, gq.question_index, q.question_text AS text, q.display_answer AS answer,
            f.vote, f.reasons, f.comment
       FROM game_questions gq
       JOIN questions q ON q.id = gq.question_id
       LEFT JOIN question_feedback f ON f.question_id = gq.question_id AND f.account_id = $2
      WHERE gq.game_id = $1 AND gq.resolution IS DISTINCT FROM 'aborted' AND gq.resolved_at IS NOT NULL
      ORDER BY gq.question_index`,
    [gameId, session.accountId],
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
      vote: x.vote ?? null,
      reasons: x.reasons ?? [],
      comment: x.comment ?? null,
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
