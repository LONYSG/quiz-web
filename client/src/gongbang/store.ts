// =============================================================================
// ★★★ R117 (docs/24 3-7 · 3-8) — 공방 화면의 작은 저장소
//   · 빠른 입장 옵션 — 이 브라우저(localStorage) + 계정(prefsSync 가 quickJoin 칸으로 올린다)
//   · 개인 차단 목록 — 로그인 때 한 번 GET /api/people/blocks · 넣기/풀기 PUT/DELETE · 화면이 채팅 · 이모티콘을 가린다
//   · 사람 신고 — POST /api/people/report
//   ★ 스위치가 꺼져 있으면(siteInfo().gongbang false) 아무도 이 파일을 부르지 않는다(서버도 404).
// =============================================================================

import { useEffect, useState, useSyncExternalStore } from 'react';
import { DEFAULT_QUICK_JOIN_OPTS, parseQuickJoinOpts, type QuickJoinOpts } from '@quiz/shared';

// ── 빠른 입장 옵션 ───────────────────────────────────────────────────────────────
export const QUICK_JOIN_EVENT = 'qw:quickjoin';
const QJ_KEY = 'qw.quickJoin';

/** 바꾼 적이 있으면 그 값(없으면 null — 계정에 올리지 않는다) */
export function getStoredQuickJoin(): QuickJoinOpts | null {
  try {
    const raw = localStorage.getItem(QJ_KEY);
    return raw ? parseQuickJoinOpts(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function getQuickJoin(): QuickJoinOpts {
  return getStoredQuickJoin() ?? DEFAULT_QUICK_JOIN_OPTS;
}

export function setQuickJoin(o: QuickJoinOpts): void {
  const next = parseQuickJoinOpts(o);
  if (JSON.stringify(next) === JSON.stringify(getStoredQuickJoin())) return;
  try {
    localStorage.setItem(QJ_KEY, JSON.stringify(next));
  } catch {
    /* 이번 세션만 */
  }
  window.dispatchEvent(new CustomEvent(QUICK_JOIN_EVENT));
}

export function useQuickJoin(): QuickJoinOpts {
  const [o, setO] = useState(getQuickJoin);
  useEffect(() => {
    const h = () => setO(getQuickJoin());
    window.addEventListener(QUICK_JOIN_EVENT, h);
    return () => window.removeEventListener(QUICK_JOIN_EVENT, h);
  }, []);
  return o;
}

// ── 개인 차단 ────────────────────────────────────────────────────────────────────
export interface BlockedPerson {
  accountId: string;
  nickname: string;
}

let blocks: BlockedPerson[] = [];
let blockIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const setBlocks = (next: BlockedPerson[]) => {
  blocks = next;
  blockIds = new Set(next.map((b) => b.accountId));
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 로그인(스위치 켜짐) 때 한 번 · 로그아웃이면 비운다 */
export async function loadBlocks(): Promise<void> {
  try {
    const r = await fetch('/api/people/blocks', { credentials: 'same-origin' });
    if (!r.ok) return setBlocks([]);
    const j = (await r.json()) as { ok?: boolean; blocks?: BlockedPerson[] };
    setBlocks(Array.isArray(j.blocks) ? j.blocks : []);
  } catch {
    /* 못 읽으면 가리지 않는다 */
  }
}

export function clearBlocks(): void {
  setBlocks([]);
}

export function useBlockedIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => blockIds);
}

export function useBlocks(): BlockedPerson[] {
  return useSyncExternalStore(subscribe, () => blocks);
}

export function isBlocked(accountId: string): boolean {
  return blockIds.has(accountId);
}

async function jsonOrThrow(r: Response): Promise<Record<string, unknown>> {
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.ok === false) throw new Error(typeof j.message === 'string' ? j.message : '요청을 처리할 수 없어요.');
  return j;
}

export async function blockPerson(p: BlockedPerson): Promise<void> {
  const r = await fetch(`/api/people/blocks/${encodeURIComponent(p.accountId)}`, { method: 'PUT', credentials: 'same-origin' });
  await jsonOrThrow(r);
  if (!blockIds.has(p.accountId)) setBlocks([...blocks, p]);
}

export async function unblockPerson(accountId: string): Promise<void> {
  const r = await fetch(`/api/people/blocks/${encodeURIComponent(accountId)}`, { method: 'DELETE', credentials: 'same-origin' });
  await jsonOrThrow(r);
  setBlocks(blocks.filter((b) => b.accountId !== accountId));
}

// ── 사람 신고 ────────────────────────────────────────────────────────────────────
export type ReportReason = 'abuse' | 'spam' | 'nickname' | 'picture' | 'drawing' | 'other';
export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'abuse', label: '욕설' },
  { key: 'spam', label: '도배' },
  { key: 'nickname', label: '닉네임' },
  { key: 'picture', label: '사진' },
  { key: 'drawing', label: '그림' },
  { key: 'other', label: '기타' },
];

export async function reportPerson(targetAccountId: string, reason: ReportReason, text: string): Promise<void> {
  const r = await fetch('/api/people/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ targetAccountId, reason, ...(text.trim() ? { text: text.trim() } : {}) }),
  });
  await jsonOrThrow(r);
}
