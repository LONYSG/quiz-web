// =============================================================================
// ★★★ 확인 팝업 (R041 — 나가기 · 강제 종료 · 방장 넘기기 · 강퇴/차단)
//
// ★ 건우: "지금 화면에 요소를 추가하는 식으로 하지 말고 **팝업**으로. 문구 세로 정렬이 아래로 치우쳐 가독성이 나쁘다."
//   → 화면 가운데(PC · 모바일) · 뒤를 흐리게 · 제목 한 줄 + (필요하면) 짧은 설명 · 위아래 가운데.
// ★ 키보드 (R038 그대로): 방향키로 버튼 사이 이동(data-arrow-nav) · Enter 확정(첫 버튼에 autoFocus) · Esc 닫기.
// ★ 뒤(흐린 바탕)를 누르면 닫힌다.
// ★ 열고 닫기는 popup.ts 저장소 — 한 번에 하나.
// =============================================================================

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import PopupClose from './PopupClose.js';

/**
 * ★★ R043 A-10 — 버튼 색 규칙 (모든 확인 팝업 같은 규칙)
 *   danger = 빨강 · 가장 센 것 (차단 · 게임 강제 종료)
 *   warn   = 주황 · 되돌리기 어렵지만 덜 센 것 (강퇴 · 나가기 · 로그아웃 · 사진 지우기 · 친구 삭제)
 *   calm   = 보라(기본 강조) · 차분한 것 (방장 넘기기 · 문제 넘기기)
 *   취소   = 기본 버튼
 */
export type ConfirmTone = 'danger' | 'warn' | 'calm';

export interface ConfirmAction {
  label: string;
  tone?: ConfirmTone;
  /** 옛 이름 — tone 'danger' 와 같다 */
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  title: ReactNode;
  note?: ReactNode;
  /** 앞에서부터 — 첫 버튼에 포커스(Enter 로 확정) */
  actions: ConfirmAction[];
  onCancel: () => void;
  /** 검사용 이름 */
  kind?: string;
}

/**
 * ★★ R044 B (건우) — "취소 버튼이 따로 있는 게 못생겼다" → [취소] 를 없애고 오른쪽 위 ✕ (모든 팝업 같은 PopupClose).
 *   ✕ · 바깥 누르기 · Esc = 취소. 확인 팝업은 결정이라 뒤를 어둡게 한다 (정보 창은 어둡게 하지 않는다 — 설계 제안 · 건우 승인).
 */
export default function ConfirmModal({ title, note, actions, onCancel, kind }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    // ★ 캡처 단계 — Esc 가 "입력창으로 돌아가기" 같은 다른 처리보다 먼저 팝업을 닫는다
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" data-kind={kind}>
        <div className="pop-head confirm-head">
          <PopupClose onClose={onCancel} />
        </div>
        <p className="confirm-title">{title}</p>
        {note && <p className="confirm-note">{note}</p>}
        <div className="confirm-actions" data-arrow-nav>
          {actions.map((a, i) => (
            <button key={a.label} type="button" className={`primary tone-${a.tone ?? (a.danger ? 'danger' : 'calm')}`} autoFocus={i === 0} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
