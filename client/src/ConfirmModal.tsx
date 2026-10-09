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

export interface ConfirmAction {
  label: string;
  /** 위험한 동작(강퇴·차단·종료) — 붉은 버튼 */
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  title: ReactNode;
  note?: ReactNode;
  /** 앞에서부터 — 첫 버튼에 포커스(Enter 로 확정) */
  actions: ConfirmAction[];
  cancelLabel?: string;
  onCancel: () => void;
  /** 검사용 이름 */
  kind?: string;
}

export default function ConfirmModal({ title, note, actions, cancelLabel = '취소', onCancel, kind }: Props) {
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
        <p className="confirm-title">{title}</p>
        {note && <p className="confirm-note">{note}</p>}
        <div className="confirm-actions" data-arrow-nav>
          {actions.map((a, i) => (
            <button key={a.label} type="button" className={a.danger ? 'primary danger' : 'primary'} autoFocus={i === 0} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
          <button type="button" className="ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
