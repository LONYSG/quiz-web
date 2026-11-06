// =============================================================================
// ★★ 이모티콘 고르기 (R039 / D-187)
//
// ★ 입력칸 **왼쪽**의 😊 (카카오톡처럼). 누르면 위로 작은 창:
//   · 맨 위 = **내 10칸** (PC 는 번호 1~0 = Alt+1 ~ Alt+0). 누르면 **바로 보낸다**
//   · 아래 = 분류 탭 · 검색 · 전체 이모티콘. 누르면 바로 보낸다
// ★ 보내면 버튼 위로 그 이모티콘이 떠올라 "보냈다" 를 알린다 (모바일은 참여자 칸이 없어서 특히 필요하다)
// ★ 이 창 안의 이모티콘 목록만은 스크롤된다 — 1,800개를 한 화면에 둘 수 없다 (떠 있는 창이라 화면 배치에는 영향이 없다)
// ★★★ R057 (D-250) — 이모티콘 나열: 창 맨 위 [바로 보내기 · 입력창에 넣기](계정 저장 · 기본 바로 보내기).
//   단발로는 PC **Shift+클릭** = 입력창에 넣기(토글과 무관). 넣는 동안 창은 열린 채로 둔다.
// ★★ R060 — **바로 보내기로 보내면 창을 닫는다**(보낸 사람의 큰 반응을 창이 가렸다 — 찬종 2026-10-21). 넣기는 열어 둔다.
// ★★★ R073 (D-317 · 찬종 2026-11-05 "편집 버튼이 크기도 위치도 애매해 → 없애고 드래그해서 단축키 자리에 놓으면 교체") —
//   자리 바꾸는 길은 **끌기 하나**: 창 안 이모티콘을 끌어 1~0 자리에 놓으면 교체 · 자리끼리 끌면 서로 바꿈 ·
//   **채팅 입력창에 놓으면 입력창에 넣기**(창은 열어 둔다) · 그 밖은 취소. 판단은 emojiDrag.ts(단위 테스트).
//   PC = 누른 뒤 6px 넘게 움직이면 끌기 · 모바일 = 450ms 길게 누르면 집어 올림(진동 한 번). Pointer Events(HTML5 DnD 는 터치가 안 된다).
// ★★ R073 (D-318) — 창을 열 때마다 맨 위에 안내 카드(EmojiHelp.tsx · 다시 보지 않음 체크 전까지).
//   없앤 것: ✎ 편집 버튼 · 편집 모드 · 숫자 자리 누르기(D-268 · D-291) · 모바일 "길게 누르면 넣기"(→ 집어 올리기). 숫자는 표시만.
// ★★★ R074 (D-321 · 찬종 2026-11-05 "이모티콘 등록은 설명이 좀 더 친절해야") —
//   가 처음 열 때 자동 시연 3초(emojiDemo.ts · 계정 플래그 emojiDemoSeen · 누르면 멈춤 · 실제로 넣지 않음)
//   나 자리 줄 위 연한 글자("끌어다 놓기" · 모바일 "길게 눌러 끌기") · 끌기 시작하면 자리 줄이 한 번 크게 흔들리며 "여기에 놓으세요"
//   다 PC 우클릭 · 모바일 길게 눌렀다 안 움직이고 떼기 → 작은 메뉴 "1~0번 자리에 넣기"(10칸 미리 보기 · 누르면 교체) — 끌기는 그대로
// =============================================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopup } from './popup.js';
import PopupClose from './PopupClose.js';
import Emoji from './Emoji.js';
import { EMOJI_CATEGORIES, setEmojiInsert, setStoredSlots, useEmojiCatalog, useEmojiInsert, type EmojiMeta } from './emojiCatalog.js';
import Icon from './Icon.js';
import { Search, Send, Smile, TextCursorInput } from 'lucide-react';
import { isReportOpen } from './reportGuard.js';
import { useRecentEmojis } from './emojiRecent.js';
import { useUiMode } from './uiMode.js';
import EmojiHelpCard, { takeDemoWanted, takeHelpWanted } from './EmojiHelp.js';
import { setFlag } from './accountFlags.js';
import { useIsOffice } from './office.js';
import { DEMO_DELAY_MS, DEMO_MS, demoMarksSeen, demoNext, demoPoint, type DemoEvent, type DemoState } from './emojiDemo.js';
import {
  applyDrop,
  dropMessage,
  dropTargetOf,
  LONG_PRESS_MS,
  menuAction,
  menuPlace,
  mouseDragStarts,
  touchReleaseOpensMenu,
  resolveDrop,
  touchIsScroll,
  type DragSource,
  type DropTarget,
} from './emojiDrag.js';

interface Props {
  slots: number[];
  onSend: (id: number) => void;
  /** ★ R057 — 입력창에 넣기(토큰) */
  onInsert: (id: number) => void;
  /** 마지막으로 보낸 것 (떠오르는 표시) */
  flash: { id: number; key: number } | null;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

interface Press {
  src: DragSource;
  pid: number;
  touch: boolean;
  x0: number;
  y0: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export default function EmojiPicker({ slots, onSend, onInsert, flash }: Props) {
  const cat = useEmojiCatalog();
  const insertMode = useEmojiInsert();
  const mobile = useUiMode() === 'mobile';
  const office = useIsOffice();
  // ★ R041 — 팝업은 한 번에 하나
  const [open, setOpen] = usePopup('emoji');
  // ★★ R069 (#70) — "자주" 탭(최근 보낸 순 12 · 이 기기) — 있으면 첫 탭 · 창을 열 때 그 탭부터
  const recent = useRecentEmojis();
  const [tab, setTab] = useState(() => (recent.length > 0 ? 'recent' : 'smileys'));
  const [q, setQ] = useState('');
  // ★★ R073 (D-318) — 안내 카드: 창을 열 때마다(다시 보지 않음 전까지 · ⓘ 다시 보기 · 투어 ④ 는 억지로)
  const [help, setHelp] = useState(false);
  // ★ R074 (D-321 가) — 자동 시연
  const [demo, setDemo] = useState<DemoState>('idle');
  const demoRef = useRef<DemoState>('idle');
  const demoGo = useCallback((e: DemoEvent) => {
    const prev = demoRef.current;
    const next = demoNext(prev, e);
    if (next === prev) return;
    demoRef.current = next;
    if (demoMarksSeen(prev, next)) setFlag('emojiDemoSeen');
    setDemo(next);
  }, []);
  useLayoutEffect(() => {
    setHelp(open ? takeHelpWanted() : false);
    demoGo(open ? { type: 'open', wanted: takeDemoWanted() } : { type: 'close' });
  }, [open, demoGo]);
  // ★ R074 (D-321 다) — 자리 메뉴(우클릭 · 길게 눌렀다 떼기)
  const [menu, setMenu] = useState<{ src: DragSource; x: number; y: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [shake, setShake] = useState(0);

  // ── ★ R073 — 끌기 상태 ──────────────────────────────────────────────────────
  const press = useRef<Press | null>(null);
  const [ghost, setGhost] = useState<{ id: number; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<DropTarget>(null);
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);
  /** 끌기를 끝낸 직후 따라오는 click 은 버린다 */
  const suppressUntil = useRef(0);
  const latest = useRef({ slots, onInsert });
  latest.current = { slots, onInsert };
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menu !== null;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.emoji-picker')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isReportOpen()) return;
      // ★ R074 — 메뉴가 열려 있으면 Esc 는 메뉴만
      if (menuOpenRef.current) {
        e.stopPropagation();
        setMenu(null);
        return;
      }
      // ★ R073 — 끄는 중이면 Esc 는 끌기만 취소
      if (press.current?.active) {
        e.stopPropagation();
        endPress();
        return;
      }
      setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, setOpen]);

  const hasCustom = Boolean(cat?.list.some((e) => e.category === 'custom'));
  // ★ R049 — ✨ 특별 탭은 **가진 것이 있을 때만** (뽑기 전엔 탭이 없다). 못 가진 특별은 어디에도 안 나온다 (찾기에도)
  const hasSpecial = Boolean(cat && cat.ownedSpecial.size > 0);
  const recentShown = useMemo(() => {
    if (!cat) return [];
    return recent.map((id) => cat.byId.get(id)).filter((e): e is EmojiMeta => !!e && (e.category !== 'special' || cat.ownedSpecial.has(e.id)));
  }, [cat, recent]);
  const hasRecent = recentShown.length > 0;
  const shown = useMemo(() => {
    if (!cat) return [];
    const sendable = (e: EmojiMeta) => e.category !== 'special' || cat.ownedSpecial.has(e.id);
    const k = q.trim().toLowerCase();
    if (k) return cat.list.filter((e) => sendable(e) && (e.name.toLowerCase().includes(k) || e.tags.some((t) => t.toLowerCase().includes(k)))).slice(0, 160);
    if (tab === 'recent') return recentShown;
    return cat.list.filter((e) => e.category === tab && sendable(e));
  }, [cat, q, tab, recentShown]);
  // ★ 특별 탭 — 테마별 머리글 (치이카와 7/27)
  const specialGroups = useMemo(() => {
    if (!cat || tab !== 'special' || q.trim()) return null;
    return cat.themes
      .map((th) => {
        const all = cat.list.filter((e) => e.category === 'special' && e.themeId === th.id);
        return { theme: th, total: all.length, owned: all.filter((e) => cat.ownedSpecial.has(e.id)) };
      })
      .filter((g) => g.owned.length > 0);
  }, [cat, tab, q]);
  useEffect(() => {
    if (tab === 'special' && cat && !hasSpecial) setTab('smileys');
    if (tab === 'recent' && cat && !hasRecent) setTab('smileys');
  }, [tab, cat, hasSpecial, hasRecent]);
  // ★ R069 — 창을 열 때마다 "자주" 가 있으면 거기서 시작
  useEffect(() => {
    if (open && recent.length > 0) setTab('recent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = (id: number) => {
    onSend(id);
    setOpen(false);
  };
  // ★ R057 — 토글이 "입력창에 넣기" 거나 Shift+클릭이면 넣기 · 아니면 지금처럼 바로 보내기
  const tap = (id: number, shift: boolean) => {
    if (insertMode || shift) onInsert(id);
    else send(id);
  };

  // ── ★ R073 — 끌기 (window 에 건다 · 고스트는 pointer-events none 이라 손 아래 요소를 바로 본다) ─────────────
  const targetAt = (x: number, y: number): DropTarget => dropTargetOf(document.elementFromPoint(x, y));
  const setBodyDrop = (t: DropTarget) => document.body.classList.toggle('emoji-drop-input', t?.kind === 'input');
  const onMove = useCallback((e: PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pid) return;
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    if (!p.active) {
      if (p.touch) {
        if (touchIsScroll(dx, dy)) endPress(); // 목록 스크롤 — 끌기 아님
        return;
      }
      if (!mouseDragStarts(dx, dy)) return;
      activate(p, e.clientX, e.clientY);
    }
    e.preventDefault();
    setGhost({ id: p.src.id, x: e.clientX, y: e.clientY });
    const t = targetAt(e.clientX, e.clientY);
    setHover(t);
    setBodyDrop(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onUp = useCallback((e: PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pid) return;
    if (p.active && p.touch && touchReleaseOpensMenu(e.clientX - p.x0, e.clientY - p.y0, targetAt(e.clientX, e.clientY))) {
      // ★ R074 (D-321 다) — 길게 눌렀다가 움직이지 않고 뗐다 → 자리 메뉴
      suppressUntil.current = performance.now() + 400;
      openMenu(p.src, e.clientX, e.clientY);
    } else if (p.active) {
      const action = resolveDrop(p.src, targetAt(e.clientX, e.clientY));
      // 바로 뒤따르는 click 하나만(마우스 · 터치 모두 같은 흐름에 온다) — 길게 잡으면 다음 누르기를 삼킨다(ui-check r073)
      suppressUntil.current = performance.now() + 80;
      const next = applyDrop(latest.current.slots, action);
      if (next) setStoredSlots(next);
      if (action.type === 'insert') latest.current.onInsert(action.id);
      const msg = dropMessage(action);
      if (msg && next) setNote({ text: msg, key: Date.now() });
    }
    endPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onCancel = useCallback((e: PointerEvent) => {
    if (press.current && e.pointerId === press.current.pid) endPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ★ 집어 올린 뒤에는 목록이 스크롤되지 않게(터치) — passive false 라야 막힌다
  const onTouchMove = useCallback((e: TouchEvent) => {
    if (press.current?.active && e.cancelable) e.preventDefault();
  }, []);
  function activate(p: Press, x: number, y: number) {
    p.active = true;
    setShake((n) => n + 1); // ★ R074 (D-321 나) — 끌기 시작 = 자리 줄 한 번 크게 흔들림
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    setGhost({ id: p.src.id, x, y });
    document.body.classList.add('emoji-dragging');
    window.getSelection()?.removeAllRanges();
    setHover(targetAt(x, y));
  }
  function endPress() {
    const p = press.current;
    if (p?.timer) clearTimeout(p.timer);
    press.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('touchmove', onTouchMove);
    document.body.classList.remove('emoji-dragging', 'emoji-drop-input');
    setGhost(null);
    setHover(null);
  }
  const startPress = (src: DragSource, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (press.current) endPress();
    const p: Press = { src, pid: e.pointerId, touch: e.pointerType !== 'mouse', x0: e.clientX, y0: e.clientY, active: false, timer: null };
    press.current = p;
    if (p.touch) {
      p.timer = setTimeout(() => {
        if (press.current !== p) return;
        activate(p, p.x0, p.y0);
        try {
          navigator.vibrate?.(12);
        } catch {
          /* 진동 없음 */
        }
      }, LONG_PRESS_MS);
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  };
  // 창이 닫히거나 사라지면 끌기도 끝
  useEffect(() => {
    if (!open && press.current) endPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(
    () => () => {
      if (press.current) endPress();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    if (!note) return undefined;
    const t = window.setTimeout(() => setNote(null), 1500);
    return () => window.clearTimeout(t);
  }, [note]);

  /** ★ R074 — 자리 메뉴 열기(화면 좌표 → 창 기준) */
  function openMenu(src: DragSource, cx: number, cy: number) {
    const box = popRef.current?.getBoundingClientRect();
    if (!box) return;
    const at = { x: cx - box.left, y: cy - box.top };
    const pl = menuPlace(at, { w: mobile ? 236 : 292, h: mobile ? 132 : 104 }, { w: box.width, h: box.height });
    setMenu({ src, x: pl.left, y: pl.top });
  }
  const pickMenu = (index: number) => {
    if (!menu) return;
    const action = menuAction(menu.src, index);
    const next = applyDrop(latest.current.slots, action);
    if (next) setStoredSlots(next);
    const msg = dropMessage(action);
    if (msg && next) setNote({ text: msg, key: Date.now() });
    setMenu(null);
  };
  useEffect(() => {
    if (!open) setMenu(null);
  }, [open]);
  // ★ R074 (D-321 가) — 시연: armed → (칸 자리를 잴 시간) → playing 3초 → done · 사람이 누르거나 키를 치면 바로 멈춤
  const [demoPos, setDemoPos] = useState<{ id: number; x: number; y: number; scale: number } | null>(null);
  useEffect(() => {
    if (demo === 'armed') {
      const t = window.setTimeout(() => demoGo({ type: 'start' }), DEMO_DELAY_MS);
      return () => window.clearTimeout(t);
    }
    if (demo !== 'playing') {
      setDemoPos(null);
      return undefined;
    }
    const pop = popRef.current;
    const srcEl = pop?.querySelector<HTMLElement>('.emoji-grid .emoji-cell');
    const dstEl = pop?.querySelector<HTMLElement>('[data-drop-slot="0"]');
    if (!pop || !srcEl || !dstEl) {
      demoGo({ type: 'finish' });
      return undefined;
    }
    const center = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const from = center(srcEl);
    const to = center(dstEl);
    const id = Number(srcEl.dataset.emojiId ?? 0) || (latest.current.slots[0] ?? 0);
    const reduce = document.documentElement.dataset.theme === 'office' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const t0 = performance.now();
    let raf = 0;
    let shook = false;
    const tick = () => {
      const t = (performance.now() - t0) / DEMO_MS;
      const pt = demoPoint(from, to, reduce ? (t < 0.5 ? 0 : 1) : t);
      setDemoPos({ id, ...pt });
      if (!shook && t >= 0.8) {
        shook = true;
        setShake((n) => n + 1);
      }
      if (t >= 1) demoGo({ type: 'finish' });
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = () => demoGo({ type: 'interrupt' });
    window.addEventListener('pointerdown', stop, true);
    window.addEventListener('keydown', stop, true);
    window.addEventListener('wheel', stop, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', stop, true);
      window.removeEventListener('keydown', stop, true);
      window.removeEventListener('wheel', stop, true);
    };
  }, [demo, demoGo]);

  /** 한 칸 — 누르기(보내기 · Shift = 넣기) + 끌기 */
  const cellProps = (src: DragSource) => ({
    onClick: (e: React.MouseEvent) => {
      if (performance.now() < suppressUntil.current) return;
      tap(src.id, e.shiftKey);
    },
    onPointerDown: (e: React.PointerEvent) => startPress(src, e),
    // ★ R074 (D-321 다) — PC 우클릭 = 자리 메뉴 · 터치의 길게 누름(contextmenu)은 막기만(뗄 때 메뉴 — onUp)
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (mobile || press.current?.touch) return;
      if (press.current) endPress();
      openMenu(src, e.clientX, e.clientY);
    },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  });
  const dragging = ghost !== null;

  return (
    <span className="emoji-picker">
      <button
        type="button"
        className="emoji-btn"
        aria-label="이모티콘"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon={Smile} />
      </button>
      {flash && (
        <span key={flash.key} className="emoji-flash" aria-hidden="true">
          <Emoji id={flash.id} size={30} />
        </span>
      )}
      {open && (
        <div ref={popRef} className={dragging ? 'emoji-pop dragging' : 'emoji-pop'} role="dialog" aria-label="이모티콘" data-emoji-demo={demo}>
          {/* ★ R044 B — 모든 팝업에 같은 ✕ */}
          <div className="pop-head">
            <p className="pop-title">이모티콘</p>
            <PopupClose onClose={() => setOpen(false)} />
          </div>
          {help && <EmojiHelpCard mobile={mobile} onClose={() => setHelp(false)} onDemo={() => demoGo({ type: 'replay' })} />}
          {/* ★★★ R057 — 바로 보내기(기본) ⇄ 입력창에 넣기 (계정 저장) · ★ R073 — Alt+1~0 도 이 토글을 따른다 */}
          <div className="emoji-mode" role="group" aria-label="누르면">
            <button type="button" data-emoji-mode="send" aria-pressed={!insertMode} className={!insertMode ? 'emoji-mode-btn on' : 'emoji-mode-btn'} onClick={() => setEmojiInsert(false)}>
              <Icon icon={Send} /> 바로 보내기
            </button>
            <button type="button" data-emoji-mode="insert" aria-pressed={insertMode} className={insertMode ? 'emoji-mode-btn on' : 'emoji-mode-btn'} onClick={() => setEmojiInsert(true)}>
              <Icon icon={TextCursorInput} /> 입력창에 넣기
            </button>
            <span className="dim emoji-mode-tip">{insertMode ? '여러 개 넣고 전송' : mobile ? '채팅창에 끌면 넣기' : 'Shift 누른 채 클릭 = 넣기'}</span>
          </div>
          {/* ★ R074 (D-321 나) — 자리 줄 위 연한 글자 · 끄는 중(시연 포함)은 "여기에 놓으세요" */}
          <p className={dragging || demo === 'playing' ? 'emoji-slots-cap on' : 'emoji-slots-cap'} data-emoji-slots-cap aria-hidden="true">
            {dragging || demo === 'playing' ? '↓ 여기에 놓으세요' : mobile ? '↓ 길게 눌러 끌기 · 떼면 메뉴' : '↓ 끌어다 놓기 · 우클릭 = 메뉴'}
          </p>
          <div key={`slots-${shake}`} className={[dragging ? 'emoji-slots drop-ok' : 'emoji-slots', shake > 0 ? 'shake' : ''].filter(Boolean).join(' ')} data-emoji-slots>
            {slots.map((id, i) => (
              <span
                key={i}
                className={[
                  'emoji-slot-cell',
                  hover?.kind === 'slot' && hover.index === i ? 'drop-hover' : '',
                  press.current?.active && press.current.src.kind === 'slot' && press.current.src.index === i ? 'drag-from' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-drop-slot={i}
              >
                <button type="button" className="emoji-slot" title={mobile ? `${KEYS[i]}번 자리` : `Alt+${KEYS[i]}`} {...cellProps({ kind: 'slot', index: i, id })}>
                  <Emoji id={id} size={26} />
                </button>
                {/* ★ R073 — 번호는 표시만(PC = Alt+N · 모바일 = 자리 이름) */}
                <span className="emoji-key" data-slot-key={KEYS[i]} aria-hidden="true">
                  {KEYS[i]}
                </span>
              </span>
            ))}
          </div>
          {/* ★ R074 (D-321 다) — 자리 메뉴 */}
          {menu && (
            <div className="emoji-slot-menu" role="menu" aria-label="몇 번 자리에 넣을까요" data-emoji-menu style={{ left: menu.x, top: menu.y }}>
              <p className="emoji-slot-menu-title">
                <Emoji id={menu.src.id} size={20} /> {menu.src.kind === 'slot' ? '어느 자리와 바꿀까요?' : '몇 번 자리에 넣을까요?'}
              </p>
              <div className="emoji-slot-menu-grid">
                {slots.map((id, i) => (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    className="emoji-slot-menu-cell"
                    data-menu-slot={i}
                    disabled={menu.src.kind === 'slot' && menu.src.index === i}
                    onClick={() => pickMenu(i)}
                  >
                    <Emoji id={id} size={22} />
                    <span className="emoji-key">{KEYS[i]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {note && (
            <p key={note.key} className="emoji-drop-note" role="status" data-emoji-drop-note>
              {note.text}
            </p>
          )}
          <div className="emoji-tools">
            <label className="emoji-search-wrap">
              <Icon icon={Search} />
              <input className="emoji-search" value={q} placeholder="찾기" aria-label="이모티콘 찾기" onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {!q && (
            <div className="emoji-tabs" role="tablist">
              {[...(hasRecent ? [{ key: 'recent', label: '자주', icon: '🕘' }] : []), ...EMOJI_CATEGORIES.filter((c) => (c.key !== 'custom' || hasCustom) && (c.key !== 'special' || hasSpecial))].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === c.key}
                  className={tab === c.key ? 'emoji-tab on' : 'emoji-tab'}
                  title={c.label}
                  onClick={() => setTab(c.key)}
                >
                  {/* ★ R075 (D-322 2판) — 사무실 모드는 분류 그림(색 이모지 글자) 대신 이름 글자 */}
                  {office ? c.label : c.icon}
                </button>
              ))}
            </div>
          )}
          <div className={specialGroups ? 'emoji-grid emoji-grid-special' : 'emoji-grid'}>
            {specialGroups
              ? specialGroups.map((g) => (
                  <div key={g.theme.key} className="emoji-group">
                    <p className="emoji-group-head">
                      {g.theme.name} <span className="mono dim">{g.owned.length}/{g.total}</span>
                    </p>
                    <div className="emoji-group-cells">
                      {g.owned.map((e) => (
                        <button key={e.id} type="button" className="emoji-cell special" title={e.name} data-emoji-id={e.id} {...cellProps({ kind: 'emoji', id: e.id })}>
                          <Emoji id={e.id} size={34} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              : shown.map((e) => (
                  <button key={e.id} type="button" className={e.category === 'special' ? 'emoji-cell special' : 'emoji-cell'} title={e.name} data-emoji-id={e.id} {...cellProps({ kind: 'emoji', id: e.id })}>
                    <Emoji id={e.id} size={e.category === 'special' ? 34 : 26} />
                  </button>
                ))}
            {/* ★ R056 — 격자 한 줄 전체(칸 하나에 들어가 글자마다 줄이 바뀌었다) */}
            {shown.length === 0 && !specialGroups && <p className="dim emoji-none">없어요</p>}
          </div>
        </div>
      )}
      {demoPos &&
        createPortal(
          <span className="emoji-ghost demo" aria-hidden="true" data-emoji-demo-ghost style={{ left: demoPos.x, top: demoPos.y, transform: `translate(-50%, -50%) scale(${demoPos.scale})` }}>
            <Emoji id={demoPos.id} size={34} />
            <span className="emoji-demo-hand">☝</span>
          </span>,
          document.body,
        )}
      {ghost &&
        createPortal(
          <span className="emoji-ghost" aria-hidden="true" data-emoji-ghost style={{ left: ghost.x, top: ghost.y }}>
            <Emoji id={ghost.id} size={34} />
          </span>,
          document.body,
        )}
    </span>
  );
}
