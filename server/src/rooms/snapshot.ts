// =============================================================================
// room.state 스냅샷
//
// ★ 중간 참가 / 재접속 / resync 가 같은 페이로드를 쓴다 (R003 3-4).
//   중간 참가자에게 필요한 항목은 재접속자에게 필요한 항목의 부분집합이고,
//   두 경우의 차이(점수가 0인가, 색상이 새로 배정되는가)는 서버가 스냅샷을 만들 때
//   이미 값으로 정해진다. reason 필드로만 구분한다.
//
// ★ Phase 3 (R014) 에서 question / resolution / skip / result 가 채워졌다.
//   ★ 구조를 Phase 1 에 미리 확정해 둔 덕분에 필드만 채우면 되었다.
//
// ★ 스냅샷 생성 시 절대 지켜야 할 것 (Phase 3~6에서)
//   · 힌트는 남은 시간이 10초 이하일 때만 넣는다.
//     빼먹으면 재접속만으로 힌트를 미리 보는 우회로가 생긴다
//   · 정답 문자열을 QUESTION_ACTIVE 스냅샷에 절대 넣지 않는다
//   · 과거 채팅의 마스킹을 재계산하지 않는다. chat 버퍼에 저장된 값을 그대로 쓴다
// =============================================================================

import { RULES, skipThreshold } from '@quiz/shared';
import type { QuestionResolution, RoomState } from '@quiz/shared';
import { activeCount } from './registry.js';
import type { ExperienceRate, GameResultData, Player, Room } from './types.js';

export type SnapshotReason = 'join' | 'reconnect' | 'resync';

export interface PlayerView {
  accountId: string;
  nickname: string;
  colorIndex: number;
  /** ★ 표시용. 끊긴 뒤 5초가 지나야 false 가 된다 (Q-15 보완) */
  connected: boolean;
  isHost: boolean;
  joinOrder: number;
  score: number;
}

export interface RoomSnapshot {
  reason: SnapshotReason;
  serverTime: number;
  seq: number;
  me: {
    accountId: string;
    nickname: string;
    colorIndex: number;
    isHost: boolean;
    connected: boolean;
  };
  room: {
    id: string;
    title: string;
    hostAccountId: string;
    state: RoomState;
    maxPlayers: number;
    settings: Room['settings'];
    settingsLocked: boolean;
    activeCount: number;
    /** 출제 가능 문제 수 (Q-21). 아직 계산되지 않았으면 null */
    availableQuestionCount: number | null;
  };
  players: PlayerView[];
  chat: ChatView[];
  /** 카운트다운 종료 시각 (Q-11). COUNTDOWN 상태에서만 값이 있다 */
  countdown: { endsAt: number } | null;
  /** 진행 중인 게임 */
  game: { gameId: string | null; totalQuestions: number; questionIndex: number } | null;
  /** 참가자별 경험률 (Q-12) */
  experienceRates: ExperienceRate[] | null;

  /**
   * 진행 중인 문제 (Phase 3).
   *
   * ★★ 여기에 절대 넣지 말 것 —
   *   · QUESTION_ACTIVE 중의 정답 문자열 (displayAnswer / answersNorm / answersRaw)
   *   · 남은 시간이 10초를 넘었을 때의 힌트
   *   ★ 근거: 재접속만으로 정답이나 힌트를 미리 보는 우회로가 생긴다.
   *     ★ 이 파일 헤더의 경고가 그것이다.
   */
  question: QuestionView | null;
  /** 정답 공개 구간 (QUESTION_RESOLVED). ★ 여기서는 정답을 담는다 */
  resolution: ResolutionView | null;
  /** 스킵 투표 현황. ★ 투표자 명단은 담지 않는다 */
  skip: { votes: number; threshold: number | null; selfVoted: boolean } | null;
  /** 게임 결과 (GAME_RESULT) */
  result: GameResultData | null;
  /**
   * ★★ 일시정지 (Phase 5 / R015). PAUSED 에서만 값이 있다.
   *
   * ★ 재접속한 사람이 "왜 멈춰 있는가" 와 "언제까지 기다리는가" 를 알아야 한다.
   *   ★★ D-030 교훈 — 화면에 아무 표시가 없으면 "멈췄다" 와 "고장났다" 가 구분되지 않는다.
   */
  paused: PausedView | null;
}

export interface PausedView {
  pausedFrom: string;
  /** ★ 멈춘 시점의 남은 시간. **고정값이다.** 클라이언트가 그대로 그린다 */
  remainingMs: number;
  pausedAt: number;
  /** ★ 이 시각이 지나면 방이 폭파된다 (Q-82) */
  abandonAt: number;
  /** 돌아온 사람 수 */
  returned: number;
  /** 슬롯을 가진 사람 수 */
  total: number;
  /** ★ 이 스냅샷을 받는 사람이 재개 버튼을 누를 수 있는가 */
  canResume: boolean;
}

export interface QuestionView {
  epoch: number;
  index: number;
  total: number;
  text: string;
  /** ★ 대분류다. 소분류 이름은 힌트가 되므로 보내지 않는다 (R012 3-3) */
  categoryName: string;
  startedAt: number;
  endsAt: number;
  /** ★ 경험자 닉네임. 전원 공개다 (D-011: guide 28절 폐기) */
  experiencedNicknames: string[];
  /** ★ 이 스냅샷을 받는 사람이 경험자인가 */
  selfExperienced: boolean;
  /**
   * ★ 힌트. **남은 시간이 10초 이하일 때만** 값이 있다.
   *   ★ 빼먹으면 재접속만으로 힌트를 미리 보는 우회로가 생긴다.
   */
  hint: string | null;
  /** 힌트가 이미 공개된 시점인가. null 힌트("힌트 없음")와 구분하기 위해 함께 보낸다 */
  hintRevealed: boolean;
}

export interface ResolutionView {
  epoch: number;
  reason: QuestionResolution;
  winnerAccountId: string | null;
  displayAnswer: string;
  explanation: string | null;
  nextAt: number | null;
  index: number;
  text: string;
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

/**
 * ★ 표시용 connected.
 *   끊긴 뒤 DISCONNECT_DISPLAY_GRACE_MS(5초)가 지나야 "접속 종료" 로 보인다.
 *   새로고침은 보통 1~3초라 즉시 표시하면 표기가 깜빡인다 (Q-15 보완).
 *
 * ★ 주의: 스킵 분모와 활성 인원 판정에는 이 함수를 쓰지 않는다.
 *   그쪽은 끊김 즉시 반영해야 한다 (Q-29). registry.activeCount() 를 쓴다.
 */
export function displayConnected(player: Player, now = Date.now()): boolean {
  if (player.connected) return true;
  if (player.disconnectedAt === null) return false;
  return now - player.disconnectedAt < RULES.DISCONNECT_DISPLAY_GRACE_MS;
}

export function toPlayerView(room: Room, player: Player, now = Date.now()): PlayerView {
  return {
    accountId: player.accountId,
    nickname: player.nickname,
    colorIndex: player.colorIndex,
    connected: displayConnected(player, now),
    isHost: room.hostAccountId === player.accountId,
    joinOrder: player.joinOrder,
    score: player.score,
  };
}

/**
 * 채팅 뷰. 수신자에 따라 마스킹된 텍스트가 달라진다.
 *
 * ★ 마스킹을 여기서 재계산하지 않는다. 브로드캐스트 시점에 확정된 값을 그대로 쓴다.
 *   현재 문제의 정답으로 과거 메시지를 다시 마스킹하면, 문제가 바뀔 때마다
 *   과거 채팅의 가려진 부분이 달라지는 버그가 된다 (R003 3-4).
 */
export function toChatView(
  room: Room,
  viewerAccountId: string,
  now = Date.now(),
): ChatView[] {
  const start = Math.max(0, room.chat.length - RULES.CHAT_SNAPSHOT_SIZE);
  const out: ChatView[] = [];
  for (let i = start; i < room.chat.length; i += 1) {
    const entry = room.chat[i]!;
    const isSender = entry.accountId === viewerAccountId;
    out.push({
      id: entry.id,
      seq: entry.seq,
      accountId: entry.accountId,
      nickname: entry.nickname,
      colorIndex: entry.colorIndex,
      // 발신자 본인에게는 원문, 나머지에게는 치환본(없으면 원문)
      text: isSender ? entry.rawNfc : (entry.maskedText ?? entry.rawNfc),
      masked: entry.maskedText !== null,
      ts: entry.ts,
      system: entry.system,
    });
  }
  void now;
  return out;
}

export function buildSnapshot(
  room: Room,
  viewerAccountId: string,
  reason: SnapshotReason,
  seq: number,
): RoomSnapshot {
  const now = Date.now();
  const me = room.players.get(viewerAccountId);

  return {
    reason,
    serverTime: now,
    seq,
    me: {
      accountId: viewerAccountId,
      nickname: me?.nickname ?? '',
      colorIndex: me?.colorIndex ?? 0,
      isHost: room.hostAccountId === viewerAccountId,
      connected: me?.connected ?? false,
    },
    room: {
      id: room.id,
      title: room.title,
      hostAccountId: room.hostAccountId,
      state: room.state,
      maxPlayers: RULES.MAX_PLAYERS,
      settings: { ...room.settings },
      settingsLocked: room.settingsLocked,
      activeCount: activeCount(room),
      availableQuestionCount: room.availableQuestionCount,
    },
    players: [...room.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => toPlayerView(room, p, now)),
    chat: toChatView(room, viewerAccountId, now),
    // ★ COUNTDOWN 이 아니면 값을 담지 않는다. 낡은 종료 시각이 남으면
    //   재접속한 사람 화면에 이미 지나간 카운트다운이 그려진다.
    countdown:
      room.state === 'COUNTDOWN' && room.countdownEndsAt !== null
        ? { endsAt: room.countdownEndsAt }
        : null,
    game: room.game
      ? {
          gameId: room.game.gameId,
          totalQuestions: room.game.totalQuestions,
          questionIndex: room.game.questionIndex,
        }
      : null,
    experienceRates: room.experienceRates ? [...room.experienceRates] : null,
    question: buildQuestionView(room, viewerAccountId, now),
    resolution: buildResolutionView(room),
    skip: buildSkipView(room, viewerAccountId),
    result: room.state === 'GAME_RESULT' ? room.result : null,
    paused: buildPausedView(room, viewerAccountId),
  };
}

/**
 * 일시정지 뷰.
 *
 * ★★ `canResume` 을 서버가 계산해서 보낸다. 클라이언트가 유추하지 않는다.
 *   ★ 근거: 재개 조건이 "방장이고 활성이 1명 이상" 두 가지다.
 *     ★ 클라이언트가 유추하면 그 규칙이 두 곳에 생기고, 어긋나는 순간
 *       "버튼이 보이는데 서버가 거부하는" 상태가 된다 (Phase 2 의 settingsLocked 와 같은 이유).
 */
function buildPausedView(room: Room, viewerAccountId: string): PausedView | null {
  const p = room.paused;
  if (!p || room.state !== 'PAUSED') return null;
  const active = activeCount(room);
  return {
    pausedFrom: p.pausedFrom,
    remainingMs: p.remainingMs,
    pausedAt: p.pausedAt,
    abandonAt: p.abandonAt,
    returned: active,
    total: room.players.size,
    canResume: room.hostAccountId === viewerAccountId && active >= 1,
  };
}

/**
 * 진행 중인 문제 뷰.
 *
 * ★★ 정답을 담지 않는다. QUESTION_ACTIVE 중에는 정답 문자열이 클라이언트로 가지 않는다.
 * ★★ 힌트는 남은 시간이 10초 이하일 때만 담는다 (guide 11절).
 *   ★ 그러지 않으면 재접속으로 힌트를 미리 볼 수 있다.
 */
function buildQuestionView(
  room: Room,
  viewerAccountId: string,
  now: number,
): QuestionView | null {
  const q = room.currentQuestion;
  if (!q) return null;
  // ★★ PAUSED 에서도 문제를 담는다 (R015).
  //   ★ 근거: 재개하면 같은 문제를 이어서 한다. 멈춘 화면에 문제가 보여야
  //     사람들이 "무엇을 하다 멈췄는지" 를 안다.
  //   ★ 남은 시간은 paused.remainingMs 가 따로 전달한다. endsAt 은 재개 전까지 의미가 없다.
  if (
    room.state !== 'QUESTION_ACTIVE' &&
    room.state !== 'QUESTION_RESOLVED' &&
    room.state !== 'PAUSED'
  ) {
    return null;
  }

  // ★ 힌트 공개 조건. hintPushed 만 믿지 않고 시각으로도 확인한다.
  //   ★ 두 조건을 함께 보는 이유: hintPushed 는 tick 이 세우고, 재접속은 그와 무관하게
  //     아무 때나 일어난다. 시각 조건이 최종 방어선이다.
  //   ★★ PAUSED 중에는 endsAt 이 낡은 값이다. remainingMs 로 판단해야 한다.
  //     ★ 그러지 않으면 "멈춘 시점에 15초 남았는데" 재접속하니 힌트가 보이는 사고가 난다.
  const remain =
    room.state === 'PAUSED' ? (room.paused?.remainingMs ?? 0) : q.endsAt - now;
  const revealed =
    q.hintPushed || remain <= RULES.HINT_REVEAL_AT_MS || room.state === 'QUESTION_RESOLVED';

  const nicknames: string[] = [];
  for (const id of q.experiencedAccountIds) {
    const p = room.players.get(id);
    if (p) nicknames.push(p.nickname);
  }

  return {
    epoch: q.epoch,
    index: q.index,
    total: room.game?.totalQuestions ?? 0,
    text: q.text,
    categoryName: q.categoryName,
    startedAt: q.startedAt,
    endsAt: q.endsAt,
    experiencedNicknames: nicknames,
    selfExperienced: q.experiencedAccountIds.has(viewerAccountId),
    hint: revealed ? q.hint : null,
    hintRevealed: revealed,
  };
}

/** 정답 공개 구간. ★ 여기서는 정답을 담는다 — 이미 공개된 정보다 */
function buildResolutionView(room: Room): ResolutionView | null {
  const r = room.game?.resolution;
  const q = room.currentQuestion;
  if (!r || !q || room.state !== 'QUESTION_RESOLVED') return null;
  return {
    epoch: r.epoch,
    reason: r.reason,
    winnerAccountId: r.winnerAccountId,
    displayAnswer: r.displayAnswer,
    explanation: r.explanation,
    nextAt: r.nextAt,
    index: q.index,
    text: q.text,
  };
}

/**
 * 스킵 투표 현황.
 *
 * ★★ 투표자 명단을 담지 않는다 (guide 22절).
 *   ★ 본인이 투표했는지만 알려준다. 버튼 상태를 그리기 위해 필요하다.
 */
function buildSkipView(
  room: Room,
  viewerAccountId: string,
): { votes: number; threshold: number | null; selfVoted: boolean } | null {
  const q = room.currentQuestion;
  if (!q || room.state !== 'QUESTION_ACTIVE') return null;
  return {
    votes: q.skipVotes.size,
    threshold: skipThreshold(activeCount(room)),
    selfVoted: q.skipVotes.has(viewerAccountId),
  };
}
