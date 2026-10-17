// =============================================================================
// ★★★ 퀴즈류 미니게임 공통 (R052 · D-239) — 얼마게요 · 빅맥지수 · 사진 이름 맞히기 · 얼마나 될까 · 어느 쪽?
//
// ★ 찬종: "퀴즈류 게임은 경험 해본것과 아닌것이 차이가 많이 나니까 한번만 나타나게 해야함." ·
//   "연습 자체가 스포가 되는 게임들은 더미 데이터로 넣고 잘 돌아가는지만 확인할게."
// ★ 문항 = 라운드 하나. 공개 → 입력 → 정답 공개. 문항 선정은 01 12장 3단계(아무도 안 본 것 → 일부만 본 것 · 본 사람이 적은 순 → 모두 본 것은 제외).
//   문항이 모자라면 그 미니게임을 건너뛴다(엔진이 다른 미니게임을 고른다). 경험한 사람은 그 문항 점수 0.
// ★ 이 파일은 순수 함수만 — 서버(선정 · 채점)와 화면(표시)이 같이 쓴다.
// =============================================================================

import { seededRandom } from '../balance.js';

export type QuizMinigameKey = 'price' | 'worldprice' | 'photo' | 'estimate' | 'which';
export const QUIZ_MINIGAME_KEYS: readonly QuizMinigameKey[] = ['price', 'worldprice', 'photo', 'estimate', 'which'];

/** 한 미니게임의 문항 수 · 문항당 입력 시간(ms) · 정답 공개(ms) · 문항 사이 준비(ms) */
export const QUIZ_SPEC: Record<QuizMinigameKey, { items: number; playMs: number; revealMs: number; readyMs: number }> = {
  price: { items: 5, playMs: 12_000, revealMs: 3_000, readyMs: 1_500 },
  worldprice: { items: 5, playMs: 12_000, revealMs: 3_000, readyMs: 1_500 },
  photo: { items: 5, playMs: 20_000, revealMs: 3_000, readyMs: 1_500 },
  estimate: { items: 5, playMs: 12_000, revealMs: 3_000, readyMs: 1_500 },
  which: { items: 10, playMs: 6_000, revealMs: 1_500, readyMs: 200 },
};
/** 연습 판(골라 하기) 문항 수 — 더미 */
export const QUIZ_PRACTICE_ITEMS = 3;
/** 사진 — 확대 · 모자이크가 풀리는 시간 */
export const PHOTO_REVEAL_MS = 15_000;
/** 얼마게요 — 가격 기준일이 이보다 오래되면 출제하지 않는다 */
export const PRICE_MAX_AGE_DAYS = 365;

/** ★ 비율 오차 |ln(입력 / 정답)| — 2배 크게 = 2배 작게 · 0 이 완벽. 입력이 0 이하면 Infinity */
export function ratioError(guess: number, answer: number): number {
  if (!(guess > 0) || !(answer > 0)) return Infinity;
  return Math.abs(Math.log(guess / answer));
}

/** 정답 대비 % (부호) — 12,000 / 10,000 → +20 */
export function pctOff(guess: number, answer: number): number {
  return (guess / answer - 1) * 100;
}

/** 원 단위 쉼표 */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

/** 숫자 입력 글 → 숫자 (쉼표 · 공백 · 단위 글자 무시 · 소수 허용). 안 되면 null. allowZero — 0 도 받는다(평균의 2/3) */
export function parseNumberInput(s: string, allowZero = false): number | null {
  const t = s.replace(/[,\s]/g, '').replace(/[^\d.]/g, '');
  if (!t || (t.match(/\./g)?.length ?? 0) > 1) return null;
  const v = Number(t);
  return Number.isFinite(v) && (v > 0 || (allowZero && v === 0)) ? v : null;
}

/** 입력칸 표시 — 정수 부분에 쉼표 (소수점 뒤는 그대로) */
export function formatNumberInput(s: string, allowDecimal: boolean): string {
  let t = s.replace(/[^\d.]/g, '');
  if (!allowDecimal) t = t.replace(/\./g, '');
  const [i, ...rest] = t.split('.');
  const int = (i ?? '').replace(/^0+(?=\d)/, '');
  const withComma = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${withComma}.${rest.join('').slice(0, 3)}` : withComma;
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★ 문항 선정 — 01 12장 3단계 (퀴즈 출제와 같은 선)
//   1단계: 참가자 아무도 경험하지 않은 문항 · 2단계: 일부만 경험(경험한 사람이 적은 문항부터) · 3단계(퀴즈의 전원 경험 허용)는 쓰지 않는다 — 모두 본 문항은 제외.
//   모자라면 null → 그 미니게임을 건너뛴다.
// ─────────────────────────────────────────────────────────────────────────────
export interface QuizPick<T> {
  items: T[];
  /** 문항 id → 이미 본 참가자 */
  experiencedBy: Map<string, string[]>;
  stage1: number;
  stage2: number;
}

export function pickQuizItems<T extends { id: string }>(
  pool: readonly T[],
  participants: readonly string[],
  experienced: (accountId: string, itemId: string) => boolean,
  n: number,
  seed: number,
): QuizPick<T> | null {
  const rnd = seededRandom((seed ^ 0x51e7) >>> 0);
  const scored = pool.map((it) => {
    const who = participants.filter((a) => experienced(a, it.id));
    return { it, who, r: rnd() };
  });
  const ok = scored.filter((x) => participants.length === 0 || x.who.length < participants.length);
  ok.sort((a, b) => a.who.length - b.who.length || a.r - b.r);
  if (ok.length < n) return null;
  const chosen = ok.slice(0, n);
  // 고른 뒤 순서는 섞는다(본 사람이 많은 문항이 늘 뒤에 오지 않게)
  chosen.sort((a, b) => a.r - b.r);
  return {
    items: chosen.map((x) => x.it),
    experiencedBy: new Map(chosen.filter((x) => x.who.length > 0).map((x) => [x.it.id, x.who])),
    stage1: chosen.filter((x) => x.who.length === 0).length,
    stage2: chosen.filter((x) => x.who.length > 0).length,
  };
}

/** 얼마게요 — 가격 기준일이 1년 안인가 */
export function priceFresh(priceAsOf: string, nowMs: number): boolean {
  const t = Date.parse(`${priceAsOf}T00:00:00Z`);
  return Number.isFinite(t) && nowMs - t <= PRICE_MAX_AGE_DAYS * 86_400_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// 빅맥지수 — 주요국 · 유로 지역
// ─────────────────────────────────────────────────────────────────────────────
/** 결과 표에서 강조하는 주요국 (브리핑 확정) */
export const WORLDPRICE_MAJOR: readonly string[] = ['US', 'JP', 'CN', 'GB', 'DE', 'FR', 'IN', 'BR', 'AU', 'CA'];
/** EU 는 나라가 아니다 — 표에 "유로 지역" 한 줄 · 목표 나라로 내지 않는다(설계 판단) */
export function countryLabel(cc: string, countryKo: string): string {
  return cc === 'EU' ? '유로 지역' : countryKo;
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ 연습 판 더미 — 누가 봐도 가짜(스포 방지 · DB 를 보지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
export const QUIZ_DUMMY = {
  price: [
    { id: 'dummy-price-1', name: '연습용 상품 A', brand: '연습 브랜드', category: '기타', priceKrw: 12_345, note: '연습용 가짜 가격이에요.' },
    { id: 'dummy-price-2', name: '연습용 상품 B', brand: '연습 브랜드', category: '기타', priceKrw: 98_765, note: '연습용 가짜 가격이에요.' },
    { id: 'dummy-price-3', name: '연습용 상품 C', brand: '연습 브랜드', category: '기타', priceKrw: 1_234_567, note: '연습용 가짜 가격이에요.' },
  ],
  worldprice: [
    {
      id: 'dummy-worldprice-1',
      productId: 'dummy',
      nameKo: '연습용 햄버거',
      unit: '1개',
      targetCc: 'XB',
      shownCc: ['KR', 'XA', 'XC'],
      rows: [
        { cc: 'KR', countryKo: '한국', localPrice: 5000, currency: 'KRW', krw: 5000 },
        { cc: 'XA', countryKo: '가나라(연습)', localPrice: 3, currency: 'XAA', krw: 3000 },
        { cc: 'XB', countryKo: '나나라(연습)', localPrice: 8, currency: 'XBB', krw: 8000 },
        { cc: 'XC', countryKo: '다나라(연습)', localPrice: 6, currency: 'XCC', krw: 6000 },
        { cc: 'XD', countryKo: '라나라(연습)', localPrice: 2, currency: 'XDD', krw: 2000 },
      ],
      fxAsOf: '2000-01-01',
    },
  ],
  photo: [
    { id: 'dummy-photo-1', answer: '동그라미', altAnswers: ['원'], revealMode: 'zoom', explanation: '연습용 그림이에요.' },
    { id: 'dummy-photo-2', answer: '세모', altAnswers: ['삼각형'], revealMode: 'mosaic', explanation: '연습용 그림이에요.' },
    { id: 'dummy-photo-3', answer: '네모', altAnswers: ['사각형'], revealMode: 'plain', explanation: '연습용 그림이에요.' },
  ],
  estimate: [
    { id: 'dummy-estimate-1', question: '연습 문제 — 연습용 상자의 무게는?', value: 42, unit: 'kg', displayDecimals: 0, note: null, explanation: '연습용 가짜 값이에요.' },
    { id: 'dummy-estimate-2', question: '연습 문제 — 연습용 막대의 길이는?', value: 3.5, unit: 'm', displayDecimals: 1, note: null, explanation: '연습용 가짜 값이에요.' },
    { id: 'dummy-estimate-3', question: '연습 문제 — 연습 마을의 인구는?', value: 12_000, unit: '명', displayDecimals: 0, note: null, explanation: '연습용 가짜 값이에요.' },
  ],
  which: [
    { id: 'dummy-which-1', kind: 'bigger', stem: '연습 — 둘 중 더 큰 수는?', a: { label: '연습 A (7)', value: 7 }, b: { label: '연습 B (3)', value: 3 }, answer: 'a', unit: '' },
    { id: 'dummy-which-2', kind: 'bigger', stem: '연습 — 둘 중 더 큰 수는?', a: { label: '연습 A (2)', value: 2 }, b: { label: '연습 B (9)', value: 9 }, answer: 'b', unit: '' },
    { id: 'dummy-which-3', kind: 'earlier', stem: '연습 — 둘 중 더 먼저인 해는?', a: { label: '연습 A (1900년)', value: 1900 }, b: { label: '연습 B (2000년)', value: 2000 }, answer: 'a', unit: '년' },
  ],
} as const;
