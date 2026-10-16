// =============================================================================
// ★★★ 미니게임 엔진 (R050 · D-234) — 진행 · 판 순위 · 보상 · 기록. 미니게임 이름은 모른다(defs.ts 의 플러그인을 부른다)
//
// 흐름 (상태 MINIGAME — 04 R050 표)
//   intro(깜짝 이벤트 연출 3초 · 징글 · BGM 바뀜) → rules(규칙 안내 5초) →
//   [ ready(1.5초) → play(판 길이 + 지연 여유) → roundResult(4초) ] × 판 수 → final(6초 · 보상) → outro(2초 · BGM 원래대로) →
//   퀴즈: 다음 문제(없으면 결과) / 연습: 로비
// ★ 등장: 퀴즈 판에서 "미니게임 포함" 이 켜져 있으면 정해진 자리(shared minigameSlots — 정답 공개 8초가 끝난 뒤)에.
//   켜진 미니게임 중 무작위 · 한 바퀴 다 나오기 전에는 겹치지 않음(bag).
// ★ 참가: 시작 때 방에 있던 사람만 · 중간 입장은 구경 · 끊긴 사람은 그 판 제출 없음(꼴찌).
// ★ 일시정지: 미니게임 중에는 걸지 않는다(pause.ts 의 pausableFrom 에 MINIGAME 이 없다) — 끝나고 다음 문제에서 걸린다(모두 끊겼으면 그때 바로).
// ★★ 보상은 돈이다 — final 에 들어갈 때 **한 번만**(run.rewarded) 메모리 점수에 더하고, DB 는 (run_id, account_id) UNIQUE.
//   연습 판은 판 점수 · 포인트 · 경험 · 보상에 넣지 않는다(기록만 practice=true).
// ★ tick 안에서 await 하지 않는다 — DB 는 전부 fire-and-forget(실패는 로그).
// =============================================================================

import { randomInt } from 'node:crypto';
import { config } from '../config.js';
import {
  MINIGAME_TIMING,
  decimalsForRanking,
  minigameReward,
  minigameSlots,
  rankFinal,
  rankRound,
  type MinigameKey,
  type MinigamePhase,
} from '@quiz/shared';
import {
  finishRun,
  insertResults,
  insertRewards,
  insertRound,
  insertRun,
  insertRunPlayers,
  recordItemExperiences,
} from '../db/minigames.js';
import { emitRoom, emitRoomPerPlayer } from '../rooms/emit.js';
import { deviceOf } from '../rooms/registry.js';
import type { Player, Room } from '../rooms/types.js';
import { beginQuestion, broadcastPlayers, finishGame } from '../game/question.js';
import { setBeforeNextQuestion } from '../game/hooks.js';
import { MINIGAME_DEFS, type ParsedInput, type RoundSpec } from './defs.js';

export interface MinigameParticipant {
  accountId: string;
  nickname: string;
  colorIndex: number;
  device: 'pc' | 'mobile' | null;
}

export interface RoundResultRow {
  accountId: string;
  submitted: boolean;
  value: number | null;
  error: number | null;
  rank: number;
  points: number;
  extra: Record<string, unknown> | null;
}

export interface MinigameRun {
  /** 화면이 판을 구별하는 표 (시드 문자열) */
  token: string;
  key: MinigameKey;
  practice: boolean;
  seed: number;
  afterQuestionIndex: number | null;
  /** DB id — 넣는 중이면 Promise */
  dbId: Promise<string | null>;
  participants: MinigameParticipant[];
  phase: MinigamePhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  roundIndex: number;
  rounds: RoundSpec[];
  /** 판마다 계정 → 받은 입력 (provisional 이면 아직 확정 아님 — 마감 때 마지막 값을 쓴다) */
  submissions: Map<string, ParsedInput & { provisional: boolean }>[];
  roundResults: { roundIndex: number; decimals: number; rows: RoundResultRow[] }[];
  totals: Map<string, number>;
  final: { accountId: string; rank: number; total: number; reward: number }[] | null;
  rewarded: boolean;
  endReason: 'completed' | 'force_ended' | 'abandoned' | null;
}

function fire(label: string, p: Promise<unknown>): void {
  void p.catch((err) => console.error(`[minigame] ★ ${label} 기록 실패:`, (err as Error).message));
}

/** ★ 판 진행(play) 밖의 단계 길이 — 검사용 배율(config.tuning.minigamePhaseScale)을 곱한다 */
function T(ms: number): number {
  return Math.max(50, Math.round(ms * config.tuning.minigamePhaseScale));
}

function setPhase(run: MinigameRun, phase: MinigamePhase, now: number, ms: number): void {
  run.phase = phase;
  run.phaseStartedAt = now;
  run.phaseEndsAt = now + ms;
}

// ─────────────────────────────────────────────────────────────────────────────
// 화면용 보기 (스냅샷 · minigame.state 같은 꼴)
// ─────────────────────────────────────────────────────────────────────────────
export interface MinigameView {
  token: string;
  key: MinigameKey;
  practice: boolean;
  phase: MinigamePhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  roundIndex: number;
  roundCount: number;
  round: { params: Record<string, unknown>; playMs: number; private: Record<string, unknown> | null } | null;
  participants: MinigameParticipant[];
  submittedCount: number;
  selfSubmitted: boolean;
  spectating: boolean;
  roundResults: MinigameRun['roundResults'];
  totals: { accountId: string; total: number }[];
  final: MinigameRun['final'];
  afterQuestionIndex: number | null;
}

export function minigameView(room: Room, viewerAccountId: string): MinigameView | null {
  const run = room.minigame;
  if (!run || room.state !== 'MINIGAME') return null;
  const def = MINIGAME_DEFS[run.key];
  const spec = run.roundIndex >= 0 ? run.rounds[run.roundIndex] : undefined;
  const inRound = spec && (run.phase === 'ready' || run.phase === 'play' || run.phase === 'roundResult');
  const subs = run.roundIndex >= 0 ? run.submissions[run.roundIndex] : undefined;
  const participating = run.participants.some((p) => p.accountId === viewerAccountId);
  const mine = subs?.get(viewerAccountId);
  return {
    token: run.token,
    key: run.key,
    practice: run.practice,
    phase: run.phase,
    phaseStartedAt: run.phaseStartedAt,
    phaseEndsAt: run.phaseEndsAt,
    roundIndex: run.roundIndex,
    roundCount: run.rounds.length,
    round:
      inRound && spec
        ? { params: spec.params, playMs: spec.playMs, private: participating && def.privateFor ? def.privateFor(spec, viewerAccountId, run.roundIndex) : null }
        : null,
    participants: run.participants,
    submittedCount: subs ? [...subs.values()].filter((s) => !s.provisional).length : 0,
    selfSubmitted: Boolean(mine && !mine.provisional),
    spectating: !participating,
    roundResults: run.roundResults,
    totals: [...run.totals.entries()].map(([accountId, total]) => ({ accountId, total })),
    final: run.final,
    afterQuestionIndex: run.afterQuestionIndex,
  };
}

function broadcast(room: Room): void {
  if (!room.minigame) return;
  emitRoomPerPlayer(room, 'minigame.state', { state: room.state } as Record<string, unknown>, (p: Player) => ({ minigame: minigameView(room, p.accountId) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 시작
// ─────────────────────────────────────────────────────────────────────────────

/** 이번 판에서 켜진 미니게임 중 하나 — 한 바퀴 다 나오기 전에는 겹치지 않는다 */
export function pickMinigameKey(room: Room): MinigameKey | null {
  const game = room.game;
  const keys = room.settings.minigameKeys.filter((k) => MINIGAME_DEFS[k]);
  if (keys.length === 0) return null;
  if (!game) return keys[randomInt(keys.length)]!;
  game.minigameBag = game.minigameBag.filter((k) => keys.includes(k));
  if (game.minigameBag.length === 0) {
    const bag = [...keys];
    // 섞기 · 바로 앞에 나온 것은 맨 앞에 오지 않게
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    if (bag.length > 1 && bag[0] === game.lastMinigameKey) bag.push(bag.shift()!);
    game.minigameBag = bag;
  }
  const key = game.minigameBag.shift()!;
  game.lastMinigameKey = key;
  return key;
}

export function startMinigame(room: Room, key: MinigameKey, opts: { practice: boolean; afterQuestionIndex: number | null }): boolean {
  const def = MINIGAME_DEFS[key];
  if (!def || room.players.size === 0) return false;
  const now = Date.now();
  const seed = randomInt(1, 2 ** 31 - 1);
  const participants: MinigameParticipant[] = [...room.players.values()]
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .map((p) => ({ accountId: p.accountId, nickname: p.nickname, colorIndex: p.colorIndex, device: deviceOf(p.accountId) }));
  const rounds = def.buildRounds(seed);
  const gameId = room.game?.gameId ?? null;
  const dbId = insertRun({ gameId: opts.practice ? null : gameId, roomId: room.id, key, practice: opts.practice, afterQuestionIndex: opts.afterQuestionIndex, seed })
    .then(async (id) => {
      await insertRunPlayers(
        id,
        participants.map((p) => ({ accountId: p.accountId, device: p.device, colorIndex: p.colorIndex })),
      );
      return id;
    })
    .catch((err) => {
      console.error(`[minigame] ★ 판 기록 실패 — 결과 기록 없이 진행:`, (err as Error).message);
      return null;
    });
  const run: MinigameRun = {
    token: String(seed),
    key,
    practice: opts.practice,
    seed,
    afterQuestionIndex: opts.afterQuestionIndex,
    dbId,
    participants,
    phase: 'intro',
    phaseStartedAt: now,
    phaseEndsAt: now + T(MINIGAME_TIMING.INTRO_MS),
    roundIndex: -1,
    rounds,
    submissions: rounds.map(() => new Map()),
    roundResults: [],
    totals: new Map(participants.map((p) => [p.accountId, 0])),
    final: null,
    rewarded: false,
    endReason: null,
  };
  room.minigame = run;
  room.state = 'MINIGAME';
  if (opts.practice) room.settingsLocked = true;
  console.log(
    `[minigame] ${room.id} ★ ${opts.practice ? '연습 ' : ''}${def.info.name} 시작 (참가 ${participants.length}명 · 판 ${rounds.length} · 시드 ${seed}` +
      `${opts.afterQuestionIndex !== null ? ` · ${opts.afterQuestionIndex}번째 문제 뒤` : ''})`,
  );
  broadcast(room);
  return true;
}

/**
 * ★ 퀴즈 판의 자리 — 정답 공개 8초가 끝나 다음 문제로 가기 직전에 question.ts 가 부른다.
 *   @returns 미니게임을 시작했으면 true (다음 문제는 미니게임이 끝난 뒤)
 */
function maybeStartQuizMinigame(room: Room): boolean {
  const game = room.game;
  const current = room.currentQuestion;
  if (!game || !current || !room.settings.minigames) return false;
  const idx = current.index;
  if (idx >= game.totalQuestions) return false; // ★ 마지막 문제 뒤에는 없다
  if (!minigameSlots(game.totalQuestions).includes(idx)) return false;
  if (game.minigameDoneAt.includes(idx)) return false;
  game.minigameDoneAt.push(idx);
  const key = pickMinigameKey(room);
  if (!key) return false;
  return startMinigame(room, key, { practice: false, afterQuestionIndex: idx });
}

setBeforeNextQuestion(maybeStartQuizMinigame);

// ─────────────────────────────────────────────────────────────────────────────
// 입력
// ─────────────────────────────────────────────────────────────────────────────
export type SubmitResult = 'ok' | 'not_now' | 'not_participant' | 'already' | 'bad_input' | 'stale';

export function submitMinigame(room: Room, accountId: string, payload: { token: string; roundIndex: number; input: unknown }): SubmitResult {
  const run = room.minigame;
  if (!run || room.state !== 'MINIGAME') return 'not_now';
  if (payload.token !== run.token || payload.roundIndex !== run.roundIndex) return 'stale';
  if (run.phase !== 'play') return 'not_now';
  if (!run.participants.some((p) => p.accountId === accountId)) return 'not_participant';
  const subs = run.submissions[run.roundIndex]!;
  const prev = subs.get(accountId);
  if (prev && !prev.provisional) return 'already';
  const spec = run.rounds[run.roundIndex]!;
  const parsed = MINIGAME_DEFS[run.key].parseInput(payload.input, spec, { serverElapsedMs: Date.now() - run.phaseStartedAt });
  if (!parsed) return 'bad_input';
  subs.set(accountId, parsed);
  if (!parsed.provisional) {
    // 제출 수만 알린다 (값은 판이 끝나야 공개)
    broadcast(room);
    maybeEndPlayEarly(room, run, Date.now());
  }
  return 'ok';
}

/** 접속 중인 참가자 전원이 확정했으면 판을 일찍 끝낸다 */
function maybeEndPlayEarly(room: Room, run: MinigameRun, now: number): void {
  if (run.phase !== 'play') return;
  const subs = run.submissions[run.roundIndex]!;
  const waiting = run.participants.filter((p) => {
    const pl = room.players.get(p.accountId);
    if (!pl || !pl.connected) return false;
    const s = subs.get(p.accountId);
    return !s || s.provisional;
  });
  if (waiting.length === 0) endRound(room, run, now);
}

// ─────────────────────────────────────────────────────────────────────────────
// 진행 (tick)
// ─────────────────────────────────────────────────────────────────────────────
export function checkMinigame(room: Room, now: number): void {
  const run = room.minigame;
  if (!run || room.state !== 'MINIGAME') return;
  if (now < run.phaseEndsAt) return;
  switch (run.phase) {
    case 'intro':
      setPhase(run, 'rules', now, T(MINIGAME_TIMING.RULES_MS));
      break;
    case 'rules':
    case 'roundResult':
      if (run.roundIndex + 1 >= run.rounds.length) {
        enterFinal(room, run, now);
        break;
      }
      run.roundIndex += 1;
      setPhase(run, 'ready', now, T(MINIGAME_TIMING.READY_MS));
      break;
    case 'ready': {
      const spec = run.rounds[run.roundIndex]!;
      setPhase(run, 'play', now, spec.playMs + MINIGAME_TIMING.LATENCY_GRACE_MS);
      const idx = run.roundIndex;
      fire('라운드', run.dbId.then((id) => (id ? insertRound(id, idx, spec.itemKey, spec.params, spec.seed) : undefined)));
      break;
    }
    case 'play':
      endRound(room, run, now);
      return; // endRound 가 알린다
    case 'final':
      setPhase(run, 'outro', now, T(MINIGAME_TIMING.OUTRO_MS));
      break;
    case 'outro':
      exitMinigame(room, run, 'completed');
      return;
  }
  broadcast(room);
}

function endRound(room: Room, run: MinigameRun, now: number): void {
  if (run.phase !== 'play') return;
  const def = MINIGAME_DEFS[run.key];
  const subs = run.submissions[run.roundIndex]!;
  // ★ 미제출 = 그 판 꼴찌(0점). 균형은 움직이던 마지막 값(provisional)을 확정으로 쓴다
  const ranked = rankRound(
    run.participants.map((p) => ({ accountId: p.accountId, value: subs.get(p.accountId)?.value ?? null })),
    def.info.better,
  );
  const rows: RoundResultRow[] = ranked.map((r) => {
    const s = subs.get(r.accountId);
    return { accountId: r.accountId, submitted: Boolean(s), value: r.value, error: s?.error ?? null, rank: r.rank, points: r.points, extra: s?.extra ?? null };
  });
  const decimals = decimalsForRanking(rows.filter((r) => r.value !== null).map((r) => r.value as number));
  run.roundResults.push({ roundIndex: run.roundIndex, decimals, rows });
  for (const r of rows) run.totals.set(r.accountId, (run.totals.get(r.accountId) ?? 0) + r.points);
  const idx = run.roundIndex;
  fire(
    '라운드 결과',
    run.dbId.then((id) =>
      id
        ? insertResults(
            id,
            idx,
            rows.map((r) => {
              const s = subs.get(r.accountId);
              return { accountId: r.accountId, submitted: r.submitted, input: s?.input ?? null, value: r.value, error: r.error, elapsedMs: s?.elapsedMs ?? null, rank: r.rank, points: r.points };
            }),
          )
        : undefined,
    ),
  );
  // ★ 퀴즈류(R052~) — 판이 공개되는 순간 접속 중인 참가자에게 경험 기록
  if (def.info.kind === 'quiz' && !run.practice) {
    const witnesses = run.participants.filter((p) => room.players.get(p.accountId)?.connected).map((p) => p.accountId);
    const itemKey = run.rounds[idx]!.itemKey;
    fire('미니게임 경험', run.dbId.then((id) => (id ? recordItemExperiences(witnesses, run.key, itemKey, id) : undefined)));
  }
  setPhase(run, 'roundResult', now, T(MINIGAME_TIMING.ROUND_RESULT_MS));
  broadcast(room);
}

function enterFinal(room: Room, run: MinigameRun, now: number): void {
  const lastRows = run.roundResults[run.roundResults.length - 1]?.rows ?? [];
  const final = rankFinal(
    run.participants.map((p) => ({
      accountId: p.accountId,
      total: run.totals.get(p.accountId) ?? 0,
      lastRoundRank: lastRows.find((r) => r.accountId === p.accountId)?.rank ?? 99,
    })),
  );
  const n = run.participants.length;
  run.final = final.map((f) => ({ accountId: f.accountId, rank: f.rank, total: f.total, reward: run.practice ? 0 : minigameReward(f.rank, n) }));
  // ★★ 보상 — 한 번만. 연습은 없음
  if (!run.practice && !run.rewarded) {
    run.rewarded = true;
    let any = false;
    for (const f of run.final) {
      if (f.reward <= 0) continue;
      const p = room.players.get(f.accountId);
      if (p) {
        p.score += f.reward;
        any = true;
      }
    }
    const finals = run.final;
    fire(
      '보상',
      run.dbId.then(async (id) => {
        if (!id) return;
        const inserted = await insertRewards(id, finals.map((f) => ({ accountId: f.accountId, amount: f.reward, rank: f.rank })));
        console.log(`[minigame] ${room.id} 보상 ${inserted}건 (판 ${id})`);
      }),
    );
    if (any) broadcastPlayers(room);
  }
  setPhase(run, 'final', now, T(MINIGAME_TIMING.FINAL_MS));
}

/** 미니게임을 닫는다. completed 면 퀴즈(다음 문제) 또는 로비로 */
function exitMinigame(room: Room, run: MinigameRun, reason: 'completed' | 'force_ended' | 'abandoned'): void {
  run.endReason = reason;
  const finals = run.final ?? [];
  fire('판 끝', run.dbId.then((id) => (id ? finishRun(id, reason, finals) : undefined)));
  room.minigame = null;
  console.log(`[minigame] ${room.id} 끝 (${reason})`);
  if (reason === 'abandoned') return;
  if (run.practice) {
    room.state = 'LOBBY';
    room.settingsLocked = false;
    emitRoom(room, 'minigame.ended', { state: room.state, practice: true, settingsLocked: false });
    return;
  }
  emitRoom(room, 'minigame.ended', { state: room.state, practice: false });
  if (reason === 'force_ended') return; // 호출자가 finishGame 을 부른다
  // ★ 다음 문제 — 미니게임 앞의 문제는 마지막이 아니었다(마지막 뒤에는 없다)
  if (beginQuestion(room)) return;
  finishGame(room, 'no_questions', '출제할 수 있는 문제가 모두 소진되어 조기 종료되었습니다. 참가자 전원이 이미 경험한 문제만 남았습니다.');
}

/** ★ 방장이 끝냄 (host.forceEnd) — 연습이면 로비로, 퀴즈 판이면 미니게임을 닫고(보상 없음 — final 전이면) 호출자가 게임을 끝낸다 */
export function stopMinigame(room: Room): 'practice' | 'game' | null {
  const run = room.minigame;
  if (!run) return null;
  exitMinigame(room, run, 'force_ended');
  return run.practice ? 'practice' : 'game';
}

/** 방이 사라질 때 (destroyRoom) */
export function abandonMinigame(room: Room): void {
  const run = room.minigame;
  if (!run) return;
  exitMinigame(room, run, 'abandoned');
}

/** 연습 판 (로비 "미니게임 골라 하기") */
export function startPractice(room: Room, key: MinigameKey): boolean {
  if (room.state !== 'LOBBY' || room.game !== null || room.minigame) return false;
  return startMinigame(room, key, { practice: true, afterQuestionIndex: null });
}
