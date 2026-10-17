// =============================================================================
// ★★ 미니게임 판 시계 (R051) — "이 기기에서 판 시작 신호를 받은 순간"(performance.now) · 케이크 · 균형과 같은 방식
//   네트워크 지연은 받는 순간 · 보내는 순간에만 끼고 잰 시간에는 끼지 않는다(타이밍 공정성).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { MinigameView } from '../useRoom.js';

/** 이 판의 시작 시각(performance.now 기준) — 판이 바뀌면 새로 잡는다 */
export function usePlayT0(view: MinigameView, serverNow: () => number): { key: string; t0: number | null } {
  const key = `${view.token}:${view.roundIndex}`;
  const ref = useRef<{ key: string; t0: number } | null>(null);
  if (view.phase === 'play' && ref.current?.key !== key) {
    ref.current = { key, t0: view.receivedAt ?? performance.now() - Math.max(0, serverNow() - view.phaseStartedAt) };
  }
  return { key, t0: ref.current?.key === key ? ref.current.t0 : null };
}

/** 판 진행 중 매 프레임 다시 그린다 — 지금 performance.now */
export function useFrameNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}
