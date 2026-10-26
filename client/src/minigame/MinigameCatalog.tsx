// =============================================================================
// ★★ 미니게임 고르기 창 (R063 · D-258 — 찬종 #6 #10 #19: "버튼을 쭉 나열하지 말고, 미니게임 선택 팝업을 따로 만들어.
//   게임 이미지와 간단한 설명들 나열하고 선택해서 확정 … 팝업 내부에 스크롤은 상관없음 … 방장 아니어도 설명들 볼 수 있게")
//
// ★ 카드 16(그림 · 이름 · 한 줄 · 판 수 · 시간 · 퀴즈류는 예시 한 문항) · 머리 · 꼬리 고정 · **창 안에서만 스크롤**(페이지 스크롤 0).
// ★ 두 쓰임: 'select' — 방 설정의 미니게임 고르기(여러 개 · [확정]) · 'practice' — 로비 "골라 하기"(하나 · [시작] · 연습 판).
//   방장이 아니면 같은 창을 읽기 전용(설명 보기)으로.
// ★ 그림은 lucide 선 아이콘(한 벌 · 같은 굵기 · 인라인 SVG — 외부 파일 없음).
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight, Balloon, Beef, CalendarClock, Check, Circle, Gauge, Globe, Hand, Image as ImageIcon, Keyboard, Ruler, Scale, ScanSearch, Tag, TriangleRight, Users, Zap,
  type LucideIcon,
} from 'lucide-react';
import { MINIGAMES, MINIGAME_EXAMPLES, type MinigameKey } from '@quiz/shared';
import Icon from '../Icon.js';
import PopupClose from '../PopupClose.js';
import { isReportOpen } from '../reportGuard.js';

export const MINIGAME_ICONS: Record<MinigameKey, LucideIcon> = {
  cake: Beef,
  balance: Scale,
  reaction: Zap,
  typing: Keyboard,
  circle: Circle,
  angle: TriangleRight,
  price: Tag,
  worldprice: Globe,
  photo: ImageIcon,
  estimate: Ruler,
  which: ArrowLeftRight,
  photoyear: CalendarClock,
  minority: Users,
  oddone: ScanSearch,
  gauge: Gauge,
  balloon: Balloon,
  tap: Hand,
};

const minutes = (sec: number) => `약 ${Math.max(1, Math.round(sec / 60))}분`;

interface Props {
  mode: 'select' | 'practice';
  /** 방장인가(아니면 읽기 전용) */
  editable: boolean;
  /** select — 지금 고른 것 */
  selected?: readonly MinigameKey[];
  onConfirm?: (keys: MinigameKey[]) => void;
  onStart?: (key: MinigameKey) => void;
  onClose: () => void;
}

export default function MinigameCatalog({ mode, editable, selected = [], onConfirm, onStart, onClose }: Props) {
  const [picked, setPicked] = useState<MinigameKey[]>(mode === 'select' ? [...selected] : []);
  // ★ R066 (D-281 · 찬종 #33 "실시간으로 고르는 거 방장이 아닌 사람한테 안 보임?") — 읽기 전용(손님)은 방장이 바꾸는 대로 바로(창을 연 때 값에 묶지 않는다)
  const chosen = editable ? picked : [...selected];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isReportOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const toggle = useCallback(
    (k: MinigameKey) => {
      if (!editable) return;
      if (mode === 'practice') setPicked((x) => (x[0] === k ? [] : [k]));
      else setPicked((x) => (x.includes(k) ? x.filter((y) => y !== k) : MINIGAMES.map((m) => m.key).filter((y) => y === k || x.includes(y))));
    },
    [editable, mode],
  );
  const title = mode === 'practice' ? '미니게임 골라 하기' : '미니게임 고르기';
  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal mg-cat" role="dialog" aria-label={title} data-mg-catalog={mode}>
        <div className="pop-head mg-cat-head">
          <p className="pop-title">
            {title}
            {mode === 'select' && <span className="dim mg-cat-count mono"> {chosen.length}/{MINIGAMES.length}</span>}
            {mode === 'practice' && <span className="dim mg-cat-count"> · 연습</span>}
          </p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="mg-cat-list" data-arrow-nav>
          {MINIGAMES.map((m) => {
            const on = chosen.includes(m.key);
            const ex = MINIGAME_EXAMPLES[m.key];
            return (
              <button
                key={m.key}
                type="button"
                className={`mg-cat-card${on ? ' on' : ''}${editable ? '' : ' ro'}`}
                data-key={m.key}
                aria-pressed={editable ? on : undefined}
                onClick={() => toggle(m.key)}
              >
                <span className="mg-cat-art" aria-hidden="true">
                  <Icon icon={MINIGAME_ICONS[m.key]} />
                </span>
                <span className="mg-cat-body">
                  <strong className="mg-cat-name" data-wrap-ok>{m.name}</strong>
                  <span className="mg-cat-line" data-wrap-ok>{m.oneLine}</span>
                  {ex && (
                    <span className="mg-cat-ex" data-wrap-ok>
                      예) {ex.q} → <strong>{ex.a}</strong>
                    </span>
                  )}
                  <span className="mg-cat-meta dim">
                    {m.rounds}판 · {minutes(m.estSec)}
                  </span>
                </span>
                {editable && <span className="mg-cat-check" aria-hidden="true">{on && <Icon icon={Check} />}</span>}
              </button>
            );
          })}
        </div>
        <div className="mg-cat-foot">
          {editable && mode === 'select' && (
            <button type="button" className="ghost" onClick={() => setPicked(picked.length === MINIGAMES.length ? [MINIGAMES[0]!.key] : MINIGAMES.map((m) => m.key))}>
              {picked.length === MINIGAMES.length ? '하나만' : '전체'}
            </button>
          )}
          <span className="mg-cat-gap" />
          <button type="button" className="ghost" onClick={onClose}>
            닫기
          </button>
          {editable && mode === 'select' && (
            <button type="button" className="primary" data-mg-confirm disabled={picked.length === 0} onClick={() => onConfirm?.(picked)}>
              확정
            </button>
          )}
          {editable && mode === 'practice' && (
            <button type="button" className="primary" data-mg-start disabled={picked.length === 0} onClick={() => picked[0] && onStart?.(picked[0])}>
              시작
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
