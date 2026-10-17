// =============================================================================
// ★★★ 번개손 (R051 · D-237) — 초록 화면 반응속도 + 퀵드로우
//
// ★ 화면: 큰 판 하나. 빨강 "준비…" → 진짜 신호 = **초록 + ⚡ + "지금!" + 소리**(동시).
//   가짜(퀵드로우 판) — 색만(노랑 · 글자 그대로) · 소리만(화면 그대로) · 글자만("지금!" 이 빨간 판 위에서 깜빡 · ⚡ 없음).
//   ★ 진짜는 초록만 보고도 알 수 있다(소리를 끈 폰이 불리하지 않게 — reaction.ts 판단).
// ★ 누르기: PC Space · Enter / 모바일 화면 톡 — 한 번만. 누른 순간 내 화면에 바로 판정(서버와 같은 함수) · 서버가 다시 판정한다.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { REACTION_FAKE_SHOW_MS, reactionJudge, type ReactionFake, type ReactionJudge } from '@quiz/shared';
import { Zap } from 'lucide-react';
import Icon from '../Icon.js';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

export default function ReactionTap({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const signalMs = Number(p.signalMs ?? 3000);
  const windowMs = Number(p.windowMs ?? 2000);
  const fakes = (p.fakes as ReactionFake[] | undefined) ?? [];
  const quickdraw = p.quickdraw === true;
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const [pressed, setPressed] = useState<{ key: string; at: number; judge: ReactionJudge } | null>(null);
  const mine = pressed?.key === key ? pressed : null;

  // ★ 실험실 장면은 시간을 멈춘다(view.lab.elapsedMs — 가짜 신호 0.45초를 그림으로 찍으려고)
  const elapsed = view.lab?.elapsedMs ?? (t0 !== null ? Math.max(0, now - t0) : 0);
  const frozen = mine ? mine.at : elapsed; // 누른 뒤에는 그 순간 화면에서 멈춘다
  const go = frozen >= signalMs;
  const fake = !go ? fakes.find((f) => frozen >= f.atMs && frozen < f.atMs + REACTION_FAKE_SHOW_MS) : undefined;
  const over = !mine && elapsed > signalMs + windowMs;

  // ── 소리: 진짜 신호 · 가짜 "소리만" (판마다 한 번씩)
  const soundRef = useRef<{ key: string; done: Set<string> } | null>(null);
  useEffect(() => {
    if (!playing || t0 === null) return;
    if (soundRef.current?.key !== key) soundRef.current = { key, done: new Set() };
    const done = soundRef.current.done;
    for (const f of fakes) {
      const id = `f${f.atMs}`;
      if (f.kind === 'sound' && elapsed >= f.atMs && !done.has(id) && !mine) {
        done.add(id);
        if (elapsed < f.atMs + 250) sfx('mg-signal');
      }
    }
    if (elapsed >= signalMs && !done.has('go')) {
      done.add('go');
      if (!mine && elapsed < signalMs + 250) sfx('mg-signal');
    }
  }, [playing, t0, key, elapsed, fakes, signalMs, mine]);

  const press = () => {
    if (!canPlay || mine || t0 === null || view.selfSubmitted) return;
    const at = performance.now() - t0;
    if (at > signalMs + windowMs) return;
    const judge = reactionJudge({ signalMs, fakes }, at);
    setPressed({ key, at, judge });
    sfx(judge.foul ? 'mg-foul' : 'mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { elapsedMs: at } });
  };

  useEffect(() => {
    if (!canPlay) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter' && e.code !== 'Space') return;
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      press();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  let state: 'wait' | 'go' | 'fake-color' | 'fake-text' | 'foul' | 'done' | 'over' = 'wait';
  if (mine) state = mine.judge.foul ? 'foul' : 'done';
  else if (over) state = 'over';
  else if (go) state = 'go';
  else if (fake?.kind === 'color') state = 'fake-color';
  else if (fake?.kind === 'text') state = 'fake-text';

  const big =
    state === 'go'
      ? '지금!'
      : state === 'fake-text'
        ? '지금!'
        : state === 'foul'
          ? mine?.judge.foul === 'fake'
            ? '속았다!'
            : '성급!'
          : state === 'done'
            ? `${mine?.judge.reactMs ?? 0}ms`
            : state === 'over'
              ? '시간 초과'
              : '준비…';

  return (
    <div
      className={`reaction-stage rx-${state}${mobile ? ' tap' : ''}`}
      data-state={state}
      role="button"
      tabIndex={-1}
      aria-label="누르기"
      onPointerDown={(e) => {
        if (!canPlay) return;
        e.preventDefault();
        press();
      }}
    >
      <div className="rx-panel">
        {state === 'go' && <Icon icon={Zap} className="rx-zap" />}
        <p className="rx-big mono">{big}</p>
        <p className="rx-sub">
          {view.spectating
            ? '구경 중이에요'
            : state === 'foul'
              ? mine?.judge.foul === 'fake'
                ? `가짜 신호(${fakeName(mine.judge.fakeKind)})에 눌렀어요 — 이번 판 실격`
                : '초록이 되기 전에 눌렀어요 — 이번 판 실격'
              : state === 'done'
                ? '좋아요! 다른 사람을 기다리는 중…'
                : state === 'over'
                  ? '2초 안에 누르지 못했어요'
                  : quickdraw
                    ? '진짜 신호는 초록 + 소리 — 가짜에 속지 마세요'
                    : mobile
                      ? '초록이 되면 화면을 톡!'
                      : '초록이 되면 Space / Enter!'}
        </p>
      </div>
    </div>
  );
}

export function fakeName(k: string | null | undefined): string {
  return k === 'color' ? '색' : k === 'sound' ? '소리' : k === 'text' ? '글자' : '?';
}
