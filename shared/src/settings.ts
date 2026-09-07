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

export interface RoomSettingsInput {
  questionCount: number;
  startMode: StartMode;
  countdownSec: number;
}

export type SettingsValidation =
  | { ok: true; settings: RoomSettingsInput }
  | { ok: false; field: 'questionCount' | 'startMode' | 'countdownSec'; message: string };

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

  if (raw.startMode !== 'instant' && raw.startMode !== 'countdown') {
    return { ok: false, field: 'startMode', message: '시작 방식이 올바르지 않습니다.' };
  }

  if (!isInt(raw.countdownSec)) {
    return { ok: false, field: 'countdownSec', message: '카운트다운 초는 정수여야 합니다.' };
  }
  if (
    raw.countdownSec < RULES.COUNTDOWN_SEC_MIN ||
    raw.countdownSec > RULES.COUNTDOWN_SEC_MAX
  ) {
    return {
      ok: false,
      field: 'countdownSec',
      message: `카운트다운은 ${RULES.COUNTDOWN_SEC_MIN}~${RULES.COUNTDOWN_SEC_MAX}초 사이여야 합니다.`,
    };
  }

  return {
    ok: true,
    settings: {
      questionCount: raw.questionCount,
      startMode: raw.startMode,
      countdownSec: raw.countdownSec,
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
  return `${fmt(total)}문제 중 ${fmt(experienced)}문제 (${pct.toFixed(1)}%)`;
}
