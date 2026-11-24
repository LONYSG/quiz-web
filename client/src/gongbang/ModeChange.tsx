// =============================================================================
// ★★★ R117 (docs/24 3-5 · 8절 "모드 바꾸기") — 종류 셋(지금 것 표시) · 바뀌는 것 한 줄 · 인원이 모자라면 미리 알림
//   ★ 방장 · 대기실에서만(서버도 로비에서만 받는다). 사람 · 링크 · 코드 · 채팅은 그대로 — 서버가 시스템 채팅 한 줄을 남긴다.
// =============================================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROOM_KINDS, minPlayersOf, type RoomKind } from '@quiz/shared';
import Icon from '../Icon.js';
import PopupClose from '../PopupClose.js';
import { KIND_ICON, KIND_LABEL, KIND_NOTE } from './kinds.js';

interface Props {
  current: RoomKind;
  playerCount: number;
  onPick: (k: RoomKind) => void;
  onClose: () => void;
}

export default function ModeChange({ current, playerCount, onPick, onClose }: Props) {
  const [pick, setPick] = useState<RoomKind>(() => ROOM_KINDS.find((k) => k !== current) ?? current);
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
  const min = minPlayersOf(pick);
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
        <p className="confirm-note">같은 사람 · 같은 방 그대로, 종류만 바뀌어요</p>
        <div className="preset-row gb-mode-kinds">
          {ROOM_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              data-kind={k}
              disabled={k === current}
              aria-pressed={pick === k}
              className={`preset gb-kind-chip k-${k}${pick === k && k !== current ? ' active' : ''}`}
              onClick={() => setPick(k)}
            >
              <Icon icon={KIND_ICON[k]} /> {KIND_LABEL[k]}
              {k === current ? ' (지금)' : ''}
            </button>
          ))}
        </div>
        {pick !== current && (
          <p className="dim gb-mode-note" data-gb-mode-note>
            {KIND_NOTE[pick]}
            {playerCount < min ? ` · 지금 ${playerCount}명이라 ${min}명부터 시작할 수 있어요` : ''}
          </p>
        )}
        <div className="confirm-actions">
          <button type="button" className="primary tone-calm" data-gb-mode-go disabled={pick === current} autoFocus onClick={() => onPick(pick)}>
            {KIND_LABEL[pick]}로 바꾸기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
