// =============================================================================
// 단축키 안내 (Q-56 확정 / R015)
//
// ★ 건우: "단축키 설명도 어딘가에 같이 적어놔."
//
// ★★ 어디에 둘지 — **채팅 입력창 바로 아래**로 판단했다
//   (1) ★ 게임 중 시선과 손이 그곳에 있다. 정답을 치는 자리다
//   (2) ★ 상시 전체 표시는 자리를 먹는다 — 건우의 "스크롤 없이 한 화면" 목표와 충돌한다
//   (3) → ★★ **지금 쓸 수 있는 것만** 한 줄로 보여주고, Alt+G 로 전체를 편다
//
// ★ 상황별로 유효한 것만 보이면 학습이 쉽다. 방장 전용 키가 비방장에게 보이면 혼란스럽다.
// ★★ 화면에는 **조합키를 표기한다** (Q-33 확정). F키는 펼쳤을 때만 함께 보여준다.
// =============================================================================

import type { Shortcut } from './shortcuts.js';

interface Props {
  shortcuts: Shortcut[];
  expanded: boolean;
  onToggle: () => void;
}

export default function ShortcutBar({ shortcuts, expanded, onToggle }: Props) {
  const usable = shortcuts.filter((s) => s.when);

  return (
    <div className="keybar">
      {expanded ? (
        <>
          <p className="keybar-title">
            단축키{' '}
            <button type="button" className="ghost tiny" onClick={onToggle}>
              닫기
            </button>
          </p>
          <ul className="keylist">
            {shortcuts.map((s) => (
              <li key={s.combo} className={s.when ? undefined : 'dim'}>
                <kbd>{s.combo}</kbd>
                {/* ★ F키는 안전한 넷(F2/F4/F8/F9)에만 있다. 없으면 표기하지 않는다 */}
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
              {/* ★★ 이것이 "마우스 없이 돌아간다" 의 절반이다.
                  ★ 버튼을 누른 뒤 포커스가 거기 남으면 정답을 쳐도 들어가지 않는다 */}
              <span className="keylabel">입력창으로 돌아가기</span>
            </li>
          </ul>
          <p className="note dim">
            ★ 단축키는 전부 <kbd>Alt</kbd> 조합입니다. 그래야 정답을 치는 중에 방해하지
            않습니다. ★ F키는 브라우저 기능과 겹치지 않는 넷(F2·F4·F8·F9)에만 있습니다.
          </p>
        </>
      ) : (
        <p className="keybar-line dim">
          {usable.slice(0, 3).map((s) => (
            <span key={s.combo} className="keyhint">
              <kbd>{s.combo}</kbd> {s.label}
            </span>
          ))}
          <button type="button" className="ghost tiny" onClick={onToggle}>
            단축키 전체
          </button>
        </p>
      )}
    </div>
  );
}
