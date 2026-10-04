// =============================================================================
// 게임 설정 검증 테스트
//
// ★ 경계값을 반드시 양쪽으로 잡는다. Q-10(1~200) / Q-11(3~60)의 경계에서
//   "하나 차이" 로 틀리는 것이 가장 흔한 실수다.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  difficultyScores,
  formatDifficulties,
  formatExperienceRate,
  formatTopics,
  GAME_TOPICS,
  validateRoomSettings,
} from './settings.js';

const base = { questionCount: 20, startMode: 'instant' as const, countdownSec: 5 };

describe('validateRoomSettings — 문제 수 (Q-10: 1~200)', () => {
  it.each([1, 2, 50, 100, 199, 200])('%i 은 통과한다', (questionCount) => {
    const r = validateRoomSettings({ ...base, questionCount });
    expect(r.ok).toBe(true);
  });

  it.each([0, -1, 201, 1000])('%i 은 거부한다', (questionCount) => {
    const r = validateRoomSettings({ ...base, questionCount });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('questionCount');
  });

  it('소수점은 거부한다 — 조용히 반올림하지 않는다', () => {
    const r = validateRoomSettings({ ...base, questionCount: 10.5 });
    expect(r.ok).toBe(false);
  });

  it('문자열 숫자는 거부한다', () => {
    const r = validateRoomSettings({ ...base, questionCount: '20' });
    expect(r.ok).toBe(false);
  });

  it('NaN 은 거부한다 — 빈 입력창이 NaN 으로 오는 경로가 있다', () => {
    const r = validateRoomSettings({ ...base, questionCount: Number.NaN });
    expect(r.ok).toBe(false);
  });
});

describe('★ R033 — 시작은 항상 5초 카운트다운 (Q-11 개정)', () => {
  // ★ 전에는 시작 방식(즉시/카운트다운)과 카운트다운 초(3~60)를 검증했다.
  //   ★★ 건우 확정: "시작 방식은 무조건 5초 후 시작". 선택 칸이 없어졌다.
  it.each([
    { startMode: 'instant', countdownSec: 30 },
    { startMode: 'countdown', countdownSec: 3 },
    { startMode: 'INSTANT', countdownSec: 1 },
    { startMode: undefined, countdownSec: undefined },
  ])('들어온 값과 무관하게 countdown / 5초로 맞춘다 (%o)', (extra) => {
    const r = validateRoomSettings({ ...base, ...extra });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.startMode).toBe('countdown');
      expect(r.settings.countdownSec).toBe(5);
    }
  });
});

describe('validateRoomSettings — 형식 방어', () => {
  it.each([null, undefined, 42, 'x', []])('%s 는 거부한다', (input) => {
    expect(validateRoomSettings(input).ok).toBe(false);
  });

  it('통과하면 알려진 필드만 남긴다 — 프로토타입 오염 방어', () => {
    const r = validateRoomSettings({ ...base, extra: 'x', __proto__: { evil: 1 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.settings).sort()).toEqual([
      'countdownSec',
      // ★ R025 — 난이도가 알려진 필드에 더해졌다
      'difficulties',
      'questionCount',
      'startMode',
      // ★ R034 — 분야
      'topics',
    ]);
  });
});

describe('formatExperienceRate (guide 6절 표기 규칙)', () => {
  it('백분율과 절대 개수를 함께 보여준다', () => {
    expect(formatExperienceRate(153, 1234)).toBe('1,234문제 중 153문제 (12.4%)');
  });

  it('경험 기록이 없으면 0.0%', () => {
    expect(formatExperienceRate(0, 53)).toBe('53문제 중 0문제 (0.0%)');
  });

  it('전부 경험했으면 100.0%', () => {
    expect(formatExperienceRate(53, 53)).toBe('53문제 중 53문제 (100.0%)');
  });

  it('★ 분모가 0이면 0으로 나누지 않는다', () => {
    expect(formatExperienceRate(0, 0)).toBe('출제 가능한 문제가 없습니다');
    expect(formatExperienceRate(0, 0)).not.toContain('NaN');
  });
});

describe('★ 난이도 선택 (R025)', () => {
  it('★ 매핑: 하=1~2 / 중=3 / 상=4~5', () => {
    expect(difficultyScores(['easy'])).toEqual([1, 2]);
    expect(difficultyScores(['medium'])).toEqual([3]);
    expect(difficultyScores(['hard'])).toEqual([4, 5]);
    expect(difficultyScores(['medium', 'hard'])).toEqual([3, 4, 5]);
  });

  it('★ 필드가 없으면 전체 (옛 형식 호환)', () => {
    const r = validateRoomSettings(base);
    expect(r.ok && r.settings.difficulties).toEqual(['easy', 'medium', 'hard']);
  });

  it('★ 복수 선택을 하→상 순서로 정규화하고 중복을 없앤다', () => {
    const r = validateRoomSettings({ ...base, difficulties: ['hard', 'medium', 'hard'] });
    expect(r.ok && r.settings.difficulties).toEqual(['medium', 'hard']);
  });

  it('★★ 하나도 켜지 않으면 거부한다', () => {
    const r = validateRoomSettings({ ...base, difficulties: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.field).toBe('difficulties');
  });

  it('★ 모르는 값·배열 아닌 값은 거부한다', () => {
    expect(validateRoomSettings({ ...base, difficulties: ['insane'] }).ok).toBe(false);
    expect(validateRoomSettings({ ...base, difficulties: 'hard' }).ok).toBe(false);
  });

  it('★ 표기: 전체 / 상 / 중·상', () => {
    expect(formatDifficulties(['easy', 'medium', 'hard'])).toBe('전체');
    expect(formatDifficulties(['hard'])).toBe('상');
    expect(formatDifficulties(['medium', 'hard'])).toBe('중·상');
  });
});

describe('★ 분야 선택 (R034)', () => {
  it('필드가 없으면 전체 (옛 형식 호환)', () => {
    const r = validateRoomSettings(base);
    expect(r.ok && r.settings.topics).toEqual(GAME_TOPICS.map((t) => t.topic));
  });
  it('중복을 없애고 정해진 순서로 둔다', () => {
    const r = validateRoomSettings({ ...base, topics: ['media', 'korea', 'media'] });
    expect(r.ok && r.settings.topics).toEqual(['korea', 'media']);
  });
  it('빈 선택은 거부한다 (최소 하나)', () => {
    const r = validateRoomSettings({ ...base, topics: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.field).toBe('topics');
  });
  it('모르는 분야·잘못된 형식은 거부한다', () => {
    expect(validateRoomSettings({ ...base, topics: ['games'] }).ok).toBe(false);
    expect(validateRoomSettings({ ...base, topics: 'korea' }).ok).toBe(false);
  });
  it('표기 — 전부면 "전체"', () => {
    expect(formatTopics(GAME_TOPICS.map((t) => t.topic))).toBe('전체');
    expect(formatTopics(['media', 'korea'])).toBe('한국 · 미디어·콘텐츠');
  });
});
