// =============================================================================
// 게임 설정 검증 (guide 7절 / docs/01-GAME-RULES.md 4장)
//
// ★ 왜 shared 에 두는가
//   guide 44절은 "서버가 모든 액션의 권한과 상태를 다시 검사한다"를 요구한다.
//   그런데 클라이언트도 입력 즉시 안내를 보여야 한다(안 보여주면 왜 안 되는지 알 수 없다).
//   두 곳에 같은 조건을 따로 쓰면 반드시 어긋난다. 그래서 순수 함수 하나를 공유한다.
//
//   ★ 공유하는 것은 "형식과 범위" 뿐이다. 판정 권한은 서버에만 있다.
//     출제 가능 문제 수 검증(Q-21)은 DB를 봐야 하므로 여기 없다. 서버 전용이다.
// =============================================================================

import { RULES } from './protocol.js';

export type StartMode = 'instant' | 'countdown';

// ─────────────────────────────────────────────────────────────────────────────
// ★★ 난이도 선택 (R025)
//
// ★ 건우: "지금까지 만든 문제 난이도가 좀 쉬운 편이다 … 난이도 범위 설정을 만들어 달라.
//   상·중·하 3단계면 좋겠다."
//
// ★ 매핑 (건우 확정) — questions.difficulty_score (1~5, R024 / 0007) 기준이다.
//     하 = 1~2 / 중 = 3 / 상 = 4~5
//   ★ 옛 3단계 열(questions.difficulty)을 쓰지 않는다. R025 에서 두 열을 대조했더니
//     활성 3,263건 전부 같은 매핑으로 일치했다. 그래도 **원점수를 기준으로 한다** —
//     옛 열은 파생값이라, 나중에 원점수만 다시 매기면 둘이 조용히 갈라진다.
//
// ★ 복수 선택이다. "상만" / "중+상" / "전체" 가 모두 가능하다. 최소 하나는 켜져 있어야 한다.
// ─────────────────────────────────────────────────────────────────────────────

export type DifficultyTier = 'easy' | 'medium' | 'hard';

export interface DifficultyTierInfo {
  tier: DifficultyTier;
  /** 화면 표기 */
  label: '하' | '중' | '상';
  /** 이 단계에 드는 difficulty_score */
  scores: readonly number[];
}

/** ★ 순서가 표기 순서다 (하 → 상) */
export const DIFFICULTY_TIERS: readonly DifficultyTierInfo[] = [
  { tier: 'easy', label: '하', scores: [1, 2] },
  { tier: 'medium', label: '중', scores: [3] },
  { tier: 'hard', label: '상', scores: [4, 5] },
];

/**
 * ★ 기본값 = 전체 (하·중·상). 근거 (R025 판단, D-115)
 *   · 지금까지의 동작과 같다 — 기존 방·다시 하기·테스트가 조용히 바뀌지 않는다
 *   · 출제 풀이 가장 크다 — 기본 설정에서 "문제가 부족합니다" 가 뜨지 않는다
 *   · ★ 어떤 난이도를 기본으로 할지는 **모임의 성격**에 달린 기획 판단이다.
 *     방장이 한 번 누르면 바뀌므로, 기본은 아무것도 빼지 않는 쪽이 안전하다.
 */
export const DEFAULT_DIFFICULTIES: readonly DifficultyTier[] = ['easy', 'medium', 'hard'];

/** 선택한 단계들 → difficulty_score 목록 (SQL 에 넘긴다) */
export function difficultyScores(tiers: readonly DifficultyTier[]): number[] {
  const out: number[] = [];
  for (const info of DIFFICULTY_TIERS) {
    if (tiers.includes(info.tier)) out.push(...info.scores);
  }
  return out;
}

/** 화면 표기. 세 개 다 켜져 있으면 "전체" */
export function formatDifficulties(tiers: readonly DifficultyTier[]): string {
  const labels = DIFFICULTY_TIERS.filter((i) => tiers.includes(i.tier)).map((i) => i.label);
  if (labels.length === DIFFICULTY_TIERS.length) return '전체';
  return labels.join('·');
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★ 분야 선택 (R034 / 건우 요청)
//
// ★ 건우: "분야를 고를 수 있게 해 달라 (복수 선택, 최소 하나)."
//
// ★★ 이것은 **게임 출제용 묶음**이다. 통계용 categories 트리(대·중·소분류)는 그대로 둔다.
//   ★ 묶음은 DB 의 categories.game_topic 이 정한다 (migrations/0009_game_topics.sql).
//     중분류에 값이 있으면 그것, 없으면 대분류의 기본값을 따른다. 소분류는 중분류를 따른다.
//     ★ 그래서 새 소분류·중분류가 들어와도 따로 손댈 것이 없다. 바꿀 곳은 DB 한 곳이다.
//   ★ 이 목록의 키는 DB 의 game_topics 표와 **같아야 한다**. 다르면 그 분야 문제가 안 나온다
//     (smoke 가 둘을 대조한다).
// ─────────────────────────────────────────────────────────────────────────────

export type GameTopic = 'korea' | 'history' | 'science' | 'arts' | 'sports' | 'life' | 'media';

export interface GameTopicInfo {
  topic: GameTopic;
  label: string;
}

/** ★ 순서가 표기 순서다 */
export const GAME_TOPICS: readonly GameTopicInfo[] = [
  { topic: 'korea', label: '한국' },
  { topic: 'history', label: '역사·사회' },
  { topic: 'science', label: '과학·기술' },
  { topic: 'arts', label: '문화·예술' },
  { topic: 'sports', label: '스포츠' },
  { topic: 'life', label: '생활' },
  { topic: 'media', label: '미디어·콘텐츠' },
];

/** ★ 기본값 = 전체. 난이도(D-115)와 같은 근거 — 지금까지의 동작과 같고 출제 풀이 가장 크다 */
export const DEFAULT_TOPICS: readonly GameTopic[] = GAME_TOPICS.map((t) => t.topic);

/** 화면 표기. 전부 켜져 있으면 "전체" */
export function formatTopics(topics: readonly GameTopic[]): string {
  const labels = GAME_TOPICS.filter((i) => topics.includes(i.topic)).map((i) => i.label);
  if (labels.length === GAME_TOPICS.length) return '전체';
  return labels.join(' · ');
}

export interface RoomSettingsInput {
  questionCount: number;
  startMode: StartMode;
  countdownSec: number;
  /** ★ R025. 정규화된 순서(하→중→상)로 저장된다. 중복 없음, 최소 1개 */
  difficulties: DifficultyTier[];
  /** ★ R034. 정규화된 순서(GAME_TOPICS 순)로 저장된다. 중복 없음, 최소 1개 */
  topics: GameTopic[];
}

export type SettingsValidation =
  | { ok: true; settings: RoomSettingsInput }
  | {
      ok: false;
      field: 'questionCount' | 'startMode' | 'countdownSec' | 'difficulties' | 'topics';
      message: string;
    };

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * 설정값 검증.
 *
 * ★ 정수만 받는다. 소수점이 들어오면 거부한다.
 *   "문제 10.5개" 는 의미가 없고, 반올림해서 조용히 바꾸면 사용자가 입력한 값과
 *   실제로 진행되는 값이 달라진다.
 *
 * ★ 카운트다운 초는 시작 방식이 즉시 시작이어도 검증한다.
 *   방장이 카운트다운으로 바꿨을 때 저장된 값이 범위 밖이면 그 순간 시작이 막히는데,
 *   왜 막히는지 화면에서 알 수 없게 된다.
 */
export function validateRoomSettings(input: unknown): SettingsValidation {
  if (input === null || typeof input !== 'object') {
    return { ok: false, field: 'questionCount', message: '설정 형식이 올바르지 않습니다.' };
  }
  const raw = input as Partial<RoomSettingsInput>;

  if (!isInt(raw.questionCount)) {
    return { ok: false, field: 'questionCount', message: '문제 수는 정수여야 합니다.' };
  }
  if (
    raw.questionCount < RULES.QUESTION_COUNT_MIN ||
    raw.questionCount > RULES.QUESTION_COUNT_MAX
  ) {
    return {
      ok: false,
      field: 'questionCount',
      message: `문제 수는 ${RULES.QUESTION_COUNT_MIN}~${RULES.QUESTION_COUNT_MAX} 사이여야 합니다.`,
    };
  }

  // ★★ R033 (Q-11 개정) — 시작 방식은 **항상 5초 카운트다운**이다.
  //   ★ 들어온 startMode / countdownSec 은 **보지 않는다.** 옛 클라이언트·봇이 무엇을 보내도
  //     거부하지 않고 고정값으로 맞춘다 (거부하면 문제 수만 고치려던 요청까지 막힌다).
  //   ★ 필드 자체는 남긴다 — games 기록·프로토콜 형식이 그대로 유지된다.

  // ── ★ 난이도 (R025)
  //   ★ 필드가 없으면 기본값(전체)을 쓴다. R024 이전 형식과 호환하기 위해서다.
  //     ★ 방장이 설정을 바꿀 때 서버는 **현재 값을 먼저 채운 뒤** 이 함수를 부른다
  //       (socket lobby.updateSettings). 그래서 "문제 수만 고쳤더니 난이도가 풀렸다" 는 일이 없다.
  let difficulties: DifficultyTier[];
  if (raw.difficulties === undefined) {
    difficulties = [...DEFAULT_DIFFICULTIES];
  } else {
    if (!Array.isArray(raw.difficulties)) {
      return { ok: false, field: 'difficulties', message: '난이도 형식이 올바르지 않습니다.' };
    }
    const known = new Set<string>(DIFFICULTY_TIERS.map((i) => i.tier));
    for (const d of raw.difficulties as unknown[]) {
      if (typeof d !== 'string' || !known.has(d)) {
        return { ok: false, field: 'difficulties', message: '알 수 없는 난이도가 있습니다.' };
      }
    }
    // ★ 정규화: 중복을 없애고 하→중→상 순서로 둔다. 같은 선택이 늘 같은 값이 되게 한다
    difficulties = DIFFICULTY_TIERS.map((i) => i.tier).filter((tier) =>
      (raw.difficulties as unknown[]).includes(tier),
    );
    if (difficulties.length === 0) {
      return {
        ok: false,
        field: 'difficulties',
        message: '난이도는 하나 이상 선택해야 합니다.',
      };
    }
  }

  // ── ★ 분야 (R034). 난이도와 같은 방식이다 — 없으면 기본값(전체), 있으면 정규화
  let topics: GameTopic[];
  if (raw.topics === undefined) {
    topics = [...DEFAULT_TOPICS];
  } else {
    if (!Array.isArray(raw.topics)) {
      return { ok: false, field: 'topics', message: '분야 형식이 올바르지 않습니다.' };
    }
    const known = new Set<string>(GAME_TOPICS.map((i) => i.topic));
    for (const t of raw.topics as unknown[]) {
      if (typeof t !== 'string' || !known.has(t)) {
        return { ok: false, field: 'topics', message: '알 수 없는 분야가 있습니다.' };
      }
    }
    topics = GAME_TOPICS.map((i) => i.topic).filter((t) => (raw.topics as unknown[]).includes(t));
    if (topics.length === 0) {
      return { ok: false, field: 'topics', message: '분야는 하나 이상 선택해야 합니다.' };
    }
  }

  return {
    ok: true,
    settings: {
      questionCount: raw.questionCount,
      startMode: 'countdown',
      countdownSec: RULES.START_COUNTDOWN_SEC,
      difficulties,
      topics,
    },
  };
}

/**
 * 경험률 표기 (guide 6절 / docs/01-GAME-RULES.md 5장).
 *
 * ★ 형식이 규칙으로 확정되어 있다. "1,234문제 중 153문제 (12.4%)"
 *   백분율만 보여주면 "10%" 가 10문제 중 1문제인지 1,000문제 중 100문제인지 알 수 없다.
 *
 * ★ 분모가 0일 때 0으로 나누지 않는다.
 *   문제 DB가 비어 있는 초기 상태에서 화면에 NaN 이 뜨는 것을 막는다.
 */
export function formatExperienceRate(experienced: number, total: number): string {
  const fmt = (n: number) => n.toLocaleString('ko-KR');
  if (total <= 0) return '출제 가능한 문제가 없습니다';
  const pct = (experienced / total) * 100;
  // ★ R043 (건우) — 출제 가능 수와 다른 것을 센다는 게 보이게: "전체 … 중 … 풀어봄" (경험률은 전체 활성 문제 기준 그대로 — 건우 확정)
  return `전체 ${fmt(total)} 중 ${fmt(experienced)} 풀어봄 (${pct.toFixed(1)}%)`;
}
