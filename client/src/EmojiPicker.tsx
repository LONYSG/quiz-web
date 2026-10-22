// =============================================================================
// ★★ 이모티콘 고르기 (R039 / D-187)
//
// ★ 입력칸 **왼쪽**의 😊 (카카오톡처럼). 누르면 위로 작은 창:
//   · 맨 위 = **내 10칸** (PC 는 번호 1~0 = Alt+1 ~ Alt+0). 누르면 **바로 보낸다**
//   · 아래 = 분류 탭 · 검색 · 전체 이모티콘. 누르면 바로 보낸다
//   · "칸 바꾸기" — 칸을 고른 뒤 아래에서 이모티콘을 누르면 그 칸이 바뀐다 (계정에 저장)
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
import { Check, Pencil, Search, Send, Smile, TextCursorInput } from 'lucide-react';

interface Props {
  slots: number[];
  onSend: (id: number) => void;
  /** ★ R057 — 입력창에 넣기(토큰) */
  onInsert: (id: number) => void;
  /** 마지막으로 보낸 것 (떠오르는 표시) */
  flash: { id: number; key: number } | null;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
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
  const [edit, setEdit] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('smileys');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.emoji-picker')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

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
    if (editing && edit !== null) {
      const next = [...slots];
      next[edit] = id;
      setStoredSlots(next);
      setEdit((i) => (i === null ? null : (i + 1) % 10));
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
      if (e.pointerType === 'mouse' || editing) return;
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
          <div className="emoji-slots">
            {slots.map((id, i) => (
              <button
                key={i}
                type="button"
                className={editing && edit === i ? 'emoji-slot sel' : 'emoji-slot'}
                {...press(id, (shift) => (editing ? setEdit(i) : insertMode || shift ? onInsert(id) : send(id)))}
                title={`Alt+${KEYS[i]}`}
              >
                <Emoji id={id} size={26} />
                {/* ★ R040 — 번호는 그림 **아래 줄** (겹치면 안 보인다 — 건우) */}
                <span className="emoji-key">{KEYS[i]}</span>
              </button>
            ))}
          </div>
          <div className="emoji-tools">
            <button
              type="button"
              className={editing ? 'ghost tiny on' : 'ghost tiny'}
              onClick={() => {
                setEditing((v) => !v);
                setEdit(editing ? null : 0);
              }}
            >
              <Icon icon={editing ? Check : Pencil} /> {editing ? '다 바꿨어요' : '칸 바꾸기'}
            </button>
            <label className="emoji-search-wrap">
              <Icon icon={Search} />
              <input className="emoji-search" value={q} placeholder="찾기" aria-label="이모티콘 찾기" onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {editing && <p className="emoji-edit-tip">칸을 고르고 아래에서 넣을 이모티콘을 누르세요</p>}
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
