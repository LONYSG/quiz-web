// =============================================================================
// ★★★ R117 (docs/24 3-5 · 8절 "모드 바꾸기") — 방장 · 대기실에서만(서버도 로비에서만 받는다).
//   사람 · 링크 · 코드 · 채팅은 그대로 — 서버가 시스템 채팅 한 줄을 남긴다.
// ★★ R123 (찬종) — 고르는 목록(이름 + 무슨 게임인지 한 줄) + 아래 "변경하기" 버튼 하나(글 · 크기 고정).
//   지금 모드는 끄지 않고 체크 · 색으로 표시("(지금)" 글 뺌) — 지금 모드를 고르면 변경하기만 꺼진다.
//   인원 안내는 여기서 하지 않는다(시작 버튼 아래에만).
// =============================================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { ROOM_KINDS, type RoomKind } from '@quiz/shared';
import Icon from '../Icon.js';
import PopupClose from '../PopupClose.js';
import { KIND_ICON, KIND_LABEL, KIND_NOTE } from './kinds.js';

interface Props {
  current: RoomKind;
  onPick: (k: RoomKind) => void;
  onClose: () => void;
}

export default function ModeChange({ current, onPick, onClose }: Props) {
  const [pick, setPick] = useState<RoomKind>(current);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal confirm-modal gb-mode" role="dialog" aria-label="모드 바꾸기" data-gb-mode-pop>
        <div className="pop-head confirm-head">
          <PopupClose onClose={onClose} />
        </div>
        <p className="confirm-title">모드 바꾸기</p>
        <div className="gb-mode-list" role="radiogroup" aria-label="모드">
          {ROOM_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              data-kind={k}
              data-now={k === current ? '' : undefined}
              aria-checked={pick === k}
              className={`gb-mode-item k-${k}${pick === k ? ' picked' : ''}${k === current ? ' now' : ''}`}
              onClick={() => setPick(k)}
            >
              <span className="gb-mode-name">
                <Icon icon={KIND_ICON[k]} /> {KIND_LABEL[k]}
                {k === current && <Icon icon={Check} className="gb-mode-now" />}
              </span>
              <span className="gb-mode-line dim">{KIND_NOTE[k]}</span>
            </button>
          ))}
        </div>
        <div className="confirm-actions">
          <button type="button" className="primary tone-calm gb-mode-go" data-gb-mode-go disabled={pick === current} onClick={() => onPick(pick)}>
            변경하기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
