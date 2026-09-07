// =============================================================================
// 카운트다운 표시 (guide 8절 / Q-11)
//
// ★★ 클라이언트 타이머는 표시 전용이다 (guide 45절).
//   0에 도달해도 어떤 상태 전환도 하지 않는다. 서버의 game.started 를 기다린다.
//   0이 되면 "시작 중…" 만 보여 준다.
//   ★ 이 규칙을 깨면 사람마다 다른 시점에 게임이 시작된 것처럼 보이고,
//     Phase 3의 선착순 판정에서 "내 화면에선 아직 문제였는데" 가 발생한다.
//
// ★ 남은 시간은 서버가 준 절대 시각(endsAt)과 시계 오프셋으로 계산한다 (guide 18·46절).
//   서버가 "5초 남았다" 를 보내지 않는 이유는 두 가지다.
//     · 네트워크 지연만큼 어긋난다
//     · 재접속하면 남은 시간을 복구할 수 없다
//   Phase 0에서 만든 오프셋 측정을 여기서 처음 실제로 쓴다.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

interface Props {
  socket: Socket;
  endsAt: number;
  /** 서버 시각 추정치를 돌려주는 함수 (useServerClock) */
  serverNow: () => number;
  isHost: boolean;
}

export default function Countdown({ socket, endsAt, serverNow, isHost }: Props) {
  const [remainMs, setRemainMs] = useState(() => Math.max(0, endsAt - serverNow()));

  useEffect(() => {
    // 100ms 마다 다시 그린다. 서버 tick 주기와 같아 표시가 어긋나 보이지 않는다.
    const id = setInterval(() => {
      setRemainMs(Math.max(0, endsAt - serverNow()));
    }, 100);
    return () => clearInterval(id);
  }, [endsAt, serverNow]);

  // 0.1초 단위로 올림해 보여 준다. 5.0 → 4.9 → … → 0.1 → "시작 중…"
  const sec = (remainMs / 1000).toFixed(1);

  return (
    <section className="card countdown-card">
      <h2>게임 시작</h2>
      {remainMs > 0 ? (
        <p className="countdown-big mono">{sec}초</p>
      ) : (
        /* ★ 0이 되어도 여기서 상태를 바꾸지 않는다. 서버 이벤트를 기다린다 */
        <p className="countdown-big dim">시작 중…</p>
      )}
      <p className="note">
        카운트다운 중에도 새로 들어올 수 있습니다. 들어온 사람은 그대로 이 게임에 참가합니다.
      </p>
      {isHost && (
        <button type="button" onClick={() => socket.emit('game.cancelCountdown', {})}>
          카운트다운 취소
        </button>
      )}
    </section>
  );
}
