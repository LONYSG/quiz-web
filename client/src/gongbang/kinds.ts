// =============================================================================
// ★★★ R117 — 방 종류 셋의 이름 · 아이콘 · 색 클래스(목록 탭 · 방 만들기 · 방 안 머리 · 모드 바꾸기가 같이 쓴다)
//   색은 styles.css 의 토큰 --kind-quiz · --kind-draw · --kind-liar(파스텔 · 밤) — 클래스 k-<kind> 가 --kc 로 잇는다.
// =============================================================================

import { Eye, MessageCircleQuestion, Pencil, type LucideIcon } from 'lucide-react';
import type { DifficultyLevel, RoomKind } from '@quiz/shared';

export const KIND_LABEL: Record<RoomKind, string> = { quiz: '퀴즈', draw: '캐치마인드', liar: '라이어' };
export const KIND_ICON: Record<RoomKind, LucideIcon> = { quiz: MessageCircleQuestion, draw: Pencil, liar: Eye };
export const LEVEL_LABEL: Record<DifficultyLevel, string> = { beginner: '초급', intermediate: '중급', advanced: '고급' };

/**
 * ★★ R123 (찬종 "설명은 간결하게 · 게임을 하다 보면 알게 될 거야 · 설명하는 공간은 '안내' 메뉴에") —
 *   무슨 게임인지 한 줄만(방 설정 · 모드 바꾸기 창이 같이 쓴다). 규칙은 안내(InfoText) 의 게임별 칸으로.
 */
export const GAME_LINE: Record<'quiz' | 'draw' | 'liar' | 'song', string> = {
  quiz: '문제를 보고 가장 먼저 맞혀요',
  draw: '한 사람이 그린 그림을 보고 제시어를 맞혀요',
  liar: '모두 같은 제시어를 받지만 라이어 한 명만 몰라요. 대화로 라이어를 찾아내세요',
  song: '노래를 듣고 제목을 맞혀요',
};

/** 바꾸면 달라지는 것 한 줄(모드 바꾸기 창) — ★ R123 GAME_LINE 과 같은 글 */
export const KIND_NOTE: Record<RoomKind, string> = {
  quiz: GAME_LINE.quiz,
  draw: GAME_LINE.draw,
  liar: GAME_LINE.liar,
};
