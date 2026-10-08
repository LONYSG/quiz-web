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

import type { DifficultyTier, GameTopic } from '@quiz/shared';
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
  /** ★ R025 — 출제할 난이도 (하·중·상 복수 선택) */
  difficulties: DifficultyTier[];
  /** ★ R034 — 출제할 분야 (복수 선택) */
  topics: GameTopic[];
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
  /** ★ 경험자 목록. 닉네임과 색을 함께 받는다 (전원 공개. D-011) */
  experiencedPlayers: { accountId: string; nickname: string; colorIndex: number }[];
  selfExperienced: boolean;
  /** ★ 초성 힌트. 남은 15초부터만 값이 있다 (R034) */
  hint: string | null;
  hintRevealed: boolean;
  /** ★★ R028 — 일반 힌트. 남은 30초부터 값이 있다 (R034. 없는 문제는 늘 null) */
  generalHint: string | null;
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
  /** ★★ R038 — 뒷북 명단 (정답자 발생 후 3초 안에 정답을 보낸 사람. 도착 순). diffNs = 나노초 문자열 */
  late: LateAnswerView[];
}

export interface LateAnswerView {
  accountId: string;
  nickname: string;
  colorIndex: number;
  diffNs: string;
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
  /** ★★ 문제별 기록 (Phase 4). 중단된 문제는 displayAnswer 가 null 이다 */
  questions: {
    index: number;
    text: string;
    categoryName: string;
    displayAnswer: string | null;
    reason: 'correct' | 'timeout' | 'skip_vote' | 'host_skip' | 'aborted';
    winnerAccountId: string | null;
    responseMs: number | null;
    experiencedCount: number;
  }[];
  /** ★ 사람별 요약 (Phase 4) */
  playerStats: {
    accountId: string;
    correct: number;
    avgResponseMs: number | null;
    fastestMs: number | null;
  }[];
  /** ★ R025 — 이 판의 난이도 */
  difficulties: DifficultyTier[];
  /** ★ R034 — 이 판의 분야 (옛 서버는 보내지 않는다) */
  topics?: GameTopic[];
  abortedNote: string | null;
  endedQuestionCount: number;
  totalQuestions: number;
}

/** ★ 일시정지 (Phase 5). PAUSED 에서만 값이 있다 */
export interface PausedView {
  pausedFrom: string;
  /** ★ 멈춘 시점의 남은 시간. **고정값이다.** 흐르지 않는다 */
  remainingMs: number;
  pausedAt: number;
  /** ★ 이 시각이 지나면 방이 사라진다 (Q-82) */
  abandonAt: number;
  returned: number;
  total: number;
  /** ★ 서버가 계산해 보낸다. 클라이언트가 유추하지 않는다 */
  canResume: boolean;
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
  /** ★ Phase 5 */
  paused: PausedView | null;
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
        // ★ R034 — 내 닉네임이 바뀌었을 수 있다 (로비에서 이름 바꾸기)
        const meNow = payload.players?.find((p) => p.accountId === prev.me.accountId);
        return {
          ...prev,
          me: meNow && meNow.nickname !== prev.me.nickname ? { ...prev.me, nickname: meNow.nickname } : prev.me,
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
              paused: null,
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
                experiencedPlayers: p.experiencedPlayers,
                selfExperienced: p.selfExperienced,
                // ★ 문제 시작 시점에는 힌트가 없다. 서버가 남은 15초에 push 한다 (R034)
                hint: null,
                hintRevealed: false,
                // ★ R028 — 일반 힌트도 남은 30초에 서버가 push 한다 (R034)
                generalHint: null,
              },
              resolution: null,
              // ★★ R034 — 기준 인원은 바로 뒤따르는 skip.voteUpdated 가 채운다 (서버가 문제 시작 때 보낸다).
              //   ★ 옛 코드는 여기서 직전 값을 이어받았는데, 정답 공개 때 null 로 지워져 있어서
              //     **기준 인원이 늘 null** 이었다 → 투표 버튼·Alt+S 가 꺼져 있었다 (스킵이 "아예 안 되던" 원인)
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
      experiencedPlayers: { accountId: string; nickname: string; colorIndex: number }[];
      selfExperienced: boolean;
    }) => {
      setSnapshot((prev) => {
        if (!prev?.question || prev.question.epoch !== p.epoch) return prev;
        return {
          ...prev,
          question: {
            ...prev.question,
            experiencedPlayers: p.experiencedPlayers,
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

    // ★★ R028 — 일반 힌트 (남은 20초)
    const onGeneralHint = (p: { epoch: number; hint: string }) => {
      setSnapshot((prev) => {
        if (!prev?.question || prev.question.epoch !== p.epoch) return prev;
        return { ...prev, question: { ...prev.question, generalHint: p.hint } };
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
            late: [],
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
      /** ★ R034 — 받는 사람 본인이 투표했는가 (본인 것만 온다) */
      selfVoted?: boolean;
    }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        // ★ 낡은 epoch 의 투표 현황을 새 문제에 붙이지 않는다
        if (prev.question && prev.question.epoch !== p.epoch) return prev;
        // ★ 정답 공개 뒤 늦게 온 현황은 버린다
        if (prev.resolution && prev.resolution.epoch === p.epoch) return prev;
        return {
          ...prev,
          room: { ...prev.room, activeCount: p.activeCount },
          skip: {
            votes: p.votes,
            threshold: p.threshold,
            // ★★ R034 — 서버가 **본인 것만** 보낸다 (명단 비공개는 그대로).
            //   ★ 옛 코드는 이 값을 받지 않고 늘 false 로 두었다 → 투표 취소가 되지 않았다
            selfVoted: p.selfVoted ?? prev.skip?.selfVoted ?? false,
          },
        };
      });
    };

    // ★★ R038 — 뒷북 명단 갱신 (늦게 온 사람이 생길 때마다 전체 명단이 온다)
    const onLate = (p: { epoch: number; late: LateAnswerView[] }) => {
      setSnapshot((prev) => {
        if (!prev?.resolution || prev.resolution.epoch !== p.epoch) return prev;
        return { ...prev, resolution: { ...prev.resolution, late: p.late } };
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
              paused: null,
              countdown: null,
            }
          : prev,
      );
    };

    const onThrottled = (p: { retryAfterMs: number }) => {
      setThrottledUntil(Date.now() + p.retryAfterMs);
    };

    // ── ★★ Phase 5 — 일시정지 (R015)
    const onPaused = (p: {
      state: string;
      pausedFrom: string;
      remainingMs: number;
      pausedAt: number;
      abandonAt: number;
    }) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: { ...prev.room, state: p.state },
              paused: {
                pausedFrom: p.pausedFrom,
                remainingMs: p.remainingMs,
                pausedAt: p.pausedAt,
                abandonAt: p.abandonAt,
                returned: prev.room.activeCount,
                total: prev.players.length,
                // ★ 서버가 계산해 보내는 값이지만 이 이벤트에는 없다.
                //   ★ 방장이면 재개할 수 있다. 정확한 값은 다음 스냅샷·상태 갱신이 채운다
                canResume: prev.me.isHost,
              },
              skip: null,
            }
          : prev,
      );
    };

    const onPauseStatus = (p: { returned: number; total: number; abandonAt: number }) => {
      setSnapshot((prev) =>
        prev?.paused
          ? {
              ...prev,
              room: { ...prev.room, activeCount: p.returned },
              paused: {
                ...prev.paused,
                returned: p.returned,
                total: p.total,
                abandonAt: p.abandonAt,
                canResume: prev.me.isHost && p.returned >= 1,
              },
            }
          : prev,
      );
    };

    const onResumed = (p: {
      state: string;
      epoch: number | null;
      endsAt: number | null;
      nextAt: number | null;
      countdownEndsAt: number | null;
    }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        // ★★ 서버가 보낸 새 종료 시각을 그대로 쓴다. 스스로 계산하지 않는다
        const question =
          prev.question && p.endsAt !== null ? { ...prev.question, endsAt: p.endsAt } : prev.question;
        return {
          ...prev,
          room: { ...prev.room, state: p.state },
          paused: null,
          question,
          countdown: p.countdownEndsAt !== null ? { endsAt: p.countdownEndsAt } : prev.countdown,
        };
      });
    };

    socket.on('room.state', onState);
    socket.on('question.started', onQuestionStarted);
    socket.on('question.experiencedUpdated', onExperiencedUpdated);
    socket.on('question.hint', onHint);
    socket.on('question.generalHint', onGeneralHint);
    socket.on('question.resolved', onResolved);
    socket.on('skip.voteUpdated', onSkipUpdated);
    socket.on('question.lateAnswers', onLate);
    socket.on('game.result', onGameResult);
    socket.on('game.returnedToLobby', onReturnedToLobby);
    socket.on('chat.throttled', onThrottled);
    socket.on('game.paused', onPaused);
    socket.on('game.pauseStatus', onPauseStatus);
    socket.on('game.resumed', onResumed);
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
      socket.off('question.generalHint', onGeneralHint);
      socket.off('question.resolved', onResolved);
      socket.off('skip.voteUpdated', onSkipUpdated);
      socket.off('question.lateAnswers', onLate);
      socket.off('game.result', onGameResult);
      socket.off('game.returnedToLobby', onReturnedToLobby);
      socket.off('chat.throttled', onThrottled);
      socket.off('game.paused', onPaused);
      socket.off('game.pauseStatus', onPauseStatus);
      socket.off('game.resumed', onResumed);
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
