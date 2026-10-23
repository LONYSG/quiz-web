// =============================================================================
// ★★ 이모티콘 고르기 (R039 / D-187)
//
// ★ 입력칸 **왼쪽**의 😊 (카카오톡처럼). 누르면 위로 작은 창:
//   · 맨 위 = **내 10칸** (PC 는 번호 1~0 = Alt+1 ~ Alt+0). 누르면 **바로 보낸다**
//   · 아래 = 분류 탭 · 검색 · 전체 이모티콘. 누르면 바로 보낸다
//   · ★★ R064 (D-268 · 찬종 #30 "단축키 설정하는거 다들 어려워해") — 칸 아래 **숫자 자리**를 누르면 "N번 자리에 넣을 이모티콘을 고르세요" →
//     아래에서 하나 누르면 그 칸이 바뀌고 끝(계정에 저장) · Esc · 다시 누르기 = 취소. 옛 "칸 바꾸기" 토글은 없앴다. 첫 열기 때 한 줄 팁(한 번만)
// ★ 보내면 버튼 위로 그 이모티콘이 떠올라 "보냈다" 를 알린다 (모바일은 참여자 칸이 없어서 특히 필요하다)
// ★ 이 창 안의 이모티콘 목록만은 스크롤된다 — 1,800개를 한 화면에 둘 수 없다 (떠 있는 창이라 화면 배치에는 영향이 없다)
// ★★★ R057 (D-250) — 이모티콘 나열: 창 맨 위 [바로 보내기 · 입력창에 넣기](계정 저장 · 기본 바로 보내기).
//   단발로는 PC **Shift+클릭** · 모바일 **길게 누르기**(0.45초) = 입력창에 넣기(토글과 무관). 넣는 동안 창은 열린 채로 둔다.
// ★★ R060 — **바로 보내기로 보내면 창을 닫는다**(보낸 사람의 큰 반응을 창이 가렸다 — 찬종 2026-10-21). 넣기는 열어 둔다.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePopup } from './popup.js';
import PopupClose from './PopupClose.js';
import Emoji from './Emoji.js';
import { EMOJI_CATEGORIES, setEmojiInsert, setStoredSlots, useEmojiCatalog, useEmojiInsert, type EmojiMeta } from './emojiCatalog.js';
import Icon from './Icon.js';
import { Search, Send, Smile, TextCursorInput } from 'lucide-react';

interface Props {
  slots: number[];
  onSend: (id: number) => void;
  /** ★ R057 — 입력창에 넣기(토큰) */
  onInsert: (id: number) => void;
  /** 마지막으로 보낸 것 (떠오르는 표시) */
  flash: { id: number; key: number } | null;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
/** ★ R064 — "숫자 자리를 눌러 바꿀 수 있어요" 팁을 본 적 있나(기기마다 한 번) */
const SLOT_TIP_KEY = 'quiz.emojiSlotTip';
const slotTipSeen = (): boolean => {
  try {
    return localStorage.getItem(SLOT_TIP_KEY) === '1';
  } catch {
    return true;
  }
};
/** ★ R057 — 길게 누르기(모바일) */
const LONG_PRESS_MS = 450;

export default function EmojiPicker({ slots, onSend, onInsert, flash }: Props) {
  const cat = useEmojiCatalog();
  const insertMode = useEmojiInsert();
  // ★ 길게 누르기 — 넣은 뒤 따라오는 click 은 버린다
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  // ★ R041 — 팝업은 한 번에 하나
  const [open, setOpen] = usePopup('emoji');
  // ★ R064 — 바꿀 자리(숫자 자리를 누르면). null 이면 평소(누르면 보내기)
  const [assign, setAssign] = useState<number | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [tab, setTab] = useState('smileys');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.emoji-picker')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // ★ R064 — 자리 고르는 중이면 Esc 는 그것만 취소(창은 그대로)
      if (assign !== null) {
        e.stopPropagation();
        setAssign(null);
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
  }, [open, setOpen, assign]);
  // ★ R064 — 창이 닫히면 자리 고르기도 끝 · 첫 열기 때 팁 한 번(보여 준 순간 본 것으로 적는다)
  useEffect(() => {
    if (!open) {
      setAssign(null);
      return;
    }
    if (!slotTipSeen()) {
      setShowTip(true);
      try {
        localStorage.setItem(SLOT_TIP_KEY, '1');
      } catch {
        /* 저장 못 해도 이번엔 보여 준다 */
      }
    }
  }, [open]);

  const hasCustom = Boolean(cat?.list.some((e) => e.category === 'custom'));
  // ★ R049 — ✨ 특별 탭은 **가진 것이 있을 때만** (뽑기 전엔 탭이 없다). 못 가진 특별은 어디에도 안 나온다 (찾기에도)
  const hasSpecial = Boolean(cat && cat.ownedSpecial.size > 0);
  const shown = useMemo(() => {
    if (!cat) return [];
    const sendable = (e: EmojiMeta) => e.category !== 'special' || cat.ownedSpecial.has(e.id);
    const k = q.trim().toLowerCase();
    if (k) return cat.list.filter((e) => sendable(e) && (e.name.toLowerCase().includes(k) || e.tags.some((t) => t.toLowerCase().includes(k)))).slice(0, 160);
    return cat.list.filter((e) => e.category === tab && sendable(e));
  }, [cat, q, tab]);
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
  }, [tab, cat, hasSpecial]);

  const pick = (id: number, shift = false) => {
    if (assign !== null) {
      const next = [...slots];
      next[assign] = id;
      setStoredSlots(next);
      setAssign(null);
      setShowTip(false);
      return;
    }
    // ★ R057 — 토글이 "입력창에 넣기" 거나 Shift+클릭이면 넣기 · 아니면 지금처럼 바로 보내기
    if (insertMode || shift) onInsert(id);
    else send(id);
  };
  const send = (id: number) => {
    onSend(id);
    setOpen(false);
  };
  /** 한 칸의 누르기 처리 — 클릭(Shift) · 길게 누르기(터치) */
  const press = (id: number, onTap: (shift: boolean) => void) => ({
    onClick: (e: React.MouseEvent) => {
      if (longFired.current) {
        longFired.current = false;
        return;
      }
      onTap(e.shiftKey);
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || assign !== null) return;
      longFired.current = false;
      if (longTimer.current) clearTimeout(longTimer.current);
      longTimer.current = setTimeout(() => {
        longTimer.current = null;
        longFired.current = true;
        onInsert(id);
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => {
      if (longTimer.current) clearTimeout(longTimer.current);
      longTimer.current = null;
    },
    onPointerLeave: () => {
      if (longTimer.current) clearTimeout(longTimer.current);
      longTimer.current = null;
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

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
        <div className="emoji-pop" role="dialog" aria-label="이모티콘">
          {/* ★ R044 B — 모든 팝업에 같은 ✕ */}
          <div className="pop-head">
            <p className="pop-title">이모티콘</p>
            <PopupClose onClose={() => setOpen(false)} />
          </div>
          {/* ★★★ R057 — 바로 보내기(기본) ⇄ 입력창에 넣기 (계정 저장) */}
          <div className="emoji-mode" role="group" aria-label="누르면">
            <button type="button" data-emoji-mode="send" aria-pressed={!insertMode} className={!insertMode ? 'emoji-mode-btn on' : 'emoji-mode-btn'} onClick={() => setEmojiInsert(false)}>
              <Icon icon={Send} /> 바로 보내기
            </button>
            <button type="button" data-emoji-mode="insert" aria-pressed={insertMode} className={insertMode ? 'emoji-mode-btn on' : 'emoji-mode-btn'} onClick={() => setEmojiInsert(true)}>
              <Icon icon={TextCursorInput} /> 입력창에 넣기
            </button>
            <span className="dim emoji-mode-tip">{insertMode ? '여러 개 넣고 전송' : 'Shift+클릭 · 길게 누르면 넣기'}</span>
          </div>
          <div className={assign !== null ? 'emoji-slots assigning' : 'emoji-slots'}>
            {slots.map((id, i) => (
              <span key={i} className={assign === i ? 'emoji-slot-cell sel' : 'emoji-slot-cell'}>
                <button
                  type="button"
                  className="emoji-slot"
                  {...press(id, (shift) => (assign !== null ? setAssign(i) : insertMode || shift ? onInsert(id) : send(id)))}
                  title={`Alt+${KEYS[i]}`}
                >
                  <Emoji id={id} size={26} />
                </button>
                {/* ★ R064 — 번호는 **누르는 자리**: 누르면 이 칸에 넣을 이모티콘 고르기(다시 누르면 취소) */}
                <button
                  type="button"
                  className="emoji-key"
                  data-slot-key={KEYS[i]}
                  aria-pressed={assign === i}
                  aria-label={`${KEYS[i]}번 자리 바꾸기`}
                  title={`${KEYS[i]}번 자리 바꾸기`}
                  onClick={() => {
                    setAssign((a) => (a === i ? null : i));
                    setShowTip(false);
                  }}
                >
                  {KEYS[i]}
                </button>
              </span>
            ))}
          </div>
          {assign !== null ? (
            <p className="emoji-edit-tip" data-slot-assign={KEYS[assign]}>
              <strong>{KEYS[assign]}번 자리</strong>에 넣을 이모티콘을 고르세요
              <button type="button" className="link-btn" onClick={() => setAssign(null)}>
                취소
              </button>
            </p>
          ) : (
            showTip && (
              <p className="emoji-edit-tip dim" data-slot-tip>
                숫자 자리를 눌러 바꿀 수 있어요
              </p>
            )
          )}
          <div className="emoji-tools">
            <label className="emoji-search-wrap">
              <Icon icon={Search} />
              <input className="emoji-search" value={q} placeholder="찾기" aria-label="이모티콘 찾기" onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {!q && (
            <div className="emoji-tabs" role="tablist">
              {EMOJI_CATEGORIES.filter((c) => (c.key !== 'custom' || hasCustom) && (c.key !== 'special' || hasSpecial)).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === c.key}
                  className={tab === c.key ? 'emoji-tab on' : 'emoji-tab'}
                  title={c.label}
                  onClick={() => setTab(c.key)}
                >
                  {c.icon}
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
                        <button key={e.id} type="button" className="emoji-cell special" title={e.name} {...press(e.id, (shift) => pick(e.id, shift))}>
                          <Emoji id={e.id} size={34} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              : shown.map((e) => (
                  <button key={e.id} type="button" className={e.category === 'special' ? 'emoji-cell special' : 'emoji-cell'} title={e.name} {...press(e.id, (shift) => pick(e.id, shift))}>
                    <Emoji id={e.id} size={e.category === 'special' ? 34 : 26} />
                  </button>
                ))}
            {/* ★ R056 — 격자 한 줄 전체(칸 하나에 들어가 글자마다 줄이 바뀌었다) */}
            {shown.length === 0 && !specialGroups && <p className="dim emoji-none">없어요</p>}
          </div>
        </div>
      )}
    </span>
  );
}
