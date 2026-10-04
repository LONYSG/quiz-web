// =============================================================================
// 시스템 채팅 한 줄 (입장·퇴장·내보내기·로비 복귀·★ R034 닉네임 변경)
//
// ★ R034 에서 socket/index.ts 에서 옮겼다. HTTP 라우트(닉네임 변경)도 써야 하기 때문이다.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { emitRoom } from './emit.js';
import { pushChat } from './registry.js';
import { nextSeq } from '../seq.js';
import type { Room } from './types.js';

export function broadcastSystem(room: Room, text: string): void {
  const entry = {
    id: randomUUID(),
    seq: nextSeq(),
    accountId: '',
    nickname: '',
    colorIndex: 0,
    rawNfc: text,
    maskedText: null,
    ts: Date.now(),
    system: true,
  };
  pushChat(room, entry);
  emitRoom(room, 'chat.message', {
    id: entry.id,
    seq: entry.seq,
    accountId: '',
    nickname: '',
    colorIndex: 0,
    text,
    masked: false,
    ts: entry.ts,
    system: true,
  });
}
