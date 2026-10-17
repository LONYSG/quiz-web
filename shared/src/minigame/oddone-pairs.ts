// =============================================================================
// ★★ 다른 하나 찾기 — 비슷한 이모지 쌍 (R053 · D-241)
//
// ★ 그림은 Twemoji SVG(/emoji/<code>.svg — 서버가 낸다) — 기기 글꼴과 무관하게 모두에게 같은 그림.
// ★ 규칙: **색만 다른 쌍 금지**(색각) — 모양(눈 · 입 · 바늘 · 방향 · 물체)이 달라야 한다. diff 칸에 무엇이 다른지 적는다.
//   easy(1~2판) — 다른 물건 · hard(3~5판) — 얼굴 표정 · 시계 바늘 · 방향 · 달 모양처럼 비슷한 것.
// ★ 단위 검사(r053.test.ts)가 개수(≥ 24) · 그림 파일 존재 · diff 가 'color' 가 아님 · 쌍 겹침 없음을 본다.
// =============================================================================

export interface OddPair {
  /** 여럿 — Twemoji 코드 */
  base: string;
  /** 하나 — Twemoji 코드 */
  odd: string;
  level: 'easy' | 'hard';
  /** 무엇이 다른가(모양) — 색만 다르면 안 된다 */
  diff: string;
}

export const ODD_PAIRS: readonly OddPair[] = [
  // easy — 다른 물건
  { base: '1f436', odd: '1f431', level: 'easy', diff: '개 · 고양이 얼굴' },
  { base: '1f34e', odd: '1f34c', level: 'easy', diff: '사과 · 바나나 모양' },
  { base: '1f697', odd: '1f6b2', level: 'easy', diff: '자동차 · 자전거' },
  { base: '1f319', odd: '2b50', level: 'easy', diff: '초승달 · 별' },
  { base: '1f41f', odd: '1f422', level: 'easy', diff: '물고기 · 거북' },
  { base: '1f355', odd: '1f354', level: 'easy', diff: '피자 · 햄버거' },
  { base: '1f332', odd: '1f335', level: 'easy', diff: '나무 · 선인장' },
  { base: '1f388', odd: '1f381', level: 'easy', diff: '풍선 · 선물 상자' },
  { base: '1f438', odd: '1f435', level: 'easy', diff: '개구리 · 원숭이' },
  { base: '1f369', odd: '1f36a', level: 'easy', diff: '도넛(구멍) · 쿠키' },
  { base: '1f680', odd: '1f681', level: 'easy', diff: '로켓 · 헬리콥터' },
  { base: '1f40c', odd: '1f41b', level: 'easy', diff: '달팽이 · 애벌레' },
  // hard — 비슷한 모양
  { base: '1f600', odd: '1f603', level: 'hard', diff: '눈 — 둥근 눈 · 큰 눈' },
  { base: '1f601', odd: '1f606', level: 'hard', diff: '눈 — 웃는 눈 · 감은 눈(><)' },
  { base: '1f642', odd: '1f643', level: 'hard', diff: '위아래 뒤집힘' },
  { base: '1f550', odd: '1f551', level: 'hard', diff: '시계 바늘 1시 · 2시' },
  { base: '1f610', odd: '1f611', level: 'hard', diff: '눈 — 점 · 선' },
  { base: '1f63a', odd: '1f638', level: 'hard', diff: '고양이 눈 — 둥근 눈 · 웃는 눈' },
  { base: '1f512', odd: '1f513', level: 'hard', diff: '자물쇠 고리 — 닫힘 · 열림' },
  { base: '1f44d', odd: '1f44e', level: 'hard', diff: '엄지 — 위 · 아래' },
  { base: '1f311', odd: '1f312', level: 'hard', diff: '달 — 그믐 · 초승' },
  { base: '1f315', odd: '1f316', level: 'hard', diff: '달 — 보름 · 하현' },
  { base: '1f446', odd: '1f447', level: 'hard', diff: '손가락 — 위 · 아래' },
  { base: '1f509', odd: '1f50a', level: 'hard', diff: '스피커 소리 물결 개수' },
  { base: '23e9', odd: '23ea', level: 'hard', diff: '화살표 방향 — 앞 · 뒤' },
  { base: '1f62e', odd: '1f62f', level: 'hard', diff: '입 · 눈썹' },
  { base: '1f31e', odd: '1f31d', level: 'hard', diff: '해(햇살) · 보름달 얼굴' },
];
