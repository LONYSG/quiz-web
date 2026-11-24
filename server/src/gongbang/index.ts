// =============================================================================
// ★★★ R116 (D-373 · docs/24 3절) — 공방 서버: 목록 구독 · 잠금 · 정원 · 빠른 입장 · 모드 바꾸기 알림
//
//   ★ 스위치 GONGBANG(config.gongbang)이 꺼져 있으면 여기 이벤트는 전부 거절하고, 방에는 아무 칸도 붙이지 않는다(오늘과 같다).
//   ★ 목록은 서버 메모리(allRooms)에서 만든다 — DB 를 읽지 않는다(02 3장 "타이머로 DB 를 깨우지 않는다").
//   ★ 목록 방송: 화면이 목록을 보는 동안만 소켓을 dir:<자리>:<종류> 묶음에 넣고, 1초마다 구독자가 있는 묶음만 다시 만들어
//     **지난번과 달라졌을 때만** 보낸다(24 3-6 의 "바뀐 자리마다 dirty 표시" 대신 내용 비교 — 방 코드 곳곳을 고치지 않고 같은 효과).
//   ★ 판정 경로와 섞이지 않는다 — 여기 함수는 방 상태를 읽기만 하고(목록), 바꾸는 것은 정원 · 비밀번호 · 방 만들 때 기본값뿐.
// =============================================================================

import type { Socket } from 'socket.io';
import {
  GONGBANG,
  ROOM_KINDS,
  bannedWordOf,
  clampMaxPlayers,
  isRoomKind,
  isRoomPassword,
  minPlayersOf,
  modeOfKind,
  parseQuickJoinOpts,
  quizMinigameKeys,
  rankQuickJoin,
  roomKindOf,
  sortRoomList,
  type QuickJoinField,
  type QuickJoinOpts,
  type RoomKind,
  type RoomListItem,
  type Site,
} from '@quiz/shared';
import { config } from '../config.js';
import { allRooms, findRoomByCodeOrId, getRoomOfAccount } from '../rooms/registry.js';
import { emitRoom, ioServer } from '../rooms/emit.js';
import { broadcastSystem } from '../rooms/systemChat.js';
import type { Room } from '../rooms/types.js';
import { WindowCounter } from '../security/limits.js';
import { on, onRoom, parseObject, sendError, type SocketData } from '../socket/guard.js';

// ─────────────────────────────────────────────────────────────────────────────
// 방 만들 때 · 방 종류
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateExtras {
  kind: RoomKind;
  maxPlayers: number;
  password: string | null;
}

/** room.create 의 새 칸 읽기 — 없는 칸은 기본(퀴즈 · 정원 8 · 열린 방 · 옛 화면도 받는다) · 틀린 값이면 null */
export function parseCreateExtras(obj: Record<string, unknown>): CreateExtras | null {
  const kind: RoomKind = obj.kind === undefined ? 'quiz' : isRoomKind(obj.kind) ? obj.kind : (null as never);
  if (!kind) return null;
  const maxPlayers = obj.maxPlayers === undefined ? Math.max(GONGBANG.DEFAULT_MAX_PLAYERS, minPlayersOf(kind)) : clampMaxPlayers(kind, obj.maxPlayers);
  if (maxPlayers === null) return null;
  let password: string | null = null;
  if (obj.password !== undefined && obj.password !== null && obj.password !== '') {
    if (!isRoomPassword(obj.password)) return null;
    password = obj.password;
  }
  return { kind, maxPlayers, password };
}

/** 스위치를 켠 서버에서 새 방에 공방 칸을 붙인다(정원 · 잠금 · 처음 방식 · 미니게임 기본 = 퀴즈형만) */
export function applyCreateExtras(room: Room, x: CreateExtras): void {
  room.maxPlayers = x.maxPlayers;
  room.password = x.password;
  room.passwordFails = new Map();
  room.settings = { ...room.settings, mode: modeOfKind(x.kind), minigameOnly: false };
  // ★ 찬종 ⑧ — 미니게임 포함은 기본 꺼짐 그대로 · 켜면 퀴즈형만 골라져 있다(공개 자리에서 숨기는 것은 이미 빠진 목록에서 거른다)
  const allowed = new Set(room.settings.minigameKeys);
  room.settings.minigameKeys = quizMinigameKeys().filter((k) => allowed.has(k));
}

/** 방 제목 · 닉네임 금칙어(스위치를 켰을 때만) — 걸리면 안내 글 */
export function bannedTextMessage(text: string, what: '방 제목' | '닉네임'): string | null {
  if (!config.gongbang) return null;
  return bannedWordOf(text) ? `${what}에 쓸 수 없는 말이 들어 있어요.` : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 잠금 — 6자리 코드 · 목록 · 빠른 입장은 비밀번호 · 긴 초대 링크는 통과(링크를 가진 것이 곧 초대 · 24 3-3)
// ─────────────────────────────────────────────────────────────────────────────

const triesPerAccount = new WindowCounter(60_000, GONGBANG.PASSWORD_TRY_PER_MIN);

export type LockCheck =
  | { ok: true }
  | { ok: false; code: 'ROOM_LOCKED' }
  | { ok: false; code: 'WRONG_PASSWORD'; left: number }
  | { ok: false; code: 'PASSWORD_LOCKED'; waitMs: number };

/**
 * 잠긴 방에 6자리 코드로 들어올 때. 긴 id(초대 링크 · 친구 초대 · 친구 [들어가기]) · 이미 그 방 사람은 부르는 쪽이 건너뛴다.
 *   ★ 동기 — await 없음(두 사람이 같은 자리를 다툴 때 순서가 흔들리지 않게).
 */
export function checkRoomPassword(room: Room, accountId: string, given: unknown, now = Date.now()): LockCheck {
  if (!room.password) return { ok: true };
  if (given === undefined || given === null || given === '') return { ok: false, code: 'ROOM_LOCKED' };
  const fails = (room.passwordFails ??= new Map());
  const f = fails.get(accountId);
  if (f && f.until > now) return { ok: false, code: 'PASSWORD_LOCKED', waitMs: f.until - now };
  if (!triesPerAccount.hit(accountId, now)) return { ok: false, code: 'PASSWORD_LOCKED', waitMs: triesPerAccount.retryMs(accountId, now) || 60_000 };
  if (typeof given === 'string' && given === room.password) {
    fails.delete(accountId);
    return { ok: true };
  }
  const n = (f && f.until <= now && f.n >= GONGBANG.PASSWORD_FAIL_MAX ? 0 : (f?.n ?? 0)) + 1;
  if (n >= GONGBANG.PASSWORD_FAIL_MAX) {
    fails.set(accountId, { n, until: now + GONGBANG.PASSWORD_LOCK_MS });
    return { ok: false, code: 'PASSWORD_LOCKED', waitMs: GONGBANG.PASSWORD_LOCK_MS };
  }
  fails.set(accountId, { n, until: 0 });
  return { ok: false, code: 'WRONG_PASSWORD', left: GONGBANG.PASSWORD_FAIL_MAX - n };
}

export function lockMessage(c: Exclude<LockCheck, { ok: true }>): string {
  if (c.code === 'ROOM_LOCKED') return '잠긴 방이에요 — 비밀번호 4자리를 넣어 주세요.';
  if (c.code === 'WRONG_PASSWORD') return `비밀번호가 틀렸어요 — ${c.left}번 남았어요.`;
  return `비밀번호를 너무 많이 틀렸어요. ${Math.max(1, Math.ceil(c.waitMs / 60_000))}분 뒤 다시 해 주세요.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 목록 줄
// ─────────────────────────────────────────────────────────────────────────────

function progressOf(room: Room): RoomListItem['progress'] {
  const g = room.game;
  if (!g || room.state === 'LOBBY' || room.state === 'GAME_RESULT') return null;
  if (g.liar) return { done: g.liar.cur?.no ?? 0, total: g.liar.roundsTotal };
  if (g.draw) return { done: g.draw.cur?.no ?? 0, total: g.draw.roundsTotal };
  if (g.mgSeries) return { done: g.mgSeries.done, total: g.mgSeries.total };
  return { done: g.questionIndex, total: g.totalQuestions };
}

export function listItemOf(room: Room): RoomListItem {
  const kind = roomKindOf(room.settings.mode);
  const waiting = room.state === 'LOBBY' || room.state === 'GAME_RESULT';
  return {
    code: room.code,
    title: room.title,
    kind,
    tag: room.settings.mode === 'minigame' ? 'minigame' : room.settings.mode === 'song' ? 'song' : null,
    players: room.players.size,
    max: room.maxPlayers ?? GONGBANG.MAX_PLAYERS,
    locked: Boolean(room.password),
    phase: waiting ? 'waiting' : 'playing',
    paused: room.state === 'PAUSED',
    progress: progressOf(room),
    minigames: kind === 'quiz' && room.settings.mode !== 'minigame' && room.settings.minigames,
    level: kind === 'quiz' ? room.settings.level : null,
  };
}

/** 목록에 올리는 방 — 공방 칸이 있는 방(스위치를 켜고 만든 방) · 같은 자리 · 그 종류 · 차단당한 방은 뺀다 */
function roomsFor(site: Site, kind: RoomKind, accountId: string | null): Room[] {
  const out: Room[] = [];
  for (const r of allRooms()) {
    if (r.maxPlayers === undefined) continue;
    if (r.site !== site) continue;
    if (roomKindOf(r.settings.mode) !== kind) continue;
    if (accountId && r.bannedAccountIds.has(accountId)) continue;
    out.push(r);
  }
  return out;
}

export function buildList(site: Site, kind: RoomKind, accountId: string | null): { rooms: RoomListItem[]; more: boolean; counts: Record<RoomKind, number> } {
  const rooms = roomsFor(site, kind, accountId);
  const created = new Map(rooms.map((r) => [r.code, r.createdAt]));
  const sorted = sortRoomList(rooms.map(listItemOf), (it) => created.get(it.code) ?? 0);
  return { rooms: sorted.slice(0, GONGBANG.LIST_MAX), more: sorted.length > GONGBANG.LIST_MAX, counts: countRooms(site) };
}

/**
 * ★ R117 — 종류별 방 수(목록 탭 "방 14") · 로비 [같이 하기] 의 "열린 방 N"(= 세 종류 합). 공방 칸이 있는 방 · 같은 자리만.
 *   차단당한 방도 센다(묶음 방송이라 사람마다 다르게 세지 않는다 — 드물다).
 */
export function countRooms(site: Site): Record<RoomKind, number> {
  const out: Record<RoomKind, number> = { quiz: 0, draw: 0, liar: 0 };
  for (const r of allRooms()) {
    if (r.maxPlayers === undefined || r.site !== site) continue;
    out[roomKindOf(r.settings.mode)] += 1;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 목록 구독 · 1초 방송
// ─────────────────────────────────────────────────────────────────────────────

const dirRoom = (site: Site, kind: RoomKind) => `dir:${site}:${kind}`;
/** 묶음마다 지난번에 보낸 글(바뀌었을 때만 보낸다) */
const lastSent = new Map<string, string>();
let timer: NodeJS.Timeout | null = null;

/**
 * 1초마다 — 구독자가 있는 묶음만 다시 만들어 바뀌었으면 보낸다. 차단당한 사람의 목록에서 그 방을 빼는 것은 방송이 아니라
 *   watch 때 한 번 · 입장 때 서버가 다시 막는다(묶음 방송은 사람마다 다르게 만들지 않는다 — 차단은 그 방이 사는 동안뿐이라 드물다).
 */
export function directoryTick(): void {
  const io = ioServer();
  for (const site of ['public', 'friend'] as const) {
    for (const kind of ROOM_KINDS) {
      const name = dirRoom(site, kind);
      const watchers = io.sockets.adapter.rooms.get(name)?.size ?? 0;
      if (watchers === 0) {
        lastSent.delete(name);
        continue;
      }
      const list = buildList(site, kind, null);
      const body = JSON.stringify(list);
      if (lastSent.get(name) === body) continue;
      lastSent.set(name, body);
      io.to(name).emit('directory.list', { kind, ...list });
    }
  }
}

export function startDirectory(): void {
  if (!config.gongbang || timer) return;
  timer = setInterval(() => {
    try {
      directoryTick();
    } catch (err) {
      console.error('[gongbang] 목록 방송 실패:', (err as Error).message);
    }
  }, GONGBANG.LIST_INTERVAL_MS);
  timer.unref?.();
  console.log('[gongbang] 공방 켜짐 — 목록 · 잠금 · 빠른 입장');
}

// ─────────────────────────────────────────────────────────────────────────────
// 소켓 이벤트
// ─────────────────────────────────────────────────────────────────────────────

/** socket/index.ts 가 넘겨준다(순환 import 를 피한다) — 방에 붙이기(성공하면 true) */
export interface GongbangHooks {
  joinRoom: (socket: Socket, roomId: string) => boolean;
}

const OFF = '공방이 아직 열리지 않았어요.';
const siteOfSocket = (s: Socket): Site => (s.data as SocketData).site ?? 'friend';

/** 빠른 입장 — 이 옵션으로 방 만들기 창에 채울 값 */
function createWith(kind: RoomKind, o: QuickJoinOpts): { kind: RoomKind; level: string | null; minigames: boolean | null } {
  return {
    kind,
    level: kind === 'quiz' && o.levels.length === 1 ? o.levels[0]! : null,
    minigames: kind === 'quiz' && o.minigame !== 'any' ? o.minigame === 'with' : null,
  };
}

export function registerGongbangHandlers(socket: Socket, hooks: GongbangHooks): void {
  // ── 목록 구독 { kind } → 바로 한 번 통째로 · 그 뒤 바뀔 때마다(1초 묶음)
  on<{ kind: RoomKind }>(
    socket,
    'directory.watch',
    { parse: (raw) => (isRoomKind(parseObject(raw)?.kind) ? { kind: parseObject(raw)!.kind as RoomKind } : null) },
    ({ socket: s, session, payload }) => {
      if (!config.gongbang) return sendError(s, 'INVALID_STATE', OFF);
      const site = siteOfSocket(s);
      for (const k of ROOM_KINDS) void s.leave(dirRoom(site, k));
      void s.join(dirRoom(site, payload.kind));
      s.emit('directory.list', { kind: payload.kind, ...buildList(site, payload.kind, session.accountId) });
    },
  );

  // ── ★ R117 — 로비 [같이 하기] 의 방 수(구독 없이 한 번) → directory.counts { counts }
  on(socket, 'directory.counts', {}, ({ socket: s }) => {
    if (!config.gongbang) return sendError(s, 'INVALID_STATE', OFF);
    s.emit('directory.counts', { counts: countRooms(siteOfSocket(s)) });
  });

  on(socket, 'directory.unwatch', {}, ({ socket: s }) => {
    const site = siteOfSocket(s);
    for (const k of ROOM_KINDS) void s.leave(dirRoom(site, k));
  });

  // ── 빠른 입장 { kind, opts, code? } — code 가 있으면 "가장 비슷한 방" 창에서 [확인]을 누른 것(그 방으로 · 들어갈 수 없게 됐으면 다시 고른다)
  on<{ kind: RoomKind; opts: QuickJoinOpts; code: string | null }>(
    socket,
    'directory.quickJoin',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj || !isRoomKind(obj.kind)) return null;
        const code = typeof obj.code === 'string' && /^\d{6}$/.test(obj.code) ? obj.code : null;
        return { kind: obj.kind, opts: parseQuickJoinOpts(obj.opts), code };
      },
    },
    ({ socket: s, session, payload }) => {
      if (!config.gongbang) return sendError(s, 'INVALID_STATE', OFF);
      if (getRoomOfAccount(session.accountId)) return sendError(s, 'ALREADY_HAS_ROOM', '다른 방에 참가한 상태입니다.');
      const site = siteOfSocket(s);
      const rooms = roomsFor(site, payload.kind, session.accountId);
      const byCode = new Map(rooms.map((r) => [r.code, r]));
      const items = rooms.map(listItemOf);
      const ranked = rankQuickJoin(items, payload.opts);
      const make = createWith(payload.kind, payload.opts);
      // [확인] — 고른 방이 아직 들어갈 수 있으면 그 방 먼저
      if (payload.code) {
        const i = ranked.findIndex((r) => r.item.code === payload.code);
        if (i > 0) ranked.unshift(...ranked.splice(i, 1));
      }
      const first = ranked[0];
      if (!first) {
        s.emit('directory.quickJoinResult', { status: 'none', kind: payload.kind, createWith: make });
        return;
      }
      // 딱 맞는 방이 없고 아직 묻지 않았다 → 화면이 묻는다
      if (first.mismatch.length > 0 && !payload.code) {
        s.emit('directory.quickJoinResult', { status: 'near', kind: payload.kind, room: first.item, mismatch: first.mismatch satisfies QuickJoinField[], createWith: make });
        return;
      }
      // 들어간다 — 그 사이 꽉 찼으면 다음 후보로 2번까지 더(3-7 ④)
      for (const cand of ranked.slice(0, 3)) {
        const room = byCode.get(cand.item.code);
        if (!room) continue;
        if (hooks.joinRoom(s, room.id)) {
          s.emit('directory.quickJoinResult', { status: 'joined', kind: payload.kind, code: room.code, mismatch: cand.mismatch });
          return;
        }
      }
      s.emit('directory.quickJoinResult', { status: 'none', kind: payload.kind, createWith: make });
    },
  );

  // ── 정원 · 잠금 바꾸기(방장 · 어느 상태에서나 · 24 3-4) { maxPlayers?, password?: '1234' | null }
  onRoom<{ maxPlayers?: number; password?: string | null }>(
    socket,
    'room.updateAccess',
    {
      requireHost: true,
      parse: (raw) => {
        const obj = parseObject(raw);
        if (!obj) return null;
        const out: { maxPlayers?: number; password?: string | null } = {};
        if (obj.maxPlayers !== undefined) {
          if (typeof obj.maxPlayers !== 'number' || !Number.isInteger(obj.maxPlayers)) return null;
          out.maxPlayers = obj.maxPlayers;
        }
        if (obj.password !== undefined) {
          if (obj.password === null || obj.password === '') out.password = null;
          else if (isRoomPassword(obj.password)) out.password = obj.password;
          else return null;
        }
        return out;
      },
    },
    ({ socket: s, room, payload }) => {
      if (!config.gongbang || room.maxPlayers === undefined) return sendError(s, 'INVALID_STATE', OFF);
      const kind = roomKindOf(room.settings.mode);
      if (payload.maxPlayers !== undefined) {
        const n = clampMaxPlayers(kind, payload.maxPlayers);
        if (n === null) {
          const m = `정원은 ${minPlayersOf(kind)}~${GONGBANG.MAX_PLAYERS}명이에요.`;
          return sendError(s, 'BAD_REQUEST', m, m);
        }
        // ★ 지금 인원보다 작게는 거절(사람을 내보내는 일은 강퇴로만) — 끊겨서 자리만 남은 사람도 센다
        if (n < room.players.size) {
          const m = `지금 ${room.players.size}명이에요 — ${room.players.size}명부터 고를 수 있어요.`;
          return sendError(s, 'BAD_REQUEST', m, m);
        }
        room.maxPlayers = n;
      }
      if (payload.password !== undefined) {
        room.password = payload.password;
        room.passwordFails = new Map();
      }
      emitAccess(room);
    },
  );
}

/** 정원 · 잠금이 바뀌면 방 전원에게(비밀번호는 방장 화면만 — 스냅샷과 같은 규칙) */
export function emitAccess(room: Room): void {
  const base = { maxPlayers: room.maxPlayers ?? GONGBANG.MAX_PLAYERS, locked: Boolean(room.password), kind: roomKindOf(room.settings.mode) };
  emitRoom(room, 'room.accessUpdated', base);
  const host = room.players.get(room.hostAccountId);
  if (host?.socketId) ioServer().to(host.socketId).emit('room.accessUpdated', { ...base, password: room.password ?? null });
}

/**
 * 모드 바꾸기(로비 설정의 mode 가 다른 종류로) — 시스템 채팅 한 줄 · 정원이 새 종류의 아래 끝보다 작으면 올린다 ·
 *   인원이 모자라면 미리 알린다(시작이 막힐 뿐 — 지금 LIAR_START_BLOCK · DRAW_START_BLOCK 그대로). 사람 · 링크 · 코드 · 채팅은 그대로.
 */
export function onModeChanged(room: Room, before: RoomKind): void {
  if (!config.gongbang || room.maxPlayers === undefined) return;
  const after = roomKindOf(room.settings.mode);
  if (after === before) return;
  const min = minPlayersOf(after);
  if (room.maxPlayers < min) room.maxPlayers = min;
  const name = after === 'quiz' ? '퀴즈' : after === 'draw' ? '캐치마인드' : '라이어';
  broadcastSystem(room, `${name} 방으로 바뀌었어요.${room.players.size < min ? ` ${min}명부터 시작할 수 있어요.` : ''}`);
  emitAccess(room);
}

/** room.join 이 부른다 — 6자리 코드로 잠긴 방에 들어오는 길인가(긴 id · 이미 그 방 사람은 통과) */
export function needsPassword(room: Room, key: string, alreadyMember: boolean): boolean {
  return config.gongbang && Boolean(room.password) && !alreadyMember && /^\d{6}$/.test(key) && findRoomByCodeOrId(key) === room;
}
