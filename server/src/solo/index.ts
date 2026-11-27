// =============================================================================
// ★★★ R118 (docs/24 4절) — 혼자 하기 소켓 이벤트. 스위치 SOLO 가 꺼져 있으면 전부 거절(INVALID_STATE) — 오늘과 같다.
//
//   화면 → 서버: solo.start { items? } · solo.answer { n, text } · solo.away { n } · solo.quit {} · solo.sync {} · ★ R123 solo.item { n, kind } · solo.next { n }
//   서버 → 화면: solo.started { lives, firstAt }(★ R124 카운트다운 끝 · 첫 문제가 나가는 때) · solo.question · solo.result · solo.end · solo.state(다시 붙음) · solo.none(도는 판 없음) ·
//               ★ R123 solo.wrong { n }(틀린 답 즉시) · solo.item { n, kind, text, items } · solo.count { n, countAt, nextAt }(해설 중 Enter)
//   ★ 방에 있는 사람은 솔로를 시작할 수 없고, 솔로 중에는 방에 들어갈 수 없다(방 쪽은 socket/index.ts 가 soloRunning 을 본다).
// =============================================================================

import type { Socket } from 'socket.io';
import { SOLO, isSoloItemKind, soloItemCounts, type SoloItemCounts, type SoloItemKind } from '@quiz/shared';
import { config } from '../config.js';
import { getRoomOfAccount } from '../rooms/registry.js';
import { on, parseObject, sayError, type SocketData } from '../socket/guard.js';
import { attachSolo, soloAnswer, soloAway, soloItem, soloNext, soloQuit, startSolo } from './engine.js';

const OFF = '혼자 하기가 아직 열리지 않았어요.';
const nOf = (obj: Record<string, unknown> | null): number | null => (obj && typeof obj.n === 'number' && Number.isInteger(obj.n) && obj.n > 0 && obj.n < 100_000 ? obj.n : null);

export function registerSoloHandlers(socket: Socket): void {
  // ★ R123 — 시작 전에 고른 아이템(0~3개씩 · 모르는 값은 0)
  on<{ items: SoloItemCounts }>(socket, 'solo.start', { parse: (raw) => ({ items: soloItemCounts(parseObject(raw)?.items) }) }, async ({ socket: s, session, payload }) => {
    // ★★ R124 — 도착 시각 = 카운트다운의 기준(화면은 누른 순간부터 3 · 2 · 1)
    const arrivedAt = Date.now();
    if (!config.solo) return sayError(s, 'INVALID_STATE', OFF);
    if (getRoomOfAccount(session.accountId)) {
      const m = '방에서 나온 뒤 혼자 하기를 할 수 있어요.';
      return sayError(s, 'ALREADY_HAS_ROOM', m);
    }
    const fail = await startSolo(s, session.accountId, (s.data as SocketData).site ?? null, payload.items, arrivedAt);
    // ★ R123 — 사람 말이 제목(오류 코드는 화면에 안 보인다)
    if (fail) sayError(s, fail.code === 'RATE' ? 'RATE_LIMITED' : fail.code === 'NO_QUESTIONS' ? 'NOT_ENOUGH_QUESTIONS' : 'INVALID_STATE', fail.message);
  });

  on<{ n: number; text: string }>(
    socket,
    'solo.answer',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        const n = nOf(obj);
        if (n === null || typeof obj!.text !== 'string' || obj!.text.length > SOLO.ANSWER_MAX_LEN) return null;
        return { n, text: obj!.text };
      },
    },
    ({ session, payload }) => {
      if (!config.solo) return;
      // ★ 도착 시각을 먼저 — 판정은 동기(await 없음)
      soloAnswer(session.accountId, payload.n, payload.text, Date.now());
    },
  );

  on<{ n: number }>(
    socket,
    'solo.away',
    {
      parse: (raw) => {
        const n = nOf(parseObject(raw));
        return n === null ? null : { n };
      },
    },
    ({ session, payload }) => {
      if (!config.solo) return;
      soloAway(session.accountId, payload.n);
    },
  );

  // ★★ R123 — 아이템 쓰기(힌트 · 초성 · 넘기기)
  on<{ n: number; kind: SoloItemKind }>(
    socket,
    'solo.item',
    {
      parse: (raw) => {
        const obj = parseObject(raw);
        const n = nOf(obj);
        return n === null || !isSoloItemKind(obj!.kind) ? null : { n, kind: obj!.kind };
      },
    },
    ({ socket: s, session, payload }) => {
      if (!config.solo) return;
      if (soloItem(session.accountId, payload.n, payload.kind, Date.now()) !== 'ok') s.emit('solo.itemRejected', { n: payload.n, kind: payload.kind });
    },
  );

  // ★★ R123 — 해설 중 Enter(모바일 탭) → 바로 점 카운트
  on<{ n: number }>(
    socket,
    'solo.next',
    {
      parse: (raw) => {
        const n = nOf(parseObject(raw));
        return n === null ? null : { n };
      },
    },
    ({ session, payload }) => {
      if (!config.solo) return;
      soloNext(session.accountId, payload.n);
    },
  );

  on<Record<string, never>>(socket, 'solo.quit', { parse: () => ({}) }, ({ socket: s, session }) => {
    if (!config.solo) return sayError(s, 'INVALID_STATE', OFF);
    if (!soloQuit(session.accountId)) s.emit('solo.none', {});
  });

  on<Record<string, never>>(socket, 'solo.sync', { parse: () => ({}) }, ({ socket: s, session }) => {
    if (!config.solo) return sayError(s, 'INVALID_STATE', OFF);
    if (!attachSolo(s, session.accountId)) s.emit('solo.none', {});
  });
}
