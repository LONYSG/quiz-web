// =============================================================================
// 단축키 (Q-56 확정 / R015)
//
// ★ 건우: "웬만하면 마우스 사용 없이 돌아가야 해. 단축키 설명도 어딘가에 같이 적어놔."
// ★ guide 24절이 요구하는 사항이다.
//
// ★★★ 가장 중요한 제약 — **단축키가 채팅 입력을 방해하면 안 된다**
//
//   ★ 이 게임은 **채팅 입력창이 항상 포커스**다. 정답을 치는 것이 게임 그 자체다.
//   ★★ 그래서 "입력창에 포커스가 없을 때만 단축키를 받는다" 는 흔한 해법을
//     **쓸 수 없다.** 포커스가 늘 입력창에 있으므로 단축키가 영원히 안 먹는다.
//
//   → ★★ **단독 문자키를 절대 쓰지 않는다. 전부 조합키(Alt)다.**
//     ★ Alt 조합은 어떤 IME 에서도 문자를 만들지 않는다. 한글 조합 중에도 안전하다.
//     ★ 그래서 포커스를 구분할 필요 자체가 없어진다. 이것이 이 설계의 핵심이다.
//
// ★ 왜 Ctrl 이 아니라 Alt 인가
//   ★ Ctrl 조합은 브라우저·OS 단축키와 충돌이 심하다 (Ctrl+S 저장 / Ctrl+W 탭 닫기 /
//     Ctrl+R 새로고침 / Ctrl+F 찾기). ★ 실수로 눌리면 게임이 날아간다.
//   ★ Alt 조합은 상대적으로 비어 있다. 다만 아래 것들은 피해야 한다.
//
// ★★ 피한 키 (실제 충돌)
//   Alt+F / Alt+E   Chrome·Firefox 메뉴
//   Alt+D           주소창 포커스
//   Alt+1~9         탭 전환
//   Alt+←/→/Home    뒤로/앞으로/홈
//   Alt+Space       (Windows) 창 메뉴
//   F1              도움말 / F3 찾기 / F5 새로고침 / F6 주소창 /
//   F7              (Firefox) 캐럿 브라우징 / F10 메뉴바 / F11 전체화면 / F12 개발자도구
//
// ★ Q-33 확정: "조합키와 F키를 모두 지원하고 화면에는 조합키를 표기."
//   ★★ 그런데 안전한 F키가 **F2 / F4 / F8 / F9 넷뿐**이다.
//     ★ 나머지에 F키를 억지로 배정하면 브라우저 기능을 빼앗는다. 그것이 더 나쁘다.
//     → ★ 자주 쓰는 넷에만 F키를 주고, 나머지는 Alt 전용으로 둔다. 그 사실을 화면에 적는다.
// =============================================================================

import { useEffect, useRef } from 'react';

export interface Shortcut {
  /** 화면에 표기할 조합키. 예: 'Alt+S' */
  combo: string;
  /** 보조 F키. 없으면 null (안전한 F키가 넷뿐이라 전부에 줄 수 없다) */
  fkey: string | null;
  /** 화면에 보여줄 설명 */
  label: string;
  /** 지금 쓸 수 있는가. false 면 눌러도 아무 일도 없고 목록에도 안 나온다 */
  when: boolean;
  run: () => void;
}

/** 'Alt+S' → 's' */
function letterOf(combo: string): string {
  const parts = combo.split('+');
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

/**
 * 전역 단축키를 건다.
 *
 * ★ document 에 건다. 입력창에 포커스가 있어도 동작해야 하기 때문이다.
 *   ★★ 안전한 이유는 파일 헤더에 있다 — Alt 조합은 문자를 만들지 않는다.
 *
 * ★ shortcuts 가 매 렌더 새 배열이어도 리스너를 다시 걸지 않는다.
 *   ★ ref 로 최신 값을 읽는다. 리스너를 매번 다시 걸면 키 입력 중에 유실될 수 있다.
 */
export function useShortcuts(shortcuts: Shortcut[]): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ★ IME 조합 중에는 아무것도 하지 않는다.
      //   ★ 한글 조합 중 Alt 가 눌리는 경우를 방어한다. 미완성 문자가 확정될 수 있다.
      if (e.isComposing) return;
      // ★ Ctrl / Meta 가 함께 눌린 조합은 우리 것이 아니다. 브라우저에 넘긴다
      if (e.ctrlKey || e.metaKey) return;

      const isF = /^F([2-9]|1[0-2])$/.test(e.key);
      if (!e.altKey && !isF) return;

      for (const s of ref.current) {
        if (!s.when) continue;
        const hitAlt = e.altKey && !isF && e.key.toLowerCase() === letterOf(s.combo);
        const hitF = isF && s.fkey !== null && e.key === s.fkey;
        if (!hitAlt && !hitF) continue;
        // ★ 브라우저 기본 동작을 막는다. 우리가 처리한 키다
        e.preventDefault();
        e.stopPropagation();
        s.run();
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * ★ Esc 로 채팅 입력에 포커스를 되돌린다.
 *
 * ★★ 왜 필요한가 — 마우스 없이 돌아가야 한다는 요구의 절반이 이것이다.
 *   ★ 버튼을 단축키로 누르면 포커스가 그 버튼으로 갈 수 있고,
 *     ★ 확인창을 닫으면 포커스가 사라진다.
 *   ★ 그 상태에서 정답을 치면 아무 데도 들어가지 않는다. **치명적이다.**
 *
 * ★ Esc 는 단독 키지만 **문자를 만들지 않으므로** 채팅 입력을 방해하지 않는다.
 *   ★ 그것이 단독 키 금지 규칙의 유일한 예외인 근거다.
 */
export function useFocusChatOnEscape(inputRef: React.RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.isComposing) return;
      // ★ 이미 입력창에 있으면 아무것도 하지 않는다 (다른 핸들러가 처리하게 둔다)
      if (document.activeElement === inputRef.current) return;
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inputRef]);
}
