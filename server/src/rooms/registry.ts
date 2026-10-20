// =============================================================================
// 방 레지스트리
//
// ★ 방 단위 직렬 처리 (docs/04-PROTOCOL.md 1장)
//   Node는 단일 스레드 이벤트 루프이므로, 하나의 이벤트 핸들러가 await 없이 끝까지
//   실행되는 동안 다른 이벤트가 끼어들 수 없다. 그래서 별도의 락 없이 원자성이 보장된다.
//
//   ★★ 이 성질은 판정 블록에 await 를 넣는 순간 무너진다.
//     Phase 3에서 정답 판정을 구현할 때 다음을 반드시 지켜야 한다.
//       (1) 판정과 상태 전환을 하나의 동기 블록에서 수행한다
//       (2) 그 블록 안에 await 를 절대 넣지 않는다
//       (3) 판정에 필요한 데이터(정답 집합, 경험 여부, 힌트)는 문제 시작 시점에
//           메모리로 미리 로드한다
//       (4) DB 기록은 상태 전환이 끝난 뒤 비동기로 한다
//     이 규칙이 깨지면 에러 없이, 평소에는 정상 동작하다가, 동시 입력이 겹치는 순간에만
//     두 명이 정답자가 된다. 재현이 매우 어렵다.
//
//   이 파일의 함수들은 전부 동기다. DB 접근이 필요한 것은 db/rooms.ts 에 있다.
//   ★ 이 분리를 유지하는 것이 (2)를 지키는 실질적 장치다.
// =============================================================================

import { randomBytes, randomInt } from 'node:crypto';
import { DEFAULT_DIFFICULTIES, DEFAULT_TOPICS, MINIGAME_KEYS, MINIGAME_ONLY_ROUNDS, RULES } from '@quiz/shared';
import type { ChatEntry, Player, Room, RoomSettings } from './types.js';

const rooms = new Map<string, Room>();

/** 계정별로 지금 어느 방에 있는지. 한 사람이 두 방에 동시에 있을 수 없다 */
const accountRoom = new Map<string, string>();

/**
 * ★★ R050 (D-232) — 계정별 기기 종류 (클라이언트가 알린다 — 'pc' = 넓은 화면 + 키보드 환경 · 'mobile' = 그 밖).
 *   ★ 화면 표시(참여자 칸 🖥/📱)와 기록(game_players.device · minigame_players.device)에 쓴다. 판정에는 쓰지 않는다.
 *   ★ 방과 따로 둔다 — 방에 들어오기 전(방 목록 화면)에 알려도 남는다. 서버가 재시작되면 다시 알린다(접속 때 보낸다).
 */
export type DeviceKind = 'pc' | 'mobile';
const deviceOfAccount = new Map<string, DeviceKind>();
export function setDevice(accountId: string, kind: DeviceKind): boolean {
  const before = deviceOfAccount.get(accountId);
  deviceOfAccount.set(accountId, kind);
  return before !== kind;
}
export function deviceOf(accountId: string): DeviceKind | null {
  return deviceOfAccount.get(accountId) ?? null;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  questionCount: 20,
  // ★ R033 (Q-11 개정) — 항상 5초 카운트다운. 값은 validateRoomSettings 가 다시 맞춘다
  startMode: 'countdown',
  countdownSec: RULES.START_COUNTDOWN_SEC,
  // ★ 전체. 근거는 shared/settings.ts DEFAULT_DIFFICULTIES 주석 (D-115)
  difficulties: [...DEFAULT_DIFFICULTIES],
  // ★ R034 — 분야 전체 (shared/settings.ts DEFAULT_TOPICS)
  topics: [...DEFAULT_TOPICS],
  // ★★ R050 — 미니게임 포함은 기본 꺼짐 · 넣을 미니게임은 전부 (D-234)
  minigames: false,
  minigameKeys: [...MINIGAME_KEYS],
  // ★★★ R057 — 미니게임만은 기본 꺼짐 · 5개 (D-249)
  minigameOnly: false,
  minigameRounds: MINIGAME_ONLY_ROUNDS.DEFAULT,
};

/**
 * 방 ID. 초대 링크에 들어가므로 추측 불가해야 한다.
 * base64url 12바이트 = 16글자, 96비트. 무작위 대입으로 찾을 수 없다.
 */
export function generateRoomId(): string {
  return randomBytes(12).toString('base64url');
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getRoomOfAccount(accountId: string): Room | undefined {
  const roomId = accountRoom.get(accountId);
  return roomId ? rooms.get(roomId) : undefined;
}

export function allRooms(): Iterable<Room> {
  return rooms.values();
}

export function roomCount(): number {
  return rooms.size;
}

export function registerRoom(room: Room): void {
  rooms.set(room.id, room);
  roomByCode.set(room.code, room.id);
}

/** ★ R043 — 방 코드 → 방 id (열린 방만) */
const roomByCode = new Map<string, string>();

/** ★ R043 — 열린 방과 겹치지 않는 6자리 숫자 코드. 0 으로 시작해도 된다 */
export function generateRoomCode(): string {
  for (;;) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!roomByCode.has(code)) return code;
  }
}

/** ★ R043 — 6자리 코드 또는 긴 id 로 방을 찾는다 */
export function findRoomByCodeOrId(key: string): Room | undefined {
  if (/^\d{6}$/.test(key)) {
    const id = roomByCode.get(key);
    return id ? rooms.get(id) : undefined;
  }
  return rooms.get(key);
}

export function unregisterRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const accountId of room.players.keys()) {
    if (accountRoom.get(accountId) === roomId) accountRoom.delete(accountId);
  }
  rooms.delete(roomId);
  if (roomByCode.get(room.code) === roomId) roomByCode.delete(room.code);
}

export function createRoomObject(
  id: string,
  title: string,
  hostAccountId: string,
): Room {
  return {
    id,
    code: generateRoomCode(),
    title,
    hostAccountId,
    createdBy: hostAccountId,
    createdAt: Date.now(),
    state: 'LOBBY',
    players: new Map(),
    nextJoinOrder: 0,
    settings: { ...DEFAULT_SETTINGS },
    settingsLocked: false,
    countdownEndsAt: null,
    startingGame: false,
    availableQuestionCount: null,
    experienceRates: null,
    lastGameSettings: null,
    chat: [],
    hostGraceUntil: null,
    emptySince: null,
    bannedAccountIds: new Set(),
    departedScores: new Map(),
    awayTickAt: null,
    game: null,
    minigame: null,
    currentQuestion: null,
    result: null,
    paused: null,
    chatTimestamps: new Map(),
  };
}

// -----------------------------------------------------------------------------
// 참가자
// -----------------------------------------------------------------------------

/**
 * 활성 플레이어 수.
 * ★ "활성" 은 접속되어 있고 게임에 참가 중인 플레이어다.
 *   끊김 즉시 반영한다 (Q-29). 표시 유예 5초와는 별개 축이다.
 *   스킵 투표 분모가 이 값을 쓴다 (guide 22절).
 */
export function activeCount(room: Room): number {
  let n = 0;
  for (const player of room.players.values()) if (player.connected) n += 1;
  return n;
}

/** 색상 배정. 아직 쓰이지 않은 가장 작은 인덱스를 준다 */
export function pickColorIndex(room: Room): number {
  const used = new Set<number>();
  for (const player of room.players.values()) used.add(player.colorIndex);
  for (let i = 0; i < RULES.MAX_PLAYERS; i += 1) if (!used.has(i)) return i;
  return 0;
}

export type AddPlayerResult =
  | { ok: true; player: Player; rejoined: boolean; profileChanged?: boolean }
  | { ok: false; reason: 'room_full' };

/**
 * 방에 참가자를 넣는다. 이미 있던 사람이면 재연결로 처리한다.
 *
 * ★ 재연결은 새 플레이어를 만들지 않는다 (guide 47절).
 *   색상과 점수를 유지하고 "접속 종료" 표기만 제거한다.
 * ★ 방장 권한은 돌려주지 않는다 (Q-15 확정). 여기서 hostAccountId 를 건드리지 않는다.
 */
export function addPlayer(
  room: Room,
  accountId: string,
  nickname: string,
  socketId: string,
  avatarV: number | null = null,
): AddPlayerResult {
  const existing = room.players.get(accountId);
  if (existing) {
    existing.connected = true;
    existing.socketId = socketId;
    existing.disconnectedAt = null;
    existing.awayMs = 0;
    // ★ R040 — 다시 들어올 때 닉네임·사진이 바뀌어 있을 수 있다 (DB 에서 바꿈 등) → 부르는 쪽이 방에 다시 알린다
    const profileChanged = existing.nickname !== nickname || existing.avatarV !== avatarV;
    existing.nickname = nickname; // 로비에서 닉네임을 바꿨을 수 있다
    existing.avatarV = avatarV;
    accountRoom.set(accountId, room.id);
    room.emptySince = null;
    return { ok: true, player: existing, rejoined: true, profileChanged };
  }

  if (room.players.size >= RULES.MAX_PLAYERS) {
    return { ok: false, reason: 'room_full' };
  }

  const player: Player = {
    accountId,
    nickname,
    colorIndex: pickColorIndex(room),
    joinOrder: room.nextJoinOrder++,
    connected: true,
    socketId,
    disconnectedAt: null,
    score: 0,
    avatarV,
    awayMs: 0,
  };
  room.players.set(accountId, player);
  accountRoom.set(accountId, room.id);
  room.emptySince = null;
  return { ok: true, player, rejoined: false };
}

/**
 * 접속 종료(끊김 — 타의) 처리.
 *
 * ★★★ R046 (건우 확정 — Q-15 개정) — **나가기(자의)와 끊김(타의)을 가른다.**
 *   이 함수는 **끊김**만 다룬다: 점수 · 자리를 잠시 유지하고, 끊긴 시간(awayMs)이 DISCONNECT_REMOVE_MS(60초)에 닿으면
 *   tick 이 나간 것과 똑같이 뺀다. 나가기 · 옮기기 · 강퇴 · 차단은 ejectPlayer(socket/index.ts) 가 즉시 뺀다.
 */
export function markDisconnected(room: Room, accountId: string): Player | null {
  const player = room.players.get(accountId);
  if (!player) return null;
  player.connected = false;
  player.socketId = null;
  player.disconnectedAt = Date.now();

  if (activeCount(room) === 0) {
    room.emptySince = Date.now();
  }
  return player;
}

/** 슬롯 반환. 방장이 접속 종료자를 내보낼 때와 로비 복귀 시점에 쓴다 */
export function removePlayer(room: Room, accountId: string): Player | null {
  const player = room.players.get(accountId);
  if (!player) return null;
  room.players.delete(accountId);
  if (accountRoom.get(accountId) === room.id) accountRoom.delete(accountId);
  if (activeCount(room) === 0 && room.emptySince === null) room.emptySince = Date.now();
  return player;
}

/**
 * 방장 이전 대상. 입장 순서가 가장 빠른 활성 플레이어 (R001 8-11 자체 판단, 승인됨).
 * 없으면 null.
 */
export function nextHostCandidate(room: Room, excludeAccountId: string): Player | null {
  let best: Player | null = null;
  for (const player of room.players.values()) {
    if (!player.connected) continue;
    if (player.accountId === excludeAccountId) continue;
    if (!best || player.joinOrder < best.joinOrder) best = player;
  }
  return best;
}

// -----------------------------------------------------------------------------
// 채팅
// -----------------------------------------------------------------------------

export function pushChat(room: Room, entry: ChatEntry): void {
  room.chat.push(entry);
  if (room.chat.length > RULES.CHAT_BUFFER_SIZE) {
    room.chat.splice(0, room.chat.length - RULES.CHAT_BUFFER_SIZE);
  }
}

/** 테스트 전용. 프로세스 내 상태를 비운다 */
export function resetRegistryForTest(): void {
  rooms.clear();
  accountRoom.clear();
  roomByCode.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ R046 — 끊김 60초가 지났을 때 부를 곳 (socket/index.ts 가 ejectPlayer 를 건다 — tick 과 순환 import 를 피한다)
// ─────────────────────────────────────────────────────────────────────────────
let awayExpired: (room: Room, accountId: string) => void = () => undefined;
export function onAwayExpired(fn: (room: Room, accountId: string) => void): void {
  awayExpired = fn;
}
export function expireAway(room: Room, accountId: string): void {
  awayExpired(room, accountId);
}
