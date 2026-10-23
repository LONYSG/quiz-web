// =============================================================================
// ★★ /lab/minigame — 미니게임 그림 · 장면 모음 (R050 · 로그인한 사람만 · 화면 점검용)
//
// ★ 왜: 균형의수호자 물건 그림 품질(찬종 · 설계 에이전트가 보고 Fable 재작업 여부를 정한다)과 단계별 장면을
//   **정해진 데이터**로 한 화면에 모아 본다. 실제 판(ui-check:minigame)은 무작위 시드라 물건 넷이 다 나오지 않을 수 있다.
// ★ 장면은 MinigameStage 를 그대로 쓰고, 보기(view)만 가짜다 — 서버에 아무것도 보내지 않는다(socket 자리에 빈 객체).
// =============================================================================

import { useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  BALANCE_BOTTOM_Y,
  BALANCE_TOP_Y,
  TYPING_KO_SHORT,
  QUIZ_DUMMY,
  balanceItem,
  balanceSplit,
  circleScore,
  circleThumb,
  minigameInfo,
  type BalanceKind,
  type MinigameKey,
  type MinigamePhase,
} from '@quiz/shared';
import BalanceArt from '../minigame/BalanceArt.js';
import { CakeArt } from '../minigame/CakeWait.js';
import MinigameStage from '../minigame/MinigameStage.js';
import type { MinigameView, PlayerView } from '../useRoom.js';

const KINDS: BalanceKind[] = ['steak', 'pizza', 'cake', 'donut'];
const fakeSocket = { emit: () => undefined, on: () => undefined, off: () => undefined } as unknown as Socket;

const PEOPLE = [
  { accountId: 'lab1', nickname: '자지푸딩', colorIndex: 0, device: 'pc' as const },
  { accountId: 'lab2', nickname: '이천쌀라', colorIndex: 1, device: 'mobile' as const },
  { accountId: 'lab3', nickname: '마늘빵', colorIndex: 2, device: 'pc' as const },
  { accountId: 'lab4', nickname: '오버플로우', colorIndex: 3, device: 'mobile' as const },
];

function fakeView(key: MinigameKey, phase: MinigamePhase, seed: number): MinigameView {
  const now = Date.now();
  const kind: BalanceKind = (['steak', 'pizza', 'donut'] as BalanceKind[])[seed % 3]!;
  const item = balanceItem(kind, seed);
  const cuts = [
    { top: 49.2, bottom: 51.1 },
    { top: 46, bottom: 54.5 },
    { top: 52, bottom: 41 },
    null,
  ];
  const quiz = r052Scene(key, phase) ?? r053Scene(key) ?? r054Scene(key);
  const rows = quiz
    ? quiz.rows
    : key === 'reaction' || key === 'typing' || key === 'circle' || key === 'angle'
      ? r051Rows(key)
      : key === 'cake'
      ? [
          { accountId: 'lab1', submitted: true, value: 0.012, error: -0.012, rank: 1, points: 4, extra: null },
          { accountId: 'lab3', submitted: true, value: 0.031, error: 0.031, rank: 2, points: 3, extra: null },
          { accountId: 'lab2', submitted: true, value: 0.284, error: -0.284, rank: 3, points: 2, extra: null },
          { accountId: 'lab4', submitted: false, value: null, error: null, rank: 4, points: 0, extra: null },
        ]
      : cuts
          .map((c, i) => {
            if (!c) return { accountId: PEOPLE[i]!.accountId, submitted: false, value: null, error: null, rank: 4, points: 0, extra: null };
            const s = balanceSplit(item, c);
            return { accountId: PEOPLE[i]!.accountId, submitted: true, value: s.smallPct, error: s.aPct, rank: 0, points: 0, extra: { ...c, aPct: s.aPct, bPct: s.bPct } };
          })
          .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
          .map((r, i) => ({ ...r, rank: r.submitted ? i + 1 : 4, points: r.submitted ? 4 - i : 0 }));
  const decimals = quiz ? 1 : key === 'reaction' ? 0 : key === 'cake' ? 2 : (() => {
    const v = rows.filter((r) => r.value !== null).map((r) => r.value as number);
    for (let d = 1; d <= 3; d += 1) if (v.length < 2 || v[0]!.toFixed(d) !== v[1]!.toFixed(d)) return d;
    return 3;
  })();
  // ★ R051 — 장면 상태 (?state= — 번개손 wait/fake-color/fake-text/go · 타자 typed 글 · 원 · 각도는 기본)
  const sceneState = new URLSearchParams(window.location.search).get('state') ?? '';
  const playAgo = key === 'reaction' ? ({ wait: 600, 'fake-color': 1300, 'fake-text': 1300, go: 3050 } as Record<string, number>)[sceneState] ?? 600 : 2300;
  const roundParams = quiz
    ? quiz.params
    : key === 'reaction'
      ? { quickdraw: true, signalMs: 3000, windowMs: 2000, fakes: [{ atMs: 1200, kind: sceneState === 'fake-text' ? 'text' : 'color' }] }
      : key === 'typing'
        ? { lang: 'ko', size: 'short', text: TYPING_KO_SHORT[0] }
        : key === 'circle'
          ? { playMs: 8000 }
          : key === 'angle'
            ? { target: 37 }
            : key === 'cake'
      ? { durationSec: 10, speed: 1, hideAfterSec: 5, targetMs: 10000, lateMs: 3000, rhythmSeed: 1 }
      : { kind, itemSeed: seed, label: item.label };
  return {
    token: `lab-${key}-${phase}`,
    key,
    practice: false,
    phase,
    phaseStartedAt: now,
    phaseEndsAt: now + 99_000,
    roundIndex: phase === 'intro' || phase === 'rules' ? -1 : 0,
    roundCount: quiz ? 5 : minigameInfo(key).rounds,
    round:
      phase === 'intro' || phase === 'rules' || phase === 'final' || phase === 'outro'
        ? null
        : {
            params: roundParams,
            playMs: quiz ? quiz.playMs : key === 'cake' ? 13000 : key === 'reaction' ? 5000 : key === 'typing' ? 30000 : key === 'circle' ? 8000 : 10000,
            private: key === 'balance' ? { start: { top: 31, bottom: 70 } } : key === 'angle' ? { start: 58 } : quiz && sceneState === 'seen' ? { experienced: true } : null,
            reveal: phase === 'roundResult' && quiz ? quiz.reveal : null,
            itemId: null,
          },
    participants: PEOPLE,
    submittedCount: 1,
    selfSubmitted: false,
    spectating: false,
    roundResults: phase === 'roundResult' ? [{ roundIndex: 0, decimals, rows }] : [],
    totals: [],
    // ★ R060 — ?series=1/3 (미니게임만 사이 문구) · ?tie=1 (공동 1위)
    series: (() => {
      const m = /^(\d+)\/(\d+)$/.exec(new URLSearchParams(window.location.search).get('series') ?? '');
      return m ? { index: Number(m[1]), total: Number(m[2]) } : null;
    })(),
    final:
      phase === 'final' && new URLSearchParams(window.location.search).get('tie') === '1'
        ? [
            { accountId: 'lab1', rank: 1, total: 11, reward: 3 },
            { accountId: 'lab3', rank: 1, total: 11, reward: 3 },
            { accountId: 'lab2', rank: 3, total: 8, reward: 0 },
            { accountId: 'lab4', rank: 4, total: 2, reward: 0 },
          ]
        : phase === 'final'
        ? [
            { accountId: 'lab1', rank: 1, total: 13, reward: 3 },
            { accountId: 'lab3', rank: 2, total: 10, reward: 1 },
            { accountId: 'lab2', rank: 3, total: 8, reward: 0 },
            { accountId: 'lab4', rank: 4, total: 2, reward: 0 },
          ]
        : null,
    afterQuestionIndex: 10,
    receivedAt: performance.now() - (phase === 'play' ? playAgo : 0),
    lab:
      key === 'balloon' && phase === 'play'
        ? { elapsedMs: Number(new URLSearchParams(window.location.search).get('at') ?? 6500) }
        : key === 'gauge' && phase === 'play'
        ? { elapsedMs: Number(new URLSearchParams(window.location.search).get('at') ?? 700) }
        : key === 'photo' && phase === 'play'
        ? { elapsedMs: Number(new URLSearchParams(window.location.search).get('at') ?? 2000) }
        : key === 'reaction' && phase === 'play'
        ? { elapsedMs: playAgo }
        : key === 'typing' && sceneState === 'typed'
          ? { typed: `${[...TYPING_KO_SHORT[0]!].slice(0, 6).join('')}리 ㄱ`, composing: true }
          : undefined,
  };
}

/** ★ R051 — 손으로 그린 듯한 원(흔들림) · 반원 */
function wobblyCircle(cx: number, cy: number, r: number, wob: number, from = 0, to = 360) {
  const pts: { x: number; y: number }[] = [];
  for (let d = from; d <= to; d += 4) {
    const a = (d * Math.PI) / 180;
    const rr = r * (1 + wob * Math.sin(d / 23) + wob * 0.6 * Math.cos(d / 9));
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}

function r051Rows(key: 'reaction' | 'typing' | 'circle' | 'angle') {
  const base = (id: string, value: number | null, rank: number, points: number, extra: Record<string, unknown> | null, error: number | null = null, submitted = true) => ({
    accountId: id,
    submitted,
    value,
    error,
    rank,
    points,
    extra,
  });
  if (key === 'reaction')
    return [
      base('lab1', 231, 1, 4, { reactMs: 231, foul: null, fakeKind: null }, 231),
      base('lab3', 268, 2, 3, { reactMs: 268, foul: null, fakeKind: null }, 268),
      base('lab2', null, 3, 0, { reactMs: null, foul: 'fake', fakeKind: 'color' }),
      base('lab4', null, 3, 0, { reactMs: null, foul: 'early', fakeKind: null }),
    ];
  if (key === 'typing')
    return [
      base('lab1', 6.482, 1, 4, { timeSec: 6.482, pct: 100 }, 6.482),
      base('lab3', 7.915, 2, 3, { timeSec: 7.915, pct: 100 }, 7.915),
      base('lab2', 1031.6, 3, 2, { unfinished: true, pct: 68.4 }, null, false),
      base('lab4', null, 4, 0, null, null, false),
    ];
  if (key === 'circle') {
    const shapes = [wobblyCircle(0.5, 0.5, 0.33, 0.02), wobblyCircle(0.48, 0.52, 0.3, 0.06), wobblyCircle(0.5, 0.5, 0.3, 0.03, 20, 250), null];
    const rows = shapes.map((pts, i) => {
      if (!pts) return base(`lab${i + 1}`, null, 4, 0, null, null, false);
      const f = circleScore(pts);
      return base(`lab${i + 1}`, f.score, 0, 0, { stroke: circleThumb(pts), cx: f.cx, cy: f.cy, r: f.r, coverageDeg: Math.round(f.coverageDeg), flaw: f.flaw }, f.dev);
    });
    return rows
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
      .map((r, i) => ({ ...r, rank: r.value !== null ? i + 1 : 4, points: r.value !== null ? 4 - i : 0 }));
  }
  return [
    base('lab1', 0.5, 1, 4, { deg: 37.5, target: 37 }, 0.5),
    base('lab3', 2.5, 2, 3, { deg: 34.5, target: 37 }, -2.5),
    base('lab2', 6, 3, 2, { deg: 43, target: 37 }, 6),
    base('lab4', 21, 4, 1, { deg: 58, target: 37 }, 21),
  ];
}

/**
 * ★★★ R052 — 퀴즈류 장면(더미 문항 · ?image=<그림 id> 를 주면 실제 그림 · ?mode=zoom|mosaic|plain · ?at=ms 사진 드러남 시각 · ?state=seen 이미 본 문항)
 */
function r052Scene(key: MinigameKey, phase: MinigamePhase) {
  if (!['price', 'worldprice', 'photo', 'estimate', 'which'].includes(key)) return null;
  const q = new URLSearchParams(window.location.search);
  const image = q.get('image');
  const row = (id: string, rank: number, points: number, extra: Record<string, unknown> | null, value: number | null, submitted = true) => ({ accountId: id, submitted, value, error: null, rank, points, extra });
  if (key === 'price') {
    const d = QUIZ_DUMMY.price[0];
    return {
      playMs: 12000,
      params: { name: d.name, brand: d.brand, category: d.category, imageId: image, dummy: !image },
      reveal: { priceKrw: d.priceKrw, note: d.note, attribution: image ? '(그림 출처)' : null },
      rows: [
        row('lab1', 1, 4, { guess: 12000, pct: -2.79 }, 0.028),
        row('lab3', 2, 3, { guess: 15000, pct: 21.51 }, 0.195),
        row('lab2', 3, 2, { guess: 5000, pct: -59.5 }, 0.904),
        row('lab4', 4, 0, null, null, false),
      ],
    };
  }
  if (key === 'worldprice') {
    const d = QUIZ_DUMMY.worldprice[0];
    const rows = [...d.rows].sort((a, b) => a.krw - b.krw);
    return {
      playMs: 12000,
      params: { nameKo: d.nameKo, unit: d.unit, imageId: image, target: { cc: 'XB', countryKo: '나나라(연습)' }, shown: d.rows.filter((r) => ['KR', 'XA', 'XC'].includes(r.cc)), fxAsOf: d.fxAsOf, dummy: !image },
      reveal: { targetKrw: 8000, targetLocal: 8, currency: 'XBB', rows, fxAsOf: d.fxAsOf },
      rows: [row('lab1', 1, 4, { guess: 7500, pct: -6.25 }, 0.065), row('lab3', 2, 3, { guess: 10000, pct: 25 }, 0.223), row('lab2', 3, 2, { guess: 4000, pct: -50 }, 0.693), row('lab4', 4, 0, null, null, false)],
    };
  }
  if (key === 'photo') {
    const mode = q.get('mode') ?? 'zoom';
    return {
      playMs: 20000,
      params: { imageId: image, dummyShape: 'circle', revealMode: mode, revealMs: 15000, dummy: !image },
      reveal: { answer: image ? '(정답)' : '동그라미', explanation: '연습용 설명이에요.', attribution: image ? '(그림 출처)' : null },
      rows: [row('lab3', 1, 4, { timeSec: 3.2, tries: 1 }, 3200), row('lab1', 2, 3, { timeSec: 6.9, tries: 3 }, 6900), row('lab2', 3, 0, { tries: 2 }, null, false), row('lab4', 3, 0, null, null, false)],
    };
  }
  if (key === 'estimate') {
    const d = QUIZ_DUMMY.estimate[0];
    // ★ R060 — ?unit=광년&value=… — 긴 단위 줄바꿈 그림
    const unit = q.get('unit') ?? d.unit;
    const value = q.get('value') !== null ? Number(q.get('value')) : d.value;
    return {
      playMs: 12000,
      params: { question: d.question, unit, kind: 'weight', imageId: image, displayDecimals: 0, dummy: !image },
      reveal: { value, unit, displayDecimals: 0, note: '40~45kg', explanation: d.explanation },
      rows: [row('lab1', 1, 4, { guess: 40, pct: -4.76 }, 0.049), row('lab2', 2, 3, { guess: 60, pct: 42.86 }, 0.357), row('lab3', 3, 2, { guess: 10, pct: -76.19 }, 1.435), row('lab4', 4, 0, null, null, false)],
    };
  }
  const d = QUIZ_DUMMY.which[0];
  return {
    playMs: 6000,
    params: { stem: d.stem, kind: d.kind, unit: d.unit, a: { label: d.a.label, imageId: image }, b: { label: d.b.label, imageId: null }, dummy: true },
    reveal: { answer: d.answer, a: d.a.value, b: d.b.value, unit: d.unit, margin: 2.33 },
    rows: [row('lab1', 1, 1, { choice: 'a', correct: true }, 820), row('lab3', 2, 1, { choice: 'a', correct: true }, 1410), row('lab2', 3, 0, { choice: 'b', correct: false }, null), row('lab4', 3, 0, null, null, false)],
  };
}

/** ★★ R054 — 풍선 · 연타 장면 (?state=popped 풍선 터짐) */
function r054Scene(key: MinigameKey) {
  if (key !== 'balloon' && key !== 'tap') return null;
  const popped = new URLSearchParams(window.location.search).get('state') === 'popped';
  const row = (id: string, rank: number, points: number, extra: Record<string, unknown> | null, value: number | null, submitted = true) => ({ accountId: id, submitted, value, error: null, rank, points, extra });
  if (key === 'balloon')
    return {
      // ★ R063 — 펌프 규칙(딱 100 만점 · 넘으면 펑)
      playMs: 12000,
      params: { target: 100 },
      reveal: {},
      rows: popped
        ? [row('lab3', 1, 4, { size: 100, popped: false }, 100), row('lab2', 2, 3, { size: 92, popped: false }, 92), row('lab1', 3, 0, { size: 108, popped: true }, 0), row('lab4', 3, 0, null, null, false)]
        : [row('lab1', 1, 4, { size: 100, popped: false }, 100), row('lab3', 2, 3, { size: 92, popped: false }, 92), row('lab2', 3, 0, { size: 108, popped: true }, 0), row('lab4', 3, 0, null, null, false)],
    };
  return {
    playMs: 10000,
    params: { maxPerSec: 20 },
    reveal: null,
    rows: [row('lab1', 1, 4, { count: 71 }, 71), row('lab3', 2, 3, { count: 64 }, 64), row('lab2', 3, 2, { count: 52 }, 52), row('lab4', 4, 0, null, null, false)],
  };
}

/** ★★★ R053 — 미니게임 3차 장면 (?state=hidden 게이지 가림 · ?size= 다른 하나 격자) */
function r053Scene(key: MinigameKey) {
  if (!['minority', 'oddone', 'gauge'].includes(key)) return null;
  const q = new URLSearchParams(window.location.search);
  const row = (id: string, rank: number, points: number, extra: Record<string, unknown> | null, value: number | null, submitted = true) => ({ accountId: id, submitted, value, error: null, rank, points, extra });
  if (key === 'minority')
    return {
      playMs: 8000,
      params: { choices: [1, 2, 3, 4, 5] },
      reveal: { counts: { 1: 0, 2: 2, 3: 1, 4: 1, 5: 0 }, minority: [3, 4] },
      rows: [row('lab1', 1, 1, { pick: 3, win: true }, 1), row('lab3', 1, 1, { pick: 4, win: true }, 1), row('lab2', 3, 0, { pick: 2, win: false }, null), row('lab4', 3, 0, { pick: 2, win: false }, null)],
    };
  if (key === 'oddone') {
    const size = Number(q.get('size') ?? 4);
    return {
      playMs: 10000,
      params: { size, base: size >= 6 ? '1f600' : '1f436', odd: size >= 6 ? '1f603' : '1f431', oddIndex: Math.floor((size * size) / 2) + 1, penaltyMs: 2000 },
      reveal: null,
      rows: [row('lab3', 1, 4, { wrong: 0, timeMs: 1840 }, 1840), row('lab1', 2, 3, { wrong: 1, timeMs: 4210 }, 4210), row('lab2', 3, 0, { wrong: 2 }, null, false), row('lab4', 3, 0, null, null, false)],
    };
  }
  const hidden = q.get('state') === 'hidden';
  return {
    playMs: 10000,
    params: { periodMs: hidden ? 900 : 2000, phase0: 0, hidden, hidePct: 30 },
    reveal: null,
    rows: [row('lab1', 1, 4, { pos: 0.503 }, 0.62), row('lab3', 2, 3, { pos: 0.46 }, 8), row('lab2', 3, 2, { pos: 0.8 }, 60), row('lab4', 4, 0, null, null, false)],
  };
}

export default function LabMinigame({ myAccountId }: { myAccountId: string }) {
  const q = new URLSearchParams(window.location.search);
  const scene = q.get('scene');
  const key = (q.get('key') as MinigameKey) ?? 'balance';
  const phase = (q.get('phase') as MinigamePhase) ?? 'play';
  const seed = Number(q.get('seed') ?? 2024);
  const [kindSeed] = useState(() => Number(q.get('itemSeed') ?? 77));
  const players: PlayerView[] = useMemo(
    () => PEOPLE.map((p, i) => ({ accountId: p.accountId, nickname: p.nickname, colorIndex: p.colorIndex, connected: true, isHost: i === 0, joinOrder: i, score: 0, avatarV: null, device: p.device })),
    [],
  );

  if (scene) {
    // 한 장면 (ui-check 가 찍는다)
    const view = fakeView(key, phase, seed);
    return (
      <div className="lab-scene" data-scene={`${key}-${phase}`}>
        <MinigameStage socket={fakeSocket} view={view} players={players} myAccountId={'lab1'} isHost serverNow={() => Date.now()} />
      </div>
    );
  }

  return (
    <div className="lab-page">
      <h1>미니게임 그림 모음</h1>
      <p className="dim">균형의수호자 물건 넷 (시드 {kindSeed}) · 같은 시드면 모두에게 같은 그림 · 테두리 = 서버가 넓이를 재는 다각형 · 내 계정 {myAccountId}</p>
      <div className="lab-items">
        {KINDS.map((k) => {
          const item = balanceItem(k, kindSeed);
          return (
            <figure key={k} className="lab-item" data-kind={k}>
              <svg viewBox="0 0 100 100" className="balance-svg">
                <BalanceArt item={item} />
                <line x1={0} y1={BALANCE_TOP_Y} x2={100} y2={BALANCE_TOP_Y} className="balance-rail" />
                <line x1={0} y1={BALANCE_BOTTOM_Y} x2={100} y2={BALANCE_BOTTOM_Y} className="balance-rail" />
              </svg>
              <figcaption>{item.label}</figcaption>
            </figure>
          );
        })}
      </div>
      <div className="lab-items">
        {[11, 222, 3333, 44444].map((s) => (
          <figure key={s} className="lab-item small">
            <svg viewBox="0 0 100 100" className="balance-svg">
              <BalanceArt item={balanceItem(KINDS[s % 4]!, s)} />
            </svg>
            <figcaption className="mono">
              {KINDS[s % 4]} · {s}
            </figcaption>
          </figure>
        ))}
        <figure className="lab-item small">
          <CakeArt open={false} />
          <figcaption>케이크 (오븐)</figcaption>
        </figure>
        <figure className="lab-item small">
          <CakeArt open />
          <figcaption>케이크 (나옴)</figcaption>
        </figure>
      </div>
    </div>
  );
}
