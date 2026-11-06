// =============================================================================
// ★★ R073 (D-318) — 😊 안내 카드: 이모티콘 창을 **열 때마다** 창 맨 위에 작은 카드(다시 보지 않음 체크 전까지)
//
// ★ 찬종 2026-11-05: "😊 버튼을 누르면 안내 팝업이 항상(다시 보지 않음 체크 후 닫으면 그 계정은 안 뜸) ·
//   PC 는 어떤 키가 즉발이고 어떻게 하면 입력창에 들어가는지 안내".
// ★ 체크 후 [닫기] = 계정 플래그 emojiHelpDismissed(prefs) · 체크 없이 닫기 = 다음에 또.
// ★ 첫 뽑기 가이드(D-290 EmojiGuide)는 이 카드로 합쳤다 — 첫 뽑기 뒤 포인트샵을 닫으면 😊 창이 열리며 이 카드가 보인다.
// ★ ⓘ 이모티콘 탭 [안내 다시 보기] · 첫 안내 투어 ④ 는 openEmojiHelp() — 다시 보지 않음이어도 한 번 보인다.
// ★ 문구: 360 에서 한 줄 ≤22자(모바일) · PC 는 창 폭 440 안 한 줄. 같은 문구를 ⓘ 이모티콘 탭이 쓴다(EMOJI_HELP_LINES).
// ★★ R074 (D-321 라 · 찬종 11-05 "이모티콘 등록은 설명이 좀 더 친절해야 — 다들 왜 이렇게 어려워하지") — 카드를 **그림 중심**으로:
//   움직이는 그림(이모티콘이 화살표를 따라 1번 자리로 · CSS 애니메이션) + 글 2줄 + 한 줄(PC "우클릭으로도 돼요" · 모바일 "길게 눌러 떼면 메뉴") ·
//   [시연 보기](😊 창 자동 시연을 다시) · ☐ 다시 보지 않음 · 닫기. ⓘ 이모티콘 탭은 긴 줄(EMOJI_HELP_LINES) + 이 한 줄.
// ★★ R075 (D-324 · 찬종 11-06 "alt+1~0 도 라고만 적으니까 뭔 말인지 몰라. 단축키는 어떠한 키라고 제대로 말을 해야지") —
//   키는 "어떤 키를 어떻게" 로 적는다("Alt 누른 채 숫자 1~0" · "Shift 누른 채 클릭") — "Alt+1~0" · "1~0 도" 처럼 줄이지 않는다.
//   카드 PC = "누르면 바로 보내요" / "Alt 누른 채 숫자 1~0 = 그 번호 자리 보내기" (+ 우클릭 한 줄) · ⓘ 탭 PC 긴 줄 다섯 · 모바일 문구는 그대로(키보드 없음).
// =============================================================================

import { useState } from 'react';
import { openPopup } from './popup.js';
import { getFlag, setFlag } from './accountFlags.js';

/** ⓘ 이모티콘 탭의 긴 줄(카드는 아래 EMOJI_HELP_CARD 2줄 + EMOJI_HELP_EXTRA 한 줄) */
export const EMOJI_HELP_LINES = {
  pc: [
    '누르면 바로 보내요',
    '키보드: Alt 누른 채 숫자 1~0(위 자리 번호)로도 보내요',
    '끌어서 1~0 자리에 놓으면 그 번호가 단축키',
    '채팅창에 놓기 · Shift 누른 채 클릭 = 입력창에 넣기',
    "창 위 '입력창에 넣기'로 바꾸면 Alt+숫자도 입력창에 들어가요",
  ],
  mobile: ['누르면 바로 보내요', '길게 눌러 1~0 자리로 끌면 단축키', '채팅창에 놓으면 입력창에 들어가요'],
} as const;
/** ★ R074 — 카드 글 2줄 */
export const EMOJI_HELP_CARD = {
  pc: ['누르면 바로 보내요', 'Alt 누른 채 숫자 1~0 = 그 번호 자리 보내기'],
  mobile: ['누르면 바로 보내요', '길게 눌러 1~0 자리로 끌면 단축키'],
} as const;
/** ★ R074 — 끌기 말고도 되는 길 한 줄(카드 · ⓘ 탭) */
export const EMOJI_HELP_EXTRA = { pc: '우클릭으로도 돼요(자리 메뉴)', mobile: '길게 눌러 떼면 자리 메뉴' } as const;

let forceNext = false;
let forceDemo = false;
/** 다음에 창이 열릴 때 카드를 보일까(다시 보지 않음이 아니거나 · 억지로 연 것) — 한 번 읽으면 억지는 풀린다 */
export function takeHelpWanted(): boolean {
  const want = forceNext || !getFlag('emojiHelpDismissed');
  forceNext = false;
  return want;
}
/** ★ R074 (D-321 가) — 다음에 창이 열릴 때 자동 시연을 할까(처음 = emojiDemoSeen 없음 · 투어 ④ 는 억지로) — 한 번 읽으면 억지는 풀린다 */
export function takeDemoWanted(): boolean {
  const want = forceDemo || !getFlag('emojiDemoSeen');
  forceDemo = false;
  return want;
}
/** 😊 창을 열고 카드를 보인다(ⓘ 다시 보기 · 투어 ④ · 첫 뽑기 뒤) — 😊 이 없는 화면이면 아무 일 없음(false) · demo = 시연도 억지로 */
export function openEmojiHelp(force = true, demo = false): boolean {
  if (!document.querySelector('.emoji-picker')) return false;
  if (force) forceNext = true;
  if (demo) forceDemo = true;
  openPopup('emoji');
  return true;
}
/** 다음에 창이 열리면(사람이 😊 을 눌러도) 카드를 한 번 보인다 — 투어 ③ · ★ R074 demo = 시연도 */
export function armEmojiHelp(on = true, demo = on): void {
  forceNext = on;
  forceDemo = demo;
}
/** 카드가 닫혔다(투어가 듣는다) */
export const EMOJI_HELP_CLOSED = 'qw:emoji-help-closed';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export default function EmojiHelpCard({ mobile, onClose, onDemo }: { mobile: boolean; onClose: () => void; onDemo?: () => void }) {
  const [never, setNever] = useState(false);
  const lines = mobile ? EMOJI_HELP_CARD.mobile : EMOJI_HELP_CARD.pc;
  const close = () => {
    if (never) setFlag('emojiHelpDismissed');
    onClose();
    window.dispatchEvent(new CustomEvent(EMOJI_HELP_CLOSED, { detail: { never } }));
  };
  const n = mobile ? 5 : 10;
  return (
    <div className="emoji-help" role="note" aria-label="이모티콘 안내" data-emoji-help>
      {/* ★ R074 (D-321 라) — 움직이는 그림: 목록의 이모티콘(☺)이 화살표를 따라 1번 자리로 날아가 들어간다(2.4초 반복 · CSS) */}
      <svg className="emoji-help-art moving" viewBox={`0 0 ${n * 26 + 70} 44`} aria-hidden="true" data-emoji-help-art>
        <circle cx={18} cy={14} r={11} className="eh-pick ghost-src" />
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
        {/* 날아가는 이모티콘 — 손가락과 함께 */}
        <g className="eh-fly">
          <circle cx={18} cy={14} r={10} className="eh-pick" />
          <text x={18} y={19} textAnchor="middle" className="eh-face">
            ☺
          </text>
          <text x={26} y={30} textAnchor="middle" className="eh-hand">
            ☝
          </text>
        </g>
      </svg>
      <ul className="emoji-help-lines">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
        <li className="emoji-help-extra" data-emoji-help-extra>
          {mobile ? EMOJI_HELP_EXTRA.mobile : EMOJI_HELP_EXTRA.pc}
        </li>
      </ul>
      <div className="emoji-help-actions">
        {onDemo && (
          <button type="button" className="ghost tiny" data-emoji-help-demo onClick={onDemo}>
            시연 보기
          </button>
        )}
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
