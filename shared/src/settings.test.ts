// =============================================================================
// 게임 설정 검증 테스트
//
// ★ 경계값을 반드시 양쪽으로 잡는다. Q-10(1~200) / Q-11(3~60)의 경계에서
//   "하나 차이" 로 틀리는 것이 가장 흔한 실수다.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_LEVELS,
  formatLevel,
  levelScores,
  planGradeCounts,
  planGrades,
  formatExperienceRate,
  formatTopics,
  GAME_TOPICS,
  MINIGAME_ONLY_ROUNDS,
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
      // ★ R069 — 난이도 단계(옛 R025 difficulties 배열을 대신)
      'level',
      // ★ R050 — 미니게임 포함 · 넣을 미니게임
      'minigameKeys',
      // ★ R057 — 미니게임만 · 미니게임 수
      'minigameOnly',
      'minigameRounds',
      'minigames',
      'questionCount',
      'startMode',
      // ★ R034 — 분야
      'topics',
    ]);
  });
});

describe('★ R060 — 넣을 미니게임: 모르는 키(삭제한 twothirds)는 버린다', () => {
  const mg = { ...base, minigames: true };
  it('옛 설정에 twothirds 가 섞여 있어도 나머지로 통과', () => {
    const r = validateRoomSettings({ ...mg, minigameKeys: ['cake', 'twothirds', 'gauge'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.settings.minigameKeys).toEqual(['cake', 'gauge']);
  });
  it('twothirds 만 골랐던 설정은 전부로', () => {
    const r = validateRoomSettings({ ...mg, minigameKeys: ['twothirds'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.settings.minigameKeys).not.toContain('twothirds');
    if (r.ok) expect(r.settings.minigameKeys!.length).toBeGreaterThan(10);
  });
  it('빈 목록 · 글이 아닌 값은 여전히 거절', () => {
    expect(validateRoomSettings({ ...mg, minigameKeys: [] }).ok).toBe(false);
    expect(validateRoomSettings({ ...mg, minigameKeys: [1] }).ok).toBe(false);
  });
});

describe('formatExperienceRate (guide 6절 표기 규칙)', () => {
  it('백분율과 절대 개수를 함께 보여준다', () => {
    expect(formatExperienceRate(153, 1234)).toBe('전체 1,234 중 153 풀어봄 (12.4%)');
  });

  it('경험 기록이 없으면 0.0%', () => {
    expect(formatExperienceRate(0, 53)).toBe('전체 53 중 0 풀어봄 (0.0%)');
  });

  it('전부 경험했으면 100.0%', () => {
    expect(formatExperienceRate(53, 53)).toBe('전체 53 중 53 풀어봄 (100.0%)');
  });

  it('★ 분모가 0이면 0으로 나누지 않는다', () => {
    expect(formatExperienceRate(0, 0)).toBe('출제 가능한 문제가 없습니다');
    expect(formatExperienceRate(0, 0)).not.toContain('NaN');
  });
});

describe('★★★ 난이도 단계 — 초급 · 중급 · 고급 (R069 · docs/19 §5)', () => {
  it('★ 비율 · 읽는 등급 · 가장 어려운 칸', () => {
    expect(DIFFICULTY_LEVELS.map((l) => l.ratio.reduce((a, b) => a + b, 0))).toEqual([100, 100, 100]);
    expect(levelScores('beginner')).toEqual([1, 2, 3]);
    expect(levelScores('intermediate')).toEqual([1, 2, 3, 4]);
    expect(levelScores('advanced')).toEqual([1, 2, 3, 4, 5]);
    expect(DIFFICULTY_LEVELS.map((l) => l.hardest)).toEqual([3, 4, 5]);
    expect(DIFFICULTY_LEVELS.map((l) => formatLevel(l.level))).toEqual(['초급', '중급', '고급']);
  });
  it('★ 필드가 없으면 중급(기본 · 찬종)', () => {
    const r = validateRoomSettings(base);
    expect(r.ok && r.settings.level).toBe('intermediate');
  });
  it('★ level 셋 · 모르는 값 거부', () => {
    for (const lv of ['beginner', 'intermediate', 'advanced'] as const) {
      const r = validateRoomSettings({ ...base, level: lv });
      expect(r.ok && r.settings.level).toBe(lv);
    }
    const bad = validateRoomSettings({ ...base, level: 'insane' });
    expect(!bad.ok && bad.field).toBe('level');
  });
  it('★★ 옛 difficulties 배열은 옮긴다 — 상 포함 → 고급 · 하만 → 초급 · 그 밖 → 중급 · 배열이 level 보다 이긴다', () => {
    const lv = (d: unknown) => {
      const r = validateRoomSettings({ ...base, level: 'intermediate', difficulties: d });
      return r.ok ? r.settings.level : null;
    };
    expect(lv(['easy', 'medium', 'hard'])).toBe('advanced');
    expect(lv(['hard'])).toBe('advanced');
    expect(lv(['easy'])).toBe('beginner');
    expect(lv(['medium'])).toBe('intermediate');
    expect(lv(['easy', 'medium'])).toBe('intermediate');
    expect(lv([])).toBe(null);
    expect(lv(['insane'])).toBe(null);
    expect(lv('hard')).toBe(null);
  });
  it('★★ 20문항 등급 수 — 초급 6·10·4 · 중급 2·6·8·4 · 고급 1·3·6·6·4', () => {
    expect(planGradeCounts(20, 'beginner')).toEqual([6, 10, 4, 0, 0]);
    expect(planGradeCounts(20, 'intermediate')).toEqual([2, 6, 8, 4, 0]);
    expect(planGradeCounts(20, 'advanced')).toEqual([1, 3, 6, 6, 4]);
  });
  it('★ 문항 수 1 · 3 · 50 · 200 — 합 = 문항 수 · 비율 0 인 등급은 0', () => {
    for (const n of [1, 3, 7, 50, 199, 200]) {
      for (const l of DIFFICULTY_LEVELS) {
        const c = planGradeCounts(n, l.level);
        expect(c.reduce((a, b) => a + b, 0)).toBe(n);
        c.forEach((x, i) => {
          if (l.ratio[i] === 0) expect(x).toBe(0);
        });
      }
    }
    expect(planGradeCounts(1, 'beginner')).toEqual([0, 1, 0, 0, 0]);
  });
  it('★ 계획은 섞인다(오름차순 아님) · 같은 개수', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const p = planGrades(20, 'advanced', rnd);
    expect([...p].sort((a, b) => a - b)).toEqual([1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5]);
    expect(p).not.toEqual([...p].sort((a, b) => a - b));
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

describe('★★★ 미니게임만 (R057)', () => {
  it('없으면 꺼짐 · 5개', () => {
    const r = validateRoomSettings(base);
    expect(r.ok && r.settings.minigameOnly).toBe(false);
    expect(r.ok && r.settings.minigameRounds).toBe(MINIGAME_ONLY_ROUNDS.DEFAULT);
  });
  it('켜고 2~50 은 통과(R066) · 밖이나 소수는 거부', () => {
    expect(validateRoomSettings({ ...base, minigameOnly: true, minigameRounds: 2 }).ok).toBe(true);
    expect(validateRoomSettings({ ...base, minigameOnly: true, minigameRounds: 50 }).ok).toBe(true);
    for (const n of [1, 51, 3.5, '5']) {
      const r = validateRoomSettings({ ...base, minigameOnly: true, minigameRounds: n });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.field).toBe('minigameRounds');
    }
  });
  it('boolean 이 아니면 거부', () => {
    expect(validateRoomSettings({ ...base, minigameOnly: 'yes' }).ok).toBe(false);
  });
});
