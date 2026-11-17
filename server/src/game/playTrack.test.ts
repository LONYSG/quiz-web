// ★★ R103 (D-360) — 문항 × 사람 플레이 기록(메모리) 규칙: 틀린 글 수 · 처음 맞힌 때 · 그 순간 힌트 단계 · 열린 문항에서만
import { describe, expect, it } from 'vitest';
import { trackPlay } from './question.js';
import type { CurrentQuestion, Player, Room } from '../rooms/types.js';

const T0 = 1_700_000_000_000;

function setup(over: Partial<CurrentQuestion> = {}) {
  const cur = { epoch: 5, startedAt: T0, resolved: false, hintPushed: false, generalHintPushed: false, ...over } as CurrentQuestion;
  const room = { state: 'QUESTION_ACTIVE', currentQuestion: cur, game: { gameId: '1' } } as unknown as Room;
  const p = { accountId: 'A' } as Player;
  return { cur, room, p };
}

describe('trackPlay', () => {
  it('틀린 글은 세고 · 처음 맞힌 때와 그 순간 힌트 단계를 남긴다', () => {
    const { cur, room, p } = setup();
    trackPlay(room, p, { matched: false, accepted: false, receivedAt: T0 + 2_000, epoch: 5 });
    cur.generalHintPushed = true;
    trackPlay(room, p, { matched: false, accepted: false, receivedAt: T0 + 11_000, epoch: 5 });
    trackPlay(room, p, { matched: true, accepted: true, receivedAt: T0 + 12_500, epoch: 5 });
    cur.hintPushed = true;
    trackPlay(room, p, { matched: true, accepted: false, receivedAt: T0 + 21_000, epoch: 5 });
    expect(cur.plays?.get('A')).toEqual({ firstMs: 2_000, wrong: 2, correctMs: 12_500, hintStage: 1, late: false });
  });

  it('공개 뒤 · 다른 epoch · 게임 기록 없음 · 노래면 남기지 않는다', () => {
    const a = setup({ resolved: true });
    trackPlay(a.room, a.p, { matched: false, accepted: false, receivedAt: T0 + 1, epoch: 5 });
    expect(a.cur.plays).toBeUndefined();
    const b = setup();
    trackPlay(b.room, b.p, { matched: false, accepted: false, receivedAt: T0 + 1, epoch: 4 });
    expect(b.cur.plays).toBeUndefined();
    const c = setup();
    (c.room.game as { gameId: string | null }).gameId = null;
    trackPlay(c.room, c.p, { matched: false, accepted: false, receivedAt: T0 + 1, epoch: 5 });
    expect(c.cur.plays).toBeUndefined();
    const d = setup({ song: {} as CurrentQuestion['song'] });
    trackPlay(d.room, d.p, { matched: false, accepted: false, receivedAt: T0 + 1, epoch: 5 });
    expect(d.cur.plays).toBeUndefined();
  });

  it('정답 글이지만 정답자가 못 됐으면 late · 초성 뒤면 2', () => {
    const { cur, room, p } = setup({ hintPushed: true, generalHintPushed: true });
    trackPlay(room, p, { matched: true, accepted: false, receivedAt: T0 + 25_000, epoch: 5 });
    expect(cur.plays?.get('A')).toMatchObject({ correctMs: 25_000, hintStage: 2, late: true, wrong: 0 });
  });
});
