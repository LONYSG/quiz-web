// =============================================================================
// ★★★ R109 (D-369) — "출처 · 라이선스" 문구 정본(화면 ⓘ 안내 맨 아래 · docs/22-CREDITS.md 가 이 파일을 가리킨다)
//
// 찬종 2026-11-19: "저작권 표기 같은 건 지인용/공개용 둘 다 반영해." · "캐치마인드 낱말 씨앗은 빼라고. 문제 데이터 라이선스도 없잖아. 전부 ai 창작인데"
//   → 넣는 것 = 의무가 있는 것만(그림 · 이름 · 글꼴 · 사진). 문제 데이터 · 캐치마인드 낱말 · CC0 효과음은 넣지 않는다.
// 확인한 원문(2026-11-20):
//   · Twemoji 그림 — jdecked/twemoji README "Graphics licensed under CC-BY 4.0" · "an 'About' section or footer on a website" 로 표기 받음
//   · emojibase(-data) — node_modules package.json "license": "MIT"
//   · Pretendard — node_modules/pretendard package.json "license": "OFL-1.1"
//   · Apple(베타만) — performance-partners.apple.com/search-api: 미리듣기에 "provided courtesy of iTunes" 표기 · 스토어 배지 링크 가까이 ·
//     "only to promote store content and not for entertainment purposes" — 찬종-확인 10절
//   · 치이카와(베타만) — 공식 지침 문서는 못 열었다(chiikawa-info.jp 403). 정식 상품들의 표기 "© nagano / chiikawa committee" 를 따랐다 — 확인 필요
// =============================================================================

import type { Site } from './site.js';

export interface CreditLine {
  /** 무엇 */
  what: string;
  /** 표기 */
  text: string;
  /** 지인(베타) 자리에서만 */
  friendOnly?: boolean;
}

export const CREDIT_LINES: readonly CreditLine[] = [
  { what: '이모티콘 그림', text: 'Twemoji © Twitter, Inc 및 기여자 · CC BY 4.0' },
  { what: '이모티콘 한국어 이름', text: 'emojibase · MIT' },
  { what: '글꼴', text: 'Pretendard · SIL OFL 1.1' },
  {
    what: '사진',
    text: '사진 게임의 사진은 위키미디어 공용의 자유 이용 사진이며, 사진마다 정답 화면에 찍은 사람과 라이선스를 적습니다.',
  },
  { what: '노래 미리듣기 · 앨범 표지', text: 'provided courtesy of iTunes (Apple)', friendOnly: true },
  { what: '치이카와 이모티콘', text: '© nagano / chiikawa committee', friendOnly: true },
];

export function creditLinesFor(site: Site): CreditLine[] {
  return CREDIT_LINES.filter((l) => site === 'friend' || !l.friendOnly);
}
