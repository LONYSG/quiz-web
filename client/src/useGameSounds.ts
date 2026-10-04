// =============================================================================
// 게임 소리 연결 (R033) — 방 상태가 바뀌는 순간에 효과음을 낸다
//
// ★ 서버 이벤트를 따로 듣지 않는다. **화면이 보는 스냅샷의 변화**만 본다.
//   ★ 근거: 소리는 "화면에 보이는 일" 에 붙어야 한다. 스냅샷이 화면의 정본이다.
//
// ★★ 오답에는 소리가 없다 (건우 확정). 채팅 메시지에는 아무 소리도 붙이지 않는다.
//
// 넣은 소리 (판단 — 다양하게, 다만 시끄럽지 않게)
//   입장(다른 사람이 들어옴) / 카운트다운 5·4·3·2·1 / 시작 / 문제 등장 / 힌트 공개(20초·10초) /
//   마지막 5초 똑딱 / ★ 정답(정답자가 나면 내가 맞혔을 때 반짝 덧붙임) / 시간 종료 / 넘김 /
//   일시정지·재개 / 결과 화면
// =============================================================================

import { useEffect, useRef } from 'react';
import { setDuck, sfx } from './sound.js';
import type { RoomSnapshot } from './useRoom.js';

export function useGameSounds(snapshot: RoomSnapshot, serverNow: () => number): void {
  const prev = useRef<{
    state: string;
    epoch: number | null;
    hintRevealed: boolean;
    generalHint: boolean;
    resolvedEpoch: number | null;
    hasResult: boolean;
    players: number;
    paused: boolean;
  } | null>(null);

  const state = snapshot.room.state;
  const q = snapshot.question;
  const res = snapshot.resolution;

  useEffect(() => {
    const now = {
      state,
      epoch: q?.epoch ?? null,
      hintRevealed: Boolean(q?.hintRevealed),
      generalHint: Boolean(q?.generalHint),
      resolvedEpoch: res?.epoch ?? null,
      hasResult: Boolean(snapshot.result),
      players: snapshot.players.length,
      paused: Boolean(snapshot.paused),
    };
    const p = prev.current;
    prev.current = now;
    // ★ 처음 그릴 때(입장·재접속)는 소리를 내지 않는다 — 이미 지난 일을 다시 울리지 않는다
    if (!p) return;

    if (now.players > p.players && state === 'LOBBY') sfx('join');
    if (now.epoch !== null && now.epoch !== p.epoch) sfx(p.state === 'COUNTDOWN' ? 'go' : 'question');
    else {
      if (now.generalHint && !p.generalHint) sfx('hint');
      if (now.hintRevealed && !p.hintRevealed) sfx('hint');
    }
    if (now.resolvedEpoch !== null && now.resolvedEpoch !== p.resolvedEpoch && res) {
      if (res.reason === 'correct') {
        sfx(res.winnerAccountId === snapshot.me.accountId ? 'mine' : 'correct');
      } else if (res.reason === 'timeout') sfx('timeout');
      else if (res.reason === 'skip_vote' || res.reason === 'host_skip') sfx('skip');
    }
    if (now.hasResult && !p.hasResult) sfx('result');
    if (now.paused && !p.paused) sfx('pause');
    if (!now.paused && p.paused) sfx('resume');
    // ★ 문제를 푸는 동안 배경음악을 조금 줄인다 — 지문에 집중하게
    setDuck(state === 'QUESTION_ACTIVE');
  });

  // ── 카운트다운 / 마지막 5초 — 초가 바뀔 때마다
  const countdownEnds = snapshot.countdown?.endsAt ?? null;
  const questionEnds = state === 'QUESTION_ACTIVE' && q ? q.endsAt : null;
  useEffect(() => {
    const target = countdownEnds ?? questionEnds;
    if (target === null) return undefined;
    const isCountdown = countdownEnds !== null;
    let last = Math.ceil((target - serverNow()) / 1000);
    const id = setInterval(() => {
      const sec = Math.ceil((target - serverNow()) / 1000);
      if (sec !== last && sec >= 1) {
        if (isCountdown && sec <= 5) sfx('tick');
        if (!isCountdown && sec <= 5) sfx('urgent');
      }
      last = sec;
    }, 100);
    return () => clearInterval(id);
  }, [countdownEnds, questionEnds, serverNow]);

  // 방을 떠나면 원래 음량으로
  useEffect(() => () => setDuck(false), []);
}
