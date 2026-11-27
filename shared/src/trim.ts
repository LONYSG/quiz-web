// =============================================================================
// ★★★ R123 — 콘텐츠 줄이기 스위치(찬종 2026-11-27 첫 플레이 피드백 · 지우지 말고 끈다 · 되돌릴 수 있게 · 스위치 한 곳)
//
//   minigameOnly   방식 "미니게임만"을 없앤다 — 방식은 퀴즈 · 노래 둘. 저장된 설정에 미니게임만이 있으면 퀴즈로 읽는다(validateRoomSettings).
//                  옛 판 기록 · 전적 화면은 그대로 보인다(기록을 읽는 쪽은 이 스위치를 보지 않는다).
//   minigamePick   로비 "미니게임 골라 하기"(연습) · 방 설정 "미니게임 고르기" 창을 없앤다 — 미니게임은 퀴즈 중간에 "포함"을 켰을 때만,
//                  나올 미니게임은 고르지 않는다(포함을 켜면 화면이 고를 수 있는 것 전부를 보낸다).
//                  서버의 연습 길(minigame.practice) · 고른 목록 검증은 남겼다 — 검사(ui-check --minigame · 봇 mgquiz)가 그 길로 미니게임 하나씩 시험한다.
//   topicPick      캐치마인드 · 라이어 제시어 주제 고르기를 없앤다 — 전체 주제에서 뽑는다(저장된 고른 주제는 null = 전체로 읽는다).
//   songFilters    노래 연대 · 한국 장르 · "20세기 명곡" 칸을 없앤다 — 분류(한국 · 팝 · J-pop)만 · 곡 풀 = 고른 분류의 전체 연대 · 전체 장르.
//
//   ★ 되돌리기: 값을 false 로 바꾸고 빌드하면 옛 화면 · 옛 규칙이 그대로 돌아온다(코드는 지우지 않았다).
//   ★ 정본은 서버(config.trim = 이 값 · 검사 서버만 TRIM_OFF=1 로 전부 끌 수 있다 — 미니게임만 방식으로 미니게임을 시험하는 검사).
//     화면은 /api/site 의 trim 을 따른다(siteInfo().trim · 못 읽으면 이 값).
// =============================================================================

export const TRIM = {
  minigameOnly: true,
  minigamePick: true,
  topicPick: true,
  songFilters: true,
} as const;

export type TrimFlags = { readonly [K in keyof typeof TRIM]: boolean };
export const NO_TRIM: TrimFlags = { minigameOnly: false, minigamePick: false, topicPick: false, songFilters: false };
