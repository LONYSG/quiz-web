// =============================================================================
// ★★ R073 (D-318) — 😊 안내 카드: 이모티콘 창을 **열 때마다** 창 맨 위에 작은 카드(다시 보지 않음 체크 전까지)
//
// ★ 찬종 2026-11-05: "😊 버튼을 누르면 안내 팝업이 항상(다시 보지 않음 체크 후 닫으면 그 계정은 안 뜸) ·
//   PC 는 어떤 키가 즉발이고 어떻게 하면 입력창에 들어가는지 안내".
// ★ 체크 후 [닫기] = 계정 플래그 emojiHelpDismissed(prefs) · 체크 없이 닫기 = 다음에 또.
// ★ 첫 뽑기 가이드(D-290 EmojiGuide)는 이 카드로 합쳤다 — 첫 뽑기 뒤 포인트샵을 닫으면 😊 창이 열리며 이 카드가 보인다.
// ★ ⓘ 이모티콘 탭 [안내 다시 보기] · 첫 안내 투어 ④ 는 openEmojiHelp() — 다시 보지 않음이어도 한 번 보인다.
// ★ 문구: 360 에서 한 줄 ≤22자(모바일) · PC 는 창 폭 440 안 한 줄. 같은 문구를 ⓘ 이모티콘 탭이 쓴다(EMOJI_HELP_LINES).
// =============================================================================

import { useState } from 'react';
import { openPopup } from './popup.js';
import { getFlag, setFlag } from './accountFlags.js';

/** 카드 · ⓘ 이모티콘 탭이 같이 쓰는 줄 */
export const EMOJI_HELP_LINES = {
  pc: ['누르면 바로 보내요 · Alt+1~0 도', '끌어서 1~0 자리에 놓으면 단축키', '채팅창에 놓기 · Shift+클릭 = 넣기', "'입력창에 넣기' 땐 Alt도 넣기"],
  mobile: ['누르면 바로 보내요', '길게 눌러 1~0 자리로 끌면 단축키', '채팅창에 놓으면 입력창에 들어가요'],
} as const;

let forceNext = false;
/** 다음에 창이 열릴 때 카드를 보일까(다시 보지 않음이 아니거나 · 억지로 연 것) — 한 번 읽으면 억지는 풀린다 */
export function takeHelpWanted(): boolean {
  const want = forceNext || !getFlag('emojiHelpDismissed');
  forceNext = false;
  return want;
}
/** 😊 창을 열고 카드를 보인다(ⓘ 다시 보기 · 투어 ④ · 첫 뽑기 뒤) — 😊 이 없는 화면이면 아무 일 없음(false) */
export function openEmojiHelp(force = true): boolean {
  if (!document.querySelector('.emoji-picker')) return false;
  if (force) forceNext = true;
  openPopup('emoji');
  return true;
}
/** 다음에 창이 열리면(사람이 😊 을 눌러도) 카드를 한 번 보인다 — 투어 ③ */
export function armEmojiHelp(on = true): void {
  forceNext = on;
}
/** 카드가 닫혔다(투어가 듣는다) */
export const EMOJI_HELP_CLOSED = 'qw:emoji-help-closed';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export default function EmojiHelpCard({ mobile, onClose }: { mobile: boolean; onClose: () => void }) {
  const [never, setNever] = useState(false);
  const lines = mobile ? EMOJI_HELP_LINES.mobile : EMOJI_HELP_LINES.pc;
  const close = () => {
    if (never) setFlag('emojiHelpDismissed');
    onClose();
    window.dispatchEvent(new CustomEvent(EMOJI_HELP_CLOSED, { detail: { never } }));
  };
  const n = mobile ? 5 : 10;
  return (
    <div className="emoji-help" role="note" aria-label="이모티콘 안내" data-emoji-help>
      {/* 작은 그림 — 자리 줄 + 위의 이모티콘을 1번 자리로 끄는 화살표 */}
      <svg className="emoji-help-art" viewBox={`0 0 ${n * 26 + 70} 40`} aria-hidden="true">
        <circle cx={18} cy={14} r={11} className="eh-pick" />
        <text x={18} y={19} textAnchor="middle" className="eh-face">
          ☺
        </text>
        <path d={`M30 12 C 48 2, 62 4, ${70 + 11} 18`} className="eh-arrow" />
        <path d={`M${70 + 5} 15 L ${70 + 11} 19 L ${70 + 13} 12`} className="eh-arrow" />
        {KEYS.slice(0, n).map((k, i) => (
          <g key={k}>
            <rect x={70 + i * 26} y={20} width={22} height={18} rx={5} className={i === 0 ? 'eh-slot on' : 'eh-slot'} />
            <text x={70 + i * 26 + 11} y={33} textAnchor="middle" className={i === 0 ? 'eh-key on' : 'eh-key'}>
              {k}
            </text>
          </g>
        ))}
      </svg>
      <ul className="emoji-help-lines">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="emoji-help-actions">
        <label className="emoji-help-never">
          <input type="checkbox" checked={never} data-emoji-help-never onChange={(e) => setNever(e.target.checked)} /> 다시 보지 않음
        </label>
        <button type="button" className="ghost tiny" data-emoji-help-close onClick={close}>
          닫기
        </button>
      </div>
    </div>
  );
}
