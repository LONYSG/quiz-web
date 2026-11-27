// =============================================================================
// ★★★ R117 (docs/24 3-4 · 8절 "방 안") — 정원 · 잠금 바꾸기(방장 · 어느 상태에서나) — room.updateAccess
//   자리: 모바일 = 참여자 창 아래 · PC = 초대 창 아래(PC 는 참여자 창이 없다 — 양옆 칸이 늘 보인다)
//   ★ 지금 인원보다 작게는 못 줄인다(서버도 거절) · 비밀번호는 방장 화면에만(바뀐 방장에게도 서버가 보낸다)
//   손님에게는 한 줄만(정원 · 잠김).
// =============================================================================

import { useState } from 'react';
import type { Socket } from 'socket.io-client';
import { GONGBANG, minPlayersOf, type RoomKind } from '@quiz/shared';
import { Lock, LockOpen, Minus, Plus } from 'lucide-react';
import Icon from '../Icon.js';

interface Props {
  socket: Socket;
  isHost: boolean;
  kind: RoomKind;
  maxPlayers: number;
  locked: boolean;
  password: string | null;
  playerCount: number;
}

export default function AccessControls({ socket, isHost, kind, maxPlayers, locked, password, playerCount }: Props) {
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const low = Math.max(minPlayersOf(kind), playerCount);
  if (!isHost) {
    return (
      <p className="dim gb-access-line" data-gb-access="guest">
        정원 {maxPlayers}명{locked ? ', 잠긴 방' : ''}
      </p>
    );
  }
  const send = (p: { maxPlayers?: number; password?: string | null }) => socket.emit('room.updateAccess', p);
  const savePin = () => {
    if (!/^\d{4}$/.test(pin)) return;
    send({ password: pin });
    setPinOpen(false);
    setPin('');
  };
  return (
    <div className="gb-access" data-gb-access="host">
      <div className="gb-access-row">
        <span className="set-label">정원</span>
        <div className="stepper" data-gb-access-max>
          <button type="button" className="ghost" aria-label="정원 줄이기" disabled={maxPlayers <= low} onClick={() => send({ maxPlayers: maxPlayers - 1 })}>
            <Icon icon={Minus} />
          </button>
          <b className="mono">{maxPlayers}</b>
          <button type="button" className="ghost" aria-label="정원 늘리기" disabled={maxPlayers >= GONGBANG.MAX_PLAYERS} onClick={() => send({ maxPlayers: maxPlayers + 1 })}>
            <Icon icon={Plus} />
          </button>
        </div>
      </div>
      <div className="gb-access-row">
        <span className="set-label">잠금</span>
        {pinOpen ? (
          <span className="gb-access-pin">
            <input
              className="mono gb-pin-input"
              data-gb-access-pin
              value={pin}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={4}
              placeholder="숫자 4자리"
              aria-label="비밀번호 숫자 4자리"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) savePin();
              }}
            />
            <button type="button" className="preset active" data-gb-access-save disabled={pin.length !== 4} onClick={savePin}>
              잠그기
            </button>
          </span>
        ) : locked ? (
          <span className="gb-access-pin">
            <span className="gb-access-pw mono" data-gb-access-pw>
              <Icon icon={Lock} /> {password ?? '••••'}
            </span>
            <button type="button" className="preset" onClick={() => setPinOpen(true)}>
              바꾸기
            </button>
            <button type="button" className="preset" data-gb-access-unlock onClick={() => send({ password: null })}>
              <Icon icon={LockOpen} /> 풀기
            </button>
          </span>
        ) : (
          <button type="button" className="preset" data-gb-access-lock onClick={() => setPinOpen(true)}>
            <Icon icon={Lock} /> 잠그기
          </button>
        )}
      </div>
    </div>
  );
}
