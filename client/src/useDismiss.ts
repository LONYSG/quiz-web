// =============================================================================
// ★★ 팝업 닫기 규칙 한 곳 (R044 B · 건우: "✕ 는 모든 팝업에 · 팝업 바깥을 누르면 ✕ 와 같은 효과")
//
// ★ 열려 있는 동안: 바깥을 누르면(pointerdown) 닫힌다 · Esc 로 닫힌다.
//   keep — 이 선택자 안을 누르면 닫지 않는다 (팝업 자신 + 여는 버튼을 감싼 칸).
//   ★ 확인 팝업(.modal-back) 안을 누른 것은 바깥으로 치지 않는다 — 팝업 안 동작의 최종 확인이 그 위에 뜬다 (친구 삭제 등).
// ★ 반드시 거쳐야 하는 화면(새 비밀번호 · 닉네임 바꿔야 함)은 이 훅을 쓰지 않는다 (enabled=false).
// =============================================================================

import { useEffect } from 'react';

export function useDismiss(open: boolean, close: () => void, keep: string, enabled = true): void {
  useEffect(() => {
    if (!open || !enabled) return undefined;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      if (t.closest(keep) || t.closest('.modal-back')) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      // 확인 팝업이 떠 있으면 그쪽이 먼저 닫힌다(캡처 단계 · stopPropagation)
      e.preventDefault();
      close();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close, keep, enabled]);
}
