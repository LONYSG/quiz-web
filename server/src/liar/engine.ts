// =============================================================================
// ★★★ 라이어 게임 진행 (R082 · D-330 ⑵ ⑶ · D-339) — 방 상태 LIAR · 서버 상태 기계(tick) · 판정 권한은 서버
//
// 라운드: ⓐ assign(주제 · 시민 = 키워드 / 라이어 = "당신이 라이어") → ⓑ describe(무작위 순서 · 차례인 사람만 채팅 한 줄 · 시간 지나면 "(…)")
//   → ⓒ vote(모두 동시 · 자기 제외 · 바꿀 수 있음 · 채팅 열림) → tally(누가 누굴 찍었나) → 최다 1명 → ⓓ defense(지목된 사람 한 줄)
//   → ⓔ final(찬반 · 지목된 사람 빼고 · 과반 "라이어다" 면 확정) → 확정이면 ⓕ / 부결이면 다시 지목(그 사람 빼고 · 최대 LIAR.MAX_ACCUSE)
//   · 첫 투표 동률 → 동률자끼리 재투표 1회 → 또 동률 · 표 없음 = 못 찾음
//   ⓕ 확정된 사람이 라이어면 guess(라이어가 키워드 맞히기) → reveal(누구 · 키워드 · 결과 · 점수) → 다음 라운드 / 판 끝.
// 점수: shared liarRoundScores(시민 = 확정된 지목 투표에서 라이어를 찍은 사람 +1 · 라이어 못 들킴 +3 · 들켰지만 맞힘 +2) → player.score(포인트 아님).
// 채팅: liarChatGate 가 판정한다 — 설명 · 항변 단계는 차례인 사람만 · 키워드(이름 · 변형)를 담은 글은 누구든 거부(공개 전까지).
// 기록: liar_rounds(0032) 한 라운드 한 행 · 경험 minigame_item_experiences('liar', 항목 id) — 전부 fire-and-forget.
// =============================================================================

import { randomInt } from 'node:crypto';
import { LIAR, finalPasses, liarRoundScores, matchTopic, normalizeAnswer, tallyVotes, type LiarOutcome, type LiarPhase } from '@quiz/shared';
import { emitRoomPerPlayer } from '../rooms/emit.js';
import type { Player, Room } from '../rooms/types.js';
import { broadcastPlayers, finishGame } from '../game/question.js';
import { liarTopics, type TopicSet, type TopicStore } from '../db/topics.js';
import { insertLiarRound, recordLiarExperience } from '../db/liar.js';

export interface LiarVoteLog {
  stage: 'vote' | 'revote' | 'final';
  accusedNo: number;
  votes: Record<string, string | boolean>;
  result: string | null;
}

export interface LiarRound {
  no: number;
  topic: string;
  nameKo: string;
  itemId: string;
  keyword: string;
  /** 키워드 판정용(세트 판정 맵 + 이 항목의 열쇠들) */
  set: TopicSet;
  keys: string[];
  liar: string;
  participants: string[];
  order: string[];
  turn: number;
  says: { accountId: string; text: string; auto: boolean }[];
  phase: LiarPhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** 지금 투표(계정 → 찍은 사람) · 재투표 후보 · 지목된 사람 · 이미 지목됐던 사람 */
  votes: Map<string, string>;
  candidates: string[] | null;
  accused: string | null;
  accusedTried: string[];
  /** 지금 지목을 낳은 투표(확정되면 그 표로 시민 점수) */
  accuseVotes: Map<string, string>;
  finalVotes: Map<string, boolean>;
  lastTally: { stage: 'vote' | 'revote'; votes: Record<string, string>; counts: Record<string, number>; top: string[] } | null;
  lastFinal: { yes: number; no: number; eligible: number; passed: boolean } | null;
  voteLog: LiarVoteLog[];
  outcome: LiarOutcome | null;
  guess: string | null;
  guessOk: boolean | null;
  scores: Record<string, number> | null;
}

export interface LiarRun {
  roundsTotal: number;
  store: TopicStore;
  experienced: Map<string, Set<string>>;
  liarCount: Map<string, number>;
  lastLiar: string | null;
  lastTopic: string | null;
  usedItems: Set<string>;
  cur: LiarRound | null;
  done: number;
}

const T = LIAR;

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function setPhase(r: LiarRound, phase: LiarPhase, now: number, ms: number): void {
  r.phase = phase;
  r.phaseStartedAt = now;
  r.phaseEndsAt = now + ms;
}

/** 지금 이 방에 있고 접속 중인 사람 */
const live = (room: Room, ids: readonly string[]) => ids.filter((a) => room.players.get(a)?.connected);

// ─────────────────────────────────────────────────────────────────────────────
// 제시어 · 라이어 고르기
// ─────────────────────────────────────────────────────────────────────────────
/** ★ 세트 하나(바로 앞 세트 아님 · 가능하면) → liar 항목 하나(이 판에서 안 쓴 것 · 참가자 중 본 사람이 적은 것) */
export function pickLiarWord(
  store: TopicStore,
  participants: readonly string[],
  experienced: ReadonlyMap<string, ReadonlySet<string>>,
  lastTopic: string | null,
  usedItems: ReadonlySet<string>,
): { set: TopicSet; item: TopicSet['items'][number] } | null {
  const sets = liarTopics(store);
  if (sets.length === 0) return null;
  const pool = sets.filter((s) => s.topic !== lastTopic && s.items.some((x) => x.liar && !usedItems.has(x.id)));
  const usable = pool.length ? pool : sets.filter((s) => s.items.some((x) => x.liar && !usedItems.has(x.id)));
  if (!usable.length) return null;
  const set = usable[randomInt(usable.length)]!;
  const seen = (id: string) => participants.filter((a) => experienced.get(a)?.has(`liar|${id}`)).length;
  const items = shuffle(set.items.filter((x) => x.liar && !usedItems.has(x.id))).sort((a, b) => seen(a.id) - seen(b.id));
  return { set, item: items[0]! };
}

/** ★ 라이어 — 덜 한 사람 먼저 · 바로 앞 라운드 라이어는 피함(가능하면) */
export function pickLiar(participants: readonly string[], count: ReadonlyMap<string, number>, last: string | null): string {
  const pool = participants.length > 1 ? participants.filter((a) => a !== last) : [...participants];
  const min = Math.min(...pool.map((a) => count.get(a) ?? 0));
  const cands = pool.filter((a) => (count.get(a) ?? 0) === min);
  return cands[randomInt(cands.length)]!;
}

/** 키워드 열쇠(이름 · 화면 이름 · 변형의 정규화 꼴 — 2자 이상) */
function keysOf(item: TopicSet['items'][number]): string[] {
  return [...new Set([item.name, item.label, ...item.variants].map((x) => normalizeAnswer(x)).filter((x) => x.length >= 2))];
}

/** ★ 글에 키워드가 들어 있나(그대로 · 변형 · 문장 속) */
export function mentionsKeyword(text: string, r: Pick<LiarRound, 'set' | 'itemId' | 'keys'>): boolean {
  if (matchTopic(r.set.matcher, text) === r.itemId) return true;
  const n = normalizeAnswer(text);
  return r.keys.some((k) => n.includes(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// 화면용 보기
// ─────────────────────────────────────────────────────────────────────────────
export interface LiarView {
  round: number;
  rounds: number;
  phase: LiarPhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  topic: string;
  nameKo: string;
  /** 시민 · 공개 뒤에만 */
  keyword: string | null;
  amLiar: boolean;
  spectating: boolean;
  participants: string[];
  order: string[];
  turn: string | null;
  says: { accountId: string; text: string; auto: boolean }[];
  myVote: string | null;
  votedCount: number;
  candidates: string[] | null;
  accused: string | null;
  accusedTried: string[];
  lastTally: LiarRound['lastTally'];
  myFinal: boolean | null;
  lastFinal: LiarRound['lastFinal'];
  /** 공개(reveal · guess) 때만 */
  liar: string | null;
  outcome: LiarOutcome | null;
  guess: string | null;
  guessOk: boolean | null;
  scores: Record<string, number> | null;
}

export function liarView(room: Room, viewer: string): LiarView | null {
  const run = room.game?.liar;
  const r = run?.cur;
  if (!run || !r || room.state !== 'LIAR') return null;
  const part = r.participants.includes(viewer);
  const open = r.phase === 'guess' || r.phase === 'reveal';
  const amLiar = part && r.liar === viewer;
  return {
    round: r.no,
    rounds: run.roundsTotal,
    phase: r.phase,
    phaseStartedAt: r.phaseStartedAt,
    phaseEndsAt: r.phaseEndsAt,
    topic: r.topic,
    nameKo: r.nameKo,
    // ★ 키워드는 시민에게만(라이어 · 구경꾼은 공개 뒤) — guess 단계에서는 라이어가 맞히는 중이라 공개 전과 같다
    keyword: (part && !amLiar) || r.phase === 'reveal' ? r.keyword : null,
    amLiar,
    spectating: !part,
    participants: r.participants,
    order: r.order,
    turn: r.phase === 'describe' ? (r.order[r.turn] ?? null) : r.phase === 'defense' ? r.accused : null,
    says: r.says,
    myVote: r.votes.get(viewer) ?? null,
    votedCount: r.phase === 'final' ? r.finalVotes.size : r.votes.size,
    candidates: r.candidates,
    accused: r.accused,
    accusedTried: r.accusedTried,
    lastTally: r.lastTally,
    myFinal: r.finalVotes.has(viewer) ? r.finalVotes.get(viewer)! : null,
    lastFinal: r.lastFinal,
    liar: open ? r.liar : null,
    outcome: open ? r.outcome : null,
    guess: r.phase === 'reveal' ? r.guess : null,
    guessOk: r.phase === 'reveal' ? r.guessOk : null,
    scores: r.phase === 'reveal' ? r.scores : null,
  };
}

function broadcast(room: Room): void {
  emitRoomPerPlayer(room, 'liar.state', { state: room.state } as Record<string, unknown>, (p: Player) => ({ liar: liarView(room, p.accountId) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 시작 · 라운드
// ─────────────────────────────────────────────────────────────────────────────
export function startLiarGame(room: Room, store: TopicStore, experienced: Map<string, Set<string>>): boolean {
  const game = room.game;
  if (!game) return false;
  game.liar = {
    roundsTotal: room.settings.minigameRounds,
    store,
    experienced,
    liarCount: new Map(),
    lastLiar: null,
    lastTopic: null,
    usedItems: new Set(),
    cur: null,
    done: 0,
  };
  room.state = 'LIAR';
  return startRound(room, Date.now());
}

function startRound(room: Room, now: number): boolean {
  const run = room.game?.liar;
  if (!run) return false;
  const participants = [...room.players.values()].filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder).map((p) => p.accountId);
  if (participants.length < T.MIN_PLAYERS) {
    finishGame(room, run.done > 0 ? 'completed' : 'no_questions', `접속한 사람이 ${T.MIN_PLAYERS}명보다 적어 라이어 게임을 끝냈습니다.`);
    return false;
  }
  const word = pickLiarWord(run.store, participants, run.experienced, run.lastTopic, run.usedItems);
  if (!word) {
    finishGame(room, run.done > 0 ? 'completed' : 'no_questions', '제시어가 모자라 라이어 게임을 끝냈습니다.');
    return false;
  }
  const liar = pickLiar(participants, run.liarCount, run.lastLiar);
  run.liarCount.set(liar, (run.liarCount.get(liar) ?? 0) + 1);
  run.lastLiar = liar;
  run.lastTopic = word.set.topic;
  run.usedItems.add(word.item.id);
  run.cur = {
    no: run.done + 1,
    topic: word.set.topic,
    nameKo: word.set.nameKo,
    itemId: word.item.id,
    keyword: word.item.label,
    set: word.set,
    keys: keysOf(word.item),
    liar,
    participants,
    order: shuffle([...participants]),
    turn: 0,
    says: [],
    phase: 'assign',
    phaseStartedAt: now,
    phaseEndsAt: now + T.ASSIGN_MS,
    votes: new Map(),
    candidates: null,
    accused: null,
    accusedTried: [],
    accuseVotes: new Map(),
    finalVotes: new Map(),
    lastTally: null,
    lastFinal: null,
    voteLog: [],
    outcome: null,
    guess: null,
    guessOk: null,
    scores: null,
  };
  console.log(`[liar] ${room.id} 라운드 ${run.cur.no}/${run.roundsTotal} — 주제 ${word.set.nameKo} · ${participants.length}명`);
  broadcast(room);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 입력 — 채팅(설명 · 항변) · 투표 · 찬반 · 키워드 맞히기
// ─────────────────────────────────────────────────────────────────────────────
export type ChatGate = { ok: true } | { ok: false; reason: 'not_turn' | 'keyword' | 'too_long'; message: string };

/** ★ 라이어 판 채팅 — 설명 · 항변 단계는 차례인 사람만 · 키워드를 담은 글은 누구든(공개 전) · 차례 말은 기록하고 다음으로 */
export function liarChatGate(room: Room, accountId: string, text: string): ChatGate {
  const r = room.game?.liar?.cur;
  if (!r || room.state !== 'LIAR') return { ok: true };
  const turnPhase = r.phase === 'describe' || r.phase === 'defense';
  const speaker = r.phase === 'describe' ? r.order[r.turn] : r.phase === 'defense' ? r.accused : null;
  if (turnPhase && accountId !== speaker) {
    const nick = speaker ? (room.players.get(speaker)?.nickname ?? '') : '';
    return { ok: false, reason: 'not_turn', message: `${nick} 님 차례예요` };
  }
  if (r.phase !== 'reveal' && mentionsKeyword(text, r)) return { ok: false, reason: 'keyword', message: '키워드는 말할 수 없어요' };
  if (turnPhase && [...text].length > T.SAY_MAX) return { ok: false, reason: 'too_long', message: `한마디는 ${T.SAY_MAX}자까지예요` };
  if (turnPhase) {
    r.says.push({ accountId, text, auto: false });
    advanceSay(room, r, Date.now());
  }
  return { ok: true };
}

function advanceSay(room: Room, r: LiarRound, now: number): void {
  if (r.phase === 'defense') {
    startFinal(room, r, now);
    return;
  }
  r.turn += 1;
  if (r.turn >= r.order.length) startVote(room, r, now, 'vote');
  else setPhase(r, 'describe', now, T.SAY_MS);
  broadcast(room);
}

export type LiarInputResult = 'ok' | 'not_now' | 'bad';

export function liarVote(room: Room, accountId: string, target: string): LiarInputResult {
  const r = room.game?.liar?.cur;
  if (!r || room.state !== 'LIAR' || (r.phase !== 'vote' && r.phase !== 'revote')) return 'not_now';
  if (!r.participants.includes(accountId) || target === accountId) return 'bad';
  const allowed = r.phase === 'revote' && r.candidates ? r.candidates : r.participants.filter((a) => !r.accusedTried.includes(a));
  if (!allowed.includes(target)) return 'bad';
  r.votes.set(accountId, target);
  // 접속자 전원이 냈으면 바로 집계
  if (live(room, r.participants).every((a) => r.votes.has(a))) endVote(room, r, Date.now());
  else broadcast(room);
  return 'ok';
}

export function liarFinal(room: Room, accountId: string, yes: boolean): LiarInputResult {
  const r = room.game?.liar?.cur;
  if (!r || room.state !== 'LIAR' || r.phase !== 'final') return 'not_now';
  if (!r.participants.includes(accountId) || accountId === r.accused) return 'bad';
  r.finalVotes.set(accountId, yes);
  if (live(room, r.participants).filter((a) => a !== r.accused).every((a) => r.finalVotes.has(a))) endFinal(room, r, Date.now());
  else broadcast(room);
  return 'ok';
}

export function liarGuess(room: Room, accountId: string, text: string): LiarInputResult {
  const r = room.game?.liar?.cur;
  if (!r || room.state !== 'LIAR' || r.phase !== 'guess') return 'not_now';
  if (accountId !== r.liar) return 'bad';
  const t = text.trim().slice(0, 40);
  if (!t) return 'bad';
  r.guess = t;
  r.guessOk = matchTopic(r.set.matcher, t) === r.itemId;
  endRound(room, r, Date.now());
  return 'ok';
}

// ─────────────────────────────────────────────────────────────────────────────
// 단계 넘기기
// ─────────────────────────────────────────────────────────────────────────────
function startVote(room: Room, r: LiarRound, now: number, stage: 'vote' | 'revote'): void {
  r.votes = new Map();
  if (stage === 'vote') r.candidates = null;
  setPhase(r, stage, now, stage === 'vote' ? T.VOTE_MS : T.REVOTE_MS);
}

function endVote(room: Room, r: LiarRound, now: number): void {
  const stage = r.phase as 'vote' | 'revote';
  const t = tallyVotes(r.votes);
  const votes = Object.fromEntries(r.votes);
  r.lastTally = { stage, votes, counts: Object.fromEntries(t.counts), top: t.top };
  r.voteLog.push({ stage, accusedNo: r.accusedTried.length + 1, votes, result: t.top.length === 1 ? t.top[0]! : null });
  if (t.top.length === 1) {
    r.accused = t.top[0]!;
    r.accuseVotes = new Map(r.votes);
    setPhase(r, 'tally', now, T.TALLY_MS);
  } else if (t.top.length > 1 && stage === 'vote') {
    // 동률 → 동률자끼리 재투표 1회(공개를 잠깐 보여 준 뒤)
    r.candidates = t.top;
    r.accused = null;
    setPhase(r, 'tally', now, T.TALLY_MS);
  } else {
    // 또 동률 · 표 없음 → 못 찾음
    r.accused = null;
    r.candidates = null;
    r.outcome = 'notfound';
    setPhase(r, 'tally', now, T.TALLY_MS);
  }
  broadcast(room);
}

function afterTally(room: Room, r: LiarRound, now: number): void {
  if (r.outcome === 'notfound') {
    endRound(room, r, now);
    return;
  }
  if (r.accused) {
    setPhase(r, 'defense', now, T.SAY_MS);
    broadcast(room);
    return;
  }
  startVote(room, r, now, 'revote');
  broadcast(room);
}

function startFinal(room: Room, r: LiarRound, now: number): void {
  r.finalVotes = new Map();
  setPhase(r, 'final', now, T.FINAL_MS);
  broadcast(room);
}

function endFinal(room: Room, r: LiarRound, now: number): void {
  const eligible = live(room, r.participants).filter((a) => a !== r.accused).length;
  const yes = [...r.finalVotes.values()].filter(Boolean).length;
  const passed = finalPasses(yes, eligible);
  r.lastFinal = { yes, no: r.finalVotes.size - yes, eligible, passed };
  r.voteLog.push({ stage: 'final', accusedNo: r.accusedTried.length + 1, votes: Object.fromEntries(r.finalVotes), result: passed ? 'yes' : 'no' });
  const accused = r.accused!;
  r.accusedTried.push(accused);
  if (passed) {
    if (accused === r.liar) {
      r.outcome = 'caught';
      setPhase(r, 'guess', now, T.GUESS_MS);
      broadcast(room);
      return;
    }
    r.outcome = 'escaped';
    endRound(room, r, now);
    return;
  }
  // 부결 → 다시 지목(이미 지목된 사람 빼고) · 최대 횟수까지
  if (r.accusedTried.length < T.MAX_ACCUSE && r.participants.filter((a) => !r.accusedTried.includes(a)).length >= 2) {
    r.accused = null;
    startVote(room, r, now, 'vote');
    broadcast(room);
    return;
  }
  r.outcome = 'notfound';
  endRound(room, r, now);
}

function endRound(room: Room, r: LiarRound, now: number): void {
  const run = room.game?.liar;
  if (!run || r.phase === 'reveal') return;
  const outcome = r.outcome ?? 'notfound';
  r.outcome = outcome;
  if (outcome !== 'caught') r.guessOk = null;
  const hitters = [...r.accuseVotes.entries()].filter(([, t]) => t === r.liar).map(([a]) => a);
  const scores = liarRoundScores({ outcome, liar: r.liar, guessOk: r.guessOk === true, hitters });
  r.scores = Object.fromEntries(scores);
  let any = false;
  for (const [a, n] of scores) {
    const p = room.players.get(a);
    if (p && n > 0) {
      p.score += n;
      any = true;
    }
  }
  if (any) broadcastPlayers(room);
  setPhase(r, 'reveal', now, T.REVEAL_MS);
  run.done += 1;
  // 기록 — 라운드 한 행 · 경험(참가자 전원 — 키워드를 본 것이다 · 라이어도 공개 때 봤다)
  for (const a of r.participants) {
    let s = run.experienced.get(a);
    if (!s) run.experienced.set(a, (s = new Set()));
    s.add(`liar|${r.itemId}`);
  }
  const gameId = room.game?.gameId ?? null;
  void insertLiarRound({
    gameId,
    round: r.no,
    topic: r.topic,
    itemId: r.itemId,
    keyword: r.keyword,
    liar: r.liar,
    participants: r.participants,
    order: r.order,
    says: r.says,
    votes: r.voteLog,
    outcome,
    accused: r.accusedTried,
    guess: r.guess,
    guessOk: r.guessOk,
    scores: r.scores,
  }).catch((err) => console.error('[liar] ★ 라운드 기록 실패:', (err as Error).message));
  void recordLiarExperience(r.participants, r.itemId).catch((err) => console.error('[liar] ★ 경험 기록 실패:', (err as Error).message));
  console.log(`[liar] ${room.id} 라운드 ${r.no} 끝 — ${outcome}${r.guessOk ? ' · 키워드 맞힘' : ''}`);
  broadcast(room);
}

// ─────────────────────────────────────────────────────────────────────────────
// tick
// ─────────────────────────────────────────────────────────────────────────────
export function checkLiar(room: Room, now: number): void {
  const run = room.game?.liar;
  const r = run?.cur;
  if (!run || !r || room.state !== 'LIAR') return;
  // 설명 · 항변 차례인 사람이 끊겼으면 기다리지 않는다
  const speaker = r.phase === 'describe' ? r.order[r.turn] : r.phase === 'defense' ? r.accused : null;
  if (speaker && !room.players.get(speaker)?.connected) r.phaseEndsAt = Math.min(r.phaseEndsAt, now);
  if (now < r.phaseEndsAt) return;
  switch (r.phase) {
    case 'assign':
      setPhase(r, 'describe', now, T.SAY_MS);
      broadcast(room);
      return;
    case 'describe':
    case 'defense': {
      // 시간 지남 — "(…)" 로 넘어감
      const who = r.phase === 'describe' ? r.order[r.turn] : r.accused;
      if (who) r.says.push({ accountId: who, text: '(…)', auto: true });
      advanceSay(room, r, now);
      return;
    }
    case 'vote':
    case 'revote':
      endVote(room, r, now);
      return;
    case 'tally':
      afterTally(room, r, now);
      return;
    case 'final':
      endFinal(room, r, now);
      return;
    case 'guess':
      r.guessOk = false;
      endRound(room, r, now);
      return;
    case 'reveal':
      if (run.done >= run.roundsTotal) {
        finishGame(room, 'completed', null);
        return;
      }
      startRound(room, now);
      return;
  }
}

/** ★ 설명 · 항변 차례인 사람이 나갔거나 끊겼으면 기다리지 않는다(tick 이 부르기 전에 — 접속 끊김 알림에서) */
export function liarSkipGone(room: Room): void {
  const r = room.game?.liar?.cur;
  if (!r || room.state !== 'LIAR') return;
  const who = r.phase === 'describe' ? r.order[r.turn] : r.phase === 'defense' ? r.accused : null;
  if (who && !room.players.get(who)?.connected) r.phaseEndsAt = Math.min(r.phaseEndsAt, Date.now());
}
