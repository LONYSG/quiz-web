// =============================================================================
// ★★★ 팝업은 한 번에 하나 (R041 · 건우: "팝업은 하나만 존재할 수 있다")
//
// ★ 판단: **새 팝업이 열리면 먼저 것은 닫힌다** (새 것을 막지 않는다) — 사람이 방금 누른 것이 보이는 편이 자연스럽다.
// ★ 이 규칙에 들어가는 것 (전부 같은 저장소): 확인 팝업(나가기 · 강제 종료 · 방장 넘기기 · 강퇴/차단) ·
//   상단 메뉴 창(✏️ 프로필 · ⚙ 설정 · ⓘ 안내 · 👥 참여자) · 이모티콘 창 · 단축키 목록 · 사진 편집기.
//   → 화면 위에 떠 있는 창은 언제나 최대 하나다.
// =============================================================================

import { useCallback, useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 이 팝업을 연다 — 열려 있던 다른 팝업은 닫힌다 */
export function openPopup(id: string): void {
  if (current === id) return;
  current = id;
  emit();
}

/** 닫는다. id 를 주면 그 팝업이 열려 있을 때만 */
export function closePopup(id?: string): void {
  if (current === null || (id !== undefined && current !== id)) return;
  current = null;
  emit();
}

/** 지금 열린 팝업 (없으면 null) */
export function useCurrentPopup(): string | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** [열려 있나, 열기/닫기] — useState 처럼 쓴다 */
export function usePopup(id: string): [boolean, (next: boolean | ((open: boolean) => boolean)) => void] {
  const cur = useCurrentPopup();
  const set = useCallback(
    (next: boolean | ((open: boolean) => boolean)) => {
      const v = typeof next === 'function' ? next(current === id) : next;
      if (v) openPopup(id);
      else closePopup(id);
    },
    [id],
  );
  return [cur === id, set];
}
