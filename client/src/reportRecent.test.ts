// ★★ R102 (찬종 #129 "문제 목록에 안나오네") — 제보 목록: 한 판 50문제 + 미니게임 문항이 다 남고 · 공개된 정답이 같이 남는다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECENT_MAX, clearRecentTargets, noteRecentMinigame, noteRecentQuestion, recentTargets } from './reportRecent.js';

describe('R102 제보 최근 목록', () => {
  beforeEach(() => clearRecentTargets());
  it('game 2260 꼴 — 문제 50 + OX 10 + 많이 말하기 1 이 전부 남는다 · #732 정답이 보인다', () => {
    for (let i = 1; i <= 50; i += 1) {
      noteRecentQuestion('2260', i === 12 ? '732' : String(10_000 + i), i, i === 12 ? '제철소를 세운 인간과 숲의 신들이 맞서는 이야기를' : `질문 ${i}`, i === 12 ? '모노노케 히메' : `정답 ${i}`);
      if (i === 10) for (let r = 0; r < 10; r += 1) noteRecentMinigame('ox-tok', r, 'ox', `ox-${r}`);
      if (i === 20) noteRecentMinigame('many-tok', 0, 'many', 'topic:us-state');
    }
    const list = recentTargets();
    expect(list.length).toBe(61);
    expect(RECENT_MAX).toBeGreaterThanOrEqual(61);
    const q = list.find((t) => t.questionId === '732');
    expect(q?.answer).toBe('모노노케 히메');
    expect(q?.questionIndex).toBe(12);
    expect(list.at(-1)?.questionIndex).toBe(1); // 첫 문제까지 남는다(옛: 30개 저장 · 20개만 보임)
  });
});
