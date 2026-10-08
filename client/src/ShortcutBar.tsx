// =============================================================================
// 단축키 안내 (Q-56 확정 / R015 → ★ R034 개편)
//
// ★ R034 건우: "단축키는 스킵 투표만 눈에 띄게, 나머지는 접어 둬."
//   → ★ 넘기기 투표 단축키(Alt+S)는 **넘기기 버튼 위에** 붙어 있다 (Question.tsx).
//   → ★ 나머지는 이 버튼 하나로 접어 둔다. 누르거나 Alt+G 로 위로 열리는 작은 창.
//     ★ 위로 여는 창이라 문서 높이를 늘리지 않는다 (한 화면 게이트).
// ★★ 화면에는 조합키를 표기한다 (Q-33 확정). F키는 함께 적는다.
// =============================================================================

import type { Shortcut } from './shortcuts.js';

interface Props {
  shortcuts: Shortcut[];
  expanded: boolean;
  onToggle: () => void;
}

export default function ShortcutBar({ shortcuts, expanded, onToggle }: Props) {
  return (
    <span className="keybar">
      <button
        type="button"
        className="ghost tiny keybar-btn"
        aria-expanded={expanded}
        onClick={onToggle}
        title="단축키 전체 (Alt+G)"
        aria-label="단축키"
      >
        ⌨
      </button>
      {expanded && (
        <div className="keybar-pop" role="dialog" aria-label="단축키">
          <p className="keybar-title">
            단축키{' '}
            <button type="button" className="ghost tiny" onClick={onToggle}>
              닫기
            </button>
          </p>
          <ul className="keylist">
            {shortcuts.filter((s) => !s.hideInList).map((s) => (
              <li key={s.combo} className={s.when ? undefined : 'dim'}>
                <kbd>{s.combo}</kbd>
                {s.fkey && (
                  <>
                    {' '}
                    <span className="dim">또는</span> <kbd>{s.fkey}</kbd>
                  </>
                )}
                <span className="keylabel">{s.label}</span>
                {!s.when && <span className="dim"> (지금은 쓸 수 없음)</span>}
              </li>
            ))}
            <li>
              <kbd>Enter</kbd>
              <span className="keylabel">메시지 전송 / 확인창 확정</span>
            </li>
            <li>
              <kbd>Esc</kbd>
              <span className="keylabel">입력창으로 돌아가기</span>
            </li>
          </ul>
        </div>
      )}
    </span>
  );
}
