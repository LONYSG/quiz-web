// =============================================================================
// ★★★ R118 (docs/24 4-2 · 4-7) — 혼자 하기 화면 상태(서버 이벤트를 받아 모은다 · 판정 · 시계의 정본은 서버)
//   solo.started · solo.question · solo.result · solo.end · solo.state(새 탭 · 다시 붙음) · solo.none(도는 판 없음)
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { SoloEndView, SoloMeView, SoloQuestionView, SoloResultView } from '@quiz/shared';

export type SoloPhase = 'start' | 'starting' | 'play' | 'end';

export interface SoloState {
  phase: SoloPhase;
  q: SoloQuestionView | null;
  last: SoloResultView | null;
  lives: number;
  correct: number;
  end: SoloEndView | null;
  error: string | null;
}

const INIT: SoloState = { phase: 'start', q: null, last: null, lives: 3, correct: 0, end: null, error: null };

export async function fetchSoloMe(): Promise<SoloMeView | null> {
  try {
    const r = await fetch('/api/solo/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as SoloMeView;
  } catch {
    return null;
  }
}

export async function fetchBeltCard(accountId: string): Promise<{ belt: number | null; best: number; at: string | null } | null> {
  try {
    const r = await fetch(`/api/solo/belt/${encodeURIComponent(accountId)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as { belt: number | null; best: number; at: string | null };
  } catch {
    return null;
  }
}

export function useSolo(socket: Socket, resume: boolean) {
  const [s, setS] = useState<SoloState>(resume ? { ...INIT, phase: 'starting' } : INIT);
  const phaseRef = useRef(s.phase);
  phaseRef.current = s.phase;

  useEffect(() => {
    const onStarted = (p: { lives: number }) => setS((x) => ({ ...x, phase: 'play', lives: p.lives, correct: 0, q: null, last: null, end: null, error: null }));
    const onQuestion = (q: SoloQuestionView) => setS((x) => ({ ...x, phase: 'play', q, last: null, lives: q.lives, correct: q.correct, error: null }));
    const onResult = (r: SoloResultView) => setS((x) => ({ ...x, last: r, lives: r.lives, correct: r.correct }));
    const onEnd = (e: SoloEndView) => setS((x) => ({ ...x, phase: 'end', end: e, q: x.q }));
    const onState = (p: { lives: number; correct: number; question: SoloQuestionView | null; last: SoloResultView | null }) =>
      setS((x) => ({ ...x, phase: 'play', lives: p.lives, correct: p.correct, q: p.question ?? x.q, last: p.last, error: null }));
    const onNone = () => setS((x) => (x.phase === 'starting' || x.phase === 'play' ? { ...INIT } : x));
    const onError = (e: { code: string; message: string; detail?: string | null }) => {
      if (phaseRef.current !== 'starting') return;
      setS((x) => ({ ...x, phase: 'start', error: e.message }));
    };
    socket.on('solo.started', onStarted);
    socket.on('solo.question', onQuestion);
    socket.on('solo.result', onResult);
    socket.on('solo.end', onEnd);
    socket.on('solo.state', onState);
    socket.on('solo.none', onNone);
    socket.on('error', onError);
    // 다시 붙으면(소켓이 새로 이어지면) 서버가 solo.state 를 보낸다 · 처음 열 때 도는 판이 있으면 묻는다
    if (resume) socket.emit('solo.sync', {});
    return () => {
      socket.off('solo.started', onStarted);
      socket.off('solo.question', onQuestion);
      socket.off('solo.result', onResult);
      socket.off('solo.end', onEnd);
      socket.off('solo.state', onState);
      socket.off('solo.none', onNone);
      socket.off('error', onError);
    };
  }, [socket, resume]);

  const start = useCallback(() => {
    setS({ ...INIT, phase: 'starting' });
    socket.emit('solo.start', {});
  }, [socket]);
  const answer = useCallback((n: number, text: string) => socket.emit('solo.answer', { n, text }), [socket]);
  const away = useCallback((n: number) => socket.emit('solo.away', { n }), [socket]);
  const quit = useCallback(() => socket.emit('solo.quit', {}), [socket]);
  const reset = useCallback(() => setS(INIT), []);
  return { s, start, answer, away, quit, reset };
}
