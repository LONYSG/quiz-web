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
import { MINIGAME_KEYS, isMinigameKey, type MinigameKey } from './minigame.js';

export type StartMode = 'instant' | 'countdown';

// ─────────────────────────────────────────────────────────────────────────────
// ★★★ 난이도 = 초급 · 중급 · 고급 중 하나 (R069 · docs/19 §5 · 찬종 2026-10-26)
//
// ★ 옛 R025 하·중·상 켜고 끄기(1~2 / 3 / 4~5 필터)를 버렸다. 이제 **한 판의 문항을 등급(difficulty_score 1~5) 비율로** 뽑는다.
//   찬종: "상중하는 유지하고 1~5 는 따로 저장 · 하에서 5 가 나오면 당황스럽지만 상에서 1 은 괜찮다 — 1·5 가 대칭일 필요는 없다".
// ★ 비율(%) — 1 · 2 · 3 · 4 · 5:  초급 30/50/20/0/0 · 중급 10/30/40/20/0 · 고급 5/15/30/30/20.
// ★ 각 단계의 가장 어려운 칸(hardest)은 알가치(questions.worth) 3 에서만 — 선정은 server/src/game/select.ts.
// ★ 옛 `difficulties` 배열(옛 클라이언트 · 봇 · 다시 하기 이어받기)은 받아서 옮긴다 — levelFromLegacy.
// ─────────────────────────────────────────────────────────────────────────────

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface DifficultyLevelInfo {
  level: DifficultyLevel;
  /** 화면 표기 */
  label: '초급' | '중급' | '고급';
  /** 버튼 밑 한 줄 설명 (19 §5 문구를 화면에 맞춰 다듬음 — 뜻 유지) */
  desc: string;
  /** 등급 1~5 비율(%) — 합 100 */
  ratio: readonly [number, number, number, number, number];
  /** 이 단계가 읽는 등급(비율 > 0) — 출제 풀 · 출제 가능 수 · 폴백이 이 안에서 돈다 */
  scores: readonly number[];
  /** 가장 어려운 칸의 등급(알가치 3 에서만 뽑는다) */
  hardest: number;
}

/** ★ 순서가 표기 순서다 (초급 → 고급) */
export const DIFFICULTY_LEVELS: readonly DifficultyLevelInfo[] = [
  { level: 'beginner', label: '초급', desc: '누구나 아는 상식 · 맞히는 재미', ratio: [30, 50, 20, 0, 0], scores: [1, 2, 3], hardest: 3 },
  { level: 'intermediate', label: '중급', desc: '학교에서 배운 것과 일반 상식 · 가끔 "오~"', ratio: [10, 30, 40, 20, 0], scores: [1, 2, 3, 4], hardest: 4 },
  { level: 'advanced', label: '고급', desc: '몰라도 알아 둘 만한 문제 · 다섯 중 하나는 어렵다', ratio: [5, 15, 30, 30, 20], scores: [1, 2, 3, 4, 5], hardest: 5 },
];

/** ★ 기본값 = 중급 (찬종 2026-10-26) */
export const DEFAULT_LEVEL: DifficultyLevel = 'intermediate';

export function levelInfo(level: DifficultyLevel): DifficultyLevelInfo {
  return DIFFICULTY_LEVELS.find((i) => i.level === level) ?? DIFFICULTY_LEVELS[1]!;
}

/** 이 단계가 읽는 difficulty_score 목록 (SQL 에 넘긴다) */
export function levelScores(level: DifficultyLevel): number[] {
  return [...levelInfo(level).scores];
}

/** 화면 표기 — 초급 · 중급 · 고급 */
export function formatLevel(level: DifficultyLevel): string {
  return levelInfo(level).label;
}

/** ★ 옛 `difficulties` 배열 → 단계: 상(hard) 포함 → 고급 · 하(easy)만 → 초급 · 그 밖 → 중급 */
export function levelFromLegacy(difficulties: readonly unknown[]): DifficultyLevel {
  if (difficulties.includes('hard')) return 'advanced';
  if (difficulties.length > 0 && difficulties.every((d) => d === 'easy')) return 'beginner';
  return 'intermediate';
}

export function isDifficultyLevel(v: unknown): v is DifficultyLevel {
  return typeof v === 'string' && DIFFICULTY_LEVELS.some((i) => i.level === v);
}

/**
 * ★ 문항 수 × 비율 → 등급별 수 [n1 … n5] (큰 나머지 순 반올림 · 나머지가 같으면 낮은 등급 먼저 · 비율 0 인 등급은 0).
 *   20문항: 초급 6·10·4 · 중급 2·6·8·4 · 고급 1·3·6·6·4.
 */
export function planGradeCounts(count: number, level: DifficultyLevel): number[] {
  const ratio = levelInfo(level).ratio;
  const n = Math.max(0, Math.floor(count));
  const exact = ratio.map((r) => (n * r) / 100);
  const out = exact.map((x) => Math.floor(x));
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .filter((x) => ratio[x.i]! > 0)
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k += 1, left -= 1) out[order[k % order.length]!.i]! += 1;
  return out;
}

/**
 * ★ 등급 계획 — 길이 = 문항 수 · 값 = 그 문항의 목표 등급(1~5). **무작위로 섞는다**(오름차순이 아니다 —
 *   "하에서 5 는 당황 · 상에서 1 은 괜찮다" 는 비율로 이미 지켜진다). random 은 0~1(테스트에서 고정).
 */
export function planGrades(count: number, level: DifficultyLevel, random: () => number = Math.random): number[] {
  const counts = planGradeCounts(count, level);
  const out: number[] = [];
  counts.forEach((c, i) => {
    for (let k = 0; k < c; k += 1) out.push(i + 1);
  });
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
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

/** ★ 기본값 = 전체 (R034 · D-115 근거 — 지금까지의 동작과 같고 출제 풀이 가장 크다) */
export const DEFAULT_TOPICS: readonly GameTopic[] = GAME_TOPICS.map((t) => t.topic);

/** 화면 표기. 전부 켜져 있으면 "전체" */
export function formatTopics(topics: readonly GameTopic[]): string {
  const labels = GAME_TOPICS.filter((i) => topics.includes(i.topic)).map((i) => i.label);
  if (labels.length === GAME_TOPICS.length) return '전체';
  return labels.join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★★ 미니게임만 모드 (R057 · D-249)
//
// ★ 찬종: "미니게임 반응이 생각보다 좋아. 미니게임만 하는 모드도 추가하면 좋을듯."
// ★ 켜면 문제 없이 미니게임 N개(2~10 · 기본 5)를 잇달아 한다 — 깜짝 연출은 첫 미니게임에만 · 결과는 미니게임 순위 점수 합.
//   ★ 문제 수 · 난이도 · 분야 값은 그대로 남는다(끄면 돌아온다) — 이 모드에서는 쓰지 않을 뿐.
// ─────────────────────────────────────────────────────────────────────────────
/** ★ R066 (D-282 · 찬종 #36 "최대 미니게임 수는 50") — 2~10 → 2~50 */
export const MINIGAME_ONLY_ROUNDS = { MIN: 2, MAX: 50, DEFAULT: 5 } as const;

export interface RoomSettingsInput {
  questionCount: number;
  startMode: StartMode;
  countdownSec: number;
  /** ★★ R069 — 초급 · 중급 · 고급 중 하나 (기본 중급 · 옛 difficulties 배열은 받아서 옮긴다) */
  level: DifficultyLevel;
  /** ★ R034. 정규화된 순서(GAME_TOPICS 순)로 저장된다. 중복 없음, 최소 1개 */
  topics: GameTopic[];
  /** ★★ R050 — 미니게임 포함 (기본 꺼짐 · 다시 하기 이어받음 — D-234) */
  minigames: boolean;
  /** ★ R050 — 넣을 미니게임 (기본 전부 · 확장성 — 정규화된 순서 · 최소 1개) */
  minigameKeys: MinigameKey[];
  /** ★★★ R057 — 미니게임만 (기본 꺼짐 · 다시 하기 이어받음 — D-249) */
  minigameOnly: boolean;
  /** ★ R057 — 미니게임만 모드의 미니게임 수 (2~10 · 기본 5) */
  minigameRounds: number;
}

export type SettingsValidation =
  | { ok: true; settings: RoomSettingsInput }
  | {
      ok: false;
      field: 'questionCount' | 'startMode' | 'countdownSec' | 'level' | 'topics' | 'minigames' | 'minigameRounds';
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
  const raw = input as Partial<RoomSettingsInput> & { difficulties?: unknown };

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

  // ── ★★ R069 난이도 단계 — 없으면 기본(중급).
  //   ★ 옛 `difficulties` 배열이 오면(옛 클라이언트 · 봇 · 옛 다시 하기) 받아서 옮긴다 — 배열이 있으면 그쪽이 이긴다
  //     (서버는 지금 level 을 먼저 채우고 보낸 것을 덮으므로, 옛 클라이언트가 보낸 배열이 뜻대로 바뀐다).
  //   ★ 방장이 설정을 바꿀 때 서버는 **현재 값을 먼저 채운 뒤** 이 함수를 부른다(socket lobby.updateSettings).
  let level: DifficultyLevel = DEFAULT_LEVEL;
  if (raw.difficulties !== undefined) {
    if (!Array.isArray(raw.difficulties) || !(raw.difficulties as unknown[]).every((d) => d === 'easy' || d === 'medium' || d === 'hard')) {
      return { ok: false, field: 'level', message: '난이도 형식이 올바르지 않습니다.' };
    }
    if ((raw.difficulties as unknown[]).length === 0) return { ok: false, field: 'level', message: '난이도는 하나 이상 선택해야 합니다.' };
    level = levelFromLegacy(raw.difficulties as unknown[]);
  } else if (raw.level !== undefined) {
    if (!isDifficultyLevel(raw.level)) return { ok: false, field: 'level', message: '알 수 없는 난이도입니다.' };
    level = raw.level;
  }

  // ── ★ 분야 (R034) — 없으면 기본값(전체), 있으면 정규화
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

  // ── ★★ R050 — 미니게임 (없으면 기본: 꺼짐 · 전부)
  if (raw.minigames !== undefined && typeof raw.minigames !== 'boolean') {
    return { ok: false, field: 'minigames', message: '미니게임 설정 형식이 올바르지 않습니다.' };
  }
  let minigameKeys: MinigameKey[] = [...MINIGAME_KEYS];
  if (raw.minigameKeys !== undefined) {
    if (!Array.isArray(raw.minigameKeys) || !(raw.minigameKeys as unknown[]).every((k) => typeof k === 'string')) {
      return { ok: false, field: 'minigames', message: '미니게임 설정 형식이 올바르지 않습니다.' };
    }
    // ★ R060 — **모르는 키는 버린다**(삭제한 'twothirds' 가 옛 설정 · 열린 화면에 남아 있어도 안 깨지게 — D-253)
    minigameKeys = MINIGAME_KEYS.filter((k) => (raw.minigameKeys as unknown[]).includes(k));
    if (minigameKeys.length === 0) {
      // 고른 것이 전부 없어진 게임이면 전부로 · 정말 빈 목록은 그대로 거절
      if ((raw.minigameKeys as unknown[]).length > 0 && !(raw.minigameKeys as unknown[]).some(isMinigameKey)) minigameKeys = [...MINIGAME_KEYS];
      else return { ok: false, field: 'minigames', message: '미니게임은 하나 이상 골라야 합니다.' };
    }
  }

  // ── ★★★ R057 — 미니게임만 (없으면 기본: 꺼짐 · 5개)
  if (raw.minigameOnly !== undefined && typeof raw.minigameOnly !== 'boolean') {
    return { ok: false, field: 'minigames', message: '미니게임만 설정 형식이 올바르지 않습니다.' };
  }
  const minigameRounds = raw.minigameRounds ?? MINIGAME_ONLY_ROUNDS.DEFAULT;
  if (!isInt(minigameRounds) || minigameRounds < MINIGAME_ONLY_ROUNDS.MIN || minigameRounds > MINIGAME_ONLY_ROUNDS.MAX) {
    return {
      ok: false,
      field: 'minigameRounds',
      message: `미니게임 수는 ${MINIGAME_ONLY_ROUNDS.MIN}~${MINIGAME_ONLY_ROUNDS.MAX} 사이여야 합니다.`,
    };
  }

  return {
    ok: true,
    settings: {
      questionCount: raw.questionCount,
      startMode: 'countdown',
      countdownSec: RULES.START_COUNTDOWN_SEC,
      level,
      topics,
      minigames: raw.minigames === true,
      minigameKeys,
      minigameOnly: raw.minigameOnly === true,
      minigameRounds,
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
