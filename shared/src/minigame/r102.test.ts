// ★★ R102 (찬종 #130 "30초라고 써있는거 같은데 60초임") — 설명 줄에 쓴 초 = 실제 판 시간 상수
import { describe, expect, it } from 'vitest';
import { BALANCE_PLAY_MS, MINIGAMES, minigameInfo } from '../minigame.js';
import { ANGLE_PLAY_MS } from './angle.js';
import { OX_PLAY_MS } from './ox.js';
import { ODDONE_PENALTY_MS } from './r053.js';
import { TAP_PLAY_MS } from './r054.js';
import { SONG_PLAY_MS, SONGYEAR_PLAY_MS } from './song.js';
import { CHOICE_PLAY_MS, MANY_DEFAULT_SEC, MANY_PLAY_SEC, UNIQUE_PLAY_MS } from './topics.js';

/** 설명 줄에 초가 나오는 게임 → 그 판 시간(초) */
const PLAY_SEC: Record<string, number> = {
  ox: OX_PLAY_MS / 1000,
  song: SONG_PLAY_MS / 1000,
  songyear: SONGYEAR_PLAY_MS / 1000,
  many: MANY_PLAY_SEC,
  unique: UNIQUE_PLAY_MS / 1000,
  choice: CHOICE_PLAY_MS / 1000,
  balance: BALANCE_PLAY_MS / 1000,
  angle: ANGLE_PLAY_MS / 1000,
  tap: TAP_PLAY_MS / 1000,
  oddone: ODDONE_PENALTY_MS / 1000, // 틀리면 +2초(판 시간이 아니라 벌칙)
};
/** 초가 판 시간이 아닌 말(케이크 "0초에 누르면") */
const NOT_PLAY_TIME = new Set(['cake']);

describe('R102 설명 줄의 초 = 판 시간 상수', () => {
  it('많이 말하기는 30초(찬종 2026-11-15) · 옛 이름도 같은 값', () => {
    expect(MANY_PLAY_SEC).toBe(30);
    expect(MANY_DEFAULT_SEC).toBe(MANY_PLAY_SEC);
    expect(minigameInfo('many')?.oneLine).toContain(`${MANY_PLAY_SEC}초 동안`);
  });
  it('초가 적힌 설명 줄은 전부 표에 있고 그 수가 상수와 같다', () => {
    const bad: string[] = [];
    for (const g of MINIGAMES) {
      if (NOT_PLAY_TIME.has(g.key)) continue;
      const secs = [...g.oneLine.matchAll(/(\d+(?:\.\d+)?)초/g)].map((m) => Number(m[1]));
      if (secs.length === 0) continue;
      const want = PLAY_SEC[g.key];
      if (want === undefined || secs.some((x) => x !== want)) bad.push(`${g.key}: ${g.oneLine} (상수 ${want ?? '없음'})`);
    }
    expect(bad).toEqual([]);
  });
});
