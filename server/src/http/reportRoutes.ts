// =============================================================================
// ★★ 앱 제보 (R061 / D-255) — 🐞 전반적 · 📝 문제 전용 → app_reports(0024)
//
//   POST /api/reports  { kind, text, reasons[], screen, questionIndex?, minigameKey?, questionId?, minigameItem?, device, recent? } → { ok, id }
//
// ★ 문항 · 판 · 미니게임 판은 **서버가 채운다**(그 계정이 있는 방의 지금 것 — reportContext). 방 밖이면 null.
//   공개 전 문항도 **id 만** 담는다(정답 · 지문은 담지 않는다 — 보고 스크립트가 questions 에서 읽는다).
// ★ 글의 첫 "#2271" / "photo-0303" 은 문항 칸이 비어 있을 때 채운다(있는 id 일 때만).
// ★ 속도 제한 10초 5번(메모리 — 서버가 하나뿐 · 문제 평가와 같은 꼴). 포인트 · 업적 연동 없음.
// =============================================================================

import { Router } from 'express';
import { REPORT_RATE, parseReportInput, reportRefs, type ReportInput } from '@quiz/shared';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { query } from '../db/pool.js';
import { getRoomOfAccount } from '../rooms/registry.js';
import type { Room } from '../rooms/types.js';

export const reportRouter = Router();

const recent = new Map<string, number[]>();
function rateOk(accountId: string, now = Date.now()): boolean {
  const list = (recent.get(accountId) ?? []).filter((t) => now - t < REPORT_RATE.windowMs);
  if (list.length >= REPORT_RATE.max) {
    recent.set(accountId, list);
    return false;
  }
  list.push(now);
  recent.set(accountId, list);
  return true;
}

export interface ReportContext {
  roomId: string | null;
  gameId: string | null;
  questionId: string | null;
  questionIndex: number | null;
  minigameKey: string | null;
  minigameRunId: string | null;
  minigameItem: string | null;
}

/** 방의 지금 것 → 맥락 (방 밖이면 전부 null · 클라가 보낸 값은 서버가 모를 때만 쓴다) */
export async function reportContext(room: Room | undefined, input: Pick<ReportInput, 'questionIndex' | 'minigameKey' | 'questionId' | 'minigameItem'>): Promise<ReportContext> {
  const st = room?.state;
  const q = st === 'QUESTION_ACTIVE' || st === 'QUESTION_RESOLVED' || st === 'PAUSED' ? (room?.currentQuestion ?? null) : null;
  const mg = room?.minigame ?? null;
  const spec = mg ? mg.rounds[mg.roundIndex] : undefined;
  return {
    roomId: room?.id ?? null,
    gameId: room ? (room.game?.gameId ?? (st === 'GAME_RESULT' ? (room.result?.gameId ?? null) : null)) : null,
    // ★ 화면이 가리킨 문항(결과 목록 · 로비 목록의 📝)이 먼저 · 없으면 지금 문항
    questionId: input.questionId ?? q?.questionId ?? null,
    questionIndex: input.questionId ? input.questionIndex : (q?.index ?? input.questionIndex),
    minigameKey: mg?.key ?? input.minigameKey,
    minigameRunId: mg ? await mg.dbId.catch(() => null) : null,
    minigameItem: input.minigameItem ?? spec?.itemId ?? null,
  };
}

/** 글의 "#번호" · "photo-0303" — 칸이 비어 있을 때만 · 있는 id 일 때만 */
export async function fillFromText(ctx: ReportContext, text: string, exists: (kind: 'q' | 'm', id: string) => Promise<boolean>): Promise<ReportContext> {
  const refs = reportRefs(text);
  const out = { ...ctx };
  if (!out.questionId && refs.questionId && (await exists('q', refs.questionId))) out.questionId = refs.questionId;
  if (!out.minigameItem && refs.minigameItem && (await exists('m', refs.minigameItem))) out.minigameItem = refs.minigameItem;
  return out;
}

async function existsInDb(kind: 'q' | 'm', id: string): Promise<boolean> {
  const r = kind === 'q' ? await query(`SELECT 1 FROM questions WHERE id = $1`, [id]) : await query(`SELECT 1 FROM minigame_items WHERE item_id = $1 LIMIT 1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

reportRouter.post('/', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  if (!rateOk(session.accountId)) {
    res.status(429).json({ ok: false, message: '너무 빨라요. 잠시 뒤에 다시 보내 주세요.' });
    return;
  }
  const parsed = parseReportInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ ok: false, message: parsed.error });
    return;
  }
  const v = parsed.value;
  let ctx = await reportContext(getRoomOfAccount(session.accountId), v);
  // 클라가 준 문항 번호는 있는 것만
  if (ctx.questionId && v.questionId === ctx.questionId && !(await existsInDb('q', ctx.questionId))) ctx = { ...ctx, questionId: null, questionIndex: null };
  if (ctx.minigameItem && v.minigameItem === ctx.minigameItem && !(await existsInDb('m', ctx.minigameItem))) ctx = { ...ctx, minigameItem: null };
  ctx = await fillFromText(ctx, v.text, existsInDb);
  const r = await query<{ id: string }>(
    `INSERT INTO app_reports (account_id, kind, text, reasons, screen, room_id, game_id, question_id, question_index,
                              minigame_key, minigame_run_id, minigame_item, device, recent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id::text`,
    [
      session.accountId, v.kind, v.text, v.reasons, v.screen, ctx.roomId, ctx.gameId, ctx.questionId, ctx.questionIndex,
      ctx.minigameKey, ctx.minigameRunId, ctx.minigameItem, JSON.stringify(v.device), v.recent ? JSON.stringify(v.recent) : null,
    ],
  );
  res.json({ ok: true, id: r.rows[0]!.id, questionId: ctx.questionId });
});
