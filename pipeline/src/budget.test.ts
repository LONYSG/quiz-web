// =============================================================================
// 재개 회계 테스트 (R014 작업 A-1 / Q-78 확정)
//
// ★★ 왜 이 테스트가 필요한가
//   R013 에서 이 회계 때문에 **하루에 스크립트를 하나만** 돌릴 수 있었고
//   실측 3건 중 하나만 골라야 했다. 규칙을 고친 뒤 같은 상태로 되돌아가지 않게 고정한다.
//
// ★ Q-78 (B) 확정
//   429 → 15분 대기 → 1회 재개 → ★ 재개가 **성공하면** 한도를 돌려준다
//                              → ★ 재개 직후 또 429 면 그날 중단
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  canResume,
  canResumeNow,
  checkGate,
  consumedResumes,
  noteCallSucceeded,
  noteRateLimited,
  recordResume,
  today,
  type DayState,
} from './budget.js';
import { LIMITS } from './config.js';

function state(over: Partial<DayState> = {}): DayState {
  return {
    day: today(),
    items: 0,
    tokens: 0,
    calls: 0,
    rateLimited: false,
    rateLimitedAt: null,
    rateLimitHits: 0,
    resumes: [],
    segments: [],
    wastedRequests: {},
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

/** 429 를 맞은 직후의 상태. minutesAgo 분 전에 맞았다 */
function afterRateLimit(minutesAgo: number, over: Partial<DayState> = {}): DayState {
  return state({
    rateLimited: true,
    rateLimitedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    rateLimitHits: 1,
    ...over,
  });
}

describe('재개 대기 시간', () => {
  it('★ 15분이 지나지 않으면 재개하지 않는다', () => {
    const s = afterRateLimit(5);
    expect(canResumeNow(s)).toBe(false);
    const g = checkGate(s);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.detail).toContain('분이 지나지 않았다');
  });

  it('15분이 지나면 재개한다', () => {
    const s = afterRateLimit(20);
    expect(canResumeNow(s)).toBe(true);
    expect(checkGate(s).ok).toBe(true);
    // ★ 게이트를 통과하면 재개가 기록되고 429 상태가 풀린다
    expect(s.rateLimited).toBe(false);
    expect(s.resumes).toHaveLength(1);
    expect(s.resumes[0]?.outcome).toBe('pending');
  });

  it('★ 429 를 맞지 않았으면 재개 개념이 없다', () => {
    const s = state();
    expect(canResumeNow(s)).toBe(true);
    expect(checkGate(s).ok).toBe(true);
    expect(s.resumes).toHaveLength(0);
  });
});

describe('★★ Q-78 — 재개가 성공하면 한도를 돌려준다', () => {
  it('★ 성공한 재개는 한도를 소모하지 않는다', () => {
    const s = afterRateLimit(20);
    expect(checkGate(s).ok).toBe(true); // 재개 1회
    expect(consumedResumes(s)).toBe(1); // 아직 pending 이므로 소모 중

    // ★ 호출이 성공했다
    noteCallSucceeded(s);
    expect(s.resumes[0]?.outcome).toBe('success');
    expect(s.resumes[0]?.resolvedAt).toBeTruthy();
    // ★★ 핵심 — 한도가 돌아왔다
    expect(consumedResumes(s)).toBe(0);
    expect(canResume(s)).toBe(true);
  });

  it('★★ R013 을 막았던 상황 — 성공한 재개 뒤에 다른 스크립트가 돌 수 있다', () => {
    const s = afterRateLimit(20);
    // 스크립트 1: 게이트 통과 → 호출 성공
    expect(checkGate(s).ok).toBe(true);
    noteCallSucceeded(s);
    // 스크립트 2: ★ R013 에서는 여기서 막혔다
    expect(checkGate(s).ok).toBe(true);
  });

  it('★ 재개 직후 또 429 면 그날 중단한다', () => {
    const s = afterRateLimit(20);
    expect(checkGate(s).ok).toBe(true);

    // ★ 재개한 호출이 429 를 받았다
    s.rateLimited = true;
    s.rateLimitedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    noteRateLimited(s);
    expect(s.resumes[0]?.outcome).toBe('rate_limited');

    // ★★ 15분이 지났어도 재개하지 않는다
    expect(canResume(s)).toBe(false);
    expect(canResumeNow(s)).toBe(false);
    const g = checkGate(s);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.detail).toContain('재개 뒤에도 429');
  });

  it('★ 성공한 재개가 있어도 새 429 는 새 재개 한 번만 준다', () => {
    const s = afterRateLimit(20);
    checkGate(s);
    noteCallSucceeded(s); // 1회차 재개 성공

    // 새 429
    s.rateLimited = true;
    s.rateLimitedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(checkGate(s).ok).toBe(true); // 2회차 재개
    expect(s.resumes).toHaveLength(2);

    // ★ 그 재개가 또 429 → 그날 중단
    s.rateLimited = true;
    s.rateLimitedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    noteRateLimited(s);
    expect(canResume(s)).toBe(false);
  });

  it('★ pending 인 재개는 소모로 센다 (결과를 모르는 재개를 공짜로 주지 않는다)', () => {
    const s = afterRateLimit(20);
    checkGate(s);
    // 결과를 모르는 채로 다시 429 상태가 되었다면 재개하지 않는다
    s.rateLimited = true;
    s.rateLimitedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(consumedResumes(s)).toBe(1);
    expect(canResume(s)).toBe(false);
  });

  it('★ 옛 형식(outcome 없음)도 소모로 센다', () => {
    // ★ R013 이전 상태 파일에는 outcome 이 없다. 그 경우 pending 으로 본다
    const s = afterRateLimit(20, {
      resumes: [{ at: new Date().toISOString(), afterItems: 0, afterTokens: 0 }],
    });
    expect(consumedResumes(s)).toBe(1);
    expect(canResume(s)).toBe(false);
  });

  it('noteCallSucceeded / noteRateLimited 는 대기 중인 재개가 없으면 아무 일도 하지 않는다', () => {
    const s = state();
    noteCallSucceeded(s);
    noteRateLimited(s);
    expect(s.resumes).toHaveLength(0);
  });

  it('★ 이미 확정된 재개를 다시 덮어쓰지 않는다', () => {
    const s = afterRateLimit(20);
    checkGate(s);
    noteCallSucceeded(s);
    const resolvedAt = s.resumes[0]?.resolvedAt;
    // ★ 성공으로 확정된 뒤 429 가 와도 그 기록은 바뀌지 않는다
    noteRateLimited(s);
    expect(s.resumes[0]?.outcome).toBe('success');
    expect(s.resumes[0]?.resolvedAt).toBe(resolvedAt);
  });
});

describe('한도 게이트는 그대로다', () => {
  it('건수 상한', () => {
    const g = checkGate(state({ items: LIMITS.dailyItems }));
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('item_limit');
  });

  it('토큰 상한', () => {
    const g = checkGate(state({ tokens: LIMITS.dailyTokens }));
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('token_limit');
  });
});
