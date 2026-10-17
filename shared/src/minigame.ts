// =============================================================================
// ★★★ 미니게임 공통 규칙 (R050 · D-234 — 찬종 확정 + 설계 판단)
//
// ★ 찬종: "중간 중간 미니게임이 들어가면 재밌을거 같아 … 로비 게임 설정에 미니게임 포함 여부를 체크박스로 … 확장성 고려해.
//   일단은 체험판 느낌으로 상식퀴즈에 껴넣는걸로." · "모든 미니게임은 단판이 아니라 3~5판정도" ·
//   "미니게임 점수가 높아도 상관 없을것 같음 … 사람이 많으면 최대 3위까지도 포인트 줘도될듯."
// ★ 이 파일은 서버(판정 · 점수)와 화면(표시)이 같이 쓰는 **순수 함수**만 둔다. 판정 권한은 서버에만 있다.
//   · 등장 위치(minigameSlots) · 판 순위와 판 점수(rankRound) · 최종 순위(rankFinal) · 보상(minigameReward)
//   · 소수 표시 자리(decimalsForRanking) — 케이크 기다리기(초) · 균형의수호자(%) 둘 다 이 함수 하나로
// ★ 값(보상 · 판 점수 · 등장 간격)은 **상수**다 — 실제로 해 보고 조정한다 (01 "미니게임" 장).
// =============================================================================

/** 미니게임 키. ★ 새 미니게임은 여기에 키를 더하고 server/src/minigame/ 에 모듈 하나 · client 에 화면 하나 */
export type MinigameKey =
  | 'cake'
  | 'balance'
  | 'reaction'
  | 'typing'
  | 'circle'
  | 'angle'
  | 'price'
  | 'worldprice'
  | 'photo'
  | 'estimate'
  | 'which'
  // ★ R053
  | 'minority'
  | 'twothirds'
  | 'oddone'
  | 'gauge'
  // ★ R054
  | 'balloon'
  | 'tap';

export interface MinigameInfo {
  key: MinigameKey;
  /** 화면 이름 (가제) */
  name: string;
  /** 한 줄 설명 (규칙 안내 화면) */
  oneLine: string;
  /** 조작 — PC / 모바일 따로 */
  controlsPc: string;
  controlsMobile: string;
  /** 🤸 피지컬·감각류(반복 허용) / 🧠 퀴즈류(경험 시스템 대상 — R052~) */
  kind: 'physical' | 'quiz';
  /** 판 수 (찬종: 3~5판 · 게임별 예상 시간으로 조절) */
  rounds: number;
  /** 예상 시간(초) — 안내 · 결과 포함 */
  estSec: number;
  /** 값이 작을수록 좋은가(케이크 — 오차) · 클수록 좋은가(균형 — 작은 쪽 %) */
  better: 'low' | 'high';
  /** 표시 단위 */
  unit: '초' | '%' | 'ms' | '°';
  /** ★ R052 — 판 점수 방식: 'rank'(판 순위 점수 — 기본) · 'correct'(맞히면 1점 · 최종 동점은 맞힌 문항 시간 합이 작은 쪽 — 어느 쪽?) */
  scoring?: 'rank' | 'correct';
  /** ★ R053 — 최종 동점 가르기: 'lastRank'(마지막 판 순위 — rank 기본) · 'timeSum'(맞힌 문항 시간 합 — correct 기본) */
  tiebreak?: 'lastRank' | 'timeSum';
  /** ★ R053 — 퀴즈 판 자리에서 뽑히는 최소 참가자 수(골라 하기는 된다 · 안내만). 없으면 1 */
  minPlayers?: number;
  /**
   * ★ R051 — 표의 소수 자리. 없으면 소수 표시 규칙(decimalsForRanking — 1위와 2위가 갈리는 자리 · 최대 maxDecimals).
   *   번개손은 ms 정수(0) 고정.
   */
  fixedDecimals?: number;
  /** 소수 표시 규칙의 최대 자리 (없으면 3 · 각도 2) */
  maxDecimals?: number;
}

/** ★ 순서가 표시 순서다 */
export const MINIGAMES: readonly MinigameInfo[] = [
  {
    key: 'cake',
    name: '케이크 기다리기',
    oneLine: '숫자가 0이 되는 순간 누르세요! 중간부터 숫자와 소리가 사라집니다 — 리듬을 기억하세요',
    controlsPc: 'Space 또는 Enter — 한 번만',
    controlsMobile: '화면을 톡 — 한 번만',
    kind: 'physical',
    rounds: 4,
    estSec: 100,
    better: 'low',
    unit: '초',
  },
  {
    key: 'balance',
    name: '균형의수호자',
    oneLine: '위 · 아래 점을 옮겨 음식을 정확히 반으로 나누세요! 10초',
    controlsPc: '← → 점 옮기기 · ↑ ↓ 위/아래 점 바꾸기 (꾹 누르면 빨라져요) · 마우스로 끌어도 돼요',
    controlsMobile: '두 점을 손가락으로 끌어 옮기세요',
    kind: 'physical',
    rounds: 3,
    estSec: 75,
    better: 'high',
    unit: '%',
  },
  // ★★★ R051 — 미니게임 2차 (피지컬류 넷 · 예상 시간은 안내 3 + 규칙 5 + 판마다(준비 1.5 + 진행 + 결과 4) + 최종 6 + 돌아감 2)
  {
    key: 'reaction',
    name: '번개손',
    oneLine: '화면이 초록으로 바뀌는 순간 누르세요! 3판째부터는 가짜 신호도 — 먼저 누르면 실격',
    controlsPc: 'Space 또는 Enter — 한 번만',
    controlsMobile: '화면을 톡 — 한 번만',
    kind: 'physical',
    rounds: 5,
    estSec: 70,
    better: 'low',
    unit: 'ms',
    fixedDecimals: 0,
  },
  {
    key: 'typing',
    name: '타자',
    oneLine: '보이는 문장을 똑같이 빨리 치세요! 띄어쓰기 · 마침표까지 — 틀린 글자는 지워야 해요',
    controlsPc: '키보드로 입력 — 다 맞게 치면 바로 끝',
    controlsMobile: '입력칸을 눌러 키보드로 — 다 맞게 치면 바로 끝',
    kind: 'physical',
    rounds: 3,
    estSec: 100,
    better: 'low',
    unit: '초',
  },
  {
    key: 'circle',
    name: '완벽한 원',
    oneLine: '한 번에 원을 그리세요! 손을 떼면 끝 — 얼마나 동그란지 % 로',
    controlsPc: '마우스를 누른 채 그리고 떼기',
    controlsMobile: '손가락으로 그리고 떼기',
    kind: 'physical',
    rounds: 3,
    estSec: 60,
    better: 'high',
    unit: '%',
  },
  {
    key: 'angle',
    name: '각도 맞추기',
    oneLine: '눈금 없이 제시된 각도를 만드세요! 10초',
    controlsPc: '← → 0.5°씩 (꾹 누르면 빨라져요) · 마우스로 끌어도 돼요 · Space / Enter 확정',
    controlsMobile: '선 끝을 손가락으로 끌고 확정 버튼',
    kind: 'physical',
    rounds: 3,
    estSec: 60,
    better: 'low',
    unit: '°',
    maxDecimals: 2,
  },
  // ★★★ R052 — 퀴즈류 다섯 (🧠 경험 시스템 대상 · 문항 = 판 · 데이터는 DB minigame_items — 연습은 더미)
  {
    key: 'price',
    name: '얼마게요',
    oneLine: '상품 가격(원)을 맞혀 보세요! 가장 가까운 사람이 1등',
    controlsPc: '숫자 입력 → Enter',
    controlsMobile: '숫자 입력 → 확인',
    kind: 'quiz',
    rounds: 5,
    estSec: 110,
    better: 'low',
    unit: '%',
    fixedDecimals: 1,
  },
  {
    key: 'worldprice',
    name: '빅맥지수',
    oneLine: '한국 · 다른 나라 값을 보고, 그 나라에서는 원화로 얼마일지 맞혀 보세요!',
    controlsPc: '숫자 입력 → Enter',
    controlsMobile: '숫자 입력 → 확인',
    kind: 'quiz',
    rounds: 5,
    estSec: 120,
    better: 'low',
    unit: '%',
    fixedDecimals: 1,
  },
  {
    key: 'photo',
    name: '사진 이름 맞히기',
    oneLine: '조금씩 드러나는 사진 — 이름을 먼저 맞히는 사람이 이겨요! 여러 번 쳐도 돼요',
    controlsPc: '이름 입력 → Enter (틀려도 다시)',
    controlsMobile: '이름 입력 → 확인 (틀려도 다시)',
    kind: 'quiz',
    rounds: 5,
    estSec: 120,
    better: 'low',
    unit: '초',
    fixedDecimals: 1,
  },
  {
    key: 'estimate',
    name: '얼마나 될까',
    oneLine: '무게 · 길이 · 인구 … 숫자를 어림해 보세요! 가장 가까운 사람이 1등',
    controlsPc: '숫자 입력 → Enter',
    controlsMobile: '숫자 입력 → 확인',
    kind: 'quiz',
    rounds: 5,
    estSec: 110,
    better: 'low',
    unit: '%',
    fixedDecimals: 1,
  },
  {
    key: 'which',
    name: '어느 쪽?',
    oneLine: '둘 중 더 큰 것 · 더 먼저인 것 — 10문항 연속! 많이 맞히고, 같으면 빠른 사람',
    controlsPc: '← A · → B (또는 클릭)',
    controlsMobile: '왼쪽 · 오른쪽 톡',
    kind: 'quiz',
    rounds: 10,
    estSec: 100,
    better: 'low',
    unit: 'ms',
    fixedDecimals: 0,
    scoring: 'correct',
  },
  // ★★★ R053 — 미니게임 3차 (데이터 없는 🟢 넷 — 심리전 2 · 관찰 1 · 타이밍 1)
  {
    key: 'minority',
    name: '소수파 게임',
    oneLine: '1~5 중 하나를 고르세요! 가장 적게 고른 숫자를 고른 사람이 이겨요',
    controlsPc: '1 ~ 5 키 또는 클릭 (바꿔도 돼요 — 마지막 선택)',
    controlsMobile: '숫자 카드를 톡 (바꿔도 돼요 — 마지막 선택)',
    kind: 'physical',
    rounds: 5,
    estSec: 80,
    better: 'high',
    unit: '%',
    fixedDecimals: 0,
    scoring: 'correct',
    tiebreak: 'lastRank',
    minPlayers: 3,
  },
  {
    key: 'twothirds',
    name: '평균의 2/3',
    oneLine: '0~100 숫자를 내세요! 모두의 평균 × 2/3 에 가장 가까운 사람이 1등',
    controlsPc: '숫자 입력 → Enter',
    controlsMobile: '숫자 입력 → 확인',
    kind: 'physical',
    rounds: 3,
    estSec: 60,
    better: 'low',
    unit: '%',
  },
  {
    key: 'oddone',
    name: '다른 하나 찾기',
    oneLine: '하나만 다른 그림을 빨리 찾아 누르세요! 틀리면 +2초',
    controlsPc: '마우스로 클릭',
    controlsMobile: '손가락으로 톡',
    kind: 'physical',
    rounds: 5,
    estSec: 90,
    better: 'low',
    unit: '초',
  },
  {
    key: 'gauge',
    name: '게이지 정중앙',
    oneLine: '왔다 갔다 하는 표시를 정가운데에서 멈추세요! 4판부터는 가운데가 가려져요',
    controlsPc: 'Space 또는 Enter — 한 번만',
    controlsMobile: '화면을 톡 — 한 번만',
    kind: 'physical',
    rounds: 5,
    estSec: 70,
    better: 'low',
    unit: '%',
    maxDecimals: 2,
  },
  // ★★★ R054 — 미니게임 4차 (데이터 없는 🟢 둘 — 심리전 · 반응)
  {
    key: 'balloon',
    name: '풍선 불기',
    oneLine: '누르고 있으면 풍선이 커져요 — 터지기 직전에 떼세요! 터지면 0점',
    controlsPc: 'Space 를 누르고 있다가 떼기',
    controlsMobile: '화면을 누르고 있다가 떼기',
    kind: 'physical',
    rounds: 3,
    estSec: 60,
    better: 'high',
    unit: '%',
    maxDecimals: 1,
  },
  {
    key: 'tap',
    name: '연타 10초',
    oneLine: '10초 동안 최대한 많이 누르세요! 꾹 누르기는 안 세요',
    controlsPc: 'Space 연타',
    controlsMobile: '큰 버튼 연타',
    kind: 'physical',
    rounds: 3,
    estSec: 45,
    better: 'high',
    unit: '%',
    fixedDecimals: 0,
  },
];

export const MINIGAME_KEYS: readonly MinigameKey[] = MINIGAMES.map((m) => m.key);

export function minigameInfo(key: MinigameKey): MinigameInfo {
  return MINIGAMES.find((m) => m.key === key)!;
}

export function isMinigameKey(v: unknown): v is MinigameKey {
  return typeof v === 'string' && (MINIGAME_KEYS as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// 등장 (찬종 확정 + 설계 판단 — D-234)
//   ★ Q-110 (가) 확정(찬종 2026-10-17 · R051): 10문제 판은 가운데(5번째 뒤) 1회 · 혼자(참가 1명)는 보상 0 — 아래 두 판단이 그대로 상수가 됐다.
//   켜면 **10문제마다**(10 · 20 · 30 … 번째 문제의 정답 공개 뒤) 1회 · **마지막 문제 뒤에는 없음** · 한 판 상한 10회.
//   문제 수 5~9 는 가운데(ceil(N/2) 번째 뒤) 1회 · 4 이하 없음.
//   ★ 판단(브리핑의 빈틈): 10문제 판은 "10번째 = 마지막" 이라 위 규칙으로는 0회가 된다(9문제 판은 1회인데).
//     → **10 규칙으로 한 번도 없고 문제 수가 5 이상이면 가운데 1회**로 메운다 (10문제 → 5번째 뒤).
// ─────────────────────────────────────────────────────────────────────────────
export const MINIGAME_EVERY = 10;
export const MINIGAME_MAX_PER_GAME = 10;
export const MINIGAME_MIN_QUESTIONS = 5;

/** 이 문제 수의 판에서 미니게임이 들어가는 자리 — "몇 번째 문제의 정답 공개 뒤" (1-based) */
export function minigameSlots(questionCount: number): number[] {
  const out: number[] = [];
  for (let i = MINIGAME_EVERY; i < questionCount && out.length < MINIGAME_MAX_PER_GAME; i += MINIGAME_EVERY) out.push(i);
  if (out.length === 0 && questionCount >= MINIGAME_MIN_QUESTIONS) out.push(Math.ceil(questionCount / 2));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 판 순위 · 판 점수 · 최종 순위 · 보상 (설계 판단 — 상수 · 나중에 조정)
// ─────────────────────────────────────────────────────────────────────────────

export interface RoundEntry {
  accountId: string;
  /** 판정 값 (케이크 = |오차| 초 · 균형 = 작은 쪽 %). 제출하지 않았으면 null — 그 판 꼴찌 */
  value: number | null;
}

export interface RoundRanked extends RoundEntry {
  /** 공동 순위(15,15,12 → 1,1,3). 미제출은 모두 같은 맨 끝 순위 */
  rank: number;
  /** 판 점수 = 참가자 수 − 순위 + 1 (미제출 0) */
  points: number;
}

/**
 * ★ 판 순위. 같은 값은 공동 순위 · 미제출은 맨 끝(공동) · 판 점수 = 참가자 수 − 순위 + 1 (미제출 0).
 *   ★ 값 비교는 **1e-9 이내면 같다**로 본다(부동소수 잡음이 순위를 가르지 않게).
 */
export function rankRound(entries: readonly RoundEntry[], better: 'low' | 'high'): RoundRanked[] {
  const n = entries.length;
  const done = entries.filter((e) => e.value !== null) as (RoundEntry & { value: number })[];
  const none = entries.filter((e) => e.value === null);
  done.sort((a, b) => (better === 'low' ? a.value - b.value : b.value - a.value));
  const out: RoundRanked[] = [];
  let prev: number | null = null;
  let prevRank = 0;
  done.forEach((e, i) => {
    const rank = prev !== null && Math.abs(e.value - prev) < 1e-9 ? prevRank : i + 1;
    prev = e.value;
    prevRank = rank;
    out.push({ ...e, rank, points: n - rank + 1 });
  });
  const lastRank = done.length + 1;
  for (const e of none) out.push({ ...e, rank: lastRank, points: 0 });
  return out;
}

export interface FinalRanked {
  accountId: string;
  total: number;
  rank: number;
  /** 마지막 판의 순위 (동점 가르기) */
  lastRoundRank: number;
}

/**
 * ★ 최종 순위 — 판 점수 합 · 같으면 **마지막 판 순위**가 높은 쪽 · 그래도 같으면 공동.
 */
export function rankFinal(totals: readonly { accountId: string; total: number; lastRoundRank: number }[]): FinalRanked[] {
  const sorted = [...totals].sort((a, b) => b.total - a.total || a.lastRoundRank - b.lastRoundRank);
  const out: FinalRanked[] = [];
  sorted.forEach((t, i) => {
    const p = out[i - 1];
    const tie = p && p.total === t.total && p.lastRoundRank === t.lastRoundRank;
    out.push({ ...t, rank: tie ? p.rank : i + 1 });
  });
  return out;
}

/**
 * ★★ 최종 순위 보상 (퀴즈 1문제 = 1점 기준 · 판 점수와 상점 포인트에 **모두** 들어간다).
 *   참가 2명: 1위 +2 · 3~4명: 1위 +3 · 2위 +1 · 5명 이상: 1위 +3 · 2위 +2 · 3위 +1. 공동 순위는 같은 점수.
 *   ★ 판단: 참가 1명(혼자)은 보상 없음 — 겨룰 사람이 없다 (혼자 미니게임으로 포인트를 쌓지 않게).
 */
export function minigameReward(rank: number, participants: number): number {
  if (participants <= 1) return 0;
  if (participants === 2) return rank === 1 ? 2 : 0;
  if (participants <= 4) return rank === 1 ? 3 : rank === 2 ? 1 : 0;
  return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★ 소수 표시 규칙 (찬종: "소수점 첫째자리까지 반올림하지 말고 … 접전으로 차이가 났다면 그 차이를 소수점까지 표기 …
//   큰 차이라면 소수점 첫째짜리까지만.")
//   → 순위표의 값은 **1위와 2위(공동이 아니면)가 갈리는 자리까지** 보인다. 차이가 크면 첫째 자리 · 접전이면 둘째 · 셋째(최대 셋째).
//     표 전체를 같은 자리 수로. 1위와 2위가 정확히 같으면(공동) 첫째 자리.
// ─────────────────────────────────────────────────────────────────────────────
export const DECIMALS_MIN = 1;
export const DECIMALS_MAX = 3;

/** 반올림해 d 자리 글로 — 0.045 같은 2진 표현 잡음(0.04499…)에 흔들리지 않게 아주 작은 값을 더한다 */
export function fixedRound(v: number, d: number): string {
  const k = 10 ** d;
  return (Math.round((Math.abs(v) + 1e-9) * k) / k).toFixed(d);
}

/** values = 순위 순(1위 먼저)의 값. 미제출(null)은 빼고 준다. max = 최대 자리(R051 — 각도 2) */
export function decimalsForRanking(values: readonly number[], max: number = DECIMALS_MAX): number {
  if (values.length < 2) return DECIMALS_MIN;
  const a = values[0]!;
  const b = values[1]!;
  if (Math.abs(a - b) < 1e-9) return DECIMALS_MIN;
  for (let d = DECIMALS_MIN; d <= max; d += 1) {
    if (fixedRound(a, d) !== fixedRound(b, d) || Math.sign(a) !== Math.sign(b)) return d;
  }
  return max;
}

/** ★ R051 — 이 미니게임의 표 소수 자리 (고정 자리가 있으면 그것 · 아니면 소수 표시 규칙) */
export function decimalsFor(info: Pick<MinigameInfo, 'fixedDecimals' | 'maxDecimals'>, values: readonly number[]): number {
  if (info.fixedDecimals !== undefined) return info.fixedDecimals;
  return decimalsForRanking(values, info.maxDecimals ?? DECIMALS_MAX);
}

/** 값을 d 자리로 (부호 있는 값은 sign=true 면 +/− 를 붙인다) */
export function formatMinigameValue(v: number, d: number, sign = false): string {
  const s = fixedRound(v, d);
  if (!sign) return s;
  if (Number(s) === 0) return `±${s}`;
  return `${v < 0 ? '−' : '+'}${s}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 진행 시각 (서버 tick 이 쓴다 · 화면은 받은 시각으로 그린다)
// ─────────────────────────────────────────────────────────────────────────────
export const MINIGAME_TIMING = {
  /** 깜짝 이벤트 연출 (화면 전환 · 징글) */
  INTRO_MS: 3_000,
  /** 규칙 안내 (그림 + 한 줄 + 조작법) */
  RULES_MS: 5_000,
  /** 판 시작 전 "준비" */
  READY_MS: 1_500,
  /** 판 결과 */
  ROUND_RESULT_MS: 4_000,
  /** 최종 결과 */
  FINAL_MS: 6_000,
  /** 퀴즈로 돌아오는 연출 */
  OUTRO_MS: 2_000,
  /** ★ 제출 도착 여유 — 각자 기기에서 잰 시간이라 네트워크 지연만큼 늦게 도착해도 받는다 */
  LATENCY_GRACE_MS: 1_500,
} as const;

export type MinigamePhase = 'intro' | 'rules' | 'ready' | 'play' | 'roundResult' | 'final' | 'outro';

// ─────────────────────────────────────────────────────────────────────────────
// 케이크 기다리기 판 구성 (설계 판단 · 상수 — 찬종: "1판째는 정속, 10초, 5초쯤부터 페이드아웃 … 5초는 2초 후부터 … 20초는 5초 흐른 뒤부터")
// ─────────────────────────────────────────────────────────────────────────────
export interface CakeRound {
  /** 화면 카운트다운 시작 값(초) */
  durationSec: number;
  /** 배속 — 2 면 화면 10초가 실제 5초 */
  speed: number;
  /** 화면 기준 이 초가 **지나면** 숫자 · 소리를 가린다(0.5초 페이드아웃) */
  hideAfterSec: number;
}
export const CAKE_ROUNDS: readonly CakeRound[] = [
  { durationSec: 10, speed: 1, hideAfterSec: 5 },
  { durationSec: 5, speed: 1, hideAfterSec: 2 },
  { durationSec: 20, speed: 1, hideAfterSec: 5 },
  { durationSec: 10, speed: 2, hideAfterSec: 3 },
];
/** 0초가 지나도 이만큼(실제 시간)은 누를 수 있다 */
export const CAKE_LATE_MS = 3_000;
export const CAKE_FADE_MS = 500;
/** 실제 목표 시각(ms — 판 시작 신호를 받은 때부터) */
export function cakeTargetMs(r: CakeRound): number {
  return (r.durationSec / r.speed) * 1000;
}
/** 판 길이(실제 ms) — 목표 + 늦게 누를 수 있는 시간 */
export function cakePlayMs(r: CakeRound): number {
  return cakeTargetMs(r) + CAKE_LATE_MS;
}

/** 균형의수호자 — 판마다 10초 */
export const BALANCE_PLAY_MS = 10_000;
