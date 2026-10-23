// =============================================================================
// ★★ 앱 제보 (R061 · D-255) — 찬종 "어떤 화면이라도 문제점을 제보할 수 있는 창 … 문제전용 피드백, 전반적인 피드백 2가지"
//
// ★ ⓐ 문제 전용(📝) = kind 'question' + 사유 칩(R056 FEEDBACK_REASONS 코드) + 글(선택) — 문항은 서버가 붙인다.
// ★ ⓑ 전반적(🐞) = kind bug · awkward · idea · other + 글(필수). 글의 "#2271" · "photo-0303" 은 서버가 문항에 붙인다.
// ★ 검사(서버 · 단위 테스트 같은 함수): kind ⊂ 상수 · 글 trim ≤500 · 사유 ⊂ 상수 · screen ≤60.
// =============================================================================

import { FEEDBACK_REASONS } from './feedback.js';

export const REPORT_KINDS = [
  { code: 'bug', label: '버그' },
  { code: 'awkward', label: '어색함' },
  { code: 'idea', label: '제안' },
  { code: 'other', label: '기타' },
  { code: 'question', label: '이 문제' },
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number]['code'];

/** 제보 글 최대 글자 수 (DB CHECK 와 같다) */
export const REPORT_TEXT_MAX = 500;

/** 속도 제한 — 한 계정 10초에 5번 */
export const REPORT_RATE = { windowMs: 10_000, max: 5 } as const;

export interface ReportInput {
  kind: ReportKind;
  text: string;
  reasons: string[];
  screen: string;
  questionIndex: number | null;
  minigameKey: string | null;
  /** 클라가 보고 있는 문항 번호(결과 목록 · 로비 목록의 📝) — 서버가 그 판에 있었는지 보지 않고 존재만 확인한다 */
  questionId: string | null;
  /** 클라가 보고 있는 미니게임 문항(photo-0303) */
  minigameItem: string | null;
  device: Record<string, unknown>;
  recent: { e: string; t: number }[] | null;
}

const KINDS = new Set<string>(REPORT_KINDS.map((k) => k.code));
const REASONS = new Set<string>(FEEDBACK_REASONS.map((r) => r.code));
const ITEM = /^[a-z]{2,16}-\d{2,6}$/;

export function parseReportInput(body: unknown): { ok: true; value: ReportInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.kind !== 'string' || !KINDS.has(b.kind)) return { ok: false, error: '종류가 이상해요.' };
  const kind = b.kind as ReportKind;
  const rawReasons = b.reasons ?? [];
  if (!Array.isArray(rawReasons) || rawReasons.some((r) => typeof r !== 'string' || !REASONS.has(r))) return { ok: false, error: '없는 사유예요.' };
  const reasons = kind === 'question' ? FEEDBACK_REASONS.map((r) => r.code as string).filter((c) => rawReasons.includes(c)) : [];
  const text = typeof b.text === 'string' ? [...b.text.trim()].slice(0, REPORT_TEXT_MAX).join('') : '';
  // ★ 전반적 제보는 글이 있어야 한다 · 문항 제보는 사유나 글 하나는 있어야 한다
  if (!text && (kind !== 'question' || reasons.length === 0)) return { ok: false, error: '내용을 적어 주세요.' };
  const screen = typeof b.screen === 'string' && b.screen ? b.screen.slice(0, 60) : 'unknown';
  const qi = b.questionIndex;
  const questionIndex = typeof qi === 'number' && Number.isInteger(qi) && qi >= 0 && qi < 1000 ? qi : null;
  const minigameKey = typeof b.minigameKey === 'string' && /^[a-z0-9-]{1,32}$/.test(b.minigameKey) ? b.minigameKey : null;
  const qid = typeof b.questionId === 'number' ? String(b.questionId) : b.questionId;
  const questionId = typeof qid === 'string' && /^\d{1,9}$/.test(qid) ? qid : null;
  const minigameItem = typeof b.minigameItem === 'string' && ITEM.test(b.minigameItem) ? b.minigameItem : null;
  const device = b.device && typeof b.device === 'object' && !Array.isArray(b.device) ? cleanDevice(b.device as Record<string, unknown>) : {};
  const recent = Array.isArray(b.recent)
    ? b.recent
        .filter((x): x is { e: string; t: number } => !!x && typeof (x as { e?: unknown }).e === 'string' && typeof (x as { t?: unknown }).t === 'number')
        .slice(-20)
        .map((x) => ({ e: x.e.slice(0, 40), t: x.t }))
    : null;
  return { ok: true, value: { kind, text, reasons, screen, questionIndex, minigameKey, questionId, minigameItem, device, recent } };
}

/** 기기 정보는 아는 칸만 · 짧게 */
function cleanDevice(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof d.mobile === 'boolean') out.mobile = d.mobile;
  if (typeof d.viewport === 'string') out.viewport = d.viewport.slice(0, 20);
  if (typeof d.ua === 'string') out.ua = d.ua.slice(0, 120);
  if (typeof d.build === 'string') out.build = d.build.slice(0, 12);
  if (typeof d.emojiInsert === 'string' || typeof d.emojiInsert === 'boolean') out.emojiInsert = d.emojiInsert;
  return out;
}

/** 글에서 첫 "#번호"(1~6자리) · 첫 미니게임 문항(photo-0303) */
export function reportRefs(text: string): { questionId: string | null; minigameItem: string | null } {
  const q = /#(\d{1,6})(?!\d)/.exec(text);
  const m = /(?:^|[^a-z0-9-])([a-z]{2,16}-\d{2,6})(?![\d])/.exec(text);
  return { questionId: q ? q[1]! : null, minigameItem: m ? m[1]! : null };
}

export function reportKindLabel(code: string): string {
  return REPORT_KINDS.find((k) => k.code === code)?.label ?? code;
}
