// ★★★ R051 — 미니게임 2차 단위 검사 (번개손 · 타자 · 완벽한 원 · 각도 맞추기 · 소수 자리 · Q-110)
import { describe, expect, it } from 'vitest';
import { MINIGAMES, decimalsFor, decimalsForRanking, formatMinigameValue, minigameReward, minigameSlots } from '../minigame.js';
import {
  REACTION_FAKE_KINDS,
  REACTION_MIN_HUMAN_MS,
  REACTION_ROUNDS,
  reactionJudge,
  reactionPlayMs,
  reactionRounds,
} from './reaction.js';
import { TYPING_EN, TYPING_KO_LONG, TYPING_KO_SHORT } from './typing-sentences.js';
import { typingComplete, typingCorrectPrefix, typingLength, typingMarks, typingProgress, typingRounds } from './typing.js';
import { CIRCLE_MIN_POINTS, circlePointsProblem, circleScore, fitCircle } from './circle.js';
import { balanceItem, balanceSplit, polygonArea } from '../balance.js';
import { angleError, angleOfPoint, angleStart, angleTargets } from './angle.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => (i * 2654435761 + 17) >>> 0);

describe('★★ Q-110 (가) 확정 — 10문제 판은 5번째 뒤 1회 · 혼자는 보상 0', () => {
  it('10문제 → [5]', () => expect(minigameSlots(10)).toEqual([5]));
  it('혼자 → 0', () => expect(minigameReward(1, 1)).toBe(0));
});

describe('★★ 미니게임 목록 — 피지컬 여섯 · 판 수 3~5', () => {
  it('키 여섯 + 퀴즈류 다섯(R052) + 사진 연도(R068)', () =>
    expect(MINIGAMES.map((m) => m.key)).toEqual(['cake', 'balance', 'reaction', 'typing', 'circle', 'angle', 'price', 'worldprice', 'photo', 'estimate', 'photoyear', 'which', 'minority', 'oddone', 'gauge', 'balloon', 'tap']));
  it('피지컬 판 수 3~5 · 예상 1~2분', () => {
    for (const m of MINIGAMES.filter((x) => x.kind === 'physical')) {
      expect(m.rounds).toBeGreaterThanOrEqual(3);
      expect(m.rounds).toBeLessThanOrEqual(5);
      expect(m.estSec).toBeGreaterThanOrEqual(40);
      expect(m.estSec).toBeLessThanOrEqual(120);
    }
  });
});

describe('★★ 소수 자리 — 게임별 (ms 정수 · 각도 최대 둘째 · 나머지 최대 셋째)', () => {
  const info = (k: string) => MINIGAMES.find((m) => m.key === k)!;
  it('번개손 — 접전이어도 0 (ms 정수)', () => expect(decimalsFor(info('reaction'), [231.4, 231.6])).toBe(0));
  it('각도 — 0.004 차이도 둘째에서 멈춤', () => expect(decimalsFor(info('angle'), [1.231, 1.235])).toBe(2));
  it('각도 — 큰 차이는 첫째', () => expect(decimalsFor(info('angle'), [0.5, 3.5])).toBe(1));
  it('타자(초) — 접전 셋째', () => expect(decimalsFor(info('typing'), [6.4821, 6.4836])).toBe(3));
  it('원(%) — 둘째', () => expect(decimalsFor(info('circle'), [92.31, 92.34])).toBe(2));
  it('decimalsForRanking 최대 자리 인자', () => expect(decimalsForRanking([1.0001, 1.0004], 2)).toBe(2));
  it('ms 정수 글', () => expect(formatMinigameValue(231.6, 0)).toBe('232'));
});

describe('★★★ 번개손 — 판 구성 · 판정', () => {
  it('5판 · 1~2 순수 · 3~5 퀵드로우', () => {
    for (const s of SEEDS) {
      const r = reactionRounds(s);
      expect(r.length).toBe(REACTION_ROUNDS);
      expect(r.map((x) => x.quickdraw)).toEqual([false, false, true, true, true]);
      expect(r[0]!.fakes.length + r[1]!.fakes.length).toBe(0);
    }
  });
  it('진짜 신호 1.5~5초 · 가짜 1~2 · 가짜는 0.8초 뒤 · 서로 · 신호와 0.7초 이상', () => {
    for (const s of SEEDS) {
      for (const r of reactionRounds(s)) {
        expect(r.signalMs).toBeGreaterThanOrEqual(1500);
        expect(r.signalMs).toBeLessThanOrEqual(5000);
        if (!r.quickdraw) continue;
        expect(r.fakes.length).toBeGreaterThanOrEqual(1);
        expect(r.fakes.length).toBeLessThanOrEqual(2);
        const times = [...r.fakes.map((f) => f.atMs), r.signalMs];
        expect(times[0]).toBeGreaterThanOrEqual(800);
        for (let i = 1; i < times.length; i += 1) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(700);
        if (r.fakes.length === 2) expect(r.fakes[0]!.kind).not.toBe(r.fakes[1]!.kind);
      }
    }
  });
  it('가짜 종류 — 한 판(미니게임 한 번)에 세 종류가 다 나온다', () => {
    for (const s of SEEDS) {
      const kinds = new Set(reactionRounds(s).flatMap((r) => r.fakes.map((f) => f.kind)));
      expect([...kinds].sort()).toEqual([...REACTION_FAKE_KINDS].sort());
    }
  });
  it('같은 시드 = 같은 판', () => expect(reactionRounds(42)).toEqual(reactionRounds(42)));
  const round = { signalMs: 3000, fakes: [{ atMs: 1500, kind: 'color' as const }] };
  it('정상 — 반응 ms 정수', () => expect(reactionJudge(round, 3231.4)).toEqual({ reactMs: 231, foul: null, fakeKind: null }));
  it('성급 — 신호 전(가짜와 먼 때)', () => expect(reactionJudge(round, 900).foul).toBe('early'));
  it('속음 — 가짜 뒤 1초 안', () => expect(reactionJudge(round, 1700)).toEqual({ reactMs: null, foul: 'fake', fakeKind: 'color' }));
  it('가짜 뒤 1초가 지나 누르면 성급', () => expect(reactionJudge(round, 2600).foul).toBe('early'));
  it(`신호 뒤 ${REACTION_MIN_HUMAN_MS}ms 안 = 성급(예측)`, () => {
    expect(reactionJudge(round, 3099).foul).toBe('early');
    expect(reactionJudge(round, 3100).reactMs).toBe(100);
  });
  it('판 길이 = 신호 + 2초', () => expect(reactionPlayMs(round)).toBe(5000));
});

describe('★★★ 타자 — 문장 목록 · 판 구성 · 완성 · 진행률', () => {
  it('개수 — 한글 40(짧은 22 · 긴 18) · 영어 40', () => {
    expect(TYPING_KO_SHORT.length + TYPING_KO_LONG.length).toBe(40);
    expect(TYPING_EN.length).toBe(40);
  });
  it('길이 15~40 · 짧은 ≤ 25 · 긴 ≥ 26', () => {
    for (const t of [...TYPING_KO_SHORT, ...TYPING_KO_LONG, ...TYPING_EN]) {
      expect(typingLength(t)).toBeGreaterThanOrEqual(15);
      expect(typingLength(t)).toBeLessThanOrEqual(40);
    }
    for (const t of TYPING_KO_SHORT) expect(typingLength(t)).toBeLessThanOrEqual(25);
    for (const t of TYPING_KO_LONG) expect(typingLength(t)).toBeGreaterThanOrEqual(26);
  });
  it('겹침 없음 · 모바일이 바꾸는 글자(따옴표 · 줄표 · 말줄임) 없음 · 앞뒤 공백 없음', () => {
    const all = [...TYPING_KO_SHORT, ...TYPING_KO_LONG, ...TYPING_EN];
    expect(new Set(all).size).toBe(all.length);
    for (const t of all) {
      expect(t).not.toMatch(/['"‘’“”]|--|\.\.\.|…|\s{2}/);
      expect(t.trim()).toBe(t);
    }
  });
  it('판 구성 — 한글 짧은 · 영어 · 한글 긴 · 셋이 다름', () => {
    for (const s of SEEDS) {
      const r = typingRounds(s);
      expect(r.map((x) => `${x.lang}-${x.size}`)).toEqual(['ko-short', 'en-short', 'ko-long']);
      expect(new Set(r.map((x) => x.text)).size).toBe(3);
    }
  });
  it('완성 — 정확히 같아야 (공백 · 구두점) · NFD 도 같다', () => {
    const t = '가는 말이 고와야 오는 말이 곱다.';
    expect(typingComplete(t, t)).toBe(true);
    expect(typingComplete(t, t.slice(0, -1))).toBe(false);
    expect(typingComplete(t, t.replace(' ', ''))).toBe(false);
    expect(typingComplete(t, t.normalize('NFD'))).toBe(true);
  });
  it('진행률 — 앞에서부터 맞은 만큼 · 틀린 뒤는 세지 않음', () => {
    const t = 'Knowledge is power.';
    expect(typingCorrectPrefix(t, 'Know')).toBe(4);
    expect(typingCorrectPrefix(t, 'Knox is power.')).toBe(3);
    expect(typingProgress(t, t)).toBe(1);
  });
  it('표시 — 맞음 · 틀림 · 아직 · 조합 중(틀림으로 안 칠함)', () => {
    expect(typingMarks('각도', '가', 1)).toEqual(['composing', 'todo']);
    expect(typingMarks('각도', '가', 0)).toEqual(['bad', 'todo']);
    expect(typingMarks('각도', '각ㄷ', 1)).toEqual(['ok', 'composing']);
    expect(typingMarks('ab', 'ax', 0)).toEqual(['ok', 'bad']);
  });
});

function ring(n: number, f: (deg: number) => { x: number; y: number }, from = 0, to = 360) {
  return Array.from({ length: n }, (_, i) => f(from + ((to - from) * i) / (n - 1)));
}
const circ = (cx: number, cy: number, r: number) => (d: number) => ({ x: cx + Math.cos((d * Math.PI) / 180) * r, y: cy + Math.sin((d * Math.PI) / 180) * r });

describe('★★★ 완벽한 원 — 원다움 채점', () => {
  it('맞춤 — 정원 중심 · 반지름', () => {
    const f = fitCircle(ring(60, circ(0.4, 0.6, 0.3)))!;
    expect(f.cx).toBeCloseTo(0.4, 6);
    expect(f.cy).toBeCloseTo(0.6, 6);
    expect(f.r).toBeCloseTo(0.3, 6);
  });
  it('정원 → 100 근처', () => expect(circleScore(ring(120, circ(0.5, 0.5, 0.35))).score).toBeGreaterThan(99.9));
  it('정원 — 점 간격이 고르지 않아도 100 근처(길이 기준으로 다시 뽑는다)', () => {
    const pts = ring(400, circ(0.5, 0.5, 0.35), 0, 40).concat(ring(40, circ(0.5, 0.5, 0.35), 40, 360));
    expect(circleScore(pts).score).toBeGreaterThan(99.5);
  });
  it('타원 → 낮아진다 (납작할수록 더)', () => {
    const e = (rx: number, ry: number) => circleScore(ring(120, (d) => ({ x: 0.5 + Math.cos((d * Math.PI) / 180) * rx, y: 0.5 + Math.sin((d * Math.PI) / 180) * ry }))).score;
    expect(e(0.36, 0.32)).toBeLessThan(97);
    expect(e(0.38, 0.28)).toBeLessThan(e(0.36, 0.32));
    expect(e(0.4, 0.15)).toBeLessThan(e(0.38, 0.28));
  });
  it('반원 → "덜 닫힘" 감점', () => {
    const f = circleScore(ring(120, circ(0.5, 0.5, 0.35), 0, 180));
    expect(f.flaw).toBe('open');
    expect(f.score).toBeLessThan(40);
  });
  it('330° (거의 닫힘) → 감점 없음', () => expect(circleScore(ring(120, circ(0.5, 0.5, 0.35), 0, 330)).flaw).toBe(null));
  it('작은 원(지름 14%) → 0', () => {
    const f = circleScore(ring(120, circ(0.5, 0.5, 0.07)));
    expect(f.score).toBe(0);
    expect(f.flaw).toBe('small');
  });
  it('직선 → 0', () => expect(circleScore(ring(50, (d) => ({ x: 0.1 + d / 500, y: 0.5 }))).score).toBe(0));
  it('점 검사 — 부족 · 시각 거꾸로 · 늦음 · 캔버스 밖 · 정상', () => {
    const ok = Array.from({ length: CIRCLE_MIN_POINTS }, (_, i) => [0.5, i / 40, i * 10]);
    expect(circlePointsProblem(ok, 8000)).toBe(null);
    expect(circlePointsProblem(ok.slice(1), 8000)).toBe('too_few');
    expect(circlePointsProblem(ok.map((p, i) => (i === 5 ? [p[0], p[1], 0] : p)), 8000)).toBe('time_not_increasing');
    expect(circlePointsProblem(ok.map((p, i) => (i === 19 ? [p[0], p[1], 9000] : p)), 8000)).toBe('too_late');
    expect(circlePointsProblem(ok.map((p, i) => (i === 3 ? [1.3, p[1], p[2]] : p)), 8000)).toBe('out_of_canvas');
    expect(circlePointsProblem('x', 8000)).toBe('not_array');
  });
});

describe('★★★ 각도 맞추기 — 목표 · 시작 · 각 계산', () => {
  it('목표 — 15~165 · 정수 · 5의 배수 아님 · 셋이 서로 15° 이상', () => {
    for (const s of SEEDS) {
      const t = angleTargets(s);
      expect(t.length).toBe(3);
      for (const a of t) {
        expect(Number.isInteger(a)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(15);
        expect(a).toBeLessThanOrEqual(165);
        expect(a % 5).not.toBe(0);
      }
      expect(new Set(t).size).toBe(3);
      for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) expect(Math.abs(t[i]! - t[j]!)).toBeGreaterThanOrEqual(15);
    }
  });
  it('시작 각 — 목표에서 30° 이상 · 사람마다 다르다', () => {
    for (const s of SEEDS.slice(0, 60)) {
      const t = angleTargets(s)[0]!;
      const a = angleStart(s, '101', 0, t);
      const b = angleStart(s, '202', 0, t);
      expect(Math.abs(a - t)).toBeGreaterThanOrEqual(30);
      expect(Math.abs(b - t)).toBeGreaterThanOrEqual(30);
    }
    expect(angleStart(5, '101', 0, 40)).not.toBe(angleStart(5, '202', 0, 40));
  });
  it('점의 각 — 오른쪽 0 · 위 90 · 왼쪽 180 · 아래는 가까운 끝', () => {
    expect(angleOfPoint(1, 0)).toBe(0);
    expect(angleOfPoint(0, 1)).toBeCloseTo(90, 9);
    expect(angleOfPoint(-1, 0.0000001)).toBeCloseTo(180, 4);
    expect(angleOfPoint(1, 1)).toBeCloseTo(45, 9);
    expect(angleOfPoint(1, -0.2)).toBe(0);
    expect(angleOfPoint(-1, -0.2)).toBe(180);
  });
  it('오차 = |각 − 목표| · 범위 밖은 자른다', () => {
    expect(angleError(40.5, 37)).toBeCloseTo(3.5, 9);
    expect(angleError(33, 37)).toBe(4);
    expect(angleError(190, 170)).toBe(10);
  });
});

describe('★★ R051 E — 딸기 케이크 = 위에서 본 부채꼴 조각 (넓이 다각형 = 새 외곽)', () => {
  it('둥근 모서리 — 이웃 변 사이 꺾임이 모두 40° 미만 · 볼록', () => {
    for (const seed of [1, 77, 2024, 99999]) {
      const o = balanceItem('cake', seed).outer;
      let sign = 0;
      for (let i = 0; i < o.length; i += 1) {
        const a = o[(i + o.length - 1) % o.length]!;
        const b = o[i]!;
        const c = o[(i + 1) % o.length]!;
        const t1 = Math.atan2(b.y - a.y, b.x - a.x);
        const t2 = Math.atan2(c.y - b.y, c.x - b.x);
        let turn = ((t2 - t1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        expect(Math.abs(turn)).toBeLessThan((40 * Math.PI) / 180);
        if (Math.abs(turn) > 1e-9) {
          if (sign === 0) sign = Math.sign(turn);
          expect(Math.sign(turn)).toBe(sign);
        }
      }
    }
  });
  it('세로로 가른 두 쪽 합 = 100 · 넓이 > 0', () => {
    const it2 = balanceItem('cake', 77);
    expect(polygonArea(it2.outer)).toBeGreaterThan(500);
    const s2 = balanceSplit(it2, { top: 50, bottom: 50 });
    expect(s2.aPct + s2.bPct).toBeCloseTo(100, 9);
  });
});
