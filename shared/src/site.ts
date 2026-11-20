// =============================================================================
// ★★★ R109 — 두 자리(공개 · 베타) — "지인 전용" 정본 목록 한 곳
//
// 찬종 2026-11-19: "저작권/상업적 이용이 어려운 것들은 전부 지인용 자리로 보내. 저작권 표기 같은 건 지인용/공개용 둘 다 반영해."
//   서버 하나 · DB 하나 · 주소만 둘. 공개 자리(PUBLIC_HOSTNAME) · 지인 자리(FRIEND_HOSTNAME — 화면 말은 "베타").
//   기록(판 · 답 · 경험 · 포인트 · 전적 · 업적 · 제보)은 자리와 상관없이 같은 계정에 쌓인다.
//
// | 무엇 | 까닭 | 가르는 기준 |
// |---|---|---|
// | 특별 이모티콘 테마(치이카와) | 캐릭터 저작권 | emoji_themes.restricted (0039) |
// | 노래 맞히기(방식 song · 미니게임 song · songyear) | Apple 미리듣기 · 앨범 표지 | 게임 단위 — 아래 FRIEND_ONLY_MODES · FRIEND_ONLY_MINIGAMES |
// | 제조사 상품 그림을 쓰는 항목(얼마게요 · 빅맥지수) | 허락받지 않은 상품 그림 | 그림 단위 — minigame_images.license = FRIEND_ONLY_IMAGE_LICENSE |
// | 항목 id 를 적어 둔 것 | (나중에 — 누가 내려 달라고 할 때) | FRIEND_ONLY_ITEM_IDS(지금 비어 있음) |
//   · 공개 자리에서 한 게임의 남는 항목이 PUBLIC_MIN_ITEMS 보다 적으면 그 게임을 공개 목록에서 숨긴다(숫자는 서버가 센다).
//   · 여기에 없는 것은 공개다(사진 · 어느 쪽 · 얼마나 · 사진 연도 · OX · 캐치마인드 · 라이어 · 이모지 · 일반 문항).
// 문서 표: docs/18-MINIGAME-DATA.md "지인 전용" · docs/01 자리 규칙
// =============================================================================

import type { RoomMode } from './liar.js';
import type { MinigameKey } from './minigame.js';

export type Site = 'public' | 'friend';

export function isSite(v: unknown): v is Site {
  return v === 'public' || v === 'friend';
}

/** 방식 단위 — 지인 방에서만 */
export const FRIEND_ONLY_MODES: readonly RoomMode[] = ['song'];

/** 미니게임 단위 — 지인 방에서만 */
export const FRIEND_ONLY_MINIGAMES: readonly MinigameKey[] = ['song', 'songyear'];

/** 그림 단위 — 이 라이선스 값의 그림 · 그 그림을 쓰는 항목은 지인 방에서만 */
export const FRIEND_ONLY_IMAGE_LICENSE = 'product-page';

/**
 * 항목 단위 — 여기 적은 minigame_items.item_id 는 지인 방에서만(지금 비어 있음).
 *   찬종 2026-11-20: 사진 속 살아 있는 사람(G106 · 9항목)은 "그대로 둔다". 누가 내려 달라고 하면 id 를 여기에 적는다.
 */
export const FRIEND_ONLY_ITEM_IDS: readonly string[] = [];

/**
 * 공개 자리에서 남는 항목이 이보다 적으면 그 퀴즈류 미니게임을 공개 목록에서 숨긴다.
 *   ★ 판단(R109): 판 수(5)로 재면 얼마게요(297 중 남는 9)가 걸리지 않는다 — 9개면 두 판째부터 본 문항뿐이다.
 *     주제 세트 게임의 최소 항목 수(TOPIC_MIN_ITEMS 20)와 같은 값을 쓴다.
 */
export const PUBLIC_MIN_ITEMS = 20;

/** 자리별로 숨기는 것 — 서버가 세어 화면에 보낸다(/api/site · 방 스냅샷) */
export interface SiteHidden {
  modes: RoomMode[];
  minigames: MinigameKey[];
}

export const NO_SITE_HIDDEN: SiteHidden = { modes: [], minigames: [] };

/** 화면 말 — "지인"이라는 말을 드러내지 않는다(찬종 2026-11-19 · 베타) */
export const SITE_TEXT = {
  friendOnlyLogin: '베타 주소는 초대받은 계정만 들어올 수 있어요.',
  friendNoSignup: '베타 주소에서는 가입할 수 없어요. 공개 주소에서 가입해 주세요.',
  modeNotHere: '이 주소에서는 쓸 수 없는 방식이에요.',
  // ★ R111 (D-371) — 닫힌 공개 자리 "준비 중" 한 장. ★ 임시 글(자리만) — 설계 창이 gpt 에게 받아 이 두 줄만 바꾼다
  closedLine: '곧 문을 엽니다.',
  closedYoutube: '유튜브 채널',
} as const;
