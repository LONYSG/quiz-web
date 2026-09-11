// =============================================================================
// 일시정지 화면 (Phase 5 / R015)
//
// ★★★ D-030 교훈 — 화면에 아무 표시가 없으면 "멈췄다" 와 "고장났다" 가 구분되지 않는다.
//   ★ R014 의 근사 구현(D-061)이 정확히 그 상태였다. 타이머만 멈추고 화면은 그대로였다.
//   ★★ 그래서 이 화면은 네 가지를 반드시 보여준다 —
//     (1) 왜 멈췄는가  (2) 몇 명이 돌아왔는가  (3) 멈춘 남은 시간
//     (4) ★ 언제까지 안 돌아오면 방이 사라지는가
//
// ★★ 재개는 **방장만** 할 수 있다 (Q-30 확정).
//   ★ 비방장에게는 버튼을 보여주지 않고 "방장이 재개하기를 기다리는 중" 을 띄운다.
//   ★ canResume 은 서버가 계산해 보낸다. 클라이언트가 유추하지 않는다.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { PausedView } from './useRoom.js';

interface Props {
  socket: Socket;
  paused: PausedView;
  /** 서버 시각 추정치 */
  serverNow: () => number;
}

/** 멈춘 상태가 어디였는지 사람 말로 */
function fromText(from: string): string {
  switch (from) {
    case 'COUNTDOWN':
      return '게임 시작 카운트다운 중';
    case 'QUESTION_ACTIVE':
      return '문제를 푸는 중';
    case 'QUESTION_RESOLVED':
      return '정답 공개 중';
    default:
      return '게임 중';
  }
}

export default function Paused({ socket, paused, serverNow }: Props) {
  /** ★ 방이 사라지기까지 남은 시간. 이것만 흐른다 */
  const [abandonInMs, setAbandonInMs] = useState(() =>
    Math.max(0, paused.abandonAt - serverNow()),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setAbandonInMs(Math.max(0, paused.abandonAt - serverNow()));
    }, 500);
    return () => clearInterval(id);
  }, [paused.abandonAt, serverNow]);

  // ★ Q-83 — 정수 초로 표시한다. 소수점은 눈만 아프다
  const abandonSec = Math.ceil(abandonInMs / 1000);
  const abandonMin = Math.floor(abandonSec / 60);
  const abandonRest = abandonSec % 60;
  /** ★ 멈춘 시점의 남은 시간. **고정값이다.** 흐르지 않는다 */
  const frozenSec = Math.ceil(paused.remainingMs / 1000);

  return (
    <section className="card paused-card">
      <h2>일시정지</h2>
      <p className="big">
        참가자 복귀를 기다리는 중 —{' '}
        <span className="mono">
          {paused.returned} / {paused.total}
        </span>{' '}
        복귀
      </p>
      <p className="note">
        {fromText(paused.pausedFrom)}에 모두 접속이 끊겨 게임이 멈췄습니다.
        <br />
        {/* ★★ 멈춘 남은 시간을 보여준다. 재개하면 이 시간부터 이어진다 */}
        멈춘 시점의 남은 시간 <span className="mono">{frozenSec}초</span> — 재개하면 여기서
        이어집니다.
      </p>

      {/* ★ 방이 사라지기까지 남은 시간 (Q-82).
          ★ 판단: **표시한다.** 근거 — 이것을 숨기면 "언제 돌아와야 하는지" 를 알 수 없고,
            방이 사라진 뒤에야 알게 된다. ★ 돌아올 사람에게 가장 필요한 정보다. */}
      <p className={abandonSec <= 60 ? 'warn' : 'note'}>
        {abandonSec > 0 ? (
          <>
            ★ <span className="mono">{abandonMin > 0 ? `${abandonMin}분 ` : ''}{abandonRest}초</span>{' '}
            안에 아무도 돌아오지 않으면 방이 사라집니다.
          </>
        ) : (
          <>곧 방이 사라집니다…</>
        )}
      </p>

      {paused.canResume ? (
        <>
          <button type="button" onClick={() => socket.emit('game.resume', {})}>
            재개
          </button>
          <p className="note dim">
            ★ 단축키 <span className="mono">Alt+R</span> 또는 <span className="mono">F8</span>
            <br />
            ★★ <strong>자동으로 재개되지 않습니다.</strong> 다른 참가자들이 새 주소로 다시
            들어올 시간을 주기 위한 것입니다. 먼저 들어온 한 명 때문에 게임이 돌아가면 나머지가
            접속하는 동안 문제가 소모됩니다.
          </p>
        </>
      ) : (
        <p className="note">방장이 재개하기를 기다리는 중입니다.</p>
      )}
    </section>
  );
}
