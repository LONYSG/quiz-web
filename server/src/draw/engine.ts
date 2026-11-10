// =============================================================================
// ★★★ 캐치마인드 진행 (R083 · D-330 ⑵ ⑷ · D-340) — 방 상태 DRAW · tick
//
// 라운드 = 그림 하나: 출제자(입장순 돌아가며 · 접속자) → 출제자에게만 키워드 · 모두에게 주제 → 90초 그리기
//   · 선 = 점 배열([x, y, …] 0~1000) · 조각(draw.stroke)으로 오면 서버가 쌓고 그대로 전원에게(draw.stroke) · 지우기(draw.clear)
//   · 출제자는 처음 10초 안 "다른 제시어" 1회(draw.reroll — 선이 없을 때)
//   · 나머지는 채팅에 그대로 친다 → drawChatGate: 맞으면 그 글은 안 보이고 시스템 줄 "○○ 정답!" · 틀리면 보통 채팅
//     출제자 채팅: 키워드(변형 포함) · 글자 수 힌트 거부 · 맞힌 사람 채팅: 키워드 거부(스포)
//   · 모두 맞히거나 90초 → 공개 5초(키워드 · 그림 그대로) → 다음 라운드 / 판 끝
// 점수: 맞힌 순서 3 · 2 · 1 · 그 뒤 1 · 출제자 = 맞힌 사람 수(상한 3) · 아무도 못 맞히면 0 → player.score(포인트 아님)
// 기록: draw_rounds(0033) · 경험 minigame_item_experiences('draw', 항목 id) — fire-and-forget
// ★★ R087 (D-344 · 찬종 테스트 1): 출제자 힌트 버튼 셋(draw.hint — 글자 수 · 초성 · 주제 · 각 1회 · 패널티 없음) · 주제는 기본 숨김(버튼으로 공개)
//   · 힌트는 전원 화면 힌트 띠 + 시스템 줄 · draw_rounds 에는 칸이 없어 서버 로그에만(기록 칸은 0034 — R088)
// =============================================================================

import { randomInt } from 'node:crypto';
import {
  DRAW,
  drawDiffPlan,
  drawDrawerScore,
  drawLengthHint,
  drawLengthPattern,
  drawPointsOk,
  drawSolverScore,
  firstInitial,
  isDrawColor,
  matchTopic,
  flexCanon,
  normalizeAnswer,
  type DrawColor,
  type DrawHintKind,
} from '@quiz/shared';
import { emitRoom, emitRoomPerPlayer } from '../rooms/emit.js';
import type { Player, Room } from '../rooms/types.js';
import { broadcastPlayers, finishGame } from '../game/question.js';
import { ambiguousHint, drawTopics, type TopicSet, type TopicStore } from '../db/topics.js';
import { insertDrawRound, recordDrawExperience } from '../db/draw.js';
import { weightedPick } from '../liar/engine.js';
import { broadcastSystem } from '../rooms/systemChat.js';

/**
 * ★★ R089 (D-346) — 그림 = op 목록(순서 그대로 · 모든 화면이 공용 1000×1000 격자에 같은 순서로 그린다)
 *   stroke = 선(색 · 굵기 · 점 — 조각으로 이어 붙음 · 'erase' = 흰색 선) · fill = 페인트통(x · y · 색 — 각 화면이 격자에서 영역 채우기)
 *   ★ 이름은 옛 그대로 DrawStroke · 칸 strokes(스냅샷 · 늦게 온 사람) — 옛 선(kind 없음)은 stroke.
 */
export interface DrawStroke {
  id: string;
  kind?: 'stroke' | 'fill';
  color: DrawColor;
  width: number;
  pts: number[];
  /** fill 의 점(격자 좌표) */
  x?: number;
  y?: number;
}

export interface DrawRound {
  no: number;
  drawer: string;
  topic: string;
  nameKo: string;
  itemId: string;
  keyword: string;
  set: TopicSet;
  keys: string[];
  participants: string[];
  strokes: DrawStroke[];
  solved: { accountId: string; ms: number }[];
  phase: 'draw' | 'reveal';
  phaseStartedAt: number;
  phaseEndsAt: number;
  rerolled: boolean;
  /** ★ R089 — 되돌린 op id(늦게 온 조각이 같은 id 로 다시 생기지 않게) */
  undone: Set<string>;
  /** ★ R087 — 출제자가 연 힌트 */
  hints: DrawHints;
  scores: Record<string, number> | null;
}

/** ★ R087 — 공개된 힌트(없으면 칸 없음) */
export interface DrawHints {
  length?: string;
  initial?: string;
  topic?: string;
}

export interface DrawRun {
  roundsTotal: number;
  /** ★ R088 — 라운드별 난이도 계획(1 · 2 · 3) */
  diffPlan: number[];
  store: TopicStore;
  experienced: Map<string, Set<string>>;
  lastDrawer: string | null;
  lastTopic: string | null;
  usedItems: Set<string>;
  cur: DrawRound | null;
  done: number;
}

/** ★ 검사(봇 draw)는 짧게 — 값만 다르고 경로는 같다 */
const ROUND_MS = Number(process.env.DRAW_ROUND_MS ?? DRAW.ROUND_MS);

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** ★ 세트(바로 앞 세트 피함) → draw 항목(이 판에서 안 쓴 것 · 본 사람 적은 것) */
export function pickDrawWord(
  store: TopicStore,
  participants: readonly string[],
  experienced: ReadonlyMap<string, ReadonlySet<string>>,
  lastTopic: string | null,
  usedItems: ReadonlySet<string>,
  wantDiff: number | null = null,
): { set: TopicSet; item: TopicSet['items'][number] } | null {
  // ★ R088 (D-345) — 난이도 섞기: 원하는 diff(없으면 2 로 봄)의 항목이 있는 세트만 · 세트 = 남은 항목 수 가중 · 바로 앞 세트 피함
  const diffOf = (x: TopicSet['items'][number]) => x.diff ?? 2;
  const free = (x: TopicSet['items'][number]) => x.draw && !usedItems.has(x.id);
  const fit = (x: TopicSet['items'][number]) => free(x) && (wantDiff === null || diffOf(x) === wantDiff);
  let ok = fit;
  let sets = drawTopics(store).filter((s) => s.items.some(ok));
  if (!sets.length && wantDiff !== null) {
    ok = free;
    sets = drawTopics(store).filter((s) => s.items.some(ok));
  }
  if (!sets.length) return null;
  const pool = sets.filter((s) => s.topic !== lastTopic);
  const usable = pool.length ? pool : sets;
  const set = weightedPick(usable, (s) => s.items.filter(ok).length);
  const seen = (id: string) => participants.filter((a) => experienced.get(a)?.has(`draw|${id}`)).length;
  const items = shuffle(set.items.filter(ok)).sort((a, b) => seen(a.id) - seen(b.id));
  return { set, item: items[0]! };
}

/** ★ 다음 출제자 — 입장순으로 지난 출제자 다음 사람(접속자 중) */
export function nextDrawer(participants: readonly string[], last: string | null): string {
  if (!last) return participants[0]!;
  const i = participants.indexOf(last);
  return participants[(i + 1) % participants.length] ?? participants[0]!;
}

// ★ R090 — 원꼴 · 지운 꼴(flexCanon — 기호 전부) 둘 다
const keysOf = (item: TopicSet['items'][number]) => [...new Set([item.name, item.label, ...item.variants].flatMap((x) => [normalizeAnswer(x), flexCanon(String(x ?? ''))]).filter((x) => x.length >= 2))];

export function drawMentions(text: string, r: Pick<DrawRound, 'set' | 'itemId' | 'keys'>): boolean {
  if (matchTopic(r.set.matcher, text) === r.itemId) return true;
  const n = normalizeAnswer(text);
  const f = flexCanon(text);
  return r.keys.some((k) => n.includes(k) || f.includes(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// 보기
// ─────────────────────────────────────────────────────────────────────────────
export interface DrawView {
  round: number;
  rounds: number;
  phase: 'draw' | 'reveal';
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** ★ R087 — 주제는 기본 숨김: 출제자 · [주제] 힌트 뒤 · 공개 뒤에만(그 밖은 null) */
  topic: string | null;
  nameKo: string | null;
  /** 출제자 · 공개 뒤에만 */
  keyword: string | null;
  /** ★ R087 — 공개된 힌트 · 출제자가 아직 쓸 수 있는 힌트 */
  hints: DrawHints;
  /** ★ R088 — 공개 때 난이도 1~3(없으면 null) */
  diff: number | null;
  hintsLeft: DrawHintKind[];
  drawer: string;
  amDrawer: boolean;
  spectating: boolean;
  participants: string[];
  solved: { accountId: string; ms: number }[];
  mySolved: boolean;
  canReroll: boolean;
  strokes: DrawStroke[];
  scores: Record<string, number> | null;
}

export function drawView(room: Room, viewer: string): DrawView | null {
  const run = room.game?.draw;
  const r = run?.cur;
  if (!run || !r || room.state !== 'DRAW') return null;
  const amDrawer = r.drawer === viewer;
  const now = Date.now();
  return {
    round: r.no,
    rounds: run.roundsTotal,
    phase: r.phase,
    phaseStartedAt: r.phaseStartedAt,
    phaseEndsAt: r.phaseEndsAt,
    topic: amDrawer || r.phase === 'reveal' || r.hints.topic ? r.topic : null,
    nameKo: amDrawer || r.phase === 'reveal' || r.hints.topic ? r.nameKo : null,
    keyword: amDrawer || r.phase === 'reveal' ? r.keyword : null,
    hints: r.hints,
    // ★ R088 — 공개 때 난이도(작게)
    diff: r.phase === 'reveal' ? (r.set.items.find((x) => x.id === r.itemId)?.diff ?? null) : null,
    hintsLeft: amDrawer && r.phase === 'draw' ? (['length', 'initial', 'topic'] as const).filter((k) => !r.hints[k]) : [],
    drawer: r.drawer,
    amDrawer,
    spectating: !r.participants.includes(viewer),
    participants: r.participants,
    solved: r.solved,
    mySolved: r.solved.some((s) => s.accountId === viewer),
    canReroll: amDrawer && r.phase === 'draw' && !r.rerolled && r.strokes.length === 0 && now - r.phaseStartedAt < DRAW.REROLL_MS,
    strokes: r.strokes,
    scores: r.phase === 'reveal' ? r.scores : null,
  };
}

function broadcast(room: Room): void {
  emitRoomPerPlayer(room, 'draw.state', { state: room.state } as Record<string, unknown>, (p: Player) => ({ draw: drawView(room, p.accountId) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 시작 · 라운드
// ─────────────────────────────────────────────────────────────────────────────
export function startDrawGame(room: Room, store: TopicStore, experienced: Map<string, Set<string>>): boolean {
  const game = room.game;
  if (!game) return false;
  game.draw = { roundsTotal: room.settings.minigameRounds, diffPlan: drawDiffPlan(room.settings.minigameRounds), store, experienced, lastDrawer: null, lastTopic: null, usedItems: new Set(), cur: null, done: 0 };
  room.state = 'DRAW';
  return startRound(room, Date.now());
}

function setWord(r: DrawRound, word: { set: TopicSet; item: TopicSet['items'][number] }): void {
  r.topic = word.set.topic;
  r.nameKo = word.set.nameKo;
  r.itemId = word.item.id;
  r.keyword = word.item.label;
  r.set = word.set;
  r.keys = keysOf(word.item);
}

function startRound(room: Room, now: number): boolean {
  const run = room.game?.draw;
  if (!run) return false;
  const participants = [...room.players.values()].filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder).map((p) => p.accountId);
  if (participants.length < DRAW.MIN_PLAYERS) {
    finishGame(room, run.done > 0 ? 'completed' : 'no_questions', `접속한 사람이 ${DRAW.MIN_PLAYERS}명보다 적어 캐치마인드를 끝냈습니다.`);
    return false;
  }
  const word = pickDrawWord(run.store, participants, run.experienced, run.lastTopic, run.usedItems, run.diffPlan[run.done] ?? null);
  if (!word) {
    finishGame(room, run.done > 0 ? 'completed' : 'no_questions', '제시어가 모자라 캐치마인드를 끝냈습니다.');
    return false;
  }
  const drawer = nextDrawer(participants, run.lastDrawer);
  run.lastDrawer = drawer;
  run.lastTopic = word.set.topic;
  run.usedItems.add(word.item.id);
  const r: DrawRound = {
    no: run.done + 1,
    drawer,
    topic: '',
    nameKo: '',
    itemId: '',
    keyword: '',
    set: word.set,
    keys: [],
    participants,
    strokes: [],
    solved: [],
    phase: 'draw',
    phaseStartedAt: now,
    phaseEndsAt: now + ROUND_MS,
    rerolled: false,
    undone: new Set(),
    hints: {},
    scores: null,
  };
  setWord(r, word);
  run.cur = r;
  console.log(`[draw] ${room.id} 라운드 ${r.no}/${run.roundsTotal} — 출제 ${room.players.get(drawer)?.nickname ?? drawer} · ${word.set.nameKo}`);
  broadcast(room);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 입력
// ─────────────────────────────────────────────────────────────────────────────
export type DrawResult = 'ok' | 'not_now' | 'bad';

/** ★ 선 조각 — 같은 id 면 이어 붙이고 새 id 면 새 선 · 서버가 그대로 전원에게 */
export function drawStroke(room: Room, accountId: string, p: { id: string; color: unknown; width: unknown; pts: unknown }): DrawResult {
  const r = room.game?.draw?.cur;
  if (!r || room.state !== 'DRAW' || r.phase !== 'draw') return 'not_now';
  if (accountId !== r.drawer) return 'bad';
  if (!drawPointsOk(p.pts) || !isDrawColor(p.color) || typeof p.width !== 'number' || p.width < 1 || p.width > 60) return 'bad';
  if (r.undone.has(p.id)) return 'bad';
  let s = r.strokes.find((x) => x.id === p.id);
  if (s && s.kind === 'fill') return 'bad';
  if (!s) {
    if (r.strokes.length >= DRAW.MAX_STROKES) return 'bad';
    s = { id: p.id, color: p.color, width: Math.round(p.width), pts: [] };
    r.strokes.push(s);
  }
  if (s.pts.length + p.pts.length > DRAW.MAX_POINTS * 2) return 'bad';
  s.pts.push(...p.pts);
  emitRoom(room, 'draw.stroke', { round: r.no, id: s.id, color: s.color, width: s.width, pts: p.pts });
  return 'ok';
}

/** ★ R089 (D-346) — 페인트통: op 하나(x · y · 색) → 전원에게(각 화면이 격자에서 채운다) */
export function drawFill(room: Room, accountId: string, p: { id: string; x: unknown; y: unknown; color: unknown }): DrawResult {
  const r = room.game?.draw?.cur;
  if (!r || room.state !== 'DRAW' || r.phase !== 'draw') return 'not_now';
  if (accountId !== r.drawer) return 'bad';
  const okXY = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < DRAW.SIZE;
  if (!okXY(p.x) || !okXY(p.y) || !isDrawColor(p.color) || r.undone.has(p.id) || r.strokes.some((x) => x.id === p.id)) return 'bad';
  if (r.strokes.length >= DRAW.MAX_STROKES) return 'bad';
  r.strokes.push({ id: p.id, kind: 'fill', color: p.color, width: 0, pts: [], x: p.x, y: p.y });
  emitRoom(room, 'draw.fill', { round: r.no, id: p.id, x: p.x, y: p.y, color: p.color });
  return 'ok';
}

/** ★ R089 (D-346 · 찬종 "한붓그리기 단위로 · 여러 번") — 되돌리기: 마지막 op 하나(선 · 채우기) · 전체 지우기는 대상 아님 */
export function drawUndo(room: Room, accountId: string): DrawResult {
  const r = room.game?.draw?.cur;
  if (!r || room.state !== 'DRAW' || r.phase !== 'draw') return 'not_now';
  if (accountId !== r.drawer) return 'bad';
  const op = r.strokes.pop();
  if (!op) return 'bad';
  r.undone.add(op.id);
  emitRoom(room, 'draw.undo', { round: r.no, id: op.id });
  return 'ok';
}

export function drawClear(room: Room, accountId: string): DrawResult {
  const r = room.game?.draw?.cur;
  if (!r || room.state !== 'DRAW' || r.phase !== 'draw') return 'not_now';
  if (accountId !== r.drawer) return 'bad';
  r.strokes = [];
  emitRoom(room, 'draw.clear', { round: r.no });
  return 'ok';
}

export function drawReroll(room: Room, accountId: string): DrawResult {
  const run = room.game?.draw;
  const r = run?.cur;
  if (!run || !r || room.state !== 'DRAW' || r.phase !== 'draw') return 'not_now';
  if (accountId !== r.drawer || r.rerolled || r.strokes.length > 0 || Date.now() - r.phaseStartedAt >= DRAW.REROLL_MS) return 'bad';
  const word = pickDrawWord(run.store, r.participants, run.experienced, r.topic, run.usedItems, run.diffPlan[run.done] ?? null);
  if (!word) return 'bad';
  run.usedItems.add(word.item.id);
  run.lastTopic = word.set.topic;
  setWord(r, word);
  r.rerolled = true;
  r.hints = {};
  broadcast(room);
  return 'ok';
}

/** ★ R087 — 출제자 힌트(각 1회 · 그리는 중) → 힌트 띠 + 시스템 줄 */
export function drawHint(room: Room, accountId: string, kind: DrawHintKind): DrawResult {
  const r = room.game?.draw?.cur;
  if (!r || room.state !== 'DRAW' || r.phase !== 'draw') return 'not_now';
  if (accountId !== r.drawer || r.hints[kind]) return 'bad';
  if (kind === 'length') r.hints.length = drawLengthPattern(r.keyword);
  else if (kind === 'initial') r.hints.initial = firstInitial(r.keyword);
  else r.hints.topic = r.nameKo;
  broadcastSystem(room, { length: '출제자가 글자 수를 공개했어요', initial: '출제자가 첫 글자 초성을 공개했어요', topic: '출제자가 주제를 공개했어요' }[kind]);
  console.log(`[draw] ${room.id} 라운드 ${r.no} 힌트 ${kind}`);
  broadcast(room);
  return 'ok';
}

export type DrawChatGate = { ok: true; consumed?: boolean } | { ok: false; reason: 'keyword' | 'length_hint' | 'ambiguous'; message: string };

/**
 * ★ 캐치마인드 판 채팅 — 맞히면 그 글은 안 보이고(consumed) 시스템 줄 · 출제자는 키워드 · 글자 수 힌트 거부 · 맞힌 사람은 키워드 거부
 */
export function drawChatGate(room: Room, accountId: string, text: string): DrawChatGate {
  const r = room.game?.draw?.cur;
  if (!r || room.state !== 'DRAW' || r.phase !== 'draw') return { ok: true };
  if (accountId === r.drawer) {
    if (drawMentions(text, r)) return { ok: false, reason: 'keyword', message: '제시어는 말할 수 없어요' };
    if (drawLengthHint(text)) return { ok: false, reason: 'length_hint', message: '글자 수 힌트는 줄 수 없어요' };
    return { ok: true };
  }
  const already = r.solved.some((s) => s.accountId === accountId);
  if (already) return drawMentions(text, r) ? { ok: false, reason: 'keyword', message: '이미 맞혔어요 — 정답은 비밀!' } : { ok: true };
  if (!r.participants.includes(accountId)) return drawMentions(text, r) ? { ok: false, reason: 'keyword', message: '정답은 비밀!' } : { ok: true };
  if (matchTopic(r.set.matcher, text) !== r.itemId) {
    // ★ R088 — 겹치는 이름(서구 …)이면 본인에게 안내(채팅에는 안 나감 · 오답)
    const hint = ambiguousHint(r.set.ambiguous, text);
    return hint ? { ok: false, reason: 'ambiguous', message: hint } : { ok: true };
  }
  const now = Date.now();
  r.solved.push({ accountId, ms: now - r.phaseStartedAt });
  broadcastSystem(room, `${room.players.get(accountId)?.nickname ?? '?'} 님 정답! (${r.solved.length}번째)`);
  const guessers = r.participants.filter((a) => a !== r.drawer && room.players.get(a)?.connected);
  if (guessers.every((a) => r.solved.some((s) => s.accountId === a))) endRound(room, r, now);
  else broadcast(room);
  return { ok: true, consumed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 끝
// ─────────────────────────────────────────────────────────────────────────────
function endRound(room: Room, r: DrawRound, now: number): void {
  const run = room.game?.draw;
  if (!run || r.phase === 'reveal') return;
  const scores: Record<string, number> = {};
  r.solved.forEach((s, i) => (scores[s.accountId] = drawSolverScore(i)));
  const ds = drawDrawerScore(r.solved.length);
  if (ds > 0) scores[r.drawer] = ds;
  r.scores = scores;
  let any = false;
  for (const [a, n] of Object.entries(scores)) {
    const p = room.players.get(a);
    if (p && n > 0) {
      p.score += n;
      any = true;
    }
  }
  if (any) broadcastPlayers(room);
  r.phase = 'reveal';
  r.phaseStartedAt = now;
  r.phaseEndsAt = now + DRAW.REVEAL_MS;
  run.done += 1;
  for (const a of r.participants) {
    let s = run.experienced.get(a);
    if (!s) run.experienced.set(a, (s = new Set()));
    s.add(`draw|${r.itemId}`);
  }
  const guessers = r.participants.filter((a) => a !== r.drawer).length;
  const outcome = r.solved.length === 0 ? 'none' : r.solved.length >= guessers ? 'all' : 'some';
  void insertDrawRound({
    gameId: room.game?.gameId ?? null,
    round: r.no,
    drawer: r.drawer,
    topic: r.topic,
    itemId: r.itemId,
    keyword: r.keyword,
    rerolled: r.rerolled,
    strokes: r.strokes.length,
    participants: r.participants,
    solved: r.solved,
    outcome,
    scores,
    hints: r.hints as Record<string, string>,
  }).catch((err) => console.error('[draw] ★ 라운드 기록 실패:', (err as Error).message));
  void recordDrawExperience(r.participants, r.itemId).catch((err) => console.error('[draw] ★ 경험 기록 실패:', (err as Error).message));
  console.log(`[draw] ${room.id} 라운드 ${r.no} 끝 — 맞힘 ${r.solved.length}`);
  broadcast(room);
}

export function checkDraw(room: Room, now: number): void {
  const run = room.game?.draw;
  const r = run?.cur;
  if (!run || !r || room.state !== 'DRAW') return;
  // 출제자가 끊겼으면 그 그림은 끝(맞힌 사람 점수만)
  if (r.phase === 'draw' && !room.players.get(r.drawer)?.connected) r.phaseEndsAt = Math.min(r.phaseEndsAt, now);
  if (now < r.phaseEndsAt) return;
  if (r.phase === 'draw') {
    endRound(room, r, now);
    return;
  }
  if (run.done >= run.roundsTotal) {
    finishGame(room, 'completed', null);
    return;
  }
  startRound(room, now);
}
