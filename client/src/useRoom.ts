// =============================================================================
// 방 상태 구독
//
// ★ room.state 스냅샷을 정본으로 삼고, 개별 이벤트는 그 위에 부분 갱신을 얹는다.
//   스냅샷 하나로 중간 참가 / 재접속 / resync 를 모두 처리하므로(R003 3-4)
//   클라이언트도 같은 코드 경로를 쓴다.
//
// ★ 클라이언트는 서버 상태를 표시하고 입력을 전달하는 역할만 한다 (guide 44절).
//   여기서 게임 판정이나 상태 전환을 하지 않는다.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export interface PlayerView {
  accountId: string;
  nickname: string;
  colorIndex: number;
  connected: boolean;
  isHost: boolean;
  joinOrder: number;
  score: number;
}

export interface ChatView {
  id: string;
  seq: number;
  accountId: string;
  nickname: string;
  colorIndex: number;
  text: string;
  masked: boolean;
  ts: number;
  system: boolean;
}

export interface ExperienceRate {
  accountId: string;
  experienced: number;
  total: number;
}

export interface RoomSettings {
  questionCount: number;
  startMode: 'instant' | 'countdown';
  countdownSec: number;
}

/** 진행 중인 문제. ★ 정답은 들어 있지 않다 (QUESTION_ACTIVE 중) */
export interface QuestionView {
  epoch: number;
  index: number;
  total: number;
  text: string;
  /** ★ 대분류다. 소분류 이름은 힌트가 되므로 서버가 보내지 않는다 */
  categoryName: string;
  startedAt: number;
  endsAt: number;
  experiencedNicknames: string[];
  selfExperienced: boolean;
  /** ★ 남은 10초부터만 값이 있다 */
  hint: string | null;
  hintRevealed: boolean;
}

/** 정답 공개 구간 */
export interface ResolutionView {
  epoch: number;
  reason: 'correct' | 'timeout' | 'skip_vote' | 'host_skip' | 'aborted';
  winnerAccountId: string | null;
  displayAnswer: string;
  explanation: string | null;
  nextAt: number | null;
  index: number;
  text: string;
}

/** 스킵 투표 현황. ★ 투표자 명단은 오지 않는다 */
export interface SkipView {
  votes: number;
  threshold: number | null;
  selfVoted: boolean;
}

export interface GameResultView {
  gameId: string | null;
  endReason: string;
  ranking: {
    rank: number;
    accountId: string;
    nickname: string;
    colorIndex: number;
    score: number;
    connected: boolean;
  }[];
  lastQuestionReveal: {
    index: number;
    text: string;
    displayAnswer: string;
    explanation: string | null;
    winnerAccountId: string | null;
  } | null;
  abortedNote: string | null;
  endedQuestionCount: number;
  totalQuestions: number;
}

export interface RoomSnapshot {
  reason: 'join' | 'reconnect' | 'resync';
  serverTime: number;
  seq: number;
  me: { accountId: string; nickname: string; colorIndex: number; isHost: boolean };
  room: {
    id: string;
    title: string;
    hostAccountId: string;
    state: string;
    maxPlayers: number;
    settings: RoomSettings;
    settingsLocked: boolean;
    activeCount: number;
    availableQuestionCount: number | null;
  };
  players: PlayerView[];
  chat: ChatView[];
  /** 카운트다운 종료 시각 (서버 시각 기준 절대 시각). COUNTDOWN 에서만 값이 있다 */
  countdown: { endsAt: number } | null;
  /** 진행 중인 게임 */
  game: { gameId: string | null; totalQuestions: number; questionIndex: number } | null;
  experienceRates: ExperienceRate[] | null;
  // ── ★ Phase 3
  question: QuestionView | null;
  resolution: ResolutionView | null;
  skip: SkipView | null;
  result: GameResultView | null;
}

export interface SocketErrorPayload {
  code: string;
  message: string;
  detail: string | null;
}

export interface RoomHook {
  snapshot: RoomSnapshot | null;
  chat: ChatView[];
  error: SocketErrorPayload | null;
  clearError: () => void;
  /** 서버가 다른 곳에서의 접속 때문에 이 연결을 끊었는가 (Q-06) */
  terminated: boolean;
  /**
   * ★ 도배 억제 안내 (Q-18). 본인에게만 온다.
   *   ★ 토스트로 띄우지 않는다 — 입력 중에 뜨는 알림이므로 iOS 키보드에 가려질 수 있다.
   *     ★ 그래서 입력창 바로 위에 인라인으로 표시한다 (C-8 판단).
   */
  throttledUntil: number | null;
}

export function useRoom(socket: Socket | null): RoomHook {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [chat, setChat] = useState<ChatView[]>([]);
  const [error, setError] = useState<SocketErrorPayload | null>(null);
  const [terminated, setTerminated] = useState(false);
  const [throttledUntil, setThrottledUntil] = useState<number | null>(null);

  useEffect(() => {
    if (!socket) return undefined;

    const onState = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      setChat(snap.chat);
      setError(null);
    };

    const patchPlayers = (payload: { players?: PlayerView[]; activeCount?: number }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: payload.players ?? prev.players,
          room: {
            ...prev.room,
            activeCount: payload.activeCount ?? prev.room.activeCount,
          },
        };
      });
    };

    const onConnectionChanged = (payload: {
      accountId: string;
      connected: boolean;
      activeCount: number;
    }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          // ★ 표시용 connected 는 서버가 5초 유예 뒤에 room.playersUpdated 로 알려준다.
          //   여기서는 재접속(connected=true)만 즉시 반영한다.
          players: payload.connected
            ? prev.players.map((p) =>
                p.accountId === payload.accountId ? { ...p, connected: true } : p,
              )
            : prev.players,
          room: { ...prev.room, activeCount: payload.activeCount },
        };
      });
    };

    const onHostChanged = (payload: { hostAccountId: string }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          room: { ...prev.room, hostAccountId: payload.hostAccountId },
          me: { ...prev.me, isHost: prev.me.accountId === payload.hostAccountId },
          players: prev.players.map((p) => ({
            ...p,
            isHost: p.accountId === payload.hostAccountId,
          })),
        };
      });
    };

    const onChat = (message: ChatView) => {
      setChat((prev) => {
        // 중복 방지. 재접속 스냅샷과 실시간 메시지가 겹칠 수 있다
        if (prev.some((m) => m.id === message.id)) return prev;
        const next = [...prev, message];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    };

    const onLeft = () => {
      setSnapshot(null);
      setChat([]);
    };

    // ── Phase 2 이벤트
    //   ★ 클라이언트는 서버가 보낸 값을 그대로 반영한다.
    //     설정값을 스스로 계산하거나 상태를 스스로 전이시키지 않는다 (guide 44·45절).

    const onSettingsUpdated = (payload: {
      settings: RoomSettings;
      settingsLocked?: boolean;
      availableQuestionCount: number | null;
    }) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                settings: payload.settings,
                settingsLocked: payload.settingsLocked ?? prev.room.settingsLocked,
                availableQuestionCount: payload.availableQuestionCount,
              },
            }
          : prev,
      );
    };

    const onExperienceRates = (payload: { rates: ExperienceRate[] }) => {
      setSnapshot((prev) => (prev ? { ...prev, experienceRates: payload.rates } : prev));
    };

    const onCountdownStarted = (payload: {
      endsAt: number;
      state: string;
      settingsLocked: boolean;
      settings: RoomSettings;
    }) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                state: payload.state,
                settings: payload.settings,
                settingsLocked: payload.settingsLocked,
              },
              countdown: { endsAt: payload.endsAt },
            }
          : prev,
      );
    };

    const onCountdownCancelled = (payload: {
      state: string;
      settingsLocked: boolean;
      settings: RoomSettings;
    }) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                state: payload.state,
                settings: payload.settings,
                settingsLocked: payload.settingsLocked,
              },
              countdown: null,
            }
          : prev,
      );
    };

    const onGameStarted = (payload: {
      gameId: string | null;
      totalQuestions: number;
      state: string;
    }) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: { ...prev.room, state: payload.state, settingsLocked: true },
              countdown: null,
              game: {
                gameId: payload.gameId,
                totalQuestions: payload.totalQuestions,
                questionIndex: 0,
              },
              // ★ 새 게임이 시작되면 직전 게임의 흔적을 지운다
              question: null,
              resolution: null,
              skip: null,
              result: null,
            }
          : prev,
      );
    };

    // ── ★★ Phase 3 이벤트
    //   ★ 클라이언트는 서버가 보낸 값을 그대로 반영한다.
    //     ★ 상태를 스스로 전이시키지 않는다 (guide 44·45절).

    const onQuestionStarted = (p: QuestionView & { state: string }) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: { ...prev.room, state: p.state },
              question: {
                epoch: p.epoch,
                index: p.index,
                total: p.total,
                text: p.text,
                categoryName: p.categoryName,
                startedAt: p.startedAt,
                endsAt: p.endsAt,
                experiencedNicknames: p.experiencedNicknames,
                selfExperienced: p.selfExperienced,
                // ★ 문제 시작 시점에는 힌트가 없다. 서버가 남은 10초에 push 한다
                hint: null,
                hintRevealed: false,
              },
              resolution: null,
              skip: { votes: 0, threshold: prev.skip?.threshold ?? null, selfVoted: false },
              result: null,
              game: prev.game
                ? { ...prev.game, questionIndex: p.index }
                : { gameId: null, totalQuestions: p.total, questionIndex: p.index },
            }
          : prev,
      );
    };

    const onExperiencedUpdated = (p: {
      epoch: number;
      experiencedNicknames: string[];
      selfExperienced: boolean;
    }) => {
      setSnapshot((prev) => {
        if (!prev?.question || prev.question.epoch !== p.epoch) return prev;
        return {
          ...prev,
          question: {
            ...prev.question,
            experiencedNicknames: p.experiencedNicknames,
            selfExperienced: p.selfExperienced,
          },
        };
      });
    };

    const onHint = (p: { epoch: number; hint: string | null }) => {
      setSnapshot((prev) => {
        // ★ 낡은 힌트를 새 문제에 붙이지 않는다. epoch 로 확인한다
        if (!prev?.question || prev.question.epoch !== p.epoch) return prev;
        return { ...prev, question: { ...prev.question, hint: p.hint, hintRevealed: true } };
      });
    };

    const onResolved = (p: ResolutionView & { state: string; scores: { accountId: string; score: number }[] }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const scoreById = new Map(p.scores.map((s) => [s.accountId, s.score]));
        return {
          ...prev,
          room: { ...prev.room, state: p.state },
          players: prev.players.map((pl) => ({
            ...pl,
            score: scoreById.get(pl.accountId) ?? pl.score,
          })),
          resolution: {
            epoch: p.epoch,
            reason: p.reason,
            winnerAccountId: p.winnerAccountId,
            displayAnswer: p.displayAnswer,
            explanation: p.explanation,
            nextAt: p.nextAt,
            index: prev.question?.index ?? 0,
            text: prev.question?.text ?? '',
          },
          // ★ 정답이 공개되면 스킵 투표는 끝난다
          skip: null,
        };
      });
    };

    const onSkipUpdated = (p: {
      epoch: number;
      votes: number;
      threshold: number | null;
      activeCount: number;
    }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        // ★ 낡은 epoch 의 투표 현황을 새 문제에 붙이지 않는다
        if (prev.question && prev.question.epoch !== p.epoch) return prev;
        return {
          ...prev,
          room: { ...prev.room, activeCount: p.activeCount },
          skip: {
            votes: p.votes,
            threshold: p.threshold,
            // ★ selfVoted 는 서버가 보내지 않는다 (명단 비공개). 내 클릭으로만 바뀐다
            selfVoted: prev.skip?.selfVoted ?? false,
          },
        };
      });
    };

    const onGameResult = (p: GameResultView) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: { ...prev.room, state: 'GAME_RESULT' },
              question: null,
              resolution: null,
              skip: null,
              result: p,
              players: prev.players.map((pl) => {
                const r = p.ranking.find((x) => x.accountId === pl.accountId);
                return r ? { ...pl, score: r.score } : pl;
              }),
            }
          : prev,
      );
    };

    const onReturnedToLobby = (p: {
      state: string;
      settings: RoomSettings;
      settingsLocked: boolean;
      players: PlayerView[];
      activeCount: number;
    }) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                state: p.state,
                settings: p.settings,
                settingsLocked: p.settingsLocked,
                activeCount: p.activeCount,
              },
              players: p.players,
              game: null,
              question: null,
              resolution: null,
              skip: null,
              result: null,
              countdown: null,
            }
          : prev,
      );
    };

    const onThrottled = (p: { retryAfterMs: number }) => {
      setThrottledUntil(Date.now() + p.retryAfterMs);
    };

    socket.on('room.state', onState);
    socket.on('question.started', onQuestionStarted);
    socket.on('question.experiencedUpdated', onExperiencedUpdated);
    socket.on('question.hint', onHint);
    socket.on('question.resolved', onResolved);
    socket.on('skip.voteUpdated', onSkipUpdated);
    socket.on('game.result', onGameResult);
    socket.on('game.returnedToLobby', onReturnedToLobby);
    socket.on('chat.throttled', onThrottled);
    socket.on('room.playerJoined', patchPlayers);
    socket.on('room.playerLeft', patchPlayers);
    socket.on('room.playersUpdated', patchPlayers);
    socket.on('room.connectionChanged', onConnectionChanged);
    socket.on('room.hostChanged', onHostChanged);
    socket.on('chat.message', onChat);
    socket.on('room.left', onLeft);
    socket.on('lobby.settingsUpdated', onSettingsUpdated);
    socket.on('lobby.experienceRates', onExperienceRates);
    socket.on('game.countdownStarted', onCountdownStarted);
    socket.on('game.countdownCancelled', onCountdownCancelled);
    socket.on('game.started', onGameStarted);
    socket.on('error', setError);
    socket.on('session.terminated', () => setTerminated(true));

    return () => {
      socket.off('room.state', onState);
      socket.off('question.started', onQuestionStarted);
      socket.off('question.experiencedUpdated', onExperiencedUpdated);
      socket.off('question.hint', onHint);
      socket.off('question.resolved', onResolved);
      socket.off('skip.voteUpdated', onSkipUpdated);
      socket.off('game.result', onGameResult);
      socket.off('game.returnedToLobby', onReturnedToLobby);
      socket.off('chat.throttled', onThrottled);
      socket.off('room.playerJoined', patchPlayers);
      socket.off('room.playerLeft', patchPlayers);
      socket.off('room.playersUpdated', patchPlayers);
      socket.off('room.connectionChanged', onConnectionChanged);
      socket.off('room.hostChanged', onHostChanged);
      socket.off('chat.message', onChat);
      socket.off('room.left', onLeft);
      socket.off('lobby.settingsUpdated', onSettingsUpdated);
      socket.off('lobby.experienceRates', onExperienceRates);
      socket.off('game.countdownStarted', onCountdownStarted);
      socket.off('game.countdownCancelled', onCountdownCancelled);
      socket.off('game.started', onGameStarted);
      socket.off('error', setError);
    };
  }, [socket]);

  return {
    snapshot,
    chat,
    error,
    clearError: () => setError(null),
    terminated,
    throttledUntil,
  };
}
