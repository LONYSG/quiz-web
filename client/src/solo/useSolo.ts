// =============================================================================
// ★★★ R118 (docs/24 4-2 · 4-7) — 혼자 하기 화면 상태(서버 이벤트를 받아 모은다 · 판정 · 시계의 정본은 서버)
//   solo.started · solo.question · solo.result · solo.end · solo.state(새 탭 · 다시 붙음) · solo.none(도는 판 없음)
// ★★ R123 — solo.wrong(틀린 답 즉시 · wrongSeq 가 오를 때 화면이 입력칸을 흔든다) · solo.item(힌트 · 초성 · 남은 아이템) ·
//   solo.count(해설 중 Enter → 점 카운트) · start(items) · item(n, kind) · next(n)
// ★★ R124 — start = 누른 순간 카운트다운(countEndsAt — 서버 solo.started 의 firstAt 으로 맞춤) ·
//   answer = 친 답이 분명히 틀렸으면(probe 통에 없음) 서버를 기다리지 않고 곧바로 흔든다 — 그 답의 서버 solo.wrong 은 한 번 삼킨다
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { SOLO, answerProbeKeys, probeBucket, type SoloEndView, type SoloItemCounts, type SoloItemKind, type SoloMeView, type SoloQuestionView, type SoloResultView } from '@quiz/shared';

export type SoloPhase = 'start' | 'starting' | 'play' | 'end';

export interface SoloState {
  phase: SoloPhase;
  q: SoloQuestionView | null;
  last: SoloResultView | null;
  lives: number;
  correct: number;
  end: SoloEndView | null;
  error: string | null;
  /** ★ R123 — 틀린 답이 올 때마다 1 씩(같은 값이면 흔들지 않는다) */
  wrongSeq: number;
  /** ★★ R124 — 시작 카운트다운이 끝나는 때(서버 시계 · 첫 문제가 오면 null) */
  countEndsAt: number | null;
}

const INIT: SoloState = { phase: 'start', q: null, last: null, lives: 3, correct: 0, end: null, error: null, wrongSeq: 0, countEndsAt: null };

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

/** ★★ R124 — 친 답이 분명히 틀렸나(열쇠가 어느 통에도 없음). 통이 없으면(옛 서버) 모른다 = false */
export function surelyWrong(q: SoloQuestionView, text: string): boolean {
  const p = q.probe;
  if (!p) return false;
  // 검사용(ui-check --r124 가 옛 길 = 서버를 기다리는 길을 잰다) — 사람 화면에는 이 값이 없다
  try {
    if (localStorage.getItem('qw.solo.noProbe') === '1') return false;
  } catch {
    /* 저장소 없음 — 그대로 */
  }
  const keys = answerProbeKeys(text);
  if (keys.length === 0) return true;
  const set = new Set(p.buckets);
  return !keys.some((k) => set.has(probeBucket(p.salt, k)));
}

export function useSolo(socket: Socket, resume: boolean, serverNow: () => number) {
  const [s, setS] = useState<SoloState>(resume ? { ...INIT, phase: 'starting' } : INIT);
  const phaseRef = useRef(s.phase);
  phaseRef.current = s.phase;
  /** 화면이 먼저 흔든 틀린 답 수(문제 번호별) — 서버의 solo.wrong 을 그만큼 삼킨다 */
  const early = useRef<{ n: number; k: number }>({ n: 0, k: 0 });

  useEffect(() => {
    const onStarted = (p: { lives: number; firstAt?: number }) =>
      setS((x) => ({ ...x, phase: 'play', lives: p.lives, correct: 0, q: null, last: null, end: null, error: null, countEndsAt: p.firstAt ?? x.countEndsAt }));
    const onQuestion = (q: SoloQuestionView) => setS((x) => ({ ...x, phase: 'play', q, last: null, lives: q.lives, correct: q.correct, error: null, countEndsAt: null }));
    const onResult = (r: SoloResultView) => setS((x) => ({ ...x, last: r, lives: r.lives, correct: r.correct }));
    const onEnd = (e: SoloEndView) => setS((x) => ({ ...x, phase: 'end', end: e, q: x.q }));
    const onState = (p: { lives: number; correct: number; question: SoloQuestionView | null; last: SoloResultView | null; firstAt?: number | null }) =>
      setS((x) => ({ ...x, phase: 'play', lives: p.lives, correct: p.correct, q: p.question ?? x.q, last: p.last, error: null, countEndsAt: p.firstAt ?? null }));
    const onNone = () => setS((x) => (x.phase === 'starting' || x.phase === 'play' ? { ...INIT } : x));
    const onWrong = (p: { n: number }) => {
      // 화면이 이미 흔든 답이면 한 번 삼킨다(같은 답에 두 번 흔들지 않게)
      if (early.current.n === p.n && early.current.k > 0) {
        early.current.k -= 1;
        return;
      }
      setS((x) => (x.q?.n === p.n && !x.last ? { ...x, wrongSeq: x.wrongSeq + 1 } : x));
    };
    const onItem = (p: { n: number; kind: SoloItemKind; text: string | null; items: SoloItemCounts; usedHere: SoloItemKind[] }) =>
      setS((x) =>
        x.q?.n === p.n
          ? { ...x, q: { ...x.q, items: p.items, usedHere: p.usedHere, ...(p.kind === 'hint' ? { hint: p.text } : p.kind === 'initial' ? { initial: p.text } : {}) } }
          : x,
      );
    const onCount = (p: { n: number; countAt: number; nextAt: number }) =>
      setS((x) => (x.last?.n === p.n ? { ...x, last: { ...x.last, countAt: p.countAt, nextAt: p.nextAt } } : x));
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
    socket.on('solo.wrong', onWrong);
    socket.on('solo.item', onItem);
    socket.on('solo.count', onCount);
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
      socket.off('solo.wrong', onWrong);
      socket.off('solo.item', onItem);
      socket.off('solo.count', onCount);
      socket.off('error', onError);
    };
  }, [socket, resume]);

  const start = useCallback(
    (items?: SoloItemCounts) => {
      // ★★ R124 — 누른 순간 3 · 2 · 1(서버의 firstAt 이 오면 그 값으로 맞춘다 · 준비는 그 사이 서버에서)
      setS({ ...INIT, phase: 'starting', countEndsAt: serverNow() + SOLO.START_COUNT_MS });
      socket.emit('solo.start', items ? { items } : {});
    },
    [socket, serverNow],
  );
  const answer = useCallback(
    (q: SoloQuestionView, text: string) => {
      socket.emit('solo.answer', { n: q.n, text });
      if (!surelyWrong(q, text)) return;
      if (early.current.n !== q.n) early.current = { n: q.n, k: 0 };
      early.current.k += 1;
      setS((x) => (x.q?.n === q.n && !x.last ? { ...x, wrongSeq: x.wrongSeq + 1 } : x));
    },
    [socket],
  );
  const away = useCallback((n: number) => socket.emit('solo.away', { n }), [socket]);
  const quit = useCallback(() => socket.emit('solo.quit', {}), [socket]);
  const item = useCallback((n: number, kind: SoloItemKind) => socket.emit('solo.item', { n, kind }), [socket]);
  const next = useCallback((n: number) => socket.emit('solo.next', { n }), [socket]);
  const reset = useCallback(() => setS(INIT), []);
  return { s, start, answer, away, quit, item, next, reset };
}
