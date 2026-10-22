// =============================================================================
// ★★★ 미니게임 3차 화면 (R053 · D-241) — 소수파 게임 · 평균의 2/3 · 다른 하나 찾기 · 게이지 정중앙
//
// ★ 판정은 모두 서버(소수파 · 2/3 은 판 끝 정산 · 다른 하나는 칸 번호 · 게이지는 누른 시각으로 위치를 다시 계산).
// ★ 그림 이모지는 Twemoji SVG(/emoji/<code>.svg) — 기기 글꼴과 무관하게 같은 그림.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { gaugePos } from '@quiz/shared';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';
import { NumberInput } from './QuizParts.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

export const twemoji = (code: string) => `/emoji/${code}.svg`;

function TimeBar({ view, t0, now }: { view: MinigameView; t0: number | null; now: number }) {
  const playMs = view.round?.playMs ?? 10000;
  const left = t0 !== null ? Math.max(0, 1 - (now - t0) / playMs) : 1;
  return (
    <div className="circle-bar" aria-hidden="true">
      <span style={{ width: `${left * 100}%` }} />
    </div>
  );
}

// ── 소수파 게임
export function MinorityPick({ socket, view, serverNow, mobile }: Props) {
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const [pick, setPick] = useState<{ key: string; n: number } | null>(null);
  const mine = pick?.key === key ? pick.n : null;
  const choose = (n: number) => {
    if (!canPlay) return;
    setPick({ key, n });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { pick: n, elapsedMs: t0 !== null ? Math.round(performance.now() - t0) : null } });
  };
  useEffect(() => {
    if (!canPlay) return undefined;
    const on = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!(n >= 1 && n <= 5) || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      choose(n);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  });
  return (
    <div className="quiz-stage minority-stage">
      <TimeBar view={view} t0={t0} now={now} />
      <p className="which-stem">가장 적게 고를 것 같은 숫자는?</p>
      <div className="minority-cards" role="group" aria-label="숫자 고르기">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={`minority-card mono${mine === n ? ' picked' : ''}`} data-n={n} disabled={!canPlay} onClick={() => choose(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="quiz-num-help dim">
        {view.spectating ? '구경 중이에요' : mine ? `${mine} 을(를) 골랐어요 — 시간 안에 바꿀 수 있어요` : mobile ? '숫자 카드를 톡' : '1 ~ 5 키 또는 클릭'}
        {view.participants.length < 3 && ' · 3명부터 더 재미있어요'}
      </p>
    </div>
  );
}

// ── 다른 하나 찾기
export function OddOneGrid({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const size = Number(p.size ?? 4);
  const base = String(p.base ?? '1f436');
  const odd = String(p.odd ?? '1f431');
  const oddIndex = Number(p.oddIndex ?? 0);
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const [st, setSt] = useState<{ key: string; done?: number; wrong: number; flash?: number } | null>(null);
  const mine = st?.key === key ? st : null;
  useEffect(() => {
    const on = (fb: { token: string; roundIndex: number; correct: boolean; timeMs?: number; index?: number; wrong?: number }) => {
      if (fb.token !== view.token || fb.roundIndex !== view.roundIndex) return;
      const k = `${fb.token}:${fb.roundIndex}`;
      setSt((s) => {
        const prev = s?.key === k ? s : { key: k, wrong: 0 };
        return fb.correct ? { ...prev, done: fb.timeMs } : { ...prev, wrong: fb.wrong ?? prev.wrong + 1, flash: fb.index };
      });
      sfx(fb.correct ? 'mg-done' : 'mg-foul');
    };
    socket.on('minigame.feedback', on);
    return () => {
      socket.off('minigame.feedback', on);
    };
  }, [socket, view.token, view.roundIndex]);
  const tap = (i: number) => {
    if (!canPlay || mine?.done !== undefined || t0 === null) return;
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { index: i, elapsedMs: performance.now() - t0 } });
  };
  return (
    <div className={`quiz-stage oddone-stage${mobile ? ' m' : ''}`}>
      <TimeBar view={view} t0={t0} now={now} />
      <div className="oddone-grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }} data-size={size} role="grid" aria-label="그림 격자">
        {Array.from({ length: size * size }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`oddone-cell${mine?.flash === i ? ' wrong' : ''}${mine?.done !== undefined && i === oddIndex ? ' found' : ''}`}
            data-i={i}
            disabled={!canPlay || mine?.done !== undefined}
            onPointerDown={(e) => {
              e.preventDefault();
              tap(i);
            }}
          >
            <img src={twemoji(i === oddIndex ? odd : base)} alt="" draggable={false} />
          </button>
        ))}
      </div>
      <p className={`quiz-num-help${mine?.done !== undefined ? ' ok' : mine?.wrong ? ' bad' : ' dim'}`} data-feedback={mine?.done !== undefined ? 'correct' : mine?.wrong ? 'wrong' : ''}>
        {view.spectating
          ? '구경 중이에요'
          : mine?.done !== undefined
            ? `찾았어요! ${(mine.done / 1000).toFixed(2)}초${mine.wrong ? ` (벌점 +${mine.wrong * 2}초 포함)` : ''}`
            : mine?.wrong
              ? `아니에요 — +${mine.wrong * 2}초 벌점 · 계속 찾으세요`
              : '하나만 다른 그림을 누르세요'}
      </p>
    </div>
  );
}

// ── 게이지 정중앙
export function GaugeStop({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const periodMs = Number(p.periodMs ?? 2000);
  const phase0 = Number(p.phase0 ?? 0);
  const hidden = p.hidden === true;
  const hidePct = Number(p.hidePct ?? 30);
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const [stop, setStop] = useState<{ key: string; at: number } | null>(null);
  const mine = stop?.key === key ? stop : null;
  const elapsed = view.lab?.elapsedMs ?? (t0 !== null ? Math.max(0, (mine ? mine.at : now) - t0) : 0);
  const over = !mine && elapsed >= (view.round?.playMs ?? 10000);
  const pos = gaugePos({ periodMs, phase0 }, elapsed);
  const press = () => {
    if (!canPlay || mine || t0 === null || over) return;
    const at = performance.now();
    setStop({ key, at });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { elapsedMs: at - t0 } });
  };
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    if (!canPlay) return undefined;
    const on = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter' && e.code !== 'Space') return;
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      pressRef.current();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [canPlay]);
  const off = Math.abs(pos - 0.5) * 200;
  return (
    <div
      className={`quiz-stage gauge-stage${mobile ? ' m' : ''}`}
      role="button"
      tabIndex={-1}
      aria-label="멈추기"
      onPointerDown={(e) => {
        if (!canPlay) return;
        e.preventDefault();
        press();
      }}
    >
      <div className="gauge-track" data-hidden={hidden ? '1' : '0'}>
        <span className="gauge-center" aria-hidden="true" />
        {hidden && <span className="gauge-mask" style={{ left: `${50 - hidePct / 2}%`, width: `${hidePct}%` }} aria-hidden="true" />}
        <span className="gauge-marker" style={{ left: `${pos * 100}%` }} aria-hidden="true" />
      </div>
      <p className={`quiz-num-help${mine ? ' ok' : ' dim'}`}>
        {view.spectating
          ? '구경 중이에요'
          : mine
            ? `멈춤! 가운데에서 ${off.toFixed(2)}%`
            : over
              ? '시간이 지났어요'
              : hidden
                ? '가운데가 가려졌어요 — 감으로!'
                : mobile
                  ? '정가운데에서 화면을 톡!'
                  : '정가운데에서 Space / Enter!'}
      </p>
    </div>
  );
}
