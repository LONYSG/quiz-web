// =============================================================================
// ★★ R073 (D-317) — 이모티콘 끌어서 등록: 판단만 하는 순수 함수(화면 · DOM 없음 — 단위 테스트가 이 파일을 본다)
//
// ★ 찬종 2026-11-05: "편집 버튼이 크기도 위치도 애매해 → 없애고 이모티콘을 드래그해서 단축키 자리에 놓으면 교체"
//   + "채팅창에 끌면 입력 모드 좋은 아이디어".
// ★ 길은 하나 — 창 안 이모티콘(자주 · 분류 · 검색 · ✨)을 끌어 1~0 자리에 놓으면 그 자리 교체 · 자리끼리 끌면 서로 바꿈 ·
//   채팅 입력창에 놓으면 입력창에 넣기 · 그 밖은 취소.
// ★ 시작: PC(마우스) = 누른 뒤 6px 넘게 움직이면 · 터치 = 450ms 길게 누르면 집어 올림(그 전에 10px 넘게 움직이면 스크롤로 보고 취소).
// =============================================================================

/** 마우스 — 이만큼 움직이면 끌기 시작(안 움직이고 떼면 누르기 = 보내기) */
export const DRAG_START_PX = 6;
/** 터치 — 이만큼 누르고 있으면 집어 올림 */
export const LONG_PRESS_MS = 450;
/** 터치 — 집어 올리기 전에 이만큼 움직이면 목록 스크롤로 보고 끌기를 포기한다 */
export const TOUCH_SLOP_PX = 10;

/** 무엇을 끄나 — 자리(0~9) 또는 창 안 이모티콘 */
export type DragSource = { kind: 'slot'; index: number; id: number } | { kind: 'emoji'; id: number };
/** 어디에 놓나 — 자리 · 입력창 · 그 밖(null) */
export type DropTarget = { kind: 'slot'; index: number } | { kind: 'input' } | null;
export type DropAction =
  | { type: 'assign'; index: number; id: number }
  | { type: 'swap'; a: number; b: number }
  | { type: 'insert'; id: number }
  | { type: 'none' };

/** 마우스 끌기 시작인가 */
export function mouseDragStarts(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_START_PX;
}

/** 터치 — 집어 올리기 전 움직임이 스크롤인가 */
export function touchIsScroll(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > TOUCH_SLOP_PX;
}

/** 놓은 결과 */
export function resolveDrop(src: DragSource, target: DropTarget): DropAction {
  if (!target) return { type: 'none' };
  if (target.kind === 'input') return { type: 'insert', id: src.id };
  if (src.kind === 'slot') return src.index === target.index ? { type: 'none' } : { type: 'swap', a: src.index, b: target.index };
  return { type: 'assign', index: target.index, id: src.id };
}

/** 자리 배열에 적용 — 바뀌지 않으면 null(저장하지 않는다) */
export function applyDrop(slots: readonly number[], action: DropAction): number[] | null {
  if (action.type === 'assign') {
    if (action.index < 0 || action.index >= slots.length || slots[action.index] === action.id) return null;
    const next = [...slots];
    next[action.index] = action.id;
    return next;
  }
  if (action.type === 'swap') {
    const { a, b } = action;
    if (a === b || a < 0 || b < 0 || a >= slots.length || b >= slots.length) return null;
    const next = [...slots];
    [next[a], next[b]] = [next[b]!, next[a]!];
    return next;
  }
  return null;
}

/** 놓은 뒤 한 줄(1.5초) — 자리 번호는 1~9, 0 */
export const slotLabel = (index: number): string => (index === 9 ? '0' : String(index + 1));
export function dropMessage(action: DropAction): string | null {
  if (action.type === 'assign') return `${slotLabel(action.index)}번 자리에 넣었어요`;
  if (action.type === 'swap') return `${slotLabel(action.a)}번 ⇄ ${slotLabel(action.b)}번 자리를 바꿨어요`;
  return null;
}

/** 놓은 곳 판정 — 손가락·마우스 아래 요소(고스트는 pointer-events none)에서 위로 찾는다 */
export interface ClosestLike {
  closest(selector: string): { getAttribute(name: string): string | null } | null;
}
export function dropTargetOf(el: ClosestLike | null): DropTarget {
  if (!el) return null;
  const slot = el.closest('[data-drop-slot]');
  if (slot) {
    const i = Number(slot.getAttribute('data-drop-slot'));
    return Number.isInteger(i) && i >= 0 && i <= 9 ? { kind: 'slot', index: i } : null;
  }
  // 입력창 · 입력창 위 미리보기 · 전송 버튼 줄(이모티콘 창 자체는 빼고)
  if (el.closest('.emoji-pop')) return null;
  if (el.closest('[data-chat-input]') || el.closest('[data-chat-drop]')) return { kind: 'input' };
  return null;
}

/** ★ D-317 — Alt+1~0 은 창 위 토글을 따른다(입력창에 넣기면 넣기) */
export function altKeyAction(insertMode: boolean): 'send' | 'insert' {
  return insertMode ? 'insert' : 'send';
}

// ── ★★ R074 (D-321 다) — 끌기 말고도 되는 길: PC 우클릭 · 모바일 길게 눌렀다가 움직이지 않고 떼기 → 작은 메뉴 "1~0번 자리에 넣기" ──
/** 집어 올린 뒤(터치) 이만큼 안 움직이고 떼면 메뉴 — 끌려던 게 아니다 */
export const MENU_STILL_PX = 8;
/** 터치 — 집어 올린 뒤 뗐을 때 메뉴를 여나(움직임이 MENU_STILL_PX 안 · 자리 위가 아님) */
export function touchReleaseOpensMenu(dx: number, dy: number, target: DropTarget): boolean {
  return Math.hypot(dx, dy) <= MENU_STILL_PX && target?.kind !== 'slot' && target?.kind !== 'input';
}
/** 메뉴에서 자리를 골랐다 — 끌어 그 자리에 놓은 것과 같다(창 안 이모티콘 = 교체 · 자리 = 서로 바꿈) */
export function menuAction(src: DragSource, index: number): DropAction {
  return resolveDrop(src, { kind: 'slot', index });
}
/** 메뉴 자리(창 안에서 · 칸 근처 · 창 밖으로 안 나가게) — 창 기준 좌표 */
export function menuPlace(at: { x: number; y: number }, menu: { w: number; h: number }, box: { w: number; h: number }, pad = 6): { left: number; top: number } {
  const left = Math.min(Math.max(pad, at.x - menu.w / 2), Math.max(pad, box.w - menu.w - pad));
  // 아래에 자리가 있으면 아래 · 없으면 위
  const below = at.y + 12;
  const top = below + menu.h + pad <= box.h ? below : Math.max(pad, at.y - 12 - menu.h);
  return { left, top };
}
