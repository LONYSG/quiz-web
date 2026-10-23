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

import { createHash } from 'node:crypto';
import { Router, type Request } from 'express';
import { config } from '../config.js';
import { REPORT_RATE, parseReportInput, reportRefs, type ReportInput } from '@quiz/shared';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { query } from '../db/pool.js';
import { getRoomOfAccount } from '../rooms/registry.js';
import type { Room } from '../rooms/types.js';

export const reportRouter = Router();

const recent = new Map<string, number[]>();
function rateOk(accountId: string, now = Date.now(), max: number = REPORT_RATE.max): boolean {
  const list = (recent.get(accountId) ?? []).filter((t) => now - t < REPORT_RATE.windowMs);
  if (list.length >= max) {
    recent.set(accountId, list);
    return false;
  }
  list.push(now);
  recent.set(accountId, list);
  return true;
}

/** ★ R063 (D-256 · R062 흡수) — 로그인 없이 받는 화면은 둘뿐(그 밖은 401) */
export const ANON_SCREENS: ReadonlySet<string> = new Set(['auth', 'password-change']);
/** 비로그인 속도 제한 — ip_hash 기준 10초 3번 */
const ANON_MAX = 3;

/** 원 IP 는 저장하지 않는다 — sha256(ip + 비밀 앞 8자) 앞 16자 */
export function ipHash(ip: string, secret: string): string {
  return createHash('sha256').update(ip + secret.slice(0, 8)).digest('hex').slice(0, 16);
}
function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  const xf = req.headers['x-forwarded-for'];
  const first = (Array.isArray(cf) ? cf[0] : cf) ?? (Array.isArray(xf) ? xf[0] : xf)?.split(',')[0];
  return (first ?? req.socket.remoteAddress ?? '').trim();
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
  const screen = typeof (req.body as { screen?: unknown })?.screen === 'string' ? (req.body as { screen: string }).screen : '';
  // ★ 로그인 전(로그인 · 비밀번호 바꾸기 화면)만 비로그인 허용 — 맥락은 전부 null · ip_hash 로 속도 제한
  const anonHash = session ? null : ANON_SCREENS.has(screen) ? ipHash(clientIp(req), config.sessionSecret) : null;
  if (!session && !anonHash) {
    res.status(401).json({ ok: false });
    return;
  }
  if (!(session ? rateOk(session.accountId) : rateOk(`ip:${anonHash}`, Date.now(), ANON_MAX))) {
    res.status(429).json({ ok: false, message: '너무 빨라요. 잠시 뒤에 다시 보내 주세요.' });
    return;
  }
  const parsed = parseReportInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ ok: false, message: parsed.error });
    return;
  }
  const v = parsed.value;
  let ctx = await reportContext(session ? getRoomOfAccount(session.accountId) : undefined, session ? v : { questionIndex: null, minigameKey: null, questionId: null, minigameItem: null });
  // 클라가 준 문항 번호는 있는 것만
  if (ctx.questionId && v.questionId === ctx.questionId && !(await existsInDb('q', ctx.questionId))) ctx = { ...ctx, questionId: null, questionIndex: null };
  if (ctx.minigameItem && v.minigameItem === ctx.minigameItem && !(await existsInDb('m', ctx.minigameItem))) ctx = { ...ctx, minigameItem: null };
  if (session) ctx = await fillFromText(ctx, v.text, existsInDb);
  const r = await query<{ id: string }>(
    `INSERT INTO app_reports (account_id, kind, text, reasons, screen, room_id, game_id, question_id, question_index,
                              minigame_key, minigame_run_id, minigame_item, device, recent, login_hint, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id::text`,
    [
      session?.accountId ?? null, v.kind, v.text, v.reasons, v.screen, ctx.roomId, ctx.gameId, ctx.questionId, ctx.questionIndex,
      ctx.minigameKey, ctx.minigameRunId, ctx.minigameItem, JSON.stringify(v.device), v.recent ? JSON.stringify(v.recent) : null,
      session ? null : v.loginHint, anonHash,
    ],
  );
  res.json({ ok: true, id: r.rows[0]!.id, questionId: ctx.questionId });
});
