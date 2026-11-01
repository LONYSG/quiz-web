// =============================================================================
// ★★ 다른 하나 찾기 — 비슷한 이모지 쌍 (R053 · D-241)
//
// ★ 그림은 Twemoji SVG(/emoji/<code>.svg — 서버가 낸다) — 기기 글꼴과 무관하게 모두에게 같은 그림.
// ★ 규칙: **색만 다른 쌍 금지**(색각) — 모양(눈 · 입 · 바늘 · 방향 · 물체)이 달라야 한다. diff 칸에 무엇이 다른지 적는다.
//   easy(1판) — 다른 물건 · hard(2~5판) — 얼굴 표정 · 시계 바늘 · 방향 · 달 모양처럼 비슷한 것.
// ★ 단위 검사(r053.test.ts)가 개수(≥ 24 · hard ≥ 25) · 그림 파일 존재 · diff 가 'color' 가 아님 · 쌍 겹침 없음 · 그림 하나가 두 쌍에 안 쓰임(R071 에 더한 쌍)을 본다.
// ★★ R071 (D-315 · 제보 #74 "갑자기 왜 이렇게 쉬워졌냐 · 갈수록 어려워져야") — hard 15 → 28(표정 한 군데 · 달 모양 · 시계 바늘 · 화살표 방향 · 손 모양 · 같은 동물의 얼굴/몸) ·
//   easy 는 1판만(옛 1~2판) · 격자 4·5·6·7·8(옛 4·5·6·6·7).
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
  // ★★ R071 (D-315) — hard 13 더함(그림 하나는 한 쌍에만 · 색만 다른 쌍 없음)
  { base: '1f617', odd: '1f619', level: 'hard', diff: '눈 — 점 눈 · 웃는 눈(입은 같다)' },
  { base: '1f61b', odd: '1f61d', level: 'hard', diff: '눈 — 점 눈 · 꽉 감은 눈(><) (혀는 같다)' },
  { base: '1f612', odd: '1f644', level: 'hard', diff: '눈동자 — 옆으로 흘김 · 위로 굴림' },
  { base: '1f61f', odd: '1f641', level: 'hard', diff: '눈썹 — 걱정 눈썹 있음 · 없음(입 모양 비슷)' },
  { base: '1f62a', odd: '1f634', level: 'hard', diff: '콧물 방울 · zzz (둘 다 감은 눈)' },
  { base: '1f313', odd: '1f317', level: 'hard', diff: '달 — 오른쪽 반 · 왼쪽 반(거울)' },
  { base: '1f553', odd: '1f554', level: 'hard', diff: '시계 바늘 4시 · 5시' },
  { base: '2b06', odd: '2b07', level: 'hard', diff: '화살표 방향 — 위 · 아래' },
  { base: '2196', odd: '2197', level: 'hard', diff: '화살표 방향 — 왼쪽 위 · 오른쪽 위' },
  { base: '1f448', odd: '1f449', level: 'hard', diff: '손가락 방향 — 왼쪽 · 오른쪽' },
  { base: '1f44a', odd: '270a', level: 'hard', diff: '주먹 — 앞으로 내민 주먹 · 위로 든 주먹' },
  { base: '1f42d', odd: '1f401', level: 'hard', diff: '쥐 — 얼굴 · 몸 전체' },
  { base: '1f430', odd: '1f407', level: 'hard', diff: '토끼 — 얼굴 · 몸 전체' },
];
