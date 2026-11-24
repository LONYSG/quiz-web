// =============================================================================
// ★★★ R117 — 방 종류 셋의 이름 · 아이콘 · 색 클래스(목록 탭 · 방 만들기 · 방 안 머리 · 모드 바꾸기가 같이 쓴다)
//   색은 styles.css 의 토큰 --kind-quiz · --kind-draw · --kind-liar(파스텔 · 밤) — 클래스 k-<kind> 가 --kc 로 잇는다.
// =============================================================================

import { Eye, MessageCircleQuestion, Pencil, type LucideIcon } from 'lucide-react';
import type { DifficultyLevel, RoomKind } from '@quiz/shared';

export const KIND_LABEL: Record<RoomKind, string> = { quiz: '퀴즈', draw: '캐치마인드', liar: '라이어' };
export const KIND_ICON: Record<RoomKind, LucideIcon> = { quiz: MessageCircleQuestion, draw: Pencil, liar: Eye };
export const LEVEL_LABEL: Record<DifficultyLevel, string> = { beginner: '초급', intermediate: '중급', advanced: '고급' };

/** 바꾸면 달라지는 것 한 줄(모드 바꾸기 창) */
export const KIND_NOTE: Record<RoomKind, string> = {
  quiz: '문제를 보고 채팅으로 먼저 맞히기',
  draw: '돌아가며 그림 · 채팅으로 맞히기',
  liar: '라이어 1명 · 한마디씩 → 투표',
};
