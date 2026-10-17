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
  const rows =
    key === 'reaction' || key === 'typing' || key === 'circle' || key === 'angle'
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
  const decimals = key === 'reaction' ? 0 : key === 'cake' ? 2 : (() => {
    const v = rows.filter((r) => r.value !== null).map((r) => r.value as number);
    for (let d = 1; d <= 3; d += 1) if (v.length < 2 || v[0]!.toFixed(d) !== v[1]!.toFixed(d)) return d;
    return 3;
  })();
  // ★ R051 — 장면 상태 (?state= — 번개손 wait/fake-color/fake-text/go · 타자 typed 글 · 원 · 각도는 기본)
  const sceneState = new URLSearchParams(window.location.search).get('state') ?? '';
  const playAgo = key === 'reaction' ? ({ wait: 600, 'fake-color': 1300, 'fake-text': 1300, go: 3050 } as Record<string, number>)[sceneState] ?? 600 : 2300;
  const roundParams =
    key === 'reaction'
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
    roundCount: minigameInfo(key).rounds,
    round:
      phase === 'intro' || phase === 'rules' || phase === 'final' || phase === 'outro'
        ? null
        : {
            params: roundParams,
            playMs: key === 'cake' ? 13000 : key === 'reaction' ? 5000 : key === 'typing' ? 30000 : key === 'circle' ? 8000 : 10000,
            private: key === 'balance' ? { start: { top: 31, bottom: 70 } } : key === 'angle' ? { start: 58 } : null,
          },
    participants: PEOPLE,
    submittedCount: 1,
    selfSubmitted: false,
    spectating: false,
    roundResults: phase === 'roundResult' ? [{ roundIndex: 0, decimals, rows }] : [],
    totals: [],
    final:
      phase === 'final'
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
      key === 'reaction' && phase === 'play'
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
