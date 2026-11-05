// ★ R073 (D-317) — 끌어서 등록 판단
import { describe, expect, it } from 'vitest';
import {
  altKeyAction,
  applyDrop,
  DRAG_START_PX,
  dropMessage,
  dropTargetOf,
  LONG_PRESS_MS,
  mouseDragStarts,
  resolveDrop,
  touchIsScroll,
  type ClosestLike,
} from './emojiDrag.js';

/** closest 흉내 — 셀렉터 → 속성 */
const el = (hits: Record<string, Record<string, string>>): ClosestLike => ({
  closest: (sel) => (sel in hits ? { getAttribute: (n) => hits[sel]![n] ?? null } : null),
});

describe('시작 문턱', () => {
  it('마우스 6px 넘게 움직여야 끌기', () => {
    expect(DRAG_START_PX).toBe(6);
    expect(mouseDragStarts(0, 0)).toBe(false);
    expect(mouseDragStarts(6, 0)).toBe(false);
    expect(mouseDragStarts(5, 4)).toBe(true); // 6.4
    expect(mouseDragStarts(0, -7)).toBe(true);
  });
  it('터치 길게 450ms · 그 전에 10px 넘으면 스크롤', () => {
    expect(LONG_PRESS_MS).toBe(450);
    expect(touchIsScroll(3, 3)).toBe(false);
    expect(touchIsScroll(0, 11)).toBe(true);
  });
});

describe('놓은 곳 판정', () => {
  it('자리', () => {
    expect(dropTargetOf(el({ '[data-drop-slot]': { 'data-drop-slot': '3' } }))).toEqual({ kind: 'slot', index: 3 });
    expect(dropTargetOf(el({ '[data-drop-slot]': { 'data-drop-slot': 'x' } }))).toBeNull();
  });
  it('입력창 · 입력 줄', () => {
    expect(dropTargetOf(el({ '[data-chat-input]': {} }))).toEqual({ kind: 'input' });
    expect(dropTargetOf(el({ '[data-chat-drop]': {} }))).toEqual({ kind: 'input' });
  });
  it('창 안(자리 아님)은 입력 줄 안이어도 취소', () => {
    expect(dropTargetOf(el({ '.emoji-pop': {}, '[data-chat-drop]': {} }))).toBeNull();
  });
  it('밖 · 없음', () => {
    expect(dropTargetOf(el({}))).toBeNull();
    expect(dropTargetOf(null)).toBeNull();
  });
});

describe('놓은 결과', () => {
  const slots = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  it('이모티콘 → 자리 = 교체', () => {
    const a = resolveDrop({ kind: 'emoji', id: 99 }, { kind: 'slot', index: 2 });
    expect(a).toEqual({ type: 'assign', index: 2, id: 99 });
    expect(applyDrop(slots, a)).toEqual([11, 12, 99, 14, 15, 16, 17, 18, 19, 20]);
    expect(dropMessage(a)).toBe('3번 자리에 넣었어요');
  });
  it('0번 자리는 열째', () => {
    expect(dropMessage({ type: 'assign', index: 9, id: 1 })).toBe('0번 자리에 넣었어요');
  });
  it('자리 → 자리 = 서로 바꿈', () => {
    const a = resolveDrop({ kind: 'slot', index: 0, id: 11 }, { kind: 'slot', index: 9 });
    expect(a).toEqual({ type: 'swap', a: 0, b: 9 });
    expect(applyDrop(slots, a)).toEqual([20, 12, 13, 14, 15, 16, 17, 18, 19, 11]);
    expect(dropMessage(a)).toBe('1번 ⇄ 0번 자리를 바꿨어요');
  });
  it('자리 → 같은 자리 = 아무 일 없음', () => {
    const a = resolveDrop({ kind: 'slot', index: 4, id: 15 }, { kind: 'slot', index: 4 });
    expect(a).toEqual({ type: 'none' });
    expect(applyDrop(slots, a)).toBeNull();
  });
  it('같은 이모티콘을 같은 자리에 = 저장 안 함', () => {
    expect(applyDrop(slots, { type: 'assign', index: 0, id: 11 })).toBeNull();
  });
  it('입력창 = 넣기(자리 · 이모티콘 모두)', () => {
    expect(resolveDrop({ kind: 'emoji', id: 7 }, { kind: 'input' })).toEqual({ type: 'insert', id: 7 });
    expect(resolveDrop({ kind: 'slot', index: 1, id: 12 }, { kind: 'input' })).toEqual({ type: 'insert', id: 12 });
    expect(applyDrop(slots, { type: 'insert', id: 7 })).toBeNull();
  });
  it('밖 = 취소', () => {
    expect(resolveDrop({ kind: 'emoji', id: 7 }, null)).toEqual({ type: 'none' });
    expect(dropMessage({ type: 'none' })).toBeNull();
  });
});

describe('Alt 키는 토글을 따른다', () => {
  it('바로 보내기 · 입력창에 넣기', () => {
    expect(altKeyAction(false)).toBe('send');
    expect(altKeyAction(true)).toBe('insert');
  });
});

// ★ R074 (D-321 다) — 우클릭 · 길게 눌렀다 떼기 메뉴
import { MENU_STILL_PX, menuAction, menuPlace, touchReleaseOpensMenu } from './emojiDrag.js';
describe('R074 자리 메뉴', () => {
  it('길게 눌러 집은 뒤 안 움직이고 떼면 메뉴 · 움직였거나 자리 · 입력창 위면 끌기 결과', () => {
    expect(touchReleaseOpensMenu(0, 0, null)).toBe(true);
    expect(touchReleaseOpensMenu(MENU_STILL_PX, 0, null)).toBe(true);
    expect(touchReleaseOpensMenu(MENU_STILL_PX + 1, 0, null)).toBe(false);
    expect(touchReleaseOpensMenu(0, 0, { kind: 'slot', index: 2 })).toBe(false);
    expect(touchReleaseOpensMenu(0, 0, { kind: 'input' })).toBe(false);
  });
  it('메뉴 고르기 = 그 자리에 끌어 놓기와 같다(교체 · 자리끼리는 바꿈)', () => {
    expect(menuAction({ kind: 'emoji', id: 77 }, 3)).toEqual({ type: 'assign', index: 3, id: 77 });
    expect(menuAction({ kind: 'slot', index: 0, id: 5 }, 9)).toEqual({ type: 'swap', a: 0, b: 9 });
    expect(menuAction({ kind: 'slot', index: 4, id: 5 }, 4)).toEqual({ type: 'none' });
  });
  it('메뉴 자리 — 창 밖으로 안 나감 · 아래 자리가 없으면 위', () => {
    const box = { w: 440, h: 400 };
    const m = { w: 292, h: 104 };
    expect(menuPlace({ x: 10, y: 50 }, m, box).left).toBe(6);
    expect(menuPlace({ x: 430, y: 50 }, m, box).left).toBe(440 - 292 - 6);
    expect(menuPlace({ x: 200, y: 50 }, m, box).top).toBe(62);
    expect(menuPlace({ x: 200, y: 380 }, m, box).top).toBe(380 - 12 - 104);
  });
});
